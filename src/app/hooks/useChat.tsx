"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { getClientDb } from "../lib/firebaseClient";
import { ParsedRollResult } from "../agents/rulesAgent";
import { StoredEncounter, OPENING_NARRATIVE, Ability, StoredMessage } from "../lib/gameTypes";
import type { GameState } from "../lib/gameTypes";

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
  /** True while the turn-by-turn combat loop is processing. */
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
  /** Ref to set a callback for showing floating combat labels on the grid. */
  combatLabelRef: React.MutableRefObject<((tokenId: string, hit: boolean, damage: number) => void) | null>;
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

  // Combat floating label callback (set by dashboard, called on hit/miss results)
  const combatLabelRef = useRef<((tokenId: string, hit: boolean, damage: number) => void) | null>(null);

  // Track which roll message IDs have already been animated (one-time animation)
  const animatedRollIds = useRef(new Set<string>());
  const characterIdRef = useRef<string | null>(null);
  // Session ID for Firestore message subscription
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Ref to track snapshot unsubscribe
  const unsubRef = useRef<Unsubscribe | null>(null);

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
        setSessionId(data.sessionId ?? null);
      })
      .catch((err) => {
        console.error("[useChat] Failed to load character state:", err);
        router.replace("/characters");
      })
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Real-time Firestore listener for the messages subcollection.
   * Replaces the old SSE combat stream + manual message state management.
   * Messages are the single source of truth — all narratives, roll results,
   * and combat turn narrations arrive through this listener.
   */
  useEffect(() => {
    if (!sessionId) return;

    // Clean up previous subscription if any
    unsubRef.current?.();

    const db = getClientDb();
    const messagesRef = collection(db, "sessions", sessionId, "messages");
    const messagesQuery = query(messagesRef, orderBy("timestamp", "asc"));

    const unsub = onSnapshot(messagesQuery, (snapshot) => {
      const msgs: ChatMessage[] = snapshot.docs.map((doc) => {
        const data = doc.data() as StoredMessage;
        return {
          role: data.role,
          content: data.content,
          timestamp: data.timestamp,
          rollResult: data.rollResult,
        };
      });

      if (msgs.length === 0) {
        // Brand-new session — show opening narrative
        setMessages([{ role: "assistant", content: OPENING_NARRATIVE, timestamp: Date.now() }]);
      } else {
        setMessages(msgs);
      }
    }, (err) => {
      console.error("[useChat] Firestore messages listener error:", err);
    });

    unsubRef.current = unsub;
    return () => unsub();
  }, [sessionId]);

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

    // Show the player's message optimistically (will be replaced by Firestore listener)
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
    // Roll result is already in subcollection (written by /api/roll), no need to add locally
    setPendingRoll(null);
    await requestNarrative(pr.playerInput, pr);
  }

  /**
   * Calls /api/chat. Narrative arrives via Firestore listener, not from the response.
   * Response provides updated game state and encounter data.
   */
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

      // Narrative arrives via Firestore listener — just update game state from response
      if (data.gameState) setGameState(data.gameState);
      if (data.encounter !== undefined) setEncounter(data.encounter ?? null);
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
   * Phase 1: POST /api/combat/action resolves the player's roll (deterministic, instant).
   * Phase 2: POST /api/combat/continue triggers narration + NPC turns.
   * All narrations arrive via the Firestore messages listener.
   */
  async function executeCombatAction(ability: Ability, targetId?: string): Promise<void> {
    if (!characterId || isRolling || isNarrating || pendingRoll || isCombatProcessing) return;

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

      // Update game state and encounter (damage already applied server-side)
      setGameState(data.gameState);
      setEncounter(data.encounter ?? null);

      // Show floating HIT/MISS label on the targeted NPC
      if (targetId && !data.playerResult.noCheck) {
        combatLabelRef.current?.(
          targetId,
          data.playerResult.success,
          data.playerResult.damage?.totalDamage ?? 0,
        );
      }

      // Immediately proceed to narration + NPC turns (no Continue button)
      setIsRolling(false);
      await requestCombatContinue(data.playerResult, targetId);
    } catch (err) {
      console.error("[useChat] executeCombatAction error:", err);
      appendError();
      setIsRolling(false);
    }
  }

  /**
   * Phase 2: Trigger narration + NPC turns.
   * Narration messages arrive via the Firestore messages listener.
   * Response provides final game state and encounter data.
   */
  async function requestCombatContinue(
    playerResult: ParsedRollResult,
    targetId?: string | null,
  ): Promise<void> {
    if (!characterId) return;
    setIsCombatProcessing(true);
    try {
      const res = await fetch("/api/combat/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, playerResult, targetId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Combat continue failed");
      }

      const data = await res.json();

      // Update game state and encounter from response
      if (data.gameState) setGameState(data.gameState);
      if (data.encounter !== undefined) setEncounter(data.encounter ?? null);
      setTotalTokens((t) => t + (data.tokensUsed ?? 0));
      setEstimatedCostUsd((c) => c + (data.estimatedCostUsd ?? 0));

      // If combat ended, refetch to get clean state
      if (data.combatEnded) {
        const refreshRes = await fetch(`/api/chat?characterId=${encodeURIComponent(characterId)}`);
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          setGameState(refreshData.gameState);
          setEncounter(refreshData.encounter ?? null);
        }
      }
    } catch (err) {
      console.error("[useChat] requestCombatContinue error:", err);
      appendError();
    } finally {
      setIsCombatProcessing(false);
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

  const applyDebugResult = useCallback((newState: GameState, message: string, newEncounter?: StoredEncounter | null): void => {
    setGameState(newState);
    if (newEncounter !== undefined) {
      setEncounter(newEncounter);
    }
    // Debug messages appear locally — they're not persisted to subcollection
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: message, timestamp: Date.now() },
    ]);
  }, []);

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
    combatLabelRef,
  };
}
