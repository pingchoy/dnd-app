/**
 * Combat Agent — Claude Haiku (non-combat actions during combat)
 *
 * Handles typed player messages during combat via /api/chat. All combat
 * actions (attacks, damaging spells, movement, combat abilities) must go
 * through the combat grid interface (/api/combat/action → deterministic
 * resolution → /api/combat/narrate). If a player types a combat action
 * in chat, this agent redirects them to the grid.
 *
 * This agent handles non-combat actions typed during combat: roleplay,
 * dialogue, skill checks (perception, insight, etc.), environmental
 * interaction, and non-standard creative tactics.
 *
 * No damage resolution — uses update_game_state only for non-damage
 * state changes (conditions, items, spell slots, etc.).
 *
 * Typical turn: 1 API call.
 */

import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MAX_TOKENS, MODELS } from "../lib/anthropic";
import type { StoredEncounter } from "../lib/gameTypes";
import type { PlayerState } from "../lib/gameTypes";
import {
  StateChanges,
  mergeStateChanges,
  serializeCombatPlayerState,
  serializeActiveNPCs,
} from "../lib/gameState";
import { getRecentCombatMessages } from "../lib/messageStore";
import { RulesOutcome } from "./rulesAgent";
import { handleSRDQuery } from "./agentUtils";
import type { DMResponse } from "./dmAgent";
import { COMBAT_UPDATE_GAME_STATE_TOOL, QUERY_SRD_TOOL } from "./tools";

/**
 * Minimal context the combat agent needs — no full GameState/session data.
 * Player data comes from characters/{id}, everything else from the encounter.
 */
export interface CombatContext {
  player: PlayerState;
  encounter: StoredEncounter;
}

// ─── Combat system prompt ─────────────────────────────────────────────────────

const STATIC_COMBAT_INSTRUCTIONS = `You are a D&D 5e combat narrator. Your role is to narrate what happens during combat, NOT to facilitate or resolve combat mechanics. All mechanical combat resolution happens through the combat grid interface.

COMBAT ACTIONS BELONG ON THE GRID — NOT IN CHAT:
If the player types a combat-related action in chat — attacking, casting a damage spell, moving to a new position, using a combat ability, shoving, grappling, disengaging, dodging, or any other action that would mechanically affect combat — do NOT resolve it. Instead, briefly acknowledge what they want to do and direct them to use the combat grid. Examples:
- "I attack the goblin" → Remind them to select their attack from the ability bar on the combat grid.
- "I cast fireball" → Remind them to select the spell from the combat grid hotbar to place the AOE.
- "I move behind the pillar" → Remind them to drag their token on the combat grid.
- "I shove the orc off the ledge" → Remind them to use the combat grid for combat actions.
Keep the redirect natural and in-character — a short sentence is enough, not a lecture.

NON-COMBAT ACTIONS DURING COMBAT — YOU HANDLE THESE:
The player may want to do things during combat that are not mechanical combat actions. Handle these normally with narration:
- Talking to an NPC or enemy ("I shout to the bandit to surrender")
- Perception, insight, investigation, or other skill checks ("I look around for an escape route")
- Roleplay and dialogue ("I taunt the dragon")
- Interacting with the environment in non-combat ways ("I read the inscription on the door")
- Non-standard creative tactics that aren't covered by the grid ("I try to intimidate the goblins into fleeing")
For these, narrate the outcome in 1-2 paragraphs. You may use update_game_state for non-damage state changes (conditions, items found, spell slots used, story progression).

COMPANION PERSISTENCE: After combat ends with all hostiles defeated, surviving friendly NPCs may be kept as persistent companions. Use companions_to_add with their SRD slug to persist survivors you think should stay with the party. Friendly NPCs not persisted will depart after the encounter. Use companions_to_remove for any companions that died during combat (HP 0).

HARD RULES:
- Do NOT deal, track, or resolve damage. Do NOT set hp_delta — the game engine handles all HP changes.
- Never ask the player for rolls, HP confirmation, or any input. Combat stats are authoritative.
- The player can only cast spells from their Prepared Spells or Known Spells list (whichever is present in their state). Leveled spells cost spell slots (call update_game_state with spell_slots_used). Cantrips are free.
- Use query_srd if you need spell or rule details.

FORMATTING:
- 1-2 paragraphs of prose. Tight and action-focused.
- **Bold** for actions and key outcomes. *Italics* for sensory details.
- No headers (#) or bullet lists. Never mention tools or stat blocks.`;

/** Static-only system prompt — cached across requests. */
const SYSTEM_PROMPT: Anthropic.Messages.TextBlockParam[] = [
  {
    type: "text",
    text: STATIC_COMBAT_INSTRUCTIONS,
    cache_control: { type: "ephemeral" },
  },
];

// ─── Main combat function ─────────────────────────────────────────────────────

/** Maximum query_srd calls per combat turn. */
const MAX_SRD_QUERIES = 2;
/** Maximum loop iterations (extra only for SRD queries). */
const MAX_ITERATIONS = 2;
/** Number of conversation history entries to include (1 turn = 2 entries). */
const COMBAT_HISTORY_ENTRIES = 2;

export async function getCombatResponse(
  playerInput: string,
  context: CombatContext,
  rulesOutcome: RulesOutcome | null,
  sessionId: string,
): Promise<DMResponse> {
  const { player, encounter } = context;

  // Early exit: player is already at 0 HP — no API call needed
  if (player.currentHP <= 0) {
    console.log("[Combat Agent] Player already at 0 HP — skipping API call");
    return {
      narrative:
        "*Darkness closes in. Your body crumples to the ground, the sounds of battle fading to silence as consciousness slips away...*",
      stateChanges: null,
      npcDamagePreRolled: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  // Build user message: combat scene context + player input
  let userContent = `COMBAT LOCATION: ${encounter.location}\n\n`;
  userContent += `PLAYER COMBAT STATS:\n${serializeCombatPlayerState(player)}\n\n${serializeActiveNPCs(encounter.activeNPCs)}`;
  userContent += `\n\n---\n\n${playerInput}`;

  // Append player rules check result if present
  if (rulesOutcome) {
    userContent += `\n\n[Player roll result — d20 was ${rulesOutcome.roll}]\n${rulesOutcome.raw}`;
  }

  // Minimal history: last 2 entries (1 user/assistant pair) from combat messages subcollection
  const recentMessages = await getRecentCombatMessages(
    sessionId,
    COMBAT_HISTORY_ENTRIES,
  );
  const historyMessages: Anthropic.MessageParam[] = recentMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const messages: Anthropic.MessageParam[] = [
    ...historyMessages,
    { role: "user", content: userContent },
  ];

  const tools: Anthropic.Messages.Tool[] = [
    COMBAT_UPDATE_GAME_STATE_TOOL,
    { ...QUERY_SRD_TOOL, cache_control: { type: "ephemeral" } },
  ];

  let narrative = "";
  let stateChanges: StateChanges | null = null;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let srdQueryCount = 0;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    console.log(
      `[Combat Agent] API call ${iter + 1}/${MAX_ITERATIONS} — calling ${MODELS.UTILITY}...`,
    );
    const response = await anthropic.messages.create({
      model: MODELS.UTILITY,
      max_tokens: MAX_TOKENS.COMBAT,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;
    console.log(
      `[Combat Agent] Response: stop_reason=${response.stop_reason}, tokens={ in: ${response.usage.input_tokens}, out: ${response.usage.output_tokens} }`,
    );

    for (const block of response.content) {
      if (block.type === "text") narrative += block.text;
    }

    if (response.stop_reason === "end_turn") {
      console.log("[Combat Agent] end_turn — narrative complete");
      break;
    }

    // Process tool calls
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    let hasSRDOnly = true;

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      if (block.name === "update_game_state") {
        hasSRDOnly = false;
        const incoming = block.input as StateChanges;
        // Strip hp_delta — damage is handled by the deterministic engine
        if (incoming.hp_delta) {
          console.log(
            "[Combat Agent] Stripping hp_delta from state changes — damage is engine-only",
          );
          delete incoming.hp_delta;
        }
        stateChanges = stateChanges ? mergeStateChanges(stateChanges, incoming) : incoming;
        console.log(
          `[Combat Agent] Tool call: update_game_state — ${JSON.stringify(stateChanges)}`,
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: '{"ok":true}',
        });
      } else if (block.name === "query_srd") {
        const input = block.input as {
          type: string;
          slug?: string;
          class_slug?: string;
          level?: number;
        };
        const { resultContent, newCount } = await handleSRDQuery(
          input,
          srdQueryCount,
          MAX_SRD_QUERIES,
          "Combat Agent",
        );
        srdQueryCount = newCount;

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: resultContent,
        });
      }
    }

    if (toolResults.length === 0) break;

    // State changes processed — done. Only continue for SRD-only queries.
    if (!hasSRDOnly) {
      console.log("[Combat Agent] State changes processed — done");
      break;
    }

    console.log("[Combat Agent] SRD query only — continuing for resolution");
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  console.log(
    `[Combat Agent] Total tokens: ${totalInputTokens + totalOutputTokens} (in: ${totalInputTokens}, out: ${totalOutputTokens})`,
  );

  return {
    narrative: narrative.trim(),
    stateChanges,
    npcDamagePreRolled: 0,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };
}
