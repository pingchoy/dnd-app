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
import type { NPC, GridPosition, StoredEncounter, MapRegion } from "./gameTypes";

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
 * Find an unoccupied cell within a region's bounding box.
 * Returns null if the region is full.
 */
function findRegionSlot(region: MapRegion, occupied: Set<string>): GridPosition | null {
  for (let row = region.bounds.minRow; row <= region.bounds.maxRow; row++) {
    for (let col = region.bounds.minCol; col <= region.bounds.maxCol; col++) {
      const key = `${row},${col}`;
      if (!occupied.has(key)) return { row, col };
    }
  }
  return null;
}

/**
 * Compute initial grid positions for a set of NPCs.
 *
 * When a map with regions is provided, NPCs whose SRD slug matches a region's
 * `defaultNPCSlugs` list are placed inside that region's bounds. Non-matching
 * NPCs fall back to edge placement. If a region is full, also falls back.
 *
 * When `explorationPositions` are provided, they seed the initial positions
 * (so exploration → combat is seamless — no token teleportation).
 */
export function computeInitialPositions(
  npcs: NPC[],
  regions?: MapRegion[],
  explorationPositions?: Record<string, GridPosition>,
): Record<string, GridPosition> {
  const positions: Record<string, GridPosition> = {};
  const occupied = new Set<string>();

  // Seed from exploration positions (seamless transition)
  if (explorationPositions) {
    for (const [id, pos] of Object.entries(explorationPositions)) {
      positions[id] = pos;
      occupied.add(`${pos.row},${pos.col}`);
    }
  }

  // Player at center if not already placed
  if (!positions["player"]) {
    positions["player"] = { row: 10, col: 10 };
    occupied.add("10,10");
  }

  // Build slug → region lookup for region-aware placement
  const slugToRegion = new Map<string, MapRegion>();
  if (regions) {
    for (const region of regions) {
      for (const slug of region.defaultNPCSlugs ?? []) {
        slugToRegion.set(slug, region);
      }
    }
  }

  // Place NPCs — region-aware if a matching region exists, else edge placement
  for (const npc of npcs) {
    if (positions[npc.id]) continue; // already placed from exploration

    const matchingRegion = npc.slug ? slugToRegion.get(npc.slug) : undefined;
    if (matchingRegion) {
      const regionPos = findRegionSlot(matchingRegion, occupied);
      if (regionPos) {
        positions[npc.id] = regionPos;
        occupied.add(`${regionPos.row},${regionPos.col}`);
        continue;
      }
    }

    // Fallback: edge placement
    const pos = findEdgeSlot(occupied);
    positions[npc.id] = pos;
    occupied.add(`${pos.row},${pos.col}`);
  }

  return positions;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

interface CreateEncounterOptions {
  /** Map ID this encounter takes place on (inherits from session's activeMapId). */
  mapId?: string;
  /** Map regions for region-aware NPC placement. */
  regions?: MapRegion[];
  /** Exploration positions to seed initial combat positions (seamless transition). */
  explorationPositions?: Record<string, GridPosition>;
}

/**
 * Create a new encounter document in Firestore.
 * Computes initial grid positions for all NPCs and the player.
 *
 * When a map with regions is provided, NPCs are placed inside matching regions.
 * When exploration positions are provided, they carry over into combat (no teleportation).
 *
 * Returns the full StoredEncounter with its ID.
 */
export async function createEncounter(
  sessionId: string,
  characterId: string,
  npcs: NPC[],
  location: string,
  scene: string,
  options?: CreateEncounterOptions,
): Promise<StoredEncounter> {
  const positions = computeInitialPositions(
    npcs,
    options?.regions,
    options?.explorationPositions,
  );
  const now = Date.now();

  // Turn order: player always first, then NPCs in array order
  const turnOrder = ["player", ...npcs.map(n => n.id)];

  const doc: Omit<StoredEncounter, "id"> = {
    sessionId,
    characterId,
    ...(options?.mapId ? { mapId: options.mapId } : {}),
    status: "active",
    activeNPCs: npcs,
    positions,
    gridSize: GRID_SIZE,
    round: 1,
    turnOrder,
    currentTurnIndex: 0,
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
