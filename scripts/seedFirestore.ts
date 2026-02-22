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
import { crToXP } from "../src/app/lib/gameTypes";
import {
  RACE_OVERRIDES,
  CLASS_OVERRIDES,
  CLASS_LEVEL_OVERRIDES,
  CLASS_FEATURES_OVERRIDES,
  SUBCLASS_FEATURES_OVERRIDES,
  SPELL_OVERRIDES,
} from "./srdOverrides";
import type { ClassFeatureDef } from "./srdOverrides";

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

/** Fetch all pages from a v2 endpoint, optionally filtered to a specific document. */
async function fetchAllV2<T>(path: string, documentKey?: string): Promise<T[]> {
  const results: T[] = [];
  const params = documentKey
    ? `?document__key=${documentKey}&limit=100`
    : `?limit=100`;
  let url: string | null = `${OPEN5E_V2}${path}${params}`;

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
  "description",
  "desc",
  "higherLevel",
  // Race lore sub-fields (all markdown prose)
  "age",
  "alignment",
  "sizeDescription",
  "speedDescription",
  "languageDescription",
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
    batch.set(
      db.collection(colPath).doc(id),
      lowercaseStrings(data) as Record<string, unknown>,
    );
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
  /** v2 API returns an object { key, name, url } for subclasses, null for base classes. */
  subclass_of: { key: string; name: string; url: string } | null;
  saving_throws: Array<{ name: string }>;
  features: V2ClassFeature[];
}

interface V2CastingOption {
  type: string; // "default", "player_level_5", "slot_level_4", etc.
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

// ─── Seeding functions ────────────────────────────────────────────────────────

async function seedRaces(): Promise<void> {
  console.log("\n── Seeding srdRaces (v2 species + hardcoded overrides) ──");

  const allSpecies = await fetchAllV2<V2Species>("/species", "srd-2014");

  // Separate base races and subspecies
  const baseRaces = allSpecies.filter((s) => !s.is_subspecies);
  const subspecies = allSpecies.filter((s) => s.is_subspecies);

  const docs = baseRaces.map((race) => {
    const slug = stripKeyPrefix(race.key);

    // Merge subspecies traits into the base race (for narrative text)
    const subTraits: V2Trait[] = [];
    for (const sub of subspecies) {
      if (sub.subspecies_of === race.key) {
        subTraits.push(...sub.traits);
      }
    }
    const allTraits = [...race.traits, ...subTraits];

    // Include all traits — the UI shows them in a dedicated "Racial Traits" section
    const traits = allTraits.map((t) => ({
      name: t.name,
      description: t.desc,
    }));

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

    // Use hardcoded overrides for all mechanical data
    const override = RACE_OVERRIDES[slug];
    if (!override) {
      console.warn(`  ⚠ No override for race "${slug}" — using defaults`);
    }

    return {
      id: slug,
      data: {
        slug,
        name: race.name,
        speed: override?.speed ?? 30,
        size: override?.size ?? "medium",
        abilityBonuses: override?.abilityBonuses ?? {},
        traits,
        languages: override?.languages ?? [],
        skillProficiencies: override?.skillProficiencies ?? [],
        extraSkillChoices: override?.extraSkillChoices ?? 0,
        weaponProficiencies: override?.weaponProficiencies ?? [],
        armorProficiencies: override?.armorProficiencies ?? [],
        providedAbilities: override?.providedAbilities ?? [],
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
 * Uses hardcoded CLASS_OVERRIDES for proficiencies, skill options, and spellcasting info.
 */
async function seedClasses(): Promise<{
  baseClasses: V2Class[];
  subclasses: V2Class[];
}> {
  console.log("\n── Seeding srdClasses (v2 + hardcoded overrides) ──");

  const allClasses = await fetchAllV2<V2Class>("/classes", "srd-2014");
  const baseClasses = allClasses.filter((c) => c.subclass_of === null);
  const subclasses = allClasses.filter((c) => c.subclass_of !== null);

  const docs = baseClasses.map((cls) => {
    const slug = stripKeyPrefix(cls.key);

    // Hit die: parse from "D12" → 12
    const hitDie = parseInt(cls.hit_dice.replace(/\D/g, ""), 10) || 8;

    // Saving throws from structured API field
    const savingThrows = cls.saving_throws.map((s) => s.name);

    // Archetypes from subclasses (v2 API subclass_of is { key, name, url })
    const archetypes = subclasses
      .filter((sc) => sc.subclass_of?.key === cls.key)
      .map((sc) => ({
        slug: stripKeyPrefix(sc.key),
        name: sc.name,
        description:
          sc.desc ||
          sc.features
            .filter((f) => f.feature_type === "CLASS_LEVEL_FEATURE")
            .map((f) => `**${f.name}:** ${f.desc}`)
            .join("\n\n"),
      }));

    // Description: compose from CLASS_LEVEL_FEATURE features (v2 API has empty top-level desc)
    const description =
      cls.desc ||
      cls.features
        .filter((f) => f.feature_type === "CLASS_LEVEL_FEATURE")
        .map((f) => `### ${f.name}\n${f.desc}`)
        .join("\n\n");

    // Use hardcoded overrides for proficiencies, skills, and spellcasting
    const override = CLASS_OVERRIDES[slug];
    if (!override) {
      console.warn(`  ⚠ No override for class "${slug}" — using defaults`);
    }

    return {
      id: slug,
      data: {
        slug,
        name: cls.name,
        hitDie,
        savingThrows,
        skillChoices: override?.skillChoices ?? 2,
        skillOptions: override?.skillOptions ?? [],
        archetypes,
        archetypeLevel: override?.archetypeLevel ?? 3,
        spellcastingType: override?.spellcastingType ?? "none",
        spellcastingAbility: override?.spellcastingAbility ?? "",
        weaponProficiencies: override?.weaponProficiencies ?? [],
        armorProficiencies: override?.armorProficiencies ?? [],
        description,
        asiLevels: CLASS_FEATURES_OVERRIDES[slug]?.asiLevels ?? [
          4, 8, 12, 16, 19,
        ],
      },
    };
  });

  await batchWrite("srdClasses", docs);
  for (const d of docs) {
    const count = (d.data.archetypes as unknown[]).length;
    console.log(`    ${d.id}: ${count} archetype${count !== 1 ? "s" : ""}`);
  }
  console.log(`  ✓ ${docs.length} classes seeded`);

  return { baseClasses, subclasses };
}

/**
 * Derive class level data from v2 class features + hardcoded spell progression.
 * Features (names + descriptions) come from the API; spell slots, cantrips known,
 * and spells known come from CLASS_LEVEL_OVERRIDES for accuracy.
 */
async function seedClassLevels(classData: V2Class[]): Promise<void> {
  console.log(
    "\n── Seeding srdClassLevels (v2 features + hardcoded spell progression) ──",
  );

  const docs: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (const cls of classData) {
    const classSlug = stripKeyPrefix(cls.key);

    // Build a map of level → features from CLASS_LEVEL_FEATURE type (narrative text from API)
    const levelFeatures = new Map<
      number,
      Array<{ name: string; description: string; level: number }>
    >();
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

    // Spell progression from hardcoded overrides (replaces fragile API parsing)
    const progression = CLASS_LEVEL_OVERRIDES[classSlug];

    // Build a lookup from the feature override, keyed by "featureName:level"
    const classFeatures = CLASS_FEATURES_OVERRIDES[classSlug];
    const featureLookup = new Map<string, ClassFeatureDef>();
    if (classFeatures) {
      for (const [lvl, defs] of Object.entries(classFeatures.levels)) {
        for (const def of defs) {
          featureLookup.set(`${def.name}:${lvl}`, def);
        }
      }
    }

    for (let level = 1; level <= 20; level++) {
      const proficiencyBonus = Math.ceil(level / 4) + 1;
      const features = (levelFeatures.get(level) ?? []).map((f) => {
        const key = `${f.name.toLowerCase()}:${level}`;
        const override = featureLookup.get(key);
        return {
          ...f,
          ...(override?.type ? { type: override.type } : {}),
          ...(override?.gameplayEffects
            ? { gameplayEffects: override.gameplayEffects }
            : {}),
        };
      });

      // Build spell slots from override table, omitting zero-slot entries
      let spellSlots: Record<string, number> | undefined;
      let cantripsKnown: number | undefined;
      let spellsKnown: number | undefined;

      if (progression) {
        const slots: Record<string, number> = {};
        for (const [spellLevel, counts] of Object.entries(progression.slots)) {
          const count = counts[level - 1] ?? 0;
          if (count > 0) slots[spellLevel] = count;
        }
        if (Object.keys(slots).length > 0) spellSlots = slots;

        const cantrips = progression.cantripsKnown?.[level - 1];
        if (cantrips != null && cantrips > 0) cantripsKnown = cantrips;

        const spells = progression.spellsKnown?.[level - 1];
        if (spells != null && spells > 0) spellsKnown = spells;
      }

      docs.push({
        id: `${classSlug}_${level}`,
        data: {
          classSlug,
          level,
          proficiencyBonus,
          features,
          ...(spellSlots && Object.keys(spellSlots).length > 0
            ? { spellSlots }
            : {}),
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

  const entries = spell.casting_options.filter((opt) =>
    opt.type.startsWith("player_level_"),
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
      const dmgChanged =
        entry.damageRoll != null && entry.damageRoll !== prevDamageRoll;
      const tgtChanged =
        entry.targetCount != null && entry.targetCount !== prevTargetCount;
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
function buildUpcastScaling(
  spell: V2Spell,
): Record<string, ScalingEntry> | null {
  if (spell.level === 0) return null;

  const entries = spell.casting_options.filter((opt) =>
    opt.type.startsWith("slot_level_"),
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
async function seedSpells(): Promise<
  Array<{ id: string; data: Record<string, unknown> }>
> {
  console.log("\n── Seeding srdSpells (v2) ──");

  const raw = await fetchAllV2<V2Spell>("/spells", "srd-2014");

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
        .filter(
          (opt) => opt.damage_roll && opt.type.startsWith("player_level_"),
        )
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
        aoe: SPELL_OVERRIDES[slug]?.aoe,
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
        // Scaling data: overrides take precedence, then API-computed values
        cantripScaling: SPELL_OVERRIDES[slug]?.cantripScaling ?? cantripScaling ?? undefined,
        upcastScaling: SPELL_OVERRIDES[slug]?.upcastScaling ?? upcastScaling ?? undefined,
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
  const raw = await fetchAllV2<V2Weapon>("/weapons", "srd-2024");

  const docs = raw.map((w) => {
    const slug = stripKeyPrefix(w.key);

    // Build category string: "Simple Melee Weapons", "Martial Ranged Weapons", etc.
    const simpleOrMartial = w.is_simple ? "Simple" : "Martial";
    const meleeOrRanged = w.range > 0 || w.long_range > 0 ? "Ranged" : "Melee";
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

/**
 * Derive subclass level data from v2 subclass features + hardcoded overrides.
 * Same pattern as seedClassLevels(): features (names + descriptions) come from
 * the API; type and gameplayEffects come from SUBCLASS_FEATURES_OVERRIDES.
 */
async function seedSubclassLevels(subclasses: V2Class[]): Promise<void> {
  console.log(
    "\n── Seeding srdSubclassLevels (v2 features + hardcoded overrides) ──",
  );

  const docs: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (const sc of subclasses) {
    const subclassSlug = stripKeyPrefix(sc.key);
    const classSlug = sc.subclass_of ? stripKeyPrefix(sc.subclass_of.key) : "";

    // Group features by gained_at.level
    const levelFeatures = new Map<
      number,
      Array<{ name: string; description: string }>
    >();

    for (const feature of sc.features) {
      if (feature.feature_type !== "CLASS_LEVEL_FEATURE") continue;
      for (const gained of feature.gained_at) {
        const lvl = gained.level;
        if (lvl >= 1 && lvl <= 20) {
          if (!levelFeatures.has(lvl)) levelFeatures.set(lvl, []);
          levelFeatures.get(lvl)!.push({
            name: feature.name,
            description: feature.desc,
          });
        }
      }
    }

    // Build a lookup from the subclass feature overrides
    const overrides = SUBCLASS_FEATURES_OVERRIDES[subclassSlug];
    const featureLookup = new Map<string, ClassFeatureDef>();
    if (overrides) {
      for (const [lvl, defs] of Object.entries(overrides.levels)) {
        for (const def of defs) {
          featureLookup.set(`${def.name}:${lvl}`, def);
        }
      }
    }

    // Emit a doc per level that has features
    for (const [level, features] of Array.from(levelFeatures.entries())) {
      const enrichedFeatures = features.map((f) => {
        const key = `${f.name.toLowerCase()}:${level}`;
        const override = featureLookup.get(key);
        return {
          ...f,
          ...(override?.type ? { type: override.type } : {}),
          ...(override?.gameplayEffects
            ? { gameplayEffects: override.gameplayEffects }
            : {}),
        };
      });

      const slug = `${subclassSlug}_${level}`;
      docs.push({
        id: slug,
        data: {
          slug,
          classSlug,
          subclassSlug,
          level,
          features: enrichedFeatures,
        },
      });
    }
  }

  await batchWrite("srdSubclassLevels", docs);
  console.log(`  ✓ ${docs.length} subclass levels seeded`);
}

async function seedConditions(): Promise<void> {
  console.log("\n── Seeding srdConditions (v2, srd-2014) ──");
  const raw = await fetchAllV2<Record<string, unknown>>(
    "/conditions",
    "srd-2014",
  );
  const docs = raw.map((c) => {
    const key = stripKeyPrefix(c.key as string);
    const descriptions = Array.isArray(c.descriptions)
      ? (c.descriptions as Array<{ desc: string }>)
          .map((d) => d.desc)
          .join("\n\n")
      : ((c.desc as string) ?? "");
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
  const raw = await fetchAllV2<Record<string, unknown>>(
    "/backgrounds",
    "srd-2014",
  );
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
  const raw = await fetchAllV2<Record<string, unknown>>("/feats", "srd-2014");
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
  const raw = await fetchAllV2<Record<string, unknown>>("/armor", "srd-2014");
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
  const raw = await fetchAllV2<V2Creature>("/creatures", "srd-2014");

  const docs = raw.map((m) => {
    const slug = stripKeyPrefix(m.key);

    // Parse CR as number for crToXP fallback
    const crText = m.challenge_rating_text ?? m.challenge_rating_decimal;
    const xp = m.experience_points || crToXP(crText);

    // Build speed object matching v1 format (simple walk speed object)
    const speed = m.speed_all ?? m.speed ?? {};

    // Build senses string from range fields
    const sensesParts: string[] = [];
    if (m.darkvision_range)
      sensesParts.push(`darkvision ${m.darkvision_range} ft.`);
    if (m.blindsight_range)
      sensesParts.push(`blindsight ${m.blindsight_range} ft.`);
    if (m.tremorsense_range)
      sensesParts.push(`tremorsense ${m.tremorsense_range} ft.`);
    if (m.truesight_range)
      sensesParts.push(`truesight ${m.truesight_range} ft.`);
    if (m.passive_perception)
      sensesParts.push(`passive Perception ${m.passive_perception}`);
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
        savingThrows:
          Object.keys(m.saving_throws ?? {}).length > 0
            ? m.saving_throws
            : undefined,
        skillBonuses:
          Object.keys(m.skill_bonuses ?? {}).length > 0
            ? m.skill_bonuses
            : undefined,
        damageResistances:
          m.resistances_and_immunities?.damage_resistances_display || undefined,
        damageImmunities:
          m.resistances_and_immunities?.damage_immunities_display || undefined,
        conditionImmunities:
          m.resistances_and_immunities?.condition_immunities_display ||
          undefined,
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
  const raw = await fetchAllV2<V2MagicItem>("/magicitems", "srd-2024");

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
        weapons: [
          {
            name: "greataxe",
            dice: "1d12",
            stat: "str",
            bonus: 0,
            range: { type: "melee", reach: 5 },
          },
          {
            name: "handaxe",
            dice: "1d6",
            stat: "str",
            bonus: 0,
            range: { type: "both", reach: 5, shortRange: 20, longRange: 60 },
          },
        ],
        gold: 10,
      },
    },
    {
      id: "bard",
      data: {
        slug: "bard",
        inventory: [
          "rapier",
          "dagger",
          "lute",
          "leather armor",
          "entertainer's pack",
        ],
        weapons: [
          {
            name: "rapier",
            dice: "1d8",
            stat: "finesse",
            bonus: 0,
            range: { type: "melee", reach: 5 },
          },
          {
            name: "dagger",
            dice: "1d4",
            stat: "finesse",
            bonus: 0,
            range: { type: "both", reach: 5, shortRange: 20, longRange: 60 },
          },
        ],
        gold: 10,
      },
    },
    {
      id: "cleric",
      data: {
        slug: "cleric",
        inventory: [
          "mace",
          "scale mail",
          "shield",
          "light crossbow",
          "bolts (20)",
          "priest's pack",
          "holy symbol",
        ],
        weapons: [
          {
            name: "mace",
            dice: "1d6",
            stat: "str",
            bonus: 0,
            range: { type: "melee", reach: 5 },
          },
          {
            name: "light crossbow",
            dice: "1d8",
            stat: "dex",
            bonus: 0,
            range: { type: "ranged", shortRange: 80, longRange: 320 },
          },
        ],
        gold: 10,
      },
    },
    {
      id: "druid",
      data: {
        slug: "druid",
        inventory: [
          "wooden shield",
          "scimitar",
          "leather armor",
          "explorer's pack",
          "druidic focus",
        ],
        weapons: [
          {
            name: "scimitar",
            dice: "1d6",
            stat: "finesse",
            bonus: 0,
            range: { type: "melee", reach: 5 },
          },
        ],
        gold: 10,
      },
    },
    {
      id: "fighter",
      data: {
        slug: "fighter",
        inventory: [
          "chain mail",
          "longsword",
          "shield",
          "light crossbow",
          "bolts (20)",
          "dungeoneer's pack",
        ],
        weapons: [
          {
            name: "longsword",
            dice: "1d8",
            stat: "str",
            bonus: 0,
            range: { type: "melee", reach: 5 },
          },
          {
            name: "light crossbow",
            dice: "1d8",
            stat: "dex",
            bonus: 0,
            range: { type: "ranged", shortRange: 80, longRange: 320 },
          },
        ],
        gold: 10,
      },
    },
    {
      id: "monk",
      data: {
        slug: "monk",
        inventory: ["shortsword", "dart x10", "explorer's pack"],
        weapons: [
          {
            name: "shortsword",
            dice: "1d6",
            stat: "finesse",
            bonus: 0,
            range: { type: "melee", reach: 5 },
          },
          {
            name: "dart",
            dice: "1d4",
            stat: "finesse",
            bonus: 0,
            range: { type: "ranged", shortRange: 20, longRange: 60 },
          },
        ],
        gold: 5,
      },
    },
    {
      id: "paladin",
      data: {
        slug: "paladin",
        inventory: [
          "longsword",
          "shield",
          "chain mail",
          "javelin x5",
          "priest's pack",
          "holy symbol",
        ],
        weapons: [
          {
            name: "longsword",
            dice: "1d8",
            stat: "str",
            bonus: 0,
            range: { type: "melee", reach: 5 },
          },
          {
            name: "javelin",
            dice: "1d6",
            stat: "str",
            bonus: 0,
            range: { type: "both", reach: 5, shortRange: 30, longRange: 120 },
          },
        ],
        gold: 10,
      },
    },
    {
      id: "ranger",
      data: {
        slug: "ranger",
        inventory: [
          "scale mail",
          "shortsword",
          "shortsword",
          "longbow",
          "arrows (20)",
          "dungeoneer's pack",
        ],
        weapons: [
          {
            name: "shortsword",
            dice: "1d6",
            stat: "finesse",
            bonus: 0,
            range: { type: "melee", reach: 5 },
          },
          {
            name: "longbow",
            dice: "1d8",
            stat: "dex",
            bonus: 0,
            range: { type: "ranged", shortRange: 150, longRange: 600 },
          },
        ],
        gold: 10,
      },
    },
    {
      id: "rogue",
      data: {
        slug: "rogue",
        inventory: [
          "rapier",
          "shortbow",
          "arrows (20)",
          "leather armor",
          "dagger",
          "dagger",
          "thieves' tools",
          "burglar's pack",
        ],
        weapons: [
          {
            name: "rapier",
            dice: "1d8",
            stat: "finesse",
            bonus: 0,
            range: { type: "melee", reach: 5 },
          },
          {
            name: "shortbow",
            dice: "1d6",
            stat: "dex",
            bonus: 0,
            range: { type: "ranged", shortRange: 80, longRange: 320 },
          },
          {
            name: "dagger",
            dice: "1d4",
            stat: "finesse",
            bonus: 0,
            range: { type: "both", reach: 5, shortRange: 20, longRange: 60 },
          },
        ],
        gold: 10,
      },
    },
    {
      id: "sorcerer",
      data: {
        slug: "sorcerer",
        inventory: [
          "light crossbow",
          "bolts (20)",
          "arcane focus",
          "dungeoneer's pack",
          "dagger",
          "dagger",
        ],
        weapons: [
          {
            name: "light crossbow",
            dice: "1d8",
            stat: "dex",
            bonus: 0,
            range: { type: "ranged", shortRange: 80, longRange: 320 },
          },
          {
            name: "dagger",
            dice: "1d4",
            stat: "finesse",
            bonus: 0,
            range: { type: "both", reach: 5, shortRange: 20, longRange: 60 },
          },
        ],
        gold: 10,
      },
    },
    {
      id: "warlock",
      data: {
        slug: "warlock",
        inventory: [
          "light crossbow",
          "bolts (20)",
          "arcane focus",
          "dungeoneer's pack",
          "leather armor",
          "dagger",
          "dagger",
        ],
        weapons: [
          {
            name: "light crossbow",
            dice: "1d8",
            stat: "dex",
            bonus: 0,
            range: { type: "ranged", shortRange: 80, longRange: 320 },
          },
          {
            name: "dagger",
            dice: "1d4",
            stat: "finesse",
            bonus: 0,
            range: { type: "both", reach: 5, shortRange: 20, longRange: 60 },
          },
        ],
        gold: 10,
      },
    },
    {
      id: "wizard",
      data: {
        slug: "wizard",
        inventory: [
          "quarterstaff",
          "arcane focus",
          "scholar's pack",
          "spellbook",
        ],
        weapons: [
          {
            name: "quarterstaff",
            dice: "1d6",
            stat: "str",
            bonus: 0,
            range: { type: "melee", reach: 5 },
          },
        ],
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
  const { baseClasses, subclasses } = await seedClasses();
  await seedClassLevels(baseClasses);
  const spellDocs = await seedSpells();
  await seedEquipment();
  await seedSubclassLevels(subclasses);
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
