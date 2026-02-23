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
import type {
  Campaign,
  CampaignMap,
  CombatMapDocument,
  ExplorationMapDocument,
  MapDocument,
  PointOfInterest,
} from "./gameTypes";

// ─── Helper types ──────────────────────────────────────────────────────────

/**
 * Distributes Omit over the MapDocument discriminated union so callers
 * can pass either variant without losing type narrowing.
 */
type CreateMapData =
  | Omit<ExplorationMapDocument, "id" | "createdAt" | "updatedAt">
  | Omit<CombatMapDocument, "id" | "createdAt" | "updatedAt">;

// ─── CRUD ────────────────────────────────────────────────────────────────────

/**
 * Create a new map document in Firestore.
 * Returns the full MapDocument with its generated ID.
 */
export async function createMap(
  sessionId: string,
  data: CreateMapData,
): Promise<MapDocument> {
  const now = Date.now();
  const doc = {
    ...data,
    createdAt: now,
    updatedAt: now,
  };

  const ref = adminDb.collection("sessions").doc(sessionId).collection("maps").doc();
  await ref.set(doc);

  return { id: ref.id, ...doc } as MapDocument;
}

/** Load a map document by ID. Returns null if not found. */
export async function loadMap(sessionId: string, mapId: string): Promise<MapDocument | null> {
  const snap = await adminDb.collection("sessions").doc(sessionId).collection("maps").doc(mapId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as MapDocument;
}

/**
 * Partially update a map document.
 * Accepts any subset of map fields (except id/createdAt).
 */
export async function updateMap(
  sessionId: string,
  mapId: string,
  changes: Partial<Record<string, unknown>>,
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
    ...doc.data(),
  })) as MapDocument[];
}

// ─── Type-narrowing helpers ──────────────────────────────────────────────────

/** Load the exploration map for a session. Returns null if not found or wrong type. */
export async function loadExplorationMap(
  sessionId: string,
  mapId: string,
): Promise<ExplorationMapDocument | null> {
  const map = await loadMap(sessionId, mapId);
  if (!map || map.mapType !== "exploration") return null;
  return map as ExplorationMapDocument;
}

/**
 * Load the combat map for a specific POI on an exploration map.
 * Resolves the POI's combatMapId and loads the corresponding CombatMapDocument.
 */
export async function loadCombatMapForPOI(
  sessionId: string,
  explorationMapId: string,
  poiId: string,
): Promise<CombatMapDocument | null> {
  const explMap = await loadExplorationMap(sessionId, explorationMapId);
  if (!explMap) return null;

  const poi = explMap.pointsOfInterest.find((p) => p.id === poiId);
  if (!poi) return null;

  const map = await loadMap(sessionId, poi.combatMapId);
  if (!map || map.mapType !== "combat") return null;
  return map as CombatMapDocument;
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
 * Two-tier flow (when campaign has explorationMapSpecs + combatMapSpecs):
 *   1. Create exploration maps first (so combat maps can reference them).
 *   2. Create combat maps with parentMapId + poiId references.
 *   3. Backfill exploration map POIs with the session-level combatMapId values.
 *
 * Falls back to the legacy flat-list path when explorationMapSpecs is absent.
 * The returned array is sorted: exploration maps first, then combat maps
 * in campaign spec order. This lets callers use maps[0] as the starting map.
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
  const specIds: string[] = [];

  const templates = snap.docs.map((doc) => doc.data() as CampaignMap);
  const explorationTemplates = templates.filter((t) => t.mapType === "exploration");
  const combatTemplates = templates.filter((t) => t.mapType !== "exploration");

  // ─── New two-tier path ──────────────────────────────────────────────────────
  // Used when the campaign defines explorationMapSpecs (new structure).
  if (campaign?.explorationMapSpecs?.length) {
    // Map from template mapSpecId → session-scoped Firestore map ID
    const specIdToSessionId = new Map<string, string>();

    // 1. Create exploration maps
    for (const template of explorationTemplates) {
      const mapDoc: Omit<ExplorationMapDocument, "id"> = {
        mapType: "exploration",
        name: template.name,
        backgroundImageUrl: template.backgroundImageUrl ?? "",
        pointsOfInterest: [], // backfilled after combat maps are created
        createdAt: now,
        updatedAt: now,
      };

      const ref = adminDb.collection("sessions").doc(sessionId).collection("maps").doc();
      await ref.set(mapDoc);
      const created: ExplorationMapDocument = { id: ref.id, ...mapDoc };
      maps.push(created);
      specIds.push(template.mapSpecId);
      specIdToSessionId.set(template.mapSpecId, ref.id);
    }

    // 2. Create combat maps, linking each to its parent exploration map + POI
    for (const template of combatTemplates) {
      let parentMapId = "";
      let poiId = "";
      for (const explSpec of campaign.explorationMapSpecs) {
        const poi = explSpec.pointsOfInterest.find(
          (p) => p.combatMapSpecId === template.mapSpecId,
        );
        if (poi) {
          parentMapId = specIdToSessionId.get(explSpec.id) ?? "";
          poiId = poi.id;
          break;
        }
      }

      const mapDoc: Omit<CombatMapDocument, "id"> = {
        mapType: "combat",
        name: template.name,
        gridSize: template.gridSize ?? 20,
        feetPerSquare: template.feetPerSquare ?? 5,
        tileData: template.tileData,
        regions: template.regions ?? [],
        parentMapId,
        poiId,
        ...(template.backgroundImageUrl ? { backgroundImageUrl: template.backgroundImageUrl } : {}),
        createdAt: now,
        updatedAt: now,
      };

      const ref = adminDb.collection("sessions").doc(sessionId).collection("maps").doc();
      await ref.set(mapDoc);
      const created: CombatMapDocument = { id: ref.id, ...mapDoc };
      maps.push(created);
      specIds.push(template.mapSpecId);
      specIdToSessionId.set(template.mapSpecId, ref.id);
    }

    // 3. Backfill exploration maps with POI combatMapIds
    for (const explMap of maps.filter(
      (m): m is ExplorationMapDocument => m.mapType === "exploration",
    )) {
      const explSpecId = specIds[maps.indexOf(explMap)];
      const explSpec = campaign.explorationMapSpecs.find((s) => s.id === explSpecId);
      if (!explSpec) continue;

      const pois: PointOfInterest[] = explSpec.pointsOfInterest.map((poiSpec) => ({
        id: poiSpec.id,
        number: poiSpec.number,
        name: poiSpec.name,
        description: poiSpec.description,
        position: { x: 50, y: 50 }, // default center — overridden when image is generated
        combatMapId: specIdToSessionId.get(poiSpec.combatMapSpecId) ?? "",
        isHidden: poiSpec.isHidden,
        actNumbers: poiSpec.actNumbers,
        locationTags: poiSpec.locationTags,
        ...(poiSpec.defaultNPCSlugs ? { defaultNPCSlugs: poiSpec.defaultNPCSlugs } : {}),
      }));

      await updateMap(sessionId, explMap.id!, {
        pointsOfInterest: pois,
      } as Partial<Record<string, unknown>>);
      explMap.pointsOfInterest = pois;
    }

    // Sort: exploration maps first, then combat maps in campaign spec order
    const allSpecIds = [
      ...campaign.explorationMapSpecs.map((s) => s.id),
      ...(campaign.combatMapSpecs ?? []).map((s) => s.id),
    ];
    const specOrder = new Map(allSpecIds.map((id, i) => [id, i]));
    const indices = maps.map((_, i) => i);
    indices.sort((a, b) => {
      const aType = maps[a].mapType === "exploration" ? 0 : 1;
      const bType = maps[b].mapType === "exploration" ? 0 : 1;
      if (aType !== bType) return aType - bType;
      return (specOrder.get(specIds[a]) ?? 999) - (specOrder.get(specIds[b]) ?? 999);
    });

    return indices.map((i) => maps[i]);
  }

  // ─── Legacy flat-list path ──────────────────────────────────────────────────
  // Used when campaign has no explorationMapSpecs (old mapSpecs structure).
  for (const template of templates) {
    const base = {
      name: template.name,
      ...(template.backgroundImageUrl ? { backgroundImageUrl: template.backgroundImageUrl } : {}),
      createdAt: now,
      updatedAt: now,
    };

    let mapDoc: Record<string, unknown>;
    if (template.mapType === "exploration") {
      mapDoc = {
        ...base,
        mapType: "exploration" as const,
        backgroundImageUrl: template.backgroundImageUrl ?? "",
        pointsOfInterest: template.pointsOfInterest ?? [],
      };
    } else {
      mapDoc = {
        ...base,
        mapType: "combat" as const,
        gridSize: template.gridSize ?? 20,
        feetPerSquare: template.feetPerSquare ?? 5,
        tileData: template.tileData,
        regions: template.regions ?? [],
      };
    }

    const ref = adminDb.collection("sessions").doc(sessionId).collection("maps").doc();
    await ref.set(mapDoc);

    maps.push({ id: ref.id, ...mapDoc } as MapDocument);
    specIds.push(template.mapSpecId);
  }

  if (campaign?.mapSpecs?.length) {
    const specOrder = new Map<string, number>();
    const act1Specs = new Set<string>();
    campaign.mapSpecs.forEach((spec, i) => {
      specOrder.set(spec.id, i);
      const legacySpec = spec as unknown as { actNumbers?: number[] };
      if (legacySpec.actNumbers?.includes(1)) act1Specs.add(spec.id);
    });

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
