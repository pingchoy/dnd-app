/**
 * DM Agent — Claude Haiku
 *
 * Generates the main Dungeon Master narrative response for exploration,
 * roleplay, and story progression. Combat is handled by combatAgent.ts.
 *
 * Uses tool_use to update game state in the same API call:
 *   - update_game_state : player HP, inventory, conditions, location, story events,
 *                         and npcs_to_create (handled by a separate NPC agent post-call)
 *   - update_npc        : damages, conditions, or removes an NPC from the scene
 *   - query_srd         : looks up D&D 5e SRD reference data
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  anthropic,
  MAX_TOKENS,
  MODELS,
} from "../lib/anthropic";
import {
  GameState,
  StateChanges,
  UpdateNPCInput,
  serializePlayerState,
  serializeStoryState,
  updateNPC,
} from "../lib/gameState";
import { querySRD } from "../lib/characterStore";
import { RulesOutcome } from "./rulesAgent";
import {
  UPDATE_GAME_STATE_TOOL,
  UPDATE_NPC_TOOL,
  QUERY_SRD_TOOL,
} from "./tools";

// ─── System prompt ────────────────────────────────────────────────────────────

/**
 * Static DM instructions — exploration, roleplay, and story progression.
 * Combat-specific rules (damage routing, pre-rolled dice, death at 0 HP)
 * are handled by the combat agent instead.
 */
const STATIC_DM_INSTRUCTIONS = `You are an experienced, immersive Dungeon Master running a D&D 5e campaign.

YOUR ROLE:
- Narrate in second person ("You see…", "You hear…"), present tense, vivid and atmospheric.
- Strictly enforce D&D 5e rules. Use provided dice roll outcomes — do not invent your own.
- Call update_game_state whenever the player's HP, inventory, conditions, location, or story state changes. When adding a weapon via items_gained, always include weapon_damage with the item name as the key and { dice, stat, bonus } as the value — e.g. a Longsword +1 is { dice: "1d8", stat: "str", bonus: 1 }. The modifier is computed automatically from the player's current stats.
- Use feature_choice_updates in update_game_state when the player changes or gains a class feature choice (e.g. learning new cantrips, gaining an additional Favored Enemy, changing a Fighting Style). The key must match an existing feature name from the player's features list exactly. The value should be ONLY the chosen option(s), not labels — e.g. { "Spellcasting": "Guidance, Sacred Flame, Thaumaturgy" }.
- When the player asks about their class features or wants to change feature choices, use query_srd with type "class_level" to look up the full feature descriptions first. This tells you exactly what the feature allows (e.g. number of cantrips known, valid options).
- Use query_srd whenever you need accurate rules text you are not fully confident about — monster stats, spell descriptions, class features, conditions, etc. It is better to look it up than to guess incorrectly.
- When introducing ANY new creature, include it in update_game_state's npcs_to_create array with the creature name, SRD slug (kebab-case, e.g. "guard", "bandit", "giant-rat", "goblin", "skeleton", "wolf"), and disposition. Stats are looked up automatically from the SRD — do NOT guess stats. Use an empty string for the slug if the creature is custom/homebrew. Just provide the slug and narrate the creature's entrance.
- Call update_npc after a creature takes damage, gains a condition, or is defeated. Monster kill XP is awarded automatically — do NOT add it to xp_gained.
- NEVER mention your tools, functions, or stat blocks to the player. Never say "let me create" or "I'll generate" — just narrate the story and call tools silently in the background.
- Use update_game_state xp_gained when the player completes a quest, achieves a meaningful milestone, or demonstrates exceptional roleplay. Typical quest XP: minor 50–150, moderate 200–500, major 500–1000+.
- SPELLCASTING: The player's known spells, cantrips, and remaining spell slots are in their character state.
  When a leveled spell is cast, call update_game_state with spell_slots_used to set the new used count for that level.
  On long rest, reset all spell_slots_used values to 0. The player can only cast spells they know.
  Cantrips cost no slots. To swap spells on long rest, use spells_removed + spells_learned together.
  Spell save DC and spell attack are pre-computed in the character state — use those values.
  Use query_srd("spell", slug) for spell details (slug = lowercase hyphenated name, e.g. "cure-wounds").
- Do not allow impossible actions or meta-gaming.
- Keep responses to 2–4 paragraphs. Do not end with a question; offer information and let the player decide.

FORMATTING:
- Use **bold** for key names, places, and dramatic moments.
- Use *italics* for atmosphere, whispers, or inner sensations.
- Use --- to separate distinct scene beats when appropriate.
- Do not use headers (#) or bullet lists in narrative prose.

TONE: Dark fantasy. Evershade is a city of secrets, shadow, and danger. Rewards careful play.`;

/** Static-only system prompt — cached across requests. */
const SYSTEM_PROMPT: Anthropic.Messages.TextBlockParam[] = [
  {
    type: "text",
    text: STATIC_DM_INSTRUCTIONS,
    cache_control: { type: "ephemeral" },
  },
];

// ─── Main agent function ──────────────────────────────────────────────────────

export interface DMResponse {
  narrative: string;
  stateChanges: StateChanges | null;
  /** Total pre-rolled NPC damage dealt to the player this turn. */
  npcDamagePreRolled: number;
  inputTokens: number;
  outputTokens: number;
}

/** Maximum query_srd calls allowed per DM response to limit Firestore reads. */
const MAX_SRD_QUERIES = 3;
/** Maximum total loop iterations (guards against unexpected infinite loops). */
const MAX_ITERATIONS = 8;
/** Number of conversation history entries to include (5 turns = 10 entries). */
const DM_HISTORY_ENTRIES = 10;

export async function getDMResponse(
  playerInput: string,
  gameState: GameState,
  rulesOutcome: RulesOutcome | null,
): Promise<DMResponse> {
  // Prepend dynamic game state so the static system prompt + tools stay fully cacheable
  let userContent = `CAMPAIGN STATE:\n${serializeStoryState(gameState.story)}\n\nPLAYER CHARACTER:\n${serializePlayerState(gameState.player)}\n\n---\n\n${playerInput}`;

  // Append player rules check result
  if (rulesOutcome) {
    userContent += `\n\n[Player roll result — d20 was ${rulesOutcome.roll}]\n${rulesOutcome.raw}`;
  }

  const historyMessages: Anthropic.MessageParam[] =
    gameState.conversationHistory
      .slice(-DM_HISTORY_ENTRIES)
      .map((turn) => ({ role: turn.role, content: turn.content }));

  const messages: Anthropic.MessageParam[] = [
    ...historyMessages,
    { role: "user", content: userContent },
  ];

  const tools: Anthropic.Messages.Tool[] = [
    UPDATE_GAME_STATE_TOOL,
    UPDATE_NPC_TOOL,
    { ...QUERY_SRD_TOOL, cache_control: { type: "ephemeral" } },
  ];

  let narrative = "";
  let stateChanges: StateChanges | null = null;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let srdQueryCount = 0;

  // Tool-use loop: the DM may call tools (update_game_state, update_npc, query_srd)
  // and we continue the conversation so it can incorporate tool results into its
  // narrative. Exits when: (a) the model emits end_turn, (b) only state-mutation
  // tools were called (no further context needed), or (c) MAX_ITERATIONS is hit.
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    console.log(`[DM Agent] Loop iteration ${iter + 1}/${MAX_ITERATIONS} — calling ${MODELS.NARRATIVE}...`);
    const response = await anthropic.messages.create({
      model: MODELS.NARRATIVE,
      max_tokens: MAX_TOKENS.NARRATIVE,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;
    console.log(`[DM Agent] Response: stop_reason=${response.stop_reason}, tokens={ in: ${response.usage.input_tokens}, out: ${response.usage.output_tokens} }`);

    // Collect narrative text from this turn
    for (const block of response.content) {
      if (block.type === "text") narrative += block.text;
    }

    // Done — no more tool calls needed
    if (response.stop_reason === "end_turn") {
      console.log("[DM Agent] end_turn — narrative complete");
      break;
    }

    // Build tool results for every tool_use block in this response
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    let hasQuerySRD = false;

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      if (block.name === "update_game_state") {
        console.log("[DM Agent] Tool call: update_game_state", JSON.stringify(block.input, null, 2));
        stateChanges = block.input as StateChanges;
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: '{"ok":true}',
        });
      } else if (block.name === "update_npc") {
        console.log("[DM Agent] Tool call: update_npc", JSON.stringify(block.input));
        const result = updateNPC(block.input as UpdateNPCInput);
        const resultPayload: Record<string, unknown> = { ok: true, newHp: result.newHp };
        if (result.died) {
          resultPayload.died = true;
          resultPayload.name = result.name;
          resultPayload.xp_awarded = result.xpAwarded;
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(resultPayload),
        });
      } else if (block.name === "query_srd") {
        hasQuerySRD = true;
        const input = block.input as {
          type: string;
          slug?: string;
          class_slug?: string;
          level?: number;
        };
        console.log(`[DM Agent] Tool call: query_srd (${srdQueryCount + 1}/${MAX_SRD_QUERIES})`, JSON.stringify(input));

        let resultContent: string;
        if (srdQueryCount >= MAX_SRD_QUERIES) {
          console.log("[DM Agent] SRD query limit reached — returning error to model");
          resultContent =
            '{"error":"SRD query limit reached for this turn. Use your existing knowledge."}';
        } else {
          srdQueryCount++;
          const docSlug =
            input.type === "class_level"
              ? `${input.class_slug}_${input.level}`
              : (input.slug ?? "");
          const data = await querySRD(input.type, docSlug);
          console.log(`[DM Agent] SRD result for "${docSlug}":`, data ? "found" : "not found");
          resultContent = data
            ? JSON.stringify(data)
            : `{"error":"No ${input.type} found for '${docSlug}'"}`;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: resultContent,
        });
      }
    }

    if (toolResults.length === 0) break; // no tool_use blocks — shouldn't happen, but guard

    // Append assistant turn + tool results so the model can continue
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    // If this iteration had no SRD queries, only state-mutation tools were called.
    // The model is done after receiving their acknowledgements.
    if (!hasQuerySRD) {
      console.log("[DM Agent] No SRD queries this iteration — breaking loop");
      break;
    }
  }

  return {
    narrative: narrative.trim(),
    stateChanges,
    npcDamagePreRolled: 0,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };
}
