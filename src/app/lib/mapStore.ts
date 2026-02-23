/**
 * mapStore.ts
 *
 * Firestore CRUD layer for the maps collection.
 * Each map document stores a 20x20 grid with optional collision data,
 * semantic regions, and an optional background image.
 *
 * Collection: maps/{id}
 */

import { adminDb } from "./firebaseAdmin";
import type { MapDocument } from "./gameTypes";

// ─── CRUD ────────────────────────────────────────────────────────────────────

/**
 * Create a new map document in Firestore.
 * Returns the full MapDocument with its generated ID.
 */
export async function createMap(
  sessionId: string,
  data: Omit<MapDocument, "id" | "sessionId" | "createdAt" | "updatedAt">,
): Promise<MapDocument> {
  const now = Date.now();
  const doc: Omit<MapDocument, "id"> = {
    ...data,
    sessionId,
    createdAt: now,
    updatedAt: now,
  };

  const ref = adminDb.collection("maps").doc();
  await ref.set(doc);

  return { id: ref.id, ...doc };
}

/** Load a map document by ID. Returns null if not found. */
export async function loadMap(mapId: string): Promise<MapDocument | null> {
  const snap = await adminDb.collection("maps").doc(mapId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<MapDocument, "id">) };
}

/**
 * Partially update a map document.
 * Accepts any subset of map fields (except id/sessionId/createdAt).
 */
export async function updateMap(
  mapId: string,
  changes: Partial<Omit<MapDocument, "id" | "sessionId" | "createdAt">>,
): Promise<void> {
  await adminDb.collection("maps").doc(mapId).update({
    ...changes,
    updatedAt: Date.now(),
  });
}

/** Load all maps for a session, ordered by creation time descending. */
export async function loadSessionMaps(sessionId: string): Promise<MapDocument[]> {
  const snap = await adminDb
    .collection("maps")
    .where("sessionId", "==", sessionId)
    .orderBy("createdAt", "desc")
    .get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<MapDocument, "id">),
  }));
}
