/**
 * Firebase Storage Upload
 *
 * Uploads generated map images to Firebase Storage and returns public URLs.
 * Images are stored at: campaign-maps/{campaignSlug}/{mapSpecId}.webp
 */

import * as admin from "firebase-admin";

/**
 * Upload a WebP image buffer to Firebase Storage and return its public download URL.
 * Requires Firebase Admin to be initialized with a storageBucket.
 */
export async function uploadMapImage(
  imageBuffer: Buffer,
  campaignSlug: string,
  mapSpecId: string,
): Promise<string> {
  const bucket = admin.storage().bucket();
  const filePath = `campaign-maps/${campaignSlug}/${mapSpecId}.webp`;
  const file = bucket.file(filePath);

  await file.save(imageBuffer, {
    contentType: "image/webp",
    metadata: {
      cacheControl: "public, max-age=31536000",
    },
  });

  await file.makePublic();

  const encodedPath = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media`;
}
