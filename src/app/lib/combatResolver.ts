/**
 * combatResolver.ts
 *
 * Deterministic combat resolution — player attacks, spell attacks, NPC turns.
 * Pure math, no LLM calls. Reuses patterns from actionResolver.ts.
 *
 * Server-side module (imports from gameState.ts).
 */

import {
  PlayerState,
  NPC,
  getModifier,
  getProficiencyBonus,
  formatModifier,
} from "./gameState";
import {
  rollDice,
  ParsedRollResult,
  DamageBreakdown,
  CharacterStats,
  CombatAbility,
  WeaponStat,
} from "./gameTypes";
import { isWeaponProficient, getCantripDice } from "./dnd5eData";
import {
  getPositionalModifiers,
  CombatModifier,
} from "./combatEnforcement";
import type { GridPosition } from "./gameTypes";

/** All SRD cantrips scale at character levels 5, 11, and 17. */
const CANTRIP_SCALING_LEVELS = [5, 11, 17];

// ─── Helpers ────────────────────────────────────────────────────────────────

function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

/** Resolve advantage/disadvantage from a list of modifiers. */
function resolveAdvantage(mods: CombatModifier[]): "advantage" | "disadvantage" | "normal" {
  const hasAdv = mods.some(m => m.type === "advantage");
  const hasDisadv = mods.some(m => m.type === "disadvantage");
  if (hasAdv && hasDisadv) return "normal"; // cancel out
  if (hasAdv) return "advantage";
  if (hasDisadv) return "disadvantage";
  return "normal";
}

/** Roll d20 with advantage/disadvantage. Returns { d20, allRolls, advType }. */
function rollD20WithAdvantage(advType: "advantage" | "disadvantage" | "normal"): {
  d20: number;
  allRolls: number[];
  advType: string;
} {
  if (advType === "normal") {
    const d20 = rollD20();
    return { d20, allRolls: [d20], advType: "normal" };
  }
  const r1 = rollD20();
  const r2 = rollD20();
  const d20 = advType === "advantage" ? Math.max(r1, r2) : Math.min(r1, r2);
  return { d20, allRolls: [r1, r2], advType };
}

/** Get the ability modifier for a weapon's stat type. */
function getWeaponAbilityMod(
  stat: "str" | "dex" | "finesse" | "none",
  stats: CharacterStats,
): { mod: number; label: string } {
  const strMod = getModifier(stats.strength);
  const dexMod = getModifier(stats.dexterity);
  switch (stat) {
    case "str":
      return { mod: strMod, label: "STR" };
    case "dex":
      return { mod: dexMod, label: "DEX" };
    case "finesse":
      return strMod >= dexMod
        ? { mod: strMod, label: "STR" }
        : { mod: dexMod, label: "DEX" };
    case "none":
      return { mod: 0, label: "NONE" };
  }
}

// ─── NPC Turn Result ────────────────────────────────────────────────────────

export interface NPCTurnResult {
  npcId: string;
  npcName: string;
  d20: number;
  attackTotal: number;
  hit: boolean;
  damage: number;
}

// ─── Player Attack Resolvers ────────────────────────────────────────────────

/**
 * Resolve a weapon attack: d20 + abilityMod + profBonus + weaponBonus vs target AC.
 * Nat 1 = auto-miss, Nat 20 = auto-hit + crit (double dice).
 */
export function resolveWeaponAttack(
  player: PlayerState,
  weaponName: string,
  weapon: WeaponStat,
  target: NPC,
  positions?: Map<string, GridPosition>,
): ParsedRollResult {
  // Compute positional modifiers if positions are available
  let advType: "advantage" | "disadvantage" | "normal" = "normal";
  const advNotes: string[] = [];
  if (positions) {
    const playerPos = positions.get("player");
    const targetPos = positions.get(target.id);
    if (playerPos && targetPos) {
      const attackType = weapon.range?.type === "ranged" ? "ranged" : "melee";
      const mods = getPositionalModifiers(
        playerPos, targetPos, attackType,
        target.conditions, player.conditions,
        positions, "player",
      );
      advType = resolveAdvantage(mods);
      if (advType !== "normal") {
        advNotes.push(...mods.map(m => `${m.type}: ${m.source}`));
      }
    }
  }

  const { d20, allRolls } = rollD20WithAdvantage(advType);
  const isNat1 = d20 === 1;
  const isNat20 = d20 === 20;

  const { mod: abilityMod, label: abilityLabel } = getWeaponAbilityMod(weapon.stat, player.stats);
  const proficient = isWeaponProficient(weaponName, player.weaponProficiencies ?? []);
  const profBonus = proficient ? getProficiencyBonus(player.level) : 0;
  const weaponBonus = weapon.bonus;
  const totalMod = abilityMod + profBonus + weaponBonus;
  const total = d20 + totalMod;

  const parts: string[] = [`${abilityLabel} ${formatModifier(abilityMod)}`];
  if (proficient) parts.push(`Prof ${formatModifier(profBonus)}`);
  if (weaponBonus !== 0) parts.push(`Bonus ${formatModifier(weaponBonus)}`);
  const components = `${parts.join(", ")} = ${formatModifier(totalMod)}`;

  const hit = isNat1 ? false : isNat20 ? true : total >= target.ac;

  let damage: ParsedRollResult["damage"] = undefined;
  if (hit) {
    let diceExpr = weapon.dice;
    if (isNat20) {
      const dm = diceExpr.match(/^(\d+)(d\d+)$/i);
      if (dm) diceExpr = `${parseInt(dm[1]) * 2}${dm[2]}`;
    }
    const weaponRoll = rollDice(diceExpr);
    const flatBonus = abilityMod + weaponBonus;
    const breakdown: DamageBreakdown[] = [{
      label: weaponName,
      dice: diceExpr,
      rolls: weaponRoll.rolls,
      flatBonus,
      subtotal: weaponRoll.total + flatBonus,
      damageType: "piercing",
    }];

    damage = {
      breakdown,
      totalDamage: breakdown.reduce((sum, b) => sum + b.subtotal, 0),
      isCrit: isNat20,
    };
  }

  const notesParts: string[] = [];
  if (isNat20) notesParts.push("Natural 20 — critical hit!");
  else if (isNat1) notesParts.push("Natural 1 — automatic miss");
  else notesParts.push(hit ? "Attack hits" : "Attack misses");
  if (advType !== "normal" && allRolls.length === 2) {
    notesParts.push(`${advType} (rolled ${allRolls[0]}, ${allRolls[1]})`);
  }
  if (advNotes.length > 0) notesParts.push(...advNotes);

  return {
    checkType: `${weaponName} Attack`,
    components,
    dieResult: d20,
    totalModifier: formatModifier(totalMod),
    total,
    dcOrAc: `${target.ac}`,
    success: hit,
    notes: notesParts.join(". "),
    damage,
  };
}

/**
 * Resolve a spell attack roll (ranged or melee):
 * d20 + spellcastingAbilityMod + profBonus vs target AC.
 */
export function resolveSpellAttack(
  player: PlayerState,
  ability: CombatAbility,
  target: NPC,
  positions?: Map<string, GridPosition>,
): ParsedRollResult {
  const spellAbility = player.spellcastingAbility ?? "intelligence";
  const abilityMod = getModifier(player.stats[spellAbility as keyof CharacterStats] as number);
  const profBonus = getProficiencyBonus(player.level);
  const totalMod = abilityMod + profBonus;

  // Positional modifiers
  let advType: "advantage" | "disadvantage" | "normal" = "normal";
  const advNotes: string[] = [];
  if (positions) {
    const playerPos = positions.get("player");
    const targetPos = positions.get(target.id);
    if (playerPos && targetPos) {
      const attackType = ability.attackType === "melee" ? "melee" : "ranged";
      const mods = getPositionalModifiers(
        playerPos, targetPos, attackType,
        target.conditions, player.conditions,
        positions, "player",
      );
      advType = resolveAdvantage(mods);
      if (advType !== "normal") {
        advNotes.push(...mods.map(m => `${m.type}: ${m.source}`));
      }
    }
  }

  const { d20, allRolls } = rollD20WithAdvantage(advType);
  const isNat1 = d20 === 1;
  const isNat20 = d20 === 20;
  const total = d20 + totalMod;

  const abilityLabel = spellAbility.substring(0, 3).toUpperCase();
  const components = `${abilityLabel} ${formatModifier(abilityMod)}, Prof ${formatModifier(profBonus)} = ${formatModifier(totalMod)}`;

  const hit = isNat1 ? false : isNat20 ? true : total >= target.ac;

  let damage: ParsedRollResult["damage"] = undefined;
  if (hit && ability.damageDice) {
    let diceExpr = ability.damageDice;
    if (ability.type === "cantrip") {
      diceExpr = getCantripDice(diceExpr, player.level, CANTRIP_SCALING_LEVELS);
    }
    if (isNat20) {
      const dm = diceExpr.match(/^(\d+)(d\d+)$/i);
      if (dm) diceExpr = `${parseInt(dm[1]) * 2}${dm[2]}`;
    }
    const spellRoll = rollDice(diceExpr);
    const breakdown: DamageBreakdown[] = [{
      label: ability.name,
      dice: diceExpr,
      rolls: spellRoll.rolls,
      flatBonus: 0,
      subtotal: spellRoll.total,
      damageType: ability.damageType ?? "magical",
    }];

    damage = {
      breakdown,
      totalDamage: breakdown.reduce((sum, b) => sum + b.subtotal, 0),
      isCrit: isNat20,
    };
  }

  const notesParts: string[] = [];
  if (isNat20) notesParts.push("Natural 20 — critical hit!");
  else if (isNat1) notesParts.push("Natural 1 — automatic miss");
  else notesParts.push(hit ? "Spell attack hits" : "Spell attack misses");
  if (advType !== "normal" && allRolls.length === 2) {
    notesParts.push(`${advType} (rolled ${allRolls[0]}, ${allRolls[1]})`);
  }

  return {
    checkType: `${ability.name} Spell Attack`,
    components,
    dieResult: d20,
    totalModifier: formatModifier(totalMod),
    total,
    dcOrAc: `${target.ac}`,
    success: hit,
    notes: notesParts.join(". "),
    damage,
  };
}

/**
 * Resolve a save-based spell: spell DC = 8 + spellMod + profBonus.
 * Target rolls d20 + savingThrowBonus vs spell DC.
 * success = target FAILS save (player's spell lands).
 */
export function resolveSpellSave(
  player: PlayerState,
  ability: CombatAbility,
  target: NPC,
): ParsedRollResult {
  const spellAbility = player.spellcastingAbility ?? "intelligence";
  const abilityMod = getModifier(player.stats[spellAbility as keyof CharacterStats] as number);
  const profBonus = getProficiencyBonus(player.level);
  const spellDC = 8 + abilityMod + profBonus;

  // Target's save roll
  const targetD20 = rollD20();
  const targetSaveTotal = targetD20 + target.savingThrowBonus;
  const targetSaved = targetSaveTotal >= spellDC;

  const abilityLabel = spellAbility.substring(0, 3).toUpperCase();
  const components = `Spell DC: 8 + ${abilityLabel} ${formatModifier(abilityMod)} + Prof ${formatModifier(profBonus)} = ${spellDC}`;

  // Spell lands if target FAILS the save
  const spellLands = !targetSaved;

  let damage: ParsedRollResult["damage"] = undefined;
  if (spellLands && ability.damageDice) {
    let diceExpr = ability.damageDice;
    if (ability.type === "cantrip") {
      diceExpr = getCantripDice(diceExpr, player.level, CANTRIP_SCALING_LEVELS);
    }
    const spellRoll = rollDice(diceExpr);
    const breakdown: DamageBreakdown[] = [{
      label: ability.name,
      dice: diceExpr,
      rolls: spellRoll.rolls,
      flatBonus: 0,
      subtotal: spellRoll.total,
      damageType: ability.damageType ?? "magical",
    }];

    damage = {
      breakdown,
      totalDamage: breakdown.reduce((sum, b) => sum + b.subtotal, 0),
      isCrit: false,
    };
  }

  const saveAbilityName = ability.saveAbility ?? "dexterity";
  const notes = targetSaved
    ? `Target saves (${saveAbilityName} save: ${targetD20}+${target.savingThrowBonus}=${targetSaveTotal} vs DC ${spellDC})`
    : `Target fails save (${saveAbilityName} save: ${targetD20}+${target.savingThrowBonus}=${targetSaveTotal} vs DC ${spellDC})`;

  return {
    checkType: `${ability.name} (${saveAbilityName} save)`,
    components,
    dieResult: targetD20,
    totalModifier: formatModifier(target.savingThrowBonus),
    total: targetSaveTotal,
    dcOrAc: `DC ${spellDC}`,
    success: spellLands,
    notes,
    damage,
  };
}

/**
 * Resolve all surviving hostile NPC attacks against the player.
 * Same math as buildNPCRollContext() in tools.ts.
 */
export function resolveNPCTurns(
  npcs: NPC[],
  playerAC: number,
): NPCTurnResult[] {
  const results: NPCTurnResult[] = [];
  for (const npc of npcs) {
    if (npc.currentHp <= 0 || npc.disposition !== "hostile") continue;
    const d20 = rollD20();
    const attackTotal = d20 + npc.attackBonus;
    const isNat1 = d20 === 1;
    const isNat20 = d20 === 20;
    const hit = isNat1 ? false : isNat20 ? true : attackTotal >= playerAC;

    let damage = 0;
    if (hit) {
      let diceExpr = npc.damageDice;
      if (isNat20) {
        const dm = diceExpr.match(/^(\d+)(d\d+)$/i);
        if (dm) diceExpr = `${parseInt(dm[1]) * 2}${dm[2]}`;
      }
      const roll = rollDice(diceExpr);
      damage = roll.total + npc.damageBonus;
      if (damage < 0) damage = 0;
    }

    results.push({
      npcId: npc.id,
      npcName: npc.name,
      d20,
      attackTotal,
      hit,
      damage,
    });
  }
  return results;
}

/**
 * Orchestrator: routes to the correct resolver based on ability type.
 * For non-targeted actions (Dodge/Dash/Disengage), returns a noCheck result.
 */
export function resolvePlayerAction(
  player: PlayerState,
  ability: CombatAbility,
  targetNPC: NPC | null,
  positions?: Map<string, GridPosition>,
): ParsedRollResult {
  // Non-targeted actions
  if (!ability.requiresTarget) {
    return {
      checkType: ability.name,
      components: "",
      dieResult: 0,
      totalModifier: "+0",
      total: 0,
      dcOrAc: "N/A",
      success: true,
      notes: `${ability.name} action taken`,
      noCheck: true,
    };
  }

  if (!targetNPC) {
    return {
      checkType: "IMPOSSIBLE",
      components: "",
      dieResult: 0,
      totalModifier: "+0",
      total: 0,
      dcOrAc: "N/A",
      success: false,
      notes: "No target specified for targeted ability",
      impossible: true,
    };
  }

  // Weapon attacks
  if (ability.type === "weapon") {
    const weaponName = ability.id.replace("weapon:", "");
    const weapon = player.weaponDamage[weaponName];
    if (!weapon) {
      return {
        checkType: "IMPOSSIBLE",
        components: "",
        dieResult: 0,
        totalModifier: "+0",
        total: 0,
        dcOrAc: "N/A",
        success: false,
        notes: `Weapon "${weaponName}" not found`,
        impossible: true,
      };
    }
    return resolveWeaponAttack(player, weaponName, weapon, targetNPC, positions);
  }

  // Cantrip / spell attacks
  if (ability.type === "cantrip" || ability.type === "spell") {
    if (ability.attackType === "save") {
      return resolveSpellSave(player, ability, targetNPC);
    }
    // Ranged or melee spell attack roll
    return resolveSpellAttack(player, ability, targetNPC, positions);
  }

  // Fallback
  return {
    checkType: ability.name,
    components: "",
    dieResult: 0,
    totalModifier: "+0",
    total: 0,
    dcOrAc: "N/A",
    success: true,
    notes: `${ability.name} used`,
    noCheck: true,
  };
}
