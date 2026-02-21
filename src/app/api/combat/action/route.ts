/**
 * POST /api/combat/action
 *
 * Turn-by-turn combat resolution with SSE event streaming.
 *
 * Flow:
 * 1. Resolve player's action (deterministic), apply damage to target NPC
 * 2. Push player_turn event (with Haiku narration) to SSE stream
 * 3. Loop through hostile NPCs in turnOrder:
 *    - Pre-roll this NPC's attack (d20 + attackBonus vs player AC)
 *    - Call Haiku for 1-paragraph narration
 *    - Apply damage to player, persist state
 *    - Push npc_turn event
 *    - If player HP <= 0, push player_dead and stop
 * 4. After all NPCs: push round_end, increment round, reset currentTurnIndex
 *
 * Returns immediately with the player's roll result so the dice UI can show.
 * NPC turns stream in via SSE after the response is sent.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getGameState,
  getEncounter,
  loadGameState,
  updateNPC,
  addConversationTurn,
} from "../../../lib/gameState";
import { saveCharacterState } from "../../../lib/characterStore";
import { saveEncounterState, completeEncounter } from "../../../lib/encounterStore";
import { resolvePlayerAction, resolveNPCTurn } from "../../../lib/combatResolver";
import type { GridPosition } from "../../../lib/gameTypes";
import { HISTORY_WINDOW } from "../../../lib/anthropic";
import { combatEventBus } from "../../../lib/combatEventBus";
import { narratePlayerTurn, narrateNPCTurn } from "../../../agents/turnNarrator";

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

    // ── Phase 1: Player's turn ──────────────────────────────────────────────

    // Emit round_start
    combatEventBus.emit(encounterId, { type: "round_start", round: encounter.round });

    // 1. Resolve player action (deterministic)
    const playerResult = resolvePlayerAction(player, ability, targetNPC, positions);

    // 2. Apply player damage to target NPC
    if (playerResult.success && playerResult.damage && targetNPC) {
      updateNPC({
        id: targetNPC.id,
        hp_delta: -playerResult.damage.totalDamage,
      });
    }

    // 3. Add player action to conversation history
    let actionDesc = `[Combat] I use ${ability.name}`;
    if (targetNPC) actionDesc += ` on ${targetNPC.name}`;
    addConversationTurn("user", actionDesc, HISTORY_WINDOW);

    // 4. Set currentTurnIndex to 1 (first NPC)
    encounter.currentTurnIndex = 1;

    // 5. Narrate player turn (Haiku call)
    const playerNarration = await narratePlayerTurn(
      player,
      playerResult,
      targetNPC,
      encounter.location,
    );

    // Add player turn narration to conversation history
    addConversationTurn("assistant", playerNarration.narrative, HISTORY_WINDOW);

    // 6. Push player_turn event
    combatEventBus.emit(encounterId, {
      type: "player_turn",
      playerId: "player",
      narrative: playerNarration.narrative,
    });

    // Persist after player turn
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

    // Push state update so client can refresh HP etc.
    combatEventBus.emit(encounterId, {
      type: "state_update",
      gameState: getGameState(),
      encounter,
    });

    // ── Phase 2: NPC turns (sequential, one at a time) ──────────────────────

    // Filter to surviving hostile NPCs in turnOrder sequence
    const npcTurnIds = encounter.turnOrder.filter(id => id !== "player");

    for (let i = 0; i < npcTurnIds.length; i++) {
      const npcId = npcTurnIds[i];
      const npc = encounter.activeNPCs.find(n => n.id === npcId);

      // Skip dead or non-hostile NPCs
      if (!npc || npc.currentHp <= 0 || npc.disposition !== "hostile") {
        encounter.currentTurnIndex = i + 2; // +1 for player, +1 for next
        continue;
      }

      // Update current turn index
      encounter.currentTurnIndex = i + 1; // +1 because player is index 0

      // 1. Pre-roll this NPC's attack
      const npcResult = resolveNPCTurn(npc, player.armorClass);

      // 2. Apply damage to player immediately
      if (npcResult.hit && npcResult.damage > 0) {
        player.currentHP = Math.max(0, player.currentHP - npcResult.damage);
      }

      // 3. Narrate this NPC's turn (Haiku call)
      const npcNarration = await narrateNPCTurn(
        npc,
        npcResult,
        player.name,
        player.currentHP,
        player.maxHP,
        encounter.location,
      );

      // Add NPC turn narration to conversation history
      addConversationTurn("assistant", npcNarration.narrative, HISTORY_WINDOW);

      // 4. Push npc_turn event
      combatEventBus.emit(encounterId, {
        type: "npc_turn",
        npcId: npc.id,
        narrative: npcNarration.narrative,
      });

      // 5. Persist after each NPC turn
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

      // Push state update after each NPC turn
      combatEventBus.emit(encounterId, {
        type: "state_update",
        gameState: getGameState(),
        encounter,
      });

      // 6. Check for player death
      if (player.currentHP <= 0) {
        console.log(`[Combat Action] Player died during ${npc.name}'s turn — stopping NPC loop`);
        combatEventBus.emit(encounterId, {
          type: "player_dead",
          playerId: "player",
          narrative: npcNarration.narrative,
        });
        // Return early — don't process remaining NPCs
        return NextResponse.json({
          playerResult,
          gameState: getGameState(),
          encounter,
        });
      }
    }

    // ── Phase 3: Round end ──────────────────────────────────────────────────

    // Check if all hostiles are dead → combat ends
    const survivingHostiles = encounter.activeNPCs.filter(
      n => n.disposition === "hostile" && n.currentHp > 0,
    );

    if (survivingHostiles.length === 0) {
      // Combat over — complete encounter, clear activeEncounterId, persist final state
      await completeEncounter(encounterId);
      gameState.story.activeEncounterId = undefined;

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
      combatEventBus.emit(encounterId, { type: "combat_end" });
    } else {
      // Increment round, reset to player's turn
      encounter.round += 1;
      encounter.currentTurnIndex = 0;

      // Update turnOrder to remove dead NPCs
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
      });

      // Final state update
      combatEventBus.emit(encounterId, {
        type: "state_update",
        gameState: getGameState(),
        encounter,
      });
    }

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
