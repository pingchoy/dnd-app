/**
 * POST /api/maps/move
 *
 * Lightweight endpoint for persisting exploration-mode token position changes.
 * Updates the session's explorationPositions field via Firestore dot-notation.
 * No AI calls, no game logic — just a field update.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "../../../lib/firebaseAdmin";
import type { GridPosition } from "../../../lib/gameTypes";

interface MoveRequestBody {
  sessionId: string;
  tokenId: string;
  position: GridPosition;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as MoveRequestBody;
    const { sessionId, tokenId, position } = body;

    if (!sessionId?.trim()) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }
    if (!tokenId?.trim()) {
      return NextResponse.json({ error: "tokenId is required" }, { status: 400 });
    }
    if (position?.row == null || position?.col == null) {
      return NextResponse.json({ error: "position with row and col is required" }, { status: 400 });
    }

    await adminDb.collection("sessions").doc(sessionId).update({
      [`explorationPositions.${tokenId}`]: position,
      updatedAt: Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[/api/maps/move]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
