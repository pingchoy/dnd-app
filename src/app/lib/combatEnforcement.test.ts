import { describe, it, expect } from "vitest";
import {
  parseAOEFromRange,
  parseAOEFromDescription,
  getAOECells,
  getAOETargets,
} from "./combatEnforcement";
import type { AOEShape } from "./combatEnforcement";
import type { GridPosition } from "./gameTypes";

// ─── parseAOEFromRange ──────────────────────────────────────────────────────

describe("parseAOEFromRange", () => {
  it("returns null for non-AOE range '30 feet'", () => {
    expect(parseAOEFromRange("30 feet")).toBeNull();
  });

  it("returns null for 'touch'", () => {
    expect(parseAOEFromRange("touch")).toBeNull();
  });

  it("returns null for 'self'", () => {
    expect(parseAOEFromRange("self")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseAOEFromRange("")).toBeNull();
  });

  it("parses self-origin cone: 'Self (15-foot cone)'", () => {
    const result = parseAOEFromRange("Self (15-foot cone)");
    expect(result).toEqual({ shape: "cone", size: 15, origin: "self" });
  });

  it("parses self-origin line: 'Self (30-foot line)'", () => {
    const result = parseAOEFromRange("Self (30-foot line)");
    expect(result).toEqual({ shape: "line", size: 30, origin: "self", width: 5 });
  });

  it("parses self-origin sphere: 'Self (10-foot-radius sphere)'", () => {
    const result = parseAOEFromRange("Self (10-foot-radius sphere)");
    expect(result).toEqual({ shape: "sphere", size: 10, origin: "self" });
  });

  it("parses self-origin cylinder: 'Self (20-foot-radius cylinder)'", () => {
    const result = parseAOEFromRange("Self (20-foot-radius cylinder)");
    expect(result).toEqual({ shape: "cylinder", size: 20, origin: "self" });
  });

  it("parses self-origin cube: 'Self (10-foot cube)'", () => {
    const result = parseAOEFromRange("Self (10-foot cube)");
    expect(result).toEqual({ shape: "cube", size: 10, origin: "self" });
  });

  it("line shape auto-sets width to 5", () => {
    const result = parseAOEFromRange("Self (60-foot line)");
    expect(result!.width).toBe(5);
  });

  it("non-line shapes have no width", () => {
    const result = parseAOEFromRange("Self (15-foot cone)");
    expect(result!.width).toBeUndefined();
  });

  it("parses non-self range with AOE as target origin", () => {
    // e.g. "150 feet (20-foot sphere)" — hypothetical format
    const result = parseAOEFromRange("150 feet (20-foot sphere)");
    expect(result).toEqual({ shape: "sphere", size: 20, origin: "target" });
  });
});

// ─── parseAOEFromDescription ────────────────────────────────────────────────

describe("parseAOEFromDescription", () => {
  it("returns null when no AOE pattern in text", () => {
    expect(parseAOEFromDescription("Deals 1d10 fire damage to a single target.")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseAOEFromDescription("")).toBeNull();
  });

  it("parses '20-foot-radius sphere' from Fireball-style description", () => {
    const desc = "A bright streak flashes to a point you choose and then blossoms into a 20-foot-radius sphere of flame.";
    const result = parseAOEFromDescription(desc);
    expect(result).toEqual({ shape: "sphere", size: 20, origin: "target" });
  });

  it("always returns origin: 'target' (description-sourced = ranged AOE)", () => {
    const desc = "A 15-foot cone of cold blasts from your hands.";
    const result = parseAOEFromDescription(desc);
    expect(result).not.toBeNull();
    expect(result!.origin).toBe("target");
  });

  it("parses '10-foot-radius cylinder' from description", () => {
    const desc = "A 10-foot-radius cylinder of magical flame descends from the sky.";
    const result = parseAOEFromDescription(desc);
    expect(result).toEqual({ shape: "cylinder", size: 10, origin: "target" });
  });

  it("parses line from description and sets width to 5", () => {
    const desc = "A 30-foot line of lightning arcs from your fingertips.";
    const result = parseAOEFromDescription(desc);
    expect(result).toEqual({ shape: "line", size: 30, origin: "target", width: 5 });
  });
});

// ─── getAOECells ────────────────────────────────────────────────────────────

describe("getAOECells", () => {
  describe("sphere", () => {
    it("returns cells within Chebyshev radius, including origin", () => {
      const shape: AOEShape = { type: "sphere", origin: { row: 5, col: 5 }, radiusFeet: 10 };
      const cells = getAOECells(shape, 20);

      // 10 feet = 2 squares. Chebyshev circle of radius 2 around (5,5)
      // That's a 5x5 square (rows 3-7, cols 3-7) = 25 cells
      expect(cells).toHaveLength(25);

      // Origin included (target-origin AOEs hit the center cell)
      expect(cells.find(c => c.row === 5 && c.col === 5)).toBeDefined();

      // Corner cells included (Chebyshev: diagonals count as 1)
      expect(cells.find(c => c.row === 3 && c.col === 3)).toBeDefined();
      expect(cells.find(c => c.row === 7 && c.col === 7)).toBeDefined();

      // Out of range cells excluded
      expect(cells.find(c => c.row === 2 && c.col === 5)).toBeUndefined();
    });
  });

  describe("cube", () => {
    it("uses cellsInRange same as sphere", () => {
      const shape: AOEShape = { type: "cube", origin: { row: 5, col: 5 }, radiusFeet: 10 };
      const cells = getAOECells(shape, 20);

      // Same as sphere: 5x5 square = 25 cells (including origin)
      expect(cells).toHaveLength(25);
      expect(cells.find(c => c.row === 5 && c.col === 5)).toBeDefined();
    });
  });

  describe("cylinder", () => {
    it("uses cellsInRange same as sphere", () => {
      const shape: AOEShape = { type: "cylinder", origin: { row: 5, col: 5 }, radiusFeet: 10 };
      const cells = getAOECells(shape, 20);

      expect(cells).toHaveLength(25);
      expect(cells.find(c => c.row === 5 && c.col === 5)).toBeDefined();
    });
  });

  describe("cone", () => {
    it("returns cells in forward arc pointing north, excludes origin", () => {
      // 15-foot cone = 3 squares length, pointing north (direction row < origin row)
      const shape: AOEShape = {
        type: "cone",
        origin: { row: 5, col: 5 },
        lengthFeet: 15,
        direction: { row: 2, col: 5 }, // north
      };
      const cells = getAOECells(shape, 20);

      // Origin excluded
      expect(cells.find(c => c.row === 5 && c.col === 5)).toBeUndefined();

      // Cells behind (south of) origin should not appear
      const behindCells = cells.filter(c => c.row > 5);
      expect(behindCells).toHaveLength(0);

      // Cells in front (north of origin) should appear
      expect(cells.find(c => c.row === 4 && c.col === 5)).toBeDefined(); // directly north
      expect(cells.length).toBeGreaterThan(0);
    });

    it("respects dot >= 0.5 threshold", () => {
      // Cone pointing east
      const shape: AOEShape = {
        type: "cone",
        origin: { row: 5, col: 5 },
        lengthFeet: 15,
        direction: { row: 5, col: 8 }, // east
      };
      const cells = getAOECells(shape, 20);

      // Cells due west of origin should not appear (negative dot product)
      const westCells = cells.filter(c => c.col < 5);
      expect(westCells).toHaveLength(0);

      // Cells due east should appear
      expect(cells.find(c => c.row === 5 && c.col === 6)).toBeDefined();
    });

    it("returns empty array for zero-length direction vector", () => {
      const shape: AOEShape = {
        type: "cone",
        origin: { row: 5, col: 5 },
        lengthFeet: 15,
        direction: { row: 5, col: 5 }, // same as origin → zero vector
      };
      const cells = getAOECells(shape, 20);
      expect(cells).toHaveLength(0);
    });
  });

  describe("line", () => {
    it("returns cells along direction within length and width", () => {
      // 30-foot line pointing east, width 5
      const shape: AOEShape = {
        type: "line",
        origin: { row: 5, col: 5 },
        lengthFeet: 30,
        widthFeet: 5,
        direction: { row: 5, col: 11 }, // east
      };
      const cells = getAOECells(shape, 20);

      // Should include cells along the east direction
      expect(cells.find(c => c.row === 5 && c.col === 6)).toBeDefined();
      expect(cells.find(c => c.row === 5 && c.col === 7)).toBeDefined();

      // Should NOT include cells behind origin (west)
      const behindCells = cells.filter(c => c.col < 5);
      expect(behindCells).toHaveLength(0);

      // Origin excluded
      expect(cells.find(c => c.row === 5 && c.col === 5)).toBeUndefined();
    });

    it("returns empty array for zero-length direction vector", () => {
      const shape: AOEShape = {
        type: "line",
        origin: { row: 5, col: 5 },
        lengthFeet: 30,
        widthFeet: 5,
        direction: { row: 5, col: 5 }, // same as origin
      };
      const cells = getAOECells(shape, 20);
      expect(cells).toHaveLength(0);
    });
  });

  describe("grid boundaries", () => {
    it("clips cells to valid grid range near edge", () => {
      // Sphere at corner of grid
      const shape: AOEShape = { type: "sphere", origin: { row: 0, col: 0 }, radiusFeet: 10 };
      const cells = getAOECells(shape, 10);

      // All cells should be within grid bounds
      for (const c of cells) {
        expect(c.row).toBeGreaterThanOrEqual(0);
        expect(c.row).toBeLessThan(10);
        expect(c.col).toBeGreaterThanOrEqual(0);
        expect(c.col).toBeLessThan(10);
      }

      // Should be fewer than a full 5x5 because of clipping
      expect(cells.length).toBeLessThan(24);
    });

    it("clips cone cells to grid bounds", () => {
      // Cone near top edge pointing north
      const shape: AOEShape = {
        type: "cone",
        origin: { row: 1, col: 5 },
        lengthFeet: 15,
        direction: { row: 0, col: 5 },
      };
      const cells = getAOECells(shape, 10);

      for (const c of cells) {
        expect(c.row).toBeGreaterThanOrEqual(0);
        expect(c.row).toBeLessThan(10);
        expect(c.col).toBeGreaterThanOrEqual(0);
        expect(c.col).toBeLessThan(10);
      }
    });
  });
});

// ─── getAOETargets ──────────────────────────────────────────────────────────

describe("getAOETargets", () => {
  const makeSphere = (origin: GridPosition, radiusFeet: number): AOEShape => ({
    type: "sphere",
    origin,
    radiusFeet,
  });

  it("returns NPC IDs whose positions fall within affected cells", () => {
    const shape = makeSphere({ row: 5, col: 5 }, 10);
    const positions = new Map<string, GridPosition>([
      ["goblin-1", { row: 4, col: 5 }],  // within range
      ["goblin-2", { row: 6, col: 6 }],  // within range
      ["goblin-3", { row: 0, col: 0 }],  // out of range
    ]);
    const targets = getAOETargets(shape, positions, 20);
    expect(targets).toContain("goblin-1");
    expect(targets).toContain("goblin-2");
    expect(targets).not.toContain("goblin-3");
  });

  it("returns empty array when no NPCs in AOE", () => {
    const shape = makeSphere({ row: 5, col: 5 }, 5);
    const positions = new Map<string, GridPosition>([
      ["goblin-1", { row: 0, col: 0 }],
      ["goblin-2", { row: 19, col: 19 }],
    ]);
    const targets = getAOETargets(shape, positions, 20);
    expect(targets).toHaveLength(0);
  });

  it("returns empty array for empty positions map", () => {
    const shape = makeSphere({ row: 5, col: 5 }, 10);
    const positions = new Map<string, GridPosition>();
    const targets = getAOETargets(shape, positions, 20);
    expect(targets).toHaveLength(0);
  });

  it("returns multiple NPCs when all are in AOE", () => {
    const shape = makeSphere({ row: 5, col: 5 }, 10);
    const positions = new Map<string, GridPosition>([
      ["goblin-1", { row: 4, col: 5 }],
      ["goblin-2", { row: 6, col: 5 }],
      ["goblin-3", { row: 5, col: 4 }],
    ]);
    const targets = getAOETargets(shape, positions, 20);
    expect(targets).toHaveLength(3);
  });

  it("includes NPCs at the origin (center of target-origin AOE)", () => {
    const shape = makeSphere({ row: 5, col: 5 }, 10);
    const positions = new Map<string, GridPosition>([
      ["goblin-at-origin", { row: 5, col: 5 }],
      ["goblin-nearby", { row: 4, col: 5 }],
    ]);
    const targets = getAOETargets(shape, positions, 20);
    expect(targets).toContain("goblin-at-origin");
    expect(targets).toContain("goblin-nearby");
  });
});
