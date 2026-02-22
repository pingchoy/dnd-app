/**
 * Combat Agent — Claude Haiku (non-attack actions during combat)
 *
 * Handles typed player messages during combat via /api/chat. All attack
 * actions go through the deterministic path (/api/combat/action →
 * /api/combat/narrate). This agent handles everything else typed during
 * combat: roleplay, dialogue, exploration, non-standard tactics.
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
  serializeCombatPlayerState,
  serializeActiveNPCs,
} from "../lib/gameState";
import { getRecentMessages } from "../lib/messageStore";
import { RulesOutcome } from "./rulesAgent";
import { handleSRDQuery } from "./agentUtils";
import type { DMResponse } from "./dmAgent";
import {
  COMBAT_UPDATE_GAME_STATE_TOOL,
  QUERY_SRD_TOOL,
} from "./tools";

/**
 * Minimal context the combat agent needs — no full GameState/session data.
 * Player data comes from characters/{id}, everything else from the encounter.
 */
export interface CombatContext {
  player: PlayerState;
  encounter: StoredEncounter;
}

// ─── Combat system prompt ─────────────────────────────────────────────────────

const STATIC_COMBAT_INSTRUCTIONS = `You are a D&D 5e combat narrator handling non-attack actions during combat (roleplay, dialogue, exploration, skill checks, non-standard tactics).

Attack damage is resolved by the game engine — do NOT deal or track damage. If the player describes an attack, narrate the attempt but note that attacks must be made through the combat interface.

You may use update_game_state for non-damage changes: conditions, items found, spell slots used, or story progression. Do NOT set hp_delta — the game engine handles all HP changes.

RULES:
- Never ask the player for rolls, HP confirmation, or any input. Combat stats are authoritative.
- The player can only cast spells from their Prepared Spells or Known Spells list (whichever is present in their state). Leveled spells cost spell slots (call update_game_state with spell_slots_used). Cantrips are free.
- Use query_srd if you need spell or rule details.

FORMATTING:
- 2–3 paragraphs of prose. Tight and action-focused.
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

  // Minimal history: last 2 entries (1 user/assistant pair) from messages subcollection
  const recentMessages = await getRecentMessages(sessionId, COMBAT_HISTORY_ENTRIES);
  const historyMessages: Anthropic.MessageParam[] =
    recentMessages.map((m) => ({ role: m.role, content: m.content }));

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
        stateChanges = block.input as StateChanges;
        // Strip hp_delta — damage is handled by the deterministic engine
        if (stateChanges.hp_delta) {
          console.log("[Combat Agent] Stripping hp_delta from state changes — damage is engine-only");
          delete stateChanges.hp_delta;
        }
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
        const { resultContent, newCount } = await handleSRDQuery(input, srdQueryCount, MAX_SRD_QUERIES, "Combat Agent");
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
