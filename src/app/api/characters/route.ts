import { NextRequest, NextResponse } from "next/server";
import { createCharacter, loadCharacterSummaries, deleteCharacter } from "../../lib/characterStore";
import type { PlayerState, StoryState } from "../../lib/gameTypes";

/** GET /api/characters?ids=abc,def — fetch lightweight summaries for a set of character IDs. */
export async function GET(request: NextRequest) {
  try {
    const idsParam = request.nextUrl.searchParams.get("ids") ?? "";
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);

    if (ids.length === 0) {
      return NextResponse.json({ characters: [] });
    }

    const characters = await loadCharacterSummaries(ids);
    return NextResponse.json({ characters });
  } catch (err) {
    console.error("[/api/characters GET] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** DELETE /api/characters — delete a character by ID. */
export async function DELETE(request: NextRequest) {
  try {
    interface DeleteCharacterBody {
      id: string;
    }

    const body = await request.json() as DeleteCharacterBody;
    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await deleteCharacter(body.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/characters DELETE] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    interface CreateCharacterBody {
      player: PlayerState;
      story: StoryState;
    }

    const body = await request.json() as CreateCharacterBody;
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
