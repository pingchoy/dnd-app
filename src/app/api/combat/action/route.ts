/**
 * POST /api/combat/action
 *
 * Phase 1 of turn-by-turn combat: deterministic player action resolution.
 * No AI calls — resolves instantly and returns singleTargetResult for the dice UI.
 *
 * After the player sees their roll and clicks Continue, the frontend calls
 * POST /api/combat/resolve to trigger narration + NPC turns.
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
import { resolvePlayerAction, resolveAOEAction, buildAOEShape } from "../../../lib/combatResolver";
import type { AOEResult } from "../../../lib/combatResolver";
import { emptyCombatStats } from "../../../lib/gameTypes";
import type { GridPosition } from "../../../lib/gameTypes";
import { getAOECells, getAOETargets } from "../../../lib/combatEnforcement";
import { addMessage } from "../../../lib/messageStore";

interface CombatActionBody {
  characterId: string;
  abilityId: string; // "weapon:rapier", "cantrip:fire-bolt", "action:dodge"
  targetId?: string; // NPC id (required for targeted abilities)
  aoeOrigin?: GridPosition; // for ranged AOEs: center point chosen by player
  aoeDirection?: GridPosition; // for cone/line: cursor position indicating direction
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CombatActionBody;
    const { characterId, abilityId, targetId, aoeOrigin, aoeDirection } = body;

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
      encounter.turnOrder = [
        "player",
        ...encounter.activeNPCs.map((n) => n.id),
      ];
      encounter.currentTurnIndex = 0;
    }

    // Find ability in player's abilities
    const ability = (player.abilities ?? []).find((a) => a.id === abilityId);
    if (!ability) {
      return NextResponse.json(
        {
          error: `Ability "${abilityId}" not found in player's combat abilities`,
        },
        { status: 400 },
      );
    }

    // Find target NPC if targeted
    let targetNPC = null;
    if (targetId) {
      targetNPC = encounter.activeNPCs.find((n) => n.id === targetId) ?? null;
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

    // ── Accumulate player combat stats ──────────────────────────────────────
    if (!encounter.combatStats) encounter.combatStats = {};
    if (!encounter.combatStats[characterId])
      encounter.combatStats[characterId] = emptyCombatStats();
    const stats = encounter.combatStats[characterId];

    let singleTargetResult = null;
    let aoeResult: AOEResult | null = null;

    // ── AOE resolution path ─────────────────────────────────────────────────
    if (ability.aoe) {
      const casterPos = positions.get("player");
      if (!casterPos) {
        return NextResponse.json(
          { error: "Player position not found on grid" },
          { status: 400 },
        );
      }

      const shape = buildAOEShape(ability.aoe, casterPos, aoeOrigin, aoeDirection);
      const affectedCells = getAOECells(shape, encounter.gridSize);
      const hitIds = getAOETargets(shape, positions, encounter.gridSize);

      // Filter to living hostile NPCs in the AOE
      const targetNPCs = encounter.activeNPCs.filter(
        n => hitIds.includes(n.id) && n.currentHp > 0 && n.disposition === "hostile",
      );

      aoeResult = resolveAOEAction(player, ability, targetNPCs, affectedCells);

      // Apply damage to each target (skip for non-damaging AOEs like Color Spray)
      for (const targetRes of aoeResult.targets) {
        if (targetRes.damageTaken > 0) {
          const npcResult = updateNPC({
            id: targetRes.npcId,
            hp_delta: -targetRes.damageTaken,
          });
          stats.damageDealt += targetRes.damageTaken;
          if (npcResult.died) {
            stats.killCount += 1;
            const npcName = targetRes.npcName;
            stats.npcsDefeated.push(npcName);
          }
        }
      }

      stats.spellsCast += 1;
      if (!stats.abilitiesUsed.includes(ability.name)) {
        stats.abilitiesUsed.push(ability.name);
      }
    } else {
      // ── Single-target resolution path ───────────────────────────────────────
      singleTargetResult = resolvePlayerAction(player, ability, targetNPC, positions);

      // Apply player damage to target NPC
      let targetDied = false;
      if (singleTargetResult.success && singleTargetResult.damage && targetNPC) {
        const npcResult = updateNPC({
          id: targetNPC.id,
          hp_delta: -singleTargetResult.damage.totalDamage,
        });
        targetDied = npcResult.died;
      }

      const isAttack = ability.type === "weapon" || ability.attackType === "melee" || ability.attackType === "ranged";
      if (isAttack && !singleTargetResult.noCheck) {
        stats.attacksMade += 1;
        if (singleTargetResult.success) stats.attacksHit += 1;
        if (singleTargetResult.damage?.isCrit) stats.criticalHits += 1;
        if (singleTargetResult.success && singleTargetResult.damage) stats.damageDealt += singleTargetResult.damage.totalDamage;
      }

      if (ability.type === "spell" || ability.type === "cantrip") {
        stats.spellsCast += 1;
      }

      if (!stats.abilitiesUsed.includes(ability.name)) {
        stats.abilitiesUsed.push(ability.name);
      }

      if (targetDied && targetNPC) {
        stats.killCount += 1;
        stats.npcsDefeated.push(targetNPC.name);
      }
    }

    // Write to messages subcollection (roll result visible via real-time listener)
    const sessionId = getSessionId();
    await addMessage(sessionId, {
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      ...(singleTargetResult ? { rollResult: singleTargetResult } : {}),
      ...(aoeResult ? { aoeResult } : {}),
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
        combatStats: encounter.combatStats,
        defeatedNPCs: encounter.defeatedNPCs ?? [],
        totalXPAwarded: encounter.totalXPAwarded ?? 0,
      }),
    ]);

    return NextResponse.json({
      singleTargetResult,
      aoeResult,
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
