"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ParsedRollResult } from "../agents/rulesAgent";
import { GameState, StoredEncounter, OPENING_NARRATIVE, ConversationTurn, Ability, CombatSSEEvent } from "../lib/gameTypes";

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
  /** True while the turn-by-turn combat loop is processing (SSE streaming). */
  isCombatProcessing: boolean;
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
  const [isCombatProcessing, setIsCombatProcessing] = useState(false);
  const [totalTokens, setTotalTokens] = useState(0);
  const [estimatedCostUsd, setEstimatedCostUsd] = useState(0);

  // SSE connection management
  const eventSourceRef = useRef<EventSource | null>(null);
  const characterIdRef = useRef<string | null>(null);

  // Keep characterId ref in sync
  useEffect(() => {
    characterIdRef.current = characterId;
  }, [characterId]);

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

  /**
   * SSE combat stream — opens when an active encounter with hostiles exists,
   * closes on combat_end or when the encounter changes.
   */
  const handleCombatEvent = useCallback((data: CombatSSEEvent) => {
    switch (data.type) {
      case "round_start":
        // Round display updated via state_update
        break;

      case "player_turn":
        setMessages(prev => [...prev, {
          role: "assistant",
          content: data.narrative,
          timestamp: Date.now(),
        }]);
        break;

      case "npc_turn":
        setMessages(prev => [...prev, {
          role: "assistant",
          content: data.narrative,
          timestamp: Date.now(),
        }]);
        break;

      case "state_update":
        setGameState(data.gameState);
        setEncounter(data.encounter);
        break;

      case "round_end":
        setIsCombatProcessing(false);
        break;

      case "player_dead":
        setIsCombatProcessing(false);
        break;

      case "combat_end": {
        setIsCombatProcessing(false);
        // Close SSE connection
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        // Refetch final game state (encounter completed, activeEncounterId cleared)
        const cId = characterIdRef.current;
        if (cId) {
          fetch(`/api/chat?characterId=${encodeURIComponent(cId)}`)
            .then(res => res.json())
            .then(refreshData => {
              setGameState(refreshData.gameState);
              setEncounter(refreshData.encounter ?? null);
            })
            .catch(err => console.error("[useChat] Failed to refresh after combat end:", err));
        }
        break;
      }

      case "error":
        console.error("[SSE] Server error:", data.message);
        setIsCombatProcessing(false);
        break;
    }
  }, []);

  // Open/close SSE connection based on encounter state
  useEffect(() => {
    const hasHostiles = encounter?.activeNPCs?.some(
      n => n.disposition === "hostile" && n.currentHp > 0,
    );
    const shouldConnect = encounter?.id && encounter.status === "active" && hasHostiles;

    if (!shouldConnect) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    // Already connected — don't reopen
    if (eventSourceRef.current) return;

    console.log(`[useChat] Opening SSE connection for encounter ${encounter.id}`);
    const es = new EventSource(`/api/combat/stream?encounterId=${encounter.id}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as CombatSSEEvent;
        handleCombatEvent(data);
      } catch (err) {
        console.error("[SSE] Failed to parse event:", err);
      }
    };

    es.onerror = () => {
      console.error("[SSE] Connection error — closing");
      es.close();
      eventSourceRef.current = null;
      setIsCombatProcessing(false);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter?.id, encounter?.status, handleCombatEvent]);

  // Clean up SSE on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, []);

  // Safety timeout: if isCombatProcessing stays true for 30s, reset it
  useEffect(() => {
    if (!isCombatProcessing) return;
    const timer = setTimeout(() => {
      console.warn("[useChat] Combat processing timeout — resetting");
      setIsCombatProcessing(false);
    }, 30_000);
    return () => clearTimeout(timer);
  }, [isCombatProcessing]);

  /** Phase 1 — submit action, check for dice roll. */
  async function sendMessage(input: string): Promise<void> {
    if (!input.trim() || isRolling || isNarrating || pendingRoll || isCombatProcessing || !characterId) return;

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
    await requestNarrative(pr.playerInput, pr);
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
   * Execute a combat action via the ability bar.
   * Sends POST to /api/combat/action which triggers the turn-by-turn loop.
   * All UI updates come through the SSE combat stream.
   */
  async function executeCombatAction(ability: Ability, targetId?: string): Promise<void> {
    if (!characterId || isRolling || isNarrating || pendingRoll || isCombatProcessing) return;

    // Show the player's action as a message immediately
    let actionDesc = `I use ${ability.name}`;
    if (targetId) {
      const targetNPC = encounter?.activeNPCs.find(n => n.id === targetId);
      actionDesc += ` on ${targetNPC?.name ?? targetId}`;
    }
    setMessages(prev => [...prev, { role: "user", content: actionDesc, timestamp: Date.now() }]);

    // Block input until round_end SSE event
    setIsCombatProcessing(true);

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

      // Response arrives after all turns are processed.
      // UI has already been updated via SSE events during this time.
      // We can use the response for final state reconciliation if needed.
    } catch (err) {
      console.error("[useChat] executeCombatAction error:", err);
      setIsCombatProcessing(false);
      appendError();
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
    isCombatProcessing,
    totalTokens,
    estimatedCostUsd,
    characterId,
    sendMessage,
    confirmRoll,
    applyDebugResult,
    executeCombatAction,
  };
}
