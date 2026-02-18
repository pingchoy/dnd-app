/**
 * POST /api/roll
 *
 * Phase 1 of the two-phase turn flow.
 * Checks if the player's action is contested, runs the rules agent if so,
 * and returns the parsed result for the frontend to display interactively.
 *
 * The DM agent is NOT called here — that happens in /api/chat once the
 * player has seen and acknowledged the roll result.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getRulesOutcome,
  isContestedAction,
  parseRulesOutcome,
} from "../../agents/rulesAgent";
import { loadGameState } from "../../lib/gameState";
import { MODELS, calculateCost } from "../../lib/anthropic";

export async function POST(req: NextRequest) {
  try {
    const { characterId, playerInput } = (await req.json()) as {
      characterId: string;
      playerInput: string;
    };

    if (!playerInput?.trim()) {
      return NextResponse.json({ error: "playerInput is required" }, { status: 400 });
    }
    if (!characterId?.trim()) {
      return NextResponse.json({ error: "characterId is required" }, { status: 400 });
    }

    if (!isContestedAction(playerInput)) {
      return NextResponse.json({ isContested: false });
    }

    const gameState = await loadGameState(characterId);
    const outcome = await getRulesOutcome(playerInput, gameState.player, gameState.story.activeNPCs);
    const parsed = parseRulesOutcome(outcome.raw, outcome.roll);
    const rulesCost = calculateCost(
      MODELS.UTILITY,
      outcome.inputTokens,
      outcome.outputTokens,
    );

    return NextResponse.json({
      isContested: true,
      roll: outcome.roll,
      parsed,
      raw: outcome.raw,       // passed back to /api/chat so the DM sees the result
      rulesCost,
      tokensUsed: {
        input: outcome.inputTokens,
        output: outcome.outputTokens,
      },
    });
  } catch (err: unknown) {
    console.error("[/api/roll]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
