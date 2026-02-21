/**
 * combatEnforcement.ts
 *
 * Pure-logic module for validating attack ranges, AOE targeting,
 * positional advantage/disadvantage, and movement on the combat grid.
 *
 * No React, no server imports — safe for client and server.
 */

import type { GridPosition, AbilityRange } from "./gameTypes";

// ─── Constants ───────────────────────────────────────────────────────────────

export const FEET_PER_SQUARE = 5;
export const DEFAULT_MELEE_REACH = 5;
export const DEFAULT_SPEED = 30;

// ─── Core distance functions ─────────────────────────────────────────────────

/** Chebyshev distance in squares (D&D 5e: diagonals = 1 square). */
export function gridDistance(a: GridPosition, b: GridPosition): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

/** Distance in feet (gridDistance * 5). */
export function feetDistance(a: GridPosition, b: GridPosition): number {
  return gridDistance(a, b) * FEET_PER_SQUARE;
}

/** All cells within N feet of origin (Chebyshev). */
export function cellsInRange(
  origin: GridPosition,
  rangeFeet: number,
  gridSize: number,
): GridPosition[] {
  const rangeSquares = Math.floor(rangeFeet / FEET_PER_SQUARE);
  const cells: GridPosition[] = [];
  for (let row = origin.row - rangeSquares; row <= origin.row + rangeSquares; row++) {
    for (let col = origin.col - rangeSquares; col <= origin.col + rangeSquares; col++) {
      if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) continue;
      if (row === origin.row && col === origin.col) continue;
      cells.push({ row, col });
    }
  }
  return cells;
}

// ─── SRD property parsing ────────────────────────────────────────────────────

/**
 * Parse weapon range from SRD category + properties array.
 *
 * Category tells us melee vs ranged (e.g. "Simple Melee Weapons", "Martial Ranged Weapons").
 * Properties contain range numbers: "ammunition (range 80/320)", "thrown (range 30/120)", "reach".
 */
export function parseWeaponRange(
  category: string,
  properties: string[],
): AbilityRange {
  const lowerCategory = category.toLowerCase();
  const isMelee = lowerCategory.includes("melee");
  const isRanged = lowerCategory.includes("ranged");

  const hasReach = properties.some((p) => p.toLowerCase() === "reach");
  let shortRange: number | undefined;
  let longRange: number | undefined;
  let hasThrown = false;

  for (const prop of properties) {
    const lower = prop.toLowerCase();

    // Match "thrown (range N/M)" or "ammunition (range N/M)"
    const rangeMatch = lower.match(/(?:thrown|ammunition)\s*\(range\s+(\d+)\/(\d+)\)/);
    if (rangeMatch) {
      shortRange = parseInt(rangeMatch[1]);
      longRange = parseInt(rangeMatch[2]);
      if (lower.startsWith("thrown")) hasThrown = true;
    }
  }

  // Melee weapon with thrown property → "both"
  if (isMelee && hasThrown) {
    return {
      type: "both",
      reach: hasReach ? 10 : DEFAULT_MELEE_REACH,
      shortRange,
      longRange,
    };
  }

  // Pure melee
  if (isMelee && !isRanged) {
    return {
      type: "melee",
      reach: hasReach ? 10 : DEFAULT_MELEE_REACH,
    };
  }

  // Pure ranged
  if (isRanged) {
    return {
      type: "ranged",
      shortRange,
      longRange,
    };
  }

  // Fallback: treat as melee
  return {
    type: "melee",
    reach: DEFAULT_MELEE_REACH,
  };
}

/** Parse SRD spell range string ("30 feet", "Touch", "Self", "1 mile") into an AbilityRange. */
export function parseSpellRange(rangeStr: string): AbilityRange {
  const lower = rangeStr.toLowerCase().trim();

  if (lower === "self" || lower.startsWith("self ")) {
    return { type: "self" };
  }
  if (lower === "touch") {
    return { type: "touch", reach: 5 };
  }

  // Match "N feet" or "N foot"
  const feetMatch = lower.match(/^(\d+)\s*(?:feet|foot|ft)/);
  if (feetMatch) {
    return { type: "ranged", shortRange: parseInt(feetMatch[1]) };
  }

  // Match "N mile(s)" — convert to feet
  const mileMatch = lower.match(/^(\d+)\s*mile/);
  if (mileMatch) {
    return { type: "ranged", shortRange: parseInt(mileMatch[1]) * 5280 };
  }

  // Fallback: treat as ranged with unknown distance
  return { type: "ranged" };
}

// ─── Range validation ────────────────────────────────────────────────────────

export interface RangeCheck {
  inRange: boolean;
  distance: number;         // feet
  disadvantage?: boolean;   // ranged in long range, or ranged with adjacent hostile
  reason?: string;
}

/** Check melee attack range. */
export function checkMeleeRange(
  attacker: GridPosition,
  target: GridPosition,
  reach?: number,
): RangeCheck {
  const dist = feetDistance(attacker, target);
  const meleeReach = reach ?? DEFAULT_MELEE_REACH;
  if (dist <= meleeReach) {
    return { inRange: true, distance: dist };
  }
  return {
    inRange: false,
    distance: dist,
    reason: `Target is ${dist} ft away (melee reach: ${meleeReach} ft)`,
  };
}

/** Check ranged weapon range. */
export function checkRangedRange(
  attacker: GridPosition,
  target: GridPosition,
  shortRange: number,
  longRange: number,
): RangeCheck {
  const dist = feetDistance(attacker, target);
  if (dist <= shortRange) {
    return { inRange: true, distance: dist };
  }
  if (dist <= longRange) {
    return {
      inRange: true,
      distance: dist,
      disadvantage: true,
      reason: `Target is ${dist} ft away (beyond normal range of ${shortRange} ft — disadvantage)`,
    };
  }
  return {
    inRange: false,
    distance: dist,
    reason: `Target is ${dist} ft away (max range: ${longRange} ft)`,
  };
}

/** Unified range check from an AbilityRange object. */
export function validateAttackRange(
  attacker: GridPosition,
  target: GridPosition,
  range?: AbilityRange,
): RangeCheck {
  if (!range) {
    // No range data — fall back to default melee
    return checkMeleeRange(attacker, target, DEFAULT_MELEE_REACH);
  }

  switch (range.type) {
    case "self":
      return { inRange: true, distance: 0 };
    case "touch":
      return checkMeleeRange(attacker, target, range.reach ?? DEFAULT_MELEE_REACH);
    case "melee":
      return checkMeleeRange(attacker, target, range.reach);
    case "ranged":
      return checkRangedRange(
        attacker,
        target,
        range.shortRange ?? 30,
        range.longRange ?? range.shortRange ?? 30,
      );
    case "both": {
      // Thrown weapons: try melee first, then ranged
      const melee = checkMeleeRange(attacker, target, range.reach);
      if (melee.inRange) return melee;
      return checkRangedRange(
        attacker,
        target,
        range.shortRange ?? 20,
        range.longRange ?? 60,
      );
    }
  }
}

// ─── AOE targeting ───────────────────────────────────────────────────────────

type AOEShape =
  | { type: "sphere" | "cube"; origin: GridPosition; radiusFeet: number }
  | { type: "cone"; origin: GridPosition; lengthFeet: number; direction: GridPosition }
  | { type: "line"; origin: GridPosition; lengthFeet: number; widthFeet: number; direction: GridPosition }
  | { type: "cylinder"; origin: GridPosition; radiusFeet: number };

/** Grid cells affected by an AOE shape. */
function getAOECells(shape: AOEShape, gridSize: number): GridPosition[] {
  switch (shape.type) {
    case "sphere":
    case "cylinder": {
      // Chebyshev circle from origin
      return cellsInRange(shape.origin, shape.radiusFeet, gridSize);
    }
    case "cube": {
      // Cube centered on origin — radius is half the side length
      return cellsInRange(shape.origin, shape.radiusFeet, gridSize);
    }
    case "cone": {
      // Simplified cone: all cells within length that are roughly in the direction
      const lengthSquares = Math.floor(shape.lengthFeet / FEET_PER_SQUARE);
      const cells: GridPosition[] = [];
      const dx = shape.direction.col - shape.origin.col;
      const dy = shape.direction.row - shape.origin.row;
      const dirLen = Math.sqrt(dx * dx + dy * dy);
      if (dirLen === 0) return cells;
      const ndx = dx / dirLen;
      const ndy = dy / dirLen;

      for (let row = shape.origin.row - lengthSquares; row <= shape.origin.row + lengthSquares; row++) {
        for (let col = shape.origin.col - lengthSquares; col <= shape.origin.col + lengthSquares; col++) {
          if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) continue;
          if (row === shape.origin.row && col === shape.origin.col) continue;
          const cdx = col - shape.origin.col;
          const cdy = row - shape.origin.row;
          const dist = Math.max(Math.abs(cdy), Math.abs(cdx));
          if (dist > lengthSquares) continue;
          // Check angle: dot product must be positive and within cone spread
          const cellLen = Math.sqrt(cdx * cdx + cdy * cdy);
          if (cellLen === 0) continue;
          const dot = (cdx * ndx + cdy * ndy) / cellLen;
          // Cone has ~53° half-angle (width = distance at each point)
          if (dot >= 0.5) cells.push({ row, col });
        }
      }
      return cells;
    }
    case "line": {
      // Simplified line: cells along direction within length and width
      const lengthSquares = Math.floor(shape.lengthFeet / FEET_PER_SQUARE);
      const widthSquares = Math.max(1, Math.floor(shape.widthFeet / FEET_PER_SQUARE));
      const cells: GridPosition[] = [];
      const dx = shape.direction.col - shape.origin.col;
      const dy = shape.direction.row - shape.origin.row;
      const dirLen = Math.sqrt(dx * dx + dy * dy);
      if (dirLen === 0) return cells;
      const ndx = dx / dirLen;
      const ndy = dy / dirLen;

      for (let row = shape.origin.row - lengthSquares; row <= shape.origin.row + lengthSquares; row++) {
        for (let col = shape.origin.col - lengthSquares; col <= shape.origin.col + lengthSquares; col++) {
          if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) continue;
          if (row === shape.origin.row && col === shape.origin.col) continue;
          const cdx = col - shape.origin.col;
          const cdy = row - shape.origin.row;
          // Project onto direction
          const proj = cdx * ndx + cdy * ndy;
          if (proj < 0 || proj > lengthSquares) continue;
          // Perpendicular distance
          const perp = Math.abs(cdx * (-ndy) + cdy * ndx);
          if (perp <= widthSquares / 2) cells.push({ row, col });
        }
      }
      return cells;
    }
  }
}

/** Token IDs caught in an AOE. */
function getAOETargets(
  shape: AOEShape,
  positions: Map<string, GridPosition>,
  gridSize: number,
): string[] {
  const cells = getAOECells(shape, gridSize);
  const cellSet = new Set(cells.map((c) => `${c.row},${c.col}`));
  const hits: string[] = [];
  for (const [id, pos] of Array.from(positions.entries())) {
    if (cellSet.has(`${pos.row},${pos.col}`)) {
      hits.push(id);
    }
  }
  return hits;
}

// ─── Advantage / disadvantage (position-based) ──────────────────────────────

export interface CombatModifier {
  type: "advantage" | "disadvantage";
  source: string;
}

/**
 * Compute position-based combat modifiers.
 * Checks: ranged + adjacent hostile → disadvantage, condition-based effects.
 */
export function getPositionalModifiers(
  attacker: GridPosition,
  target: GridPosition,
  attackType: "melee" | "ranged",
  targetConditions: string[],
  attackerConditions: string[],
  positions: Map<string, GridPosition>,
  attackerId: string,
): CombatModifier[] {
  const mods: CombatModifier[] = [];
  const targetLower = targetConditions.map((c) => c.toLowerCase());
  const attackerLower = attackerConditions.map((c) => c.toLowerCase());
  const dist = feetDistance(attacker, target);

  // Ranged attack with hostile adjacent → disadvantage
  if (attackType === "ranged") {
    for (const [id, pos] of Array.from(positions.entries())) {
      if (id === attackerId) continue;
      if (feetDistance(attacker, pos) <= 5) {
        mods.push({ type: "disadvantage", source: "hostile within 5 ft (ranged)" });
        break;
      }
    }
  }

  // Target conditions that grant advantage to attacker
  if (targetLower.includes("restrained")) {
    mods.push({ type: "advantage", source: "target is restrained" });
  }
  if (targetLower.includes("stunned")) {
    mods.push({ type: "advantage", source: "target is stunned" });
  }
  if (targetLower.includes("paralyzed")) {
    mods.push({ type: "advantage", source: "target is paralyzed" });
  }
  if (targetLower.includes("unconscious")) {
    mods.push({ type: "advantage", source: "target is unconscious" });
  }

  // Prone target: advantage for melee within 5ft, disadvantage for ranged or distant melee
  if (targetLower.includes("prone")) {
    if (attackType === "melee" && dist <= 5) {
      mods.push({ type: "advantage", source: "target is prone (melee)" });
    } else {
      mods.push({ type: "disadvantage", source: "target is prone (ranged/distant)" });
    }
  }

  // Attacker conditions
  if (attackerLower.includes("blinded")) {
    mods.push({ type: "disadvantage", source: "attacker is blinded" });
  }
  if (attackerLower.includes("frightened")) {
    mods.push({ type: "disadvantage", source: "attacker is frightened" });
  }
  if (attackerLower.includes("poisoned")) {
    mods.push({ type: "disadvantage", source: "attacker is poisoned" });
  }
  if (attackerLower.includes("prone")) {
    mods.push({ type: "disadvantage", source: "attacker is prone" });
  }
  if (attackerLower.includes("restrained")) {
    mods.push({ type: "disadvantage", source: "attacker is restrained" });
  }

  return mods;
}

// ─── Movement validation ─────────────────────────────────────────────────────

export function validateMovement(
  from: GridPosition,
  to: GridPosition,
  speedFeet: number,
): { allowed: boolean; distance: number; reason?: string } {
  const dist = feetDistance(from, to);
  if (dist <= speedFeet) {
    return { allowed: true, distance: dist };
  }
  return {
    allowed: false,
    distance: dist,
    reason: `${dist} ft exceeds movement speed of ${speedFeet} ft`,
  };
}
