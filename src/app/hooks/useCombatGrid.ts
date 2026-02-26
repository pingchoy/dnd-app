"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { NPC, GridPosition, StoredEncounter } from "../lib/gameTypes";

export type { GridPosition };

export const GRID_SIZE = 20;

/**
 * Manages token positions on a 20x20 tactical grid for both combat
 * and exploration modes.
 *
 * Combat mode: Positions are loaded from the encounter (Firestore).
 * Moves persist via POST /api/encounter/move.
 *
 * Exploration mode: Player token is always shown. Positions are loaded
 * from session's explorationPositions. Moves persist via POST /api/maps/move.
 * When combat starts, exploration positions carry over as initial combat positions.
 */
export function useCombatGrid(
  activeNPCs: NPC[],
  inCombat: boolean,
  encounter?: StoredEncounter | null,
  /** Session ID for exploration position persistence. */
  sessionId?: string | null,
  /** Persisted exploration positions from the session document. */
  explorationPositions?: Record<string, GridPosition> | null,
) {
  const [positions, setPositions] = useState<Map<string, GridPosition>>(
    new Map(),
  );
  const prevCombatRef = useRef(false);
  const prevEncounterIdRef = useRef<string | undefined>(undefined);
  const initializedExplorationRef = useRef(false);

  // When a new encounter arrives or combat starts, load positions from encounter
  useEffect(() => {
    const encounterId = encounter?.id;
    const isNewEncounter =
      encounterId && encounterId !== prevEncounterIdRef.current;
    const combatJustStarted = inCombat && !prevCombatRef.current;

    if (isNewEncounter || combatJustStarted) {
      if (encounter?.positions && Object.keys(encounter.positions).length > 0) {
        // Load positions from Firestore encounter data
        const loaded = new Map<string, GridPosition>();
        for (const [id, pos] of Object.entries(encounter.positions)) {
          loaded.set(id, pos);
        }
        setPositions(loaded);
      } else if (inCombat) {
        // No persisted positions — start from exploration positions or reset
        // This enables the seamless transition: exploration → combat
        setPositions((prev) => {
          if (prev.size > 0) return prev; // keep exploration positions
          return new Map([["player", { row: 10, col: 10 }]]);
        });
      }
    }

    prevCombatRef.current = inCombat;
    prevEncounterIdRef.current = encounterId;
  }, [inCombat, encounter]);

  // Sync NPC positions from Firestore encounter updates during combat.
  // This picks up server-side NPC movement (from /api/combat/resolve) without
  // overriding the player's local (optimistic) position.
  const lastSyncedPositionsRef = useRef<string>("");
  useEffect(() => {
    if (!inCombat || !encounter?.positions) return;

    // Serialize to detect actual changes (encounter reference changes on every snapshot)
    const posJson = JSON.stringify(encounter.positions);
    if (posJson === lastSyncedPositionsRef.current) return;
    lastSyncedPositionsRef.current = posJson;

    setPositions((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const [id, pos] of Object.entries(encounter.positions)) {
        // Skip "player" — player position is managed by optimistic local updates
        if (id === "player") continue;
        const current = next.get(id);
        if (!current || current.row !== pos.row || current.col !== pos.col) {
          next.set(id, pos);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [inCombat, encounter?.positions]);

  // Exploration mode: initialize from session's persisted positions
  useEffect(() => {
    if (inCombat || initializedExplorationRef.current) return;

    if (explorationPositions && Object.keys(explorationPositions).length > 0) {
      const loaded = new Map<string, GridPosition>();
      for (const [id, pos] of Object.entries(explorationPositions)) {
        loaded.set(id, pos);
      }
      // Ensure player is always present
      if (!loaded.has("player")) {
        loaded.set("player", { row: 10, col: 10 });
      }
      setPositions(loaded);
      initializedExplorationRef.current = true;
    } else {
      // No saved positions yet — place player at center as a default.
      // Don't mark as initialized so that when persisted positions arrive
      // from the async fetch, the effect can re-run and load them.
      setPositions((prev) => {
        if (prev.has("player")) return prev;
        return new Map([["player", { row: 10, col: 10 }]]);
      });
    }
  }, [inCombat, explorationPositions]);

  // Place new NPCs that don't have positions yet (reinforcements mid-combat)
  useEffect(() => {
    if (!inCombat) return;

    setPositions((prev) => {
      const next = new Map(prev);
      const currentIds = new Set(activeNPCs.map((n) => n.id));

      // Remove positions for NPCs no longer active
      for (const id of Array.from(next.keys())) {
        if (id !== "player" && !currentIds.has(id)) {
          next.delete(id);
        }
      }

      // Place player if not yet positioned
      if (!next.has("player")) {
        next.set("player", { row: 10, col: 10 });
      }

      // Place new NPCs along edges (rows 0-3) — only for NPCs without positions
      const occupied = new Set(
        Array.from(next.values()).map((p) => `${p.row},${p.col}`),
      );
      for (const npc of activeNPCs) {
        if (!next.has(npc.id)) {
          const pos = findEdgeSlot(occupied);
          next.set(npc.id, pos);
          occupied.add(`${pos.row},${pos.col}`);
        }
      }

      return next;
    });
  }, [activeNPCs, inCombat]);

  /**
   * Move a token to a new position.
   * Updates local state optimistically, then persists to Firestore via API.
   * In combat: persists to encounter. In exploration: persists to session.
   */
  const moveToken = useCallback(
    (id: string, pos: GridPosition) => {
      // Optimistic local update
      setPositions((prev) => {
        const next = new Map(prev);
        next.set(id, pos);
        return next;
      });

      if (inCombat && encounter?.id) {
        // Combat mode: persist to encounter document
        fetch("/api/encounter/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            encounterId: encounter.id,
            tokenId: id,
            position: pos,
          }),
        }).catch((err) => {
          console.error("[useCombatGrid] Failed to persist combat position:", err);
        });
      } else if (sessionId) {
        // Exploration mode: persist to session document
        fetch("/api/maps/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            tokenId: id,
            position: pos,
          }),
        }).catch((err) => {
          console.error("[useCombatGrid] Failed to persist exploration position:", err);
        });
      }
    },
    [inCombat, encounter?.id, sessionId],
  );

  return { positions, moveToken, gridSize: GRID_SIZE };
}

/** Find an unoccupied cell in rows 0-3 for NPC placement. */
function findEdgeSlot(occupied: Set<string>): GridPosition {
  // Try rows 0-3, columns spread across the grid
  for (let row = 1; row <= 3; row++) {
    for (let col = 3; col < GRID_SIZE - 3; col += 2) {
      const key = `${row},${col}`;
      if (!occupied.has(key)) return { row, col };
    }
  }
  // Fallback: find any open cell in rows 0-5
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const key = `${row},${col}`;
      if (!occupied.has(key)) return { row, col };
    }
  }
  return { row: 0, col: 0 };
}
