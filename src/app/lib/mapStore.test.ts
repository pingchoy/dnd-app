/**
 * mapStore.test.ts
 *
 * Unit tests for mapStore type-narrowing helpers and instantiation logic.
 * Firestore interactions are mocked — real integration tests are separate.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  ExplorationMapDocument,
  CombatMapDocument,
  MapDocument,
  PointOfInterest,
} from "./gameTypes";

// ─── Mock Firebase Admin ──────────────────────────────────────────────────────

// Build a chainable Firestore mock that tracks .set() and .update() calls
const mockSetCalls: Array<{ path: string; data: Record<string, unknown> }> = [];
const mockUpdateCalls: Array<{ path: string; data: Record<string, unknown> }> = [];
let mockGetReturn: { exists: boolean; id: string; data: () => Record<string, unknown> | undefined } = {
  exists: false,
  id: "",
  data: () => undefined,
};
let mockQueryReturn: { empty: boolean; docs: Array<{ id: string; data: () => Record<string, unknown> }> } = {
  empty: true,
  docs: [],
};

let docIdCounter = 0;

const mockDoc = (path: string) => ({
  get: vi.fn().mockResolvedValue(mockGetReturn),
  set: vi.fn().mockImplementation((data: Record<string, unknown>) => {
    mockSetCalls.push({ path, data });
    return Promise.resolve();
  }),
  update: vi.fn().mockImplementation((data: Record<string, unknown>) => {
    mockUpdateCalls.push({ path, data });
    return Promise.resolve();
  }),
  id: `mock-id-${++docIdCounter}`,
});

const mockCollection = vi.fn().mockReturnValue({
  doc: vi.fn().mockImplementation((id?: string) => {
    const path = id ?? `auto-${docIdCounter + 1}`;
    return mockDoc(path);
  }),
  where: vi.fn().mockReturnValue({
    get: vi.fn().mockImplementation(() => Promise.resolve(mockQueryReturn)),
  }),
  orderBy: vi.fn().mockReturnValue({
    get: vi.fn().mockImplementation(() => Promise.resolve(mockQueryReturn)),
  }),
  select: vi.fn().mockReturnValue({
    get: vi.fn().mockImplementation(() => Promise.resolve(mockQueryReturn)),
  }),
});

vi.mock("./firebaseAdmin", () => ({
  adminDb: {
    collection: vi.fn().mockImplementation(() => ({
      doc: vi.fn().mockImplementation(() => ({
        collection: vi.fn().mockImplementation(() => ({
          doc: vi.fn().mockImplementation((id?: string) => {
            const d = mockDoc(id ?? `auto-${docIdCounter + 1}`);
            return d;
          }),
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockImplementation(() => Promise.resolve(mockQueryReturn)),
          }),
          orderBy: vi.fn().mockReturnValue({
            get: vi.fn().mockImplementation(() => Promise.resolve(mockQueryReturn)),
          }),
        })),
        get: vi.fn().mockImplementation(() => Promise.resolve(mockGetReturn)),
        set: vi.fn().mockImplementation((data: Record<string, unknown>) => {
          mockSetCalls.push({ path: "root", data });
          return Promise.resolve();
        }),
        update: vi.fn().mockImplementation((data: Record<string, unknown>) => {
          mockUpdateCalls.push({ path: "root", data });
          return Promise.resolve();
        }),
      })),
      where: vi.fn().mockReturnValue({
        get: vi.fn().mockImplementation(() => Promise.resolve(mockQueryReturn)),
      }),
      select: vi.fn().mockReturnValue({
        get: vi.fn().mockImplementation(() => Promise.resolve(mockQueryReturn)),
      }),
    })),
  },
}));

// ─── Import after mock ────────────────────────────────────────────────────────

import {
  loadExplorationMap,
  loadCombatMapForPOI,
} from "./mapStore";

beforeEach(() => {
  mockSetCalls.length = 0;
  mockUpdateCalls.length = 0;
  docIdCounter = 0;
  mockGetReturn = { exists: false, id: "", data: () => undefined };
  mockQueryReturn = { empty: true, docs: [] };
});

// ─── Type-narrowing helpers ─────────────────────────────────────────────────

describe("loadExplorationMap", () => {
  it("returns null when map not found", async () => {
    mockGetReturn = { exists: false, id: "", data: () => undefined };
    const result = await loadExplorationMap("session-1", "missing-id");
    expect(result).toBeNull();
  });

  it("returns null when map is combat type", async () => {
    mockGetReturn = {
      exists: true,
      id: "combat-map-1",
      data: () => ({
        mapType: "combat",
        name: "test combat",
        gridSize: 20,
        feetPerSquare: 5,
        regions: [],
      }),
    };
    const result = await loadExplorationMap("session-1", "combat-map-1");
    expect(result).toBeNull();
  });

  it("returns ExplorationMapDocument when map is exploration type", async () => {
    mockGetReturn = {
      exists: true,
      id: "expl-map-1",
      data: () => ({
        mapType: "exploration",
        name: "valdris city",
        backgroundImageUrl: "https://example.com/img.png",
        pointsOfInterest: [],
      }),
    };
    const result = await loadExplorationMap("session-1", "expl-map-1");
    expect(result).not.toBeNull();
    expect(result!.mapType).toBe("exploration");
    expect(result!.backgroundImageUrl).toBe("https://example.com/img.png");
    expect(result!.pointsOfInterest).toEqual([]);
  });
});

describe("loadCombatMapForPOI", () => {
  it("returns null when exploration map not found", async () => {
    mockGetReturn = { exists: false, id: "", data: () => undefined };
    const result = await loadCombatMapForPOI("session-1", "missing", "poi_1");
    expect(result).toBeNull();
  });

  it("returns null when POI not found on exploration map", async () => {
    mockGetReturn = {
      exists: true,
      id: "expl-1",
      data: () => ({
        mapType: "exploration",
        name: "city",
        backgroundImageUrl: "https://example.com/img.png",
        pointsOfInterest: [
          { id: "poi_other", combatMapId: "cm-1" },
        ],
      }),
    };
    const result = await loadCombatMapForPOI("session-1", "expl-1", "poi_missing");
    expect(result).toBeNull();
  });
});

// ─── MapDocument discriminated union compile-time checks ────────────────────

describe("MapDocument type narrowing (compile-time checks)", () => {
  it("ExplorationMapDocument has required exploration fields", () => {
    const doc: ExplorationMapDocument = {
      mapType: "exploration",
      name: "test",
      backgroundImageUrl: "https://example.com/bg.png",
      pointsOfInterest: [],
    };
    // Compile-time: backgroundImageUrl is string (not optional)
    const url: string = doc.backgroundImageUrl;
    expect(url).toBe("https://example.com/bg.png");
    expect(doc.pointsOfInterest).toEqual([]);
  });

  it("CombatMapDocument has required combat fields", () => {
    const doc: CombatMapDocument = {
      mapType: "combat",
      name: "battle map",
      gridSize: 20,
      feetPerSquare: 5,
      regions: [],
    };
    expect(doc.gridSize).toBe(20);
    expect(doc.feetPerSquare).toBe(5);
    expect(doc.regions).toEqual([]);
  });

  it("CombatMapDocument accepts optional parentMapId and poiId", () => {
    const doc: CombatMapDocument = {
      mapType: "combat",
      name: "linked battle map",
      gridSize: 20,
      feetPerSquare: 5,
      regions: [],
      parentMapId: "expl-123",
      poiId: "poi_docks",
    };
    expect(doc.parentMapId).toBe("expl-123");
    expect(doc.poiId).toBe("poi_docks");
  });

  it("MapDocument union narrows correctly on mapType", () => {
    const doc: MapDocument = {
      mapType: "exploration",
      name: "city",
      backgroundImageUrl: "https://example.com/city.png",
      pointsOfInterest: [],
    };

    if (doc.mapType === "exploration") {
      // TypeScript should allow accessing exploration-only fields here
      expect(doc.pointsOfInterest).toEqual([]);
    }

    // Verify combat narrowing with a combat doc
    const combatDoc: MapDocument = {
      mapType: "combat",
      name: "battle",
      gridSize: 20,
      feetPerSquare: 5,
      regions: [],
    };
    if (combatDoc.mapType === "combat") {
      expect(combatDoc.gridSize).toBe(20);
    }
  });
});

describe("PointOfInterest structure", () => {
  it("creates a valid PointOfInterest linking exploration and combat maps", () => {
    const poi: PointOfInterest = {
      id: "poi_docks",
      number: 1,
      name: "valdris docks",
      description: "a busy waterfront district",
      position: { x: 25, y: 80 },
      combatMapId: "session-combat-map-abc",
      isHidden: false,
      actNumbers: [1, 2],
      locationTags: ["docks", "waterfront", "pier"],
    };

    expect(poi.combatMapId).toBe("session-combat-map-abc");
    expect(poi.position.x).toBe(25);
    expect(poi.actNumbers).toContain(1);
    expect(poi.locationTags).toContain("docks");
  });

  it("accepts optional defaultNPCSlugs", () => {
    const poi: PointOfInterest = {
      id: "poi_tavern",
      number: 2,
      name: "the rusty flagon",
      description: "a lively tavern",
      position: { x: 50, y: 50 },
      combatMapId: "session-combat-map-def",
      isHidden: false,
      actNumbers: [1],
      locationTags: ["tavern"],
      defaultNPCSlugs: ["barkeeper", "commoner"],
    };

    expect(poi.defaultNPCSlugs).toEqual(["barkeeper", "commoner"]);
  });
});
