/**
 * npcMovement.ts
 *
 * Deterministic NPC movement logic for combat turns.
 * Uses A* pathfinding to find optimal routes around walls and obstacles,
 * then walks the NPC along the path up to its speed limit.
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

// ─── A* Pathfinding ─────────────────────────────────────────────────────────

/** Encode a grid position as a single integer for fast Map lookups. */
function posKey(row: number, col: number, gridSize: number): number {
  return row * gridSize + col;
}

/**
 * Minimal binary min-heap for A* open set.
 * Entries are [fScore, row, col]. Extracts the lowest-fScore node.
 */
class MinHeap {
  private data: [number, number, number][] = [];

  get size(): number { return this.data.length; }

  push(f: number, row: number, col: number): void {
    this.data.push([f, row, col]);
    this._bubbleUp(this.data.length - 1);
  }

  pop(): [number, number, number] {
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  private _bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[i][0] >= this.data[parent][0]) break;
      [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
      i = parent;
    }
  }

  private _sinkDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.data[left][0] < this.data[smallest][0]) smallest = left;
      if (right < n && this.data[right][0] < this.data[smallest][0]) smallest = right;
      if (smallest === i) break;
      [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
      i = smallest;
    }
  }
}

/** 8-directional neighbor offsets. */
const NEIGHBORS: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

/**
 * A* pathfinding from start to any cell adjacent to the goal.
 *
 * Uses Chebyshev distance as heuristic (D&D 5e: diagonal = 1 square).
 * Each step costs 1 (uniform grid). Returns the full path as an array
 * of GridPositions (excluding start, including destination), or null
 * if no path exists.
 *
 * @param start     NPC's current position.
 * @param goal      Target's position (NPC will path to an adjacent cell, not onto the target).
 * @param gridSize  Grid dimensions (20x20).
 * @param occupied  Cells blocked by other living tokens (excludes the moving NPC).
 * @param tileData  Optional collision array (1=wall blocks movement).
 */
function astarPath(
  start: GridPosition,
  goal: GridPosition,
  gridSize: number,
  occupied: Set<string>,
  tileData?: number[],
): GridPosition[] | null {
  // Already adjacent — no path needed
  if (gridDistance(start, goal) <= 1) return [];

  const open = new MinHeap();
  // gScore: cost from start. Map key = posKey integer.
  const gScore = new Map<number, number>();
  // cameFrom: parent pointer for path reconstruction.
  const cameFrom = new Map<number, number>();
  const startKey = posKey(start.row, start.col, gridSize);

  gScore.set(startKey, 0);
  open.push(gridDistance(start, goal), start.row, start.col);

  while (open.size > 0) {
    const [, row, col] = open.pop();
    const currentKey = posKey(row, col, gridSize);
    const currentG = gScore.get(currentKey)!;

    // Goal: any cell adjacent to the target
    if (gridDistance({ row, col }, goal) <= 1) {
      // Reconstruct path
      const path: GridPosition[] = [];
      let traceKey = currentKey;
      while (traceKey !== startKey) {
        const r = Math.floor(traceKey / gridSize);
        const c = traceKey % gridSize;
        path.push({ row: r, col: c });
        traceKey = cameFrom.get(traceKey)!;
      }
      path.reverse();
      return path;
    }

    for (const [dr, dc] of NEIGHBORS) {
      const nr = row + dr;
      const nc = col + dc;

      // Bounds
      if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;

      // Wall
      if (tileData) {
        const ti = nr * gridSize + nc;
        if (tileData[ti] === 1) continue;
      }

      // Occupied by another living token (but goal cell's neighbors are fine —
      // we stop adjacent to goal, never on the goal itself)
      const cellStr = `${nr},${nc}`;
      if (occupied.has(cellStr)) continue;

      const nk = posKey(nr, nc, gridSize);
      const tentativeG = currentG + 1; // uniform cost

      const existingG = gScore.get(nk);
      if (existingG !== undefined && tentativeG >= existingG) continue;

      gScore.set(nk, tentativeG);
      cameFrom.set(nk, currentKey);
      const h = gridDistance({ row: nr, col: nc }, goal);
      open.push(tentativeG + h, nr, nc);
    }
  }

  // No path found
  return null;
}

// ─── Core Movement ──────────────────────────────────────────────────────────

/**
 * Compute the best position for an NPC to move toward a target.
 *
 * Uses A* to find the optimal path around walls and obstacles, then
 * walks the NPC along that path up to its movement speed. Stops when
 * adjacent to the target or when the speed budget is exhausted.
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

  const path = astarPath(npcPos, targetPos, gridSize, occupied, tileData);

  // No path found — stay put
  if (!path || path.length === 0) {
    return npcPos;
  }

  // Walk along the path up to the NPC's speed limit
  const maxSteps = Math.floor(speedFeet / FEET_PER_SQUARE);
  const stepsToTake = Math.min(maxSteps, path.length);

  return path[stepsToTake - 1];
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
