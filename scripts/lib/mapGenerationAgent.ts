/**
 * Map Generation Agent
 *
 * Converts a CampaignMapSpec (text description) into a MapDocument-compatible
 * grid: { tileData, regions, confidence }. Uses Claude Sonnet to generate
 * a 20x20 tile grid with walls, doors, and floors based on the spec's
 * layout description and region definitions.
 *
 * Architecturally mirrors mapAnalysisAgent.ts (image→grid) but goes
 * text→grid instead. Same output schema, same validation, same downstream
 * consumers (CombatGrid, encounterStore).
 */

import Anthropic from "@anthropic-ai/sdk";
import type { CampaignCombatMapSpec, MapRegion, RegionType } from "../../src/app/lib/gameTypes";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;

// Sonnet pricing per token
const INPUT_COST = 3 / 1_000_000;
const OUTPUT_COST = 15 / 1_000_000;

const VISION_SYSTEM_PROMPT = `You are a D&D map analysis assistant. Given a map image, analyze it by overlaying a 20×20 grid and produce structured JSON.

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

IMPORTANT: You MUST use the exact region IDs provided in the prompt. Match each region's bounding box to where that area appears in the image.

Respond with ONLY valid JSON. No markdown fencing, no explanation.`;

const VALID_REGION_TYPES = new Set<RegionType>([
  "tavern", "shop", "temple", "dungeon", "wilderness",
  "residential", "street", "guard_post", "danger", "safe", "custom",
]);

const SYSTEM_PROMPT = `You are a D&D map layout generator. Given a text description of a location, produce a 20×20 tile grid with walls, doors, and floors, plus semantic region bounds.

Your output must be a single JSON object with these fields:

{
  "rows": [          // Array of 20 arrays, each containing 20 tile values
    [0,0,1,1,...],   // row 0 (north/top): 20 values
    [0,0,1,1,...],   // row 1: 20 values
    ...              // rows 2-19 (row 19 = south/bottom)
  ],                 // Tile values: 0=outdoor floor, 1=wall, 2=door, 3=water, 4=indoor walkable
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

Layout Guidelines:
- The grid is 20 rows × 20 columns (indices 0-19). Row 0 is north/top, row 19 is south/bottom.
- Use walls (1) to define room boundaries and building exteriors.
- Use doors (2) to connect rooms and provide entry/exit points.
- Use floors (0) for all walkable outdoor space including corridors.
- Use water (3) for rivers, lakes, ponds, and canals (difficult terrain — half movement speed).
- Use indoors (4) for walkable interior space inside buildings.
- Rooms should be separated by walls with doors connecting them.
- Corridors linking distant rooms should be 1-2 tiles wide.
- Leave at least 30% of all tiles as walkable (floor or door).

Size Guidelines for Regions:
- "small" regions: roughly 2-3 rows × 3-4 columns
- "medium" regions: roughly 4-5 rows × 5-6 columns
- "large" regions: roughly 6-8 rows × 6-10 columns

Position Guidelines:
- "north" = rows 0-6, "south" = rows 13-19, "center" = rows 7-12
- "west" = cols 0-6, "east" = cols 13-19
- "northwest" = rows 0-6, cols 0-6, etc.

Terrain-Specific Rules:
- Dungeon: thick walls (2+ tiles), narrow corridors, heavy use of doors
- Urban/Street: buildings as wall blocks with streets as corridors between them
- Interior: rooms defined by walls with doors, some open-plan areas
- Underground: tunnel-like corridors, irregular cavern shapes
- Wilderness: mostly open (floor) with scattered terrain obstacles as walls
- Mixed: combine styles as described

Respond with ONLY valid JSON. No markdown fencing, no explanation.`;

export interface MapGenerationResult {
  tileData: number[];
  regions: MapRegion[];
  confidence: "high" | "medium" | "low";
  cost: number;
}

/**
 * Generate a 20x20 map grid from a CampaignMapSpec using Claude Sonnet.
 * Returns validated tileData, regions, and estimated cost.
 */
export async function generateMapFromSpec(
  spec: CampaignCombatMapSpec,
  options?: { apiKey?: string; maxRetries?: number },
): Promise<MapGenerationResult> {
  const maxRetries = options?.maxRetries ?? 2;

  const anthropic = new Anthropic({
    apiKey: options?.apiKey ?? process.env.ANTHROPIC_API_KEY,
  });

  // Build the user prompt from the spec
  const regionDescriptions = spec.regions
    .map((r) => {
      const parts = [`  - "${r.name}" (${r.type}, ${r.approximateSize})`];
      if (r.position) parts.push(`position: ${r.position}`);
      if (r.dmNote) parts.push(`note: ${r.dmNote}`);
      return parts.join(", ");
    })
    .join("\n");

  const userPrompt = `Generate a 20×20 map grid for: "${spec.name}"

Terrain: ${spec.terrain}
Lighting: ${spec.lighting}
Scale: ${spec.feetPerSquare} feet per square

Layout Description:
${spec.layoutDescription}

${spec.atmosphereNotes ? `Atmosphere: ${spec.atmosphereNotes}\n` : ""}
Required Regions (each must appear in your output with matching id):
${regionDescriptions}

Generate the tileData and regions. Every region listed above MUST appear in the output regions array with the same id.`;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });

      const rawText =
        response.content[0].type === "text" ? response.content[0].text : "{}";

      const cost =
        response.usage.input_tokens * INPUT_COST +
        response.usage.output_tokens * OUTPUT_COST;

      // Try to extract JSON (handle markdown code blocks)
      let jsonText = rawText;
      const codeBlockMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) jsonText = codeBlockMatch[1].trim();

      const parsed = JSON.parse(jsonText) as Record<string, unknown>;

      // Validate and return
      const result = validateAndSanitize(parsed, spec, cost);
      return result;
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        console.log(`  ⚠ Attempt ${attempt + 1} failed: ${(err as Error).message}. Retrying...`);
      }
    }
  }

  throw new Error(`Map generation failed after ${maxRetries + 1} attempts: ${lastError?.message}`);
}

/**
 * Analyze a generated map image using Claude Vision, with spec region hints
 * to ensure output region IDs match the CampaignMapSpec definitions.
 *
 * This is the "image-first" pipeline: Stability AI generates the image,
 * then Claude Vision extracts tileData + regions from the actual image,
 * constrained to use the spec's predefined region IDs/names/types.
 */
export async function analyzeMapImageFromBuffer(
  imageBuffer: Buffer,
  spec: CampaignCombatMapSpec,
  options?: { apiKey?: string; maxRetries?: number },
): Promise<MapGenerationResult> {
  const maxRetries = options?.maxRetries ?? 2;

  const anthropic = new Anthropic({
    apiKey: options?.apiKey ?? process.env.ANTHROPIC_API_KEY,
  });

  const imageBase64 = imageBuffer.toString("base64");

  // Build region hints from the spec so Claude uses the exact IDs
  const regionHints = spec.regions
    .map((r) => {
      const parts = [
        `- ${r.id} (type: ${r.type}, approximate position: ${r.position ?? "unspecified"}, size: ${r.approximateSize})`,
      ];
      if (r.name) parts.push(`  name: "${r.name}"`);
      if (r.dmNote) parts.push(`  note: ${r.dmNote}`);
      return parts.join("\n");
    })
    .join("\n");

  const scaleHint = spec.feetPerSquare > 10
    ? "This is a zone/overworld map — expect large open areas with few walls."
    : "This is a detailed dungeon/city map — look for walls, doors, and distinct rooms.";

  const userPrompt = `Analyze this map image on a 20×20 grid. Scale: ${spec.feetPerSquare} feet per square. ${scaleHint}

This map must include the following named regions. Use these EXACT region IDs and types:
${regionHints}

Match each region's bounding box to where that area appears in the image using the grid row/column labels. Every region listed above MUST appear in your output regions array with the same id.`;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: VISION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/webp", data: imageBase64 },
              },
              { type: "text", text: userPrompt },
            ],
          },
        ],
      });

      const rawText =
        response.content[0].type === "text" ? response.content[0].text : "{}";

      const cost =
        response.usage.input_tokens * INPUT_COST +
        response.usage.output_tokens * OUTPUT_COST;

      // Try to extract JSON (handle markdown code blocks)
      let jsonText = rawText;
      const codeBlockMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) jsonText = codeBlockMatch[1].trim();

      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      return validateAndSanitize(parsed, spec, cost);
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        console.log(`  ⚠ Vision analysis attempt ${attempt + 1} failed: ${(err as Error).message}. Retrying...`);
      }
    }
  }

  throw new Error(`Vision analysis failed after ${maxRetries + 1} attempts: ${lastError?.message}`);
}

/**
 * Validate and sanitize raw Claude output into a MapGenerationResult.
 * Applies the same validation patterns as mapAnalysisAgent.ts.
 */
function validateAndSanitize(
  parsed: Record<string, unknown>,
  spec: CampaignCombatMapSpec,
  cost: number,
): MapGenerationResult {
  // Accept either "rows" (20×20 array of arrays) or flat "tileData" (400-element array)
  let tileData: number[];
  if (Array.isArray(parsed.rows)) {
    const rows = parsed.rows as number[][];
    if (rows.length !== 20) {
      throw new Error(`"rows" must have exactly 20 rows, got ${rows.length}`);
    }
    for (let i = 0; i < 20; i++) {
      if (!Array.isArray(rows[i]) || rows[i].length !== 20) {
        throw new Error(`Row ${i} must have exactly 20 values, got ${Array.isArray(rows[i]) ? rows[i].length : "non-array"}`);
      }
    }
    tileData = rows.flat();
  } else if (Array.isArray(parsed.tileData)) {
    tileData = parsed.tileData as number[];
    if (tileData.length !== 400) {
      throw new Error(
        `tileData must be exactly 400 elements (20×20), got ${tileData.length}`,
      );
    }
  } else {
    throw new Error("Response must contain either \"rows\" (20×20) or \"tileData\" (400-element array)");
  }

  // Clamp values to valid tile types (0-4)
  tileData = tileData.map((v) => {
    const n = Number(v);
    return n >= 0 && n <= 4 ? n : 0;
  });

  // Check walkability: at least 30% must be walkable (floor, door, water, or indoors)
  const walkable = tileData.filter((v) => v !== 1).length;
  if (walkable / 400 < 0.3) {
    throw new Error(
      `Only ${((walkable / 400) * 100).toFixed(1)}% walkable tiles (need ≥30%). Map is too walled.`,
    );
  }

  // Accept either cells array or bounds from AI output, normalize to cells
  const rawRegions = Array.isArray(parsed.regions) ? parsed.regions : [];
  const regions: MapRegion[] = rawRegions
    .filter((r: Record<string, unknown>) => r && typeof r === "object" && (r.bounds || r.cells))
    .map((r: Record<string, unknown>, i: number) => {
      const regionType = VALID_REGION_TYPES.has(r.type as RegionType)
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
        if (minRow > maxRow || minCol > maxCol) {
          throw new Error(
            `Region "${(r.id as string) || `region_${i}`}" has invalid bounds: min > max`,
          );
        }
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

  // Check that every spec region appears in the output
  const outputIds = new Set(regions.map((r) => r.id));
  const missingRegions = spec.regions.filter((r) => !outputIds.has(r.id));
  if (missingRegions.length > 0) {
    throw new Error(
      `Missing regions from spec: ${missingRegions.map((r) => r.id).join(", ")}`,
    );
  }

  const confidence = (parsed.confidence as "high" | "medium" | "low") ?? "medium";

  return { tileData, regions, confidence, cost };
}
