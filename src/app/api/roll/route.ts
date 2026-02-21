/**
 * POST /api/roll
 *
 * Phase 1 of the two-phase turn flow.
 * Checks if the player's action is contested, runs the rules agent if so,
 * and returns the parsed result for the frontend to display interactively.
 *
 * Also writes the roll result to the messages subcollection so other
 * players (future multiplayer) can see it via their Firestore listener.
 *
 * The DM agent is NOT called here — that happens in /api/chat once the
 * player has seen and acknowledged the roll result.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getRulesOutcome,
  isContestedAction,
} from "../../agents/rulesAgent";
import { loadGameState, getActiveNPCs, getSessionId } from "../../lib/gameState";
import { MODELS, calculateCost } from "../../lib/anthropic";
import { addMessage } from "../../lib/messageStore";

export async function POST(req: NextRequest) {
  try {
    interface RollRequestBody {
      characterId: string;
      playerInput: string;
    }

    const { characterId, playerInput } = (await req.json()) as RollRequestBody;

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
    const sessionId = getSessionId();
    const outcome = await getRulesOutcome(playerInput, gameState.player, getActiveNPCs());
    const rulesCost = calculateCost(
      MODELS.UTILITY,
      outcome.inputTokens,
      outcome.outputTokens,
    );

    // Write roll result to messages subcollection for real-time listeners
    await addMessage(sessionId, {
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      rollResult: outcome.parsed,
    });

    return NextResponse.json({
      isContested: true,
      roll: outcome.roll,
      parsed: outcome.parsed,
      raw: outcome.raw,
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
