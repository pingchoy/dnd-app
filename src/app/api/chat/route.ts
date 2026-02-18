/**
 * POST /api/chat
 *
 * Phase 2 of the two-phase turn flow.
 * Receives the player input plus an optional pre-computed rules outcome
 * (from /api/roll) and runs the DM agent to generate the narrative.
 *
 * If precomputedRules is provided the rules agent is skipped entirely —
 * no duplicate API call, no duplicate cost.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDMResponse } from "../../agents/dmAgent";
import { getRulesOutcome, isContestedAction } from "../../agents/rulesAgent";
import { addConversationTurn, getGameState } from "../../lib/gameState";
import { HISTORY_WINDOW, MODELS, calculateCost } from "../../lib/anthropic";
import { RulesOutcome } from "../../agents/rulesAgent";

interface PrecomputedRules {
  raw: string;
  roll: number;
  rulesCost: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      playerInput: string;
      precomputedRules?: PrecomputedRules;
    };

    const { playerInput, precomputedRules } = body;

    if (!playerInput?.trim()) {
      return NextResponse.json({ error: "playerInput is required" }, { status: 400 });
    }

    const gameState = getGameState();
    let rulesOutcome: RulesOutcome | null = null;
    let rulesCost = 0;

    if (precomputedRules) {
      // Rules were already run in /api/roll — reuse, don't re-call the agent
      rulesOutcome = {
        raw: precomputedRules.raw,
        roll: precomputedRules.roll,
        inputTokens: 0,
        outputTokens: 0,
      };
      rulesCost = precomputedRules.rulesCost;
    } else if (isContestedAction(playerInput)) {
      // Fallback: run rules inline if the client skipped /api/roll
      rulesOutcome = await getRulesOutcome(playerInput, gameState.player);
      rulesCost = calculateCost(MODELS.UTILITY, rulesOutcome.inputTokens, rulesOutcome.outputTokens);
    }

    const dmResult = await getDMResponse(playerInput, gameState, rulesOutcome);
    const dmCost = calculateCost(MODELS.NARRATIVE, dmResult.inputTokens, dmResult.outputTokens);

    addConversationTurn("user", playerInput, HISTORY_WINDOW);
    addConversationTurn("assistant", dmResult.narrative, HISTORY_WINDOW);

    return NextResponse.json({
      narrative: dmResult.narrative,
      gameState: getGameState(),
      tokensUsed: {
        dmInput: dmResult.inputTokens,
        dmOutput: dmResult.outputTokens,
        total: dmResult.inputTokens + dmResult.outputTokens,
      },
      estimatedCostUsd: dmCost + rulesCost,
    });
  } catch (err: unknown) {
    console.error("[/api/chat]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ gameState: getGameState() });
}
