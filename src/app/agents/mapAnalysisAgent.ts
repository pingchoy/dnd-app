/**
 * Map Analysis Agent — Claude Sonnet (vision)
 *
 * One-shot vision call per map upload. Analyzes a map image and produces
 * structured JSON with collision data (tileData) and semantic regions.
 *
 * The AI output pre-populates the map editor; the user reviews, corrects
 * mistakes, adds DM notes, and saves. Cost: ~$0.01-0.05 per map.
 */

import Anthropic from "@anthropic-ai/sdk";
import { anthropic, TOKEN_COSTS } from "../lib/anthropic";
import type { MapRegion, RegionType } from "../lib/gameTypes";

const VISION_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;

const SYSTEM_PROMPT: Anthropic.Messages.TextBlockParam = {
  type: "text",
  text: `You are a D&D map analysis assistant. Given a map image, analyze it on a 20×20 grid overlay and produce structured JSON.

Your output must be a single JSON object with these fields:

{
  "tileData": number[],   // 400-element flat array (row-major, 20×20): 0=floor, 1=wall, 2=door
  "regions": [
    {
      "id": "region_<short_snake_case>",
      "name": "Human-readable Room Name",
      "type": "<region_type>",
      "bounds": { "minRow": 0, "maxRow": 5, "minCol": 0, "maxCol": 5 },
      "dmNote": "Brief description of what's notable here"
    }
  ],
  "confidence": "high" | "medium" | "low"
}

Region types: tavern, shop, temple, dungeon, wilderness, residential, street, guard_post, danger, safe, custom.

Guidelines:
- Overlay a 20×20 grid on the image. Row 0 is the top, column 0 is the left.
- Mark solid walls/obstacles as 1, doors/archways as 2, all open/walkable space as 0.
- Identify distinct rooms, corridors, and areas as regions with descriptive names.
- Use bounding boxes (minRow/maxRow/minCol/maxCol inclusive) for region bounds.
- Multiple regions can overlap if spaces serve dual purposes.
- Set confidence to "low" if the image is ambiguous, abstract, or hard to parse.
- For outdoor/overworld maps with no clear walls, set all tileData to 0 and define large regions.

Respond with ONLY valid JSON. No markdown fencing, no explanation.`,
};

export interface MapAnalysisResult {
  tileData: number[];
  regions: MapRegion[];
  confidence: "high" | "medium" | "low";
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

/**
 * Analyze a map image and return collision data + semantic regions.
 * @param imageBase64 Base64-encoded image data (PNG or JPEG)
 * @param mediaType MIME type of the image
 * @param feetPerSquare Scale hint for the AI (5 for detailed, 50-100 for zone)
 */
export async function analyzeMapImage(
  imageBase64: string,
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp",
  feetPerSquare: number = 5,
): Promise<MapAnalysisResult> {
  const response = await anthropic.messages.create({
    model: VISION_MODEL,
    max_tokens: MAX_TOKENS,
    system: [SYSTEM_PROMPT],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBase64 },
          },
          {
            type: "text",
            text: `Analyze this map image on a 20×20 grid. Scale: ${feetPerSquare} feet per square. ${feetPerSquare > 10 ? "This is a zone/overworld map — expect large open areas with few walls." : "This is a detailed dungeon/city map — look for walls, doors, and distinct rooms."}`,
          },
        ],
      },
    ],
  });

  const rawText =
    response.content[0].type === "text" ? response.content[0].text : "{}";

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const rates = TOKEN_COSTS[VISION_MODEL];
  const estimatedCostUsd = rates
    ? rates.input * inputTokens + rates.output * outputTokens
    : 0;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // Return empty defaults on parse failure — user can paint manually
    return {
      tileData: new Array(400).fill(0),
      regions: [],
      confidence: "low",
      inputTokens,
      outputTokens,
      estimatedCostUsd,
    };
  }

  // Validate and sanitize tileData
  let tileData = parsed.tileData as number[] | undefined;
  if (!Array.isArray(tileData) || tileData.length !== 400) {
    tileData = new Array(400).fill(0);
  } else {
    // Clamp values to 0/1/2
    tileData = tileData.map((v) => {
      const n = Number(v);
      return n === 1 || n === 2 ? n : 0;
    });
  }

  // Validate and sanitize regions
  const VALID_TYPES = new Set<RegionType>([
    "tavern", "shop", "temple", "dungeon", "wilderness",
    "residential", "street", "guard_post", "danger", "safe", "custom",
  ]);

  const rawRegions = Array.isArray(parsed.regions) ? parsed.regions : [];
  const regions: MapRegion[] = rawRegions
    .filter((r: Record<string, unknown>) => r && typeof r === "object" && r.bounds)
    .map((r: Record<string, unknown>, i: number) => {
      const bounds = r.bounds as Record<string, number>;
      const regionType = VALID_TYPES.has(r.type as RegionType)
        ? (r.type as RegionType)
        : "custom";
      return {
        id: (r.id as string) || `region_${i}`,
        name: (r.name as string) || `Region ${i + 1}`,
        type: regionType,
        bounds: {
          minRow: Math.max(0, Math.min(19, bounds.minRow ?? 0)),
          maxRow: Math.max(0, Math.min(19, bounds.maxRow ?? 0)),
          minCol: Math.max(0, Math.min(19, bounds.minCol ?? 0)),
          maxCol: Math.max(0, Math.min(19, bounds.maxCol ?? 0)),
        },
        ...(r.dmNote ? { dmNote: r.dmNote as string } : {}),
        ...(r.defaultNPCSlugs ? { defaultNPCSlugs: r.defaultNPCSlugs as string[] } : {}),
        ...(r.shopInventory ? { shopInventory: r.shopInventory as string[] } : {}),
      };
    });

  const confidence = (parsed.confidence as "high" | "medium" | "low") ?? "medium";

  return {
    tileData,
    regions,
    confidence,
    inputTokens,
    outputTokens,
    estimatedCostUsd,
  };
}
