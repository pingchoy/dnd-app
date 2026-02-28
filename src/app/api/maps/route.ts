/**
 * Maps API — CRUD + AI analysis for map documents.
 *
 * POST /api/maps — Create a new map or analyze an image
 * GET  /api/maps?sessionId=xxx — List maps for a session
 */

export const maxDuration = 30;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  createMap,
  loadMap,
  loadSessionMaps,
  updateMap,
  listCampaignMaps,
  listCampaignSlugs,
  updateCampaignMap,
} from "../../lib/mapStore";
import { saveSessionState } from "../../lib/characterStore";
import { adminBucket } from "../../lib/firebaseAdmin";
import { analyzeMapImage } from "../../agents/mapAnalysisAgent";
import type {
  CampaignMap,
  CombatMapDocument,
  ExplorationMapDocument,
  MapRegion,
  PlacementArea,
  PointOfInterest,
} from "../../lib/gameTypes";

// ─── Image upload helper ──────────────────────────────────────────────────────

import sharp from "sharp";

/**
 * Upload a base64 data URL to Firebase Storage as webp.
 * storagePath should be the full path without extension (e.g. "the-crimson-accord/valdris-docks").
 * If the value is not a data URL (already a remote URL or empty), returns it unchanged.
 */
async function uploadImageIfDataUrl(
  dataUrl: string | undefined,
  storagePath: string,
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith("data:")) return dataUrl ?? "";

  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return dataUrl;

  const base64Data = match[2];
  const rawBuffer = Buffer.from(base64Data, "base64");
  const webpBuffer = await sharp(rawBuffer).webp({ quality: 85 }).toBuffer();

  const filePath = `${storagePath}.webp`;
  const file = adminBucket.file(filePath);
  await file.save(webpBuffer, { contentType: "image/webp", public: true });

  const encodedPath = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${adminBucket.name}/o/${encodedPath}?alt=media`;
}

// ─── POST: create map or analyze image ───────────────────────────────────────

interface CreateMapBody {
  sessionId: string;
  name: string;
  mapType?: "exploration" | "combat"; // defaults to "combat" for backward compat
  // Combat map fields
  feetPerSquare?: number;
  backgroundImageUrl?: string;
  tileData?: number[];
  regions?: MapRegion[];
  placementAreas?: PlacementArea[];
  // Exploration map fields
  pointsOfInterest?: PointOfInterest[];
}

interface AnalyzeMapBody {
  action: "analyze";
  imageBase64: string;
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  feetPerSquare?: number;
}

interface UpdateMapBody {
  action: "update";
  sessionId: string;
  mapId: string;
  changes: Partial<Record<string, unknown>>;
}

interface UpdateCampaignMapBody {
  action: "update-campaign-map";
  campaignSlug: string;
  mapSpecId: string;
  changes: Partial<
    Omit<CampaignMap, "campaignSlug" | "mapSpecId" | "generatedAt">
  >;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // AI analysis endpoint
    if (body.action === "analyze") {
      const { imageBase64, mediaType, feetPerSquare } = body as AnalyzeMapBody;
      if (!imageBase64 || !mediaType) {
        return NextResponse.json(
          { error: "imageBase64 and mediaType required" },
          { status: 400 },
        );
      }
      const result = await analyzeMapImage(
        imageBase64,
        mediaType,
        feetPerSquare,
      );
      return NextResponse.json(result);
    }

    // Update existing campaign map template
    if (body.action === "update-campaign-map") {
      const { campaignSlug, mapSpecId, changes } =
        body as UpdateCampaignMapBody;
      if (!campaignSlug || !mapSpecId) {
        return NextResponse.json(
          { error: "campaignSlug and mapSpecId required" },
          { status: 400 },
        );
      }

      // Upload background image to Storage if it's a data URL
      if (changes.backgroundImageUrl) {
        changes.backgroundImageUrl = await uploadImageIfDataUrl(
          changes.backgroundImageUrl as string,
          `campaign-maps/${campaignSlug}/${mapSpecId}`,
        );
      }

      await updateCampaignMap(campaignSlug, mapSpecId, changes);
      return NextResponse.json({ ok: true });
    }

    // Update existing map
    if (body.action === "update") {
      const { sessionId, mapId, changes } = body as UpdateMapBody;
      if (!sessionId || !mapId) {
        return NextResponse.json(
          { error: "sessionId and mapId required" },
          { status: 400 },
        );
      }
      await updateMap(sessionId, mapId, changes);
      return NextResponse.json({ ok: true });
    }

    // Create new map
    const {
      sessionId,
      name,
      mapType,
      feetPerSquare,
      backgroundImageUrl,
      tileData,
      regions,
      placementAreas,
      pointsOfInterest,
    } = body as CreateMapBody;
    if (!sessionId || !name) {
      return NextResponse.json(
        { error: "sessionId and name required" },
        { status: 400 },
      );
    }

    // Upload background image to Storage if it's a data URL
    const resolvedImageUrl = backgroundImageUrl
      ? await uploadImageIfDataUrl(
          backgroundImageUrl,
          `sessions/${sessionId}/${name.replace(/\s+/g, "-")}`,
        )
      : undefined;

    // Exploration map creation
    if (mapType === "exploration") {
      const map = await createMap(sessionId, {
        mapType: "exploration",
        name,
        backgroundImageUrl: resolvedImageUrl ?? "",
        pointsOfInterest: pointsOfInterest ?? [],
      } satisfies Omit<
        ExplorationMapDocument,
        "id" | "createdAt" | "updatedAt"
      >);
      return NextResponse.json({ map });
    }

    // Combat map creation (default)
    const map = await createMap(sessionId, {
      mapType: "combat",
      name,
      gridSize: 20,
      feetPerSquare: feetPerSquare || 5,
      regions: regions || [],
      ...(placementAreas?.length ? { placementAreas } : {}),
      ...(resolvedImageUrl ? { backgroundImageUrl: resolvedImageUrl } : {}),
      ...(tileData ? { tileData } : {}),
    } satisfies Omit<CombatMapDocument, "id" | "createdAt" | "updatedAt">);

    return NextResponse.json(map);
  } catch (err) {
    console.error("[Maps API]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ─── GET: list maps for a session ────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    // List all campaign slugs
    if (req.nextUrl.searchParams.has("slugs")) {
      const slugs = await listCampaignSlugs();
      return NextResponse.json({ slugs });
    }

    // Campaign map templates
    const campaignSlug = req.nextUrl.searchParams.get("campaign");
    if (campaignSlug) {
      const maps = await listCampaignMaps(campaignSlug);
      return NextResponse.json({ maps });
    }

    // Session-scoped maps
    const sessionId = req.nextUrl.searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId or campaign query param required" },
        { status: 400 },
      );
    }

    // Single map by ID: ?sessionId=xxx&mapId=yyy
    const mapId = req.nextUrl.searchParams.get("mapId");
    if (mapId) {
      const map = await loadMap(sessionId, mapId);
      if (!map) {
        return NextResponse.json({ error: "Map not found" }, { status: 404 });
      }
      return NextResponse.json({ map });
    }

    let maps = await loadSessionMaps(sessionId);

    // Optional type filter: ?type=exploration or ?type=combat
    const type = req.nextUrl.searchParams.get("type");
    if (type) {
      maps = maps.filter((m) => m.mapType === type);
    }

    return NextResponse.json({ maps });
  } catch (err) {
    console.error("[Maps API GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ─── PATCH: update session-level map state (e.g. current POI) ────────────────

interface PatchMapBody {
  sessionId: string;
  currentPOIId: string;
}

export async function PATCH(req: NextRequest) {
  try {
    const { sessionId, currentPOIId } = (await req.json()) as PatchMapBody;
    if (!sessionId || !currentPOIId) {
      return NextResponse.json(
        { error: "sessionId and currentPOIId are required" },
        { status: 400 },
      );
    }
    await saveSessionState(sessionId, { currentPOIId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Maps API PATCH]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
