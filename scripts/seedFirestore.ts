/**
 * seedFirestore.ts
 *
 * One-time script: fetches D&D 5e SRD data from the Open5e v2 API and writes it
 * to Firestore. Run with:
 *
 *   npm run seed
 *
 * Prerequisites:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY env var containing service account JSON string
 *
 * Collections seeded:
 *   srdRaces/{slug}             (v2 species, srd-2014)
 *   srdClasses/{slug}           (v2 classes, srd-2014)
 *   srdClassLevels/{slug}_{N}   (derived from v2 class features)
 *   srdSpells/{slug}            (v2 spells, srd-2014)
 *   srdEquipment/{slug}         (v2 weapons, srd-2024 — no srd-2014 weapons in v2)
 *   srdSubclassLevels/{slug}    (bundled JSON)
 *   srdConditions/{key}         (v2, srd-2014)
 *   srdBackgrounds/{key}        (v2, srd-2014)
 *   srdFeats/{key}              (v2, srd-2014)
 *   srdArmor/{key}              (v2, srd-2014)
 *   srdMonsters/{slug}          (v2 creatures, srd-2014)
 *   srdMagicItems/{slug}        (v2 magicitems, srd-2024 — no srd-2014 in v2)
 *   srdSpellLists/{classSlug}   (derived from spell classes field)
 *   srdStartingEquipment/{slug} (hardcoded SRD defaults, one per class)
 *
 * Firestore security rules must allow writes during seeding.
 * Set: allow read, write: if true;  (change before public deploy!)
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import * as admin from "firebase-admin";
import { readFileSync } from "fs";
import { join } from "path";
import { crToXP } from "../src/app/lib/gameTypes";

// ─── Firebase Admin Init ──────────────────────────────────────────────────────

admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!),
  ),
});

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// ─── Open5e v2 API helpers ──────────────────────────────────────────────────

const OPEN5E_V2 = "https://api.open5e.com/v2";

interface Open5ePage<T> {
  count: number;
  next: string | null;
  results: T[];
}

/** Fetch all pages from a v2 endpoint (no document filter). */
async function fetchAllV2<T>(path: string): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = `${OPEN5E_V2}${path}?limit=100`;

  while (url) {
    console.log(`  GET ${url}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const page: Open5ePage<T> = await res.json();
    results.push(...page.results);
    url = page.next;
  }

  return results;
}

/** Fetch all pages from a v2 endpoint filtered to a specific document. */
async function fetchAllV2Filtered<T>(path: string, documentKey: string): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = `${OPEN5E_V2}${path}?document__key=${documentKey}&limit=100`;

  while (url) {
    console.log(`  GET ${url}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const page: Open5ePage<T> = await res.json();
    results.push(...page.results);
    url = page.next;
  }

  return results;
}

/**
 * Strip the document prefix from a v2 key to get a bare slug.
 * e.g. "srd_dwarf" → "dwarf", "srd-2024_battleaxe" → "battleaxe"
 */
function stripKeyPrefix(key: string): string {
  return key.replace(/^[^_]+_/, "");
}

// ─── Lowercase normalizer ─────────────────────────────────────────────────────

/**
 * Recursively lowercase all string values in an object tree.
 * Keys listed in PRESERVE_CASE_KEYS are left untouched — these hold markdown
 * or prose descriptions whose formatting depends on original casing.
 */
const PRESERVE_CASE_KEYS = new Set([
  "description", "desc", "higherLevel",
  // Race lore sub-fields (all markdown prose)
  "age", "alignment", "sizeDescription", "speedDescription", "languageDescription",
]);

function lowercaseStrings(value: unknown, key?: string): unknown {
  if (key && PRESERVE_CASE_KEYS.has(key)) return value;
  if (typeof value === "string") return value.toLowerCase();
  if (Array.isArray(value)) return value.map((item) => lowercaseStrings(item));
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = lowercaseStrings(v, k);
    }
    return result;
  }
  return value;
}

// ─── Batch writer ─────────────────────────────────────────────────────────────

const BATCH_SIZE = 400; // Firestore max is 500 per batch

async function batchWrite(
  colPath: string,
  docs: Array<{ id: string; data: Record<string, unknown> }>,
): Promise<void> {
  console.log(`  Writing ${docs.length} docs to ${colPath}...`);
  let batch = db.batch();
  let opCount = 0;

  for (const { id, data } of docs) {
    batch.set(db.collection(colPath).doc(id), lowercaseStrings(data) as Record<string, unknown>);
    opCount++;

    if (opCount >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  }

  if (opCount > 0) await batch.commit();
}

// ─── V2 type interfaces (minimal, for the fields we actually use) ────────────

interface V2Trait {
  name: string;
  desc: string;
  type: string | null;
  order: number | null;
}

interface V2Species {
  key: string;
  name: string;
  desc: string;
  is_subspecies: boolean;
  subspecies_of: string | null;
  traits: V2Trait[];
}

interface V2GainedAt {
  level: number;
  detail: string | null;
}

interface V2ClassTableEntry {
  level: number;
  column_value: string;
}

interface V2ClassFeature {
  key: string;
  name: string;
  desc: string;
  feature_type: string;
  gained_at: V2GainedAt[];
  data_for_class_table: V2ClassTableEntry[];
}

interface V2Class {
  key: string;
  name: string;
  desc: string;
  hit_dice: string;
  caster_type: string;
  subclass_of: string | null;
  saving_throws: Array<{ name: string }>;
  features: V2ClassFeature[];
}

interface V2CastingOption {
  type: string;             // "default", "player_level_5", "slot_level_4", etc.
  damage_roll: string | null;
  target_count: number | null;
  duration: string | null;
  range: string | null;
  concentration: boolean | null;
  shape_size: number | null;
  desc: string | null;
}

interface V2Spell {
  key: string;
  name: string;
  desc: string;
  level: number;
  higher_level: string;
  school: { name: string; key: string };
  classes: Array<{ name: string; key: string }>;
  verbal: boolean;
  somatic: boolean;
  material: boolean;
  material_specified: string;
  material_cost: string | null;
  target_type: string;
  target_count: number;
  range_text: string;
  range: number;
  casting_time: string;
  ritual: boolean;
  duration: string;
  concentration: boolean;
  attack_roll: boolean;
  saving_throw_ability: string;
  damage_roll: string;
  damage_types: string[];
  casting_options: V2CastingOption[];
}

interface V2Attack {
  name: string;
  attack_type: string;
  to_hit_mod: number;
  reach: number | null;
  range: number | null;
  long_range: number | null;
  damage_die_count: number;
  damage_die_type: string;
  damage_bonus: number | null;
  damage_type: { name: string; key: string } | null;
  extra_damage_die_count: number | null;
  extra_damage_die_type: string | null;
  extra_damage_bonus: number | null;
}

interface V2CreatureAction {
  name: string;
  desc: string;
  action_type: string;
  order_in_statblock: number;
  legendary_action_cost: number;
  attacks: V2Attack[];
  usage_limits: { type: string; param: number } | null;
}

interface V2Creature {
  key: string;
  name: string;
  alignment: string;
  type: { name: string; key: string };
  size: { name: string; key: string };
  challenge_rating_decimal: string;
  challenge_rating_text: string;
  proficiency_bonus: number | null;
  experience_points: number;
  armor_class: number;
  armor_detail: string;
  hit_points: number;
  hit_dice: string;
  speed: Record<string, unknown>;
  speed_all: Record<string, unknown>;
  ability_scores: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  saving_throws: Record<string, number>;
  skill_bonuses: Record<string, number>;
  passive_perception: number;
  darkvision_range: number | null;
  blindsight_range: number | null;
  tremorsense_range: number | null;
  truesight_range: number | null;
  resistances_and_immunities: {
    damage_immunities_display: string;
    damage_resistances_display: string;
    damage_vulnerabilities_display: string;
    condition_immunities_display: string;
  };
  languages: { as_string: string };
  actions: V2CreatureAction[];
  traits: Array<{ name: string; desc: string }>;
  environments: Array<{ name: string; key: string }>;
}

interface V2Weapon {
  key: string;
  name: string;
  damage_dice: string;
  range: number;
  long_range: number;
  is_simple: boolean;
  damage_type: { name: string; key: string };
  properties: Array<{
    property: { name: string; type: string | null; desc: string };
    detail: string | null;
  }>;
}

interface V2MagicItem {
  key: string;
  name: string;
  desc: string;
  category: { name: string; key: string };
  rarity: { name: string; key: string; rank: number };
  requires_attunement: boolean;
  attunement_detail: string | null;
  weight: string;
  cost: string;
}

// ─── Race trait text parsers ─────────────────────────────────────────────────

/**
 * Parse ability score bonuses from trait description text.
 * Patterns: "Your Strength score increases by 2" / "Your X and Y scores increase by 1"
 */
function parseAbilityBonuses(traits: V2Trait[]): Record<string, number> {
  const bonuses: Record<string, number> = {};
  const abilityNames = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];

  for (const trait of traits) {
    if (!trait.name.toLowerCase().includes("ability score")) continue;
    const text = trait.desc;

    // Match individual "Your X score increases by N" patterns
    const singlePattern = /your\s+(\w+)\s+score\s+increases?\s+by\s+(\d+)/gi;
    let m;
    while ((m = singlePattern.exec(text)) !== null) {
      const ability = m[1].toLowerCase();
      if (abilityNames.includes(ability)) {
        bonuses[ability] = parseInt(m[2], 10);
      }
    }

    // Pattern for "two other ability scores of your choice each increase by 1" (Half-Elf)
    // We can't pick specific abilities here, but we note the +2 CHA is already matched above
  }

  return bonuses;
}

/** Parse walking speed from trait text. Default 30 if not found. */
function parseSpeed(traits: V2Trait[]): number {
  for (const trait of traits) {
    if (!trait.name.toLowerCase().includes("speed")) continue;
    const m = trait.desc.match(/base\s+walking\s+speed\s+is\s+(\d+)/i);
    if (m) return parseInt(m[1], 10);
    // Fallback: just find a number followed by "feet"
    const f = trait.desc.match(/(\d+)\s*feet/i);
    if (f) return parseInt(f[1], 10);
  }
  return 30;
}

/** Parse size from trait text. */
function parseSize(traits: V2Trait[]): string {
  for (const trait of traits) {
    if (!trait.name.toLowerCase().includes("size")) continue;
    const m = trait.desc.match(/\b(tiny|small|medium|large|huge|gargantuan)\b/i);
    if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  }
  return "Medium";
}

/** Parse languages from trait text. */
function parseLanguages(traits: V2Trait[]): string[] {
  for (const trait of traits) {
    if (!trait.name.toLowerCase().includes("language")) continue;
    const text = trait.desc.toLowerCase();
    // "You can speak, read, and write Common and Dwarvish"
    const m = text.match(/speak.*?(?:read.*?write\s+)?(.+)/i);
    if (m) {
      return m[1]
        .replace(/\.$/, "")
        .split(/,\s*|\s+and\s+/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && l.length < 30 && !l.includes("you ") && !l.includes("one "));
    }
  }
  return [];
}

/** Parse weapon proficiencies from racial trait text. */
function parseRacialWeaponProficiencies(traits: V2Trait[]): string[] {
  const weapons: string[] = [];
  for (const trait of traits) {
    // Look for traits like "Dwarven Combat Training", "Elf Weapon Training"
    const text = trait.desc.toLowerCase();
    const m = text.match(/proficiency\s+with\s+(?:the\s+)?(.+?)(?:\.|$)/i);
    if (m) {
      const items = m[1]
        .split(/,\s*|\s+and\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 0 && w.length < 30);
      weapons.push(...items);
    }
  }
  return weapons;
}

/** Parse skill proficiencies from racial trait text. */
function parseRacialSkillProficiencies(traits: V2Trait[]): string[] {
  const skills: string[] = [];
  for (const trait of traits) {
    const text = trait.desc.toLowerCase();
    // "You have proficiency in the Perception skill"
    const m = text.match(/proficiency\s+in\s+the\s+(\w+)\s+skill/i);
    if (m) {
      skills.push(m[1].toLowerCase());
    }
  }
  return skills;
}

/** Detect how many extra free skill choices a race grants (Half-Elf = 2). */
function parseExtraSkillChoices(traits: V2Trait[]): number {
  for (const trait of traits) {
    const text = trait.desc.toLowerCase();
    // Half-Elf: "you gain proficiency in two skills of your choice"
    const m = text.match(/proficiency\s+in\s+(\w+)\s+skills?\s+of\s+your\s+choice/i);
    if (m) {
      const numWord = m[1].toLowerCase();
      const wordToNum: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };
      return wordToNum[numWord] ?? (parseInt(numWord, 10) || 0);
    }
  }
  return 0;
}

// ─── Seeding functions ────────────────────────────────────────────────────────

async function seedRaces(): Promise<void> {
  console.log("\n── Seeding srdRaces (v2 species) ──");

  const allSpecies = await fetchAllV2Filtered<V2Species>("/species", "srd-2014");

  // Separate base races and subspecies
  const baseRaces = allSpecies.filter((s) => !s.is_subspecies);
  const subspecies = allSpecies.filter((s) => s.is_subspecies);

  const docs = baseRaces.map((race) => {
    const slug = stripKeyPrefix(race.key);

    // Merge subspecies traits into the base race
    const subTraits: V2Trait[] = [];
    for (const sub of subspecies) {
      if (sub.subspecies_of === race.key) {
        subTraits.push(...sub.traits);
      }
    }
    const allTraits = [...race.traits, ...subTraits];

    // Parse structured data from trait description text
    const abilityBonuses = parseAbilityBonuses(allTraits);
    // If subspecies added ability bonuses, merge them
    const subAbilityBonuses = parseAbilityBonuses(subTraits);
    for (const [ability, bonus] of Object.entries(subAbilityBonuses)) {
      if (!(ability in abilityBonuses)) {
        abilityBonuses[ability] = bonus;
      }
    }

    const speed = parseSpeed(allTraits);
    const size = parseSize(allTraits);
    const languages = parseLanguages(allTraits);
    const skillProficiencies = parseRacialSkillProficiencies(allTraits);
    const weaponProficiencies = parseRacialWeaponProficiencies(allTraits);
    const extraSkillChoices = parseExtraSkillChoices(allTraits);

    // Build trait list (exclude meta-traits like "Ability Score Increase", "Speed", "Size", "Languages")
    const metaTraitNames = new Set([
      "ability score increase", "speed", "size", "languages", "age", "alignment",
    ]);
    const traits = allTraits
      .filter((t) => !metaTraitNames.has(t.name.toLowerCase()))
      .map((t) => ({ name: t.name, description: t.desc }));

    // Build lore sections from dedicated traits
    const lore: Record<string, string> = {};
    if (race.desc) lore.description = race.desc;
    for (const t of allTraits) {
      const n = t.name.toLowerCase();
      if (n === "age") lore.age = t.desc;
      if (n === "alignment") lore.alignment = t.desc;
      if (n === "size" && t.desc.length > 20) lore.sizeDescription = t.desc;
      if (n === "speed") lore.speedDescription = t.desc;
      if (n === "languages") lore.languageDescription = t.desc;
    }

    return {
      id: slug,
      data: {
        slug,
        name: race.name,
        speed,
        size,
        abilityBonuses,
        traits,
        languages,
        skillProficiencies,
        extraSkillChoices,
        weaponProficiencies,
        armorProficiencies: [] as string[],
        lore,
      },
    };
  });

  await batchWrite("srdRaces", docs);
  console.log(`  ✓ ${docs.length} races seeded`);
}

/**
 * Seed classes and return the raw v2 class data for seedClassLevels() to use.
 * Filters to base classes (subclass_of === null), collects subclasses as archetypes.
 */
async function seedClasses(): Promise<V2Class[]> {
  console.log("\n── Seeding srdClasses (v2) ──");

  const allClasses = await fetchAllV2Filtered<V2Class>("/classes", "srd-2014");
  const baseClasses = allClasses.filter((c) => c.subclass_of === null);
  const subclasses = allClasses.filter((c) => c.subclass_of !== null);

  const docs = baseClasses.map((cls) => {
    const slug = stripKeyPrefix(cls.key);

    // Hit die: parse from "D12" → 12
    const hitDie = parseInt(cls.hit_dice.replace(/\D/g, ""), 10) || 8;

    // Saving throws from structured array
    const savingThrows = cls.saving_throws.map((s) => s.name);

    // Find the PROFICIENCIES feature to extract skill/weapon/armor profs
    const profFeature = cls.features.find((f) => f.feature_type === "PROFICIENCIES");
    const profDesc = profFeature?.desc ?? "";

    // Extract skill choices count and options
    const choiceMatch = profDesc.match(/choose\s+(?:any\s+)?(\w+)/i);
    let skillChoices = 2;
    if (choiceMatch) {
      const wordToNum: Record<string, number> = {
        one: 1, two: 2, three: 3, four: 4, five: 5, any: 2,
      };
      skillChoices = wordToNum[choiceMatch[1].toLowerCase()] ?? (parseInt(choiceMatch[1], 10) || 2);
    }

    // Extract skill options from the proficiencies description
    // Pattern: "Choose N from ..." or "**Skills:** Choose two from ..."
    const skillsSection = profDesc.match(/\*\*Skills:?\*\*\s*(.*?)(?:\n\n|\*\*|$)/is)?.[1] ?? profDesc;
    const afterFrom = skillsSection.replace(/^.*?(?:from|following[^:]*:?)/i, "");
    const skillOptions: string[] = afterFrom
      .split(/,\s*|\s+and\s+/)
      .map((s: string) =>
        s.replace(/\band\b/i, "").replace(/\.$/, "").replace(/\*\*/g, "").trim(),
      )
      .filter((s: string) => s.length > 0 && s.length < 30 && /^[A-Z]/.test(s));

    // Weapon and armor proficiencies from the proficiencies feature desc
    const weaponProficiencies = extractProficiencies(profDesc, "weapons");
    const armorProficiencies = extractProficiencies(profDesc, "armor");

    // Archetypes from subclasses
    const archetypes = subclasses
      .filter((sc) => sc.subclass_of === cls.key)
      .map((sc) => ({
        slug: stripKeyPrefix(sc.key),
        name: sc.name,
        description: sc.desc ?? "",
      }));

    // Archetype level: find the feature that matches the subclass concept name
    // Each class has a feature like "Primal Path", "Arcane Tradition", etc.
    // whose gained_at level indicates when the archetype is chosen
    let archetypeLevel = 3; // default
    const subtypeFeatureNames = [
      "primal path", "arcane tradition", "divine domain", "druid circle",
      "martial archetype", "monastic tradition", "sacred oath", "ranger archetype",
      "roguish archetype", "sorcerous origin", "otherworldly patron", "school of",
      "ranger conclave", "patron",
    ];
    for (const feature of cls.features) {
      const fName = feature.name.toLowerCase();
      if (subtypeFeatureNames.some((n) => fName.includes(n)) && feature.gained_at.length > 0) {
        archetypeLevel = feature.gained_at[0].level;
        break;
      }
    }

    // Spellcasting type derivation
    const hasSpellsKnown = cls.features.some(
      (f) => f.name.toLowerCase().includes("spells known") && f.data_for_class_table.length > 0,
    );
    const hasSpellSlotFeature = cls.features.some(
      (f) => /^(1st|2nd|3rd|[4-9]th)\b/i.test(f.name) && f.data_for_class_table.length > 0,
    );
    const hasCantrips = cls.features.some(
      (f) => f.name.toLowerCase().includes("cantrips") && f.data_for_class_table.length > 0,
    );
    const spellcastingType: "known" | "prepared" | "none" =
      hasSpellsKnown ? "known"
      : (hasSpellSlotFeature || hasCantrips) ? "prepared"
      : "none";

    // Spellcasting ability: parse from "Spellcasting" feature desc
    let spellcastingAbility = "";
    const spellcastingFeature = cls.features.find(
      (f) => f.name.toLowerCase() === "spellcasting" || f.name.toLowerCase() === "pact magic",
    );
    if (spellcastingFeature) {
      const abilityMatch = spellcastingFeature.desc.match(
        /(\w+)\s+is\s+your\s+spellcasting\s+ability/i,
      );
      if (abilityMatch) spellcastingAbility = abilityMatch[1];
    }

    // Description: the class desc field
    const description = cls.desc || "";

    return {
      id: slug,
      data: {
        slug,
        name: cls.name,
        hitDie,
        savingThrows,
        skillChoices,
        skillOptions,
        primaryAbility: "",
        archetypes,
        archetypeLevel,
        spellcastingType,
        spellcastingAbility,
        weaponProficiencies,
        armorProficiencies,
        description,
      },
    };
  });

  await batchWrite("srdClasses", docs);
  console.log(`  ✓ ${docs.length} classes seeded`);

  return baseClasses;
}

/** Extract weapon or armor proficiencies from the proficiencies feature desc text. */
function extractProficiencies(desc: string, type: "weapons" | "armor"): string[] {
  // Find the **Armor:** or **Weapons:** section
  const sectionLabel = type === "armor" ? "Armor" : "Weapons";
  const pattern = new RegExp(`\\*\\*${sectionLabel}:?\\*\\*\\s*(.*?)(?:\\n|\\*\\*|$)`, "is");
  const m = desc.match(pattern);
  if (!m) return [];

  const text = m[1].trim();
  if (/^none$/i.test(text)) return [];

  return text
    .split(/,\s*/)
    .map((s) => s.replace(/\.$/, "").replace(/\*\*/g, "").trim())
    .filter((s) => s.length > 0 && s.length < 40);
}

/**
 * Derive class level data from v2 class features.
 * Each class gets 20 level documents with features, spell slots, etc.
 */
async function seedClassLevels(classData: V2Class[]): Promise<void> {
  console.log("\n── Seeding srdClassLevels (from v2 class features) ──");

  const docs: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (const cls of classData) {
    const classSlug = stripKeyPrefix(cls.key);

    // Build a map of level → features from CLASS_LEVEL_FEATURE type
    const levelFeatures = new Map<number, Array<{ name: string; description: string; level: number }>>();
    for (let lvl = 1; lvl <= 20; lvl++) levelFeatures.set(lvl, []);

    for (const feature of cls.features) {
      if (feature.feature_type !== "CLASS_LEVEL_FEATURE") continue;
      for (const gained of feature.gained_at) {
        const lvl = gained.level;
        if (lvl >= 1 && lvl <= 20) {
          levelFeatures.get(lvl)!.push({
            name: feature.name,
            description: feature.desc,
            level: lvl,
          });
        }
      }
    }

    // Extract spell slot data from features named "1st", "2nd", "3rd", etc.
    const spellSlotsByLevel = new Map<number, Record<string, number>>();
    for (const feature of cls.features) {
      const slotMatch = feature.name.match(/^(\d+)(?:st|nd|rd|th)$/i);
      if (!slotMatch || feature.data_for_class_table.length === 0) continue;
      const spellLevel = slotMatch[1];

      for (const entry of feature.data_for_class_table) {
        const classLevel = entry.level;
        const value = parseInt(entry.column_value, 10);
        if (isNaN(value) || value <= 0) continue;

        if (!spellSlotsByLevel.has(classLevel)) spellSlotsByLevel.set(classLevel, {});
        spellSlotsByLevel.get(classLevel)![spellLevel] = value;
      }
    }

    // Cantrips Known and Spells Known from features
    const cantripsMap = new Map<number, number>();
    const spellsKnownMap = new Map<number, number>();

    for (const feature of cls.features) {
      const isCantrips = feature.name.toLowerCase().includes("cantrips known")
        || feature.name.toLowerCase() === "cantrips";
      const isSpellsKnown = feature.name.toLowerCase().includes("spells known");

      if (!isCantrips && !isSpellsKnown) continue;

      for (const entry of feature.data_for_class_table) {
        const value = parseInt(entry.column_value, 10);
        if (isNaN(value) || value <= 0) continue;

        if (isCantrips) cantripsMap.set(entry.level, value);
        if (isSpellsKnown) spellsKnownMap.set(entry.level, value);
      }
    }

    for (let level = 1; level <= 20; level++) {
      const proficiencyBonus = Math.ceil(level / 4) + 1;
      const features = levelFeatures.get(level) ?? [];
      const spellSlots = spellSlotsByLevel.get(level);
      const cantripsKnown = cantripsMap.get(level);
      const spellsKnown = spellsKnownMap.get(level);

      docs.push({
        id: `${classSlug}_${level}`,
        data: {
          classSlug,
          level,
          proficiencyBonus,
          features,
          ...(spellSlots && Object.keys(spellSlots).length > 0 ? { spellSlots } : {}),
          ...(cantripsKnown != null ? { cantripsKnown } : {}),
          ...(spellsKnown != null ? { spellsKnown } : {}),
        },
      });
    }
  }

  await batchWrite("srdClassLevels", docs);
  console.log(`  ✓ ${docs.length} class levels seeded`);
}

// ─── Spell scaling helpers ────────────────────────────────────────────────────

interface ScalingEntry {
  damageRoll?: string;
  targetCount?: number;
}

/**
 * Build cantrip scaling map from casting_options.
 * Only stores the breakpoint levels where the damage/targets actually change
 * (typically levels 1, 5, 11, 17). Returns null if the spell has no cantrip scaling.
 *
 * If the API has no structured scaling, falls back to parsing higher_level text.
 */
function buildCantripScaling(
  spell: V2Spell,
  baseDamageRoll: string | undefined,
): Record<string, ScalingEntry> | null {
  if (spell.level !== 0) return null;

  const entries = spell.casting_options.filter(
    (opt) => opt.type.startsWith("player_level_"),
  );

  if (entries.length > 0) {
    // Use structured casting_options data.
    // Store level 1 as the base, then only breakpoints where values change.
    const result: Record<string, ScalingEntry> = {};

    // Add base level entry
    if (baseDamageRoll) {
      result["1"] = { damageRoll: baseDamageRoll };
    }

    let prevDamageRoll = baseDamageRoll;
    let prevTargetCount: number | undefined;

    // Sort by level ascending
    const sorted = entries
      .map((opt) => ({
        level: parseInt(opt.type.replace("player_level_", ""), 10),
        damageRoll: opt.damage_roll || undefined,
        targetCount: opt.target_count ?? undefined,
      }))
      .sort((a, b) => a.level - b.level);

    for (const entry of sorted) {
      // Treat undefined as "no change" — only compare when the entry has a value
      const dmgChanged = entry.damageRoll != null && entry.damageRoll !== prevDamageRoll;
      const tgtChanged = entry.targetCount != null && entry.targetCount !== prevTargetCount;
      if (dmgChanged || tgtChanged) {
        const val: ScalingEntry = {};
        if (entry.damageRoll) val.damageRoll = entry.damageRoll;
        if (entry.targetCount != null) val.targetCount = entry.targetCount;
        result[String(entry.level)] = val;
        if (entry.damageRoll != null) prevDamageRoll = entry.damageRoll;
        if (entry.targetCount != null) prevTargetCount = entry.targetCount;
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  // Fallback: parse higher_level or desc text for cantrip scaling.
  // Pattern: "increases by NdS when you reach 5th level (XdS), 11th level (YdS), and 17th level (ZdS)"
  const textSource = spell.higher_level || spell.desc;
  const pattern = /(\d+)(?:st|nd|rd|th)\s+level\s+\((\d+d\d+)\)/gi;
  const result: Record<string, ScalingEntry> = {};

  if (baseDamageRoll) {
    result["1"] = { damageRoll: baseDamageRoll };
  }

  let m;
  while ((m = pattern.exec(textSource)) !== null) {
    result[m[1]] = { damageRoll: m[2] };
  }

  return Object.keys(result).length > 1 ? result : null;
}

/**
 * Build upcast scaling map from casting_options for leveled spells.
 * Maps slot level (as string) → overridden values. Returns null if no upcast data.
 *
 * Falls back to parsing higher_level text for spells with no structured data.
 */
function buildUpcastScaling(spell: V2Spell): Record<string, ScalingEntry> | null {
  if (spell.level === 0) return null;

  const entries = spell.casting_options.filter(
    (opt) => opt.type.startsWith("slot_level_"),
  );

  if (entries.length > 0) {
    const result: Record<string, ScalingEntry> = {};

    for (const opt of entries) {
      const slotLevel = opt.type.replace("slot_level_", "");
      const val: ScalingEntry = {};
      if (opt.damage_roll) val.damageRoll = opt.damage_roll;
      if (opt.target_count != null) val.targetCount = opt.target_count;
      if (val.damageRoll || val.targetCount != null) {
        result[slotLevel] = val;
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  // Fallback: parse higher_level text for simple "+NdS per slot level above Nth" patterns
  if (!spell.higher_level) return null;
  const text = spell.higher_level;

  // Pattern: "the damage increases by NdS for each slot level above Nth"
  const perSlotMatch = text.match(
    /increases?\s+by\s+(\d+d\d+)\s+for\s+each\s+slot\s+level\s+above\s+(\d+)/i,
  );
  if (perSlotMatch && spell.damage_roll) {
    const [, bonusDice, aboveLevel] = perSlotMatch;
    const baseDieMatch = spell.damage_roll.match(/(\d+)d(\d+)/);
    const bonusDieMatch = bonusDice.match(/(\d+)d(\d+)/);
    if (baseDieMatch && bonusDieMatch && baseDieMatch[2] === bonusDieMatch[2]) {
      const baseCount = parseInt(baseDieMatch[1], 10);
      const bonusCount = parseInt(bonusDieMatch[1], 10);
      const dieSides = baseDieMatch[2];
      const baseSlot = parseInt(aboveLevel, 10);
      const result: Record<string, ScalingEntry> = {};
      for (let slot = baseSlot + 1; slot <= 9; slot++) {
        const totalDice = baseCount + bonusCount * (slot - baseSlot);
        result[String(slot)] = { damageRoll: `${totalDice}d${dieSides}` };
      }
      return Object.keys(result).length > 0 ? result : null;
    }
  }

  return null;
}

/**
 * Seed spells and return the transformed docs for seedSpellLists() to use.
 */
async function seedSpells(): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  console.log("\n── Seeding srdSpells (v2) ──");

  const raw = await fetchAllV2Filtered<V2Spell>("/spells", "srd-2014");

  const docs = raw.map((s) => {
    const slug = stripKeyPrefix(s.key);

    // Build components string from booleans (matching v1 format: "V, S, M")
    const componentParts: string[] = [];
    if (s.verbal) componentParts.push("V");
    if (s.somatic) componentParts.push("S");
    if (s.material) componentParts.push("M");
    let components = componentParts.join(", ");
    if (s.material && s.material_specified) {
      components += ` (${s.material_specified})`;
    }

    // Classes: strip prefix from each class key
    const classes = s.classes.map((c) => stripKeyPrefix(c.key));

    // v2 API leaves damage_roll empty for save-based spells.
    // Derive base damage from casting_options scaling data (e.g. 2d6 at level 5 → base 1d6).
    let damageRoll = s.damage_roll || undefined;
    let damageTypes = s.damage_types.length > 0 ? s.damage_types : undefined;
    if (!damageRoll) {
      const firstScaling = s.casting_options
        .filter((opt) => opt.damage_roll && opt.type.startsWith("player_level_"))
        .sort((a, b) => {
          const lvlA = parseInt(a.type.replace("player_level_", ""), 10);
          const lvlB = parseInt(b.type.replace("player_level_", ""), 10);
          return lvlA - lvlB;
        })[0];
      if (firstScaling?.damage_roll) {
        // Cantrip scaling adds 1 die at level 5, so subtract 1 from the count to get the base
        const dieMatch = firstScaling.damage_roll.match(/(\d+)(d\d+)/i);
        if (dieMatch) {
          const baseCount = Math.max(1, parseInt(dieMatch[1], 10) - 1);
          damageRoll = `${baseCount}${dieMatch[2]}`;
        }
      }
    }
    // Damage type fallback: parse from description if structured field is empty
    if (!damageTypes && damageRoll && s.desc) {
      const typeMatch = s.desc.match(/\d+d\d+\s+(\w+)\s+damage/i);
      if (typeMatch) damageTypes = [typeMatch[1].toLowerCase()];
    }

    // Extract scaling data from casting_options.
    // Cantrips scale with player level (type: "player_level_N").
    // Leveled spells scale with slot level (type: "slot_level_N").
    // We store only the breakpoint levels where values actually change.
    const cantripScaling = buildCantripScaling(s, damageRoll);
    const upcastScaling = buildUpcastScaling(s);

    return {
      id: slug,
      data: {
        slug,
        name: s.name,
        level: s.level,
        school: s.school.name.toLowerCase(),
        castingTime: s.casting_time,
        range: s.range_text || `${s.range} feet`,
        components,
        duration: s.duration,
        concentration: s.concentration,
        ritual: s.ritual,
        description: s.desc,
        higherLevel: s.higher_level ?? "",
        classes,
        // New structured fields from v2
        damageRoll,
        damageTypes,
        savingThrowAbility: s.saving_throw_ability || undefined,
        attackRoll: s.attack_roll || undefined,
        targetType: s.target_type || undefined,
        targetCount: s.target_count || undefined,
        verbal: s.verbal,
        somatic: s.somatic,
        material: s.material,
        materialSpecified: s.material_specified || undefined,
        rangeNumeric: s.range || undefined,
        // Scaling data (only present on spells that scale)
        cantripScaling: cantripScaling || undefined,
        upcastScaling: upcastScaling || undefined,
      },
    };
  });

  await batchWrite("srdSpells", docs);
  console.log(`  ✓ ${docs.length} spells seeded`);

  return docs;
}

/**
 * Derive spell lists from the classes field on each spell document.
 * No separate API call needed — we group spells by class.
 */
async function seedSpellLists(
  spellDocs: Array<{ id: string; data: Record<string, unknown> }>,
): Promise<void> {
  console.log("\n── Seeding srdSpellLists (derived from spell classes) ──");

  // Group spell slugs by class
  const classSpells = new Map<string, string[]>();

  for (const spell of spellDocs) {
    const classes = spell.data.classes as string[];
    for (const classSlug of classes) {
      if (!classSpells.has(classSlug)) classSpells.set(classSlug, []);
      classSpells.get(classSlug)!.push(spell.id);
    }
  }

  const docs = Array.from(classSpells.entries()).map(([classSlug, spells]) => ({
    id: classSlug,
    data: {
      slug: classSlug,
      name: classSlug,
      spells: spells.sort(),
    },
  }));

  await batchWrite("srdSpellLists", docs);
  console.log(`  ✓ ${docs.length} spell lists seeded`);
}

async function seedEquipment(): Promise<void> {
  console.log("\n── Seeding srdEquipment (v2 weapons, srd-2024) ──");
  // Note: srd-2014 weapons don't exist in v2, so we use srd-2024
  const raw = await fetchAllV2Filtered<V2Weapon>("/weapons", "srd-2024");

  const docs = raw.map((w) => {
    const slug = stripKeyPrefix(w.key);

    // Build category string: "Simple Melee Weapons", "Martial Ranged Weapons", etc.
    const simpleOrMartial = w.is_simple ? "Simple" : "Martial";
    const meleeOrRanged = (w.range > 0 || w.long_range > 0) ? "Ranged" : "Melee";
    const category = `${simpleOrMartial} ${meleeOrRanged} Weapons`;

    // Flatten properties to string array matching v1 format
    const properties = w.properties.map((p) => {
      if (p.detail) return `${p.property.name} (${p.detail})`;
      return p.property.name;
    });

    return {
      id: slug,
      data: {
        slug,
        name: w.name,
        category,
        damageDice: w.damage_dice,
        damageType: w.damage_type.name.toLowerCase(),
        properties,
        // New v2 fields
        range: w.range || undefined,
        longRange: w.long_range || undefined,
        isSimple: w.is_simple,
      },
    };
  });

  await batchWrite("srdEquipment", docs);
  console.log(`  ✓ ${docs.length} equipment entries seeded`);
}

async function seedSubclassLevels(): Promise<void> {
  console.log("\n── Seeding srdSubclassLevels (bundled) ──");
  const jsonPath = join(__dirname, "data", "subclassLevels.json");
  const raw: Array<Record<string, unknown>> = JSON.parse(
    readFileSync(jsonPath, "utf-8"),
  );

  const docs = raw.map((entry) => ({
    id: entry.slug as string,
    data: entry,
  }));
  await batchWrite("srdSubclassLevels", docs);
  console.log(`  ✓ ${docs.length} subclass levels seeded`);
}

async function seedConditions(): Promise<void> {
  console.log("\n── Seeding srdConditions (v2, srd-2014) ──");
  const raw = await fetchAllV2Filtered<Record<string, unknown>>("/conditions", "srd-2014");
  const docs = raw.map((c) => {
    const key = stripKeyPrefix(c.key as string);
    const descriptions = Array.isArray(c.descriptions)
      ? (c.descriptions as Array<{ desc: string }>).map((d) => d.desc).join("\n\n")
      : (c.desc as string) ?? "";
    return {
      id: key,
      data: {
        slug: key,
        name: c.name,
        description: descriptions,
      },
    };
  });
  await batchWrite("srdConditions", docs);
  console.log(`  ✓ ${docs.length} conditions seeded`);
}

async function seedBackgrounds(): Promise<void> {
  console.log("\n── Seeding srdBackgrounds (v2, srd-2014) ──");
  const raw = await fetchAllV2Filtered<Record<string, unknown>>("/backgrounds", "srd-2014");
  const docs = raw.map((b) => {
    const key = stripKeyPrefix(b.key as string);
    const benefits = Array.isArray(b.benefits) ? b.benefits : [];
    return {
      id: key,
      data: {
        slug: key,
        name: b.name,
        description: b.desc ?? "",
        benefits,
      },
    };
  });
  await batchWrite("srdBackgrounds", docs);
  console.log(`  ✓ ${docs.length} backgrounds seeded`);
}

async function seedFeats(): Promise<void> {
  console.log("\n── Seeding srdFeats (v2, srd-2014) ──");
  const raw = await fetchAllV2Filtered<Record<string, unknown>>("/feats", "srd-2014");
  const docs = raw.map((f) => {
    const key = stripKeyPrefix(f.key as string);
    const benefits = Array.isArray(f.benefits) ? f.benefits : [];
    return {
      id: key,
      data: {
        slug: key,
        name: f.name,
        description: f.desc ?? "",
        prerequisite: f.prerequisite ?? "",
        benefits,
      },
    };
  });
  await batchWrite("srdFeats", docs);
  console.log(`  ✓ ${docs.length} feats seeded`);
}

async function seedArmor(): Promise<void> {
  console.log("\n── Seeding srdArmor (v2, srd-2014) ──");
  const raw = await fetchAllV2Filtered<Record<string, unknown>>("/armor", "srd-2014");
  const docs = raw.map((a) => {
    const key = stripKeyPrefix(a.key as string);
    return {
      id: key,
      data: {
        slug: key,
        name: a.name,
        category: a.category ?? "",
        acBase: a.ac_base ?? 10,
        acAddDexMod: a.ac_add_dexmod ?? false,
        acCapDexMod: a.ac_cap_dexmod ?? null,
        stealthDisadvantage: a.grants_stealth_disadvantage ?? false,
        strengthRequired: a.strength_score_required ?? 0,
        acDisplay: a.ac_display ?? "",
        cost: a.cost ?? "",
        weight: a.weight ?? "",
      },
    };
  });
  await batchWrite("srdArmor", docs);
  console.log(`  ✓ ${docs.length} armor entries seeded`);
}

async function seedMonsters(): Promise<void> {
  console.log("\n── Seeding srdMonsters (v2 creatures) ──");
  const raw = await fetchAllV2Filtered<V2Creature>("/creatures", "srd-2014");

  const docs = raw.map((m) => {
    const slug = stripKeyPrefix(m.key);

    // Parse CR as number for crToXP fallback
    const crText = m.challenge_rating_text ?? m.challenge_rating_decimal;
    const xp = m.experience_points || crToXP(crText);

    // Build speed object matching v1 format (simple walk speed object)
    const speed = m.speed_all ?? m.speed ?? {};

    // Build senses string from range fields
    const sensesParts: string[] = [];
    if (m.darkvision_range) sensesParts.push(`darkvision ${m.darkvision_range} ft.`);
    if (m.blindsight_range) sensesParts.push(`blindsight ${m.blindsight_range} ft.`);
    if (m.tremorsense_range) sensesParts.push(`tremorsense ${m.tremorsense_range} ft.`);
    if (m.truesight_range) sensesParts.push(`truesight ${m.truesight_range} ft.`);
    if (m.passive_perception) sensesParts.push(`passive Perception ${m.passive_perception}`);
    const senses = sensesParts.join(", ");

    // Actions: separate by type and flatten attack data for npcAgent compatibility
    const regularActions: Record<string, unknown>[] = [];
    const legendaryActions: Record<string, unknown>[] = [];
    const reactions: Record<string, unknown>[] = [];

    for (const action of m.actions) {
      // Flatten attack data onto the action object for npcAgent compatibility.
      // npcAgent reads: actions[0].attack_bonus, actions[0].damage_dice, actions[0].damage_bonus
      const firstAttack = action.attacks[0];
      const flatAction: Record<string, unknown> = {
        name: action.name,
        desc: action.desc,
      };

      if (firstAttack) {
        flatAction.attack_bonus = firstAttack.to_hit_mod;
        const dieCount = firstAttack.damage_die_count || 1;
        const dieType = firstAttack.damage_die_type || "d4";
        flatAction.damage_dice = `${dieCount}${dieType.toLowerCase().startsWith("d") ? dieType.toLowerCase() : `d${dieType}`}`;
        flatAction.damage_bonus = firstAttack.damage_bonus ?? 0;
        flatAction.damage_type = firstAttack.damage_type?.name ?? "";
      }

      if (action.action_type === "LEGENDARY_ACTION") {
        flatAction.cost = action.legendary_action_cost;
        legendaryActions.push(flatAction);
      } else if (action.action_type === "REACTION") {
        reactions.push(flatAction);
      } else {
        regularActions.push(flatAction);
      }
    }

    return {
      id: slug,
      data: {
        slug,
        name: m.name,
        size: m.size.name,
        type: m.type.name,
        alignment: m.alignment,
        armorClass: m.armor_class,
        hitPoints: m.hit_points,
        hitDice: m.hit_dice,
        speed,
        // Flatten ability scores to top-level fields (v1 compat)
        strength: m.ability_scores.strength,
        dexterity: m.ability_scores.dexterity,
        constitution: m.ability_scores.constitution,
        intelligence: m.ability_scores.intelligence,
        wisdom: m.ability_scores.wisdom,
        charisma: m.ability_scores.charisma,
        challengeRating: crText,
        xp,
        senses,
        languages: m.languages?.as_string ?? "",
        specialAbilities: m.traits ?? [],
        actions: regularActions,
        legendaryActions,
        reactions,
        // New v2 fields
        armorDetail: m.armor_detail || undefined,
        savingThrows: Object.keys(m.saving_throws ?? {}).length > 0 ? m.saving_throws : undefined,
        skillBonuses: Object.keys(m.skill_bonuses ?? {}).length > 0 ? m.skill_bonuses : undefined,
        damageResistances: m.resistances_and_immunities?.damage_resistances_display || undefined,
        damageImmunities: m.resistances_and_immunities?.damage_immunities_display || undefined,
        conditionImmunities: m.resistances_and_immunities?.condition_immunities_display || undefined,
        environments: m.environments?.map((e) => e.name) ?? [],
        proficiencyBonus: m.proficiency_bonus || undefined,
      },
    };
  });

  await batchWrite("srdMonsters", docs);
  console.log(`  ✓ ${docs.length} monsters seeded`);
}

async function seedMagicItems(): Promise<void> {
  console.log("\n── Seeding srdMagicItems (v2, srd-2024) ──");
  // Note: srd-2014 magic items don't exist in v2, so we use srd-2024
  const raw = await fetchAllV2Filtered<V2MagicItem>("/magicitems", "srd-2024");

  const docs = raw.map((i) => {
    const slug = stripKeyPrefix(i.key);
    return {
      id: slug,
      data: {
        slug,
        name: i.name,
        type: i.category?.name ?? "",
        rarity: i.rarity?.name ?? "",
        requiresAttunement: i.requires_attunement,
        description: i.desc ?? "",
        // New v2 fields
        rarityRank: i.rarity?.rank ?? undefined,
        attunementDetail: i.attunement_detail || undefined,
        weight: i.weight || undefined,
        cost: i.cost || undefined,
      },
    };
  });

  await batchWrite("srdMagicItems", docs);
  console.log(`  ✓ ${docs.length} magic items seeded`);
}

// ─── Starting Equipment ───────────────────────────────────────────────────────

async function seedStartingEquipment(): Promise<void> {
  console.log("\n── Seeding srdStartingEquipment ──");

  const docs = [
    {
      id: "barbarian",
      data: {
        slug: "barbarian",
        inventory: ["greataxe", "handaxe", "handaxe", "explorer's pack"],
        weaponDamage: {
          greataxe: { dice: "1d12", stat: "str", bonus: 0, range: { type: "melee", reach: 5 } },
          handaxe: { dice: "1d6", stat: "str", bonus: 0, range: { type: "both", reach: 5, shortRange: 20, longRange: 60 } },
        },
        gold: 10,
      },
    },
    {
      id: "bard",
      data: {
        slug: "bard",
        inventory: ["rapier", "dagger", "lute", "leather armor", "entertainer's pack"],
        weaponDamage: {
          rapier: { dice: "1d8", stat: "finesse", bonus: 0, range: { type: "melee", reach: 5 } },
          dagger: { dice: "1d4", stat: "finesse", bonus: 0, range: { type: "both", reach: 5, shortRange: 20, longRange: 60 } },
        },
        gold: 10,
      },
    },
    {
      id: "cleric",
      data: {
        slug: "cleric",
        inventory: ["mace", "scale mail", "shield", "light crossbow", "bolts (20)", "priest's pack", "holy symbol"],
        weaponDamage: {
          mace: { dice: "1d6", stat: "str", bonus: 0, range: { type: "melee", reach: 5 } },
          "light crossbow": { dice: "1d8", stat: "dex", bonus: 0, range: { type: "ranged", shortRange: 80, longRange: 320 } },
        },
        gold: 10,
      },
    },
    {
      id: "druid",
      data: {
        slug: "druid",
        inventory: ["wooden shield", "scimitar", "leather armor", "explorer's pack", "druidic focus"],
        weaponDamage: {
          scimitar: { dice: "1d6", stat: "finesse", bonus: 0, range: { type: "melee", reach: 5 } },
        },
        gold: 10,
      },
    },
    {
      id: "fighter",
      data: {
        slug: "fighter",
        inventory: ["chain mail", "longsword", "shield", "light crossbow", "bolts (20)", "dungeoneer's pack"],
        weaponDamage: {
          longsword: { dice: "1d8", stat: "str", bonus: 0, range: { type: "melee", reach: 5 } },
          "light crossbow": { dice: "1d8", stat: "dex", bonus: 0, range: { type: "ranged", shortRange: 80, longRange: 320 } },
        },
        gold: 10,
      },
    },
    {
      id: "monk",
      data: {
        slug: "monk",
        inventory: ["shortsword", "dart x10", "explorer's pack"],
        weaponDamage: {
          shortsword: { dice: "1d6", stat: "finesse", bonus: 0, range: { type: "melee", reach: 5 } },
          dart: { dice: "1d4", stat: "finesse", bonus: 0, range: { type: "ranged", shortRange: 20, longRange: 60 } },
        },
        gold: 5,
      },
    },
    {
      id: "paladin",
      data: {
        slug: "paladin",
        inventory: ["longsword", "shield", "chain mail", "javelin x5", "priest's pack", "holy symbol"],
        weaponDamage: {
          longsword: { dice: "1d8", stat: "str", bonus: 0, range: { type: "melee", reach: 5 } },
          javelin: { dice: "1d6", stat: "str", bonus: 0, range: { type: "both", reach: 5, shortRange: 30, longRange: 120 } },
        },
        gold: 10,
      },
    },
    {
      id: "ranger",
      data: {
        slug: "ranger",
        inventory: ["scale mail", "shortsword", "shortsword", "longbow", "arrows (20)", "dungeoneer's pack"],
        weaponDamage: {
          shortsword: { dice: "1d6", stat: "finesse", bonus: 0, range: { type: "melee", reach: 5 } },
          longbow: { dice: "1d8", stat: "dex", bonus: 0, range: { type: "ranged", shortRange: 150, longRange: 600 } },
        },
        gold: 10,
      },
    },
    {
      id: "rogue",
      data: {
        slug: "rogue",
        inventory: ["rapier", "shortbow", "arrows (20)", "leather armor", "dagger", "dagger", "thieves' tools", "burglar's pack"],
        weaponDamage: {
          rapier: { dice: "1d8", stat: "finesse", bonus: 0, range: { type: "melee", reach: 5 } },
          shortbow: { dice: "1d6", stat: "dex", bonus: 0, range: { type: "ranged", shortRange: 80, longRange: 320 } },
          dagger: { dice: "1d4", stat: "finesse", bonus: 0, range: { type: "both", reach: 5, shortRange: 20, longRange: 60 } },
        },
        gold: 10,
      },
    },
    {
      id: "sorcerer",
      data: {
        slug: "sorcerer",
        inventory: ["light crossbow", "bolts (20)", "arcane focus", "dungeoneer's pack", "dagger", "dagger"],
        weaponDamage: {
          "light crossbow": { dice: "1d8", stat: "dex", bonus: 0, range: { type: "ranged", shortRange: 80, longRange: 320 } },
          dagger: { dice: "1d4", stat: "finesse", bonus: 0, range: { type: "both", reach: 5, shortRange: 20, longRange: 60 } },
        },
        gold: 10,
      },
    },
    {
      id: "warlock",
      data: {
        slug: "warlock",
        inventory: ["light crossbow", "bolts (20)", "arcane focus", "dungeoneer's pack", "leather armor", "dagger", "dagger"],
        weaponDamage: {
          "light crossbow": { dice: "1d8", stat: "dex", bonus: 0, range: { type: "ranged", shortRange: 80, longRange: 320 } },
          dagger: { dice: "1d4", stat: "finesse", bonus: 0, range: { type: "both", reach: 5, shortRange: 20, longRange: 60 } },
        },
        gold: 10,
      },
    },
    {
      id: "wizard",
      data: {
        slug: "wizard",
        inventory: ["quarterstaff", "arcane focus", "scholar's pack", "spellbook"],
        weaponDamage: {
          quarterstaff: { dice: "1d6", stat: "str", bonus: 0, range: { type: "melee", reach: 5 } },
        },
        gold: 10,
      },
    },
  ];

  await batchWrite("srdStartingEquipment", docs);
  console.log(`  ✓ ${docs.length} starting equipment sets seeded`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("Starting Firestore seeding from Open5e v2 API...\n");

  await seedRaces();
  const classData = await seedClasses();
  await seedClassLevels(classData);
  const spellDocs = await seedSpells();
  await seedEquipment();
  await seedSubclassLevels();
  await seedConditions();
  await seedBackgrounds();
  await seedFeats();
  await seedArmor();
  await seedMonsters();
  await seedMagicItems();
  await seedSpellLists(spellDocs);
  await seedStartingEquipment();

  console.log("\n✅ Seeding complete. Check your Firestore console.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
