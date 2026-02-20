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
 * GET /api/chat?characterId=xxx
 *   Returns the current game state for a character (used on initial load).
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
  getGameState,
  loadGameState,
  NPCToCreate,
} from "../../lib/gameState";
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
      rulesOutcome = await getRulesOutcome(playerInput, gameState.player);
      rulesCost = calculateCost(MODELS.UTILITY, rulesOutcome.inputTokens, rulesOutcome.outputTokens);
      console.log("[Rules Agent] Done:", {
        roll: rulesOutcome.roll,
        tokens: { input: rulesOutcome.inputTokens, output: rulesOutcome.outputTokens },
        cost: `$${rulesCost.toFixed(4)}`,
      });
    } else {
      console.log("[Rules Agent] Skipped — not a contested action");
    }

    // Deterministic routing: combat agent for active hostile NPCs, DM agent otherwise
    const inCombat = gameState.story.activeNPCs.some(
      (n) => n.disposition === "hostile" && n.currentHp > 0,
    );
    const agentLabel = inCombat ? "Combat Agent" : "DM Agent";
    const agentModel = inCombat ? MODELS.UTILITY : MODELS.NARRATIVE;

    console.log(`[${agentLabel}] Calling with player input:`, playerInput.slice(0, 100));
    const dmResult = inCombat
      ? await getCombatResponse(playerInput, gameState, rulesOutcome)
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
    // we fan out to the NPC agent for each creature. Each request:
    //   1. Fetches the SRD monster stat block (if the slug is non-empty)
    //   2. Calls the NPC agent (Haiku) to produce a compact combat stat block
    //   3. Registers the NPC in the in-memory game state
    // All creatures are processed in parallel for speed.
    let npcAgentCost = 0;
    if (dmResult.stateChanges?.npcs_to_create?.length) {
      const npcRequests = dmResult.stateChanges.npcs_to_create;
      console.log("[NPC Agent] DM requested NPC creation:", npcRequests);

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

    // Apply state changes (HP, inventory, conditions, gold, XP) and persist to Firestore
    console.log("[Persist] Applying state changes and saving to Firestore...");
    if (dmResult.stateChanges) {
      await applyStateChangesAndPersist(dmResult.stateChanges, characterId);
    } else {
      // No state changes from DM — still persist conversation history
      await applyStateChangesAndPersist({}, characterId);
    }

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
    return NextResponse.json({ gameState });
  } catch (err: unknown) {
    console.error("[/api/chat GET]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
