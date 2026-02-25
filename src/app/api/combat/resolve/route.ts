/**
 * POST /api/combat/resolve
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
 * 2. Loop through NPCs in turnOrder (friendly first, then hostile):
 *    - Friendly NPCs: attack a random hostile, apply damage, narrate
 *    - Hostile NPCs: pick a random target (player or friendly NPC), attack, narrate
 *    - Persist state after each NPC turn
 *    - If player HP <= 0, stop
 * 3. After all NPCs: increment round, reset currentTurnIndex
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getGameState,
  getEncounter,
  getSessionId,
  getSessionSupportingNPCs,
  getSessionCompanions,
  syncCompanionFromEncounter,
  removeCompanion,
  loadGameState,
  updateNPC,
} from "../../../lib/gameState";
import { saveCharacterState, saveSessionState } from "../../../lib/characterStore";
import { saveEncounterState, completeEncounter } from "../../../lib/encounterStore";
import { resolveNPCTurn, resolveFriendlyNPCTurn, pickHostileTarget } from "../../../lib/combatResolver";
import { emptyCombatStats } from "../../../lib/gameTypes";
import type { ParsedRollResult } from "../../../lib/gameTypes";
import type { AOEResult } from "../../../lib/combatResolver";
import { addMessage } from "../../../lib/messageStore";
import { narratePlayerTurn, narrateAOETurn, narrateNPCTurn } from "../../../agents/turnNarrator";
import { generateLoot } from "../../../agents/lootAgent";
import type { VictoryData } from "../../../lib/gameTypes";

interface CombatResolveBody {
  characterId: string;
  /** The player's resolved action from /api/combat/action (single-target). */
  singleTargetResult?: ParsedRollResult;
  /** AOE spell result from /api/combat/action (mutually exclusive with singleTargetResult). */
  aoeResult?: AOEResult;
  /** Target NPC id (if the player targeted one). */
  targetId?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CombatResolveBody;
    const { characterId, singleTargetResult, aoeResult, targetId } = body;

    if (!characterId || (!singleTargetResult && !aoeResult)) {
      return NextResponse.json(
        { error: "characterId and either singleTargetResult or aoeResult are required" },
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

    // Narrate player turn: AOE path or single-target path
    const playerNarration = aoeResult
      ? await narrateAOETurn(player, aoeResult, encounter.location)
      : await narratePlayerTurn(player, singleTargetResult!, targetNPC, encounter.location);

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
        combatStats: encounter.combatStats,
        defeatedNPCs: encounter.defeatedNPCs ?? [],
        totalXPAwarded: encounter.totalXPAwarded ?? 0,
      }),
    ]);

    // ── NPC turns (sequential, one at a time) ───────────────────────────────

    const npcTurnIds = encounter.turnOrder.filter(id => id !== "player");
    const npcResults: { npcId: string; hit: boolean; damage: number }[] = [];

    for (let i = 0; i < npcTurnIds.length; i++) {
      const npcId = npcTurnIds[i];
      const npc = encounter.activeNPCs.find(n => n.id === npcId);

      // Skip dead or neutral NPCs
      if (!npc || npc.currentHp <= 0 || npc.disposition === "neutral") {
        encounter.currentTurnIndex = i + 2;
        continue;
      }

      encounter.currentTurnIndex = i + 1;

      if (npc.disposition === "friendly") {
        // ── Friendly NPC turn: attack a random hostile ──
        const friendlyResult = resolveFriendlyNPCTurn(npc, encounter.activeNPCs);
        if (!friendlyResult) {
          // No living hostiles — skip turn
          encounter.currentTurnIndex = i + 2;
          continue;
        }

        npcResults.push({ npcId, hit: friendlyResult.hit, damage: friendlyResult.damage });

        // Apply damage to the hostile target
        if (friendlyResult.hit && friendlyResult.damage > 0) {
          updateNPC({ id: friendlyResult.targetId, hp_delta: -friendlyResult.damage });
        }

        // Find the target NPC for narration (get updated HP after damage)
        const target = encounter.activeNPCs.find(n => n.id === friendlyResult.targetId);
        const targetCurrentHP = target?.currentHp ?? 0;
        const targetMaxHP = target?.maxHp ?? 1;

        // Narrate friendly NPC's turn
        const npcNarration = await narrateNPCTurn(
          npc,
          friendlyResult,
          friendlyResult.targetName,
          targetCurrentHP,
          targetMaxHP,
          encounter.location,
        );

        roundTokens += npcNarration.inputTokens + npcNarration.outputTokens;
        roundCost += npcNarration.costUsd;

        await addMessage(sessionId, {
          role: "assistant",
          content: npcNarration.narrative,
          timestamp: Date.now(),
        });

        encounter.lastNpcResult = { npcId, hit: friendlyResult.hit, damage: friendlyResult.damage, timestamp: Date.now() };
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
            lastNpcResult: encounter.lastNpcResult,
          }),
        ]);

      } else if (npc.disposition === "hostile") {
        // ── Hostile NPC turn: target player or a friendly NPC ──
        const target = pickHostileTarget(encounter.activeNPCs);

        if (target.type === "player") {
          // Existing behavior: attack the player
          const npcResult = resolveNPCTurn(npc, player.armorClass);
          npcResults.push({ npcId, hit: npcResult.hit, damage: npcResult.damage });

          if (npcResult.hit && npcResult.damage > 0) {
            player.currentHP = Math.max(0, player.currentHP - npcResult.damage);

            if (!encounter.combatStats) encounter.combatStats = {};
            if (!encounter.combatStats[characterId]) encounter.combatStats[characterId] = emptyCombatStats();
            encounter.combatStats[characterId].damageTaken += npcResult.damage;
          }

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

          encounter.lastNpcResult = { npcId, hit: npcResult.hit, damage: npcResult.damage, timestamp: Date.now() };
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
              lastNpcResult: encounter.lastNpcResult,
            }),
          ]);

          // Check for player death
          if (player.currentHP <= 0) {
            console.log(`[Combat Resolve] Player died during ${npc.name}'s turn`);
            return NextResponse.json({
              ok: true,
              npcResults,
              gameState: getGameState(),
              encounter,
              tokensUsed: roundTokens,
              estimatedCostUsd: roundCost,
            });
          }

        } else {
          // Hostile NPC targets a friendly NPC
          const friendlyTarget = target.npc;
          const npcResult = resolveNPCTurn(npc, friendlyTarget.ac);
          npcResults.push({ npcId, hit: npcResult.hit, damage: npcResult.damage });

          if (npcResult.hit && npcResult.damage > 0) {
            updateNPC({ id: friendlyTarget.id, hp_delta: -npcResult.damage });
          }

          const updatedFriendly = encounter.activeNPCs.find(n => n.id === friendlyTarget.id);
          const npcNarration = await narrateNPCTurn(
            npc,
            npcResult,
            friendlyTarget.name,
            updatedFriendly?.currentHp ?? 0,
            friendlyTarget.maxHp,
            encounter.location,
          );

          roundTokens += npcNarration.inputTokens + npcNarration.outputTokens;
          roundCost += npcNarration.costUsd;

          await addMessage(sessionId, {
            role: "assistant",
            content: npcNarration.narrative,
            timestamp: Date.now(),
          });

          encounter.lastNpcResult = { npcId, hit: npcResult.hit, damage: npcResult.damage, timestamp: Date.now() };
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
              lastNpcResult: encounter.lastNpcResult,
            }),
          ]);
        }
      }
    }

    // ── Sync companion state after NPC turns ─────────────────────────────
    for (const npc of encounter.activeNPCs) {
      if (npc.disposition === "friendly") {
        if (npc.currentHp > 0) {
          syncCompanionFromEncounter(npc);
        } else {
          const removed = removeCompanion(npc.id);
          if (removed) {
            console.log(`[Companions] "${removed.name}" killed in combat — removed`);
            const supportingNPCs = getSessionSupportingNPCs();
            const linked = supportingNPCs.find((s) => s.companionNpcId === npc.id);
            if (linked) {
              linked.companionNpcId = undefined;
              linked.status = "dead";
              linked.notes += ` Killed in combat.`;
            }
          }
        }
      }
    }

    // Persist companion state alongside session data
    await saveSessionState(sessionId, {
      companions: getSessionCompanions(),
      supportingNPCs: getSessionSupportingNPCs(),
    });

    // ── Round end ───────────────────────────────────────────────────────────

    const survivingHostiles = encounter.activeNPCs.filter(
      n => n.disposition === "hostile" && n.currentHp > 0,
    );

    if (survivingHostiles.length === 0) {
      // ── Combat victory: generate loot and build victory data ────────────
      const defeated = encounter.defeatedNPCs ?? [];
      const lootResult = await generateLoot(defeated, player);
      roundTokens += lootResult.inputTokens + lootResult.outputTokens;
      roundCost += lootResult.costUsd;

      // Apply loot to player state
      if (lootResult.gold > 0) {
        player.gold = Math.max(0, player.gold + lootResult.gold);
      }
      if (lootResult.loot.length > 0) {
        for (const item of lootResult.loot) {
          player.inventory.push(item.name);
          // Add weapon abilities for weapon loot
          if (item.weapon) {
            if (!player.abilities) player.abilities = [];
            player.abilities.push({
              id: `weapon:${item.name.toLowerCase().replace(/\s+/g, "-")}`,
              name: item.name,
              type: "weapon",
              weaponStat: item.weapon.stat as "str" | "dex" | "finesse" | "none",
              weaponBonus: item.weapon.bonus,
              damageRoll: item.weapon.dice,
              damageType: item.weapon.damageType,
              requiresTarget: true,
            });
          }
        }
      }

      // Build VictoryData
      const victoryData: VictoryData = {
        totalXP: encounter.totalXPAwarded ?? 0,
        combatStats: encounter.combatStats ?? {},
        loot: lootResult.loot,
        goldAwarded: lootResult.gold,
        defeatedNPCs: defeated.map(n => n.name),
        rounds: encounter.round,
        narrative: lootResult.narrative,
        tokensUsed: roundTokens,
        estimatedCostUsd: roundCost,
      };

      // Persist victoryData on encounter for multiplayer listeners
      encounter.victoryData = victoryData;
      await saveEncounterState(encounterId, { victoryData });

      // Write aftermath narrative to messages subcollection
      if (lootResult.narrative) {
        await addMessage(sessionId, {
          role: "assistant",
          content: lootResult.narrative,
          timestamp: Date.now(),
        });
      }

      // Update currentScene to reflect combat aftermath
      const defeatedNames = defeated.map(n => n.name).join(", ");
      gameState.story.currentScene = `Combat ended — defeated ${defeatedNames} at ${encounter.location}.`;

      // Complete encounter and clear link
      await completeEncounter(encounterId);
      delete gameState.story.activeEncounterId;

      await saveCharacterState(characterId, {
        player: gameState.player,
        story: gameState.story,
      });

      return NextResponse.json({
        ok: true,
        combatEnded: true,
        victoryData,
        npcResults,
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
          .filter(n => n.currentHp > 0 && n.disposition === "friendly")
          .map(n => n.id),
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
        npcResults,
        gameState: getGameState(),
        encounter,
        tokensUsed: roundTokens,
        estimatedCostUsd: roundCost,
      });
    }
  } catch (err) {
    console.error("[/api/combat/resolve] Error:", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Combat continue failed" },
      { status: 500 },
    );
  }
}
