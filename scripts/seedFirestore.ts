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
 *   - The Firestore database exists in the dnd-app-9609f project
 *
 * Collections seeded:
 *   srdRaces/{slug}
 *   srdClasses/{slug}
 *   srdClassLevels/{classSlug}_{level}
 *   srdSpells/{slug}
 *   srdEquipment/{slug}
 *   srdSubclassLevels/{slug}_{level}   ← from bundled JSON (API doesn't expose these)
 *
 * Firestore security rules must allow writes during seeding.
 * Set: allow read, write: if true;  (change before public deploy!)
 */

import "dotenv/config";
import * as admin from "firebase-admin";
import { readFileSync } from "fs";
import { join } from "path";

// ─── Firebase Admin Init ──────────────────────────────────────────────────────

admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)
  ),
  projectId: "dnd-app-9609f",
});

const db = admin.firestore();

// ─── Open5e API helpers ───────────────────────────────────────────────────────

const OPEN5E_BASE = "https://api.open5e.com/v1";
const SRD_FILTER = "document__slug=wotc-srd";

interface Open5ePage<T> {
  count: number;
  next: string | null;
  results: T[];
}

async function fetchAll<T>(path: string): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = `${OPEN5E_BASE}${path}?${SRD_FILTER}&limit=100`;

  while (url) {
    console.log(`  GET ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const page: Open5ePage<T> = await res.json();
    results.push(...page.results);
    url = page.next;
  }

  return results;
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
    batch.set(db.collection(colPath).doc(id), data);
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformRace(r: any): Record<string, unknown> {
  const abilityBonuses: Record<string, number> = {};
  for (const bonus of r.ability_bonuses ?? []) {
    const ability = bonus.ability_score?.name?.toLowerCase();
    if (ability) abilityBonuses[ability] = bonus.bonus;
  }

  return {
    slug: r.slug,
    name: r.name,
    speed: r.speed ?? 30,
    size: r.size ?? "Medium",
    abilityBonuses,
    traits: (r.traits ?? []).map((t: { name: string; description: string }) => ({
      name: t.name,
      description: t.description ?? "",
    })),
    languages: r.languages ? r.languages.split(",").map((l: string) => l.trim()).filter(Boolean) : [],
    skillProficiencies: [],
    extraSkillChoices: r.slug === "half-elf" ? 2 : 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformClass(c: any): Record<string, unknown> {
  const hitDie = parseInt((c.hit_die ?? "d8").replace("d", ""), 10);
  const saves: string[] = (c.saving_throws ?? []).map(
    (s: { name: string }) => s.name,
  );

  // Extract skill choices from the proficiency description
  const profDesc: string = c.prof_skills ?? c.proficiency_choices_desc ?? "";
  const choiceMatch = profDesc.match(/choose\s+(\d+)/i);
  const skillChoices = choiceMatch ? parseInt(choiceMatch[1], 10) : 2;

  // Extract skill options list
  const skillOptions: string[] = (c.proficiency_choices?.[0]?.from ?? [])
    .filter((p: { type?: string; item?: { name?: string } }) => p.type === "Proficiency")
    .map((p: { item?: { name?: string } }) =>
      (p.item?.name ?? "").replace("Skill: ", ""),
    )
    .filter(Boolean);

  return {
    slug: c.slug,
    name: c.name,
    hitDie,
    savingThrows: saves,
    skillChoices,
    skillOptions,
    primaryAbility: c.primary_ability ?? "",
    subclassSlugs: [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformClassLevel(l: any, classSlug: string, level: number): Record<string, unknown> {
  const features = (l.features ?? []).map((f: { name: string; description?: string }) => ({
    name: f.name,
    description: f.description ?? "",
    level,
  }));

  const spellSlots: Record<string, number> = {};
  for (let i = 1; i <= 9; i++) {
    const key = `spell_slots_level_${i}`;
    if (l[key] && l[key] > 0) spellSlots[String(i)] = l[key];
  }

  return {
    classSlug,
    level,
    proficiencyBonus: l.prof_bonus ?? Math.ceil(level / 4) + 1,
    features,
    ...(Object.keys(spellSlots).length ? { spellSlots } : {}),
  };
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

async function seedClasses(): Promise<void> {
  console.log("\n── Seeding srdClasses ──");
  const raw = await fetchAll<unknown>("/classes");
  const docs = raw.map((c: unknown) => {
    const t = transformClass(c);
    return { id: t.slug as string, data: t };
  });
  await batchWrite("srdClasses", docs);
  console.log(`  ✓ ${docs.length} classes seeded`);
}

async function seedClassLevels(): Promise<void> {
  console.log("\n── Seeding srdClassLevels ──");
  const raw = await fetchAll<unknown>("/levels");
  const docs: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (const l of raw as Array<Record<string, unknown>>) {
    // Open5e levels have a url like /v1/levels/barbarian-1/
    const urlStr = l.url as string ?? "";
    const match = urlStr.match(/\/levels\/([a-z-]+)-(\d+)\//);
    if (!match) continue;
    const classSlug = match[1];
    const level = parseInt(match[2], 10);
    const id = `${classSlug}_${level}`;
    docs.push({ id, data: transformClassLevel(l, classSlug, level) });
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
  const raw: Array<Record<string, unknown>> = JSON.parse(readFileSync(jsonPath, "utf-8"));

  const docs = raw.map((entry) => ({
    id: entry.slug as string,
    data: entry,
  }));
  await batchWrite("srdSubclassLevels", docs);
  console.log(`  ✓ ${docs.length} subclass levels seeded`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("Starting Firestore seeding from Open5e SRD...\n");

  await seedRaces();
  await seedClasses();
  await seedClassLevels();
  await seedSpells();
  await seedEquipment();
  await seedSubclassLevels();

  console.log("\n✅ Seeding complete. Check your Firestore console.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
