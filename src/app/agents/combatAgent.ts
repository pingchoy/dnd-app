/**
 * Combat Agent — Claude Haiku
 *
 * Handles all combat turns when hostile NPCs are active. Uses a focused
 * prompt with strict damage routing rules and minimal context (combat
 * stats only, last 4 conversation entries) for fast, accurate combat.
 *
 * KEY DESIGN: NPC attack dice are auto-rolled server-side AFTER processing
 * the agent's update_npc calls. The results are injected as a text block
 * alongside the tool results, so the agent sees them in the next iteration
 * without needing an extra tool call. Dead NPCs are already removed by the
 * time we roll, so they never get attack dice.
 *
 * Typical turn: 2 API calls instead of 3.
 *   Iter 1: Agent resolves player attack → calls update_npc
 *           → we process it, auto-roll surviving NPC attacks, inject results
 *   Iter 2: Agent narrates NPC attacks → calls update_game_state (player damage)
 *           → done
 *
 * Returns the same DMResponse type as the DM agent, so the chat route
 * can use either interchangeably.
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
  serializeCombatPlayerState,
  serializeActiveNPCs,
  updateNPC,
} from "../lib/gameState";
import { querySRD } from "../lib/characterStore";
import { RulesOutcome } from "./rulesAgent";
import type { DMResponse } from "./dmAgent";
import {
  COMBAT_UPDATE_GAME_STATE_TOOL,
  UPDATE_NPC_TOOL,
  QUERY_SRD_TOOL,
  buildNPCRollContext,
} from "./tools";

// ─── Combat system prompt ─────────────────────────────────────────────────────

const STATIC_COMBAT_INSTRUCTIONS = `You are a D&D 5e combat narrator. Resolve combat turns mechanically and narrate the results.

TURN ORDER (STRICT — follow this exact sequence every turn):
1. PLAYER'S TURN: Resolve the player's declared action first.
   - If the player attacks an NPC, call update_npc with the target's name and negative hp_delta.
   - If update_npc returns "died":true, the NPC is DEAD. Narrate the killing blow dramatically.
2. NPC TURNS: After you call update_npc, the system will automatically roll attacks for all surviving hostile NPCs and provide the results. Use those exact dice results to narrate each surviving NPC's attack. Apply player damage via update_game_state with negative hp_delta.

RULES:
- DAMAGE ROUTING — use the correct tool for the correct target:
  - PLAYER takes damage → update_game_state with negative hp_delta
  - NPC/monster takes damage → update_npc with the NPC's name and negative hp_delta
  NEVER confuse these. NEVER use update_game_state for NPC damage. NEVER use update_npc for player damage.
- Use the NPC attack rolls exactly as provided. Do not re-roll or invent attack numbers.
- When NPC attacks HIT the player: state the damage in narrative (e.g. "dealing **8 damage**"), then call update_game_state with negative hp_delta.
- DEATH AT 0 HP — CRITICAL:
  - When update_npc returns "died":true, the creature is DEAD. NEVER narrate escape, retreat, or fleeing. 0 HP means DEAD, no exceptions. Describe the killing blow.
  - Player at 0 HP: narrate their dramatic fall, end combat immediately.
  - When all hostile NPCs are dead, describe the end of combat and transition to exploration. Award loot from fallen creatures using items_gained and gold_delta in update_game_state.
- SPELLCASTING: When a leveled spell is cast, call update_game_state with spell_slots_used. Cantrips cost no slots. Use query_srd("spell", slug) if you need spell details.
- When introducing reinforcements, include them in update_game_state's npcs_to_create array.
- Monster kill XP is awarded automatically — do NOT add it to xp_gained.

FORMATTING:
- 2–3 paragraphs of combat prose. Keep it tight and action-focused.
- Use **bold** for actions and damage numbers.
- Use *italics* for sensory details.
- Do not use headers (#) or bullet lists.
- NEVER mention tools, functions, or stat blocks to the player.`;

/** Combat context is minimal: just combat stats + active NPCs. */
function buildCombatSystemPrompt(
  state: GameState,
): Anthropic.Messages.TextBlockParam[] {
  return [
    {
      type: "text",
      text: STATIC_COMBAT_INSTRUCTIONS,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `PLAYER COMBAT STATS:\n${serializeCombatPlayerState(state.player)}\n\n${serializeActiveNPCs(state.story.activeNPCs)}`,
    },
  ];
}

// ─── Main combat function ─────────────────────────────────────────────────────

/** Maximum query_srd calls per combat turn. */
const MAX_SRD_QUERIES = 2;
/** Maximum loop iterations. */
const MAX_ITERATIONS = 6;
/** Number of conversation history entries to include (2 turns = 4 entries). */
const COMBAT_HISTORY_ENTRIES = 4;

export async function getCombatResponse(
  playerInput: string,
  gameState: GameState,
  rulesOutcome: RulesOutcome | null,
): Promise<DMResponse> {
  let userContent = playerInput;

  // Append player rules check result (player's attack roll)
  if (rulesOutcome) {
    userContent += `\n\n[Player roll result — d20 was ${rulesOutcome.roll}]\n${rulesOutcome.raw}`;
  }

  // Minimal history: last 4 entries (2 user/assistant pairs)
  const historyMessages: Anthropic.MessageParam[] =
    gameState.conversationHistory
      .slice(-COMBAT_HISTORY_ENTRIES)
      .map((turn) => ({ role: turn.role, content: turn.content }));

  const messages: Anthropic.MessageParam[] = [
    ...historyMessages,
    { role: "user", content: userContent },
  ];

  const tools: Anthropic.Messages.Tool[] = [
    COMBAT_UPDATE_GAME_STATE_TOOL,
    UPDATE_NPC_TOOL,
    { ...QUERY_SRD_TOOL, cache_control: { type: "ephemeral" } },
  ];

  let narrative = "";
  let stateChanges: StateChanges | null = null;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let srdQueryCount = 0;
  let npcDamageTotal = 0;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    console.log(`[Combat Agent] Loop iteration ${iter + 1}/${MAX_ITERATIONS} — calling ${MODELS.UTILITY}...`);
    const response = await anthropic.messages.create({
      model: MODELS.UTILITY,
      max_tokens: MAX_TOKENS.COMBAT,
      system: buildCombatSystemPrompt(gameState),
      tools,
      messages,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;
    console.log(`[Combat Agent] Response: stop_reason=${response.stop_reason}, tokens={ in: ${response.usage.input_tokens}, out: ${response.usage.output_tokens} }`);

    for (const block of response.content) {
      if (block.type === "text") narrative += block.text;
    }

    if (response.stop_reason === "end_turn") {
      console.log("[Combat Agent] end_turn — narrative complete");
      break;
    }

    // Process tool calls
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    let needsContinuation = false;
    let hadUpdateNPC = false;

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      if (block.name === "update_game_state") {
        stateChanges = block.input as StateChanges;
        const parts: string[] = [];
        if (stateChanges.hp_delta) parts.push(`hp_delta=${stateChanges.hp_delta}`);
        if (stateChanges.gold_delta) parts.push(`gold_delta=${stateChanges.gold_delta}`);
        if (stateChanges.items_gained?.length) parts.push(`items=[${stateChanges.items_gained.join(", ")}]`);
        if (stateChanges.conditions_added?.length) parts.push(`+conditions=[${stateChanges.conditions_added.join(", ")}]`);
        if (stateChanges.conditions_removed?.length) parts.push(`-conditions=[${stateChanges.conditions_removed.join(", ")}]`);
        if (stateChanges.spell_slots_used) parts.push(`spell_slots=${JSON.stringify(stateChanges.spell_slots_used)}`);
        if (stateChanges.npcs_to_create?.length) parts.push(`npcs_to_create=${stateChanges.npcs_to_create.length}`);
        console.log(`[Combat Agent] Tool call: update_game_state — ${parts.join(", ") || "(no changes)"}`);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: '{"ok":true}',
        });
      } else if (block.name === "update_npc") {
        const input = block.input as UpdateNPCInput;
        console.log(`[Combat Agent] Tool call: update_npc — target="${input.name}", hp_delta=${input.hp_delta ?? 0}, remove=${input.remove_from_scene ?? false}`);
        const result = updateNPC(input);
        hadUpdateNPC = true;

        const resultPayload: Record<string, unknown> = { ok: true, newHp: result.newHp };
        if (result.died) {
          resultPayload.died = true;
          resultPayload.name = result.name;
          resultPayload.xp_awarded = result.xpAwarded;
          console.log(`[Combat Agent] ☠ NPC "${result.name}" DIED — xpAwarded=${result.xpAwarded}, playerXP=${gameState.player.xp}`);
        } else if (result.found) {
          console.log(`[Combat Agent] NPC "${result.name}" HP: ${result.newHp} (delta: ${input.hp_delta ?? 0})`);
        } else {
          console.log(`[Combat Agent] ⚠ NPC "${input.name}" NOT FOUND in activeNPCs`);
        }

        // Always continue after update_npc so the agent can narrate + handle NPC turns
        needsContinuation = true;

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(resultPayload),
        });
      } else if (block.name === "query_srd") {
        needsContinuation = true;
        const input = block.input as {
          type: string;
          slug?: string;
          class_slug?: string;
          level?: number;
        };
        console.log(`[Combat Agent] Tool call: query_srd (${srdQueryCount + 1}/${MAX_SRD_QUERIES})`, JSON.stringify(input));

        let resultContent: string;
        if (srdQueryCount >= MAX_SRD_QUERIES) {
          console.log("[Combat Agent] SRD query limit reached");
          resultContent =
            '{"error":"SRD query limit reached for this turn. Use your existing knowledge."}';
        } else {
          srdQueryCount++;
          const docSlug =
            input.type === "class_level"
              ? `${input.class_slug}_${input.level}`
              : (input.slug ?? "");
          const data = await querySRD(input.type, docSlug);
          console.log(`[Combat Agent] SRD result for "${docSlug}":`, data ? "found" : "not found");
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

    if (toolResults.length === 0) break;

    // After processing update_npc calls, auto-roll attacks for surviving
    // hostile NPCs and inject the results alongside the tool results.
    // This eliminates a round-trip — the agent sees the rolls immediately.
    const userResponseContent: (Anthropic.Messages.ToolResultBlockParam | Anthropic.Messages.TextBlockParam)[] = [...toolResults];

    if (hadUpdateNPC) {
      const npcRolls = buildNPCRollContext(
        gameState.story.activeNPCs,
        gameState.player.armorClass,
      );
      npcDamageTotal = npcRolls.totalDamage;
      console.log(`[Combat Agent] Auto-rolled NPC attacks — total damage: ${npcDamageTotal}`);
      userResponseContent.push({
        type: "text",
        text: npcRolls.contextString,
      });
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: userResponseContent });

    if (!needsContinuation) {
      console.log("[Combat Agent] No continuation needed — breaking loop");
      break;
    }
  }

  // Summary log
  const hostileRemaining = gameState.story.activeNPCs.filter(n => n.disposition === "hostile" && n.currentHp > 0);
  console.log(`[Combat Agent] ── Turn summary ──`);
  console.log(`[Combat Agent]   Player HP: ${gameState.player.currentHP}/${gameState.player.maxHP}, XP: ${gameState.player.xp}`);
  console.log(`[Combat Agent]   Hostile NPCs remaining: ${hostileRemaining.length}${hostileRemaining.length > 0 ? ` (${hostileRemaining.map(n => `${n.name}:${n.currentHp}/${n.maxHp}`).join(", ")})` : ""}`);
  console.log(`[Combat Agent]   NPC damage to player (pre-rolled): ${npcDamageTotal}`);
  console.log(`[Combat Agent]   State changes applied: ${stateChanges ? Object.keys(stateChanges).filter(k => (stateChanges as Record<string, unknown>)[k] != null).join(", ") : "none"}`);
  console.log(`[Combat Agent]   Total tokens: ${totalInputTokens + totalOutputTokens} (in: ${totalInputTokens}, out: ${totalOutputTokens})`);

  return {
    narrative: narrative.trim(),
    stateChanges,
    npcDamagePreRolled: npcDamageTotal,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };
}
