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
import type { CampaignMapSpec, MapRegion, RegionType } from "../../src/app/lib/gameTypes";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;

// Sonnet pricing per token
const INPUT_COST = 3 / 1_000_000;
const OUTPUT_COST = 15 / 1_000_000;

const VALID_REGION_TYPES = new Set<RegionType>([
  "tavern", "shop", "temple", "dungeon", "wilderness",
  "residential", "street", "guard_post", "danger", "safe", "custom",
]);

const SYSTEM_PROMPT = `You are a D&D map layout generator. Given a text description of a location, produce a 20×20 tile grid with walls, doors, and floors, plus semantic region bounds.

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

Layout Guidelines:
- The grid is 20 rows × 20 columns (indices 0-19). Row 0 is north/top, row 19 is south/bottom.
- Use walls (1) to define room boundaries and building exteriors.
- Use doors (2) to connect rooms and provide entry/exit points.
- Use floors (0) for all walkable space including corridors.
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
  spec: CampaignMapSpec,
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

  const connectionDescriptions = spec.connections?.length
    ? "\nConnections to other maps:\n" +
      spec.connections.map((c) => `  - ${c.direction}: ${c.description}`).join("\n")
    : "";

  const userPrompt = `Generate a 20×20 map grid for: "${spec.name}"

Terrain: ${spec.terrain}
Lighting: ${spec.lighting}
Scale: ${spec.feetPerSquare} feet per square

Layout Description:
${spec.layoutDescription}

${spec.atmosphereNotes ? `Atmosphere: ${spec.atmosphereNotes}\n` : ""}
Required Regions (each must appear in your output with matching id):
${regionDescriptions}
${connectionDescriptions}

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
 * Validate and sanitize raw Claude output into a MapGenerationResult.
 * Applies the same validation patterns as mapAnalysisAgent.ts.
 */
function validateAndSanitize(
  parsed: Record<string, unknown>,
  spec: CampaignMapSpec,
  cost: number,
): MapGenerationResult {
  // Validate tileData
  let tileData = parsed.tileData as number[] | undefined;
  if (!Array.isArray(tileData) || tileData.length !== 400) {
    throw new Error(
      `tileData must be exactly 400 elements, got ${Array.isArray(tileData) ? tileData.length : "non-array"}`,
    );
  }

  // Clamp values to 0/1/2
  tileData = tileData.map((v) => {
    const n = Number(v);
    return n === 1 || n === 2 ? n : 0;
  });

  // Check walkability: at least 30% must be walkable (floor or door)
  const walkable = tileData.filter((v) => v === 0 || v === 2).length;
  if (walkable / 400 < 0.3) {
    throw new Error(
      `Only ${((walkable / 400) * 100).toFixed(1)}% walkable tiles (need ≥30%). Map is too walled.`,
    );
  }

  // Validate regions
  const rawRegions = Array.isArray(parsed.regions) ? parsed.regions : [];
  const regions: MapRegion[] = rawRegions
    .filter((r: Record<string, unknown>) => r && typeof r === "object" && r.bounds)
    .map((r: Record<string, unknown>, i: number) => {
      const bounds = r.bounds as Record<string, number>;
      const regionType = VALID_REGION_TYPES.has(r.type as RegionType)
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

  // Validate bounds: minRow ≤ maxRow, minCol ≤ maxCol
  for (const region of regions) {
    if (region.bounds.minRow > region.bounds.maxRow || region.bounds.minCol > region.bounds.maxCol) {
      throw new Error(
        `Region "${region.id}" has invalid bounds: min > max`,
      );
    }
  }

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
