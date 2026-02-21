/**
 * POST /api/combat/continue
 *
 * Phase 2 of turn-by-turn combat: narration + NPC turns.
 * Called after the player confirms their roll in the dice UI.
 *
 * Previously used SSE via combatEventBus to stream events to the frontend.
 * Now writes narration messages to the Firestore messages subcollection —
 * the frontend picks them up via an onSnapshot listener.
 *
 * Flow:
 * 1. Narrate player turn (Haiku) → write message to subcollection
 * 2. Loop through hostile NPCs in turnOrder:
 *    - Pre-roll this NPC's attack
 *    - Narrate (Haiku) → write message to subcollection
 *    - Apply damage to player, persist state
 *    - If player HP <= 0, stop
 * 3. After all NPCs: increment round, reset currentTurnIndex
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getGameState,
  getEncounter,
  getSessionId,
  loadGameState,
} from "../../../lib/gameState";
import { saveCharacterState } from "../../../lib/characterStore";
import { saveEncounterState, completeEncounter } from "../../../lib/encounterStore";
import { resolveNPCTurn } from "../../../lib/combatResolver";
import type { ParsedRollResult } from "../../../lib/gameTypes";
import { addMessage } from "../../../lib/messageStore";
import { narratePlayerTurn, narrateNPCTurn } from "../../../agents/turnNarrator";

interface CombatContinueBody {
  characterId: string;
  /** The player's resolved action from /api/combat/action (passed through for narration). */
  playerResult: ParsedRollResult;
  /** Target NPC id (if the player targeted one). */
  targetId?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CombatContinueBody;
    const { characterId, playerResult, targetId } = body;

    if (!characterId || !playerResult) {
      return NextResponse.json(
        { error: "characterId and playerResult are required" },
        { status: 400 },
      );
    }

    // Load game state + encounter from Firestore
    const gameState = await loadGameState(characterId);
    const encounter = getEncounter();
    const sessionId = getSessionId();

    if (!encounter || encounter.status !== "active") {
      return NextResponse.json(
        { error: "No active combat encounter" },
        { status: 400 },
      );
    }

    const encounterId = encounter.id!;
    const { player } = gameState;

    // Accumulate token/cost totals across all narration calls this round
    let roundTokens = 0;
    let roundCost = 0;

    // Find target NPC for narration context
    const targetNPC = targetId
      ? encounter.activeNPCs.find(n => n.id === targetId) ?? null
      : null;

    // ── Player turn narration ───────────────────────────────────────────────

    // Set currentTurnIndex to player (0)
    encounter.currentTurnIndex = 0;

    // Narrate player turn (Haiku call)
    const playerNarration = await narratePlayerTurn(
      player,
      playerResult,
      targetNPC,
      encounter.location,
    );

    roundTokens += playerNarration.inputTokens + playerNarration.outputTokens;
    roundCost += playerNarration.costUsd;

    await addMessage(sessionId, {
      role: "assistant",
      content: playerNarration.narrative,
      timestamp: Date.now(),
    });

    // Advance to first NPC
    encounter.currentTurnIndex = 1;

    // Persist after player narration
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

    // ── NPC turns (sequential, one at a time) ───────────────────────────────

    const npcTurnIds = encounter.turnOrder.filter(id => id !== "player");

    for (let i = 0; i < npcTurnIds.length; i++) {
      const npcId = npcTurnIds[i];
      const npc = encounter.activeNPCs.find(n => n.id === npcId);

      // Skip dead or non-hostile NPCs
      if (!npc || npc.currentHp <= 0 || npc.disposition !== "hostile") {
        encounter.currentTurnIndex = i + 2;
        continue;
      }

      encounter.currentTurnIndex = i + 1;

      // Pre-roll this NPC's attack
      const npcResult = resolveNPCTurn(npc, player.armorClass);

      // Apply damage to player immediately
      if (npcResult.hit && npcResult.damage > 0) {
        player.currentHP = Math.max(0, player.currentHP - npcResult.damage);
      }

      // Narrate this NPC's turn (Haiku call)
      const npcNarration = await narrateNPCTurn(
        npc,
        npcResult,
        player.name,
        player.currentHP,
        player.maxHP,
        encounter.location,
      );

      roundTokens += npcNarration.inputTokens + npcNarration.outputTokens;
      roundCost += npcNarration.costUsd;

      await addMessage(sessionId, {
        role: "assistant",
        content: npcNarration.narrative,
        timestamp: Date.now(),
      });

      // Persist after each NPC turn
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

      // Check for player death
      if (player.currentHP <= 0) {
        console.log(`[Combat Continue] Player died during ${npc.name}'s turn`);
        return NextResponse.json({
          ok: true,
          gameState: getGameState(),
          encounter,
          tokensUsed: roundTokens,
          estimatedCostUsd: roundCost,
        });
      }
    }

    // ── Round end ───────────────────────────────────────────────────────────

    const survivingHostiles = encounter.activeNPCs.filter(
      n => n.disposition === "hostile" && n.currentHp > 0,
    );

    if (survivingHostiles.length === 0) {
      await completeEncounter(encounterId);
      delete gameState.story.activeEncounterId;

      await saveCharacterState(characterId, {
        player: gameState.player,
        story: gameState.story,
      });

      return NextResponse.json({
        ok: true,
        combatEnded: true,
        gameState: getGameState(),
        encounter: { ...encounter, status: "completed" },
        tokensUsed: roundTokens,
        estimatedCostUsd: roundCost,
      });
    } else {
      encounter.round += 1;
      encounter.currentTurnIndex = 0;

      encounter.turnOrder = [
        "player",
        ...encounter.activeNPCs
          .filter(n => n.currentHp > 0 && n.disposition === "hostile")
          .map(n => n.id),
      ];

      await saveEncounterState(encounterId, {
        round: encounter.round,
        turnOrder: encounter.turnOrder,
        currentTurnIndex: 0,
      });

      return NextResponse.json({
        ok: true,
        gameState: getGameState(),
        encounter,
        tokensUsed: roundTokens,
        estimatedCostUsd: roundCost,
      });
    }
  } catch (err) {
    console.error("[/api/combat/continue] Error:", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Combat continue failed" },
      { status: 500 },
    );
  }
}
