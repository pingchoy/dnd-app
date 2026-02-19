import { NextRequest, NextResponse } from "next/server";
import { createCharacter } from "../../lib/characterStore";
import type { PlayerState, StoryState } from "../../lib/gameState";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { player: PlayerState; story: StoryState };
    const { player, story } = body;

    if (!player || !story) {
      return NextResponse.json(
        { error: "player and story are required" },
        { status: 400 },
      );
    }

    const id = await createCharacter(player, story);
    return NextResponse.json({ id });
  } catch (err) {
    console.error("[/api/characters] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
