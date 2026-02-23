/**
 * generateCampaignMaps.ts
 *
 * CLI tool that generates MapDocument-compatible grids from a campaign's
 * CampaignMapSpec definitions. Two pipelines:
 *
 * Image-first (when STABILITY_API_KEY is set and --no-images is not used):
 *   Stability AI → PNG image → Claude Vision (+ spec region hints) → tileData + regions
 *   Image uploaded to Firebase Storage → backgroundImageUrl on the CampaignMap
 *
 * Text-to-grid fallback (no STABILITY_API_KEY or --no-images):
 *   Claude Sonnet → tileData + regions from text description
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
 *   Image flow: ~$0.06 per map ($0.03 Stability + ~$0.03 Claude Vision)
 *   Text fallback: ~$0.03-0.05 per map (Claude Sonnet)
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import * as admin from "firebase-admin";
import { ALL_CAMPAIGNS } from "./campaigns";
import { generateMapFromSpec, analyzeMapImageFromBuffer } from "./lib/mapGenerationAgent";
import { generateMapImage } from "./lib/stabilityImageAgent";
import { uploadMapImage } from "./lib/firebaseStorageUpload";
import type { CampaignMapSpec, CampaignMap, MapRegion } from "../src/app/lib/gameTypes";

// Legacy spec shape — includes fields that moved to POI level in Task 1
interface LegacyMapSpec extends CampaignMapSpec {
  actNumbers?: number[];
  connections?: Array<{ targetMapSpecId: string; direction: string; description: string }>;
}

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
    console.error("  --map         Optional. Generate only this map spec (e.g. 'valdris-docks')");
    console.error("  --dry-run     Optional. Preview generation plan without calling APIs or saving");
    console.error("  --no-images   Optional. Skip image generation, use text-to-grid only");
    process.exit(1);
  }

  return {
    campaign: parsed.campaign,
    map: parsed.map,
    dryRun,
    noImages,
  };
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
  const mapSpecs = campaign.mapSpecs;

  if (!mapSpecs || mapSpecs.length === 0) {
    console.error(`Campaign "${campaign.title}" has no mapSpecs defined.`);
    process.exit(1);
  }

  // Filter by --map if provided
  // Cast to LegacyMapSpec for backwards compat (actNumbers/connections on specs)
  let specsToGenerate: LegacyMapSpec[];
  if (args.map) {
    const found = mapSpecs.find((s) => s.id === args.map);
    if (!found) {
      console.error(`Map spec "${args.map}" not found in campaign. Available specs:`);
      for (const s of mapSpecs) {
        console.error(`  - ${s.id}: ${s.name}`);
      }
      process.exit(1);
    }
    specsToGenerate = [found as LegacyMapSpec];
  } else {
    specsToGenerate = mapSpecs as LegacyMapSpec[];
  }

  console.log(`\n── Campaign Map Generation ──`);
  console.log(`Campaign: ${campaign.title} (${campaign.slug})`);
  console.log(`Maps to generate: ${specsToGenerate.length}/${mapSpecs.length}`);
  console.log(`Pipeline: ${useImages ? "image-first (Stability AI → Claude Vision)" : "text-to-grid (Claude Sonnet)"}`);
  if (args.dryRun) console.log(`Mode: DRY RUN (no API calls, no Firestore writes)`);
  console.log();

  // Preview generation plan
  for (const spec of specsToGenerate) {
    console.log(`  ${spec.id}`);
    console.log(`    Name: ${spec.name}`);
    console.log(`    Terrain: ${spec.terrain}, Lighting: ${spec.lighting}, Scale: ${spec.feetPerSquare}ft/sq`);
    console.log(`    Regions: ${spec.regions.length} (${spec.regions.map((r) => r.name).join(", ")})`);
    if (spec.actNumbers?.length) {
      console.log(`    Acts: ${spec.actNumbers.join(", ")}`);
    }
    if (spec.connections?.length) {
      console.log(`    Connections: ${spec.connections.map((c: { direction: string; targetMapSpecId: string }) => `${c.direction} → ${c.targetMapSpecId}`).join(", ")}`);
    }
    console.log();
  }

  if (args.dryRun) {
    console.log(`✅ Dry run complete. ${specsToGenerate.length} maps would be generated.`);
    process.exit(0);
  }

  // Initialize Firebase for actual writes (need storage only for image pipeline)
  initFirebase(useImages);
  const db = admin.firestore();

  let totalClaudeCost = 0;
  let totalImageCost = 0;
  let successCount = 0;
  let failCount = 0;

  for (const spec of specsToGenerate) {
    console.log(`Generating: ${spec.id} ("${spec.name}")...`);

    try {
      let tileData: number[];
      let regions: MapRegion[];
      let confidence: string;
      let claudeCost = 0;
      let imageCost = 0;
      let backgroundImageUrl: string | undefined;

      // Check for existing doc — skip image generation if image already exists
      const docId = `${campaign.slug}_${spec.id}`;
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
                campaign.slug,
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
        campaignSlug: campaign.slug,
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

  // Summary
  console.log(`── Summary ──`);
  console.log(`  Generated: ${successCount}/${specsToGenerate.length}`);
  if (failCount > 0) console.log(`  Failed: ${failCount}`);
  if (totalImageCost > 0) {
    console.log(`  Cost: Claude $${totalClaudeCost.toFixed(4)} + Image $${totalImageCost.toFixed(4)} = $${(totalClaudeCost + totalImageCost).toFixed(4)}`);
  } else {
    console.log(`  Total cost: $${totalClaudeCost.toFixed(4)}`);
  }
  console.log();

  if (failCount > 0) {
    console.log(`⚠ ${failCount} map(s) failed. Re-run with --map <id> to retry individual maps.`);
  } else {
    console.log(`✅ All campaign maps generated successfully.`);
  }

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Campaign map generation failed:", err);
  process.exit(1);
});
