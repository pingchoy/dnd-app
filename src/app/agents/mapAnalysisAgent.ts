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
  text: `You are a D&D map analysis assistant. Given a map image, analyze it by overlaying a 20×20 grid and produce structured JSON.

GRID ALIGNMENT: Divide the image into a 20×20 grid of equal cells. Each cell covers exactly 5% of the image width and 5% of the image height. Row 0 is the TOP edge, row 19 is the BOTTOM edge. Column 0 is the LEFT edge, column 19 is the RIGHT edge.

PROCESS: Work row by row, left to right. For each cell, classify what occupies the MAJORITY of that 5% × 5% area.

Your output must be a single JSON object with these fields:

{
  "rows": [          // Array of 20 arrays, each containing 20 tile values
    [0,0,1,1,...],   // row 0 (top of image): 20 values
    [0,0,1,1,...],   // row 1: 20 values
    ...              // rows 2-19
  ],
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

Tile values (vision uses only 3 types — water/indoors are set manually later):
  0 = walkable floor (any open or traversable space)
  1 = wall or solid obstacle (impassable)
  2 = door or archway (passage between rooms)

Region types: tavern, shop, temple, dungeon, wilderness, residential, street, guard_post, danger, safe, custom.

Guidelines:
- Each row in "rows" must have EXACTLY 20 values. There must be EXACTLY 20 rows.
- Only use values 0, 1, and 2. Do NOT use any other numbers.
- When in doubt, prefer 0 (walkable). Only mark a cell as 1 if it is clearly a solid wall or obstacle.
- Mark doors, archways, and passage transitions as 2.
- Use bounding boxes (minRow/maxRow/minCol/maxCol inclusive) for region bounds.
- Multiple regions can overlap if spaces serve dual purposes.
- Set confidence to "low" if the image is ambiguous, abstract, or hard to parse.
- For outdoor/overworld maps with no clear walls, use mostly 0 and define large regions.

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

  // Accept either "rows" (20×20 array of arrays) or flat "tileData" (400-element array)
  let tileData: number[];
  if (Array.isArray(parsed.rows) && parsed.rows.length === 20) {
    const rows = parsed.rows as number[][];
    // Pad/truncate each row to 20, flatten
    tileData = rows.flatMap((row) => {
      if (!Array.isArray(row)) return new Array(20).fill(0);
      if (row.length >= 20) return row.slice(0, 20);
      return [...row, ...new Array(20 - row.length).fill(0)];
    });
  } else if (Array.isArray(parsed.tileData) && (parsed.tileData as number[]).length === 400) {
    tileData = parsed.tileData as number[];
  } else {
    tileData = new Array(400).fill(0);
  }
  // Clamp values to valid tile types (0-4)
  tileData = tileData.map((v) => {
    const n = Number(v);
    return n >= 0 && n <= 4 ? n : 0;
  });

  // Validate and sanitize regions
  const VALID_TYPES = new Set<RegionType>([
    "tavern", "shop", "temple", "dungeon", "wilderness",
    "residential", "street", "guard_post", "danger", "safe", "custom",
  ]);

  // Accept either cells array or bounds from AI output, normalize to cells
  const rawRegions = Array.isArray(parsed.regions) ? parsed.regions : [];
  const regions: MapRegion[] = rawRegions
    .filter((r: Record<string, unknown>) => r && typeof r === "object" && (r.bounds || r.cells))
    .map((r: Record<string, unknown>, i: number) => {
      const regionType = VALID_TYPES.has(r.type as RegionType)
        ? (r.type as RegionType)
        : "custom";

      // Convert bounds → cells (AI outputs bounds, we store cells)
      let cells: number[];
      if (Array.isArray(r.cells)) {
        cells = (r.cells as number[]).filter((c) => c >= 0 && c < 400);
      } else {
        const bounds = r.bounds as Record<string, number>;
        const minRow = Math.max(0, Math.min(19, bounds.minRow ?? 0));
        const maxRow = Math.max(0, Math.min(19, bounds.maxRow ?? 0));
        const minCol = Math.max(0, Math.min(19, bounds.minCol ?? 0));
        const maxCol = Math.max(0, Math.min(19, bounds.maxCol ?? 0));
        cells = [];
        for (let row = minRow; row <= maxRow; row++) {
          for (let col = minCol; col <= maxCol; col++) {
            cells.push(row * 20 + col);
          }
        }
      }

      return {
        id: (r.id as string) || `region_${i}`,
        name: (r.name as string) || `Region ${i + 1}`,
        type: regionType,
        cells,
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
