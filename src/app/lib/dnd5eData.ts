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
