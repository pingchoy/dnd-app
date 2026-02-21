/**
 * actionQueue.ts
 *
 * Firestore-backed action queue for serializing player actions.
 * Path: sessions/{sessionId}/actions/{actionId}
 *
 * Concurrency guarantee: Only one action per session is ever "processing"
 * at a time. A Firestore transaction prevents double-claims.
 *
 * Flow:
 * 1. Player POST enqueues an action doc with status "pending"
 * 2. Same POST runs a transaction to claim the oldest pending action
 * 3. If claim succeeds, process it (run agents, write messages, persist state)
 * 4. When done, mark "completed" and check for next pending action
 * 5. If claim fails, return immediately — the active processor picks up the queued action
 */

import { adminDb } from "./firebaseAdmin";
import type { StoredAction } from "./gameTypes";

/** How long (ms) before a "processing" action is considered stale and reclaimable. */
const STALE_THRESHOLD_MS = 60_000;

/**
 * Add a new pending action to the queue.
 * Returns the auto-generated action document ID.
 */
export async function enqueueAction(
  sessionId: string,
  action: Omit<StoredAction, "id" | "status" | "createdAt">,
): Promise<string> {
  const ref = adminDb
    .collection("sessions")
    .doc(sessionId)
    .collection("actions")
    .doc();

  const doc: Omit<StoredAction, "id"> = {
    ...action,
    status: "pending",
    createdAt: Date.now(),
  };

  await ref.set(doc);
  return ref.id;
}

/**
 * Attempt to atomically claim the next pending action for processing.
 *
 * Uses a Firestore transaction to:
 * 1. Check if any action is currently "processing" (and not stale)
 * 2. If so, return null (another processor is active)
 * 3. Otherwise, claim the oldest "pending" action by setting it to "processing"
 *
 * Returns the claimed action, or null if claim failed or no pending actions.
 */
export async function claimNextAction(
  sessionId: string,
): Promise<StoredAction | null> {
  const actionsRef = adminDb
    .collection("sessions")
    .doc(sessionId)
    .collection("actions");

  return adminDb.runTransaction(async (tx) => {
    // Check for an already-processing action
    const processingSnap = await tx.get(
      actionsRef
        .where("status", "==", "processing")
        .orderBy("createdAt", "asc")
        .limit(1),
    );

    if (!processingSnap.empty) {
      const processingDoc = processingSnap.docs[0];
      const processingData = processingDoc.data() as StoredAction;

      // Check staleness — reclaim if older than threshold
      const age = Date.now() - processingData.createdAt;
      if (age < STALE_THRESHOLD_MS) {
        // Another processor is actively working — do not claim
        return null;
      }

      // Stale action — mark it as failed so we can proceed
      tx.update(processingDoc.ref, {
        status: "failed",
        processedAt: Date.now(),
      });
    }

    // Find the oldest pending action
    const pendingSnap = await tx.get(
      actionsRef
        .where("status", "==", "pending")
        .orderBy("createdAt", "asc")
        .limit(1),
    );

    if (pendingSnap.empty) return null;

    const actionDoc = pendingSnap.docs[0];
    const actionData = actionDoc.data() as StoredAction;

    // Claim it
    tx.update(actionDoc.ref, {
      status: "processing",
      processedAt: Date.now(),
    });

    return { ...actionData, id: actionDoc.id, status: "processing" as const };
  });
}

/**
 * Mark an action as completed and return whether there are more pending actions.
 */
export async function completeAction(
  sessionId: string,
  actionId: string,
): Promise<boolean> {
  const actionsRef = adminDb
    .collection("sessions")
    .doc(sessionId)
    .collection("actions");

  await actionsRef.doc(actionId).update({
    status: "completed",
    processedAt: Date.now(),
  });

  // Check if there are more pending actions
  const pendingSnap = await actionsRef
    .where("status", "==", "pending")
    .limit(1)
    .get();

  return !pendingSnap.empty;
}

/**
 * Mark an action as failed (e.g. when processing throws an error).
 */
export async function failAction(
  sessionId: string,
  actionId: string,
): Promise<void> {
  await adminDb
    .collection("sessions")
    .doc(sessionId)
    .collection("actions")
    .doc(actionId)
    .update({
      status: "failed",
      processedAt: Date.now(),
    });
}
