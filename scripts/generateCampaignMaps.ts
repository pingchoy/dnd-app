/**
 * generateCampaignMaps.ts
 *
 * CLI tool that generates CampaignMap templates from a campaign's
 * exploration and combat map spec definitions. Two-phase generation:
 *
 * Phase 1 — Exploration maps (image only, no grid analysis):
 *   Stability AI generates a zoomed-out bird's-eye view image.
 *   Image uploaded to Firebase Storage. No tileData or regions needed.
 *
 * Phase 2 — Combat maps (image + grid, or text-to-grid):
 *   Image-first (when STABILITY_API_KEY is set and --no-images is not used):
 *     Stability AI -> image -> Claude Vision (+ spec region hints) -> tileData + regions
 *     Image uploaded to Firebase Storage -> backgroundImageUrl on the CampaignMap
 *
 *   Text-to-grid fallback (no STABILITY_API_KEY or --no-images):
 *     Claude Sonnet -> tileData + regions from text description
 *
 * Legacy fallback: If the campaign uses the deprecated flat `mapSpecs` array
 * instead of `explorationMapSpecs` + `combatMapSpecs`, combat maps are
 * generated from `mapSpecs` and no exploration maps are produced.
 *
 * Generated maps are stored as templates in campaignMaps/{campaignSlug}_{mapSpecId}
 * and instantiated into session-scoped maps/ when a campaign starts.
 *
 * Usage:
 *   npm run generate:maps -- --campaign the-crimson-accord
 *   npm run generate:maps -- --campaign the-crimson-accord --map valdris-docks
 *   npm run generate:maps -- --campaign the-crimson-accord --dry-run
 *   npm run generate:maps -- --campaign the-crimson-accord --no-images
 *
 * Prerequisites:
 *   - ANTHROPIC_API_KEY env var
 *   - FIREBASE_SERVICE_ACCOUNT_KEY env var containing service account JSON string
 *   - STABILITY_API_KEY env var (optional: enables image generation)
 *   - FIREBASE_STORAGE_BUCKET env var (required when using image generation)
 *
 * Cost:
 *   Exploration map: ~$0.03 per map (Stability image only)
 *   Combat map (image flow): ~$0.06 per map ($0.03 Stability + ~$0.03 Claude Vision)
 *   Combat map (text fallback): ~$0.03-0.05 per map (Claude Sonnet)
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import * as admin from "firebase-admin";
import { ALL_CAMPAIGNS } from "./campaigns";
import { generateMapFromSpec, analyzeMapImageFromBuffer } from "./lib/mapGenerationAgent";
import { generateMapImage, generateExplorationMapImage } from "./lib/stabilityImageAgent";
import { uploadMapImage } from "./lib/firebaseStorageUpload";
import type {
  CampaignCombatMapSpec,
  CampaignExplorationMapSpec,
  CampaignMap,
  MapRegion,
} from "../src/app/lib/gameTypes";

// ─── Firebase Admin Init ──────────────────────────────────────────────────────

let firebaseInitialized = false;

function initFirebase(needsStorage: boolean): void {
  if (firebaseInitialized) return;

  const appOptions: admin.AppOptions = {
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!),
    ),
  };

  // Only configure storage bucket when image pipeline needs it
  if (needsStorage && process.env.FIREBASE_STORAGE_BUCKET) {
    appOptions.storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
  }

  admin.initializeApp(appOptions);
  admin.firestore().settings({ ignoreUndefinedProperties: true });
  firebaseInitialized = true;
}

// ─── CLI Argument Parsing ─────────────────────────────────────────────────────

interface CLIArgs {
  campaign: string;
  map?: string;
  dryRun: boolean;
  noImages: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};
  let dryRun = false;
  let noImages = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--no-images") {
      noImages = true;
    } else if (args[i].startsWith("--") && i + 1 < args.length) {
      const key = args[i].replace("--", "");
      parsed[key] = args[++i];
    }
  }

  if (!parsed.campaign) {
    console.error("Usage: npm run generate:maps -- --campaign <slug> [--map <mapSpecId>] [--dry-run] [--no-images]");
    console.error("  --campaign    Required. Campaign slug (e.g. 'the-crimson-accord')");
    console.error("  --map         Optional. Generate only this map spec (e.g. 'valdris-docks' or 'valdris-city')");
    console.error("  --dry-run     Optional. Preview generation plan without calling APIs or saving");
    console.error("  --no-images   Optional. Skip image generation, use text-to-grid only (combat maps)");
    process.exit(1);
  }

  return {
    campaign: parsed.campaign,
    map: parsed.map,
    dryRun,
    noImages,
  };
}

// ─── Phase 1: Exploration Map Generation ──────────────────────────────────────

/**
 * Generate exploration map images (no grid analysis needed).
 * Exploration maps are zoomed-out overworld images with POI markers —
 * they have no tileData or region cells.
 */
async function generateExplorationMaps(
  explorationSpecs: CampaignExplorationMapSpec[],
  campaignSlug: string,
  db: admin.firestore.Firestore,
  useImages: boolean,
  stabilityKey: string | undefined,
): Promise<{ successCount: number; failCount: number; imageCost: number }> {
  let successCount = 0;
  let failCount = 0;
  let totalImageCost = 0;

  for (const spec of explorationSpecs) {
    console.log(`Generating exploration map: ${spec.id} ("${spec.name}")...`);

    try {
      let backgroundImageUrl: string | undefined;
      let imageCost = 0;

      const docId = `${campaignSlug}_${spec.id}`;
      const existingSnap = await db.collection("campaignMaps").doc(docId).get();
      const existing = existingSnap.exists ? (existingSnap.data() as CampaignMap) : null;

      if (existing?.backgroundImageUrl) {
        backgroundImageUrl = existing.backgroundImageUrl;
        console.log(`  ✓ Existing image found — skipping Stability AI generation`);
      } else if (useImages) {
        try {
          console.log(`  Generating exploration image (Stability AI)...`);
          const imageResult = await generateExplorationMapImage(spec, { apiKey: stabilityKey });
          imageCost = imageResult.cost;
          console.log(`  ✓ Image generated (${(imageResult.imageBuffer.length / 1024).toFixed(0)} KB)`);

          // Upload image to Firebase Storage
          if (process.env.FIREBASE_STORAGE_BUCKET) {
            try {
              console.log(`  Uploading image to Firebase Storage...`);
              backgroundImageUrl = await uploadMapImage(
                imageResult.imageBuffer,
                campaignSlug,
                spec.id,
              );
              console.log(`  ✓ Uploaded: ${backgroundImageUrl}`);
            } catch (uploadErr) {
              console.log(`  ⚠ Upload failed: ${(uploadErr as Error).message} — continuing without image URL`);
            }
          }
        } catch (imageErr) {
          console.log(`  ⚠ Image generation failed: ${(imageErr as Error).message}`);
          console.log(`  Exploration maps require image generation — skipping.`);
          failCount++;
          console.log();
          continue;
        }
      } else {
        console.log(`  ⚠ No image pipeline available — exploration maps require images. Skipping.`);
        failCount++;
        console.log();
        continue;
      }

      // Build the POI data from the spec (without combatMapId — that gets linked at instantiation)
      const pointsOfInterest = spec.pointsOfInterest.map((poi) => ({
        id: poi.id,
        number: poi.number,
        name: poi.name,
        description: poi.description,
        position: poi.position ?? { x: 50, y: 50 },
        combatMapId: "", // linked at session instantiation time
        isHidden: poi.isHidden,
        actNumbers: poi.actNumbers,
        locationTags: poi.locationTags,
        ...(poi.defaultNPCSlugs ? { defaultNPCSlugs: poi.defaultNPCSlugs } : {}),
      }));

      if (imageCost > 0) {
        console.log(`  ✓ Generated`);
        console.log(`    POIs: ${pointsOfInterest.length}`);
        console.log(`    Cost: Image $${imageCost.toFixed(4)}`);
      } else {
        console.log(`  ✓ Using existing image`);
        console.log(`    POIs: ${pointsOfInterest.length}`);
      }
      if (backgroundImageUrl) {
        console.log(`    Image: ${backgroundImageUrl}`);
      }

      const campaignMap: CampaignMap = {
        campaignSlug,
        mapSpecId: spec.id,
        mapType: "exploration",
        name: spec.name,
        pointsOfInterest,
        ...(backgroundImageUrl ? { backgroundImageUrl } : {}),
        generatedAt: Date.now(),
      };

      await db.collection("campaignMaps").doc(docId).set(campaignMap);
      console.log(`    Saved: campaignMaps/${docId}`);

      totalImageCost += imageCost;
      successCount++;
    } catch (err) {
      console.error(`  ✗ Failed: ${(err as Error).message}`);
      failCount++;
    }

    console.log();
  }

  return { successCount, failCount, imageCost: totalImageCost };
}

// ─── Phase 2: Combat Map Generation ──────────────────────────────────────────

/**
 * Generate combat map grids using the image-first or text-to-grid pipeline.
 * Combat maps require tileData (20x20 grid) and region definitions.
 */
async function generateCombatMaps(
  combatSpecs: CampaignCombatMapSpec[],
  campaignSlug: string,
  db: admin.firestore.Firestore,
  useImages: boolean,
  stabilityKey: string | undefined,
): Promise<{ successCount: number; failCount: number; claudeCost: number; imageCost: number }> {
  let successCount = 0;
  let failCount = 0;
  let totalClaudeCost = 0;
  let totalImageCost = 0;

  for (const spec of combatSpecs) {
    console.log(`Generating combat map: ${spec.id} ("${spec.name}")...`);

    try {
      let tileData: number[];
      let regions: MapRegion[];
      let confidence: string;
      let claudeCost = 0;
      let imageCost = 0;
      let backgroundImageUrl: string | undefined;

      // Check for existing doc — skip image generation if image already exists
      const docId = `${campaignSlug}_${spec.id}`;
      const existingSnap = await db.collection("campaignMaps").doc(docId).get();
      const existing = existingSnap.exists ? (existingSnap.data() as CampaignMap) : null;

      if (existing?.backgroundImageUrl) {
        // Image already exists — reuse it, only regenerate tileData/regions if missing
        backgroundImageUrl = existing.backgroundImageUrl;
        console.log(`  ✓ Existing image found — skipping Stability AI generation`);

        if (existing.tileData?.length === 400 && existing.regions && existing.regions.length > 0) {
          // Full data exists — nothing to regenerate
          tileData = existing.tileData;
          regions = existing.regions;
          confidence = "high";
          console.log(`  ✓ Existing tileData and regions found — skipping vision analysis`);
        } else if (useImages) {
          // Has image but no grid data — download and re-analyze
          console.log(`  Downloading existing image for vision analysis...`);
          const imageResponse = await fetch(existing.backgroundImageUrl);
          if (!imageResponse.ok) throw new Error(`Failed to download image: ${imageResponse.status}`);
          const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
          console.log(`  ✓ Downloaded (${(imageBuffer.length / 1024).toFixed(0)} KB)`);

          console.log(`  Analyzing image (Claude Vision)...`);
          const analysisResult = await analyzeMapImageFromBuffer(imageBuffer, spec);
          tileData = analysisResult.tileData;
          regions = analysisResult.regions;
          confidence = analysisResult.confidence;
          claudeCost = analysisResult.cost;
        } else {
          // No image pipeline — generate grid from text
          const result = await generateMapFromSpec(spec);
          tileData = result.tileData;
          regions = result.regions;
          confidence = result.confidence;
          claudeCost = result.cost;
        }
      } else if (useImages) {
        // No existing image — full image-first pipeline
        try {
          console.log(`  Generating image (Stability AI)...`);
          const imageResult = await generateMapImage(spec, { apiKey: stabilityKey });
          imageCost = imageResult.cost;
          console.log(`  ✓ Image generated (${(imageResult.imageBuffer.length / 1024).toFixed(0)} KB)`);

          console.log(`  Analyzing image (Claude Vision)...`);
          const analysisResult = await analyzeMapImageFromBuffer(imageResult.imageBuffer, spec);
          tileData = analysisResult.tileData;
          regions = analysisResult.regions;
          confidence = analysisResult.confidence;
          claudeCost = analysisResult.cost;

          // Upload image to Firebase Storage
          if (process.env.FIREBASE_STORAGE_BUCKET) {
            try {
              console.log(`  Uploading image to Firebase Storage...`);
              backgroundImageUrl = await uploadMapImage(
                imageResult.imageBuffer,
                campaignSlug,
                spec.id,
              );
              console.log(`  ✓ Uploaded: ${backgroundImageUrl}`);
            } catch (uploadErr) {
              console.log(`  ⚠ Upload failed: ${(uploadErr as Error).message} — continuing without image URL`);
            }
          }
        } catch (imageErr) {
          // Image pipeline failed — fall back to text-to-grid
          console.log(`  ⚠ Image pipeline failed: ${(imageErr as Error).message}`);
          console.log(`  Falling back to text-to-grid...`);
          const fallbackResult = await generateMapFromSpec(spec);
          tileData = fallbackResult.tileData;
          regions = fallbackResult.regions;
          confidence = fallbackResult.confidence;
          claudeCost = fallbackResult.cost;
        }
      } else {
        // Text-to-grid pipeline (existing behavior)
        const result = await generateMapFromSpec(spec);
        tileData = result.tileData;
        regions = result.regions;
        confidence = result.confidence;
        claudeCost = result.cost;
      }

      const walkableCount = tileData.filter((v) => v === 0 || v === 2).length;
      const walkablePct = ((walkableCount / 400) * 100).toFixed(1);

      console.log(`  ✓ Generated (confidence: ${confidence})`);
      console.log(`    Tiles: ${walkableCount}/400 walkable (${walkablePct}%)`);
      console.log(`    Regions: ${regions.length}`);
      if (imageCost > 0) {
        console.log(`    Cost: Claude $${claudeCost.toFixed(4)} + Image $${imageCost.toFixed(4)} = $${(claudeCost + imageCost).toFixed(4)}`);
      } else {
        console.log(`    Cost: $${claudeCost.toFixed(4)}`);
      }
      if (backgroundImageUrl) {
        console.log(`    Image: ${backgroundImageUrl}`);
      }

      const campaignMap: CampaignMap = {
        campaignSlug,
        mapSpecId: spec.id,
        mapType: "combat",
        name: spec.name,
        gridSize: 20,
        feetPerSquare: spec.feetPerSquare,
        tileData: existing?.tileData ?? tileData,
        regions: existing?.regions ?? regions,
        ...(backgroundImageUrl ? { backgroundImageUrl } : {}),
        generatedAt: Date.now(),
      };

      if (existing) {
        console.log(`    Existing doc found — preserving tileData, regions, and backgroundImageUrl`);
      }

      await db.collection("campaignMaps").doc(docId).set(campaignMap);
      console.log(`    Saved: campaignMaps/${docId}`);

      totalClaudeCost += claudeCost;
      totalImageCost += imageCost;
      successCount++;
    } catch (err) {
      console.error(`  ✗ Failed: ${(err as Error).message}`);
      failCount++;
    }

    console.log();
  }

  return { successCount, failCount, claudeCost: totalClaudeCost, imageCost: totalImageCost };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  // Determine if image pipeline is available
  const stabilityKey = process.env.STABILITY_API_KEY;
  const useImages = !args.noImages && !!stabilityKey;

  if (!args.noImages && !stabilityKey) {
    console.log("⚠ STABILITY_API_KEY not set — falling back to text-to-grid pipeline.\n");
  }

  if (useImages && !process.env.FIREBASE_STORAGE_BUCKET) {
    console.log("⚠ FIREBASE_STORAGE_BUCKET not set — images will be generated but not uploaded.\n");
  }

  // Find the campaign
  const campaignData = ALL_CAMPAIGNS.find((c) => c.campaign.slug === args.campaign);
  if (!campaignData) {
    console.error(`Campaign "${args.campaign}" not found. Available campaigns:`);
    for (const c of ALL_CAMPAIGNS) {
      console.error(`  - ${c.campaign.slug}: ${c.campaign.title}`);
    }
    process.exit(1);
  }

  const campaign = campaignData.campaign;

  // Resolve exploration and combat map specs (with legacy mapSpecs fallback)
  const explorationSpecs: CampaignExplorationMapSpec[] = campaign.explorationMapSpecs ?? [];
  const combatSpecs: CampaignCombatMapSpec[] = campaign.combatMapSpecs ?? campaign.mapSpecs ?? [];

  const isLegacy = !campaign.combatMapSpecs && !!campaign.mapSpecs;
  if (isLegacy) {
    console.log("⚠ Campaign uses legacy mapSpecs — treating all specs as combat maps.\n");
  }

  const totalSpecCount = explorationSpecs.length + combatSpecs.length;

  if (totalSpecCount === 0) {
    console.error(`Campaign "${campaign.title}" has no map specs defined.`);
    process.exit(1);
  }

  // Filter by --map if provided (matches against both exploration and combat spec IDs)
  let filteredExplorationSpecs = explorationSpecs;
  let filteredCombatSpecs = combatSpecs;

  if (args.map) {
    const matchedExploration = explorationSpecs.filter((s) => s.id === args.map);
    const matchedCombat = combatSpecs.filter((s) => s.id === args.map);

    if (matchedExploration.length === 0 && matchedCombat.length === 0) {
      console.error(`Map spec "${args.map}" not found in campaign. Available specs:`);
      if (explorationSpecs.length > 0) {
        console.error("  Exploration maps:");
        for (const s of explorationSpecs) {
          console.error(`    - ${s.id}: ${s.name}`);
        }
      }
      if (combatSpecs.length > 0) {
        console.error("  Combat maps:");
        for (const s of combatSpecs) {
          console.error(`    - ${s.id}: ${s.name}`);
        }
      }
      process.exit(1);
    }

    filteredExplorationSpecs = matchedExploration;
    filteredCombatSpecs = matchedCombat;
  }

  const filteredTotal = filteredExplorationSpecs.length + filteredCombatSpecs.length;

  console.log(`\n── Campaign Map Generation ──`);
  console.log(`Campaign: ${campaign.title} (${campaign.slug})`);
  console.log(`Maps to generate: ${filteredTotal}/${totalSpecCount} (${filteredExplorationSpecs.length} exploration, ${filteredCombatSpecs.length} combat)`);
  console.log(`Pipeline: ${useImages ? "image-first (Stability AI → Claude Vision)" : "text-to-grid (Claude Sonnet)"}`);
  if (args.dryRun) console.log(`Mode: DRY RUN (no API calls, no Firestore writes)`);
  console.log();

  // Preview exploration maps
  if (filteredExplorationSpecs.length > 0) {
    console.log(`  ── Exploration Maps ──`);
    for (const spec of filteredExplorationSpecs) {
      console.log(`  ${spec.id}`);
      console.log(`    Name: ${spec.name}`);
      console.log(`    POIs: ${spec.pointsOfInterest.length} (${spec.pointsOfInterest.map((p) => p.name).join(", ")})`);
      console.log();
    }
  }

  // Preview combat maps
  if (filteredCombatSpecs.length > 0) {
    console.log(`  ── Combat Maps ──`);
    for (const spec of filteredCombatSpecs) {
      console.log(`  ${spec.id}`);
      console.log(`    Name: ${spec.name}`);
      console.log(`    Terrain: ${spec.terrain}, Lighting: ${spec.lighting}, Scale: ${spec.feetPerSquare}ft/sq`);
      console.log(`    Regions: ${spec.regions.length} (${spec.regions.map((r) => r.name).join(", ")})`);
      console.log();
    }
  }

  if (args.dryRun) {
    console.log(`✅ Dry run complete. ${filteredTotal} maps would be generated (${filteredExplorationSpecs.length} exploration, ${filteredCombatSpecs.length} combat).`);
    process.exit(0);
  }

  // Initialize Firebase for actual writes (need storage for image pipeline)
  initFirebase(useImages);
  const db = admin.firestore();

  let totalSuccessCount = 0;
  let totalFailCount = 0;
  let totalClaudeCost = 0;
  let totalImageCost = 0;

  // Phase 1: Exploration maps (image only)
  if (filteredExplorationSpecs.length > 0) {
    console.log(`── Phase 1: Exploration Maps (${filteredExplorationSpecs.length}) ──\n`);
    const explorationResult = await generateExplorationMaps(
      filteredExplorationSpecs,
      campaign.slug,
      db,
      useImages,
      stabilityKey,
    );
    totalSuccessCount += explorationResult.successCount;
    totalFailCount += explorationResult.failCount;
    totalImageCost += explorationResult.imageCost;
  }

  // Phase 2: Combat maps (image + grid analysis, or text-to-grid)
  if (filteredCombatSpecs.length > 0) {
    console.log(`── Phase 2: Combat Maps (${filteredCombatSpecs.length}) ──\n`);
    const combatResult = await generateCombatMaps(
      filteredCombatSpecs,
      campaign.slug,
      db,
      useImages,
      stabilityKey,
    );
    totalSuccessCount += combatResult.successCount;
    totalFailCount += combatResult.failCount;
    totalClaudeCost += combatResult.claudeCost;
    totalImageCost += combatResult.imageCost;
  }

  // Summary
  console.log(`── Summary ──`);
  console.log(`  Generated: ${totalSuccessCount}/${filteredTotal}`);
  if (totalFailCount > 0) console.log(`  Failed: ${totalFailCount}`);
  if (totalImageCost > 0 || totalClaudeCost > 0) {
    const parts: string[] = [];
    if (totalClaudeCost > 0) parts.push(`Claude $${totalClaudeCost.toFixed(4)}`);
    if (totalImageCost > 0) parts.push(`Image $${totalImageCost.toFixed(4)}`);
    const total = totalClaudeCost + totalImageCost;
    console.log(`  Cost: ${parts.join(" + ")} = $${total.toFixed(4)}`);
  }
  console.log();

  if (totalFailCount > 0) {
    console.log(`⚠ ${totalFailCount} map(s) failed. Re-run with --map <id> to retry individual maps.`);
  } else {
    console.log(`✅ All campaign maps generated successfully.`);
  }

  process.exit(totalFailCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Campaign map generation failed:", err);
  process.exit(1);
});
