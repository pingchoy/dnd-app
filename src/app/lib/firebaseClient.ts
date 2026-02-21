/**
 * firebaseClient.ts
 *
 * Firebase Client SDK initialization for real-time Firestore listeners.
 * Uses NEXT_PUBLIC_ env vars only (no secrets — read-only for game data).
 *
 * The admin SDK (firebaseAdmin.ts) handles all writes server-side.
 * This client SDK is used by the frontend to subscribe to the messages
 * subcollection via onSnapshot for real-time message delivery.
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
};

/** Get or create the Firebase client app (singleton). */
function getFirebaseApp() {
  if (getApps().length > 0) return getApp();
  return initializeApp(firebaseConfig);
}

/** Get the client-side Firestore instance for real-time listeners. */
export function getClientDb(): Firestore {
  return getFirestore(getFirebaseApp());
}
