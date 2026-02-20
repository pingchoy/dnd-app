"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { NPC } from "../lib/gameTypes";

export interface GridPosition {
  row: number;
  col: number;
}

export const GRID_SIZE = 20;

/**
 * Manages token positions on a 20x20 tactical grid.
 * Places player near center and NPCs along edges. Preserves positions
 * for surviving NPCs across re-renders; resets on new combat.
 */
export function useCombatGrid(activeNPCs: NPC[], inCombat: boolean) {
  const [positions, setPositions] = useState<Map<string, GridPosition>>(new Map());
  const prevCombatRef = useRef(false);

  // Reset positions when combat starts fresh (false→true transition)
  useEffect(() => {
    if (inCombat && !prevCombatRef.current) {
      setPositions(new Map());
    }
    prevCombatRef.current = inCombat;
  }, [inCombat]);

  // Place new NPCs and remove departed ones
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

      // Place new NPCs along edges (rows 0-3)
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

  const moveToken = useCallback((id: string, pos: GridPosition) => {
    setPositions((prev) => {
      const next = new Map(prev);
      next.set(id, pos);
      return next;
    });
  }, []);

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
