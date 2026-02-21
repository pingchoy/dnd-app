/**
 * POST /api/combat/action
 *
 * Deterministic combat resolution — no LLM calls.
 * Resolves player action (weapon/cantrip/spell/action), applies damage,
 * resolves NPC turns, persists state to Firestore.
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
import { saveEncounterState } from "../../../lib/encounterStore";
import { resolvePlayerAction, resolveNPCTurns } from "../../../lib/combatResolver";
import type { NPCTurnResult } from "../../../lib/combatResolver";
import type { GridPosition } from "../../../lib/gameTypes";
import { HISTORY_WINDOW } from "../../../lib/anthropic";

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

    const { player } = gameState;

    // Find ability in player's combatAbilities
    const ability = (player.combatAbilities ?? []).find(a => a.id === abilityId);
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

    // 1. Resolve player action
    const playerResult = resolvePlayerAction(player, ability, targetNPC, positions);

    // 2. Apply player damage to target NPC
    if (playerResult.success && playerResult.damage && targetNPC) {
      updateNPC({
        id: targetNPC.id,
        hp_delta: -playerResult.damage.totalDamage,
      });
    }

    // 3. Resolve NPC turns (surviving hostiles attack player)
    const survivingHostiles = encounter.activeNPCs.filter(
      n => n.disposition === "hostile" && n.currentHp > 0,
    );
    const npcResults: NPCTurnResult[] = resolveNPCTurns(survivingHostiles, player.armorClass);

    // 4. Apply NPC damage to player
    const totalNPCDamage = npcResults
      .filter(r => r.hit)
      .reduce((sum, r) => sum + r.damage, 0);
    if (totalNPCDamage > 0) {
      player.currentHP = Math.max(0, player.currentHP - totalNPCDamage);
    }

    // 5. Increment round
    encounter.round += 1;

    // 6. Add player action to conversation history
    let actionDesc = `[Combat] I use ${ability.name}`;
    if (targetNPC) actionDesc += ` on ${targetNPC.name}`;
    addConversationTurn("user", actionDesc, HISTORY_WINDOW);

    // 7. Persist state to Firestore
    await Promise.all([
      saveCharacterState(characterId, {
        player: gameState.player,
        story: gameState.story,
        conversationHistory: gameState.conversationHistory,
      }),
      saveEncounterState(encounter.id!, {
        activeNPCs: encounter.activeNPCs,
        positions: encounter.positions,
        round: encounter.round,
      }),
    ]);

    return NextResponse.json({
      playerResult,
      npcResults,
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
