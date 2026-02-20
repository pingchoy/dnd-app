/**
 * seedFirestore.ts
 *
 * One-time script: fetches D&D 5e SRD data from the Open5e API and writes it
 * to Firestore. Run with:
 *
 *   npm run seed
 *
 * Prerequisites:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY env var containing service account JSON string
 *
 * Collections seeded:
 *   srdRaces/{slug}             (v1, wotc-srd)
 *   srdClasses/{slug}           (v1, wotc-srd)
 *   srdClassLevels/{slug}_{N}   (parsed from class tables)
 *   srdSpells/{slug}            (v1, wotc-srd)
 *   srdEquipment/{slug}         (v1, wotc-srd — weapons)
 *   srdSubclassLevels/{slug}    (bundled JSON)
 *   srdConditions/{key}         (v2, all OGL)
 *   srdBackgrounds/{key}        (v2, all OGL)
 *   srdFeats/{key}              (v2, all OGL)
 *   srdArmor/{key}              (v2, all OGL)
 *   srdMonsters/{slug}          (v1, wotc-srd)
 *   srdMagicItems/{slug}        (v1, wotc-srd)
 *   srdSpellLists/{classSlug}   (v1, all — wotc-srd filter only returns 3/7 classes)
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

// ─── Open5e API helpers ───────────────────────────────────────────────────────

const OPEN5E_V1 = "https://api.open5e.com/v1";
const OPEN5E_V2 = "https://api.open5e.com/v2";
const SRD_FILTER = "document__slug=wotc-srd";

interface Open5ePage<T> {
  count: number;
  next: string | null;
  results: T[];
}

/** Fetch all pages from a v1 endpoint (filters to wotc-srd documents). */
async function fetchAll<T>(path: string): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = `${OPEN5E_V1}${path}?${SRD_FILTER}&limit=100`;

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

/** Fetch all pages from a v1 endpoint without any document filter. */
async function fetchAllV1Unfiltered<T>(path: string): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = `${OPEN5E_V1}${path}?limit=100`;

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

/** Fetch all pages from a v2 endpoint (no document filter — fetches all OGL content). */
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

// ─── Open5e data transformers ─────────────────────────────────────────────────

/**
 * Parse a single markdown blob into individual {name, description} pairs.
 * wotc-srd trait format uses italic inside bold: **_Trait Name._** description
 * Bare bold headings like **Draconic Ancestry** (table labels) are skipped.
 */
function parseTraitsMarkdown(
  markdown: string,
): Array<{ name: string; description: string }> {
  const paragraphs = markdown.split(/\n\n+/);
  const traits: Array<{ name: string; description: string }> = [];

  for (const p of paragraphs) {
    // Only match the **_Name._** pattern (underscores required) — skips bare **Heading** labels
    const m = p.trim().match(/^\*\*_([^*_\n]{1,60})\.?_\*\*\s*([\s\S]*)/);
    if (m) {
      const name = m[1].replace(/\.*$/, "").trim();
      const description = m[2].trim();
      if (name) {
        traits.push({ name, description });
      }
    }
  }

  return traits;
}

/** Strip leading **_Name._** markdown wrapper, returning just the description body. */
function stripTraitHeader(md: string): string {
  return md.replace(/^\*\*_?[^*]+_?\*\*\s*/, "").trim();
}

/**
 * Racial weapon/armor proficiencies from the SRD, keyed by base race slug.
 * Sourced from Open5e API trait text (Dwarven Combat Training, Elf Weapon Training).
 * Elf proficiencies are from the High Elf subrace but applied to the base race
 * since the seed script doesn't expand subraces into separate documents.
 */
const RACIAL_WEAPON_PROFICIENCIES: Record<string, string[]> = {
  dwarf: ["battleaxe", "handaxe", "light hammer", "warhammer"],
  elf:   ["longsword", "shortsword", "shortbow", "longbow"],
};

const RACIAL_ARMOR_PROFICIENCIES: Record<string, string[]> = {
  // No SRD races grant armor proficiencies (Mountain Dwarf is PHB-only)
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformRace(r: any): Record<string, unknown> {
  const abilityBonuses: Record<string, number> = {};

  if (Array.isArray(r.asi)) {
    // wotc-srd format: [{attributes: ['Strength'], value: 2}, ...]
    for (const bonus of r.asi) {
      for (const attr of bonus.attributes ?? []) {
        abilityBonuses[attr.toLowerCase()] = bonus.value;
      }
    }
  } else {
    // old 5esrd format: [{ability_score: {name: 'Strength'}, bonus: 2}, ...]
    for (const bonus of r.ability_bonuses ?? []) {
      const ability = bonus.ability_score?.name?.toLowerCase();
      if (ability) abilityBonuses[ability] = bonus.bonus;
    }
  }

  // traits: parse the markdown blob into individual traits at seed time
  let traits: Array<{ name: string; description: string }>;
  if (Array.isArray(r.traits)) {
    traits = r.traits.map((t: { name: string; description?: string }) => ({
      name: t.name,
      description: t.description ?? "",
    }));
  } else if (typeof r.traits === "string" && r.traits) {
    traits = parseTraitsMarkdown(r.traits);
  } else {
    traits = [];
  }

  // speed is {walk: 30} in wotc-srd; was a number in old format
  const speed =
    typeof r.speed === "object" ? (r.speed?.walk ?? 30) : (r.speed ?? 30);

  // Normalise size to just the category word — wotc-srd sometimes returns
  // a full sentence like "Your size is Medium." instead of just "Medium".
  const rawSize: string = r.size ?? "Medium";
  const sizeMatch = rawSize.match(/\b(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/i);
  const size = sizeMatch ? sizeMatch[0] : rawSize;

  // Lore sections from dedicated Open5e fields (each is a markdown string)
  const lore: Record<string, string> = {};
  if (r.desc) lore.description = (r.desc as string).replace(/^##?\s+.*\n+/, "").trim();
  if (r.age) lore.age = stripTraitHeader(r.age as string);
  if (r.alignment) lore.alignment = stripTraitHeader(r.alignment as string);
  if (r.size && typeof r.size === "string" && r.size.length > 20)
    lore.sizeDescription = stripTraitHeader(r.size as string);
  if (r.speed_desc) lore.speedDescription = stripTraitHeader(r.speed_desc as string);
  if (r.languages && typeof r.languages === "string")
    lore.languageDescription = stripTraitHeader(r.languages as string);

  return {
    slug: r.slug,
    name: r.name,
    speed,
    size,
    abilityBonuses,
    traits,
    languages: [],
    skillProficiencies: [],
    extraSkillChoices: r.slug === "half-elf" ? 2 : 0,
    weaponProficiencies: RACIAL_WEAPON_PROFICIENCIES[r.slug] ?? [],
    armorProficiencies: RACIAL_ARMOR_PROFICIENCIES[r.slug] ?? [],
    lore,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformClass(c: any): Record<string, unknown> {
  // hit_dice is "1d12" in wotc-srd; hit_die was "d8" in old format
  const hitDie = parseInt(
    (c.hit_dice ?? c.hit_die ?? "d8").replace(/.*d/, ""),
    10,
  );

  // prof_saving_throws is "Strength, Constitution" in wotc-srd; was an array in old format
  const saves: string[] = c.prof_saving_throws
    ? c.prof_saving_throws
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)
    : (c.saving_throws ?? []).map((s: { name: string }) => s.name);

  // Extract skill choices count from prof_skills description
  const profDesc: string = c.prof_skills ?? c.proficiency_choices_desc ?? "";
  const choiceMatch = profDesc.match(/choose\s+(\d+)/i);
  const skillChoices = choiceMatch ? parseInt(choiceMatch[1], 10) : 2;

  // Extract skill options: everything after "from" or "following" in the prof_skills string
  const afterFrom = profDesc.replace(/^.*?(?:from|following[^:]*:?)/i, "");
  const skillOptions: string[] = afterFrom
    .split(",")
    .map((s: string) =>
      s
        .replace(/\band\b/i, "")
        .replace(/\.$/, "")
        .trim(),
    )
    .filter((s: string) => s.length > 0 && s.length < 30 && /^[A-Z]/.test(s));

  // Archetypes from Open5e
  const archetypes = (c.archetypes ?? []).map(
    (a: { slug: string; name: string; desc?: string }) => ({
      slug: a.slug,
      name: a.name,
      description: a.desc ?? "",
    }),
  );

  // Detect which level the player chooses their archetype by scanning the table
  // for the first level where a feature name is a substring of subtypes_name
  const subtypesName: string = (c.subtypes_name ?? "").toLowerCase();
  let archetypeLevel = 3; // default for most classes
  if (subtypesName) {
    outer: for (let lvl = 1; lvl <= 3; lvl++) {
      const levelInfo = parseClassTable(c.table ?? "").get(lvl);
      for (const f of levelInfo?.features ?? []) {
        if (subtypesName.includes(f.name.toLowerCase())) {
          archetypeLevel = lvl;
          break outer;
        }
      }
    }
  }

  // Derive spellcasting type from the class table:
  //   "known"    = has "Spells Known" column (Bard, Sorcerer, Ranger, Warlock)
  //   "prepared" = has spell slot columns but no "Spells Known" (Cleric, Druid, Paladin, Wizard)
  //   "none"     = no spell slot columns at all (Fighter, Rogue, Barbarian, Monk)
  const levelMap = parseClassTable(c.table ?? "");
  const level1 = levelMap.get(1);
  const tableHeaders = (c.table ?? "").split("\n")[0]?.toLowerCase() ?? "";
  const hasSpellsKnownCol = tableHeaders.includes("spells known");
  const hasSpellSlots = level1 ? Object.keys(level1.spellSlots).length > 0 : false;
  const hasCantrips = (level1?.cantripsKnown ?? 0) > 0;
  const spellcastingType: "known" | "prepared" | "none" =
    hasSpellsKnownCol ? "known"
    : (hasSpellSlots || hasCantrips) ? "prepared"
    : "none";

  // Weapon and armor proficiencies — comma-separated strings from Open5e
  const weaponProficiencies: string[] = (c.prof_weapons ?? "")
    .split(",")
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0 && s.toLowerCase() !== "none");
  const armorProficiencies: string[] = (c.prof_armor ?? "")
    .split(",")
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0 && s.toLowerCase() !== "none");

  // Extract class description: strip the ### feature headings, keep only the
  // opening flavour paragraphs before the first ### section.
  const rawDesc: string = (c.desc as string) ?? "";
  const firstHeading = rawDesc.indexOf("###");
  const description = firstHeading > 0
    ? rawDesc.slice(0, firstHeading).trim()
    : rawDesc.trim();

  return {
    slug: c.slug,
    name: c.name,
    hitDie,
    savingThrows: saves,
    skillChoices,
    skillOptions,
    primaryAbility: c.primary_ability ?? "",
    archetypes,
    archetypeLevel,
    spellcastingType,
    spellcastingAbility: c.spellcasting_ability ?? "",
    weaponProficiencies,
    armorProficiencies,
    description,
  };
}

// ─── Class table parser ───────────────────────────────────────────────────────

interface LevelInfo {
  features: Array<{ name: string; description: string; level: number }>;
  spellSlots: Record<string, number>;
  cantripsKnown?: number;
  spellsKnown?: number;
}

function parseClassTable(table: string): Map<number, LevelInfo> {
  const result = new Map<number, LevelInfo>();
  const isSeparator = (line: string) => /^[\|\s\-:]+$/.test(line);
  const parseRow = (line: string) => line.split("|").slice(1, -1).map((c) => c.trim());

  const lines = table.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"));
  if (lines.length < 3) return result;

  const headers = parseRow(lines[0]).map((h) => h.toLowerCase());
  const levelIdx = headers.findIndex((h) => h.includes("level"));
  const featuresIdx = headers.findIndex((h) => h.includes("feature"));

  // Spell slot columns are labelled "1st", "2nd", "3rd" … "9th"
  const spellSlotCols = new Map<number, string>();
  headers.forEach((h, i) => {
    const m = h.match(/^(\d+)(st|nd|rd|th)$/);
    if (m) spellSlotCols.set(i, m[1]);
  });

  // Cantrips Known / Spells Known columns
  const cantripsIdx = headers.findIndex((h) => h.includes("cantrips"));
  const spellsKnownIdx = headers.findIndex((h) => h.includes("spells known"));

  for (let i = 1; i < lines.length; i++) {
    if (isSeparator(lines[i])) continue;
    const cells = parseRow(lines[i]);

    const rawLevel = cells[levelIdx >= 0 ? levelIdx : 0] ?? "";
    const levelMatch = rawLevel.match(/(\d+)/);
    if (!levelMatch) continue;
    const level = parseInt(levelMatch[1], 10);
    if (level < 1 || level > 20) continue;

    const featuresRaw = featuresIdx >= 0 ? cells[featuresIdx] : "";
    const features = featuresRaw
      ? featuresRaw
          .split(",")
          .map((f) => f.trim())
          .filter((f) => f && f !== "-" && f !== "—")
          .map((name) => ({ name, description: "", level }))
      : [];

    const spellSlots: Record<string, number> = {};
    spellSlotCols.forEach((slotLevel, colIdx) => {
      const num = parseInt(cells[colIdx] ?? "", 10);
      if (!isNaN(num) && num > 0) spellSlots[slotLevel] = num;
    });

    const info: LevelInfo = { features, spellSlots };

    if (cantripsIdx >= 0) {
      const val = parseInt(cells[cantripsIdx] ?? "", 10);
      if (!isNaN(val) && val > 0) info.cantripsKnown = val;
    }
    if (spellsKnownIdx >= 0) {
      const val = parseInt(cells[spellsKnownIdx] ?? "", 10);
      if (!isNaN(val) && val > 0) info.spellsKnown = val;
    }

    result.set(level, info);
  }

  return result;
}

// ─── Seeding functions ────────────────────────────────────────────────────────

async function seedRaces(): Promise<void> {
  console.log("\n── Seeding srdRaces ──");
  const raw = await fetchAll<unknown>("/races");
  const docs = raw.map((r: unknown) => {
    const t = transformRace(r);
    return { id: t.slug as string, data: t };
  });
  await batchWrite("srdRaces", docs);
  console.log(`  ✓ ${docs.length} races seeded`);
}

async function seedClasses(): Promise<Array<Record<string, unknown>>> {
  console.log("\n── Seeding srdClasses ──");
  const raw = await fetchAll<Record<string, unknown>>("/classes");
  const docs = raw.map((c) => {
    const t = transformClass(c);
    return { id: t.slug as string, data: t };
  });
  await batchWrite("srdClasses", docs);
  console.log(`  ✓ ${docs.length} classes seeded`);
  return raw;
}

/** Parse feature descriptions from a single class's `desc` markdown field.
 *  The desc field uses `### Feature Name` headers followed by description text.
 *  Returns a map of lowercase feature name → description string. */
function parseFeatureDescriptionsForClass(classData: Record<string, unknown>): Map<string, string> {
  const descMap = new Map<string, string>();
  const desc = (classData.desc as string) ?? "";
  // Split on ### headers, keeping the header text
  const sections = desc.split(/^###\s+/m);

  for (const section of sections) {
    if (!section.trim()) continue;
    const newlineIdx = section.indexOf("\n");
    if (newlineIdx === -1) continue;

    const name = section.slice(0, newlineIdx).trim();
    const body = section.slice(newlineIdx + 1).trim();
    if (name && body) {
      descMap.set(name.toLowerCase(), body);
    }
  }

  return descMap;
}

async function seedClassLevels(classData: Array<Record<string, unknown>>): Promise<void> {
  console.log("\n── Seeding srdClassLevels (with feature descriptions from class data) ──");

  const docs: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (const c of classData) {
    const classSlug = c.slug as string;
    const levelMap = parseClassTable((c.table as string) ?? "");
    // Parse descriptions from THIS class only — avoids cross-class name collisions
    // (e.g. "Spellcasting" appears in 6 classes with different text)
    const featureDescs = parseFeatureDescriptionsForClass(c);

    for (let level = 1; level <= 20; level++) {
      const proficiencyBonus = Math.ceil(level / 4) + 1;
      const info = levelMap.get(level) ?? { features: [], spellSlots: {} };

      // Attach descriptions looked up by feature name (case-insensitive)
      const features = info.features.map((f) => ({
        ...f,
        description: featureDescs.get(f.name.toLowerCase()) ?? "",
      }));

      docs.push({
        id: `${classSlug}_${level}`,
        data: {
          classSlug,
          level,
          proficiencyBonus,
          features,
          ...(Object.keys(info.spellSlots).length > 0 ? { spellSlots: info.spellSlots } : {}),
          ...(info.cantripsKnown != null ? { cantripsKnown: info.cantripsKnown } : {}),
          ...(info.spellsKnown != null ? { spellsKnown: info.spellsKnown } : {}),
        },
      });
    }
  }

  await batchWrite("srdClassLevels", docs);
  console.log(`  ✓ ${docs.length} class levels seeded`);
}

async function seedSpells(): Promise<void> {
  console.log("\n── Seeding srdSpells ──");
  const raw = await fetchAll<Record<string, unknown>>("/spells");
  const docs = raw.map((s) => ({
    id: s.slug as string,
    data: {
      slug: s.slug,
      name: s.name,
      level: s.level_int ?? s.level,
      school: (s.school as string)?.toLowerCase(),
      castingTime: s.casting_time,
      range: s.range,
      components: s.components,
      duration: s.duration,
      concentration: s.concentration,
      ritual: s.ritual,
      description: s.desc,
      higherLevel: s.higher_level ?? "",
      classes: (s.spell_lists as string[] | undefined) ?? [],
    },
  }));
  await batchWrite("srdSpells", docs);
  console.log(`  ✓ ${docs.length} spells seeded`);
}

async function seedEquipment(): Promise<void> {
  console.log("\n── Seeding srdEquipment ──");
  const raw = await fetchAll<Record<string, unknown>>("/weapons");
  const docs = raw.map((e) => ({
    id: e.slug as string,
    data: {
      slug: e.slug,
      name: e.name,
      category: e.category_range,
      damageDice: e.damage_dice,
      damageType: e.damage_type,
      weight: e.weight,
      cost: e.cost,
      properties: e.properties ?? [],
    },
  }));
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
  console.log("\n── Seeding srdConditions (v2) ──");
  const raw = await fetchAllV2<Record<string, unknown>>("/conditions");
  const docs = raw.map((c) => {
    // key format: "{doc}_{slug}" e.g. "srd_blinded"
    const key = c.key as string;
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
  console.log("\n── Seeding srdBackgrounds (v2) ──");
  const raw = await fetchAllV2<Record<string, unknown>>("/backgrounds");
  const docs = raw.map((b) => {
    const key = b.key as string;
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
  console.log("\n── Seeding srdFeats (v2) ──");
  const raw = await fetchAllV2<Record<string, unknown>>("/feats");
  const docs = raw.map((f) => {
    const key = f.key as string;
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
  console.log("\n── Seeding srdArmor (v2) ──");
  const raw = await fetchAllV2<Record<string, unknown>>("/armor");
  const docs = raw.map((a) => {
    const key = a.key as string;
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
  console.log("\n── Seeding srdMonsters (v1) ──");
  const raw = await fetchAll<Record<string, unknown>>("/monsters");
  const docs = raw.map((m) => ({
    id: m.slug as string,
    data: {
      slug: m.slug,
      name: m.name,
      size: m.size,
      type: m.type,
      alignment: m.alignment,
      armorClass: m.armor_class,
      hitPoints: m.hit_points,
      hitDice: m.hit_dice,
      speed: m.speed,
      strength: m.strength,
      dexterity: m.dexterity,
      constitution: m.constitution,
      intelligence: m.intelligence,
      wisdom: m.wisdom,
      charisma: m.charisma,
      challengeRating: m.cr,
      xp: crToXP(m.cr as number | string),
      senses: m.senses ?? "",
      languages: m.languages ?? "",
      specialAbilities: m.special_abilities ?? [],
      actions: m.actions ?? [],
      legendaryActions: m.legendary_actions ?? [],
      reactions: m.reactions ?? [],
    },
  }));
  await batchWrite("srdMonsters", docs);
  console.log(`  ✓ ${docs.length} monsters seeded`);
}

async function seedSpellLists(): Promise<void> {
  console.log("\n── Seeding srdSpellLists (v1, unfiltered) ──");
  // Fetched without document filter — the wotc-srd filter only returns 3/7 classes.
  const raw = await fetchAllV1Unfiltered<Record<string, unknown>>("/spelllist");
  const docs = raw.map((l) => ({
    id: l.slug as string,
    data: {
      slug: l.slug,
      name: l.name,
      spells: l.spells ?? [],
    },
  }));
  await batchWrite("srdSpellLists", docs);
  console.log(`  ✓ ${docs.length} spell lists seeded`);
}

async function seedMagicItems(): Promise<void> {
  console.log("\n── Seeding srdMagicItems (v1) ──");
  const raw = await fetchAll<Record<string, unknown>>("/magicitems");
  const docs = raw.map((i) => ({
    id: i.slug as string,
    data: {
      slug: i.slug,
      name: i.name,
      type: i.type ?? "",
      rarity: i.rarity ?? "",
      requiresAttunement: i.requires_attunement ?? "",
      description: i.desc ?? "",
    },
  }));
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
          greataxe: { dice: "1d12", stat: "str", bonus: 0 },
          handaxe: { dice: "1d6", stat: "str", bonus: 0 },
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
          rapier: { dice: "1d8", stat: "finesse", bonus: 0 },
          dagger: { dice: "1d4", stat: "finesse", bonus: 0 },
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
          mace: { dice: "1d6", stat: "str", bonus: 0 },
          "light crossbow": { dice: "1d8", stat: "dex", bonus: 0 },
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
          scimitar: { dice: "1d6", stat: "finesse", bonus: 0 },
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
          longsword: { dice: "1d8", stat: "str", bonus: 0 },
          "light crossbow": { dice: "1d8", stat: "dex", bonus: 0 },
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
          shortsword: { dice: "1d6", stat: "finesse", bonus: 0 },
          dart: { dice: "1d4", stat: "finesse", bonus: 0 },
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
          longsword: { dice: "1d8", stat: "str", bonus: 0 },
          javelin: { dice: "1d6", stat: "str", bonus: 0 },
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
          shortsword: { dice: "1d6", stat: "finesse", bonus: 0 },
          longbow: { dice: "1d8", stat: "dex", bonus: 0 },
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
          rapier: { dice: "1d8", stat: "finesse", bonus: 0 },
          shortbow: { dice: "1d6", stat: "dex", bonus: 0 },
          dagger: { dice: "1d4", stat: "finesse", bonus: 0 },
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
          "light crossbow": { dice: "1d8", stat: "dex", bonus: 0 },
          dagger: { dice: "1d4", stat: "finesse", bonus: 0 },
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
          "light crossbow": { dice: "1d8", stat: "dex", bonus: 0 },
          dagger: { dice: "1d4", stat: "finesse", bonus: 0 },
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
          quarterstaff: { dice: "1d6", stat: "str", bonus: 0 },
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
  console.log("Starting Firestore seeding from Open5e SRD...\n");

  await seedRaces();
  const classData = await seedClasses();
  await seedClassLevels(classData);
  await seedSpells();
  await seedEquipment();
  await seedSubclassLevels();
  await seedConditions();
  await seedBackgrounds();
  await seedFeats();
  await seedArmor();
  await seedMonsters();
  await seedMagicItems();
  await seedSpellLists();
  await seedStartingEquipment();

  console.log("\n✅ Seeding complete. Check your Firestore console.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
