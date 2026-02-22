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
  rollD20,
  getWeaponAbilityMod,
  doubleDice,
  ParsedRollResult,
  DamageBreakdown,
  CharacterStats,
  Ability,
  AOEData,
} from "./gameTypes";
import { isWeaponProficient } from "./dnd5eData";
import {
  getPositionalModifiers,
  getAOECells,
  getAOETargets,
  CombatModifier,
  FEET_PER_SQUARE,
} from "./combatEnforcement";
import type { GridPosition } from "./gameTypes";
import type { AOEShape } from "./combatEnforcement";

// ─── Helpers ────────────────────────────────────────────────────────────────

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
  ability: Ability,
  target: NPC,
  positions?: Map<string, GridPosition>,
): ParsedRollResult {
  const weaponName = ability.name;
  const weaponStat = ability.weaponStat ?? "str";
  const weaponBonus = ability.weaponBonus ?? 0;
  const diceBase = ability.damageRoll!;

  // Compute positional modifiers if positions are available
  let advType: "advantage" | "disadvantage" | "normal" = "normal";
  const advNotes: string[] = [];
  if (positions) {
    const playerPos = positions.get("player");
    const targetPos = positions.get(target.id);
    if (playerPos && targetPos) {
      const attackType = ability.range?.type === "ranged" ? "ranged" : "melee";
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

  const { mod: abilityMod, label: abilityLabel } = getWeaponAbilityMod(weaponStat, player.stats);
  const proficient = isWeaponProficient(weaponName, player.weaponProficiencies ?? []);
  const profBonus = proficient ? getProficiencyBonus(player.level) : 0;
  const totalMod = abilityMod + profBonus + weaponBonus;
  const total = d20 + totalMod;

  const parts: string[] = [`${abilityLabel} ${formatModifier(abilityMod)}`];
  if (proficient) parts.push(`Prof ${formatModifier(profBonus)}`);
  if (weaponBonus !== 0) parts.push(`Bonus ${formatModifier(weaponBonus)}`);
  const components = `${parts.join(", ")} = ${formatModifier(totalMod)}`;

  const hit = isNat1 ? false : isNat20 ? true : total >= target.ac;

  let damage: ParsedRollResult["damage"] = undefined;
  if (hit) {
    let diceExpr = diceBase;
    if (isNat20) {
      diceExpr = doubleDice(diceExpr);
    }
    const weaponRoll = rollDice(diceExpr);
    const flatBonus = abilityMod + weaponBonus;
    const breakdown: DamageBreakdown[] = [{
      label: weaponName,
      dice: diceExpr,
      rolls: weaponRoll.rolls,
      flatBonus,
      subtotal: weaponRoll.total + flatBonus,
      damageType: ability.damageType ?? "piercing",
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
  ability: Ability,
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
  if (hit && ability.damageRoll) {
    let diceExpr = ability.damageRoll;
    if (isNat20) {
      diceExpr = doubleDice(diceExpr);
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
  ability: Ability,
  target: NPC,
): ParsedRollResult {
  // Use saveDCAbility (for racial abilities like Breath Weapon) or fall back to spellcastingAbility
  const spellAbility = ability.saveDCAbility ?? player.spellcastingAbility ?? "intelligence";
  const abilityMod = getModifier(player.stats[spellAbility as keyof CharacterStats] as number);
  const profBonus = getProficiencyBonus(player.level);
  const spellDC = 8 + abilityMod + profBonus;

  // Target's save roll
  const targetD20 = rollD20();
  const targetSaveTotal = targetD20 + target.savingThrowBonus;
  const targetSaved = targetSaveTotal >= spellDC;

  const abilityLabel = spellAbility.substring(0, 3).toUpperCase();
  const dcLabel = ability.type === "racial" ? "DC" : "Spell DC";
  const components = `${dcLabel}: 8 + ${abilityLabel} ${formatModifier(abilityMod)} + Prof ${formatModifier(profBonus)} = ${spellDC}`;

  // Spell lands if target FAILS the save
  const spellLands = !targetSaved;

  let damage: ParsedRollResult["damage"] = undefined;
  if (spellLands && ability.damageRoll) {
    let diceExpr = ability.damageRoll;
    if (ability.type === "racial" && ability.racialScaling) {
      // Racial scaling: find the highest threshold at or below the player's level
      const thresholds = Object.keys(ability.racialScaling)
        .map(Number)
        .filter((t) => t <= player.level)
        .sort((a, b) => b - a);
      if (thresholds.length > 0) {
        const best = ability.racialScaling[String(thresholds[0])];
        if (best?.damageRoll) diceExpr = best.damageRoll;
      }
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
 * Resolve a single NPC's attack against the player.
 * Used by the turn-by-turn combat loop to pre-roll one NPC at a time.
 */
export function resolveNPCTurn(
  npc: NPC,
  playerAC: number,
): NPCTurnResult {
  const d20 = rollD20();
  const attackTotal = d20 + npc.attackBonus;
  const isNat1 = d20 === 1;
  const isNat20 = d20 === 20;
  const hit = isNat1 ? false : isNat20 ? true : attackTotal >= playerAC;

  let damage = 0;
  if (hit) {
    let diceExpr = npc.damageDice;
    if (isNat20) {
      diceExpr = doubleDice(diceExpr);
    }
    const roll = rollDice(diceExpr);
    damage = roll.total + npc.damageBonus;
    if (damage < 0) damage = 0;
  }

  return { npcId: npc.id, npcName: npc.name, d20, attackTotal, hit, damage };
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
        diceExpr = doubleDice(diceExpr);
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

// ─── AOE Resolution ─────────────────────────────────────────────────────────

export interface AOETargetResult {
  npcId: string;
  npcName: string;
  saved: boolean;
  saveRoll: number;
  saveTotal: number;
  damageTaken: number;
}

export interface AOEResult {
  checkType: string;           // "Fireball (DEX save)"
  spellDC: number;
  damageRoll: string;          // "8d6"
  totalRolled: number;         // 28 (rolled once, shared across all targets)
  damageType: string;
  targets: AOETargetResult[];
  affectedCells: GridPosition[];
}

/**
 * Build an AOEShape from ability AOE data, caster position, and targeting info.
 * Self-origin spells use the caster position as origin.
 * Ranged AOE spells use the player-chosen aoeOrigin.
 */
export function buildAOEShape(
  aoe: AOEData,
  casterPos: GridPosition,
  aoeOrigin?: GridPosition,
  aoeDirection?: GridPosition,
): AOEShape {
  const origin = aoeOrigin ?? casterPos;
  const direction = aoeDirection ?? { row: origin.row - 1, col: origin.col }; // default: north

  switch (aoe.shape) {
    case "sphere":
    case "cylinder":
      return { type: aoe.shape, origin, radiusFeet: aoe.size };
    case "cube":
      return { type: "cube", origin, radiusFeet: aoe.size };
    case "cone":
      return { type: "cone", origin: casterPos, lengthFeet: aoe.size, direction };
    case "line":
      return { type: "line", origin: casterPos, lengthFeet: aoe.size, widthFeet: aoe.width ?? 5, direction };
  }
}

/**
 * Resolve an AOE spell: roll damage once, then each target NPC saves individually.
 * Failed save = full damage, successful save = half damage (rounded down).
 */
export function resolveAOEAction(
  player: PlayerState,
  ability: Ability,
  targetNPCs: NPC[],
  affectedCells: GridPosition[],
): AOEResult {
  const spellAbility = ability.saveDCAbility ?? player.spellcastingAbility ?? "intelligence";
  const abilityMod = getModifier(player.stats[spellAbility as keyof CharacterStats] as number);
  const profBonus = getProficiencyBonus(player.level);
  const spellDC = 8 + abilityMod + profBonus;

  // Roll damage once for the entire AOE
  const damageExpr = ability.damageRoll ?? "1d6";
  const damageResult = rollDice(damageExpr);
  const totalRolled = damageResult.total;
  const halfDamage = Math.floor(totalRolled / 2);
  const saveAbility = ability.saveAbility ?? "dexterity";

  // Each target rolls an individual save
  const targets: AOETargetResult[] = targetNPCs.map(npc => {
    const saveRoll = rollD20();
    const saveTotal = saveRoll + npc.savingThrowBonus;
    const saved = saveTotal >= spellDC;
    const damageTaken = saved ? halfDamage : totalRolled;

    return {
      npcId: npc.id,
      npcName: npc.name,
      saved,
      saveRoll,
      saveTotal,
      damageTaken,
    };
  });

  return {
    checkType: `${ability.name} (${saveAbility} save)`,
    spellDC,
    damageRoll: damageExpr,
    totalRolled,
    damageType: ability.damageType ?? "magical",
    targets,
    affectedCells,
  };
}

/**
 * Orchestrator: routes to the correct resolver based on ability type.
 * For non-targeted actions (Dodge/Dash/Disengage), returns a noCheck result.
 */
export function resolvePlayerAction(
  player: PlayerState,
  ability: Ability,
  targetNPC: NPC | null,
  positions?: Map<string, GridPosition>,
): ParsedRollResult {
  // AOE abilities are resolved separately via resolveAOEAction — skip single-target routing
  if (ability.aoe) {
    return {
      checkType: ability.name,
      components: "",
      dieResult: 0,
      totalModifier: "+0",
      total: 0,
      dcOrAc: "N/A",
      success: true,
      notes: `${ability.name} — AOE resolved separately`,
      noCheck: true,
    };
  }

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
    if (!ability.damageRoll) {
      return {
        checkType: "IMPOSSIBLE",
        components: "",
        dieResult: 0,
        totalModifier: "+0",
        total: 0,
        dcOrAc: "N/A",
        success: false,
        notes: `Weapon "${ability.name}" has no damage data`,
        impossible: true,
      };
    }
    return resolveWeaponAttack(player, ability, targetNPC, positions);
  }

  // Cantrip / spell / racial attacks
  if (ability.type === "cantrip" || ability.type === "spell" || ability.type === "racial") {
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
