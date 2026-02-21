"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ParsedRollResult } from "../agents/rulesAgent";
import { GameState, StoredEncounter, OPENING_NARRATIVE, ConversationTurn, Ability } from "../lib/gameTypes";
import type { NPCTurnResult } from "../lib/combatResolver";

export const CHARACTER_ID_KEY = "dnd_character_id";
export const CHARACTER_IDS_KEY = "dnd_character_ids";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /** If present, renders a historical dice-roll card instead of normal text. */
  rollResult?: ParsedRollResult;
}

/** Holds everything needed to display the dice UI and continue to the DM call. */
export interface PendingRoll {
  playerInput: string;
  roll: number;
  parsed: ParsedRollResult;
  raw: string;
  rulesCost: number;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  gameState: GameState | null;
  /** Active combat encounter data, or null if not in combat. */
  encounter: StoredEncounter | null;
  /** Non-null while the dice roll UI should be shown. */
  pendingRoll: PendingRoll | null;
  /** True while the initial character is loading from Firestore. */
  isLoading: boolean;
  /** True while /api/chat is in-flight after the player clicks Continue. */
  isNarrating: boolean;
  /** True while /api/roll is in-flight (before dice UI appears). */
  isRolling: boolean;
  totalTokens: number;
  estimatedCostUsd: number;
  /** The Firestore character ID (null until loaded from localStorage). */
  characterId: string | null;
  sendMessage: (input: string) => Promise<void>;
  confirmRoll: () => Promise<void>;
  /** Apply a debug action result: update game state and append a system message. */
  applyDebugResult: (gameState: GameState, message: string, encounter?: StoredEncounter | null) => void;
  /** Execute a deterministic combat action (ability bar click). */
  executeCombatAction: (ability: Ability, targetId?: string) => Promise<void>;
  /** NPC turn results from the last combat action (shown in dice UI). */
  pendingNPCResults: NPCTurnResult[] | null;
}

export function useChat(): UseChatReturn {
  const router = useRouter();
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [encounter, setEncounter] = useState<StoredEncounter | null>(null);
  const [pendingRoll, setPendingRoll] = useState<PendingRoll | null>(null);
  const [isLoading, setIsLoading]     = useState(true);
  const [isRolling, setIsRolling]     = useState(false);
  const [isNarrating, setIsNarrating] = useState(false);
  const [totalTokens, setTotalTokens] = useState(0);
  const [estimatedCostUsd, setEstimatedCostUsd] = useState(0);
  const [pendingNPCResults, setPendingNPCResults] = useState<NPCTurnResult[] | null>(null);

  // On mount: read characterId from localStorage; redirect to creation if missing.
  useEffect(() => {
    const id = localStorage.getItem(CHARACTER_ID_KEY);
    if (!id) {
      router.replace("/characters");
      return;
    }

    setCharacterId(id);

    fetch(`/api/chat?characterId=${encodeURIComponent(id)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const gs: GameState = data.gameState;
        setGameState(gs);
        setEncounter(data.encounter ?? null);

        if (gs.conversationHistory.length === 0) {
          // Brand-new character — show the opening narrative
          setMessages([{ role: "assistant", content: OPENING_NARRATIVE, timestamp: Date.now() }]);
        } else {
          // Returning character — rebuild UI messages from persisted history
          setMessages(
            gs.conversationHistory.map((t: ConversationTurn) => ({
              role: t.role,
              content: t.content,
              timestamp: t.timestamp,
            })),
          );
        }
      })
      .catch((err) => {
        console.error("[useChat] Failed to load character state:", err);
        // Character not found or error — send back to character select
        router.replace("/characters");
      })
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Phase 1 — submit action, check for dice roll. */
  async function sendMessage(input: string): Promise<void> {
    if (!input.trim() || isRolling || isNarrating || pendingRoll || !characterId) return;

    // Show the player's message immediately
    setMessages((prev) => [...prev, { role: "user", content: input, timestamp: Date.now() }]);
    setIsRolling(true);

    try {
      const rollRes = await fetch("/api/roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, playerInput: input }),
      });

      if (!rollRes.ok) throw new Error((await rollRes.json()).error ?? "Roll failed");

      const rollData = await rollRes.json();

      if (!rollData.isContested) {
        // No roll needed — go straight to the DM
        setIsRolling(false);
        await requestNarrative(input, null);
        return;
      }

      // Accumulate the rules-agent cost immediately
      setTotalTokens((t) => t + (rollData.tokensUsed?.input ?? 0) + (rollData.tokensUsed?.output ?? 0));
      setEstimatedCostUsd((c) => c + (rollData.rulesCost ?? 0));

      // Action impossible — skip dice, send rejection context to DM
      if (rollData.parsed?.impossible) {
        setIsRolling(false);
        await requestNarrative(input, {
          playerInput: input,
          roll: 0,
          parsed: rollData.parsed,
          raw: rollData.raw,
          rulesCost: rollData.rulesCost ?? 0,
        });
        return;
      }

      // No mechanical check needed — skip dice UI, pass to DM
      if (rollData.parsed?.noCheck) {
        setIsRolling(false);
        await requestNarrative(input, {
          playerInput: input,
          roll: 0,
          parsed: rollData.parsed,
          raw: rollData.raw,
          rulesCost: rollData.rulesCost ?? 0,
        });
        return;
      }

      // Park the roll — the DiceRoll component will appear
      setPendingRoll({
        playerInput: input,
        roll: rollData.roll,
        parsed: rollData.parsed,
        raw: rollData.raw,
        rulesCost: rollData.rulesCost ?? 0,
      });
    } catch (err) {
      console.error("[useChat] sendMessage error:", err);
      appendError();
    } finally {
      setIsRolling(false);
    }
  }

  /** Phase 2 — player has seen the dice result and clicks Continue. */
  async function confirmRoll(): Promise<void> {
    if (!pendingRoll) return;
    const pr = pendingRoll;
    // Persist the roll as a historical card in the chat before clearing it
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", rollResult: pr.parsed, timestamp: Date.now() },
    ]);
    setPendingRoll(null);

    // Route to combat narration if this was a combat action
    if (pendingNPCResults !== null) {
      await requestCombatNarration(pr.parsed, pendingNPCResults);
    } else {
      await requestNarrative(pr.playerInput, pr);
    }
  }

  /** Calls /api/chat and appends the DM response. */
  async function requestNarrative(
    playerInput: string,
    roll: PendingRoll | null,
  ): Promise<void> {
    if (!characterId) return;
    setIsNarrating(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId,
          playerInput,
          precomputedRules: roll
            ? {
                parsed: roll.parsed,
                raw: roll.raw,
                roll: roll.roll,
                rulesCost: roll.rulesCost,
                damageTotal: roll.parsed.damage?.totalDamage,
                damageBreakdown: roll.parsed.damage?.breakdown
                  .map((b) => `${b.label}: [${b.rolls.join(",")}]${b.flatBonus ? (b.flatBonus > 0 ? `+${b.flatBonus}` : b.flatBonus) : ""}=${b.subtotal}${b.damageType ? ` ${b.damageType}` : ""}`)
                  .join("; "),
              }
            : undefined,
        }),
      });

      if (res.status === 409) {
        // Level-up pending — refresh game state to trigger the wizard
        const refreshRes = await fetch(`/api/chat?characterId=${encodeURIComponent(characterId)}`);
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          setGameState(refreshData.gameState);
          setEncounter(refreshData.encounter ?? null);
        }
        return;
      }

      if (!res.ok) throw new Error((await res.json()).error ?? "Chat failed");

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.narrative, timestamp: Date.now() },
      ]);
      setGameState(data.gameState);
      setEncounter(data.encounter ?? null);
      setTotalTokens((t) => t + (data.tokensUsed?.total ?? 0));
      setEstimatedCostUsd((c) => c + (data.estimatedCostUsd ?? 0));
    } catch (err) {
      console.error("[useChat] requestNarrative error:", err);
      appendError();
    } finally {
      setIsNarrating(false);
    }
  }

  /**
   * Execute a deterministic combat action via /api/combat/action.
   * Parks the result in pendingRoll (reuses existing dice UI).
   * NPC results are stored separately for the narration call.
   */
  async function executeCombatAction(ability: Ability, targetId?: string): Promise<void> {
    if (!characterId || isRolling || isNarrating || pendingRoll) return;

    setIsRolling(true);
    try {
      const res = await fetch("/api/combat/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, abilityId: ability.id, targetId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Combat action failed");
      }

      const data = await res.json();

      // Update game state and encounter immediately (already persisted server-side)
      setGameState(data.gameState);
      setEncounter(data.encounter ?? null);

      // Store NPC results for the narration phase
      setPendingNPCResults(data.npcResults ?? []);

      // Park the player result as a pending roll (reuses DiceRoll component)
      if (data.playerResult.noCheck) {
        // Non-targeted actions (Dodge/Dash/Disengage): skip dice UI, go straight to narration
        await requestCombatNarration(data.playerResult, data.npcResults ?? []);
      } else {
        setPendingRoll({
          playerInput: `[Combat] ${ability.name}${targetId ? ` on target` : ""}`,
          roll: data.playerResult.dieResult,
          parsed: data.playerResult,
          raw: "",
          rulesCost: 0,
        });
      }
    } catch (err) {
      console.error("[useChat] executeCombatAction error:", err);
      appendError();
    } finally {
      setIsRolling(false);
    }
  }

  /** Narrate combat results via /api/combat/narrate (Haiku only). */
  async function requestCombatNarration(
    playerResult: import("../lib/gameTypes").ParsedRollResult,
    npcResults: NPCTurnResult[],
  ): Promise<void> {
    if (!characterId) return;
    setIsNarrating(true);
    try {
      const res = await fetch("/api/combat/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, playerResult, npcResults }),
      });

      if (!res.ok) throw new Error((await res.json()).error ?? "Narration failed");

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.narrative, timestamp: Date.now() },
      ]);
      setTotalTokens((t) => t + (data.tokensUsed?.total ?? 0));
      setEstimatedCostUsd((c) => c + (data.estimatedCostUsd ?? 0));
    } catch (err) {
      console.error("[useChat] requestCombatNarration error:", err);
      appendError();
    } finally {
      setIsNarrating(false);
      setPendingNPCResults(null);
    }
  }

  function appendError() {
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "The dungeon master encountered an error. Please check your API key and try again.",
        timestamp: Date.now(),
      },
    ]);
  }

  function applyDebugResult(newState: GameState, message: string, newEncounter?: StoredEncounter | null): void {
    setGameState(newState);
    if (newEncounter !== undefined) {
      setEncounter(newEncounter);
    }
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: message, timestamp: Date.now() },
    ]);
  }

  return {
    messages,
    gameState,
    encounter,
    pendingRoll,
    isLoading,
    isRolling,
    isNarrating,
    totalTokens,
    estimatedCostUsd,
    characterId,
    sendMessage,
    confirmRoll,
    applyDebugResult,
    executeCombatAction,
    pendingNPCResults,
  };
}
