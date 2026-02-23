/**
 * POST /api/chat
 *
 * Single endpoint for all player actions. Handles the full flow:
 * 1. Write user message to Firestore
 * 2. Run rules agent for contested actions → write roll result to Firestore
 * 3. Run DM/combat agent → write narrative to Firestore
 * 4. NPC orchestration, state persistence
 *
 * Roll results are written BEFORE the DM agent call so all connected
 * players see the dice animation immediately via onSnapshot.
 *
 * Uses an action queue to serialize concurrent player actions per session.
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
import {
  applyStateChangesAndPersist,
  createNPC,
  getActiveNPCs,
  getEncounter,
  getGameState,
  getSessionId,
  getActiveMapId,
  getExplorationPositions,
  loadGameState,
  NPCToCreate,
  setEncounter,
} from "../../lib/gameState";
import { createEncounter, computeInitialPositions } from "../../lib/encounterStore";
import { loadMap } from "../../lib/mapStore";
import { querySRD, loadSession } from "../../lib/characterStore";
import { MODELS, calculateCost } from "../../lib/anthropic";
import { addMessage } from "../../lib/messageStore";
import { enqueueAction, claimNextAction, completeAction, failAction } from "../../lib/actionQueue";
import type { StoredAction } from "../../lib/gameTypes";

interface ChatRequestBody {
  characterId: string;
  playerInput: string;
}

/**
 * Process a single chat action: run agents, write messages, persist state.
 * Extracted so it can be called for both the initial action and chained actions.
 */
async function processChatAction(
  characterId: string,
  playerInput: string,
  sessionId: string,
) {
  const gameState = await loadGameState(characterId);

  // Block chat while a level-up wizard is pending
  if (gameState.player.pendingLevelUp) {
    return { levelUpPending: true };
  }

  // Write user message to subcollection
  await addMessage(sessionId, {
    role: "user",
    content: playerInput,
    characterId,
    timestamp: Date.now(),
  });

  // Inline rules check: run the rules agent if the action is contested,
  // then write the roll result to Firestore so all players see the animation
  // immediately (before the DM agent call which takes 10-30s).
  let rulesOutcome = null;
  let rulesCost = 0;

  if (isContestedAction(playerInput)) {
    console.log("[Rules Agent] Contested action detected, calling rules agent...");
    rulesOutcome = await getRulesOutcome(playerInput, gameState.player, getActiveNPCs());
    rulesCost = calculateCost(MODELS.UTILITY, rulesOutcome.inputTokens, rulesOutcome.outputTokens);
    console.log("[Rules Agent] Done:", {
      roll: rulesOutcome.roll,
      tokens: { input: rulesOutcome.inputTokens, output: rulesOutcome.outputTokens },
      cost: `$${rulesCost.toFixed(4)}`,
    });

    // Write roll result to Firestore before DM call so players see dice animation
    if (!rulesOutcome.parsed.impossible && !rulesOutcome.parsed.noCheck) {
      await addMessage(sessionId, {
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        rollResult: rulesOutcome.parsed,
      });
    }
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
      }, rulesOutcome, sessionId)
    : await getDMResponse(playerInput, gameState, rulesOutcome, sessionId);
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

  // Write assistant message to subcollection
  await addMessage(sessionId, {
    role: "assistant",
    content: dmResult.narrative,
    timestamp: Date.now(),
  });

  // NPC orchestration: when the DM's update_game_state includes npcs_to_create,
  // we fan out to the NPC agent for each creature, then create an encounter
  // if one doesn't exist yet.
  let npcAgentCost = 0;
  if (dmResult.stateChanges?.npcs_to_create?.length) {
    const npcRequests = dmResult.stateChanges.npcs_to_create;
    console.log("[NPC Agent] DM requested NPC creation:", npcRequests);

    const hasHostile = npcRequests.some((r) => r.disposition === "hostile");
    const needsEncounter = hasHostile && !getEncounter();

    // Load active map (if any) for region-aware NPC placement
    const activeMapId = getActiveMapId();
    const activeMap = needsEncounter && activeMapId ? await loadMap(activeMapId) : null;

    if (needsEncounter) {
      console.log("[Encounter] Creating new encounter for hostile NPCs...");
      const session = await loadSession(sessionId);
      const allCharacterIds = session?.characterIds ?? [characterId];
      const enc = await createEncounter(
        sessionId,
        allCharacterIds,
        [],
        gameState.story.currentLocation,
        gameState.story.currentScene,
        {
          mapId: activeMapId,
          regions: activeMap?.regions,
          explorationPositions: getExplorationPositions(),
        },
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

        for (const npc of result.npcs) {
          createNPC(npc);
        }
      }),
    );

    const enc = getEncounter();
    if (needsEncounter && enc) {
      enc.positions = computeInitialPositions(
        enc.activeNPCs,
        activeMap?.regions,
        getExplorationPositions(),
      );
      enc.turnOrder = ["player", ...enc.activeNPCs.map(n => n.id)];
      enc.currentTurnIndex = 0;
      console.log(`[Encounter] Computed initial positions for ${enc.activeNPCs.length} NPCs + player`);
    }

    console.log(`[NPC Agent] Total NPC agent cost: $${npcAgentCost.toFixed(4)}`);
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

  return {
    gameState: getGameState(),
    encounter: getEncounter(),
    tokensUsed: {
      dmInput: dmResult.inputTokens,
      dmOutput: dmResult.outputTokens,
      total: dmResult.inputTokens + dmResult.outputTokens,
    },
    estimatedCostUsd: totalCost,
    costBreakdown,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequestBody;
    const { characterId, playerInput } = body;

    if (!playerInput?.trim()) {
      return NextResponse.json({ error: "playerInput is required" }, { status: 400 });
    }
    if (!characterId?.trim()) {
      return NextResponse.json({ error: "characterId is required" }, { status: 400 });
    }

    // Load state to get sessionId and check for level-up
    console.log("[/api/chat] Loading game state for character:", characterId);
    const initialState = await loadGameState(characterId);
    const sessionId = getSessionId();

    if (initialState.player.pendingLevelUp) {
      return NextResponse.json(
        { error: "Level up pending", pendingLevelUp: true },
        { status: 409 },
      );
    }

    // Enqueue the action
    const actionId = await enqueueAction(sessionId, {
      characterId,
      type: "chat",
      payload: { playerInput },
    });

    // Try to claim the next action for processing
    const claimed = await claimNextAction(sessionId);
    if (!claimed) {
      // Another request is already processing — our action is queued
      console.log("[/api/chat] Action queued (another processor active):", actionId);
      return NextResponse.json({ ok: true, queued: true }, { status: 202 });
    }

    // Process actions in a loop (handles chain-processing of queued actions)
    let lastResult = null;

    try {
      let currentAction: StoredAction | null = claimed;
      while (currentAction) {
        const payload = currentAction.payload as { playerInput: string };

        const result = await processChatAction(
          currentAction.characterId,
          payload.playerInput,
          sessionId,
        );

        // If level-up is pending, mark action as completed and stop
        if ("levelUpPending" in result) {
          await completeAction(sessionId, currentAction.id!);
          return NextResponse.json(
            { error: "Level up pending", pendingLevelUp: true },
            { status: 409 },
          );
        }

        lastResult = result;
        const hasMore = await completeAction(sessionId, currentAction.id!);

        if (hasMore) {
          // Claim and process the next queued action
          currentAction = await claimNextAction(sessionId);
        } else {
          currentAction = null;
        }
      }
    } catch (err) {
      // Mark action as failed so other requests can reclaim
      await failAction(sessionId, claimed.id!);
      throw err;
    }

    return NextResponse.json({
      ok: true,
      ...lastResult,
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
    const sessionId = getSessionId();
    return NextResponse.json({
      gameState,
      encounter: getEncounter(),
      sessionId,
      explorationPositions: getExplorationPositions() ?? null,
      activeMapId: getActiveMapId() ?? null,
    });
  } catch (err: unknown) {
    console.error("[/api/chat GET]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
