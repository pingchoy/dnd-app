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
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import * as admin from "firebase-admin";
import { ALL_CAMPAIGNS } from "./campaigns";

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
  "layoutDescription",
  "atmosphereNotes",
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
): Promise<void> {
  console.log(`  Writing ${docs.length} docs to ${colPath}...`);
  let batch = db.batch();
  let opCount = 0;

  for (const { id, data } of docs) {
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
    console.log();
  }

  console.log("✅ Campaign seeding complete. Check your Firestore console.");
  for (const { campaign, acts } of ALL_CAMPAIGNS) {
    console.log(`   ${campaign.title}: campaigns/${campaign.slug} + ${acts.length} acts`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Campaign seeding failed:", err);
  process.exit(1);
});
