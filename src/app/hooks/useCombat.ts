"use client";

import { useState, useEffect, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getClientDb } from "../lib/firebaseClient";
import { ParsedRollResult } from "../lib/gameTypes";
import type {
  StoredEncounter,
  Ability,
  GameState,
  VictoryData,
  GridPosition,
} from "../lib/gameTypes";

export interface UseCombatReturn {
  /** Active combat encounter data, or null if not in combat. */
  encounter: StoredEncounter | null;
  /** True while the turn-by-turn combat loop is processing. */
  isCombatProcessing: boolean;
  /** Execute a deterministic combat action (ability bar click). */
  executeCombatAction: (ability: Ability, targetId?: string, aoeParams?: { aoeOrigin?: GridPosition; aoeDirection?: GridPosition }) => Promise<void>;
  /** Ref to set a callback for showing floating combat labels on the grid. */
  combatLabelRef: React.MutableRefObject<
    ((tokenId: string, hit: boolean, damage: number) => void) | null
  >;
  /** Set encounter directly from API response data (bypasses Firestore listener latency). */
  setEncounter: (enc: StoredEncounter | null) => void;
  /** Victory screen data — non-null when combat just ended. */
  victoryData: VictoryData | null;
  /** Dismiss the victory screen and return to narrative. */
  dismissVictory: () => void;
}

interface UseCombatParams {
  characterId: string | null;
  gameState: GameState | null;
  isNarrating: boolean;
  setGameState: (gs: GameState) => void;
  setIsNarrating: (v: boolean) => void;
  addTokens: (tokens: number) => void;
  addCost: (cost: number) => void;
  onError?: () => void;
}

/**
 * Manages combat encounter state: encounter listener, combat actions,
 * and NPC turn processing. Separated from useChat to isolate combat
 * concerns from general chat/narrative responsibilities.
 */
export function useCombat({
  characterId,
  gameState,
  isNarrating,
  setGameState,
  setIsNarrating,
  addTokens,
  addCost,
  onError,
}: UseCombatParams): UseCombatReturn {
  const [encounter, setEncounter] = useState<StoredEncounter | null>(null);
  const [isCombatProcessing, setIsCombatProcessing] = useState(false);
  const [victoryData, setVictoryData] = useState<VictoryData | null>(null);

  // Combat floating label callback (set by dashboard, called on hit/miss results)
  const combatLabelRef = useRef<
    ((tokenId: string, hit: boolean, damage: number) => void) | null
  >(null);

  // Track victoryData in a ref so the encounterId effect can check it synchronously
  // without adding victoryData to the dependency array (which would re-run the listener).
  const victoryRef = useRef<VictoryData | null>(null);
  victoryRef.current = victoryData;

  // Timer for delayed victory screen reveal (lets player see the killing blow land).
  const victoryDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Real-time Firestore listener for the active encounter document.
   * Updates turn tracker (currentTurnIndex) and NPC state in real time
   * as the server processes each NPC turn during /api/combat/resolve.
   */
  const encounterId = gameState?.story?.activeEncounterId ?? null;
  useEffect(() => {
    if (!encounterId) {
      // Don't clear encounter while victory screen is showing — dismissVictory handles cleanup.
      if (!victoryRef.current && !victoryDelayRef.current) setEncounter(null);
      return;
    }
    const db = getClientDb();
    const encounterRef = doc(db, "encounters", encounterId);

    const unsub = onSnapshot(
      encounterRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as StoredEncounter;
        setEncounter({ ...data, id: snap.id });
        // Multiplayer: if encounter completed with victoryData, show victory screen
        if (data.status === "completed" && data.victoryData) {
          setVictoryData(data.victoryData);
        }
      },
      (err) => {
        console.error("[useCombat] Encounter listener error:", err);
      },
    );

    return () => unsub();
  }, [encounterId]);

  // Safety timeout: if isCombatProcessing stays true for 30s, reset it
  useEffect(() => {
    if (!isCombatProcessing) return;
    const timer = setTimeout(() => {
      console.warn("[useCombat] Combat processing timeout — resetting");
      setIsCombatProcessing(false);
    }, 30_000);
    return () => clearTimeout(timer);
  }, [isCombatProcessing]);

  /**
   * Execute a combat action via the ability bar.
   * Phase 1: POST /api/combat/action resolves the player's roll (deterministic, instant).
   * Phase 2: POST /api/combat/resolve triggers narration + NPC turns.
   * All narrations arrive via the Firestore messages listener.
   */
  async function executeCombatAction(
    ability: Ability,
    targetId?: string,
    aoeParams?: { aoeOrigin?: GridPosition; aoeDirection?: GridPosition },
  ): Promise<void> {
    if (!characterId || isNarrating || isCombatProcessing) return;

    setIsNarrating(true);
    // Mark combat as processing BEFORE updating encounter, so inCombat stays
    // true even if this action killed the last hostile.
    setIsCombatProcessing(true);
    try {
      const res = await fetch("/api/combat/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId,
          abilityId: ability.id,
          targetId,
          ...aoeParams,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Combat action failed");
      }

      const data = await res.json();

      // Update game state and encounter (damage already applied server-side)
      setGameState(data.gameState);
      setEncounter(data.encounter ?? null);

      // Show floating labels -- AOE: one per target, single-target: one label
      if (data.aoeResult?.targets?.length) {
        for (let i = 0; i < data.aoeResult.targets.length; i++) {
          const t = data.aoeResult.targets[i];
          setTimeout(() => {
            combatLabelRef.current?.(t.npcId, true, t.damageTaken);
          }, i * 200);
        }
      } else if (targetId && data.singleTargetResult && !data.singleTargetResult.noCheck) {
        combatLabelRef.current?.(
          targetId,
          data.singleTargetResult.success,
          data.singleTargetResult.damage?.totalDamage ?? 0,
        );
      }

      // Immediately proceed to narration + NPC turns
      setIsNarrating(false);
      await requestCombatResolve(data.singleTargetResult ?? null, data.aoeResult ?? null, targetId);
    } catch (err) {
      console.error("[useCombat] executeCombatAction error:", err);
      onError?.();
      setIsNarrating(false);
    }
  }

  /**
   * Trigger narration + NPC turns after a combat action.
   * Narration messages arrive via the Firestore messages listener.
   * Response provides final game state and encounter data.
   */
  async function requestCombatResolve(
    singleTargetResult: ParsedRollResult | null,
    aoeResult: unknown | null,
    targetId?: string | null,
  ): Promise<void> {
    if (!characterId) return;
    setIsCombatProcessing(true);
    try {
      const res = await fetch("/api/combat/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId,
          ...(singleTargetResult ? { singleTargetResult } : {}),
          ...(aoeResult ? { aoeResult } : {}),
          targetId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Combat continue failed");
      }

      const data = await res.json();

      // Update game state and encounter from response
      if (data.gameState) setGameState(data.gameState);
      if (data.encounter !== undefined) setEncounter(data.encounter ?? null);
      addTokens(data.tokensUsed ?? 0);
      addCost(data.estimatedCostUsd ?? 0);

      // Show floating HIT/MISS labels for NPC attacks on the player
      if (data.npcResults?.length) {
        for (let i = 0; i < data.npcResults.length; i++) {
          const nr = data.npcResults[i];
          // Stagger labels so they don't overlap
          setTimeout(() => {
            combatLabelRef.current?.("player", nr.hit, nr.damage);
          }, i * 1200);
        }
      }

      // If combat ended, show victory screen instead of immediately clearing.
      // Cancel any pending delayed reveal — full data supersedes preliminary.
      if (data.combatEnded && data.victoryData) {
        if (victoryDelayRef.current) {
          clearTimeout(victoryDelayRef.current);
          victoryDelayRef.current = null;
        }
        setVictoryData(data.victoryData);
      } else if (data.combatEnded) {
        // No victory data (fallback) — clear encounter immediately
        setEncounter(null);
      }
    } catch (err) {
      console.error("[useCombat] requestCombatResolve error:", err);
      onError?.();
    } finally {
      setIsCombatProcessing(false);
    }
  }

  /** Dismiss the victory screen and return to narrative flow. */
  async function dismissVictory(): Promise<void> {
    setVictoryData(null);
    setEncounter(null);
    // Refetch clean game state (loot/XP already applied server-side)
    if (characterId) {
      try {
        const refreshRes = await fetch(
          `/api/chat?characterId=${encodeURIComponent(characterId)}`,
        );
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          setGameState(refreshData.gameState);
        }
      } catch (err) {
        console.error("[useCombat] dismissVictory refresh error:", err);
      }
    }
  }

  return {
    encounter,
    isCombatProcessing,
    executeCombatAction,
    combatLabelRef,
    setEncounter,
    victoryData,
    dismissVictory,
  };
}
