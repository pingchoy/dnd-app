/**
 * characterStore.ts
 *
 * Firestore CRUD layer for characters and SRD data.
 * Uses the Firebase Admin SDK (server-side only).
 *
 * Character documents live at: characters/{id}
 * SRD collections:
 *   srdClasses/{slug}
 *   srdClassLevels/{slug}_{level}
 *   srdRaces/{slug}
 *   srdSpells/{slug}
 *   srdEquipment/{slug}
 *   srdSubclassLevels/{slug}_{level}
 */

import { adminDb } from "./firebaseAdmin";
import type { PlayerState, StoryState, ConversationTurn } from "./gameTypes";

// ─── SRD Types ────────────────────────────────────────────────────────────────

export interface SRDFeature {
  name: string;
  description: string;
  level?: number;
}

export interface SRDRace {
  slug: string;
  name: string;
  speed: number;
  size: string;
  /** e.g. { charisma: 2, intelligence: 1 } */
  abilityBonuses: Record<string, number>;
  traits: SRDFeature[];
  languages: string[];
  /** Any fixed skill proficiencies granted by the race */
  skillProficiencies?: string[];
  /** Number of extra free skill choices granted by the race (e.g. Half-Elf = 2) */
  extraSkillChoices?: number;
}

export interface SRDArchetype {
  slug: string;
  name: string;
  description: string;
}

export interface SRDClass {
  slug: string;
  name: string;
  hitDie: number;
  savingThrows: string[];
  /** Number of skills the player picks at character creation */
  skillChoices: number;
  /** Pool of skill options available to this class */
  skillOptions: string[];
  primaryAbility: string;
  archetypes: SRDArchetype[];
  /** Level at which the player chooses their archetype (1, 2, or 3) */
  archetypeLevel: number;
  /** "known" = fixed list (Bard, Sorcerer, Ranger, Warlock), "prepared" = ability_mod + level (Cleric, Druid, Paladin, Wizard), "none" = non-caster */
  spellcastingType: "known" | "prepared" | "none";
  /** The ability used for spellcasting, e.g. "Intelligence", "Wisdom", "Charisma". Empty for non-casters. */
  spellcastingAbility: string;
}

export interface SRDClassLevel {
  classSlug: string;
  level: number;
  proficiencyBonus: number;
  features: SRDFeature[];
  /** Spell slots by spell level, e.g. { "1": 4, "2": 2 } */
  spellSlots?: Record<string, number>;
  cantripsKnown?: number;
  spellsKnown?: number;
}

// ─── Stored Character ─────────────────────────────────────────────────────────

export interface StoredCharacter {
  id?: string;
  player: PlayerState;
  story: StoryState;
  conversationHistory: ConversationTurn[];
  createdAt?: number;
  updatedAt?: number;
}

// ─── Character CRUD ───────────────────────────────────────────────────────────

/**
 * Create a new character document in Firestore.
 * Returns the Firestore document ID.
 */
export async function createCharacter(
  player: PlayerState,
  story: StoryState,
): Promise<string> {
  const ref = adminDb.collection("characters").doc();
  await ref.set({
    player,
    story,
    conversationHistory: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return ref.id;
}

/**
 * Load a character document by Firestore ID.
 * Returns null if not found.
 */
export async function loadCharacter(id: string): Promise<StoredCharacter | null> {
  const snap = await adminDb.collection("characters").doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<StoredCharacter, "id">) };
}

/**
 * Partially update a character document.
 * Pass only the fields that changed.
 */
export async function saveCharacterState(
  id: string,
  updates: Partial<Omit<StoredCharacter, "id" | "createdAt">>,
): Promise<void> {
  await adminDb.collection("characters").doc(id).update({
    ...updates,
    updatedAt: Date.now(),
  });
}

// ─── SRD Query (with in-memory cache) ────────────────────────────────────────

/**
 * Maps query_srd tool "type" values to their Firestore collection names.
 * class_level IDs are formatted as "{classSlug}_{level}" by the caller.
 */
const SRD_COLLECTION_MAP: Record<string, string> = {
  monster:     "srdMonsters",
  spell:       "srdSpells",
  magic_item:  "srdMagicItems",
  condition:   "srdConditions",
  feat:        "srdFeats",
  background:  "srdBackgrounds",
  armor:       "srdArmor",
  spell_list:  "srdSpellLists",
  class_level: "srdClassLevels",
};

/** Module-level cache — SRD data is static so we never need to invalidate. */
const srdCache = new Map<string, Record<string, unknown>>();

/**
 * Fetch a single SRD document by type + slug.
 * Results are cached in memory for the lifetime of the server process,
 * so each document costs at most one Firestore read.
 */
export async function querySRD(
  type: string,
  slug: string,
): Promise<Record<string, unknown> | null> {
  const col = SRD_COLLECTION_MAP[type];
  if (!col || !slug) return null;

  const cacheKey = `${col}/${slug}`;
  if (srdCache.has(cacheKey)) return srdCache.get(cacheKey)!;

  const snap = await adminDb.collection(col).doc(slug).get();
  if (!snap.exists) return null;

  const data = snap.data() as Record<string, unknown>;
  srdCache.set(cacheKey, data);
  return data;
}

// ─── SRD Readers ──────────────────────────────────────────────────────────────

/** Cache for full collection reads (static SRD data — never needs invalidation). */
const collectionCache = new Map<string, unknown[]>();

export async function getSRDClass(slug: string): Promise<SRDClass | null> {
  const cacheKey = `srdClasses/${slug}`;
  if (srdCache.has(cacheKey)) return srdCache.get(cacheKey) as unknown as SRDClass;

  const snap = await adminDb.collection("srdClasses").doc(slug).get();
  if (!snap.exists) return null;

  const data = snap.data() as SRDClass;
  srdCache.set(cacheKey, data as unknown as Record<string, unknown>);
  return data;
}

export async function getSRDClassLevel(
  classSlug: string,
  level: number,
): Promise<SRDClassLevel | null> {
  const id = `${classSlug}_${level}`;
  const cacheKey = `srdClassLevels/${id}`;
  if (srdCache.has(cacheKey)) return srdCache.get(cacheKey) as unknown as SRDClassLevel;

  const snap = await adminDb.collection("srdClassLevels").doc(id).get();
  if (!snap.exists) return null;

  const data = snap.data() as SRDClassLevel;
  srdCache.set(cacheKey, data as unknown as Record<string, unknown>);
  return data;
}

export async function getSRDRace(slug: string): Promise<SRDRace | null> {
  const cacheKey = `srdRaces/${slug}`;
  if (srdCache.has(cacheKey)) return srdCache.get(cacheKey) as unknown as SRDRace;

  const snap = await adminDb.collection("srdRaces").doc(slug).get();
  if (!snap.exists) return null;

  const data = snap.data() as SRDRace;
  srdCache.set(cacheKey, data as unknown as Record<string, unknown>);
  return data;
}

export async function getAllSRDClasses(): Promise<SRDClass[]> {
  if (collectionCache.has("srdClasses")) {
    return collectionCache.get("srdClasses") as SRDClass[];
  }
  const snap = await adminDb.collection("srdClasses").get();
  const data = snap.docs.map((d) => {
    const cls = d.data() as SRDClass;
    srdCache.set(`srdClasses/${d.id}`, cls as unknown as Record<string, unknown>);
    return cls;
  });
  collectionCache.set("srdClasses", data);
  return data;
}

export async function getAllSRDRaces(): Promise<SRDRace[]> {
  if (collectionCache.has("srdRaces")) {
    return collectionCache.get("srdRaces") as SRDRace[];
  }
  const snap = await adminDb.collection("srdRaces").get();
  const data = snap.docs.map((d) => {
    const race = d.data() as SRDRace;
    srdCache.set(`srdRaces/${d.id}`, race as unknown as Record<string, unknown>);
    return race;
  });
  collectionCache.set("srdRaces", data);
  return data;
}

export interface SRDSpellCompact {
  slug: string;
  name: string;
  school: string;
  castingTime: string;
  range: string;
  description: string;
}

/**
 * Return all spells for a class at a given spell level (0 = cantrips).
 * Fetches the class spell list, then batch-reads individual spell docs.
 */
export async function getSRDSpellsByClassAndLevel(
  classSlug: string,
  spellLevel: number,
): Promise<SRDSpellCompact[]> {
  // 1. Get the class spell list
  const listDoc = await querySRD("spell_list", classSlug);
  if (!listDoc) return [];

  const spellSlugs: string[] = (listDoc.spells as string[]) ?? [];
  if (spellSlugs.length === 0) return [];

  // 2. Batch-read all spell docs (use cache where available)
  const results: SRDSpellCompact[] = [];
  const uncachedSlugs: string[] = [];

  for (const slug of spellSlugs) {
    const cacheKey = `srdSpells/${slug}`;
    if (srdCache.has(cacheKey)) {
      const s = srdCache.get(cacheKey)!;
      if ((s.level as number) === spellLevel) {
        results.push({
          slug: s.slug as string,
          name: s.name as string,
          school: s.school as string,
          castingTime: s.castingTime as string,
          range: s.range as string,
          description: String(s.description ?? "").slice(0, 300),
        });
      }
    } else {
      uncachedSlugs.push(slug);
    }
  }

  // Fetch uncached in batches of 10 (Firestore getAll limit is 100)
  for (let i = 0; i < uncachedSlugs.length; i += 10) {
    const batch = uncachedSlugs.slice(i, i + 10);
    const refs = batch.map((slug) => adminDb.collection("srdSpells").doc(slug));
    const snaps = await adminDb.getAll(...refs);

    for (const snap of snaps) {
      if (!snap.exists) continue;
      const s = snap.data() as Record<string, unknown>;
      srdCache.set(`srdSpells/${snap.id}`, s);

      if ((s.level as number) === spellLevel) {
        results.push({
          slug: s.slug as string,
          name: s.name as string,
          school: s.school as string,
          castingTime: s.castingTime as string,
          range: s.range as string,
          description: String(s.description ?? "").slice(0, 300),
        });
      }
    }
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}
