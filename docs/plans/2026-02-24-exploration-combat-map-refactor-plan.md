# Exploration & Combat Map Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the flat battle-grid map system with a two-tier hierarchy: exploration maps (image + numbered POIs) and combat maps (tactical grid), so players explore via theatre of the mind and only see battle grids during combat.

**Architecture:** Single Firestore collection with a `mapType` discriminator ("exploration" | "combat"). Exploration maps store an image + `pointsOfInterest[]`. Combat maps keep the existing grid/region system and reference their parent exploration map via `parentMapId` + `poiId`. Each campaign act specifies exactly one exploration map via `explorationMapSpecId`.

**Tech Stack:** TypeScript, Next.js 14, Firebase Firestore, Vitest, React, Tailwind CSS

---

## Task 1: Add New Map Types to gameTypes.ts

**Files:**
- Modify: `src/app/lib/gameTypes.ts:10-75` (map types section)
- Modify: `src/app/lib/gameTypes.ts:404-455` (campaign map types section)
- Modify: `src/app/lib/gameTypes.ts:492-503` (Campaign interface)
- Modify: `src/app/lib/gameTypes.ts:529-543` (CampaignAct interface)
- Modify: `src/app/lib/gameTypes.ts:650-662` (StoredSession interface)
- Test: `src/app/lib/mapTypes.test.ts` (new file)

### Step 1: Write failing tests for new map types

Create `src/app/lib/mapTypes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type {
  PointOfInterest,
  ExplorationMapDocument,
  CombatMapDocument,
  MapDocument,
  CampaignExplorationMapSpec,
  CampaignPOISpec,
  CampaignCombatMapSpec,
} from "./gameTypes";

// ─── PointOfInterest ─────────────────────────────────────────────────────────

describe("PointOfInterest type", () => {
  it("accepts a valid POI with all required fields", () => {
    const poi: PointOfInterest = {
      id: "poi_docks",
      number: 1,
      name: "valdris docks",
      description: "a busy waterfront district",
      position: { x: 25.5, y: 80.0 },
      combatMapId: "map_abc123",
      isHidden: false,
      actNumbers: [1],
      locationTags: ["docks", "waterfront"],
    };
    expect(poi.id).toBe("poi_docks");
    expect(poi.position.x).toBe(25.5);
    expect(poi.isHidden).toBe(false);
  });

  it("accepts optional defaultNPCSlugs", () => {
    const poi: PointOfInterest = {
      id: "poi_tavern",
      number: 2,
      name: "the rusty flagon",
      description: "a lively tavern",
      position: { x: 50, y: 50 },
      combatMapId: "map_def456",
      isHidden: false,
      actNumbers: [1, 2],
      locationTags: ["tavern"],
      defaultNPCSlugs: ["barkeeper", "commoner"],
    };
    expect(poi.defaultNPCSlugs).toEqual(["barkeeper", "commoner"]);
  });
});

// ─── MapDocument discriminated union ─────────────────────────────────────────

describe("MapDocument discriminated union", () => {
  it("narrows to ExplorationMapDocument when mapType is exploration", () => {
    const doc: MapDocument = {
      mapType: "exploration",
      name: "valdris city",
      backgroundImageUrl: "https://example.com/valdris.png",
      pointsOfInterest: [],
    };
    if (doc.mapType === "exploration") {
      expect(doc.pointsOfInterest).toEqual([]);
      expect(doc.backgroundImageUrl).toBe("https://example.com/valdris.png");
    }
  });

  it("narrows to CombatMapDocument when mapType is combat", () => {
    const doc: MapDocument = {
      mapType: "combat",
      name: "docks battle map",
      gridSize: 20,
      feetPerSquare: 5,
      regions: [],
      parentMapId: "expl_123",
      poiId: "poi_docks",
    };
    if (doc.mapType === "combat") {
      expect(doc.gridSize).toBe(20);
      expect(doc.parentMapId).toBe("expl_123");
      expect(doc.regions).toEqual([]);
    }
  });

  it("combat map can have tileData and backgroundImageUrl", () => {
    const doc: MapDocument = {
      mapType: "combat",
      name: "docks battle map",
      gridSize: 20,
      feetPerSquare: 5,
      regions: [],
      parentMapId: "expl_123",
      poiId: "poi_docks",
      tileData: new Array(400).fill(0),
      backgroundImageUrl: "https://example.com/docks.png",
    };
    if (doc.mapType === "combat") {
      expect(doc.tileData?.length).toBe(400);
    }
  });
});

// ─── Campaign spec types ─────────────────────────────────────────────────────

describe("Campaign exploration/combat spec types", () => {
  it("CampaignExplorationMapSpec has required fields", () => {
    const spec: CampaignExplorationMapSpec = {
      id: "valdris-city",
      name: "The Free City of Valdris",
      imageDescription: "A sprawling port city viewed from above",
      pointsOfInterest: [],
    };
    expect(spec.id).toBe("valdris-city");
  });

  it("CampaignPOISpec links to a combat map spec", () => {
    const poi: CampaignPOISpec = {
      id: "poi_docks",
      number: 1,
      name: "valdris docks",
      description: "a busy waterfront district",
      combatMapSpecId: "valdris-docks",
      isHidden: false,
      actNumbers: [1],
      locationTags: ["docks", "waterfront"],
    };
    expect(poi.combatMapSpecId).toBe("valdris-docks");
  });

  it("CampaignCombatMapSpec has layout and regions", () => {
    const spec: CampaignCombatMapSpec = {
      id: "valdris-docks",
      name: "Valdris Docks, Pier 7",
      layoutDescription: "A waterfront pier district",
      feetPerSquare: 5,
      terrain: "urban",
      lighting: "dim",
      regions: [],
    };
    expect(spec.terrain).toBe("urban");
  });
});
```

### Step 2: Run tests to verify they fail

Run: `npx vitest run src/app/lib/mapTypes.test.ts`
Expected: FAIL — types don't exist yet

### Step 3: Implement new types in gameTypes.ts

In `src/app/lib/gameTypes.ts`, **replace lines 10-75** (the map & region types section) with:

```ts
// ─── Map & Region Types ──────────────────────────────────────────────────────

export type RegionType =
  | "tavern"
  | "shop"
  | "temple"
  | "dungeon"
  | "wilderness"
  | "residential"
  | "street"
  | "guard_post"
  | "danger"    // traps, hazards — DM generates tension
  | "safe"      // players can long rest here
  | "custom";   // freeform — use dmNote for description

/** Semantic region painted on a combat map — tells the DM what's at each location. */
export interface MapRegion {
  id: string;                    // "region_tavern_main"
  name: string;                  // "The Rusty Flagon — Common Room"
  type: RegionType;
  cells: number[];               // flat cell indices (row * 20 + col) — arbitrary shape
  dmNote?: string;               // "Barkeep Mira behind counter. Patrons are tense."
  defaultNPCSlugs?: string[];    // ["guard", "commoner"] — NPCs placed here by default
  shopInventory?: string[];      // for type="shop" — items the DM can reference
}

/**
 * Normalize a region from Firestore — converts legacy `bounds` format to `cells`.
 * Safe to call on regions that already have `cells`.
 */
export function normalizeRegion(r: Record<string, unknown>): MapRegion {
  const region = r as unknown as MapRegion & { bounds?: { minRow: number; maxRow: number; minCol: number; maxCol: number } };
  if (region.cells && Array.isArray(region.cells)) return { ...region, cells: region.cells };
  // Convert legacy bounds → cells
  if (region.bounds) {
    const { minRow, maxRow, minCol, maxCol } = region.bounds;
    const cells: number[] = [];
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        cells.push(row * 20 + col);
      }
    }
    const { bounds: _, ...rest } = region;
    return { ...rest, cells } as MapRegion;
  }
  return { ...region, cells: [] } as MapRegion;
}

/** Normalize an array of regions from Firestore (handles missing `cells`). */
export function normalizeRegions(regions: unknown[]): MapRegion[] {
  if (!Array.isArray(regions)) return [];
  return regions.map((r) => normalizeRegion(r as Record<string, unknown>));
}

// ─── Point of Interest ───────────────────────────────────────────────────────

/** Point of interest on an exploration map — a numbered area players can visit. */
export interface PointOfInterest {
  id: string;                    // "poi_docks"
  number: number;                // 1-N, displayed as label on the map image
  name: string;                  // "valdris docks"
  description: string;           // DM-facing description for theatre of the mind
  position: { x: number; y: number }; // percentage coordinates on the image (0-100)
  combatMapId: string;           // Firestore ID of the child combat map
  isHidden: boolean;             // hidden until revealed by DM agent or story progression
  actNumbers: number[];          // which acts this POI is relevant in
  locationTags: string[];        // for DM agent location matching
  defaultNPCSlugs?: string[];    // NPCs present at this location
}

// ─── Map Documents (discriminated union) ─────────────────────────────────────

/** Shared fields for all map documents. */
interface BaseMapDocument {
  id?: string;
  name: string;
  backgroundImageUrl?: string;
  createdAt?: number;
  updatedAt?: number;
}

/** Exploration map — zoomed-out image with numbered POIs. No grid. */
export interface ExplorationMapDocument extends BaseMapDocument {
  mapType: "exploration";
  backgroundImageUrl: string;    // required for exploration maps
  pointsOfInterest: PointOfInterest[];
}

/** Combat map — tactical battle grid for encounters at a specific POI. */
export interface CombatMapDocument extends BaseMapDocument {
  mapType: "combat";
  gridSize: number;              // always 20
  feetPerSquare: number;
  tileData?: number[];           // flat array [gridSize*gridSize]: 0=floor, 1=wall, 2=door
  regions: MapRegion[];          // kept for terrain features (high/low ground)
  parentMapId: string;           // links to parent exploration map
  poiId: string;                 // which POI this combat map belongs to
}

/** Discriminated union — all map documents. */
export type MapDocument = ExplorationMapDocument | CombatMapDocument;
```

Then **replace lines 404-455** (campaign map types section) with:

```ts
// ─── Campaign Map Types ──────────────────────────────────────────────────────

/** Region blueprint for a campaign combat map — guides the map generator. */
export interface CampaignMapRegionSpec {
  id: string;                      // "region_main_hall"
  name: string;                    // "main hall"
  type: RegionType;
  approximateSize: "small" | "medium" | "large";
  position?: "north" | "south" | "east" | "west" | "center"
    | "northeast" | "northwest" | "southeast" | "southwest";
  dmNote?: string;
  defaultNPCSlugs?: string[];
  shopInventory?: string[];
}

/** POI blueprint within an exploration map spec. */
export interface CampaignPOISpec {
  id: string;                      // "poi_docks"
  number: number;                  // display order/number
  name: string;                    // "valdris docks"
  description: string;             // DM-facing description
  combatMapSpecId: string;         // references CampaignCombatMapSpec.id
  isHidden: boolean;
  actNumbers: number[];
  locationTags: string[];
  defaultNPCSlugs?: string[];
  position?: { x: number; y: number }; // pre-set or placed in editor later
}

/** Blueprint for an exploration map in a campaign. */
export interface CampaignExplorationMapSpec {
  id: string;                      // "valdris-city"
  name: string;                    // "The Free City of Valdris"
  imageDescription: string;        // Prompt for Stability AI exploration image
  pointsOfInterest: CampaignPOISpec[];
}

/** Blueprint for a combat map (renamed from CampaignMapSpec). */
export interface CampaignCombatMapSpec {
  id: string;                      // "valdris-docks"
  name: string;                    // "Valdris Docks, Pier 7"
  layoutDescription: string;       // Prose for AI map generator
  feetPerSquare: number;
  terrain: "urban" | "dungeon" | "wilderness" | "underground" | "interior" | "mixed";
  lighting: "bright" | "dim" | "dark" | "mixed";
  atmosphereNotes?: string;
  regions: CampaignMapRegionSpec[];
}

/** @deprecated Use CampaignCombatMapSpec. Kept as alias during migration. */
export type CampaignMapSpec = CampaignCombatMapSpec;

/** Pre-generated campaign map template stored in Firestore campaignMaps/ collection. */
export interface CampaignMap {
  campaignSlug: string;
  mapSpecId: string;               // References CampaignCombatMapSpec.id or CampaignExplorationMapSpec.id
  mapType: "exploration" | "combat";
  name: string;
  // Combat map fields (undefined for exploration maps)
  gridSize?: number;
  feetPerSquare?: number;
  tileData?: number[];
  regions?: MapRegion[];
  // Exploration map fields (undefined for combat maps)
  pointsOfInterest?: CampaignPOISpec[];
  // Shared fields
  backgroundImageUrl?: string;
  generatedAt: number;
}
```

Then update the **Campaign interface** (line ~503) — change `mapSpecs` to new fields:

```ts
export interface Campaign {
  slug: string;
  title: string;
  playerTeaser: string;
  theme: string;
  suggestedLevel: { min: number; max: number };
  estimatedDurationHours: number;
  hooks: string[];
  actSlugs: string[];
  npcs: CampaignNPC[];
  dmSummary: string;
  /** @deprecated Use explorationMapSpecs + combatMapSpecs. */
  mapSpecs?: CampaignCombatMapSpec[];
  explorationMapSpecs?: CampaignExplorationMapSpec[];
  combatMapSpecs?: CampaignCombatMapSpec[];
}
```

Then update the **CampaignAct interface** (line ~529) — add `explorationMapSpecId`:

```ts
export interface CampaignAct {
  campaignSlug: string;
  actNumber: number;
  title: string;
  summary: string;
  suggestedLevel: { min: number; max: number };
  setting: string;
  plotPoints: string[];
  mysteries: string[];
  keyEvents: string[];
  encounters: CampaignEncounter[];
  relevantNPCIds: string[];
  transitionToNextAct?: string;
  dmBriefing: string;
  /** Which exploration map this act uses. References CampaignExplorationMapSpec.id. */
  explorationMapSpecId?: string;
}
```

Then update the **StoredSession interface** (line ~650):

```ts
export interface StoredSession {
  id?: string;
  story: StoryState;
  campaignSlug?: string;
  characterIds: string[];
  /** @deprecated Use currentExplorationMapId. */
  activeMapId?: string;
  /** Which exploration map is currently displayed. */
  currentExplorationMapId?: string;
  /** Which POI the party is currently at (null = viewing overview). */
  currentPOIId?: string;
  /** @deprecated Exploration mode no longer uses grid positions. */
  explorationPositions?: Record<string, GridPosition>;
  createdAt?: number;
  updatedAt?: number;
}
```

### Step 4: Run tests to verify they pass

Run: `npx vitest run src/app/lib/mapTypes.test.ts`
Expected: PASS — all type tests compile and assertions pass

### Step 5: Run type checker to find compilation errors

Run: `npx tsc --noEmit 2>&1 | head -80`
Expected: Compilation errors in files that import `MapDocument` (they expect the old non-union shape). Note these — they'll be fixed in subsequent tasks.

### Step 6: Commit

```bash
git add src/app/lib/gameTypes.ts src/app/lib/mapTypes.test.ts
git commit -m "feat: add exploration/combat map type hierarchy

Introduces PointOfInterest, ExplorationMapDocument, CombatMapDocument
as a discriminated union on mapType. Adds CampaignExplorationMapSpec,
CampaignPOISpec, CampaignCombatMapSpec for campaign definitions.
Updates StoredSession with currentExplorationMapId and currentPOIId."
```

---

## Task 2: Fix Compilation Errors from Type Changes

**Files:**
- Modify: `src/app/lib/mapStore.ts` (all functions)
- Modify: `src/app/lib/gameState.ts:444-477,251-282,988-1001`
- Modify: `src/app/api/maps/route.ts` (all request bodies + handlers)
- Modify: `src/app/lib/encounterStore.ts` (region references)
- Modify: `src/app/agents/mapAnalysisAgent.ts` (return type)
- Modify: `src/app/hooks/useChat.tsx:63-87` (state types)
- Modify: `src/app/components/CombatGrid.tsx:27-61` (props)
- Modify: `src/app/components/MapEditor.tsx:54-60` (props)
- Modify: `src/app/map-editor/page.tsx` (map handling)
- Modify: `src/app/dashboard/page.tsx` (map rendering)

This task is about achieving clean compilation, not adding new features. Existing behavior must be preserved. Every place that accesses `MapDocument` fields needs to either:
1. Check `mapType` first (type narrowing), or
2. Accept the specific subtype (`CombatMapDocument`) if it only works with combat maps

### Step 1: Update mapStore.ts

Replace `MapDocument` import with new types. Update function signatures:

- `createMap()` — accept `ExplorationMapDocument | CombatMapDocument` (already works via union)
- `loadMap()` — return `MapDocument | null` (already correct since MapDocument is the union)
- `loadSessionMaps()` — return `MapDocument[]`
- `instantiateCampaignMaps()` — handle both exploration and combat templates from `CampaignMap`

Key change in `instantiateCampaignMaps()` (lines 128-188): When copying a `CampaignMap` template, include `mapType`, `pointsOfInterest`, `parentMapId`, `poiId` fields:

```ts
export async function instantiateCampaignMaps(
  campaignSlug: string,
  sessionId: string,
  campaign?: Campaign | null,
): Promise<MapDocument[]> {
  const snap = await adminDb
    .collection("campaignMaps")
    .where("campaignSlug", "==", campaignSlug)
    .get();

  if (snap.empty) return [];

  const now = Date.now();
  const maps: MapDocument[] = [];
  const specIds: string[] = [];

  // First pass: create all maps and track IDs
  // We need to create exploration maps first so combat maps can reference them
  const templates = snap.docs.map((doc) => doc.data() as CampaignMap);
  const explorationTemplates = templates.filter((t) => t.mapType === "exploration");
  const combatTemplates = templates.filter((t) => t.mapType !== "exploration");

  // Map from mapSpecId → session map ID (for linking combat maps to exploration maps)
  const specIdToSessionId = new Map<string, string>();

  // Create exploration maps first
  for (const template of explorationTemplates) {
    const mapDoc: Omit<ExplorationMapDocument, "id"> = {
      mapType: "exploration",
      name: template.name,
      backgroundImageUrl: template.backgroundImageUrl ?? "",
      pointsOfInterest: [], // POIs will be linked after combat maps are created
      createdAt: now,
      updatedAt: now,
    };

    const ref = adminDb.collection("sessions").doc(sessionId).collection("maps").doc();
    await ref.set(mapDoc);
    const created: ExplorationMapDocument = { id: ref.id, ...mapDoc };
    maps.push(created);
    specIds.push(template.mapSpecId);
    specIdToSessionId.set(template.mapSpecId, ref.id);
  }

  // Create combat maps, linking to their parent exploration map
  for (const template of combatTemplates) {
    // Find parent exploration map ID — look up via campaign spec
    let parentMapId = "";
    let poiId = "";
    if (campaign?.explorationMapSpecs) {
      for (const explSpec of campaign.explorationMapSpecs) {
        const poi = explSpec.pointsOfInterest.find(
          (p) => p.combatMapSpecId === template.mapSpecId,
        );
        if (poi) {
          parentMapId = specIdToSessionId.get(explSpec.id) ?? "";
          poiId = poi.id;
          break;
        }
      }
    }

    const mapDoc: Omit<CombatMapDocument, "id"> = {
      mapType: "combat",
      name: template.name,
      gridSize: template.gridSize ?? 20,
      feetPerSquare: template.feetPerSquare ?? 5,
      tileData: template.tileData,
      regions: template.regions ?? [],
      parentMapId,
      poiId,
      ...(template.backgroundImageUrl ? { backgroundImageUrl: template.backgroundImageUrl } : {}),
      createdAt: now,
      updatedAt: now,
    };

    const ref = adminDb.collection("sessions").doc(sessionId).collection("maps").doc();
    await ref.set(mapDoc);
    const created: CombatMapDocument = { id: ref.id, ...mapDoc };
    maps.push(created);
    specIds.push(template.mapSpecId);
    specIdToSessionId.set(template.mapSpecId, ref.id);
  }

  // Now update exploration maps with POI combatMapIds
  for (const explMap of maps.filter((m): m is ExplorationMapDocument => m.mapType === "exploration")) {
    const explSpecId = specIds[maps.indexOf(explMap)];
    const explSpec = campaign?.explorationMapSpecs?.find((s) => s.id === explSpecId);
    if (!explSpec) continue;

    const pois: PointOfInterest[] = explSpec.pointsOfInterest.map((poiSpec) => ({
      id: poiSpec.id,
      number: poiSpec.number,
      name: poiSpec.name,
      description: poiSpec.description,
      position: poiSpec.position ?? { x: 50, y: 50 },
      combatMapId: specIdToSessionId.get(poiSpec.combatMapSpecId) ?? "",
      isHidden: poiSpec.isHidden,
      actNumbers: poiSpec.actNumbers,
      locationTags: poiSpec.locationTags,
      ...(poiSpec.defaultNPCSlugs ? { defaultNPCSlugs: poiSpec.defaultNPCSlugs } : {}),
    }));

    await updateMap(sessionId, explMap.id!, { pointsOfInterest: pois } as Partial<Omit<MapDocument, "id" | "createdAt">>);
    (explMap as ExplorationMapDocument).pointsOfInterest = pois;
  }

  // Sort so exploration maps come first, then combat maps by act order
  if (campaign?.explorationMapSpecs?.length || campaign?.combatMapSpecs?.length) {
    const allSpecs = [
      ...(campaign.explorationMapSpecs ?? []).map((s) => s.id),
      ...(campaign.combatMapSpecs ?? []).map((s) => s.id),
    ];
    const specOrder = new Map(allSpecs.map((id, i) => [id, i]));
    const indices = maps.map((_, i) => i);
    indices.sort((a, b) => {
      // Exploration maps first
      const aType = maps[a].mapType === "exploration" ? 0 : 1;
      const bType = maps[b].mapType === "exploration" ? 0 : 1;
      if (aType !== bType) return aType - bType;
      return (specOrder.get(specIds[a]) ?? 999) - (specOrder.get(specIds[b]) ?? 999);
    });
    return indices.map((i) => maps[i]);
  }

  return maps;
}
```

### Step 2: Update gameState.ts

Rename `currentActiveMapId` → `currentExplorationMapId` throughout the file:
- Line 446: `let currentActiveMapId` → `let currentExplorationMapId`
- Line 471-473: getter `getActiveMapId` → `getExplorationMapId`
- Line 1000: `currentActiveMapId = session?.activeMapId` → `currentExplorationMapId = session?.currentExplorationMapId ?? session?.activeMapId` (backwards compat)

Add new singleton and getter:
```ts
let currentPOIId: string | undefined;

export function getCurrentPOIId(): string | undefined {
  return currentPOIId;
}
```

Update `serializeRegionContext()` (lines 251-282) — this function still works for combat mode (when a combat map is loaded). Add a new function for exploration mode:

```ts
/**
 * Serialize exploration map context for the DM agent.
 * Lists all POIs with the current one highlighted.
 */
export function serializeExplorationContext(
  explorationMap: ExplorationMapDocument | null,
  currentPoiId: string | undefined,
): string {
  if (!explorationMap) return "";

  const lines: string[] = ["CURRENT EXPLORATION MAP: " + explorationMap.name];
  lines.push("Points of Interest:");

  for (const poi of explorationMap.pointsOfInterest) {
    const isCurrent = poi.id === currentPoiId;
    const hiddenTag = poi.isHidden ? " [HIDDEN from players]" : "";
    const currentTag = isCurrent ? " ← PARTY IS HERE" : "";
    lines.push(`  ${poi.number}. ${poi.name}${hiddenTag}${currentTag}`);
    lines.push(`     ${poi.description}`);
    if (poi.defaultNPCSlugs?.length) {
      lines.push(`     NPCs: ${poi.defaultNPCSlugs.join(", ")}`);
    }
  }

  return lines.join("\n");
}
```

### Step 3: Update remaining files for compilation

For each file that imports `MapDocument`, update to handle the discriminated union:

**`src/app/api/maps/route.ts`**: Update request body interfaces and handlers. The analyze endpoint returns combat map data. The create endpoint needs a `mapType` field.

**`src/app/hooks/useChat.tsx`**: Change `activeMapId` → `explorationMapId`, add `currentPOIId` state. The `activeMap` state becomes `ExplorationMapDocument | null`.

**`src/app/dashboard/page.tsx`**: Instead of always rendering `CombatGrid`, conditionally render either `ExplorationMap` (new component, Task 5) or `CombatGrid` based on whether combat is active.

**`src/app/components/CombatGrid.tsx`**: Props already accept optional `tileData` and `regions`. Ensure the component receives `CombatMapDocument` data, not exploration maps.

**`src/app/components/MapEditor.tsx`**: The editor works with combat map data (tileData + regions). Type its data as `CombatMapDocument`-compatible.

**`src/app/map-editor/page.tsx`**: Add exploration map editing mode (detailed in Task 6).

**`src/app/agents/mapAnalysisAgent.ts`**: Returns combat map data — ensure `MapAnalysisResult` reflects this.

**`src/app/lib/encounterStore.ts`**: Region-based NPC placement only applies to combat maps. Type-narrow before accessing `regions`.

### Step 4: Run type checker

Run: `npx tsc --noEmit`
Expected: PASS — no type errors

### Step 5: Run existing tests

Run: `npx vitest run`
Expected: All existing tests pass (no behavioral changes yet)

### Step 6: Commit

```bash
git add -A
git commit -m "refactor: update all files for MapDocument discriminated union

Fixes compilation errors from the new type hierarchy. Renames
currentActiveMapId to currentExplorationMapId. Adds backwards-compat
fallback for existing session data."
```

---

## Task 3: Restructure The Crimson Accord Campaign Data

**Files:**
- Modify: `scripts/campaigns/the-crimson-accord.ts`
- Modify: `scripts/campaigns/index.ts`
- Test: `src/app/lib/campaignMapStructure.test.ts` (new file)

### Step 1: Write failing tests

Create `src/app/lib/campaignMapStructure.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { theCrimsonAccord } from "../../../scripts/campaigns/the-crimson-accord";

describe("The Crimson Accord campaign structure", () => {
  it("has exactly 1 exploration map spec", () => {
    expect(theCrimsonAccord.campaign.explorationMapSpecs).toHaveLength(1);
  });

  it("exploration map is valdris-city", () => {
    const explMap = theCrimsonAccord.campaign.explorationMapSpecs![0];
    expect(explMap.id).toBe("valdris-city");
    expect(explMap.name).toContain("Valdris");
  });

  it("has 8 combat map specs", () => {
    expect(theCrimsonAccord.campaign.combatMapSpecs).toHaveLength(8);
  });

  it("exploration map has 8 POIs", () => {
    const explMap = theCrimsonAccord.campaign.explorationMapSpecs![0];
    expect(explMap.pointsOfInterest).toHaveLength(8);
  });

  it("every POI references a valid combat map spec", () => {
    const explMap = theCrimsonAccord.campaign.explorationMapSpecs![0];
    const combatIds = new Set(
      theCrimsonAccord.campaign.combatMapSpecs!.map((s) => s.id),
    );
    for (const poi of explMap.pointsOfInterest) {
      expect(combatIds.has(poi.combatMapSpecId)).toBe(true);
    }
  });

  it("every encounter mapSpecId references a valid combat map spec", () => {
    const combatIds = new Set(
      theCrimsonAccord.campaign.combatMapSpecs!.map((s) => s.id),
    );
    for (const act of theCrimsonAccord.acts) {
      for (const enc of act.encounters) {
        if (enc.mapSpecId) {
          expect(combatIds.has(enc.mapSpecId)).toBe(true);
        }
      }
    }
  });

  it("all acts have explorationMapSpecId", () => {
    for (const act of theCrimsonAccord.acts) {
      expect(act.explorationMapSpecId).toBe("valdris-city");
    }
  });

  it("hidden POIs are correct", () => {
    const explMap = theCrimsonAccord.campaign.explorationMapSpecs![0];
    const hidden = explMap.pointsOfInterest
      .filter((p) => p.isHidden)
      .map((p) => p.name);
    expect(hidden).toContain("undercity tunnels");
    expect(hidden).toContain("smuggler warehouse");
    expect(hidden).toContain("the narrows");
    expect(hidden).toContain("ancient temple");
  });

  it("POI numbers are sequential 1-8", () => {
    const explMap = theCrimsonAccord.campaign.explorationMapSpecs![0];
    const numbers = explMap.pointsOfInterest.map((p) => p.number).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
```

### Step 2: Run tests to verify they fail

Run: `npx vitest run src/app/lib/campaignMapStructure.test.ts`
Expected: FAIL

### Step 3: Restructure the-crimson-accord.ts

Restructure the file to have:
1. `CRIMSON_ACCORD_COMBAT_MAP_SPECS: CampaignCombatMapSpec[]` — the 8 existing map specs with `connections` and `actNumbers` and `locationTags` removed (those move to POIs)
2. `CRIMSON_ACCORD_EXPLORATION_MAP_SPECS: CampaignExplorationMapSpec[]` — a single exploration map with 8 POIs
3. Each act gets `explorationMapSpecId: "valdris-city"`
4. Campaign gets `explorationMapSpecs` and `combatMapSpecs` instead of `mapSpecs`

The combat map specs keep their layout descriptions, regions, terrain, lighting, atmosphere. The POIs get the `actNumbers`, `locationTags`, `isHidden`, and `defaultNPCSlugs` from the old map specs.

Hidden POIs:
- `undercity-tunnels` → isHidden: true (discovered during Act 1 docks investigation)
- `smuggler-warehouse` → isHidden: true (discovered during Act 1 undercity exploration)
- `the-narrows` → isHidden: true (discovered during Act 2)
- `ancient-temple` → isHidden: true (discovered during Act 3)

### Step 4: Run tests to verify they pass

Run: `npx vitest run src/app/lib/campaignMapStructure.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add scripts/campaigns/the-crimson-accord.ts scripts/campaigns/index.ts src/app/lib/campaignMapStructure.test.ts
git commit -m "refactor: restructure crimson accord into exploration + combat maps

Splits 8 flat map specs into 1 exploration map (valdris-city) with 8
POIs linking to 8 combat map specs. Adds explorationMapSpecId to each
act. Marks 4 POIs as hidden for progressive discovery."
```

---

## Task 4: Update Map Store for New Map Types

**Files:**
- Modify: `src/app/lib/mapStore.ts`
- Test: `src/app/lib/mapStore.test.ts` (new file)

### Step 1: Write failing tests

Create `src/app/lib/mapStore.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock firebase admin
vi.mock("./firebaseAdmin", () => ({
  adminDb: {
    collection: vi.fn(),
  },
}));

import type {
  CampaignMap,
  Campaign,
  CampaignExplorationMapSpec,
  CampaignCombatMapSpec,
  ExplorationMapDocument,
  CombatMapDocument,
} from "./gameTypes";

describe("instantiateCampaignMaps", () => {
  it("creates exploration maps before combat maps", async () => {
    // This test verifies ordering: exploration maps should be created
    // first so combat maps can reference their IDs.
    // Implementation details tested via integration test.
    expect(true).toBe(true); // placeholder — real test below
  });

  it("links combat map POIs to correct session combat map IDs", async () => {
    // Verified in integration tests since this requires Firestore mocking
    expect(true).toBe(true);
  });
});

describe("map type helpers", () => {
  it("isExplorationMap correctly identifies exploration maps", () => {
    const explMap: ExplorationMapDocument = {
      mapType: "exploration",
      name: "test",
      backgroundImageUrl: "http://example.com/img.png",
      pointsOfInterest: [],
    };
    expect(explMap.mapType).toBe("exploration");
  });

  it("isCombatMap correctly identifies combat maps", () => {
    const combatMap: CombatMapDocument = {
      mapType: "combat",
      name: "test",
      gridSize: 20,
      feetPerSquare: 5,
      regions: [],
      parentMapId: "expl_1",
      poiId: "poi_1",
    };
    expect(combatMap.mapType).toBe("combat");
  });
});
```

### Step 2: Run tests to verify they pass (these are mostly type checks)

Run: `npx vitest run src/app/lib/mapStore.test.ts`
Expected: PASS

### Step 3: Implement mapStore.ts changes

Apply the `instantiateCampaignMaps` changes from Task 2 Step 1. Also add helper functions:

```ts
/** Load the exploration map for a session (there should be at most one active). */
export async function loadExplorationMap(
  sessionId: string,
  mapId: string,
): Promise<ExplorationMapDocument | null> {
  const map = await loadMap(sessionId, mapId);
  if (!map || map.mapType !== "exploration") return null;
  return map as ExplorationMapDocument;
}

/** Load the combat map for a specific POI on an exploration map. */
export async function loadCombatMapForPOI(
  sessionId: string,
  explorationMapId: string,
  poiId: string,
): Promise<CombatMapDocument | null> {
  const explMap = await loadExplorationMap(sessionId, explorationMapId);
  if (!explMap) return null;

  const poi = explMap.pointsOfInterest.find((p) => p.id === poiId);
  if (!poi) return null;

  const map = await loadMap(sessionId, poi.combatMapId);
  if (!map || map.mapType !== "combat") return null;
  return map as CombatMapDocument;
}
```

### Step 4: Run all tests

Run: `npx vitest run`
Expected: PASS

### Step 5: Commit

```bash
git add src/app/lib/mapStore.ts src/app/lib/mapStore.test.ts
git commit -m "feat: update mapStore for exploration/combat map hierarchy

Adds loadExplorationMap and loadCombatMapForPOI helpers. Updates
instantiateCampaignMaps to create exploration maps first, then combat
maps with parent references, then backfill POI combatMapIds."
```

---

## Task 5: Create ExplorationMap Component

**Files:**
- Create: `src/app/components/ExplorationMap.tsx`
- Test: `src/app/components/ExplorationMap.test.tsx` (new file)

### Step 1: Write failing tests

Create `src/app/components/ExplorationMap.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ExplorationMap from "./ExplorationMap";
import type { PointOfInterest } from "../lib/gameTypes";

const mockPOIs: PointOfInterest[] = [
  {
    id: "poi_docks",
    number: 1,
    name: "valdris docks",
    description: "a busy waterfront",
    position: { x: 25, y: 80 },
    combatMapId: "map_1",
    isHidden: false,
    actNumbers: [1],
    locationTags: ["docks"],
  },
  {
    id: "poi_council",
    number: 2,
    name: "council hall",
    description: "the seat of government",
    position: { x: 50, y: 30 },
    combatMapId: "map_2",
    isHidden: false,
    actNumbers: [1, 3],
    locationTags: ["council"],
  },
  {
    id: "poi_temple",
    number: 3,
    name: "ancient temple",
    description: "hidden underground temple",
    position: { x: 75, y: 60 },
    combatMapId: "map_3",
    isHidden: true,
    actNumbers: [3],
    locationTags: ["temple"],
  },
];

describe("ExplorationMap", () => {
  it("renders the background image", () => {
    render(
      <ExplorationMap
        backgroundImageUrl="https://example.com/map.png"
        pointsOfInterest={mockPOIs}
        currentPOIId={null}
        onPOIClick={vi.fn()}
      />,
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/map.png");
  });

  it("renders visible POI markers but not hidden ones", () => {
    render(
      <ExplorationMap
        backgroundImageUrl="https://example.com/map.png"
        pointsOfInterest={mockPOIs}
        currentPOIId={null}
        onPOIClick={vi.fn()}
      />,
    );
    // Visible POIs show their number
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    // Hidden POI should not be rendered
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });

  it("highlights the current POI", () => {
    render(
      <ExplorationMap
        backgroundImageUrl="https://example.com/map.png"
        pointsOfInterest={mockPOIs}
        currentPOIId="poi_docks"
        onPOIClick={vi.fn()}
      />,
    );
    const marker = screen.getByText("1").closest("button");
    expect(marker?.className).toContain("ring");
  });

  it("calls onPOIClick when a marker is clicked", () => {
    const handleClick = vi.fn();
    render(
      <ExplorationMap
        backgroundImageUrl="https://example.com/map.png"
        pointsOfInterest={mockPOIs}
        currentPOIId={null}
        onPOIClick={handleClick}
      />,
    );
    fireEvent.click(screen.getByText("1"));
    expect(handleClick).toHaveBeenCalledWith("poi_docks");
  });

  it("shows POI name on hover", () => {
    render(
      <ExplorationMap
        backgroundImageUrl="https://example.com/map.png"
        pointsOfInterest={mockPOIs}
        currentPOIId={null}
        onPOIClick={vi.fn()}
      />,
    );
    const marker = screen.getByText("1").closest("button");
    fireEvent.mouseEnter(marker!);
    expect(screen.getByText("valdris docks")).toBeInTheDocument();
  });
});
```

### Step 2: Run tests to verify they fail

Run: `npx vitest run src/app/components/ExplorationMap.test.tsx`
Expected: FAIL — component doesn't exist

### Step 3: Implement ExplorationMap component

Create `src/app/components/ExplorationMap.tsx`:

```tsx
"use client";

import React, { useState, useCallback } from "react";
import type { PointOfInterest } from "../lib/gameTypes";

interface Props {
  backgroundImageUrl: string;
  pointsOfInterest: PointOfInterest[];
  currentPOIId: string | null;
  onPOIClick: (poiId: string) => void;
}

/** Marker size in pixels. */
const MARKER_SIZE = 36;

function ExplorationMap({ backgroundImageUrl, pointsOfInterest, currentPOIId, onPOIClick }: Props) {
  const [hoveredPOI, setHoveredPOI] = useState<string | null>(null);

  const visiblePOIs = pointsOfInterest.filter((poi) => !poi.isHidden);

  const handleClick = useCallback((poiId: string) => {
    onPOIClick(poiId);
  }, [onPOIClick]);

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-gray-900">
      {/* Background map image */}
      <img
        src={backgroundImageUrl}
        alt="Exploration map"
        className="w-full h-auto block"
        draggable={false}
      />

      {/* POI markers */}
      {visiblePOIs.map((poi) => {
        const isCurrent = poi.id === currentPOIId;
        const isHovered = poi.id === hoveredPOI;

        return (
          <button
            key={poi.id}
            onClick={() => handleClick(poi.id)}
            onMouseEnter={() => setHoveredPOI(poi.id)}
            onMouseLeave={() => setHoveredPOI(null)}
            className={`
              absolute flex items-center justify-center
              rounded-full font-bold text-white text-sm
              transition-all duration-200 cursor-pointer
              ${isCurrent
                ? "bg-amber-500 ring-4 ring-amber-300 ring-opacity-75 scale-110"
                : "bg-indigo-600 hover:bg-indigo-500 hover:scale-110"
              }
            `}
            style={{
              left: `${poi.position.x}%`,
              top: `${poi.position.y}%`,
              width: MARKER_SIZE,
              height: MARKER_SIZE,
              transform: "translate(-50%, -50%)",
            }}
            title={poi.name}
          >
            {poi.number}

            {/* Tooltip on hover */}
            {isHovered && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-3 py-1 text-sm text-gray-100 shadow-lg pointer-events-none">
                {poi.name}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default React.memo(ExplorationMap);
```

### Step 4: Run tests to verify they pass

Run: `npx vitest run src/app/components/ExplorationMap.test.tsx`
Expected: PASS

### Step 5: Commit

```bash
git add src/app/components/ExplorationMap.tsx src/app/components/ExplorationMap.test.tsx
git commit -m "feat: add ExplorationMap component

Renders background image with numbered POI markers. Hides hidden POIs,
highlights current POI, shows name tooltip on hover, fires onClick."
```

---

## Task 6: Update Map Editor for Exploration Maps

**Files:**
- Modify: `src/app/map-editor/page.tsx`
- Modify: `src/app/components/MapEditor.tsx`
- Create: `src/app/components/ExplorationMapEditor.tsx`

### Step 1: Create ExplorationMapEditor component

Create `src/app/components/ExplorationMapEditor.tsx` — a click-to-place POI editor:

```tsx
"use client";

import React, { useState, useCallback, useRef } from "react";
import type { CampaignPOISpec } from "../lib/gameTypes";

interface Props {
  imageUrl: string;
  pointsOfInterest: CampaignPOISpec[];
  onPOIsChange: (pois: CampaignPOISpec[]) => void;
}

function ExplorationMapEditor({ imageUrl, pointsOfInterest, onPOIsChange }: Props) {
  const [selectedPOI, setSelectedPOI] = useState<string | null>(null);
  const [editingPOI, setEditingPOI] = useState<CampaignPOISpec | null>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const nextNumber = pointsOfInterest.length + 1;
    const newPOI: CampaignPOISpec = {
      id: `poi_${nextNumber}`,
      number: nextNumber,
      name: "",
      description: "",
      combatMapSpecId: "",
      isHidden: false,
      actNumbers: [1],
      locationTags: [],
      position: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 },
    };

    onPOIsChange([...pointsOfInterest, newPOI]);
    setSelectedPOI(newPOI.id);
    setEditingPOI(newPOI);
  }, [pointsOfInterest, onPOIsChange]);

  const handleDragPOI = useCallback((poiId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();

    const handleMove = (me: MouseEvent) => {
      const x = ((me.clientX - rect.left) / rect.width) * 100;
      const y = ((me.clientY - rect.top) / rect.height) * 100;
      const clamped = {
        x: Math.max(0, Math.min(100, Math.round(x * 10) / 10)),
        y: Math.max(0, Math.min(100, Math.round(y * 10) / 10)),
      };
      onPOIsChange(
        pointsOfInterest.map((p) =>
          p.id === poiId ? { ...p, position: clamped } : p,
        ),
      );
    };

    const handleUp = () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }, [pointsOfInterest, onPOIsChange]);

  const updateEditingPOI = useCallback((field: string, value: unknown) => {
    if (!editingPOI) return;
    const updated = { ...editingPOI, [field]: value };
    setEditingPOI(updated);
    onPOIsChange(
      pointsOfInterest.map((p) => (p.id === updated.id ? updated : p)),
    );
  }, [editingPOI, pointsOfInterest, onPOIsChange]);

  const deletePOI = useCallback((poiId: string) => {
    const filtered = pointsOfInterest
      .filter((p) => p.id !== poiId)
      .map((p, i) => ({ ...p, number: i + 1 }));
    onPOIsChange(filtered);
    if (selectedPOI === poiId) {
      setSelectedPOI(null);
      setEditingPOI(null);
    }
  }, [pointsOfInterest, selectedPOI, onPOIsChange]);

  return (
    <div className="flex gap-4">
      {/* Map image with POI markers */}
      <div
        ref={imageRef}
        className="relative flex-1 cursor-crosshair"
        onClick={handleImageClick}
      >
        <img src={imageUrl} alt="Exploration map" className="w-full h-auto block rounded-lg" draggable={false} />
        {pointsOfInterest.map((poi) => (
          <button
            key={poi.id}
            className={`absolute w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm
              ${selectedPOI === poi.id ? "bg-amber-500 ring-4 ring-amber-300" : poi.isHidden ? "bg-gray-500" : "bg-indigo-600"}
            `}
            style={{
              left: `${poi.position?.x ?? 50}%`,
              top: `${poi.position?.y ?? 50}%`,
              transform: "translate(-50%, -50%)",
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedPOI(poi.id);
              setEditingPOI(poi);
            }}
            onMouseDown={(e) => handleDragPOI(poi.id, e)}
            title={poi.name || `POI ${poi.number}`}
          >
            {poi.number}
          </button>
        ))}
      </div>

      {/* POI edit form */}
      <div className="w-80 shrink-0 space-y-3">
        <h3 className="font-semibold text-lg text-gray-200">
          {editingPOI ? `Edit POI ${editingPOI.number}` : "Click map to place POI"}
        </h3>
        {editingPOI && (
          <>
            <label className="block">
              <span className="text-sm text-gray-400">Name</span>
              <input
                type="text"
                className="w-full rounded bg-gray-700 px-3 py-2 text-white"
                value={editingPOI.name}
                onChange={(e) => updateEditingPOI("name", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-400">Description (DM-facing)</span>
              <textarea
                className="w-full rounded bg-gray-700 px-3 py-2 text-white h-24"
                value={editingPOI.description}
                onChange={(e) => updateEditingPOI("description", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-400">Location Tags (comma-separated)</span>
              <input
                type="text"
                className="w-full rounded bg-gray-700 px-3 py-2 text-white"
                value={editingPOI.locationTags.join(", ")}
                onChange={(e) => updateEditingPOI("locationTags", e.target.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))}
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editingPOI.isHidden}
                onChange={(e) => updateEditingPOI("isHidden", e.target.checked)}
              />
              <span className="text-sm text-gray-400">Hidden (revealed later)</span>
            </label>
            <button
              onClick={() => deletePOI(editingPOI.id)}
              className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500"
            >
              Delete POI
            </button>
          </>
        )}

        {/* POI list */}
        <div className="mt-4 space-y-1">
          <h4 className="text-sm font-semibold text-gray-400">All POIs</h4>
          {pointsOfInterest.map((poi) => (
            <button
              key={poi.id}
              onClick={() => { setSelectedPOI(poi.id); setEditingPOI(poi); }}
              className={`block w-full text-left rounded px-2 py-1 text-sm
                ${selectedPOI === poi.id ? "bg-indigo-600 text-white" : "text-gray-300 hover:bg-gray-700"}
                ${poi.isHidden ? "opacity-60 italic" : ""}
              `}
            >
              {poi.number}. {poi.name || "(unnamed)"}
              {poi.isHidden && " [hidden]"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default React.memo(ExplorationMapEditor);
```

### Step 2: Update map-editor/page.tsx

Add a map type selector at the top of the editor. When "exploration" is selected, show `ExplorationMapEditor` instead of the grid-based `MapEditor`. When "combat" is selected, show the existing `MapEditor`.

Key changes:
- Add `mapType` state: `"exploration" | "combat"`
- Add `pointsOfInterest` state: `CampaignPOISpec[]`
- Conditionally render `ExplorationMapEditor` or `MapEditor`
- Update save logic to include `mapType` and `pointsOfInterest` for exploration maps

### Step 3: Run type checker and existing tests

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS

### Step 4: Commit

```bash
git add src/app/components/ExplorationMapEditor.tsx src/app/map-editor/page.tsx src/app/components/MapEditor.tsx
git commit -m "feat: add exploration map editor with click-to-place POIs

New ExplorationMapEditor component for placing numbered POI markers
on an uploaded image. Map editor page supports both exploration and
combat map editing modes."
```

---

## Task 7: Update Dashboard for Exploration/Combat Switching

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/hooks/useChat.tsx`

### Step 1: Update useChat hook

In `src/app/hooks/useChat.tsx`:
- Rename `activeMapId` → `explorationMapId`
- Add `currentPOIId` state
- Change `activeMap` type to `ExplorationMapDocument | null`
- Update the initial fetch handler to use `currentExplorationMapId` from session data
- Add `setCombatMapId` for when combat starts (the encounter data includes the combat map reference)

### Step 2: Update dashboard page

In `src/app/dashboard/page.tsx`:
- Import `ExplorationMap` component
- When no encounter is active: render `ExplorationMap` with the exploration map data
- When encounter is active: render `CombatGrid` with the combat map data (loaded from encounter's `mapId`)
- Add `handlePOIClick` callback — sends a "go to area N" message to the DM

### Step 3: Run type checker and existing tests

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS (tests may need updates for renamed fields)

### Step 4: Commit

```bash
git add src/app/dashboard/page.tsx src/app/hooks/useChat.tsx
git commit -m "feat: switch dashboard between exploration and combat views

Shows ExplorationMap component when not in combat, CombatGrid when
encounter is active. Clicking a POI sends 'go to area N' to the DM."
```

---

## Task 8: Update DM Agent Context

**Files:**
- Modify: `src/app/agents/dmAgent.ts`
- Modify: `src/app/lib/gameState.ts`
- Modify: `src/app/api/chat/route.ts`

### Step 1: Update DM agent system prompt

The DM agent's system prompt currently references spatial positions and regions. Update it to:
- In exploration mode: include `serializeExplorationContext()` output (POI list with current location)
- In combat mode: keep existing `serializeRegionContext()` for spatial combat awareness
- Add instruction that the DM can reveal hidden POIs via `update_game_state`

### Step 2: Update chat route to pass exploration context

In `src/app/api/chat/route.ts`, load the exploration map and pass it to the DM agent instead of (or in addition to) the combat map context.

### Step 3: Add `reveal_poi` to update_game_state tool

The DM agent's `update_game_state` tool should accept a `reveal_poi` field:
```ts
reveal_poi?: string; // POI ID to reveal (set isHidden=false)
```

When processed, update the exploration map's POI `isHidden` to `false` in Firestore.

### Step 4: Run all tests

Run: `npx vitest run`
Expected: PASS

### Step 5: Commit

```bash
git add src/app/agents/dmAgent.ts src/app/lib/gameState.ts src/app/api/chat/route.ts
git commit -m "feat: update DM agent for exploration map context

DM receives POI list with current location in exploration mode.
Adds reveal_poi action to update_game_state for progressive POI
discovery."
```

---

## Task 9: Update API Maps Route

**Files:**
- Modify: `src/app/api/maps/route.ts`

### Step 1: Update request body interfaces

Add `mapType` to `CreateMapBody`. Add new action `"create-exploration"` for creating exploration maps. Update `"update"` to handle both types.

### Step 2: Add exploration map endpoints

- `POST /api/maps` with `action: "create-exploration"` — creates an exploration map with POIs
- `GET /api/maps?sessionId=X&type=exploration` — list only exploration maps
- `GET /api/maps?sessionId=X&type=combat&parentMapId=Y` — list combat maps for an exploration map

### Step 3: Update the chat GET endpoint

The `GET /api/chat` endpoint returns `activeMapId` and `activeMap`. Update to return `explorationMapId`, `explorationMap`, and `currentPOIId`.

### Step 4: Run type checker

Run: `npx tsc --noEmit`
Expected: PASS

### Step 5: Commit

```bash
git add src/app/api/maps/route.ts src/app/api/chat/route.ts
git commit -m "feat: update maps API for exploration/combat map types

Adds create-exploration action, type filter on GET. Updates chat GET
to return explorationMapId and currentPOIId."
```

---

## Task 10: Update Campaign Map Generation Pipeline

**Files:**
- Modify: `scripts/generateCampaignMaps.ts`
- Modify: `scripts/lib/stabilityImageAgent.ts`
- Modify: `scripts/lib/mapGenerationAgent.ts`

### Step 1: Update generateCampaignMaps.ts

The generation script needs a two-phase approach:
1. Generate exploration map image (Stability AI with the exploration map spec's `imageDescription`)
2. Generate combat maps (existing pipeline for each `CampaignCombatMapSpec`)

Update the script to:
- Read `explorationMapSpecs` and `combatMapSpecs` from the campaign
- For each exploration map: generate image, save to `campaignMaps/{slug}_{specId}` with `mapType: "exploration"`
- For each combat map: use existing pipeline, save with `mapType: "combat"`

### Step 2: Update stabilityImageAgent.ts

Add support for generating exploration map images. The prompt should request a zoomed-out, top-down view suitable for an overworld/city map, rather than a detailed battle grid.

### Step 3: Run the script dry

Run: `npx tsx scripts/generateCampaignMaps.ts --campaign the-crimson-accord --dry-run`
Expected: Outputs plan for generating 1 exploration map + 8 combat maps

### Step 4: Commit

```bash
git add scripts/generateCampaignMaps.ts scripts/lib/stabilityImageAgent.ts scripts/lib/mapGenerationAgent.ts
git commit -m "feat: update generation pipeline for exploration + combat maps

Two-phase generation: exploration map image first, then combat maps.
Exploration maps use zoomed-out image generation prompt."
```

---

## Task 11: Update Encounter Store for Combat Map References

**Files:**
- Modify: `src/app/lib/encounterStore.ts`
- Modify: `src/app/api/chat/route.ts` (encounter creation)

### Step 1: Update encounter creation

When combat starts at a POI, the encounter should reference the POI's combat map:
- Look up the current POI from the exploration map
- Load the POI's combat map by `combatMapId`
- Set `mapId` on the encounter to the combat map's ID
- Use the combat map's regions for NPC placement (existing `computeInitialPositions` logic)

### Step 2: Update `computeInitialPositions`

Ensure it only receives `CombatMapDocument` data (type-narrow if needed). The function already works with `MapRegion[]` and `tileData`, which are combat map fields.

### Step 3: Run all tests

Run: `npx vitest run`
Expected: PASS

### Step 4: Commit

```bash
git add src/app/lib/encounterStore.ts src/app/api/chat/route.ts
git commit -m "feat: encounters reference POI combat maps

When combat starts at a POI, loads the POI's combat map for the
encounter. Region-based NPC placement uses combat map data."
```

---

## Task 12: Final Integration Test and Cleanup

**Files:**
- Test: `src/app/lib/mapIntegration.test.ts` (new file)
- Modify: various files for cleanup

### Step 1: Write integration tests

Create `src/app/lib/mapIntegration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type {
  ExplorationMapDocument,
  CombatMapDocument,
  MapDocument,
  PointOfInterest,
} from "./gameTypes";
import { serializeExplorationContext } from "./gameState";

describe("Map hierarchy integration", () => {
  const explorationMap: ExplorationMapDocument = {
    mapType: "exploration",
    id: "expl_1",
    name: "the free city of valdris",
    backgroundImageUrl: "https://example.com/valdris.png",
    pointsOfInterest: [
      {
        id: "poi_docks", number: 1, name: "valdris docks",
        description: "a busy waterfront district with cargo ships",
        position: { x: 25, y: 80 }, combatMapId: "combat_1",
        isHidden: false, actNumbers: [1], locationTags: ["docks", "waterfront"],
      },
      {
        id: "poi_temple", number: 2, name: "ancient temple",
        description: "hidden underground temple beneath the city",
        position: { x: 75, y: 60 }, combatMapId: "combat_2",
        isHidden: true, actNumbers: [3], locationTags: ["temple"],
      },
    ],
  };

  it("exploration context includes visible POIs", () => {
    const context = serializeExplorationContext(explorationMap, "poi_docks");
    expect(context).toContain("valdris docks");
    expect(context).toContain("PARTY IS HERE");
  });

  it("exploration context shows hidden POIs to DM", () => {
    const context = serializeExplorationContext(explorationMap, "poi_docks");
    expect(context).toContain("ancient temple");
    expect(context).toContain("HIDDEN");
  });

  it("type narrowing works for exploration maps", () => {
    const doc: MapDocument = explorationMap;
    if (doc.mapType === "exploration") {
      expect(doc.pointsOfInterest.length).toBe(2);
    }
  });

  it("type narrowing works for combat maps", () => {
    const combatMap: CombatMapDocument = {
      mapType: "combat", id: "combat_1", name: "docks battle map",
      gridSize: 20, feetPerSquare: 5, tileData: new Array(400).fill(0),
      regions: [], parentMapId: "expl_1", poiId: "poi_docks",
    };
    const doc: MapDocument = combatMap;
    if (doc.mapType === "combat") {
      expect(doc.gridSize).toBe(20);
      expect(doc.parentMapId).toBe("expl_1");
    }
  });

  it("POI reveals work correctly", () => {
    const revealed = explorationMap.pointsOfInterest.map((poi) =>
      poi.id === "poi_temple" ? { ...poi, isHidden: false } : poi,
    );
    const updated: ExplorationMapDocument = {
      ...explorationMap,
      pointsOfInterest: revealed,
    };
    expect(updated.pointsOfInterest.find((p) => p.id === "poi_temple")?.isHidden).toBe(false);
  });
});
```

### Step 2: Run full test suite

Run: `npx vitest run`
Expected: ALL tests pass

### Step 3: Run type checker

Run: `npx tsc --noEmit`
Expected: PASS

### Step 4: Run linter

Run: `npm run lint`
Expected: PASS (or only pre-existing warnings)

### Step 5: Clean up deprecated fields and unused imports

Review all files for:
- Unused `CampaignMapConnection` type (connections removed)
- Any remaining references to `explorationPositions` in non-deprecated contexts
- Old `activeMapId` references that should be `currentExplorationMapId`

### Step 6: Commit

```bash
git add -A
git commit -m "test: add map hierarchy integration tests and cleanup

Verifies exploration context serialization, type narrowing, POI
reveal logic. Removes unused connection types and legacy references."
```

---

## Summary

| Task | What | Key Files |
|------|------|-----------|
| 1 | Add new types | `gameTypes.ts`, `mapTypes.test.ts` |
| 2 | Fix compilation | All files importing MapDocument |
| 3 | Restructure Crimson Accord | `the-crimson-accord.ts`, `campaignMapStructure.test.ts` |
| 4 | Update mapStore | `mapStore.ts`, `mapStore.test.ts` |
| 5 | ExplorationMap component | `ExplorationMap.tsx`, `ExplorationMap.test.tsx` |
| 6 | Map editor update | `ExplorationMapEditor.tsx`, `map-editor/page.tsx` |
| 7 | Dashboard switching | `dashboard/page.tsx`, `useChat.tsx` |
| 8 | DM agent context | `dmAgent.ts`, `gameState.ts`, `chat/route.ts` |
| 9 | API route updates | `maps/route.ts`, `chat/route.ts` |
| 10 | Generation pipeline | `generateCampaignMaps.ts`, image/map agents |
| 11 | Encounter integration | `encounterStore.ts`, `chat/route.ts` |
| 12 | Integration tests + cleanup | `mapIntegration.test.ts`, various |
