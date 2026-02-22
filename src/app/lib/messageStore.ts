/**
 * messageStore.ts
 *
 * Firestore CRUD for the messages subcollection.
 * Path: sessions/{sessionId}/messages/{messageId}
 *
 * All game communication (player messages, DM narrations, roll results,
 * combat narrations) is stored as individual documents in this subcollection.
 * The frontend subscribes via onSnapshot for real-time delivery.
 */

import { adminDb } from "./firebaseAdmin";
import type { StoredMessage } from "./gameTypes";

/**
 * Write a message document to the messages subcollection.
 * Returns the auto-generated document ID.
 */
export async function addMessage(
  sessionId: string,
  message: Omit<StoredMessage, "id">,
): Promise<string> {
  const ref = adminDb
    .collection("sessions")
    .doc(sessionId)
    .collection("messages")
    .doc();

  // JSON round-trip strips undefined values that Firestore rejects
  await ref.set(JSON.parse(JSON.stringify(message)));
  return ref.id;
}

/**
 * Query the last N messages from the subcollection for agent context windows.
 * Returns messages in chronological order (oldest first).
 */
export async function getRecentMessages(
  sessionId: string,
  limit: number,
): Promise<StoredMessage[]> {
  const snap = await adminDb
    .collection("sessions")
    .doc(sessionId)
    .collection("messages")
    .orderBy("timestamp", "desc")
    .limit(limit)
    .get();

  const messages: StoredMessage[] = snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Omit<StoredMessage, "id">) }))
    .reverse(); // reverse to chronological order (oldest first)

  return messages;
}
