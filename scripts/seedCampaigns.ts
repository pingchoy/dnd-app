/**
 * seedCampaigns.ts
 *
 * Seeds all premade campaign content to Firestore. Campaign data lives in
 * scripts/campaigns/ — each campaign is a separate file exporting a CampaignData object.
 *
 * Run with:
 *   npm run seed:campaigns
 *
 * Prerequisites:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY env var containing service account JSON string
 *
 * Collections seeded:
 *   campaigns/{slug}                    (campaign metadata + NPC profiles)
 *   campaignActs/{campaignSlug}_act-{N} (per-act content)
 *   campaignMaps/{slug}_{mapSpecId}     (pre-generated map templates)
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import * as admin from "firebase-admin";
import { ALL_CAMPAIGNS } from "./campaigns";
import type {
  Campaign,
  CampaignMap,
  PointOfInterest,
} from "../src/app/lib/gameTypes";

// ─── Firebase Admin Init ──────────────────────────────────────────────────────

admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!),
  ),
});

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// ─── Lowercase normalizer ─────────────────────────────────────────────────────

/**
 * Recursively lowercase all string values in an object tree.
 * Keys in PRESERVE_CASE_KEYS are left untouched — these hold prose/narrative
 * descriptions whose formatting depends on original casing.
 */
const PRESERVE_CASE_KEYS = new Set([
  "description",
  "playerTeaser",
  "dmSummary",
  "dmBriefing",
  "dmNotes",
  "dmGuidance",
  "voiceNotes",
  "appearance",
  "betrayalTrigger",
  "transitionToNextAct",
  "summary",
  "setting",
  "specialAbilities",
  "imagePrompt",
]);

function lowercaseStrings(value: unknown, key?: string): unknown {
  if (key && PRESERVE_CASE_KEYS.has(key)) return value;
  if (typeof value === "string") return value.toLowerCase();
  if (Array.isArray(value)) return value.map((item) => lowercaseStrings(item));
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = lowercaseStrings(v, k);
    }
    return result;
  }
  return value;
}

// ─── Batch writer ─────────────────────────────────────────────────────────────

const BATCH_SIZE = 400;

async function batchWrite(
  colPath: string,
  docs: Array<{ id: string; data: Record<string, unknown> }>,
  skipExisting = false,
): Promise<{ written: number; skipped: number }> {
  let filteredDocs = docs;

  if (skipExisting) {
    const existing = new Set<string>();
    for (const { id } of docs) {
      const snap = await db.collection(colPath).doc(id).get();
      if (snap.exists) existing.add(id);
    }
    filteredDocs = docs.filter((d) => !existing.has(d.id));
    if (existing.size > 0) {
      console.log(`  Skipping ${existing.size} existing docs in ${colPath}`);
    }
  }

  if (filteredDocs.length === 0) {
    console.log(`  No new docs to write to ${colPath}`);
    return { written: 0, skipped: docs.length - filteredDocs.length };
  }

  console.log(`  Writing ${filteredDocs.length} docs to ${colPath}...`);
  let batch = db.batch();
  let opCount = 0;

  for (const { id, data } of filteredDocs) {
    batch.set(
      db.collection(colPath).doc(id),
      lowercaseStrings(data) as Record<string, unknown>,
    );
    opCount++;

    if (opCount >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  }

  if (opCount > 0) await batch.commit();
  return { written: filteredDocs.length, skipped: docs.length - filteredDocs.length };
}

// ─── Campaign Map Builder ────────────────────────────────────────────────────

const GRID_SIZE = 20;

/**
 * Build CampaignMap documents from a campaign's exploration + combat map specs.
 * Combat maps get a blank 20x20 grid; exploration maps get POIs with empty
 * combatMapId (filled at session instantiation time).
 */
function buildCampaignMapDocs(
  campaign: Campaign,
): Array<{ id: string; data: Record<string, unknown> }> {
  const slug = campaign.slug;
  const now = Date.now();
  const docs: Array<{ id: string; data: Record<string, unknown> }> = [];

  // Combat maps
  for (const spec of campaign.combatMapSpecs ?? []) {
    const mapDoc: CampaignMap = {
      campaignSlug: slug,
      mapSpecId: spec.id,
      mapType: "combat",
      name: spec.name,
      imagePrompt: spec.imagePrompt,
      gridSize: GRID_SIZE,
      feetPerSquare: spec.feetPerSquare,
      tileData: new Array(GRID_SIZE * GRID_SIZE).fill(0),
      regions: [],
      generatedAt: now,
    };
    docs.push({
      id: `${slug}_${spec.id}`,
      data: mapDoc as unknown as Record<string, unknown>,
    });
  }

  // Exploration maps
  for (const spec of campaign.explorationMapSpecs ?? []) {
    const pois: PointOfInterest[] = spec.pointsOfInterest.map((poiSpec) => ({
      id: poiSpec.id,
      number: poiSpec.number,
      name: poiSpec.name,
      description: poiSpec.description,
      position: poiSpec.position ?? { x: 50, y: 50 },
      combatMapId: poiSpec.combatMapSpecId,
      isHidden: poiSpec.isHidden,
      actNumbers: poiSpec.actNumbers,
      locationTags: poiSpec.locationTags,
      defaultNPCSlugs: poiSpec.defaultNPCSlugs,
    }));

    const mapDoc: CampaignMap = {
      campaignSlug: slug,
      mapSpecId: spec.id,
      mapType: "exploration",
      name: spec.name,
      imagePrompt: spec.imagePrompt,
      pointsOfInterest: pois,
      backgroundImageUrl: "",
      generatedAt: now,
    };
    docs.push({
      id: `${slug}_${spec.id}`,
      data: mapDoc as unknown as Record<string, unknown>,
    });
  }

  return docs;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`Starting campaign seeding (${ALL_CAMPAIGNS.length} campaign${ALL_CAMPAIGNS.length !== 1 ? "s" : ""})...\n`);

  for (const { campaign, acts } of ALL_CAMPAIGNS) {
    const slug = campaign.slug;

    // Seed campaign document
    console.log(`── Seeding campaign: "${campaign.title}" ──`);
    await batchWrite("campaigns", [
      { id: slug, data: campaign as unknown as Record<string, unknown> },
    ]);
    console.log(`  ✓ Campaign doc seeded to campaigns/${slug}`);

    // Seed act documents
    const actDocs = acts.map((act) => ({
      id: `${slug}_act-${act.actNumber}`,
      data: act as unknown as Record<string, unknown>,
    }));
    await batchWrite("campaignActs", actDocs);
    for (const act of acts) {
      console.log(`  ✓ Act ${act.actNumber}: "${act.title}" seeded`);
    }

    // Seed campaign map templates — skip docs that already exist to preserve
    // user-generated content (uploaded images, edited grids, positioned POIs)
    const mapDocs = buildCampaignMapDocs(campaign);
    if (mapDocs.length > 0) {
      const { written, skipped } = await batchWrite("campaignMaps", mapDocs, true);
      const combatCount = mapDocs.filter((d) => (d.data as unknown as CampaignMap).mapType === "combat").length;
      const explorationCount = mapDocs.length - combatCount;
      console.log(`  ✓ ${mapDocs.length} campaign maps (${combatCount} combat, ${explorationCount} exploration): ${written} new, ${skipped} existing preserved`);
    }
    console.log();
  }

  console.log("✅ Campaign seeding complete. Check your Firestore console.");
  for (const { campaign, acts } of ALL_CAMPAIGNS) {
    const mapCount = (campaign.combatMapSpecs?.length ?? 0) + (campaign.explorationMapSpecs?.length ?? 0);
    console.log(`   ${campaign.title}: campaigns/${campaign.slug} + ${acts.length} acts + ${mapCount} maps`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Campaign seeding failed:", err);
  process.exit(1);
});
