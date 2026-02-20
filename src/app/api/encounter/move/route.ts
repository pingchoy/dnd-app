/**
 * POST /api/encounter/move
 *
 * Lightweight endpoint for persisting token position changes on the combat grid.
 * No AI calls, no game logic — just a Firestore field update.
 */

import { NextRequest, NextResponse } from "next/server";
import { updateTokenPosition } from "../../../lib/encounterStore";
import type { GridPosition } from "../../../lib/gameTypes";

interface MoveRequestBody {
  encounterId: string;
  tokenId: string;
  position: GridPosition;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as MoveRequestBody;
    const { encounterId, tokenId, position } = body;

    if (!encounterId?.trim()) {
      return NextResponse.json({ error: "encounterId is required" }, { status: 400 });
    }
    if (!tokenId?.trim()) {
      return NextResponse.json({ error: "tokenId is required" }, { status: 400 });
    }
    if (position?.row == null || position?.col == null) {
      return NextResponse.json({ error: "position with row and col is required" }, { status: 400 });
    }

    await updateTokenPosition(encounterId, tokenId, position);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[/api/encounter/move]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
