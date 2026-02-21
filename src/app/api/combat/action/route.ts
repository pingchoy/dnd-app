/**
 * POST /api/combat/action
 *
 * Phase 1 of turn-by-turn combat: deterministic player action resolution.
 * No AI calls — resolves instantly and returns playerResult for the dice UI.
 *
 * After the player sees their roll and clicks Continue, the frontend calls
 * POST /api/combat/continue to trigger narration + NPC turns via SSE.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getGameState,
  getEncounter,
  getSessionId,
  loadGameState,
  updateNPC,
} from "../../../lib/gameState";
import { saveCharacterState } from "../../../lib/characterStore";
import { saveEncounterState } from "../../../lib/encounterStore";
import { resolvePlayerAction } from "../../../lib/combatResolver";
import type { GridPosition } from "../../../lib/gameTypes";
import { addMessage } from "../../../lib/messageStore";

interface CombatActionBody {
  characterId: string;
  abilityId: string;    // "weapon:rapier", "cantrip:fire-bolt", "action:dodge"
  targetId?: string;    // NPC id (required for targeted abilities)
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CombatActionBody;
    const { characterId, abilityId, targetId } = body;

    if (!characterId || !abilityId) {
      return NextResponse.json(
        { error: "characterId and abilityId are required" },
        { status: 400 },
      );
    }

    // Load game state + encounter from Firestore
    const gameState = await loadGameState(characterId);
    const encounter = getEncounter();

    if (!encounter || encounter.status !== "active") {
      return NextResponse.json(
        { error: "No active combat encounter" },
        { status: 400 },
      );
    }

    const encounterId = encounter.id!;
    const { player } = gameState;

    // Initialize turnOrder if not set (backwards compat for pre-existing encounters)
    if (!encounter.turnOrder || encounter.turnOrder.length === 0) {
      encounter.turnOrder = ["player", ...encounter.activeNPCs.map(n => n.id)];
      encounter.currentTurnIndex = 0;
    }

    // Find ability in player's abilities
    const ability = (player.abilities ?? []).find(a => a.id === abilityId);
    if (!ability) {
      return NextResponse.json(
        { error: `Ability "${abilityId}" not found in player's combat abilities` },
        { status: 400 },
      );
    }

    // Find target NPC if targeted
    let targetNPC = null;
    if (targetId) {
      targetNPC = encounter.activeNPCs.find(n => n.id === targetId) ?? null;
      if (!targetNPC) {
        return NextResponse.json(
          { error: `Target NPC "${targetId}" not found in encounter` },
          { status: 400 },
        );
      }
    }

    // Build positions map from encounter
    const positions = new Map<string, GridPosition>(
      Object.entries(encounter.positions),
    );

    // Resolve player action (deterministic — no AI call)
    const playerResult = resolvePlayerAction(player, ability, targetNPC, positions);

    // Apply player damage to target NPC
    if (playerResult.success && playerResult.damage && targetNPC) {
      updateNPC({
        id: targetNPC.id,
        hp_delta: -playerResult.damage.totalDamage,
      });
    }

    // Write to messages subcollection (roll result visible via real-time listener)
    const sessionId = getSessionId();
    await addMessage(sessionId, {
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      rollResult: playerResult,
    });

    // Persist state after player action
    await Promise.all([
      saveCharacterState(characterId, {
        player: gameState.player,
        story: gameState.story,
      }),
      saveEncounterState(encounterId, {
        activeNPCs: encounter.activeNPCs,
        positions: encounter.positions,
        round: encounter.round,
        turnOrder: encounter.turnOrder,
        currentTurnIndex: encounter.currentTurnIndex,
      }),
    ]);

    return NextResponse.json({
      playerResult,
      gameState: getGameState(),
      encounter,
    });
  } catch (err) {
    console.error("[/api/combat/action] Error:", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Combat action failed" },
      { status: 500 },
    );
  }
}
