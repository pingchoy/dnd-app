import * as admin from "firebase-admin";

/** Lazily initialize Firebase Admin — avoids crashing at import time when
 *  env vars aren't available (e.g. during Next.js static build on Vercel). */
function getApp(): admin.app.App {
  if (admin.apps.length) return admin.apps[0]!;
  return admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!),
    ),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

/** Firestore instance — initialized on first access. */
export const adminDb = new Proxy({} as admin.firestore.Firestore, {
  get(_target, prop, receiver) {
    const db = getApp().firestore();
    const value = Reflect.get(db, prop, receiver);
    return typeof value === "function" ? value.bind(db) : value;
  },
});

/** Firebase Storage bucket — initialized on first access. */
export const adminBucket = new Proxy(
  {} as ReturnType<ReturnType<typeof admin.storage>["bucket"]>,
  {
    get(_target, prop, receiver) {
      const bucket = getApp()
        .storage()
        .bucket(process.env.FIREBASE_STORAGE_BUCKET);
      const value = Reflect.get(bucket, prop, receiver);
      return typeof value === "function" ? value.bind(bucket) : value;
    },
  },
);
