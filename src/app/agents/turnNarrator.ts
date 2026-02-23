/**
 * turnNarrator.ts
 *
 * Narrates individual combat turns (player or NPC) with a single Haiku call each.
 * No tool calls, no state changes — pure narrative text output.
 *
 * Player turns: up to 2 paragraphs.
 * NPC turns: ~1 paragraph.
 *
 * These are intentionally lightweight calls (~$0.0005 each) to keep
 * per-turn latency low in the SSE streaming loop.
 */

import { anthropic, MODELS, MAX_TOKENS, calculateCost } from "../lib/anthropic";
import type { PlayerState, NPC, ParsedRollResult } from "../lib/gameTypes";
import type { NPCTurnResult, AOEResult } from "../lib/combatResolver";

export interface TurnNarrationResult {
  narrative: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// ─── Player turn narration ───────────────────────────────────────────────────

const PLAYER_TURN_SYSTEM = `You are a D&D 5e combat narrator. Narrate the player's combat turn in up to 2 paragraphs. Use the exact mechanical results provided — do not invent rolls or damage numbers. Use **bold** for actions and damage. Use *italics* for sensory details. Start directly with the narration, no headers or labels.`;

/**
 * Narrate the player's turn based on their resolved action.
 * Input: player action result, target NPC stats, scene context.
 * Output: narrative text only.
 */
export async function narratePlayerTurn(
  player: PlayerState,
  singleTargetResult: ParsedRollResult,
  targetNPC: NPC | null,
  location: string,
): Promise<TurnNarrationResult> {
  let prompt = `Location: ${location}\nPlayer: ${player.name} (${player.currentHP}/${player.maxHP} HP)\n\n`;

  if (singleTargetResult.noCheck) {
    prompt += `PLAYER ACTION: ${singleTargetResult.checkType} — ${singleTargetResult.notes}`;
  } else if (singleTargetResult.impossible) {
    prompt += `PLAYER ACTION FAILED: ${singleTargetResult.notes}`;
  } else {
    const hitMiss = singleTargetResult.success ? "HIT" : "MISS";
    prompt += `PLAYER TURN: ${singleTargetResult.checkType}, rolled ${singleTargetResult.dieResult}${singleTargetResult.totalModifier}=${singleTargetResult.total} vs AC ${singleTargetResult.dcOrAc} → ${hitMiss}`;
    if (targetNPC) {
      prompt += ` against ${targetNPC.name} (${targetNPC.currentHp}/${targetNPC.maxHp} HP)`;
    }
    if (singleTargetResult.damage) {
      const dmgBreakdown = singleTargetResult.damage.breakdown
        .map(b => `${b.label}: [${b.rolls.join(",")}]${b.flatBonus ? (b.flatBonus > 0 ? `+${b.flatBonus}` : b.flatBonus) : ""}=${b.subtotal} ${b.damageType ?? ""}`)
        .join("; ");
      prompt += `. Damage: ${singleTargetResult.damage.totalDamage} (${dmgBreakdown})`;
      if (singleTargetResult.damage.isCrit) prompt += " CRITICAL HIT!";

      // Check if NPC died
      if (targetNPC && singleTargetResult.damage.totalDamage >= targetNPC.currentHp) {
        prompt += `\n\n${targetNPC.name} is KILLED by this attack! Narrate the killing blow dramatically.`;
      }
    }
  }

  const response = await anthropic.messages.create({
    model: MODELS.UTILITY,
    max_tokens: MAX_TOKENS.COMBAT_TURN,
    system: PLAYER_TURN_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const narrative = response.content
    .filter(b => b.type === "text")
    .map(b => (b as { type: "text"; text: string }).text)
    .join("\n")
    .trim();

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  console.log(`[Turn Narrator] Player turn — ${inputTokens + outputTokens} tokens`);

  return {
    narrative,
    inputTokens,
    outputTokens,
    costUsd: calculateCost(MODELS.UTILITY, inputTokens, outputTokens),
  };
}

// ─── AOE player turn narration ────────────────────────────────────────────────

/**
 * Narrate the player's AOE spell turn based on the resolved AOE result.
 * Builds a prompt with the spell DC, total damage, and per-target save outcomes.
 */
export async function narrateAOETurn(
  player: PlayerState,
  aoeResult: AOEResult,
  location: string,
): Promise<TurnNarrationResult> {
  let prompt = `Location: ${location}\nPlayer: ${player.name} (${player.currentHP}/${player.maxHP} HP)\n\n`;

  prompt += `PLAYER CASTS AOE SPELL: ${aoeResult.checkType}\n`;
  prompt += `Spell Save DC: ${aoeResult.spellDC}\n`;

  const isDamaging = aoeResult.totalRolled > 0;
  if (isDamaging) {
    prompt += `Damage Roll: ${aoeResult.damageRoll} = ${aoeResult.totalRolled} ${aoeResult.damageType} damage\n\n`;
  } else {
    prompt += `This is a condition-only spell (no damage). Narrate the magical effect and which targets are affected.\n\n`;
  }

  if (aoeResult.targets.length === 0) {
    prompt += `No targets were caught in the area of effect.`;
  } else {
    prompt += `TARGETS HIT (${aoeResult.targets.length}):\n`;
    for (const t of aoeResult.targets) {
      const saveStatus = t.saved ? "SAVED" : "FAILED";
      if (isDamaging) {
        prompt += `- ${t.npcName}: save ${t.saveRoll}+${t.saveTotal - t.saveRoll}=${t.saveTotal} vs DC ${aoeResult.spellDC} → ${saveStatus}, takes ${t.damageTaken} ${aoeResult.damageType} damage\n`;
      } else {
        prompt += `- ${t.npcName}: save ${t.saveRoll}+${t.saveTotal - t.saveRoll}=${t.saveTotal} vs DC ${aoeResult.spellDC} → ${saveStatus}${t.saved ? " (resists the effect)" : " (affected by the spell)"}\n`;
      }
    }

    if (isDamaging) {
      const killed = aoeResult.targets.filter(t => t.damageTaken > 0);
      if (killed.length > 0) {
        prompt += `\nNarrate the destruction dramatically — fire, explosions, and chaos!`;
      }
    }
  }

  const response = await anthropic.messages.create({
    model: MODELS.UTILITY,
    max_tokens: MAX_TOKENS.COMBAT_TURN,
    system: PLAYER_TURN_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const narrative = response.content
    .filter(b => b.type === "text")
    .map(b => (b as { type: "text"; text: string }).text)
    .join("\n")
    .trim();

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  console.log(`[Turn Narrator] AOE player turn — ${inputTokens + outputTokens} tokens`);

  return {
    narrative,
    inputTokens,
    outputTokens,
    costUsd: calculateCost(MODELS.UTILITY, inputTokens, outputTokens),
  };
}

// ─── NPC turn narration ─────────────────────────────────────────────────────

const NPC_TURN_SYSTEM = `You are a D&D 5e combat narrator. Narrate this NPC's combat turn in 1 paragraph. Use the exact pre-rolled attack result provided — do not invent rolls or damage numbers. Use **bold** for actions and damage. Use *italics* for sensory details. Start directly with the narration, no headers or labels.`;

/**
 * Narrate a single NPC's turn based on their pre-rolled attack.
 * Input: NPC name + stats, single pre-rolled result, player name + HP.
 * Output: narrative text only.
 */
export async function narrateNPCTurn(
  npc: NPC,
  npcResult: NPCTurnResult,
  playerName: string,
  playerCurrentHP: number,
  playerMaxHP: number,
  location: string,
): Promise<TurnNarrationResult> {
  const hitMiss = npcResult.hit ? "HIT" : "MISS";
  let prompt = `Location: ${location}\n\n`;
  prompt += `NPC: ${npc.name} (${npc.currentHp}/${npc.maxHp} HP, AC ${npc.ac})\n`;
  prompt += `Target: ${playerName} (${playerCurrentHP}/${playerMaxHP} HP)\n\n`;
  prompt += `${npc.name} attacks ${playerName}: rolled ${npcResult.d20}+${npcResult.attackTotal - npcResult.d20}=${npcResult.attackTotal} vs AC → ${hitMiss}`;
  if (npcResult.hit) {
    prompt += `. Deals **${npcResult.damage} damage**.`;
    // Check if player would die
    if (playerCurrentHP - npcResult.damage <= 0) {
      prompt += ` ${playerName} falls to 0 HP! Narrate their dramatic fall.`;
    }
  }

  const response = await anthropic.messages.create({
    model: MODELS.UTILITY,
    max_tokens: MAX_TOKENS.COMBAT_TURN,
    system: NPC_TURN_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const narrative = response.content
    .filter(b => b.type === "text")
    .map(b => (b as { type: "text"; text: string }).text)
    .join("\n")
    .trim();

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  console.log(`[Turn Narrator] NPC turn (${npc.name}) — ${inputTokens + outputTokens} tokens`);

  return {
    narrative,
    inputTokens,
    outputTokens,
    costUsd: calculateCost(MODELS.UTILITY, inputTokens, outputTokens),
  };
}
