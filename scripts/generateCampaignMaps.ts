/**
 * generateCampaignMaps.ts
 *
 * CLI tool that generates MapDocument-compatible grids from a campaign's
 * CampaignMapSpec definitions. Uses Claude Sonnet to convert text layout
 * descriptions into 20×20 tile grids with regions.
 *
 * Generated maps are stored as templates in campaignMaps/{campaignSlug}_{mapSpecId}
 * and instantiated into session-scoped maps/ when a campaign starts.
 *
 * Usage:
 *   npm run generate:maps -- --campaign the-crimson-accord
 *   npm run generate:maps -- --campaign the-crimson-accord --map valdris-docks
 *   npm run generate:maps -- --campaign the-crimson-accord --dry-run
 *
 * Prerequisites:
 *   - ANTHROPIC_API_KEY env var
 *   - FIREBASE_SERVICE_ACCOUNT_KEY env var containing service account JSON string
 *
 * Cost: ~$0.03-0.05 per map, ~$0.40 total for 8 Crimson Accord maps.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import * as admin from "firebase-admin";
import { ALL_CAMPAIGNS } from "./campaigns";
import { generateMapFromSpec } from "./lib/mapGenerationAgent";
import type { CampaignMapSpec, CampaignMap } from "../src/app/lib/gameTypes";

// ─── Firebase Admin Init ──────────────────────────────────────────────────────

let firebaseInitialized = false;

function initFirebase(): void {
  if (firebaseInitialized) return;
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!),
    ),
  });
  admin.firestore().settings({ ignoreUndefinedProperties: true });
  firebaseInitialized = true;
}

// ─── CLI Argument Parsing ─────────────────────────────────────────────────────

interface CLIArgs {
  campaign: string;
  map?: string;
  dryRun: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i].startsWith("--") && i + 1 < args.length) {
      const key = args[i].replace("--", "");
      parsed[key] = args[++i];
    }
  }

  if (!parsed.campaign) {
    console.error("Usage: npm run generate:maps -- --campaign <slug> [--map <mapSpecId>] [--dry-run]");
    console.error("  --campaign  Required. Campaign slug (e.g. 'the-crimson-accord')");
    console.error("  --map       Optional. Generate only this map spec (e.g. 'valdris-docks')");
    console.error("  --dry-run   Optional. Preview generation plan without calling Claude or saving");
    process.exit(1);
  }

  return {
    campaign: parsed.campaign,
    map: parsed.map,
    dryRun,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

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
  let specsToGenerate: CampaignMapSpec[];
  if (args.map) {
    const found = mapSpecs.find((s) => s.id === args.map);
    if (!found) {
      console.error(`Map spec "${args.map}" not found in campaign. Available specs:`);
      for (const s of mapSpecs) {
        console.error(`  - ${s.id}: ${s.name}`);
      }
      process.exit(1);
    }
    specsToGenerate = [found];
  } else {
    specsToGenerate = mapSpecs;
  }

  console.log(`\n── Campaign Map Generation ──`);
  console.log(`Campaign: ${campaign.title} (${campaign.slug})`);
  console.log(`Maps to generate: ${specsToGenerate.length}/${mapSpecs.length}`);
  if (args.dryRun) console.log(`Mode: DRY RUN (no Claude calls, no Firestore writes)`);
  console.log();

  // Preview generation plan
  for (const spec of specsToGenerate) {
    console.log(`  ${spec.id}`);
    console.log(`    Name: ${spec.name}`);
    console.log(`    Terrain: ${spec.terrain}, Lighting: ${spec.lighting}, Scale: ${spec.feetPerSquare}ft/sq`);
    console.log(`    Regions: ${spec.regions.length} (${spec.regions.map((r) => r.name).join(", ")})`);
    console.log(`    Acts: ${spec.actNumbers.join(", ")}`);
    if (spec.connections?.length) {
      console.log(`    Connections: ${spec.connections.map((c) => `${c.direction} → ${c.targetMapSpecId}`).join(", ")}`);
    }
    console.log();
  }

  if (args.dryRun) {
    console.log(`✅ Dry run complete. ${specsToGenerate.length} maps would be generated.`);
    process.exit(0);
  }

  // Initialize Firebase for actual writes
  initFirebase();
  const db = admin.firestore();

  let totalCost = 0;
  let successCount = 0;
  let failCount = 0;

  for (const spec of specsToGenerate) {
    console.log(`Generating: ${spec.id} ("${spec.name}")...`);

    try {
      const result = await generateMapFromSpec(spec);

      const walkableCount = result.tileData.filter((v) => v === 0 || v === 2).length;
      const walkablePct = ((walkableCount / 400) * 100).toFixed(1);

      console.log(`  ✓ Generated (confidence: ${result.confidence})`);
      console.log(`    Tiles: ${walkableCount}/400 walkable (${walkablePct}%)`);
      console.log(`    Regions: ${result.regions.length}`);
      console.log(`    Cost: $${result.cost.toFixed(4)}`);

      // Save to Firestore as campaign map template
      const docId = `${campaign.slug}_${spec.id}`;
      const campaignMap: CampaignMap = {
        campaignSlug: campaign.slug,
        mapSpecId: spec.id,
        name: spec.name,
        gridSize: 20,
        feetPerSquare: spec.feetPerSquare,
        tileData: result.tileData,
        regions: result.regions,
        generatedAt: Date.now(),
      };

      await db.collection("campaignMaps").doc(docId).set(campaignMap);
      console.log(`    Saved: campaignMaps/${docId}`);

      totalCost += result.cost;
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
  console.log(`  Total cost: $${totalCost.toFixed(4)}`);
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
