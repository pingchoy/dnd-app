/**
 * POST /api/chat
 *
 * Phase 2 of the two-phase turn flow.
 * Receives the player input plus an optional pre-computed rules outcome
 * (from /api/roll) and runs the DM agent to generate the narrative.
 *
 * If precomputedRules is provided the rules agent is skipped entirely —
 * no duplicate API call, no duplicate cost.
 *
 * Combat encounters are persisted in the encounters collection.
 * When hostile NPCs are introduced, an encounter is created (or added to).
 * The combat agent reads from the encounter doc + character doc only.
 *
 * GET /api/chat?characterId=xxx
 *   Returns the current game state for a character (used on initial load).
 *   Includes encounter data if an active encounter exists.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDMResponse } from "../../agents/dmAgent";
import { getCombatResponse } from "../../agents/combatAgent";
import { getNPCStats } from "../../agents/npcAgent";
import { getRulesOutcome, isContestedAction } from "../../agents/rulesAgent";
import type { RulesOutcome, ParsedRollResult } from "../../agents/rulesAgent";
import {
  addConversationTurn,
  applyStateChangesAndPersist,
  createNPC,
  getActiveNPCs,
  getEncounter,
  getGameState,
  getSessionId,
  loadGameState,
  NPCToCreate,
  setEncounter,
} from "../../lib/gameState";
import { createEncounter, computeInitialPositions } from "../../lib/encounterStore";
import { querySRD } from "../../lib/characterStore";
import { HISTORY_WINDOW, MODELS, calculateCost } from "../../lib/anthropic";

interface PrecomputedRules {
  parsed: ParsedRollResult;
  raw: string;
  roll: number;
  rulesCost: number;
  damageTotal?: number;
  damageBreakdown?: string;
}

export async function POST(req: NextRequest) {
  try {
    interface ChatRequestBody {
      characterId: string;
      playerInput: string;
      precomputedRules?: PrecomputedRules;
    }

    const body = (await req.json()) as ChatRequestBody;

    const { characterId, playerInput, precomputedRules } = body;

    if (!playerInput?.trim()) {
      return NextResponse.json({ error: "playerInput is required" }, { status: 400 });
    }
    if (!characterId?.trim()) {
      return NextResponse.json({ error: "characterId is required" }, { status: 400 });
    }

    console.log("[/api/chat] Loading game state for character:", characterId);
    const gameState = await loadGameState(characterId);

    // Block chat while a level-up wizard is pending
    if (gameState.player.pendingLevelUp) {
      return NextResponse.json(
        { error: "Level up pending", pendingLevelUp: true },
        { status: 409 },
      );
    }

    let rulesOutcome: RulesOutcome | null = null;
    let rulesCost = 0;

    if (precomputedRules) {
      console.log("[Rules Agent] Using precomputed rules from /api/roll:", {
        roll: precomputedRules.roll,
        cost: `$${precomputedRules.rulesCost.toFixed(4)}`,
      });
      let raw = precomputedRules.raw;
      if (precomputedRules.damageTotal != null && precomputedRules.damageBreakdown) {
        raw += `\n[Pre-rolled player damage: ${precomputedRules.damageTotal} total (${precomputedRules.damageBreakdown})]`;
      }
      rulesOutcome = {
        parsed: precomputedRules.parsed,
        raw,
        roll: precomputedRules.roll,
        inputTokens: 0,
        outputTokens: 0,
      };
      rulesCost = precomputedRules.rulesCost;
    } else if (isContestedAction(playerInput)) {
      console.log("[Rules Agent] Contested action detected, calling rules agent inline...");
      rulesOutcome = await getRulesOutcome(playerInput, gameState.player, getActiveNPCs());
      rulesCost = calculateCost(MODELS.UTILITY, rulesOutcome.inputTokens, rulesOutcome.outputTokens);
      console.log("[Rules Agent] Done:", {
        roll: rulesOutcome.roll,
        tokens: { input: rulesOutcome.inputTokens, output: rulesOutcome.outputTokens },
        cost: `$${rulesCost.toFixed(4)}`,
      });
    } else {
      console.log("[Rules Agent] Skipped — not a contested action");
    }

    // Deterministic routing: combat agent for active encounter with hostiles, DM agent otherwise
    const currentEncounter = getEncounter();
    const inCombat = currentEncounter != null && currentEncounter.activeNPCs.some(
      (n) => n.disposition === "hostile" && n.currentHp > 0,
    );
    const agentLabel = inCombat ? "Combat Agent" : "DM Agent";
    const agentModel = inCombat ? MODELS.UTILITY : MODELS.NARRATIVE;

    console.log(`[${agentLabel}] Calling with player input:`, playerInput.slice(0, 100));
    const dmResult = inCombat
      ? await getCombatResponse(playerInput, {
          player: gameState.player,
          encounter: currentEncounter!,
          conversationHistory: gameState.conversationHistory,
        }, rulesOutcome)
      : await getDMResponse(playerInput, gameState, rulesOutcome);
    const dmCost = calculateCost(agentModel, dmResult.inputTokens, dmResult.outputTokens);
    console.log(`[${agentLabel}] Done:`, {
      narrativeLength: dmResult.narrative.length,
      hasStateChanges: !!dmResult.stateChanges,
      tokens: { input: dmResult.inputTokens, output: dmResult.outputTokens },
      cost: `$${dmCost.toFixed(4)}`,
    });
    if (dmResult.stateChanges) {
      console.log("[DM Agent] State changes:", JSON.stringify(dmResult.stateChanges, null, 2));
    }

    addConversationTurn("user", playerInput, HISTORY_WINDOW);
    addConversationTurn("assistant", dmResult.narrative, HISTORY_WINDOW);

    // NPC orchestration: when the DM's update_game_state includes npcs_to_create,
    // we fan out to the NPC agent for each creature, then create an encounter
    // if one doesn't exist yet.
    let npcAgentCost = 0;
    if (dmResult.stateChanges?.npcs_to_create?.length) {
      const npcRequests = dmResult.stateChanges.npcs_to_create;
      console.log("[NPC Agent] DM requested NPC creation:", npcRequests);

      // Determine if we need to create an encounter for these NPCs
      const hasHostile = npcRequests.some((r) => r.disposition === "hostile");
      const needsEncounter = hasHostile && !getEncounter();

      // If we need an encounter, create it BEFORE creating NPCs so createNPC()
      // can add them to the encounter's activeNPCs list
      if (needsEncounter) {
        console.log("[Encounter] Creating new encounter for hostile NPCs...");
        const sessionId = getSessionId();
        const enc = await createEncounter(
          sessionId,
          characterId,
          [], // NPCs will be added via createNPC() below
          gameState.story.currentLocation,
          gameState.story.currentScene,
        );
        setEncounter(enc);
        gameState.story.activeEncounterId = enc.id;
        console.log(`[Encounter] Created encounter ${enc.id}`);
      }

      await Promise.all(
        npcRequests.map(async (npcReq: NPCToCreate) => {
          console.log(`[NPC Agent] Fetching SRD data for slug: "${npcReq.slug}"`);
          const srdData = npcReq.slug
            ? await querySRD("monster", npcReq.slug)
            : null;
          console.log(`[NPC Agent] SRD data for "${npcReq.name}":`, srdData ? "found" : "null (custom creature)");

          console.log(`[NPC Agent] Calling NPC agent for: ${npcReq.count || 1}x ${npcReq.name} (${npcReq.disposition})`);
          const result = await getNPCStats(
            { ...npcReq, count: npcReq.count || 1 },
            srdData,
          );

          npcAgentCost += calculateCost(
            MODELS.UTILITY,
            result.inputTokens,
            result.outputTokens,
          );

          console.log(`[NPC Agent] Created ${result.npcs.length} NPC(s):`, result.npcs.map(n => ({
            name: n.name, ac: n.ac, hp: n.max_hp, atk: n.attack_bonus,
          })));
          console.log(`[NPC Agent] Tokens: { input: ${result.inputTokens}, output: ${result.outputTokens} }`);

          for (const npc of result.npcs) {
            createNPC(npc);
          }
        }),
      );

      // If we just created an encounter with NPCs, compute initial grid positions
      // and set the turn order now that all NPCs have been added
      const enc = getEncounter();
      if (needsEncounter && enc) {
        enc.positions = computeInitialPositions(enc.activeNPCs);
        enc.turnOrder = ["player", ...enc.activeNPCs.map(n => n.id)];
        enc.currentTurnIndex = 0;
        console.log(`[Encounter] Computed initial positions for ${enc.activeNPCs.length} NPCs + player`);
        console.log(`[Encounter] Turn order: ${enc.turnOrder.join(", ")}`);
      }

      console.log(`[NPC Agent] Total NPC agent cost: $${npcAgentCost.toFixed(4)}`);
      // Strip npcs_to_create before persisting — it's not a player state field
      delete dmResult.stateChanges.npcs_to_create;
    }

    // Safety net: auto-apply pre-rolled NPC damage if the DM forgot to set hp_delta
    if (dmResult.npcDamagePreRolled > 0) {
      const changes = dmResult.stateChanges ?? {};
      if (changes.hp_delta == null) {
        console.log(`[Safety Net] DM omitted hp_delta — auto-applying ${dmResult.npcDamagePreRolled} pre-rolled NPC damage`);
        changes.hp_delta = -dmResult.npcDamagePreRolled;
        if (!dmResult.stateChanges) dmResult.stateChanges = changes;
      }
    }

    // Apply state changes and persist to Firestore (including encounter state if active)
    console.log("[Persist] Applying state changes and saving to Firestore...");
    await applyStateChangesAndPersist(dmResult.stateChanges ?? {}, characterId);

    const totalCost = dmCost + rulesCost + npcAgentCost;
    const costBreakdown: Record<string, string> = {};
    if (inCombat) {
      costBreakdown.combat = `$${dmCost.toFixed(4)}`;
    } else {
      costBreakdown.dm = `$${dmCost.toFixed(4)}`;
    }
    if (rulesCost > 0) costBreakdown.rules = `$${rulesCost.toFixed(4)}`;
    if (npcAgentCost > 0) costBreakdown.npc = `$${npcAgentCost.toFixed(4)}`;
    console.log("[/api/chat] Turn complete:", {
      totalCost: `$${totalCost.toFixed(4)}`,
      breakdown: costBreakdown,
    });

    return NextResponse.json({
      narrative: dmResult.narrative,
      gameState: getGameState(),
      encounter: getEncounter(),
      tokensUsed: {
        dmInput: dmResult.inputTokens,
        dmOutput: dmResult.outputTokens,
        total: dmResult.inputTokens + dmResult.outputTokens,
      },
      estimatedCostUsd: totalCost,
      costBreakdown: costBreakdown,
    });
  } catch (err: unknown) {
    console.error("[/api/chat]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const characterId = req.nextUrl.searchParams.get("characterId");
    if (!characterId) {
      return NextResponse.json({ error: "characterId query param is required" }, { status: 400 });
    }
    const gameState = await loadGameState(characterId);
    return NextResponse.json({
      gameState,
      encounter: getEncounter(),
    });
  } catch (err: unknown) {
    console.error("[/api/chat GET]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
