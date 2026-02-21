/**
 * POST /api/combat/continue
 *
 * Phase 2 of turn-by-turn combat: narration + NPC turns via SSE.
 * Called after the player confirms their roll in the dice UI.
 *
 * Flow:
 * 1. Narrate player turn (Haiku) → push player_turn SSE event
 * 2. Loop through hostile NPCs in turnOrder:
 *    - Pre-roll this NPC's attack
 *    - Narrate (Haiku) → push npc_turn SSE event
 *    - Apply damage to player, persist state
 *    - If player HP <= 0, push player_dead and stop
 * 3. After all NPCs: push round_end, increment round, reset currentTurnIndex
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getGameState,
  getEncounter,
  loadGameState,
  addConversationTurn,
} from "../../../lib/gameState";
import { saveCharacterState } from "../../../lib/characterStore";
import { saveEncounterState, completeEncounter } from "../../../lib/encounterStore";
import { resolveNPCTurn } from "../../../lib/combatResolver";
import type { ParsedRollResult } from "../../../lib/gameTypes";
import { HISTORY_WINDOW } from "../../../lib/anthropic";
import { combatEventBus } from "../../../lib/combatEventBus";
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

    combatEventBus.emit(encounterId, { type: "round_start", round: encounter.round });

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

    addConversationTurn("assistant", playerNarration.narrative, HISTORY_WINDOW);

    combatEventBus.emit(encounterId, {
      type: "player_turn",
      playerId: "player",
      narrative: playerNarration.narrative,
    });

    // Advance to first NPC
    encounter.currentTurnIndex = 1;

    // Persist after player narration
    await Promise.all([
      saveCharacterState(characterId, {
        player: gameState.player,
        story: gameState.story,
        conversationHistory: gameState.conversationHistory,
      }),
      saveEncounterState(encounterId, {
        activeNPCs: encounter.activeNPCs,
        positions: encounter.positions,
        round: encounter.round,
        turnOrder: encounter.turnOrder,
        currentTurnIndex: encounter.currentTurnIndex,
      }),
    ]);

    combatEventBus.emit(encounterId, {
      type: "state_update",
      gameState: getGameState(),
      encounter,
    });

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

      addConversationTurn("assistant", npcNarration.narrative, HISTORY_WINDOW);

      combatEventBus.emit(encounterId, {
        type: "npc_turn",
        npcId: npc.id,
        narrative: npcNarration.narrative,
        targetId: "player",
        hit: npcResult.hit,
        damage: npcResult.damage,
      });

      // Persist after each NPC turn
      await Promise.all([
        saveCharacterState(characterId, {
          player: gameState.player,
          story: gameState.story,
          conversationHistory: gameState.conversationHistory,
        }),
        saveEncounterState(encounterId, {
          activeNPCs: encounter.activeNPCs,
          positions: encounter.positions,
          round: encounter.round,
          turnOrder: encounter.turnOrder,
          currentTurnIndex: encounter.currentTurnIndex,
        }),
      ]);

      combatEventBus.emit(encounterId, {
        type: "state_update",
        gameState: getGameState(),
        encounter,
      });

      // Check for player death
      if (player.currentHP <= 0) {
        console.log(`[Combat Continue] Player died during ${npc.name}'s turn`);
        combatEventBus.emit(encounterId, {
          type: "player_dead",
          playerId: "player",
          narrative: npcNarration.narrative,
        });
        return NextResponse.json({ ok: true });
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
        conversationHistory: gameState.conversationHistory,
      });

      combatEventBus.emit(encounterId, {
        type: "state_update",
        gameState: getGameState(),
        encounter: { ...encounter, status: "completed" },
      });
      combatEventBus.emit(encounterId, {
        type: "round_end",
        round: encounter.round,
        tokensUsed: roundTokens,
        costUsd: roundCost,
      });
      combatEventBus.emit(encounterId, { type: "combat_end" });
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

      combatEventBus.emit(encounterId, {
        type: "round_end",
        round: encounter.round,
        tokensUsed: roundTokens,
        costUsd: roundCost,
      });

      combatEventBus.emit(encounterId, {
        type: "state_update",
        gameState: getGameState(),
        encounter,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/combat/continue] Error:", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Combat continue failed" },
      { status: 500 },
    );
  }
}
