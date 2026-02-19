/**
 * Rules Agent — Claude Haiku
 *
 * Validates contested player actions and interprets pre-rolled dice.
 * Prompt is class-agnostic — modifiers are derived from the character
 * stats and proficiency list passed in each call.
 */

import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MAX_TOKENS, MODELS } from "../lib/anthropic";
import { isContestedAction } from "../lib/actionKeywords";
export { isContestedAction };
import {
  NPC,
  PlayerState,
  getProficiencyBonus,
  getModifier,
  serializePlayerState,
  formatWeaponDamage,
} from "../lib/gameState";
import { rollDice } from "../lib/gameTypes";

const SYSTEM_PROMPT: Anthropic.Messages.TextBlockParam = {
  type: "text",
  text: `You are a D&D 5e rules expert assisting a Dungeon Master.

FIRST, determine if the action is even possible for this character. An action is IMPOSSIBLE if:
- The character tries to cast a spell they don't know or of a level they can't cast
- The character tries to use a class feature they don't have
- The character tries to use an item they don't possess
- The action flatly violates D&D 5e rules (e.g. a non-spellcaster casting spells)
If the action is impossible, respond with ONLY:
CHECK: IMPOSSIBLE
NOTES: [one-line reason why the action cannot be attempted]

If the action is PURELY NARRATIVE, conversational, or does not require a mechanical
check (e.g. "I'm searching for my long lost brother", "I walk toward the fire",
"I lie down to rest", "I throw a party"), respond with ONLY:
CHECK: NONE
NOTES: [brief reason no check is needed]

Otherwise, given the player action, a pre-rolled d20, and the character's full stat block, determine:
1. What type of check is required (attack roll, skill check, saving throw, or NONE)
2. The relevant modifier broken down by component (stat mod + proficiency + any bonus)
3. Whether the action succeeds against the given DC or target AC

PROFICIENCY BONUS BY LEVEL: 1-4→+2 | 5-8→+3 | 9-12→+4 | 13-16→+5 | 17-20→+6

CLASS FEATURES — apply automatically based on the character's class:
- Rogue: Expertise (double proficiency) for skills listed as proficient if the character has it; Sneak Attack when attacking with advantage or an ally adjacent to the target
- Fighter: Extra Attack at level 5+; Action Surge; Fighting Style bonuses
- Wizard/Sorcerer: Spell attack uses INT/CHA; concentration checks are CON saves
- Cleric/Druid: Spell attack uses WIS; divine domain features
- Barbarian: Rage gives advantage on STR checks/saves; Reckless Attack
- Paladin: Divine Smite on hits; aura bonuses at level 6+
- Ranger: Favoured Enemy bonuses; spells use WIS
- Bard: Jack of All Trades (+half proficiency to unproficient checks)
- Monk: Unarmored Defense; ki abilities use WIS
(Use your D&D 5e knowledge for any class not listed)

If a target NPC is provided, use their AC for attack rolls.

Respond in EXACTLY this format — no extra lines:
CHECK: [check type, e.g. "Stealth Check" or "Shortsword Attack" or "NONE"]
COMPONENTS: [breakdown, e.g. "DEX +3, Proficiency +3, Expertise +3 = +9"]
ROLL: [die result] + [total modifier] = [total]
DC/AC: [number or N/A]
RESULT: [SUCCESS or FAILURE]
DAMAGE: [on hit only — each source semicolon-separated: "Shortsword: 1d6+3 piercing; Sneak Attack: 3d6 piercing" | on miss or non-attack: "N/A"]
NOTES: [one line — key rule or effect that applies]

DAMAGE rules:
- Use the weapon stats from the character state (dice, stat modifier, bonus).
- List each damage source separated by semicolons: "WeaponName: NdS+bonus type; FeatureName: NdS type".
- On a natural 20, double the number of dice (not the flat bonus): e.g. 1d6+3 becomes 2d6+3.
- Include extra damage from class features (Sneak Attack, Divine Smite, etc.) when applicable.
- The flat bonus is the ability modifier + any magic weapon bonus. Do NOT include proficiency in damage.`,
  cache_control: { type: "ephemeral" },
};

export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

export interface RulesOutcome {
  raw: string;
  roll: number;
  inputTokens: number;
  outputTokens: number;
}

export interface DamageBreakdown {
  label: string; // "Shortsword", "Sneak Attack"
  dice: string; // "1d6", "3d6"
  rolls: number[]; // individual die results
  flatBonus: number; // stat mod + magic bonus
  subtotal: number; // rolls total + flatBonus
  damageType?: string; // "piercing"
}

export interface ParsedRollResult {
  checkType: string;
  components: string; // e.g. "DEX +3, Proficiency +3, Expertise +3 = +9"
  dieResult: number;
  totalModifier: string; // e.g. "+9"
  total: number;
  dcOrAc: string;
  success: boolean;
  notes: string;
  /** True when the action is impossible for this character (e.g. spell too high level). */
  impossible?: boolean;
  /** True when the action is purely narrative and no mechanical check is needed. */
  noCheck?: boolean;
  damage?: {
    breakdown: DamageBreakdown[];
    totalDamage: number;
    isCrit: boolean;
  };
}

export function parseRulesOutcome(raw: string, roll: number): ParsedRollResult {
  const get = (prefix: string) => {
    const line = raw.split("\n").find((l) => l.startsWith(prefix));
    return line ? line.slice(prefix.length).trim() : "";
  };

  const checkType = get("CHECK: ") || "Check";

  // Action ruled impossible — no roll needed
  if (checkType.toUpperCase() === "IMPOSSIBLE") {
    return {
      checkType: "IMPOSSIBLE",
      components: "",
      dieResult: 0,
      totalModifier: "+0",
      total: 0,
      dcOrAc: "N/A",
      success: false,
      notes: get("NOTES: "),
      impossible: true,
    };
  }

  // Purely narrative action — no mechanical check needed
  if (checkType.toUpperCase() === "NONE") {
    return {
      checkType: "NONE",
      components: "",
      dieResult: 0,
      totalModifier: "+0",
      total: 0,
      dcOrAc: "N/A",
      success: false,
      notes: get("NOTES: "),
      noCheck: true,
    };
  }

  const rollLine = get("ROLL: ");
  // Parse: "14 + +9 = 23" or "14 + 9 = 23"
  const rollMatch = rollLine.match(/(\d+)\s*\+\s*([+-]?\d+)\s*=\s*(-?\d+)/);
  const total = rollMatch ? parseInt(rollMatch[3]) : roll;
  const totalMod = rollMatch ? rollMatch[2] : "+0";

  const success = get("RESULT: ").toUpperCase().includes("SUCCESS");
  const isCrit = roll === 20;

  // Parse DAMAGE line — server rolls for fairness
  const damageLine = get("DAMAGE: ");
  let damage: ParsedRollResult["damage"] = undefined;

  if (success && damageLine && damageLine.toUpperCase() !== "N/A") {
    const breakdown: DamageBreakdown[] = [];
    // Each source is separated by semicolons: "Shortsword: 1d6+3 piercing; Sneak Attack: 3d6 piercing"
    const sources = damageLine
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const source of sources) {
      const colonIdx = source.indexOf(":");
      if (colonIdx === -1) continue;
      const label = source.slice(0, colonIdx).trim();
      const rest = source.slice(colonIdx + 1).trim();
      // Parse: "1d6+3 piercing" or "3d6 piercing" or "2d6"
      const diceMatch = rest.match(/^(\d+d\d+)([+-]\d+)?\s*(.*)?$/i);
      if (!diceMatch) continue;
      let diceExpr = diceMatch[1];
      const flatBonus = diceMatch[2] ? parseInt(diceMatch[2]) : 0;
      const damageType = diceMatch[3]?.trim() || undefined;

      // On crit, double the dice count (not the flat bonus)
      if (isCrit) {
        const dm = diceExpr.match(/^(\d+)(d\d+)$/i);
        if (dm) diceExpr = `${parseInt(dm[1]) * 2}${dm[2]}`;
      }

      const rolled = rollDice(diceExpr);
      breakdown.push({
        label,
        dice: diceExpr,
        rolls: rolled.rolls,
        flatBonus,
        subtotal: rolled.total + flatBonus,
        damageType,
      });
    }

    if (breakdown.length > 0) {
      damage = {
        breakdown,
        totalDamage: breakdown.reduce((sum, b) => sum + b.subtotal, 0),
        isCrit,
      };
    }
  }

  return {
    checkType,
    components: get("COMPONENTS: ") || totalMod,
    dieResult: roll,
    totalModifier:
      totalMod.startsWith("+") || totalMod.startsWith("-")
        ? totalMod
        : `+${totalMod}`,
    total,
    dcOrAc: get("DC/AC: ") || "N/A",
    success,
    notes: get("NOTES: "),
    damage,
  };
}

export async function getRulesOutcome(
  playerInput: string,
  player: PlayerState,
  activeNPCs: NPC[] = [],
): Promise<RulesOutcome> {
  const roll = rollD20();
  const profBonus = getProficiencyBonus(player.level);

  // Find the target NPC if the player is attacking one
  const targetNPC = activeNPCs.find((npc) =>
    playerInput.toLowerCase().includes(npc.name.toLowerCase()),
  );

  const modRef = [
    `STR ${fmt(getModifier(player.stats.strength))}`,
    `DEX ${fmt(getModifier(player.stats.dexterity))}`,
    `CON ${fmt(getModifier(player.stats.constitution))}`,
    `INT ${fmt(getModifier(player.stats.intelligence))}`,
    `WIS ${fmt(getModifier(player.stats.wisdom))}`,
    `CHA ${fmt(getModifier(player.stats.charisma))}`,
    `Prof ${fmt(profBonus)}`,
  ].join(" | ");

  const npcContext = targetNPC
    ? `\nTarget NPC: ${targetNPC.name} — AC ${targetNPC.ac}, HP ${targetNPC.currentHp}/${targetNPC.maxHp}`
    : "";

  const userMessage = `Player action: "${playerInput}"

${serializePlayerState(player)}
Modifier reference: ${modRef}
${npcContext}
Pre-rolled d20: ${roll}

Determine the rules outcome.`;

  const response = await anthropic.messages.create({
    model: MODELS.UTILITY,
    max_tokens: MAX_TOKENS.UTILITY,
    system: [SYSTEM_PROMPT],
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText =
    response.content[0].type === "text" ? response.content[0].text : "";

  return {
    raw: rawText,
    roll,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

function fmt(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
