"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { NPC, GridPosition, StoredEncounter } from "../lib/gameTypes";

export type { GridPosition };

export const GRID_SIZE = 20;

/**
 * Manages token positions on a 20x20 tactical grid.
 *
 * When an encounter is provided, positions are loaded from it (persisted in
 * Firestore). Moves are persisted via POST /api/encounter/move for durability.
 * Local state is updated optimistically for instant UI feedback.
 *
 * Falls back to client-side placement if no encounter data is available.
 */
export function useCombatGrid(
  activeNPCs: NPC[],
  inCombat: boolean,
  encounter?: StoredEncounter | null,
) {
  const [positions, setPositions] = useState<Map<string, GridPosition>>(new Map());
  const prevCombatRef = useRef(false);
  const prevEncounterIdRef = useRef<string | undefined>(undefined);

  // When a new encounter arrives or combat starts, load positions from encounter
  useEffect(() => {
    const encounterId = encounter?.id;
    const isNewEncounter = encounterId && encounterId !== prevEncounterIdRef.current;
    const combatJustStarted = inCombat && !prevCombatRef.current;

    if (isNewEncounter || combatJustStarted) {
      if (encounter?.positions && Object.keys(encounter.positions).length > 0) {
        // Load positions from Firestore encounter data
        const loaded = new Map<string, GridPosition>();
        for (const [id, pos] of Object.entries(encounter.positions)) {
          loaded.set(id, pos);
        }
        setPositions(loaded);
      } else {
        // No persisted positions — reset for fresh placement
        setPositions(new Map());
      }
    }

    prevCombatRef.current = inCombat;
    prevEncounterIdRef.current = encounterId;
  }, [inCombat, encounter]);

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
      const occupied = new Set(Array.from(next.values()).map((p) => `${p.row},${p.col}`));
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
   */
  const moveToken = useCallback((id: string, pos: GridPosition) => {
    // Optimistic local update
    setPositions((prev) => {
      const next = new Map(prev);
      next.set(id, pos);
      return next;
    });

    // Persist to Firestore if we have an active encounter
    if (encounter?.id) {
      fetch("/api/encounter/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encounterId: encounter.id,
          tokenId: id,
          position: pos,
        }),
      }).catch((err) => {
        console.error("[useCombatGrid] Failed to persist position:", err);
      });
    }
  }, [encounter?.id]);

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
