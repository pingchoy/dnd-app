/**
 * mapStore.ts
 *
 * Firestore CRUD layer for session-scoped maps.
 * Each map document stores a 20x20 grid with optional collision data,
 * semantic regions, and an optional background image.
 *
 * Collection: sessions/{sessionId}/maps/{id}
 */

import { adminDb } from "./firebaseAdmin";
import type { Campaign, CampaignMap, MapDocument } from "./gameTypes";

// ─── CRUD ────────────────────────────────────────────────────────────────────

/**
 * Create a new map document in Firestore.
 * Returns the full MapDocument with its generated ID.
 */
export async function createMap(
  sessionId: string,
  data: Omit<MapDocument, "id" | "createdAt" | "updatedAt">,
): Promise<MapDocument> {
  const now = Date.now();
  const doc: Omit<MapDocument, "id"> = {
    ...data,
    createdAt: now,
    updatedAt: now,
  };

  const ref = adminDb.collection("sessions").doc(sessionId).collection("maps").doc();
  await ref.set(doc);

  return { id: ref.id, ...doc };
}

/** Load a map document by ID. Returns null if not found. */
export async function loadMap(sessionId: string, mapId: string): Promise<MapDocument | null> {
  const snap = await adminDb.collection("sessions").doc(sessionId).collection("maps").doc(mapId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<MapDocument, "id">) };
}

/**
 * Partially update a map document.
 * Accepts any subset of map fields (except id/createdAt).
 */
export async function updateMap(
  sessionId: string,
  mapId: string,
  changes: Partial<Omit<MapDocument, "id" | "createdAt">>,
): Promise<void> {
  await adminDb.collection("sessions").doc(sessionId).collection("maps").doc(mapId).update({
    ...changes,
    updatedAt: Date.now(),
  });
}

/** Load all maps for a session, ordered by creation time descending. */
export async function loadSessionMaps(sessionId: string): Promise<MapDocument[]> {
  const snap = await adminDb
    .collection("sessions").doc(sessionId).collection("maps")
    .orderBy("createdAt", "desc")
    .get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<MapDocument, "id">),
  }));
}

// ─── Campaign Map Templates ─────────────────────────────────────────────────

/** List all distinct campaign slugs that have campaign maps. */
export async function listCampaignSlugs(): Promise<string[]> {
  const snap = await adminDb.collection("campaignMaps").select("campaignSlug").get();
  const slugs = new Set<string>();
  for (const doc of snap.docs) {
    slugs.add(doc.data().campaignSlug);
  }
  return Array.from(slugs).sort();
}

/** List all campaign map templates for a campaign. */
export async function listCampaignMaps(campaignSlug: string): Promise<CampaignMap[]> {
  const snap = await adminDb
    .collection("campaignMaps")
    .where("campaignSlug", "==", campaignSlug)
    .get();

  if (snap.empty) return [];

  const maps = snap.docs.map((doc) => doc.data() as CampaignMap);
  maps.sort((a, b) => a.name.localeCompare(b.name));
  return maps;
}

/** Update an existing campaign map template in-place. */
export async function updateCampaignMap(
  campaignSlug: string,
  mapSpecId: string,
  changes: Partial<Omit<CampaignMap, "campaignSlug" | "mapSpecId" | "generatedAt">>,
): Promise<void> {
  const docId = `${campaignSlug}_${mapSpecId}`;
  await adminDb.collection("campaignMaps").doc(docId).update(changes);
}

/** Load a campaign map template by campaign slug and map spec ID. */
export async function loadCampaignMap(
  campaignSlug: string,
  mapSpecId: string,
): Promise<CampaignMap | null> {
  const docId = `${campaignSlug}_${mapSpecId}`;
  const snap = await adminDb.collection("campaignMaps").doc(docId).get();
  if (!snap.exists) return null;
  return snap.data() as CampaignMap;
}

/**
 * Instantiate all campaign map templates into session-scoped maps.
 * Copies each campaignMaps/ template into maps/ with the given sessionId.
 * Called once when a campaign session is first created.
 *
 * When a Campaign object is provided, the returned array is sorted so that
 * Act 1 maps come first (matching mapSpec order within the campaign).
 * This lets callers use maps[0] as the starting map.
 */
export async function instantiateCampaignMaps(
  campaignSlug: string,
  sessionId: string,
  campaign?: Campaign | null,
): Promise<MapDocument[]> {
  const snap = await adminDb
    .collection("campaignMaps")
    .where("campaignSlug", "==", campaignSlug)
    .get();

  if (snap.empty) return [];

  const now = Date.now();
  const maps: MapDocument[] = [];
  // Track mapSpecId per entry for sorting (not persisted on MapDocument)
  const specIds: string[] = [];

  for (const doc of snap.docs) {
    const template = doc.data() as CampaignMap;

    const mapDoc: Omit<MapDocument, "id"> = {
      name: template.name,
      gridSize: template.gridSize,
      feetPerSquare: template.feetPerSquare,
      tileData: template.tileData,
      regions: template.regions,
      ...(template.backgroundImageUrl ? { backgroundImageUrl: template.backgroundImageUrl } : {}),
      createdAt: now,
      updatedAt: now,
    };

    const ref = adminDb.collection("sessions").doc(sessionId).collection("maps").doc();
    await ref.set(mapDoc);

    maps.push({ id: ref.id, ...mapDoc });
    specIds.push(template.mapSpecId);
  }

  // Sort so Act 1 maps come first, in campaign mapSpec order
  if (campaign?.mapSpecs?.length) {
    const specOrder = new Map<string, number>();
    const act1Specs = new Set<string>();
    campaign.mapSpecs.forEach((spec, i) => {
      specOrder.set(spec.id, i);
      if (spec.actNumbers.includes(1)) act1Specs.add(spec.id);
    });

    // Build index pairs, sort, then reorder both arrays
    const indices = maps.map((_, i) => i);
    indices.sort((a, b) => {
      const aIsAct1 = act1Specs.has(specIds[a]) ? 0 : 1;
      const bIsAct1 = act1Specs.has(specIds[b]) ? 0 : 1;
      if (aIsAct1 !== bIsAct1) return aIsAct1 - bIsAct1;
      return (specOrder.get(specIds[a]) ?? 999) - (specOrder.get(specIds[b]) ?? 999);
    });

    return indices.map((i) => maps[i]);
  }

  return maps;
}
