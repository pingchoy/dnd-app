/**
 * Maps API — CRUD + AI analysis for map documents.
 *
 * POST /api/maps — Create a new map or analyze an image
 * GET  /api/maps?sessionId=xxx — List maps for a session
 */

import { NextRequest, NextResponse } from "next/server";
import { createMap, loadSessionMaps, updateMap, listCampaignMaps, listCampaignSlugs, updateCampaignMap } from "../../lib/mapStore";
import { analyzeMapImage } from "../../agents/mapAnalysisAgent";
import type { CampaignMap, MapDocument } from "../../lib/gameTypes";

// ─── POST: create map or analyze image ───────────────────────────────────────

interface CreateMapBody {
  sessionId: string;
  name: string;
  feetPerSquare: number;
  backgroundImageUrl?: string;
  tileData?: number[];
  regions?: MapDocument["regions"];
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
  changes: Partial<Omit<MapDocument, "id" | "createdAt">>;
}

interface UpdateCampaignMapBody {
  action: "update-campaign-map";
  campaignSlug: string;
  mapSpecId: string;
  changes: Partial<Omit<CampaignMap, "campaignSlug" | "mapSpecId" | "generatedAt">>;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // AI analysis endpoint
    if (body.action === "analyze") {
      const { imageBase64, mediaType, feetPerSquare } = body as AnalyzeMapBody;
      if (!imageBase64 || !mediaType) {
        return NextResponse.json({ error: "imageBase64 and mediaType required" }, { status: 400 });
      }
      const result = await analyzeMapImage(imageBase64, mediaType, feetPerSquare);
      return NextResponse.json(result);
    }

    // Update existing campaign map template
    if (body.action === "update-campaign-map") {
      const { campaignSlug, mapSpecId, changes } = body as UpdateCampaignMapBody;
      if (!campaignSlug || !mapSpecId) {
        return NextResponse.json({ error: "campaignSlug and mapSpecId required" }, { status: 400 });
      }
      await updateCampaignMap(campaignSlug, mapSpecId, changes);
      return NextResponse.json({ ok: true });
    }

    // Update existing map
    if (body.action === "update") {
      const { sessionId, mapId, changes } = body as UpdateMapBody;
      if (!sessionId || !mapId) {
        return NextResponse.json({ error: "sessionId and mapId required" }, { status: 400 });
      }
      await updateMap(sessionId, mapId, changes);
      return NextResponse.json({ ok: true });
    }

    // Create new map
    const { sessionId, name, feetPerSquare, backgroundImageUrl, tileData, regions } = body as CreateMapBody;
    if (!sessionId || !name) {
      return NextResponse.json({ error: "sessionId and name required" }, { status: 400 });
    }

    const map = await createMap(sessionId, {
      name,
      gridSize: 20,
      feetPerSquare: feetPerSquare || 5,
      regions: regions || [],
      ...(backgroundImageUrl ? { backgroundImageUrl } : {}),
      ...(tileData ? { tileData } : {}),
    });

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
      return NextResponse.json({ error: "sessionId or campaign query param required" }, { status: 400 });
    }
    const maps = await loadSessionMaps(sessionId);
    return NextResponse.json({ maps });
  } catch (err) {
    console.error("[Maps API GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
