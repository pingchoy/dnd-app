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

function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

/**
 * Case-insensitive bidirectional substring match.
 * Returns true if either string contains the other.
 */
function fuzzyMatch(a: string, b: string): boolean {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  return al.includes(bl) || bl.includes(al);
}

/** Resolve the ability modifier for a weapon's stat type. */
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
 * Compute the Rage damage bonus by Barbarian level.
 * 5e SRD: +2 (levels 1-8), +3 (levels 9-15), +4 (levels 16+).
 */
function rageBonusByLevel(level: number): number {
  if (level >= 16) return 4;
  if (level >= 9) return 3;
  return 2;
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
    const dm = expr.match(/^(\d+)(d\d+)$/i);
    if (dm) expr = `${parseInt(dm[1]) * 2}${dm[2]}`;
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
 * Resolve extra damage from class features and active effects.
 *
 * The classifier sends source names like "Sneak Attack", "Divine Smite 2",
 * "Rage", "Hunter's Mark", etc. Each handler verifies the player actually
 * has the feature/condition before rolling damage.
 *
 * Dice-based sources (Sneak Attack, Divine Smite, etc.) double dice on crit.
 * Flat-bonus sources (Rage, Dueling) are NOT doubled on crit per 5e rules.
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
    // ceil(level/2)d6, requires finesse/ranged + advantage or adjacent ally
    if (sourceLower.includes("sneak attack")) {
      if (!findFeature(player, "sneak attack")) continue;
      const feature = findFeature(player, "sneak attack")!;
      let diceCount: number;
      if (feature.scalingFormula) {
        const m = feature.scalingFormula.match(/^(\d+)d(\d+)$/i);
        diceCount = m ? parseInt(m[1]) : Math.ceil(player.level / 2);
      } else {
        diceCount = Math.ceil(player.level / 2);
      }
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

    // ── Rage Damage (Barbarian) ───────────────────────────────────────
    // Flat bonus to melee STR weapon attacks: +2/+3/+4 by level.
    // NOT doubled on crit (flat bonus, not dice).
    if (sourceLower.includes("rage")) {
      if (!findFeature(player, "rage")) continue;
      const bonus = rageBonusByLevel(player.level);
      results.push(
        rollExtraDice("Rage", "0d0", bonus, "melee", false),
      );
      continue;
    }

    // ── Hunter's Mark (Ranger/other spell) ────────────────────────────
    // 1d6 extra damage per hit while concentrating on the spell.
    if (sourceLower.includes("hunter's mark") || sourceLower.includes("hunters mark")) {
      results.push(
        rollExtraDice("Hunter's Mark", "1d6", 0, "weapon", isCrit),
      );
      continue;
    }

    // ── Hex (Warlock spell) ───────────────────────────────────────────
    // 1d6 necrotic per hit while concentrating on the spell.
    if (sourceLower.includes("hex")) {
      results.push(
        rollExtraDice("Hex", "1d6", 0, "necrotic", isCrit),
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

    // ── Dueling (Fighting Style) ──────────────────────────────────────
    // +2 damage when wielding a one-handed melee weapon in one hand.
    // NOT doubled on crit (flat bonus).
    if (sourceLower.includes("dueling")) {
      if (!findFeature(player, "dueling")) continue;
      results.push(
        rollExtraDice("Dueling", "0d0", 2, "weapon", false),
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
  // Find weapon in player's weaponDamage
  const weaponEntry = Object.entries(player.weaponDamage).find(([name]) =>
    fuzzyMatch(name, input.weapon),
  );
  if (!weaponEntry) {
    return markImpossible(`Weapon "${input.weapon}" not found in inventory`);
  }
  const [weaponName, weaponStat] = weaponEntry;

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
    weaponStat.stat,
    player.stats,
  );
  const proficient = isWeaponProficient(
    weaponName,
    player.weaponProficiencies ?? [],
  );
  const profBonus = proficient ? getProficiencyBonus(player.level) : 0;
  const weaponBonus = weaponStat.bonus;
  const totalMod = abilityMod + profBonus + weaponBonus;
  const total = d20 + totalMod;

  // Build components string
  const parts: string[] = [`${abilityLabel} ${formatModifier(abilityMod)}`];
  if (proficient) parts.push(`Prof ${formatModifier(profBonus)}`);
  if (weaponBonus !== 0) parts.push(`Bonus ${formatModifier(weaponBonus)}`);
  const components = `${parts.join(", ")} = ${formatModifier(totalMod)}`;

  // Determine hit/miss (nat 1 = auto-miss, nat 20 = auto-hit)
  const hit = isNat1 ? false : isNat20 ? true : total >= target.ac;

  // Roll damage on hit
  let damage: ParsedRollResult["damage"] = undefined;
  if (hit) {
    const breakdown: DamageBreakdown[] = [];

    // Weapon damage (crit doubles dice count, not flat bonus)
    let diceExpr = weaponStat.dice;
    if (isNat20) {
      const dm = diceExpr.match(/^(\d+)(d\d+)$/i);
      if (dm) diceExpr = `${parseInt(dm[1]) * 2}${dm[2]}`;
    }
    const weaponRoll = rollDice(diceExpr);
    const flatBonus = abilityMod + weaponBonus;
    breakdown.push({
      label: weaponName,
      dice: diceExpr,
      rolls: weaponRoll.rolls,
      flatBonus,
      subtotal: weaponRoll.total + flatBonus,
      damageType: "piercing", // default; could be enriched with weapon type data
    });

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

  // Check for Jack of All Trades (half proficiency on non-proficient checks)
  const hasJackOfAllTrades =
    !isProficient &&
    player.features.some((f) => f.name.toLowerCase() === "jack of all trades");

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
  } else if (hasJackOfAllTrades) {
    const halfProf = Math.floor(profBonus / 2);
    skillMod += halfProf;
    parts.push(`Jack of All Trades ${formatModifier(halfProf)}`);
  }

  const total = d20 + skillMod;
  const components = `${parts.join(", ")} = ${formatModifier(skillMod)}`;
  const success = total >= input.dc;

  return {
    checkType: `${input.skill.charAt(0).toUpperCase() + input.skill.slice(1)} Check`,
    components,
    dieResult: d20,
    totalModifier: formatModifier(skillMod),
    total,
    dcOrAc: `${input.dc}`,
    success,
    notes: success ? "Check succeeds" : "Check fails",
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
  const isProficient = player.savingThrowProficiencies.some(
    (s) => s.toLowerCase() === abilityLower,
  );

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
