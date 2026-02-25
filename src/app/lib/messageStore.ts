/**
 * messageStore.ts
 *
 * Firestore CRUD for message subcollections.
 *
 * Two subcollections under each session:
 *   sessions/{sessionId}/messages/{messageId}        — narrative / chat messages
 *   sessions/{sessionId}/combatMessages/{messageId}  — combat turn narrations
 *
 * The frontend subscribes to both via onSnapshot and merges them for display.
 * The DM agent only reads from `messages` so combat logs don't pollute its context.
 */

import { adminDb } from "./firebaseAdmin";
import type { StoredMessage } from "./gameTypes";

/**
 * Write a narrative/chat message to the messages subcollection.
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
 * Write a combat narration message to the combatMessages subcollection.
 * Kept separate so the DM agent's context window isn't polluted with
 * turn-by-turn combat narration.
 */
export async function addCombatMessage(
  sessionId: string,
  message: Omit<StoredMessage, "id">,
): Promise<string> {
  const ref = adminDb
    .collection("sessions")
    .doc(sessionId)
    .collection("combatMessages")
    .doc();

  await ref.set(JSON.parse(JSON.stringify(message)));
  return ref.id;
}

/**
 * Query the last N narrative messages for agent context windows.
 * Returns messages in chronological order (oldest first).
 * Only reads from the `messages` subcollection (excludes combat narration).
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

/**
 * Query the last N combat messages for combat agent context windows.
 * Returns messages in chronological order (oldest first).
 */
export async function getRecentCombatMessages(
  sessionId: string,
  limit: number,
): Promise<StoredMessage[]> {
  const snap = await adminDb
    .collection("sessions")
    .doc(sessionId)
    .collection("combatMessages")
    .orderBy("timestamp", "desc")
    .limit(limit)
    .get();

  const messages: StoredMessage[] = snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Omit<StoredMessage, "id">) }))
    .reverse();

  return messages;
}
