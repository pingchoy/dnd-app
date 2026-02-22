/**
 * lootAgent.ts
 *
 * Generates post-combat loot with a single Haiku call.
 * Input: defeated NPCs, player level/class/inventory.
 * Output: loot items, gold, and a short aftermath narrative.
 *
 * Cost: ~$0.001 per call.
 */

import { anthropic, MODELS, MAX_TOKENS, calculateCost } from "../lib/anthropic";
import type { NPC, PlayerState, VictoryLootItem } from "../lib/gameTypes";

export interface LootResult {
  loot: VictoryLootItem[];
  gold: number;
  narrative: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const LOOT_SYSTEM = `You are a D&D 5e loot generator. Given the defeated enemies and the player's level/class, generate appropriate post-combat rewards.

RULES:
- 0-3 items per encounter, scaled to enemy difficulty and player level
- No legendary items before level 10
- No rare items before level 5
- Gold should match enemy type (beasts drop little, bandits drop moderate, dragons drop lots)
- Include a short 1-2 sentence aftermath narrative describing the scene after combat

Respond with ONLY valid JSON in this exact format:
{"loot":[{"name":"item name","description":"brief description"}],"gold":10,"narrative":"The dust settles..."}

For weapon loot, add a weapon field:
{"name":"Flame Dagger","description":"A dagger wreathed in faint fire","weapon":{"dice":"1d4","stat":"dex","bonus":1,"damageType":"fire"}}

Valid stat values: "str", "dex", "finesse", "none"`;

export async function generateLoot(
  defeatedNPCs: NPC[],
  player: PlayerState,
): Promise<LootResult> {
  const npcSummary = defeatedNPCs
    .map(n => `${n.name} (XP: ${n.xpValue}, HP: ${n.maxHp})`)
    .join(", ");

  const prompt = `Defeated enemies: ${npcSummary}\nPlayer: Level ${player.level} ${player.characterClass}\nCurrent inventory: ${player.inventory.slice(0, 10).join(", ") || "minimal gear"}`;

  try {
    const response = await anthropic.messages.create({
      model: MODELS.UTILITY,
      max_tokens: MAX_TOKENS.NPC_AGENT,
      system: LOOT_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd = calculateCost(MODELS.UTILITY, inputTokens, outputTokens);

    const text = response.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("");

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[Loot Agent] No JSON found in response, returning fallback");
      return fallbackLoot(inputTokens, outputTokens, costUsd);
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      loot?: VictoryLootItem[];
      gold?: number;
      narrative?: string;
    };

    return {
      loot: parsed.loot ?? [],
      gold: Math.max(0, parsed.gold ?? 0),
      narrative: parsed.narrative ?? "The battle is over. You catch your breath and survey the aftermath.",
      inputTokens,
      outputTokens,
      costUsd,
    };
  } catch (err) {
    console.error("[Loot Agent] Error:", err);
    return fallbackLoot(0, 0, 0);
  }
}

function fallbackLoot(inputTokens: number, outputTokens: number, costUsd: number): LootResult {
  return {
    loot: [],
    gold: 0,
    narrative: "The battle is over. You catch your breath and survey the aftermath.",
    inputTokens,
    outputTokens,
    costUsd,
  };
}
