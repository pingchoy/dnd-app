/**
 * POST /api/levelup
 *
 * Receives the player's level-up choices (ASI, feat, subclass, spells, etc.)
 * and applies all pending level-up changes atomically. Clears pendingLevelUp
 * and returns the updated GameState.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  applyLevelUp,
  loadGameState,
  LevelChoices,
} from "../../lib/gameState";

interface LevelUpRequestBody {
  characterId: string;
  choices: LevelChoices[];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as LevelUpRequestBody;
    const { characterId, choices } = body;

    if (!characterId?.trim()) {
      return NextResponse.json({ error: "characterId is required" }, { status: 400 });
    }
    if (!choices || !Array.isArray(choices)) {
      return NextResponse.json({ error: "choices array is required" }, { status: 400 });
    }

    console.log("[/api/levelup] Applying level-up for character:", characterId);
    const gameState = await loadGameState(characterId);

    if (!gameState.player.pendingLevelUp) {
      return NextResponse.json({ error: "No pending level-up" }, { status: 400 });
    }

    const updatedState = await applyLevelUp(characterId, choices);

    console.log("[/api/levelup] Level-up complete:", {
      newLevel: updatedState.player.level,
      maxHP: updatedState.player.maxHP,
    });

    return NextResponse.json({ gameState: updatedState });
  } catch (err: unknown) {
    console.error("[/api/levelup]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
