import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!),
    ),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

export const adminDb = admin.firestore();

/** Firebase Storage bucket — requires FIREBASE_STORAGE_BUCKET env var. */
export const adminBucket = admin
  .storage()
  .bucket(process.env.FIREBASE_STORAGE_BUCKET);
