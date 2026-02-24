import { NextRequest, NextResponse } from "next/server";
import {
  createCharacter,
  loadCharacterSummaries,
  listAllCharacterSummaries,
  deleteCharacter,
  getCampaign,
  getCampaignAct,
} from "../../lib/characterStore";
import { adminDb } from "../../lib/firebaseAdmin";
import type { PlayerState, StoryState } from "../../lib/gameTypes";
import { DEFAULT_CAMPAIGN_SLUG } from "../../lib/gameTypes";
import { instantiateCampaignMaps } from "../../lib/mapStore";

/** GET /api/characters — list all characters, or filter by ?ids=abc,def. */
export async function GET(request: NextRequest) {
  try {
    const idsParam = request.nextUrl.searchParams.get("ids") ?? "";
    const ids = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);

    const characters =
      ids.length > 0
        ? await loadCharacterSummaries(ids)
        : await listAllCharacterSummaries();

    return NextResponse.json({ characters });
  } catch (err) {
    console.error("[/api/characters GET] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/** DELETE /api/characters — delete a character by ID. */
export async function DELETE(request: NextRequest) {
  try {
    interface DeleteCharacterBody {
      id: string;
    }

    const body = (await request.json()) as DeleteCharacterBody;
    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await deleteCharacter(body.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/characters DELETE] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    interface CreateCharacterBody {
      player: PlayerState;
      story: StoryState;
    }

    const body = (await request.json()) as CreateCharacterBody;
    const { player, story } = body;

    if (!player || !story) {
      return NextResponse.json(
        { error: "player and story are required" },
        { status: 400 },
      );
    }

    // Fetch the default campaign and override story fields
    const campaign = await getCampaign(DEFAULT_CAMPAIGN_SLUG);
    if (campaign) {
      story.campaignTitle = campaign.title;
      story.campaignBackground = campaign.playerTeaser;
      story.currentAct = 1;
    } else {
      console.warn(
        `[/api/characters] Campaign "${DEFAULT_CAMPAIGN_SLUG}" not found in Firestore — session will have no campaign data`,
      );
    }

    const { characterId, sessionId } = await createCharacter(
      player,
      story,
      DEFAULT_CAMPAIGN_SLUG,
    );

    // Instantiate campaign maps into the new session and set the starting
    // exploration map + POI from act 1. Falls back to the first exploration
    // map / first story beat if the act doesn't specify them explicitly.
    if (campaign && sessionId) {
      const { maps, specIdToSessionId } = await instantiateCampaignMaps(
        DEFAULT_CAMPAIGN_SLUG,
        sessionId,
        campaign,
      );
      if (maps.length > 0) {
        const act = await getCampaignAct(DEFAULT_CAMPAIGN_SLUG, 1);

        // Resolve exploration map: act's explorationMapSpecId → first story beat's mapSpecId → first exploration map
        let explorationMapId: string | undefined;
        const actSpecId = act?.explorationMapSpecId;
        if (actSpecId && specIdToSessionId.has(actSpecId)) {
          explorationMapId = specIdToSessionId.get(actSpecId);
        } else if (act?.storyBeats?.length) {
          const firstBeatMapSpec = act.storyBeats[0].mapSpecId;
          if (firstBeatMapSpec && specIdToSessionId.has(firstBeatMapSpec)) {
            explorationMapId = specIdToSessionId.get(firstBeatMapSpec);
          }
        }
        // Final fallback: first exploration map in the instantiated set
        if (!explorationMapId) {
          const firstExpl = maps.find((m) => m.mapType === "exploration");
          if (firstExpl) explorationMapId = firstExpl.id;
        }

        const startingPOIId = act?.startingPOIId;

        await adminDb
          .collection("sessions")
          .doc(sessionId)
          .update({
            currentExplorationMapId: explorationMapId ?? null,
            currentPOIId: startingPOIId ?? null,
            updatedAt: Date.now(),
          });
      }
    }

    return NextResponse.json({ id: characterId });
  } catch (err) {
    console.error("[/api/characters] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
