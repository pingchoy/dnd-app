/**
 * npcMovement.ts
 *
 * Deterministic NPC movement logic for combat turns.
 * Each NPC moves toward its target using greedy step-by-step pathfinding,
 * respecting speed limits, occupied cells, and wall tiles.
 *
 * Pure functions — no React, no server imports, safe for client and server.
 */

import type { GridPosition, NPC } from "./gameTypes";
import { gridDistance, DEFAULT_SPEED, FEET_PER_SQUARE } from "./combatEnforcement";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NPCMovementResult {
  npcId: string;
  from: GridPosition;
  to: GridPosition;
  /** True if the NPC actually moved (from !== to). */
  moved: boolean;
}

// ─── Core Movement ──────────────────────────────────────────────────────────

/**
 * Compute the best position for an NPC to move toward a target.
 *
 * Uses greedy step-by-step movement: at each step, pick the unoccupied
 * neighbor cell closest to the target (Chebyshev distance). Stops when
 * adjacent to the target or when movement budget is exhausted.
 *
 * @param npcPos     Current NPC grid position.
 * @param targetPos  Target's grid position (player or another NPC).
 * @param speedFeet  NPC walking speed in feet (default 30).
 * @param gridSize   Grid dimensions (20x20).
 * @param occupied   Set of "row,col" strings for cells occupied by OTHER tokens.
 *                   Must NOT include the moving NPC's own position.
 * @param tileData   Optional flat collision array (0=floor, 1=wall, 2=door, 3=water).
 * @returns          The destination GridPosition (same as npcPos if no movement).
 */
export function computeNPCMovement(
  npcPos: GridPosition,
  targetPos: GridPosition,
  speedFeet: number,
  gridSize: number,
  occupied: Set<string>,
  tileData?: number[],
): GridPosition {
  // Already adjacent (within melee range) — no need to move
  if (gridDistance(npcPos, targetPos) <= 1) {
    return npcPos;
  }

  const maxSteps = Math.floor(speedFeet / FEET_PER_SQUARE);
  let current = npcPos;

  for (let step = 0; step < maxSteps; step++) {
    // Stop when adjacent to target
    if (gridDistance(current, targetPos) <= 1) break;

    let bestCell: GridPosition | null = null;
    let bestDist = gridDistance(current, targetPos);

    // Evaluate all 8 neighboring cells
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const next: GridPosition = { row: current.row + dr, col: current.col + dc };

        // Bounds check
        if (next.row < 0 || next.row >= gridSize || next.col < 0 || next.col >= gridSize) continue;

        // Wall check (tile value 1 = wall)
        if (tileData) {
          const tileIndex = next.row * gridSize + next.col;
          if (tileData[tileIndex] === 1) continue;
        }

        // Occupied cell check — can't move through other living tokens
        const key = `${next.row},${next.col}`;
        if (occupied.has(key)) continue;

        const dist = gridDistance(next, targetPos);
        if (dist < bestDist) {
          bestDist = dist;
          bestCell = next;
        }
      }
    }

    // No valid move toward target — stuck
    if (!bestCell) break;
    current = bestCell;
  }

  return current;
}

/**
 * Build the occupied-cells set from current encounter positions,
 * excluding a specific NPC (so it can pathfind through its own cell).
 * Also excludes dead NPCs (corpses are walkable).
 */
export function buildOccupiedSet(
  positions: Record<string, GridPosition>,
  excludeId: string,
  activeNPCs: NPC[],
): Set<string> {
  const deadIds = new Set(activeNPCs.filter(n => n.currentHp <= 0).map(n => n.id));
  const occupied = new Set<string>();

  for (const [id, pos] of Object.entries(positions)) {
    if (id === excludeId) continue;
    if (deadIds.has(id)) continue; // dead tokens are walkable
    occupied.add(`${pos.row},${pos.col}`);
  }

  return occupied;
}

/**
 * Compute movement for a single NPC toward its target.
 * Updates the positions record in-place and returns the movement result.
 */
export function moveNPCTowardTarget(
  npc: NPC,
  targetId: string,
  positions: Record<string, GridPosition>,
  activeNPCs: NPC[],
  gridSize: number,
  tileData?: number[],
): NPCMovementResult {
  const npcPos = positions[npc.id];
  const targetPos = positions[targetId];

  // No position data — can't compute movement
  if (!npcPos || !targetPos) {
    return {
      npcId: npc.id,
      from: npcPos ?? { row: 0, col: 0 },
      to: npcPos ?? { row: 0, col: 0 },
      moved: false,
    };
  }

  const speed = npc.speed ?? DEFAULT_SPEED;
  const occupied = buildOccupiedSet(positions, npc.id, activeNPCs);

  const destination = computeNPCMovement(
    npcPos,
    targetPos,
    speed,
    gridSize,
    occupied,
    tileData,
  );

  const moved = destination.row !== npcPos.row || destination.col !== npcPos.col;

  // Update positions in-place so subsequent NPCs see the new position
  if (moved) {
    positions[npc.id] = destination;
  }

  return {
    npcId: npc.id,
    from: npcPos,
    to: destination,
    moved,
  };
}
