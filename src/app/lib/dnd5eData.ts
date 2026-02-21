/**
 * dnd5eData.ts
 *
 * Static D&D 5e SRD reference data — skill-to-ability mapping, weapon
 * classification, and proficiency helpers. Pure data, no project imports.
 */

// ─── Skill → Ability mapping ─────────────────────────────────────────────────

export const SKILL_ABILITY_MAP: Record<string, string> = {
  acrobatics: "dexterity",
  "animal handling": "wisdom",
  arcana: "intelligence",
  athletics: "strength",
  deception: "charisma",
  history: "intelligence",
  insight: "wisdom",
  intimidation: "charisma",
  investigation: "intelligence",
  medicine: "wisdom",
  nature: "intelligence",
  perception: "wisdom",
  performance: "charisma",
  persuasion: "charisma",
  religion: "intelligence",
  "sleight of hand": "dexterity",
  stealth: "dexterity",
  survival: "wisdom",
};

// ─── Weapon sets (SRD, lowercase) ────────────────────────────────────────────

export const SIMPLE_WEAPONS = new Set([
  "club",
  "dagger",
  "greatclub",
  "handaxe",
  "javelin",
  "light hammer",
  "mace",
  "quarterstaff",
  "sickle",
  "spear",
  // Simple ranged
  "light crossbow",
  "dart",
  "shortbow",
  "sling",
]);

export const MARTIAL_WEAPONS = new Set([
  "battleaxe",
  "flail",
  "glaive",
  "greataxe",
  "greatsword",
  "halberd",
  "lance",
  "longsword",
  "maul",
  "morningstar",
  "pike",
  "rapier",
  "scimitar",
  "shortsword",
  "trident",
  "war pick",
  "warhammer",
  "whip",
  // Martial ranged
  "blowgun",
  "hand crossbow",
  "heavy crossbow",
  "longbow",
  "net",
]);

// ─── SRD Cantrip Data ────────────────────────────────────────────────────────

import type { SpellAttackType } from "./gameTypes";

export interface SRDCantripData {
  slug: string;
  damageDice: string;       // base dice at level 1 ("1d10")
  damageType: string;
  attackType: SpellAttackType;
  saveAbility?: string;     // for save-based cantrips
  scalingLevels: number[];  // levels where dice count increases [5, 11, 17]
}

export const SRD_CANTRIP_DATA: Record<string, SRDCantripData> = {
  "acid-splash":     { slug: "acid-splash",     damageDice: "1d6",  damageType: "acid",      attackType: "save", saveAbility: "dexterity", scalingLevels: [5,11,17] },
  "fire-bolt":       { slug: "fire-bolt",       damageDice: "1d10", damageType: "fire",      attackType: "ranged",  scalingLevels: [5,11,17] },
  "eldritch-blast":  { slug: "eldritch-blast",  damageDice: "1d10", damageType: "force",     attackType: "ranged",  scalingLevels: [5,11,17] },
  "ray-of-frost":    { slug: "ray-of-frost",    damageDice: "1d8",  damageType: "cold",      attackType: "ranged",  scalingLevels: [5,11,17] },
  "chill-touch":     { slug: "chill-touch",     damageDice: "1d8",  damageType: "necrotic",  attackType: "ranged",  scalingLevels: [5,11,17] },
  "shocking-grasp":  { slug: "shocking-grasp",  damageDice: "1d8",  damageType: "lightning", attackType: "melee",   scalingLevels: [5,11,17] },
  "sacred-flame":    { slug: "sacred-flame",    damageDice: "1d8",  damageType: "radiant",   attackType: "save", saveAbility: "dexterity", scalingLevels: [5,11,17] },
  "toll-the-dead":   { slug: "toll-the-dead",   damageDice: "1d8",  damageType: "necrotic",  attackType: "save", saveAbility: "wisdom",    scalingLevels: [5,11,17] },
  "vicious-mockery": { slug: "vicious-mockery", damageDice: "1d4",  damageType: "psychic",   attackType: "save", saveAbility: "wisdom",    scalingLevels: [5,11,17] },
  "poison-spray":    { slug: "poison-spray",    damageDice: "1d12", damageType: "poison",    attackType: "save", saveAbility: "constitution", scalingLevels: [5,11,17] },
  "produce-flame":   { slug: "produce-flame",   damageDice: "1d8",  damageType: "fire",      attackType: "ranged",  scalingLevels: [5,11,17] },
  "thorn-whip":      { slug: "thorn-whip",      damageDice: "1d6",  damageType: "piercing",  attackType: "melee",   scalingLevels: [5,11,17] },
  "word-of-radiance":{ slug: "word-of-radiance",damageDice: "1d6",  damageType: "radiant",   attackType: "save", saveAbility: "constitution", scalingLevels: [5,11,17] },
};

/** Scale cantrip dice by character level — dice count increases at 5th, 11th, 17th. */
export function getCantripDice(baseDice: string, level: number, scalingLevels: number[]): string {
  const m = baseDice.match(/^(\d+)(d\d+)$/i);
  if (!m) return baseDice;
  let count = parseInt(m[1]);
  for (const threshold of scalingLevels) { if (level >= threshold) count++; }
  return `${count}${m[2]}`;
}

// ─── Proficiency helper ──────────────────────────────────────────────────────

/**
 * Check if a character is proficient with a weapon.
 *
 * Matches against the proficiency list using:
 *   1. Exact match (e.g. "longsword" in proficiencies)
 *   2. Category match ("simple weapons" covers all simple, "martial weapons" covers all martial)
 *   3. Substring match for pluralised SRD entries (e.g. "longswords" matches "longsword")
 */
export function isWeaponProficient(
  weaponName: string,
  proficiencies: string[],
): boolean {
  const weapon = weaponName.toLowerCase();
  const profs = proficiencies.map((p) => p.toLowerCase());

  // Exact match
  if (profs.includes(weapon)) return true;

  // Category match
  if (profs.includes("simple weapons") && SIMPLE_WEAPONS.has(weapon)) return true;
  if (profs.includes("martial weapons") && MARTIAL_WEAPONS.has(weapon)) return true;

  // Substring match (handles plurals like "longswords" → "longsword")
  for (const prof of profs) {
    if (prof.includes(weapon) || weapon.includes(prof)) return true;
  }

  return false;
}
