/**
 * characterStore.ts
 *
 * Firestore CRUD layer for characters, sessions, and SRD data.
 * Uses the Firebase Admin SDK (server-side only).
 *
 * V2 schema (two-collection split):
 *   characters/{id} — player data + sessionId link
 *   sessions/{id}   — story + conversation history + characterIds
 *
 * SRD collections:
 *   srdClasses/{slug}
 *   srdClassLevels/{slug}_{level}
 *   srdRaces/{slug}
 *   srdSpells/{slug}
 *   srdEquipment/{slug}
 *   srdSubclassLevels/{slug}_{level}
 */

import { adminDb } from "./firebaseAdmin";
import type {
  Ability,
  AOEData,
  Campaign,
  GameplayEffects,
  PlayerState,
  StoryState,
  CharacterSummary,
  StoredCharacterV2,
  StoredSession,
  SpellScalingEntry,
} from "./gameTypes";

// ─── SRD Types ────────────────────────────────────────────────────────────────

export interface SRDFeature {
  name: string;
  description: string;
  level?: number;
  type?: "active" | "passive" | "reaction";
  gameplayEffects?: GameplayEffects;
}

/** Flavour / lore sections from Open5e (age, alignment, languages, etc.) */
export interface SRDRaceLore {
  description?: string;
  age?: string;
  alignment?: string;
  sizeDescription?: string;
  speedDescription?: string;
  languageDescription?: string;
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
  /** Weapon proficiencies granted by racial traits (e.g. Dwarven Combat Training) */
  weaponProficiencies?: string[];
  /** Armor proficiencies granted by racial traits (e.g. Dwarven Armor Training) */
  armorProficiencies?: string[];
  /** Combat abilities granted by racial traits (e.g. Dragonborn Breath Weapon) */
  providedAbilities?: Ability[];
  /** Flavour text from Open5e — age, alignment, language descriptions, etc. */
  lore?: SRDRaceLore;
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
  archetypes: SRDArchetype[];
  /** Level at which the player chooses their archetype (1, 2, or 3) */
  archetypeLevel: number;
  /** "known" = fixed list (Bard, Sorcerer, Ranger, Warlock), "prepared" = ability_mod + level (Cleric, Druid, Paladin, Wizard), "none" = non-caster */
  spellcastingType: "known" | "prepared" | "none";
  /** The ability used for spellcasting, e.g. "Intelligence", "Wisdom", "Charisma". Empty for non-casters. */
  spellcastingAbility: string;
  weaponProficiencies: string[];
  armorProficiencies: string[];
  /** Class description / flavour text from the SRD. */
  description?: string;
  /** Class-specific ASI levels (default [4,8,12,16,19]; Fighter/Rogue differ). */
  asiLevels?: number[];
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

// ─── Starting Equipment ──────────────────────────────────────────────────────

export interface SRDStartingEquipment {
  slug: string;
  inventory: string[];
  weapons: Array<{ name: string; dice: string; stat: string; bonus: number; range?: import("./gameTypes").AbilityRange }>;
  gold: number;
}

// ─── Stored Character (assembled from two collections) ───────────────────────

/**
 * Assembled view of a character — combines data from characters/{id}
 * and sessions/{sessionId}. This is the shape that callers see;
 * the split is hidden behind the store functions.
 */
export interface StoredCharacter {
  id?: string;
  sessionId: string;
  player: PlayerState;
  story: StoryState;
  createdAt?: number;
  updatedAt?: number;
}

// ─── Campaign Lookup ──────────────────────────────────────────────────────────

/** Fetch a campaign document by slug. Returns null if not found. */
export async function getCampaign(slug: string): Promise<Campaign | null> {
  const snap = await adminDb.collection("campaigns").doc(slug).get();
  if (!snap.exists) return null;
  return snap.data() as Campaign;
}

// ─── Session CRUD ─────────────────────────────────────────────────────────────

/**
 * Create a new session document in Firestore.
 * Returns the session document ID.
 */
export async function createSession(
  story: StoryState,
  characterId: string,
  campaignSlug?: string,
): Promise<string> {
  const ref = adminDb.collection("sessions").doc();
  await ref.set({
    story,
    characterIds: [characterId],
    ...(campaignSlug ? { campaignSlug } : {}),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return ref.id;
}

/** Load a session document by ID. Returns null if not found. */
export async function loadSession(sessionId: string): Promise<StoredSession | null> {
  const snap = await adminDb.collection("sessions").doc(sessionId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<StoredSession, "id">) };
}

/** Partially update a session document. */
export async function saveSessionState(
  sessionId: string,
  updates: Partial<Omit<StoredSession, "id" | "createdAt" | "characterIds">>,
): Promise<void> {
  await adminDb.collection("sessions").doc(sessionId).update({
    ...updates,
    updatedAt: Date.now(),
  });
}

// ─── Character CRUD ───────────────────────────────────────────────────────────

/**
 * Create a new character + session in Firestore.
 * 1. Creates the character doc (with a temporary empty sessionId)
 * 2. Creates the session doc linked to the character
 * 3. Updates the character doc with the sessionId
 * Returns the character document ID.
 */
export async function createCharacter(
  player: PlayerState,
  story: StoryState,
  campaignSlug?: string,
): Promise<string> {
  const charRef = adminDb.collection("characters").doc();
  const now = Date.now();

  // Create character doc first so we have the ID for the session
  await charRef.set({
    player,
    sessionId: "", // placeholder — updated below
    createdAt: now,
    updatedAt: now,
  });

  // Create session doc linked to this character
  const sessionId = await createSession(story, charRef.id, campaignSlug);

  // Link the character to its session
  await charRef.update({ sessionId });

  return charRef.id;
}

/**
 * Load a character by Firestore ID.
 * Reads the character doc, then the linked session doc, and
 * reassembles a StoredCharacter for callers.
 */
export async function loadCharacter(id: string): Promise<StoredCharacter | null> {
  const charSnap = await adminDb.collection("characters").doc(id).get();
  if (!charSnap.exists) return null;

  const charData = charSnap.data() as StoredCharacterV2;
  const session = await loadSession(charData.sessionId);
  if (!session) return null;

  return {
    id,
    sessionId: charData.sessionId,
    player: charData.player,
    story: session.story,
    createdAt: charData.createdAt,
    updatedAt: charData.updatedAt,
  };
}

/**
 * Persist state changes across both collections in parallel.
 * Player changes go to characters/{id}, story/conversation changes
 * go to sessions/{sessionId}.
 */
export async function saveCharacterState(
  id: string,
  updates: Partial<Omit<StoredCharacter, "id" | "createdAt">>,
): Promise<void> {
  // Read the character doc to get the sessionId
  const charSnap = await adminDb.collection("characters").doc(id).get();
  if (!charSnap.exists) throw new Error(`Character "${id}" not found`);
  const charData = charSnap.data() as StoredCharacterV2;

  const now = Date.now();
  const promises: Promise<unknown>[] = [];

  // Player changes → character doc
  if (updates.player) {
    promises.push(
      adminDb.collection("characters").doc(id).update({
        player: updates.player,
        updatedAt: now,
      }),
    );
  }

  // Story changes → session doc
  const sessionUpdates: Record<string, unknown> = {};
  if (updates.story) sessionUpdates.story = updates.story;

  if (Object.keys(sessionUpdates).length > 0) {
    sessionUpdates.updatedAt = now;
    promises.push(
      adminDb.collection("sessions").doc(charData.sessionId).update(sessionUpdates),
    );
  }

  await Promise.all(promises);
}

/**
 * Load lightweight summaries for a batch of character IDs.
 * Two batch reads: one for character docs, one for unique session docs.
 */
export async function loadCharacterSummaries(ids: string[]): Promise<CharacterSummary[]> {
  if (ids.length === 0) return [];

  // Batch-read character docs
  const charRefs = ids.map((id) => adminDb.collection("characters").doc(id));
  const charSnaps = await adminDb.getAll(...charRefs);

  // Collect valid characters and their session IDs
  const validChars: Array<{ id: string; data: StoredCharacterV2 }> = [];
  const sessionIdSet = new Set<string>();

  for (const snap of charSnaps) {
    if (!snap.exists) continue;
    const data = snap.data() as StoredCharacterV2;
    validChars.push({ id: snap.id, data });
    if (data.sessionId) sessionIdSet.add(data.sessionId);
  }

  // Batch-read unique session docs
  const sessionMap = new Map<string, StoredSession>();
  const sessionIds = Array.from(sessionIdSet);
  if (sessionIds.length > 0) {
    const sessionRefs = sessionIds.map((sid) => adminDb.collection("sessions").doc(sid));
    const sessionSnaps = await adminDb.getAll(...sessionRefs);
    for (const snap of sessionSnaps) {
      if (!snap.exists) continue;
      sessionMap.set(snap.id, snap.data() as StoredSession);
    }
  }

  // Assemble summaries
  const results: CharacterSummary[] = [];
  for (const { id, data } of validChars) {
    const session = sessionMap.get(data.sessionId);
    results.push({
      id,
      name: data.player.name,
      race: data.player.race,
      characterClass: data.player.characterClass,
      level: data.player.level,
      currentHP: data.player.currentHP,
      maxHP: data.player.maxHP,
      campaignTitle: session?.story.campaignTitle ?? "",
      updatedAt: (data.updatedAt as number) ?? (data.createdAt as number) ?? 0,
    });
  }
  return results;
}

/**
 * List ALL character summaries from Firestore, ordered by most recently updated.
 * Useful for debugging — no localStorage dependency.
 */
export async function listAllCharacterSummaries(): Promise<CharacterSummary[]> {
  const charSnap = await adminDb.collection("characters").orderBy("updatedAt", "desc").get();
  if (charSnap.empty) return [];

  const validChars: Array<{ id: string; data: StoredCharacterV2 }> = [];
  const sessionIdSet = new Set<string>();

  for (const doc of charSnap.docs) {
    const data = doc.data() as StoredCharacterV2;
    validChars.push({ id: doc.id, data });
    if (data.sessionId) sessionIdSet.add(data.sessionId);
  }

  const sessionMap = new Map<string, StoredSession>();
  const sessionIds = Array.from(sessionIdSet);
  if (sessionIds.length > 0) {
    const sessionRefs = sessionIds.map((sid) => adminDb.collection("sessions").doc(sid));
    const sessionSnaps = await adminDb.getAll(...sessionRefs);
    for (const snap of sessionSnaps) {
      if (!snap.exists) continue;
      sessionMap.set(snap.id, snap.data() as StoredSession);
    }
  }

  const results: CharacterSummary[] = [];
  for (const { id, data } of validChars) {
    const session = sessionMap.get(data.sessionId);
    results.push({
      id,
      name: data.player.name,
      race: data.player.race,
      characterClass: data.player.characterClass,
      level: data.player.level,
      currentHP: data.player.currentHP,
      maxHP: data.player.maxHP,
      campaignTitle: session?.story.campaignTitle ?? "",
      updatedAt: (data.updatedAt as number) ?? (data.createdAt as number) ?? 0,
    });
  }
  return results;
}

/**
 * Delete a character from Firestore.
 * Removes the character from its session's characterIds. If this was the
 * last character in the session, deletes the session too.
 */
export async function deleteCharacter(id: string): Promise<void> {
  const charSnap = await adminDb.collection("characters").doc(id).get();
  if (charSnap.exists) {
    const charData = charSnap.data() as StoredCharacterV2;
    const sessionId = charData.sessionId;

    if (sessionId) {
      const sessionSnap = await adminDb.collection("sessions").doc(sessionId).get();
      if (sessionSnap.exists) {
        const session = sessionSnap.data() as StoredSession;
        const remaining = (session.characterIds ?? []).filter((cid) => cid !== id);

        if (remaining.length === 0) {
          // Last character — delete the session, its subcollections, and encounters.
          // Firestore does not cascade-delete subcollections, so we must
          // explicitly remove messages and actions to avoid orphaned data.
          // Batches are capped at 500 ops, so we chunk if needed.
          const sessionRef = adminDb.collection("sessions").doc(sessionId);
          const [encSnaps, msgSnaps, actSnaps] = await Promise.all([
            adminDb.collection("encounters").where("sessionId", "==", sessionId).get(),
            sessionRef.collection("messages").get(),
            sessionRef.collection("actions").get(),
          ]);
          const allRefs = [
            ...encSnaps.docs.map((d) => d.ref),
            ...msgSnaps.docs.map((d) => d.ref),
            ...actSnaps.docs.map((d) => d.ref),
            sessionRef,
          ];
          const BATCH_LIMIT = 500;
          for (let i = 0; i < allRefs.length; i += BATCH_LIMIT) {
            const chunk = allRefs.slice(i, i + BATCH_LIMIT);
            const batch = adminDb.batch();
            chunk.forEach((ref) => batch.delete(ref));
            await batch.commit();
          }
        } else {
          // Update characterIds
          await adminDb.collection("sessions").doc(sessionId).update({
            characterIds: remaining,
            updatedAt: Date.now(),
          });
        }
      }
    }
  }

  await adminDb.collection("characters").doc(id).delete();
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
  equipment:   "srdEquipment",
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
  level: number;
  school: string;
  castingTime: string;
  range: string;
  description: string;
  /** Whether this spell requires an attack roll (true) vs a saving throw (false). */
  attackRoll?: boolean;
  /** Saving throw ability required by the target (e.g. "dexterity"). Empty/undefined for attack rolls. */
  savingThrowAbility?: string;
  /** Base damage dice expression (e.g. "1d10"). Undefined for non-damage spells. */
  damageRoll?: string;
  /** Damage types (e.g. ["fire"]). Undefined for non-damage spells. */
  damageTypes?: string[];
  /** Leveled spell upcast scaling: slot level → scaling overrides. */
  upcastScaling?: Record<string, SpellScalingEntry>;
  /** Cantrip scaling by player level: level → scaling overrides. */
  cantripScaling?: Record<string, SpellScalingEntry>;
  /** AOE shape data (cone, sphere, cube, line, cylinder) — set at seed time. */
  aoe?: AOEData;
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
          level: s.level as number,
          school: s.school as string,
          castingTime: s.castingTime as string,
          range: s.range as string,
          description: String(s.description ?? ""),
          attackRoll: s.attackRoll as boolean | undefined,
          savingThrowAbility: s.savingThrowAbility as string | undefined,
          damageRoll: s.damageRoll as string | undefined,
          damageTypes: s.damageTypes as string[] | undefined,
          upcastScaling: s.upcastScaling as Record<string, SpellScalingEntry> | undefined,
          cantripScaling: s.cantripScaling as Record<string, SpellScalingEntry> | undefined,
          aoe: s.aoe as AOEData | undefined,
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
          level: s.level as number,
          school: s.school as string,
          castingTime: s.castingTime as string,
          range: s.range as string,
          description: String(s.description ?? ""),
          attackRoll: s.attackRoll as boolean | undefined,
          savingThrowAbility: s.savingThrowAbility as string | undefined,
          damageRoll: s.damageRoll as string | undefined,
          damageTypes: s.damageTypes as string[] | undefined,
          upcastScaling: s.upcastScaling as Record<string, SpellScalingEntry> | undefined,
          cantripScaling: s.cantripScaling as Record<string, SpellScalingEntry> | undefined,
          aoe: s.aoe as AOEData | undefined,
        });
      }
    }
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

// ─── Subclass Levels ─────────────────────────────────────────────────────────

export interface SRDSubclassLevel {
  subclassSlug: string;
  level: number;
  features: SRDFeature[];
}

/**
 * Fetch subclass-specific features for a given level.
 * Documents are stored as srdSubclassLevels/{slug}_{level}.
 */
export async function getSRDSubclassLevel(
  subclassSlug: string,
  level: number,
): Promise<SRDSubclassLevel | null> {
  const id = `${subclassSlug}_${level}`;
  const cacheKey = `srdSubclassLevels/${id}`;
  if (srdCache.has(cacheKey)) return srdCache.get(cacheKey) as unknown as SRDSubclassLevel;

  const snap = await adminDb.collection("srdSubclassLevels").doc(id).get();
  if (!snap.exists) return null;

  const data = snap.data() as SRDSubclassLevel;
  srdCache.set(cacheKey, data as unknown as Record<string, unknown>);
  return data;
}

// ─── Feats ───────────────────────────────────────────────────────────────────

export interface SRDFeat {
  slug: string;
  name: string;
  description: string;
  prerequisite?: string;
}

/** Fetch all SRD feats (cached after first read). */
export async function getAllSRDFeats(): Promise<SRDFeat[]> {
  if (collectionCache.has("srdFeats")) {
    return collectionCache.get("srdFeats") as SRDFeat[];
  }
  const snap = await adminDb.collection("srdFeats").get();
  const data = snap.docs.map((d) => {
    const feat = d.data() as SRDFeat;
    srdCache.set(`srdFeats/${d.id}`, feat as unknown as Record<string, unknown>);
    return feat;
  });
  collectionCache.set("srdFeats", data);
  return data;
}

export async function getSRDStartingEquipment(classSlug: string): Promise<SRDStartingEquipment | null> {
  const cacheKey = `srdStartingEquipment/${classSlug}`;
  if (srdCache.has(cacheKey)) return srdCache.get(cacheKey) as unknown as SRDStartingEquipment;

  const snap = await adminDb.collection("srdStartingEquipment").doc(classSlug).get();
  if (!snap.exists) return null;

  const data = snap.data() as SRDStartingEquipment;
  srdCache.set(cacheKey, data as unknown as Record<string, unknown>);
  return data;
}
