/**
 * actionResolver.ts
 *
 * Server-side deterministic resolvers for D&D 5e contested actions.
 * The rules agent (Haiku) classifies the action and calls one of these
 * via tool_use — all math is computed here, never by the AI.
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
} from "./gameTypes";
import { SKILL_ABILITY_MAP, isWeaponProficient } from "./dnd5eData";

// ─── Tool input interfaces ──────────────────────────────────────────────────

export interface AttackInput {
  weapon: string;
  target: string;
  extra_damage_sources?: string[];
}

export interface SkillCheckInput {
  skill: string;
  dc: number;
}

export interface SavingThrowInput {
  ability: string;
  dc: number;
  source?: string;
}

// ─── Private helpers ─────────────────────────────────────────────────────────

/**
 * Case-insensitive bidirectional substring match.
 * Returns true if either string contains the other.
 */
function fuzzyMatch(a: string, b: string): boolean {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  return al.includes(bl) || bl.includes(al);
}

/** Look up a feature by name (case-insensitive). */
function findFeature(player: PlayerState, name: string) {
  return player.features.find(
    (f) => f.name.toLowerCase() === name.toLowerCase(),
  );
}

/** Parse a slot level from a source string like "Divine Smite 2" or "Divine Smite". */
function parseSlotLevel(source: string, defaultLevel: number): number {
  const m = source.match(/(\d+)/);
  return m ? parseInt(m[1]) : defaultLevel;
}

/**
 * Roll dice for an extra damage source, doubling dice on crit.
 * Returns a DamageBreakdown. For flat-only bonuses (no dice), pass "0d0".
 */
function rollExtraDice(
  label: string,
  diceExpr: string,
  flatBonus: number,
  damageType: string,
  isCrit: boolean,
): DamageBreakdown {
  let expr = diceExpr;
  if (isCrit && expr !== "0d0") {
    expr = doubleDice(expr);
  }

  if (expr === "0d0") {
    // Flat-only damage (e.g. Rage, Dueling) — no dice to roll
    return {
      label,
      dice: "",
      rolls: [],
      flatBonus,
      subtotal: flatBonus,
      damageType,
    };
  }

  const rolled = rollDice(expr);
  return {
    label,
    dice: expr,
    rolls: rolled.rolls,
    flatBonus,
    subtotal: rolled.total + flatBonus,
    damageType,
  };
}

/**
 * Resolve extra damage from per-attack choices and situational sources.
 *
 * The classifier sends source names like "Sneak Attack", "Divine Smite 2",
 * "GWM", etc. Each handler verifies the player actually has the
 * feature/condition before rolling damage.
 *
 * Persistent bonuses (Rage, Dueling, Hunter's Mark, Hex) are handled by
 * applyEffects() → PlayerState aggregated fields, NOT here.
 *
 * Dice-based sources (Sneak Attack, Divine Smite, etc.) double dice on crit.
 */
function resolveExtraDamage(
  sources: string[],
  player: PlayerState,
  isCrit: boolean,
): DamageBreakdown[] {
  const results: DamageBreakdown[] = [];

  for (const source of sources) {
    const sourceLower = source.toLowerCase();

    // ── Sneak Attack (Rogue) ──────────────────────────────────────────
    // Dice count read from feature's gameplayEffects.sneakAttackDice
    if (sourceLower.includes("sneak attack")) {
      const feature = findFeature(player, "sneak attack");
      if (!feature) continue;
      const diceCount = feature.gameplayEffects?.sneakAttackDice ?? Math.ceil(player.level / 2);
      results.push(
        rollExtraDice("Sneak Attack", `${diceCount}d6`, 0, "piercing", isCrit),
      );
      continue;
    }

    // ── Divine Smite (Paladin) ────────────────────────────────────────
    // (1 + slotLevel)d8 radiant; +1d8 vs undead/fiend (not tracked here).
    // Classifier sends "Divine Smite" (default 1st) or "Divine Smite 2" etc.
    if (sourceLower.includes("divine smite")) {
      if (!findFeature(player, "divine smite")) continue;
      const slotLevel = parseSlotLevel(source, 1);
      const diceCount = 1 + slotLevel; // 2d8 at 1st level, 3d8 at 2nd, etc.
      results.push(
        rollExtraDice("Divine Smite", `${diceCount}d8`, 0, "radiant", isCrit),
      );
      continue;
    }

    // ── Eldritch Smite (Warlock Invocation) ───────────────────────────
    // 1d8 + 1d8 per slot level (all Warlock slots are same level).
    if (sourceLower.includes("eldritch smite")) {
      if (!findFeature(player, "eldritch smite")) continue;
      const slotLevel = parseSlotLevel(source, 1);
      const diceCount = 1 + slotLevel;
      results.push(
        rollExtraDice("Eldritch Smite", `${diceCount}d8`, 0, "force", isCrit),
      );
      continue;
    }

    // ── Colossus Slayer (Hunter Ranger) ───────────────────────────────
    // 1d8 once per turn if target is below its hit point maximum.
    if (sourceLower.includes("colossus slayer")) {
      if (!findFeature(player, "colossus slayer")) continue;
      results.push(
        rollExtraDice("Colossus Slayer", "1d8", 0, "weapon", isCrit),
      );
      continue;
    }

    // ── Dread Ambusher (Gloom Stalker Ranger) ─────────────────────────
    // +1d8 damage on first attack of first turn of combat.
    if (sourceLower.includes("dread ambusher")) {
      if (!findFeature(player, "dread ambusher")) continue;
      results.push(
        rollExtraDice("Dread Ambusher", "1d8", 0, "weapon", isCrit),
      );
      continue;
    }

    // ── Great Weapon Master (Feat) ────────────────────────────────────
    // +10 damage (with -5 attack penalty, handled by attack modifier).
    // NOT doubled on crit (flat bonus).
    if (sourceLower.includes("great weapon master")) {
      if (!findFeature(player, "great weapon master")) continue;
      results.push(
        rollExtraDice("Great Weapon Master", "0d0", 10, "weapon", false),
      );
      continue;
    }

    // ── Savage Attacker (Feat) ────────────────────────────────────────
    // Reroll weapon damage dice once per turn, take higher.
    // Not resolved here — would require access to the weapon roll.
    // Ignored silently.

    // ── Unrecognized source — skip silently ───────────────────────────
  }

  return results;
}

// ─── Public resolvers ────────────────────────────────────────────────────────

export function resolveAttack(
  input: AttackInput,
  player: PlayerState,
  activeNPCs: NPC[],
): ParsedRollResult {
  // Find weapon in player's abilities
  const weaponAbility = (player.abilities ?? [])
    .filter(a => a.type === "weapon")
    .find(a => fuzzyMatch(a.name, input.weapon));
  if (!weaponAbility || !weaponAbility.damageRoll) {
    return markImpossible(`Weapon "${input.weapon}" not found in inventory`);
  }

  const weaponName = weaponAbility.name;
  const weaponStatType = weaponAbility.weaponStat ?? "str";
  const weaponBonus = weaponAbility.weaponBonus ?? 0;

  // Find target NPC
  const target = activeNPCs.find((npc) => fuzzyMatch(npc.name, input.target));
  if (!target) {
    return markImpossible(
      `Target "${input.target}" not found among active NPCs`,
    );
  }

  // Roll d20
  const d20 = rollD20();
  const isNat1 = d20 === 1;
  const isNat20 = d20 === 20;

  // Compute attack modifier
  const { mod: abilityMod, label: abilityLabel } = getWeaponAbilityMod(
    weaponStatType,
    player.stats,
  );
  const proficient = isWeaponProficient(
    weaponName,
    player.weaponProficiencies ?? [],
  );
  const profBonus = proficient ? getProficiencyBonus(player.level) : 0;

  // Read aggregated attack bonus from PlayerState (set by applyEffects)
  // weaponStat "dex" = ranged weapons; "str"/"finesse"/"none" = melee
  const isMelee = weaponStatType !== "dex";
  const effectAttackBonus = isMelee
    ? (player.meleeAttackBonus ?? 0)
    : (player.rangedAttackBonus ?? 0);
  const totalMod = abilityMod + profBonus + weaponBonus + effectAttackBonus;
  const total = d20 + totalMod;

  // Build components string
  const parts: string[] = [`${abilityLabel} ${formatModifier(abilityMod)}`];
  if (proficient) parts.push(`Prof ${formatModifier(profBonus)}`);
  if (weaponBonus !== 0) parts.push(`Bonus ${formatModifier(weaponBonus)}`);
  if (effectAttackBonus !== 0) parts.push(`Effects ${formatModifier(effectAttackBonus)}`);
  const components = `${parts.join(", ")} = ${formatModifier(totalMod)}`;

  // Determine hit/miss (nat 1 = auto-miss, nat 20 = auto-hit)
  const hit = isNat1 ? false : isNat20 ? true : total >= target.ac;

  // Roll damage on hit
  let damage: ParsedRollResult["damage"] = undefined;
  if (hit) {
    const breakdown: DamageBreakdown[] = [];

    // Weapon damage (crit doubles dice count, not flat bonus)
    let diceExpr = weaponAbility.damageRoll;
    if (isNat20) {
      diceExpr = doubleDice(diceExpr);
    }
    const weaponRoll = rollDice(diceExpr);
    // Read aggregated damage bonus from PlayerState (set by applyEffects)
    const effectDamageBonus = isMelee
      ? (player.meleeDamageBonus ?? 0)
      : (player.rangedDamageBonus ?? 0);
    const flatBonus = abilityMod + weaponBonus + effectDamageBonus;
    breakdown.push({
      label: weaponName,
      dice: diceExpr,
      rolls: weaponRoll.rolls,
      flatBonus,
      subtotal: weaponRoll.total + flatBonus,
      damageType: weaponAbility.damageType ?? "piercing",
    });

    // Aggregated bonus damage from effects (e.g. "1d6", "1d8 radiant")
    if (player.bonusDamage?.length) {
      for (const bd of player.bonusDamage) {
        // Parse "1d6" or "1d8 radiant" — dice expression + optional damage type
        const match = bd.match(/^(\d+d\d+)(?:\s+(.+))?$/i);
        if (match) {
          const damageType = match[2] ?? "weapon";
          breakdown.push(
            rollExtraDice("Effect Bonus", match[1], 0, damageType, isNat20),
          );
        }
      }
    }

    // Extra damage sources (Sneak Attack, etc.)
    if (input.extra_damage_sources?.length) {
      const extras = resolveExtraDamage(
        input.extra_damage_sources,
        player,
        isNat20,
      );
      breakdown.push(...extras);
    }

    damage = {
      breakdown,
      totalDamage: breakdown.reduce((sum, b) => sum + b.subtotal, 0),
      isCrit: isNat20,
    };
  }

  const checkType = `${weaponName} Attack`;
  const notes = isNat20
    ? "Natural 20 — critical hit!"
    : isNat1
      ? "Natural 1 — automatic miss"
      : hit
        ? "Attack hits"
        : "Attack misses";

  return {
    checkType,
    components,
    dieResult: d20,
    totalModifier: formatModifier(totalMod),
    total,
    dcOrAc: `${target.ac}`,
    success: hit,
    notes,
    damage,
  };
}

export function resolveSkillCheck(
  input: SkillCheckInput,
  player: PlayerState,
): ParsedRollResult {
  const skillLower = input.skill.toLowerCase();
  const ability = SKILL_ABILITY_MAP[skillLower];
  if (!ability) {
    return markImpossible(`Unknown skill: "${input.skill}"`);
  }

  const d20 = rollD20();
  const abilityMod = getModifier(
    player.stats[ability as keyof CharacterStats] as number,
  );
  const profBonus = getProficiencyBonus(player.level);

  const isProficient = player.skillProficiencies.some(
    (s) => s.toLowerCase() === skillLower,
  );

  // Check for Expertise (double proficiency)
  const expertiseFeature = player.features.find(
    (f) => f.name.toLowerCase() === "expertise",
  );
  const hasExpertise =
    isProficient &&
    expertiseFeature?.chosenOption?.toLowerCase().includes(skillLower);

  // Check for half proficiency on non-proficient checks (Jack of All Trades)
  const hasHalfProficiency = !isProficient && (player.halfProficiency ?? false);

  let skillMod = abilityMod;
  const parts: string[] = [
    `${ability.substring(0, 3).toUpperCase()} ${formatModifier(abilityMod)}`,
  ];

  if (hasExpertise) {
    const expertiseBonus = profBonus * 2;
    skillMod += expertiseBonus;
    parts.push(`Expertise ${formatModifier(expertiseBonus)}`);
  } else if (isProficient) {
    skillMod += profBonus;
    parts.push(`Prof ${formatModifier(profBonus)}`);
  } else if (hasHalfProficiency) {
    const halfProf = Math.floor(profBonus / 2);
    skillMod += halfProf;
    parts.push(`Half Prof ${formatModifier(halfProf)}`);
  }

  // Apply minimum check roll (Reliable Talent) for proficient checks
  let effectiveD20 = d20;
  const minRoll = player.minCheckRoll ?? 0;
  if (isProficient && minRoll > 0 && d20 < minRoll) {
    effectiveD20 = minRoll;
  }

  const total = effectiveD20 + skillMod;
  const components = `${parts.join(", ")} = ${formatModifier(skillMod)}`;
  const success = total >= input.dc;

  const reliableUsed = effectiveD20 > d20;
  const notes = reliableUsed
    ? `${success ? "Check succeeds" : "Check fails"} (Reliable Talent: d20 ${d20} → ${effectiveD20})`
    : success ? "Check succeeds" : "Check fails";

  return {
    checkType: `${input.skill.charAt(0).toUpperCase() + input.skill.slice(1)} Check`,
    components,
    dieResult: effectiveD20,
    totalModifier: formatModifier(skillMod),
    total,
    dcOrAc: `${input.dc}`,
    success,
    notes,
  };
}

export function resolveSavingThrow(
  input: SavingThrowInput,
  player: PlayerState,
): ParsedRollResult {
  const abilityLower = input.ability.toLowerCase();
  const abilityMod = getModifier(
    player.stats[abilityLower as keyof CharacterStats] as number,
  );
  const profBonus = getProficiencyBonus(player.level);
  // Check base proficiency and bonus proficiencies from effects (e.g. Diamond Soul)
  const bonusSaves = player.bonusSaveProficiencies ?? [];
  const isProficient = player.savingThrowProficiencies.some(
    (s) => s.toLowerCase() === abilityLower,
  ) || bonusSaves.includes("all") || bonusSaves.includes(abilityLower);

  let saveMod = abilityMod;
  const parts: string[] = [
    `${abilityLower.substring(0, 3).toUpperCase()} ${formatModifier(abilityMod)}`,
  ];

  if (isProficient) {
    saveMod += profBonus;
    parts.push(`Prof ${formatModifier(profBonus)}`);
  }

  const d20 = rollD20();
  const total = d20 + saveMod;
  const components = `${parts.join(", ")} = ${formatModifier(saveMod)}`;
  const success = total >= input.dc;
  const source = input.source ? ` (${input.source})` : "";

  return {
    checkType: `${abilityLower.charAt(0).toUpperCase() + abilityLower.slice(1)} Saving Throw`,
    components,
    dieResult: d20,
    totalModifier: formatModifier(saveMod),
    total,
    dcOrAc: `${input.dc}`,
    success,
    notes: success ? `Save succeeds${source}` : `Save fails${source}`,
  };
}

export function markImpossible(reason: string): ParsedRollResult {
  return {
    checkType: "IMPOSSIBLE",
    components: "",
    dieResult: 0,
    totalModifier: "+0",
    total: 0,
    dcOrAc: "N/A",
    success: false,
    notes: reason,
    impossible: true,
  };
}

export function markNoCheck(reason: string): ParsedRollResult {
  return {
    checkType: "NONE",
    components: "",
    dieResult: 0,
    totalModifier: "+0",
    total: 0,
    dcOrAc: "N/A",
    success: false,
    notes: reason,
    noCheck: true,
  };
}

// ─── Summary builder ─────────────────────────────────────────────────────────

/**
 * Generate the old 7-line text format that the DM agent reads.
 * Backward-compatible with dmAgent.ts line 364-366 injection.
 */
export function buildRawSummary(parsed: ParsedRollResult): string {
  if (parsed.impossible) {
    return `CHECK: IMPOSSIBLE\nNOTES: ${parsed.notes}`;
  }
  if (parsed.noCheck) {
    return `CHECK: NONE\nNOTES: ${parsed.notes}`;
  }

  const lines = [
    `CHECK: ${parsed.checkType}`,
    `COMPONENTS: ${parsed.components}`,
    `ROLL: ${parsed.dieResult} + ${parsed.totalModifier} = ${parsed.total}`,
    `DC/AC: ${parsed.dcOrAc}`,
    `RESULT: ${parsed.success ? "SUCCESS" : "FAILURE"}`,
  ];

  if (parsed.damage) {
    const damageStr = parsed.damage.breakdown
      .map((b) => {
        const bonusStr =
          b.flatBonus !== 0
            ? `${b.flatBonus >= 0 ? "+" : ""}${b.flatBonus}`
            : "";
        return `${b.label}: ${b.dice}${bonusStr}${b.damageType ? ` ${b.damageType}` : ""}`;
      })
      .join("; ");
    lines.push(`DAMAGE: ${damageStr}`);
  } else {
    lines.push("DAMAGE: N/A");
  }

  lines.push(`NOTES: ${parsed.notes}`);
  return lines.join("\n");
}
