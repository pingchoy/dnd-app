/**
 * encounterStore.ts
 *
 * Firestore CRUD layer for the encounters collection.
 * Each encounter document tracks combat-specific state: NPCs, grid positions,
 * round number, and denormalized location context for combat agent narration.
 *
 * Collection: encounters/{id}
 */

import { adminDb } from "./firebaseAdmin";
import type { NPC, GridPosition, StoredEncounter } from "./gameTypes";

const GRID_SIZE = 20;

// ─── Grid Placement ──────────────────────────────────────────────────────────

/** Find an unoccupied cell in rows 0-3 for NPC placement. */
function findEdgeSlot(occupied: Set<string>): GridPosition {
  for (let row = 1; row <= 3; row++) {
    for (let col = 3; col < GRID_SIZE - 3; col += 2) {
      const key = `${row},${col}`;
      if (!occupied.has(key)) return { row, col };
    }
  }
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const key = `${row},${col}`;
      if (!occupied.has(key)) return { row, col };
    }
  }
  return { row: 0, col: 0 };
}

/**
 * Compute initial grid positions for a set of NPCs.
 * Player is placed at the center; NPCs along the top edge rows.
 */
export function computeInitialPositions(npcs: NPC[]): Record<string, GridPosition> {
  const positions: Record<string, GridPosition> = {};
  const occupied = new Set<string>();

  // Player at center
  positions["player"] = { row: 10, col: 10 };
  occupied.add("10,10");

  // NPCs along edges
  for (const npc of npcs) {
    const pos = findEdgeSlot(occupied);
    positions[npc.id] = pos;
    occupied.add(`${pos.row},${pos.col}`);
  }

  return positions;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

/**
 * Create a new encounter document in Firestore.
 * Computes initial grid positions for all NPCs and the player.
 * Returns the full StoredEncounter with its ID.
 */
export async function createEncounter(
  sessionId: string,
  characterId: string,
  npcs: NPC[],
  location: string,
  scene: string,
): Promise<StoredEncounter> {
  const positions = computeInitialPositions(npcs);
  const now = Date.now();

  const doc: Omit<StoredEncounter, "id"> = {
    sessionId,
    characterId,
    status: "active",
    activeNPCs: npcs,
    positions,
    gridSize: GRID_SIZE,
    round: 1,
    location,
    scene,
    createdAt: now,
    updatedAt: now,
  };

  const ref = adminDb.collection("encounters").doc();
  await ref.set(doc);

  return { id: ref.id, ...doc };
}

/** Load an encounter document by ID. Returns null if not found. */
export async function loadEncounter(encounterId: string): Promise<StoredEncounter | null> {
  const snap = await adminDb.collection("encounters").doc(encounterId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<StoredEncounter, "id">) };
}

/**
 * Partially update an encounter document.
 * Accepts any subset of encounter fields (except id/createdAt).
 */
export async function saveEncounterState(
  encounterId: string,
  updates: Partial<Omit<StoredEncounter, "id" | "createdAt" | "sessionId" | "characterId">>,
): Promise<void> {
  await adminDb.collection("encounters").doc(encounterId).update({
    ...updates,
    updatedAt: Date.now(),
  });
}

/**
 * Lightweight position-only update for a single token.
 * Uses Firestore dot-notation to update a single field without reading the doc.
 */
export async function updateTokenPosition(
  encounterId: string,
  tokenId: string,
  position: GridPosition,
): Promise<void> {
  await adminDb.collection("encounters").doc(encounterId).update({
    [`positions.${tokenId}`]: position,
    updatedAt: Date.now(),
  });
}

/**
 * Mark an encounter as completed. Does not delete the document —
 * completed encounters are kept for history.
 */
export async function completeEncounter(encounterId: string): Promise<void> {
  await adminDb.collection("encounters").doc(encounterId).update({
    status: "completed",
    updatedAt: Date.now(),
  });
}
