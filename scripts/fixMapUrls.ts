/**
 * fixMapUrls.ts
 *
 * One-off migration:
 * 1. Makes all campaign-maps/* files public in Firebase Storage.
 * 2. Rewrites backgroundImageUrl on all campaignMaps and maps docs
 *    to the correct firebasestorage.googleapis.com format.
 *
 * Usage: npx tsx scripts/fixMapUrls.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import * as admin from "firebase-admin";

admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!),
  ),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

/**
 * Extract the Storage file path from any known URL format.
 */
function extractFilePath(url: string): string | null {
  // Format: https://storage.googleapis.com/{bucket}/{path}
  const oldPrefix = "https://storage.googleapis.com/";
  if (url.startsWith(oldPrefix)) {
    const withoutPrefix = url.slice(oldPrefix.length);
    const slashIdx = withoutPrefix.indexOf("/");
    return withoutPrefix.slice(slashIdx + 1);
  }

  // Format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?alt=media
  const match = url.match(/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?]+)/);
  if (match) {
    return decodeURIComponent(match[1]);
  }

  return null;
}

function buildPublicUrl(filePath: string): string {
  const encodedPath = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media`;
}

async function main() {
  // Step 1: Make all campaign-maps/* files public
  console.log("Step 1: Making campaign-maps/* files public...\n");
  const [files] = await bucket.getFiles({ prefix: "campaign-maps/" });
  for (const file of files) {
    console.log(`  makePublic: ${file.name}`);
    await file.makePublic();
  }
  console.log(`\n  Made ${files.length} file(s) public.\n`);

  // Step 2: Fix URLs in Firestore
  console.log("Step 2: Fixing Firestore URLs...\n");
  let fixed = 0;
  let skipped = 0;

  // Fix campaignMaps (root collection)
  const campaignSnap = await db.collection("campaignMaps").get();
  for (const doc of campaignSnap.docs) {
    const data = doc.data();
    const url = data.backgroundImageUrl;
    if (!url) { skipped++; continue; }

    const filePath = extractFilePath(url);
    if (!filePath) { skipped++; continue; }

    const newUrl = buildPublicUrl(filePath);
    if (url === newUrl) { skipped++; continue; }

    console.log(`  campaignMaps/${doc.id}`);
    console.log(`    old: ${url}`);
    console.log(`    new: ${newUrl}`);
    await doc.ref.update({ backgroundImageUrl: newUrl });
    fixed++;
  }

  // Fix session-scoped maps (sessions/{id}/maps/{id})
  const sessionsSnap = await db.collection("sessions").get();
  for (const sessionDoc of sessionsSnap.docs) {
    const mapsSnap = await sessionDoc.ref.collection("maps").get();
    for (const mapDoc of mapsSnap.docs) {
      const data = mapDoc.data();
      const url = data.backgroundImageUrl;
      if (!url) { skipped++; continue; }

      const filePath = extractFilePath(url);
      if (!filePath) { skipped++; continue; }

      const newUrl = buildPublicUrl(filePath);
      if (url === newUrl) { skipped++; continue; }

      console.log(`  sessions/${sessionDoc.id}/maps/${mapDoc.id}`);
      console.log(`    old: ${url}`);
      console.log(`    new: ${newUrl}`);
      await mapDoc.ref.update({ backgroundImageUrl: newUrl });
      fixed++;
    }
  }

  console.log(`\nDone. Fixed: ${fixed}, Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
