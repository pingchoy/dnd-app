/**
 * Stability AI Image Generation Agent
 *
 * Generates top-down D&D battle map images from CampaignMapSpec descriptions
 * using Stability AI's stable-image/generate/core endpoint.
 *
 * Cost: ~$0.03 per image generation.
 */

import type { CampaignMapSpec } from "../../src/app/lib/gameTypes";

const STABILITY_API_URL = "https://api.stability.ai/v2beta/stable-image/generate/core";
const COST_PER_IMAGE = 0.03;

export interface ImageGenerationResult {
  imageBuffer: Buffer;
  cost: number;
}

/** Map terrain type to visual style hints for the image prompt. */
function terrainStyle(terrain: CampaignMapSpec["terrain"]): string {
  const styles: Record<CampaignMapSpec["terrain"], string> = {
    urban: "city streets, cobblestone, buildings",
    dungeon: "dark stone corridors, torchlit, dungeon walls",
    underground: "cave tunnels, damp stone, stalactites",
    interior: "wooden floors, stone walls, furnished rooms",
    wilderness: "natural terrain, trees, rocks, grass",
    mixed: "varied terrain, combination of indoor and outdoor areas",
  };
  return styles[terrain];
}

/** Map lighting type to visual style hints. */
function lightingStyle(lighting: CampaignMapSpec["lighting"]): string {
  const styles: Record<CampaignMapSpec["lighting"], string> = {
    bright: "well-lit, daylight, clear visibility",
    dim: "low light, flickering lanterns, soft shadows",
    dark: "very dark, minimal light, deep shadows",
    mixed: "patches of light and shadow, varied illumination",
  };
  return styles[lighting];
}

/**
 * Generate a top-down battle map image from a CampaignMapSpec using Stability AI.
 * Returns the raw PNG buffer and estimated cost.
 */
export async function generateMapImage(
  spec: CampaignMapSpec,
  options?: { apiKey?: string },
): Promise<ImageGenerationResult> {
  const apiKey = options?.apiKey ?? process.env.STABILITY_API_KEY;
  if (!apiKey) {
    throw new Error("STABILITY_API_KEY is required for image generation");
  }

  const regionNames = spec.regions.map((r) => r.name).join(", ");

  const prompt = [
    `Top-down overhead view of a D&D battle map: ${spec.name}.`,
    terrainStyle(spec.terrain) + ".",
    lightingStyle(spec.lighting) + ".",
    spec.layoutDescription,
    spec.atmosphereNotes ? spec.atmosphereNotes + "." : "",
    `Key areas: ${regionNames}.`,
    "Detailed fantasy tabletop RPG battle map, top-down orthographic view,",
    "no characters or tokens, high detail textures, painted style.",
  ]
    .filter(Boolean)
    .join(" ");

  const negativePrompt = [
    "isometric, 3d perspective, character tokens, miniatures, dice,",
    "text, labels, grid lines, blurry, low quality, watermark",
  ].join(" ");

  const formData = new FormData();
  formData.append("prompt", prompt);
  formData.append("output_format", "webp");
  formData.append("aspect_ratio", "1:1");
  formData.append("negative_prompt", negativePrompt);

  const response = await fetch(STABILITY_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "image/*",
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Stability AI request failed (${response.status}): ${errorText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const imageBuffer = Buffer.from(arrayBuffer);

  return { imageBuffer, cost: COST_PER_IMAGE };
}
