/**
 * Combat Agent — Claude Haiku
 *
 * Handles all combat turns when hostile NPCs are active. Uses a focused
 * prompt with strict damage routing rules and minimal context (combat
 * stats only, last 2 conversation entries) for fast, accurate combat.
 *
 * KEY DESIGN: Both the player's attack roll AND NPC attack dice are
 * pre-rolled server-side BEFORE calling the agent. The agent receives all
 * roll results upfront and resolves the entire turn in a single API call:
 *   - Calls update_npc for the player's damage to NPCs
 *   - Calls update_game_state for surviving NPC damage to the player
 *   - Writes the full combat narrative
 *
 * If the player's attack would kill an NPC (damage >= NPC's current HP),
 * the agent ignores that NPC's pre-rolled attack — dead NPCs don't act.
 * The server-side safety net also tracks which NPCs died and subtracts
 * their pre-rolled damage from the total.
 *
 * Typical turn: 1 API call.
 *
 * Returns the same DMResponse type as the DM agent, so the chat route
 * can use either interchangeably.
 */

import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MAX_TOKENS, MODELS } from "../lib/anthropic";
import type { PlayerState, NPC, ConversationTurn, StoredEncounter } from "../lib/gameTypes";
import {
  StateChanges,
  UpdateNPCInput,
  serializeCombatPlayerState,
  serializeActiveNPCs,
  updateNPC,
} from "../lib/gameState";
import { RulesOutcome } from "./rulesAgent";
import { handleSRDQuery } from "./agentUtils";
import type { DMResponse } from "./dmAgent";
import {
  COMBAT_UPDATE_GAME_STATE_TOOL,
  UPDATE_NPC_TOOL,
  QUERY_SRD_TOOL,
  buildNPCRollContext,
  NPCPreRollResult,
} from "./tools";

/**
 * Minimal context the combat agent needs — no full GameState/session data.
 * Player data comes from characters/{id}, everything else from the encounter.
 */
export interface CombatContext {
  player: PlayerState;
  encounter: StoredEncounter;
  conversationHistory: ConversationTurn[];
}

// ─── Combat system prompt ─────────────────────────────────────────────────────

const STATIC_COMBAT_INSTRUCTIONS = `You are a D&D 5e combat narrator. Resolve combat turns mechanically and narrate the results.

SINGLE-RESPONSE COMBAT (STRICT — resolve everything in ONE response):
You receive ALL dice rolls upfront — both the player's attack roll and pre-rolled NPC attacks. Resolve the ENTIRE turn in a single response by calling update_npc AND update_game_state together with your narrative.

TURN ORDER:
1. PLAYER'S TURN: Resolve the player's declared action.
   - If the player attacks an NPC, call update_npc with the target's id (shown as [id=...] in the combatant list) and negative hp_delta.
   - DEATH CHECK: Compare the damage you deal to the NPC's CURRENT HP (shown in combat stats). If damage >= current HP, that NPC DIES. Narrate the killing blow dramatically.
2. NPC TURNS: NPC attack rolls are PRE-ROLLED and included in the message (each labeled with [id=...]).
   - If the player KILLED an NPC this turn (your damage >= their current HP), that NPC is DEAD — IGNORE their pre-rolled attack entirely.
   - For each SURVIVING hostile NPC: use their exact pre-rolled result. If it HIT, include their damage in update_game_state's hp_delta (as a negative sum of all hits). If it MISSED, narrate the miss.
3. Call BOTH tools in this response: update_npc with the NPC's id (player's damage to NPCs) and update_game_state (total NPC damage to player + any loot/conditions).

RULES:
- ONE ATTACK PER NPC PER TURN. Do NOT narrate additional attacks beyond what was rolled. Do NOT invent rolls.
- DAMAGE ROUTING — use the correct tool for the correct target:
  - PLAYER takes damage → update_game_state with negative hp_delta
  - NPC/monster takes damage → update_npc with the NPC's id and negative hp_delta
  NEVER confuse these. NEVER use update_game_state for NPC damage. NEVER use update_npc for player damage.
- Use the NPC attack rolls exactly as provided. Do not re-roll or invent attack numbers.
- When NPC attacks HIT the player: state the damage in narrative (e.g. "dealing **8 damage**").
- NEVER ASK THE PLAYER ANYTHING. Never ask for dice rolls, HP confirmation, clarification, or any other input. You have ALL the information you need. The combat stats shown are authoritative — trust them exactly as given, even if they seem inconsistent with prior narrative. Do NOT question or second-guess HP values.
- DEATH AT 0 HP — CRITICAL:
  - When an NPC's current HP minus your damage is <= 0, the creature is DEAD. NEVER narrate escape, retreat, or fleeing. 0 HP means DEAD, no exceptions.
  - Player at 0 HP: narrate their dramatic fall and end combat immediately. Do NOT ask if the HP is correct.
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
/**
 * Maximum loop iterations. Normally 1 (single-call resolution).
 * Extra iteration only if the agent requests an SRD query before resolving combat.
 */
const MAX_ITERATIONS = 2;
/** Number of conversation history entries to include (1 turn = 2 entries). */
const COMBAT_HISTORY_ENTRIES = 2;

export async function getCombatResponse(
  playerInput: string,
  context: CombatContext,
  rulesOutcome: RulesOutcome | null,
): Promise<DMResponse> {
  const { player, encounter, conversationHistory } = context;

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

  const activeNPCs = encounter.activeNPCs;

  // Pre-roll NPC attacks BEFORE calling the agent so all dice are available upfront
  const npcRolls: NPCPreRollResult = buildNPCRollContext(
    activeNPCs,
    player.armorClass,
  );
  console.log(
    `[Combat Agent] Pre-rolled NPC attacks — total potential damage: ${npcRolls.totalDamage}`,
  );

  // Build user message: combat stats + pre-rolled NPC attacks + player input + player roll
  let userContent = `COMBAT LOCATION: ${encounter.location}\n\n`;
  userContent += `PLAYER COMBAT STATS:\n${serializeCombatPlayerState(player)}\n\n${serializeActiveNPCs(activeNPCs)}`;
  userContent += `\n\n${npcRolls.contextString}`;
  userContent += `\n\n---\n\n${playerInput}`;

  // Append player rules check result (player's attack roll)
  if (rulesOutcome) {
    userContent += `\n\n[Player roll result — d20 was ${rulesOutcome.roll}]\n${rulesOutcome.raw}`;
  }

  // Minimal history: last 2 entries (1 user/assistant pair)
  const historyMessages: Anthropic.MessageParam[] =
    conversationHistory
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
  const deadNPCIds: string[] = [];

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

    // Process all tool calls from this single response
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    let hasSRDOnly = true;

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      if (block.name === "update_game_state") {
        hasSRDOnly = false;
        stateChanges = block.input as StateChanges;
        const parts: string[] = [];
        if (stateChanges.hp_delta)
          parts.push(`hp_delta=${stateChanges.hp_delta}`);
        if (stateChanges.gold_delta)
          parts.push(`gold_delta=${stateChanges.gold_delta}`);
        if (stateChanges.items_gained?.length)
          parts.push(`items=[${stateChanges.items_gained.join(", ")}]`);
        if (stateChanges.conditions_added?.length)
          parts.push(
            `+conditions=[${stateChanges.conditions_added.join(", ")}]`,
          );
        if (stateChanges.conditions_removed?.length)
          parts.push(
            `-conditions=[${stateChanges.conditions_removed.join(", ")}]`,
          );
        if (stateChanges.spell_slots_used)
          parts.push(
            `spell_slots=${JSON.stringify(stateChanges.spell_slots_used)}`,
          );
        if (stateChanges.npcs_to_create?.length)
          parts.push(`npcs_to_create=${stateChanges.npcs_to_create.length}`);
        console.log(
          `[Combat Agent] Tool call: update_game_state — ${parts.join(", ") || "(no changes)"}`,
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: '{"ok":true}',
        });
      } else if (block.name === "update_npc") {
        hasSRDOnly = false;
        const input = block.input as UpdateNPCInput;
        console.log(
          `[Combat Agent] Tool call: update_npc — target="${input.id}", hp_delta=${input.hp_delta ?? 0}, remove=${input.remove_from_scene ?? false}`,
        );
        const result = updateNPC(input);

        if (result.died) {
          deadNPCIds.push(input.id);
          console.log(
            `[Combat Agent] ☠ NPC "${result.name}" (${input.id}) DIED — xpAwarded=${result.xpAwarded}, playerXP=${player.xp}`,
          );
        } else if (result.found) {
          console.log(
            `[Combat Agent] NPC "${result.name}" (${input.id}) HP: ${result.newHp} (delta: ${input.hp_delta ?? 0})`,
          );
        } else {
          console.log(
            `[Combat Agent] ⚠ NPC id="${input.id}" NOT FOUND in encounter activeNPCs`,
          );
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({
            ok: true,
            newHp: result.newHp,
            ...(result.died
              ? { died: true, name: result.name, xp_awarded: result.xpAwarded }
              : {}),
          }),
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

    // If the response contained combat tools (update_npc / update_game_state),
    // we're done — no need for another API call. Only continue if the agent
    // made SRD-only queries and needs the results to resolve combat.
    if (!hasSRDOnly) {
      console.log(
        "[Combat Agent] Combat tools processed — single-call resolution complete",
      );
      break;
    }

    // SRD-only: feed results back and let the agent resolve combat on the next iteration
    console.log(
      "[Combat Agent] SRD query only — continuing for combat resolution",
    );
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  // Compute surviving NPC damage: subtract pre-rolled damage from NPCs the player killed
  let survivingNPCDamage = npcRolls.totalDamage;
  for (const deadId of deadNPCIds) {
    const npcRoll = npcRolls.perNPC.find((r) => r.id === deadId);
    if (npcRoll) {
      survivingNPCDamage -= npcRoll.damage;
      console.log(
        `[Combat Agent] Subtracting ${npcRoll.damage} pre-rolled damage from dead NPC id="${deadId}"`,
      );
    }
  }

  // If surviving NPC damage is lethal, ensure stateChanges reflects it
  if (survivingNPCDamage > 0 && player.currentHP <= survivingNPCDamage) {
    console.log(`[Combat Agent] NPC damage (${survivingNPCDamage}) is lethal — player HP ${player.currentHP} → 0`);
    if (!stateChanges) stateChanges = {};
    if (stateChanges.hp_delta == null) {
      stateChanges.hp_delta = -survivingNPCDamage;
    }
  }

  // Summary log
  const hostileRemaining = encounter.activeNPCs.filter(
    (n) => n.disposition === "hostile" && n.currentHp > 0,
  );
  console.log(`[Combat Agent] ── Turn summary ──`);
  console.log(
    `[Combat Agent]   Player HP: ${player.currentHP}/${player.maxHP}, XP: ${player.xp}`,
  );
  console.log(
    `[Combat Agent]   Hostile NPCs remaining: ${hostileRemaining.length}${hostileRemaining.length > 0 ? ` (${hostileRemaining.map((n) => `${n.name}:${n.currentHp}/${n.maxHp}`).join(", ")})` : ""}`,
  );
  console.log(
    `[Combat Agent]   NPC damage to player (surviving only): ${survivingNPCDamage}`,
  );
  console.log(
    `[Combat Agent]   Dead NPCs this turn: ${deadNPCIds.length > 0 ? deadNPCIds.join(", ") : "none"}`,
  );
  console.log(
    `[Combat Agent]   State changes applied: ${
      stateChanges
        ? Object.keys(stateChanges)
            .filter((k) => (stateChanges as Record<string, unknown>)[k] != null)
            .join(", ")
        : "none"
    }`,
  );
  console.log(
    `[Combat Agent]   Total tokens: ${totalInputTokens + totalOutputTokens} (in: ${totalInputTokens}, out: ${totalOutputTokens})`,
  );

  return {
    narrative: narrative.trim(),
    stateChanges,
    npcDamagePreRolled: survivingNPCDamage,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };
}
