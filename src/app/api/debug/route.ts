/**
 * POST /api/debug
 *
 * Debug actions for the Demigod Menu. Gated on the server side by
 * NEXT_PUBLIC_DEMIGOD_MODE so the route is inert in production.
 *
 * Actions:
 *   force_combat   — spawn a Goblin via SRD + NPC agent
 *   force_level_up — award enough XP to reach the next level
 */

import { NextRequest, NextResponse } from "next/server";
import {
  awardXPAsync,
  createNPC,
  getEncounter,
  getGameState,
  getSessionId,
  getCampaignSlug,
  loadGameState,
  setEncounter,
  xpForLevel,
} from "../../lib/gameState";
import { saveCharacterState, querySRD, loadSession, getCampaignAct } from "../../lib/characterStore";
import { createEncounter, computeInitialPositions, saveEncounterState } from "../../lib/encounterStore";
import { getNPCStats } from "../../agents/npcAgent";
import { addMessage } from "../../lib/messageStore";

export async function POST(req: NextRequest) {
  // Gate: only active when NEXT_PUBLIC_DEMIGOD_MODE is "true"
  if (process.env.NEXT_PUBLIC_DEMIGOD_MODE !== "true") {
    return NextResponse.json({ error: "Debug mode is not enabled" }, { status: 403 });
  }

  try {
    interface DebugRequestBody {
      characterId: string;
      action: string;
    }

    const body = (await req.json()) as DebugRequestBody;

    const { characterId, action } = body;

    if (!characterId?.trim()) {
      return NextResponse.json({ error: "characterId is required" }, { status: 400 });
    }
    if (!action?.trim()) {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
    }

    console.log(`[/api/debug] Action: ${action}, Character: ${characterId}`);
    const gameState = await loadGameState(characterId);

    switch (action) {
      case "force_combat": {
        // Query SRD for goblin monster data
        const srdData = await querySRD("monster", "goblin");
        console.log("[Debug] SRD goblin data:", srdData ? "found" : "null");

        // Use NPC agent to generate stat block
        const result = await getNPCStats(
          { name: "Goblin", slug: "goblin", disposition: "hostile", count: 1 },
          srdData,
        );

        // Create an encounter before creating NPCs so createNPC() can add them
        if (!getEncounter()) {
          const sessionId = getSessionId();
          const session = await loadSession(sessionId);
          const allCharacterIds = session?.characterIds ?? [characterId];
          const enc = await createEncounter(
            sessionId,
            allCharacterIds,
            [],
            gameState.story.currentLocation,
            gameState.story.currentScene,
          );
          setEncounter(enc);
          gameState.story.activeEncounterId = enc.id;
        }

        for (const npc of result.npcs) {
          createNPC(npc);
        }

        // Compute initial grid positions and turn order, then persist
        const enc = getEncounter();
        if (enc?.id) {
          enc.positions = computeInitialPositions(enc.activeNPCs);
          enc.turnOrder = ["player", ...enc.activeNPCs.map(n => n.id)];
          enc.currentTurnIndex = 0;
          await saveEncounterState(enc.id, {
            activeNPCs: enc.activeNPCs,
            positions: enc.positions,
            turnOrder: enc.turnOrder,
            currentTurnIndex: enc.currentTurnIndex,
          });
        }

        const message = "[DEMIGOD] A hostile Goblin materializes before you!";
        const sessionId = getSessionId();
        await addMessage(sessionId, {
          role: "assistant",
          content: message,
          timestamp: Date.now(),
        });

        // Persist updated state
        await saveCharacterState(characterId, {
          player: gameState.player,
          story: getGameState().story,
        });

        return NextResponse.json({
          gameState: getGameState(),
          encounter: getEncounter(),
          message,
        });
      }

      case "force_level_up": {
        const currentLevel = gameState.player.level;
        if (currentLevel >= 20) {
          return NextResponse.json(
            { error: "Already at maximum level (20)" },
            { status: 400 },
          );
        }

        // If player already has a pending level-up, just return the current state
        if (gameState.player.pendingLevelUp) {
          return NextResponse.json({
            gameState: getGameState(),
            message: "[DEMIGOD] A level-up is already pending. Complete the wizard first!",
          });
        }

        const xpNeeded = Math.max(1, xpForLevel(currentLevel + 1) - gameState.player.xp);
        console.log(`[Debug] Awarding ${xpNeeded} XP to level from ${currentLevel} to ${currentLevel + 1}`);

        // awardXPAsync creates pendingLevelUp data (does NOT auto-apply)
        await awardXPAsync(characterId, xpNeeded);

        const updatedState = getGameState();
        const message = `[DEMIGOD] Divine power surges through you! Gained ${xpNeeded} XP. Complete the level-up wizard to advance!`;
        const sessionId = getSessionId();
        await addMessage(sessionId, {
          role: "assistant",
          content: message,
          timestamp: Date.now(),
        });

        // Persist updated state
        await saveCharacterState(characterId, {
          player: updatedState.player,
          story: updatedState.story,
        });

        return NextResponse.json({
          gameState: getGameState(),
          message,
        });
      }

      case "advance_story_beat": {
        const campaignSlug = getCampaignSlug();
        if (!campaignSlug) {
          return NextResponse.json({ error: "No campaign active" }, { status: 400 });
        }
        const actNumber = gameState.story.currentAct ?? 1;
        const act = await getCampaignAct(campaignSlug, actNumber);
        if (!act?.storyBeats?.length) {
          return NextResponse.json({ error: "No story beats for current act" }, { status: 400 });
        }

        const completed = new Set(
          (gameState.story.completedStoryBeats ?? []).map((b) => b.toLowerCase()),
        );
        const remaining = act.storyBeats.filter(
          (b) => !completed.has(b.name.toLowerCase()),
        );
        if (remaining.length === 0) {
          return NextResponse.json({ error: "All story beats already completed" }, { status: 400 });
        }

        const beatToComplete = remaining[0];
        if (!gameState.story.completedStoryBeats) gameState.story.completedStoryBeats = [];
        gameState.story.completedStoryBeats.push(beatToComplete.name.toLowerCase());

        const message = `[DEMIGOD] Story beat "${beatToComplete.name}" marked as completed.`;
        const sessionId = getSessionId();
        await addMessage(sessionId, {
          role: "assistant",
          content: message,
          timestamp: Date.now(),
        });

        await saveCharacterState(characterId, {
          story: getGameState().story,
        });

        const nextBeat = remaining.length > 1 ? remaining[1].name : "(act complete)";
        return NextResponse.json({
          gameState: getGameState(),
          message: `${message} Next beat: ${nextBeat}`,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err: unknown) {
    console.error("[/api/debug]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
