"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  query,
  orderBy,
  limitToLast,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { getClientDb } from "../lib/firebaseClient";
import { ParsedRollResult } from "../agents/rulesAgent";
import { StoredMessage } from "../lib/gameTypes";
import type { GameState, StoredEncounter, AOEResultData, GridPosition, MapDocument } from "../lib/gameTypes";

export const CHARACTER_ID_KEY = "dnd_character_id";
export const CHARACTER_IDS_KEY = "dnd_character_ids";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /** Stable unique ID for React keys (Firestore doc ID or generated). */
  id: string;
  /** If present, renders a dice-roll card instead of normal text. */
  rollResult?: ParsedRollResult;
  /** If present, renders an AOE result card with per-target breakdown. */
  aoeResult?: AOEResultData;
  /** True for roll results that arrived after the session started (should animate). */
  isNewRoll?: boolean;
  /** True for messages that appeared after initial load (should animate entrance). */
  isNew?: boolean;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  gameState: GameState | null;
  /** True while the initial character is loading from Firestore. */
  isLoading: boolean;
  /** True while /api/chat is in-flight. */
  isNarrating: boolean;
  totalTokens: number;
  estimatedCostUsd: number;
  /** The Firestore character ID (null until loaded from localStorage). */
  characterId: string | null;
  /** The Firestore session ID (null until loaded). */
  sessionId: string | null;
  sendMessage: (input: string) => Promise<void>;
  /** Apply a debug action result: update game state and append a system message. */
  applyDebugResult: (gameState: GameState, message: string) => void;
  /** Append a generic error message to the chat. */
  appendError: () => void;
  /** Exposed for useCombat wiring — sets the authoritative game state. */
  setGameState: (gs: GameState) => void;
  /** Exposed for useCombat wiring — controls the narrating spinner. */
  setIsNarrating: (v: boolean) => void;
  /** Exposed for useCombat wiring — adds to cumulative token count. */
  addTokens: (n: number) => void;
  /** Exposed for useCombat wiring — adds to cumulative cost estimate. */
  addCost: (n: number) => void;
  /** Exploration positions loaded from the session (null until loaded). */
  explorationPositions: Record<string, GridPosition> | null;
  /** Active map ID from the session (null until loaded). */
  activeMapId: string | null;
  /** Active map document (tileData, regions, backgroundImageUrl). */
  activeMap: MapDocument | null;
  /** Current point-of-interest ID within the exploration map (null until loaded). */
  currentPOIId: string | null;
  /** Update the current POI ID (e.g. when the player clicks a POI on the exploration map). */
  setCurrentPOIId: (id: string | null) => void;
}

interface UseChatParams {
  /** Called when API responses include encounter data (bridges to useCombat). */
  onEncounterData?: (enc: StoredEncounter | null) => void;
}

export function useChat({ onEncounterData }: UseChatParams = {}): UseChatReturn {
  const router = useRouter();
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isLoading, setIsLoading]     = useState(true);
  const [isNarrating, setIsNarrating] = useState(false);
  const [totalTokens, setTotalTokens] = useState(0);
  const [estimatedCostUsd, setEstimatedCostUsd] = useState(0);
  const [explorationPositions, setExplorationPositions] = useState<Record<string, GridPosition> | null>(null);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [activeMap, setActiveMap] = useState<MapDocument | null>(null);
  const [currentPOIId, setCurrentPOIId] = useState<string | null>(null);

  // Ref to hold the latest onEncounterData callback (avoids stale closures in async handlers)
  const onEncounterDataRef = useRef(onEncounterData);
  onEncounterDataRef.current = onEncounterData;

  const characterIdRef = useRef<string | null>(null);
  // Session ID for Firestore message subscription
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Ref to track snapshot unsubscribe
  const unsubRef = useRef<Unsubscribe | null>(null);

  // Track which doc IDs existed on the first snapshot (historical rolls don't animate)
  const historicalDocIdsRef = useRef<Set<string> | null>(null);
  const isFirstSnapshotRef = useRef(true);

  // Prevents duplicate campaign intro requests on empty sessions
  const campaignIntroRequestedRef = useRef(false);

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
        onEncounterDataRef.current?.(data.encounter ?? null);
        setSessionId(data.sessionId ?? null);
        setExplorationPositions(data.explorationPositions ?? null);
        setActiveMapId(data.activeMapId ?? null);
        setActiveMap(data.activeMap ?? null);
        setCurrentPOIId(data.currentPOIId ?? null);
      })
      .catch((err) => {
        console.error("[useChat] Failed to load character state:", err);
        router.replace("/characters");
      })
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset historical tracking when sessionId changes
  useEffect(() => {
    historicalDocIdsRef.current = null;
    isFirstSnapshotRef.current = true;
  }, [sessionId]);

  /**
   * Real-time Firestore listener for the messages subcollection.
   * Messages are the single source of truth — all narratives, roll results,
   * and combat turn narrations arrive through this listener.
   *
   * On the first snapshot, all doc IDs are recorded as "historical" so their
   * roll results render as compact cards without animation. Subsequent roll
   * result docs are marked isNewRoll=true so they animate for all players.
   */
  useEffect(() => {
    if (!sessionId) return;

    // Clean up previous subscription if any
    unsubRef.current?.();
    const db = getClientDb();
    const messagesRef = collection(db, "sessions", sessionId, "messages");
    const messagesQuery = query(messagesRef, orderBy("timestamp", "asc"), limitToLast(20));

    const unsub = onSnapshot(messagesQuery, (snapshot) => {
      // On first snapshot, record all existing doc IDs as historical
      if (isFirstSnapshotRef.current) {
        historicalDocIdsRef.current = new Set(snapshot.docs.map((doc) => doc.id));
        isFirstSnapshotRef.current = false;
      }

      const historicalIds = historicalDocIdsRef.current ?? new Set<string>();

      const now = Date.now();
      const msgs: ChatMessage[] = snapshot.docs.map((doc) => {
        const data = doc.data() as StoredMessage;
        const isHistorical = historicalIds.has(doc.id);
        // A roll animates only if it's new to this session AND recent (<5s).
        // The age check prevents replaying animations when components remount.
        const hasRollOrAoe = data.rollResult || data.aoeResult;
        const isNewRoll = hasRollOrAoe
          ? !isHistorical && (now - data.timestamp) < 5000
          : undefined;
        // Don't animate user messages from this client — they already appeared optimistically.
        // Other players' messages (different characterId) will still animate.
        const isOwnMessage = data.role === "user" && data.characterId === characterIdRef.current;
        const isNew = !isHistorical && !isOwnMessage && (now - data.timestamp) < 5000;
        return {
          id: doc.id,
          role: data.role,
          content: data.content,
          timestamp: data.timestamp,
          rollResult: data.rollResult,
          aoeResult: data.aoeResult,
          isNewRoll: isNewRoll,
          isNew,
        };
      });

      // Mark all docs as seen so roll animations don't replay on subsequent snapshots
      for (const d of snapshot.docs) {
        historicalIds.add(d.id);
      }

      if (msgs.length === 0) {
        // Brand-new session — request a campaign-specific intro from the DM agent.
        // The intro message will arrive via this same Firestore listener once generated.
        if (!campaignIntroRequestedRef.current && characterIdRef.current) {
          campaignIntroRequestedRef.current = true;
          setIsNarrating(true);
          fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ characterId: characterIdRef.current, campaignIntro: true }),
          })
            .then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return res.json();
            })
            .then((data) => {
              if (data.gameState) setGameState(data.gameState);
              onEncounterDataRef.current?.(data.encounter ?? null);
            })
            .catch((err) => {
              console.error("[useChat] Campaign intro request failed:", err);
              campaignIntroRequestedRef.current = false;
            })
            .finally(() => setIsNarrating(false));
        }
      } else {
        setMessages(msgs);
      }
    }, (err) => {
      console.error("[useChat] Firestore messages listener error:", err);
    });

    unsubRef.current = unsub;
    return () => unsub();
  }, [sessionId]);

  /**
   * Send a player message. Single fetch to /api/chat which handles
   * rules check, roll result writing, and DM narrative internally.
   * All messages arrive via the Firestore onSnapshot listener.
   */
  async function sendMessage(input: string): Promise<void> {
    if (!input.trim() || isNarrating || !characterId) return;

    // Show the player's message optimistically (will be replaced by Firestore listener)
    setMessages((prev) => [...prev, { role: "user", content: input, timestamp: Date.now(), id: `optimistic-${Date.now()}` }]);
    setIsNarrating(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, playerInput: input }),
      });

      if (res.status === 409) {
        // Level-up pending — refresh game state to trigger the wizard
        const refreshRes = await fetch(`/api/chat?characterId=${encodeURIComponent(characterId)}`);
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          setGameState(refreshData.gameState);
          onEncounterDataRef.current?.(refreshData.encounter ?? null);
        }
        return;
      }

      if (!res.ok) throw new Error((await res.json()).error ?? "Chat failed");

      const data = await res.json();

      // Narrative arrives via Firestore listener — just update game state from response
      if (data.gameState) setGameState(data.gameState);
      if (data.encounter !== undefined) onEncounterDataRef.current?.(data.encounter ?? null);
      if ("currentPOIId" in data) setCurrentPOIId(data.currentPOIId ?? null);
      setTotalTokens((t) => t + (data.tokensUsed?.total ?? 0));
      setEstimatedCostUsd((c) => c + (data.estimatedCostUsd ?? 0));
    } catch (err) {
      console.error("[useChat] sendMessage error:", err);
      appendError();
    } finally {
      setIsNarrating(false);
    }
  }

  function appendError() {
    setMessages((prev) => [
      ...prev,
      {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "The dungeon master encountered an error. Please check your API key and try again.",
        timestamp: Date.now(),
        isNew: true,
      },
    ]);
  }

  const applyDebugResult = useCallback((newState: GameState, message: string): void => {
    setGameState(newState);
    // Debug messages appear locally — they're not persisted to subcollection
    setMessages((prev) => [
      ...prev,
      { id: `debug-${Date.now()}`, role: "assistant", content: message, timestamp: Date.now(), isNew: true },
    ]);
  }, []);

  const addTokens = useCallback((n: number) => {
    setTotalTokens((t) => t + n);
  }, []);

  const addCost = useCallback((n: number) => {
    setEstimatedCostUsd((c) => c + n);
  }, []);

  return {
    messages,
    gameState,
    isLoading,
    isNarrating,
    totalTokens,
    estimatedCostUsd,
    characterId,
    sessionId,
    sendMessage,
    applyDebugResult,
    appendError,
    setGameState,
    setIsNarrating,
    addTokens,
    addCost,
    explorationPositions,
    activeMapId,
    activeMap,
    currentPOIId,
    setCurrentPOIId,
  };
}
