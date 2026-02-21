/**
 * POST /api/combat/narrate
 *
 * Haiku narration of resolved combat results. No game logic or state changes.
 * Adds the narrative to conversation history and persists.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  getGameState,
  getEncounter,
  getSessionId,
  loadGameState,
  serializeCombatPlayerState,
} from "../../../lib/gameState";
import { saveCharacterState } from "../../../lib/characterStore";
import { addMessage, getRecentMessages } from "../../../lib/messageStore";
import {
  anthropic,
  MODELS,
  MAX_TOKENS,
  calculateCost,
} from "../../../lib/anthropic";
import type { ParsedRollResult } from "../../../lib/gameTypes";
import type { NPCTurnResult } from "../../../lib/combatResolver";

interface CombatNarrateBody {
  characterId: string;
  playerResult: ParsedRollResult;
  npcResults: NPCTurnResult[];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CombatNarrateBody;
    const { characterId, playerResult, npcResults } = body;

    if (!characterId) {
      return NextResponse.json(
        { error: "characterId is required" },
        { status: 400 },
      );
    }

    // Load game state for scene context
    const gameState = await loadGameState(characterId);
    const encounter = getEncounter();
    const { player, story } = gameState;

    // Build narration prompt
    const playerSummary = serializeCombatPlayerState(player);

    let playerTurnText = "";
    if (playerResult.noCheck) {
      playerTurnText = `PLAYER ACTION: ${playerResult.checkType} — ${playerResult.notes}`;
    } else if (playerResult.impossible) {
      playerTurnText = `PLAYER ACTION FAILED: ${playerResult.notes}`;
    } else {
      const hitMiss = playerResult.success ? "HIT" : "MISS";
      playerTurnText = `PLAYER TURN: ${playerResult.checkType}, rolled ${playerResult.dieResult}${playerResult.totalModifier}=${playerResult.total} vs AC ${playerResult.dcOrAc} → ${hitMiss}`;
      if (playerResult.damage) {
        const dmgBreakdown = playerResult.damage.breakdown
          .map(
            (b) =>
              `${b.label}: [${b.rolls.join(",")}]${b.flatBonus ? (b.flatBonus > 0 ? `+${b.flatBonus}` : b.flatBonus) : ""}=${b.subtotal} ${b.damageType ?? ""}`,
          )
          .join("; ");
        playerTurnText += `. Damage: ${playerResult.damage.totalDamage} (${dmgBreakdown})`;
        if (playerResult.damage.isCrit) playerTurnText += " CRITICAL HIT!";
      }
    }

    let npcTurnsText = "";
    if (npcResults.length > 0) {
      npcTurnsText =
        "\nNPC TURNS:\n" +
        npcResults
          .map((r) => {
            const hitMiss = r.hit ? "HIT" : "MISS";
            return `  ${r.npcName} attacks ${player.name}: rolled ${r.d20}+${r.attackTotal - r.d20}=${r.attackTotal} vs AC ${player.armorClass} → ${hitMiss}${r.hit ? `. Damage: ${r.damage}` : ""}`;
          })
          .join("\n");
    }

    const survivingHostiles = (encounter?.activeNPCs ?? []).filter(
      (n) => n.disposition === "hostile" && n.currentHp > 0,
    );
    const deadThisTurn = (encounter?.activeNPCs ?? []).filter(
      (n) => n.disposition === "hostile" && n.currentHp <= 0,
    );

    const sceneContext = [
      `Location: ${story.currentLocation}`,
      `Scene: ${story.currentScene}`,
      `Player: ${playerSummary}`,
      survivingHostiles.length > 0
        ? `Surviving hostiles: ${survivingHostiles.map((n) => `${n.name} (${n.currentHp}/${n.maxHp} HP)`).join(", ")}`
        : "All hostiles defeated!",
      deadThisTurn.length > 0
        ? `Killed this turn: ${deadThisTurn.map((n) => n.name).join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const systemPrompt = `You are a D&D 5e Dungeon Master narrating combat. Write in second person — address the player as "you". Given the mechanical results below, write vivid 2–3 paragraph narration.

Include damage numbers naturally in prose (e.g. "dealing **8 damage**"). Do NOT include raw dice rolls, modifiers, AC values, or attack totals — the player already sees those in the UI. Just narrate what happened dramatically.

Use **bold** for actions and damage. Use *italics* for sensory details. No headers, bullet lists, or labels — start directly with the narration.`;

    const userMessage = `${sceneContext}\n\n${playerTurnText}${npcTurnsText}`;

    // Include last conversation turn for tonal continuity
    const sessionId = getSessionId();
    const recentMsgs = await getRecentMessages(sessionId, 2);
    const historyMessages: Anthropic.MessageParam[] =
      recentMsgs.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const response = await anthropic.messages.create({
      model: MODELS.UTILITY,
      max_tokens: MAX_TOKENS.COMBAT,
      system: systemPrompt,
      messages: [...historyMessages, { role: "user", content: userMessage }],
    });

    const narrative = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n");

    await addMessage(sessionId, {
      role: "assistant",
      content: narrative,
      timestamp: Date.now(),
    });

    await saveCharacterState(characterId, {
      story: gameState.story,
    });

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    return NextResponse.json({
      narrative,
      tokensUsed: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
      },
      estimatedCostUsd: calculateCost(
        MODELS.UTILITY,
        inputTokens,
        outputTokens,
      ),
    });
  } catch (err) {
    console.error("[/api/combat/narrate] Error:", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Combat narration failed" },
      { status: 500 },
    );
  }
}
