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
import type { PlayerState, StoryState, ConversationTurn } from "./gameState";

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
  subclassSlugs?: string[];
}

export interface SRDClassLevel {
  classSlug: string;
  level: number;
  proficiencyBonus: number;
  features: SRDFeature[];
  /** Spell slots by spell level, e.g. { "1": 4, "2": 2 } */
  spellSlots?: Record<string, number>;
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

// ─── SRD Readers ──────────────────────────────────────────────────────────────

export async function getSRDClass(slug: string): Promise<SRDClass | null> {
  const snap = await adminDb.collection("srdClasses").doc(slug).get();
  return snap.exists ? (snap.data() as SRDClass) : null;
}

export async function getSRDClassLevel(
  classSlug: string,
  level: number,
): Promise<SRDClassLevel | null> {
  const id = `${classSlug}_${level}`;
  const snap = await adminDb.collection("srdClassLevels").doc(id).get();
  return snap.exists ? (snap.data() as SRDClassLevel) : null;
}

export async function getSRDRace(slug: string): Promise<SRDRace | null> {
  const snap = await adminDb.collection("srdRaces").doc(slug).get();
  return snap.exists ? (snap.data() as SRDRace) : null;
}

export async function getAllSRDClasses(): Promise<SRDClass[]> {
  const snap = await adminDb.collection("srdClasses").get();
  return snap.docs.map((d) => d.data() as SRDClass);
}

export async function getAllSRDRaces(): Promise<SRDRace[]> {
  const snap = await adminDb.collection("srdRaces").get();
  return snap.docs.map((d) => d.data() as SRDRace);
}
