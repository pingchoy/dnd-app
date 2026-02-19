/**
 * Rules Agent — Claude Haiku
 *
 * Validates contested player actions and interprets pre-rolled dice.
 * Prompt is class-agnostic — modifiers are derived from the character
 * stats and proficiency list passed in each call.
 */

import { anthropic, MAX_TOKENS, MODELS } from "../lib/anthropic";
import { isContestedAction } from "../lib/actionKeywords";
export { isContestedAction };
import {
  NPC,
  PlayerState,
  getProficiencyBonus,
  getModifier,
  serializePlayerState,
} from "../lib/gameState";

const SYSTEM_PROMPT = `You are a D&D 5e rules expert assisting a Dungeon Master.

Given a player action, a pre-rolled d20, and the character's full stat block, determine:
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
NOTES: [one line — key rule or effect that applies, e.g. "Sneak Attack adds 3d6"]`;


export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

export interface RulesOutcome {
  raw: string;
  roll: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ParsedRollResult {
  checkType: string;
  components: string;  // e.g. "DEX +3, Proficiency +3, Expertise +3 = +9"
  dieResult: number;
  totalModifier: string; // e.g. "+9"
  total: number;
  dcOrAc: string;
  success: boolean;
  notes: string;
}

export function parseRulesOutcome(raw: string, roll: number): ParsedRollResult {
  const get = (prefix: string) => {
    const line = raw.split("\n").find((l) => l.startsWith(prefix));
    return line ? line.slice(prefix.length).trim() : "";
  };

  const rollLine   = get("ROLL: ");
  // Parse: "14 + +9 = 23" or "14 + 9 = 23"
  const rollMatch  = rollLine.match(/(\d+)\s*\+\s*([+-]?\d+)\s*=\s*(-?\d+)/);
  const total      = rollMatch ? parseInt(rollMatch[3]) : roll;
  const totalMod   = rollMatch ? rollMatch[2] : "+0";

  return {
    checkType:     get("CHECK: ") || "Check",
    components:    get("COMPONENTS: ") || totalMod,
    dieResult:     roll,
    totalModifier: totalMod.startsWith("+") || totalMod.startsWith("-") ? totalMod : `+${totalMod}`,
    total,
    dcOrAc:        get("DC/AC: ") || "N/A",
    success:       get("RESULT: ").toUpperCase().includes("SUCCESS"),
    notes:         get("NOTES: "),
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
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText = response.content[0].type === "text" ? response.content[0].text : "";

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
