# Exploration & Combat Map Refactor Design

**Date:** 2026-02-24
**Status:** Approved

## Summary

Refactor the campaign map system from a flat collection of battle-grid maps into a two-tier hierarchy: **exploration maps** (zoomed-out image with numbered points of interest) and **combat maps** (tactical battle grids). Exploration uses theatre of the mind via the DM agent; combat maps are only displayed during actual encounters.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Exploration map display | Image + numbered POI markers (no grid) | Simpler, matches tabletop DnD overworld style |
| POI authoring | Click-to-place on image in editor | Intuitive visual placement |
| Combat map per POI | Required for every POI | Ensures combat readiness at any location |
| Exploration maps per act | Exactly 1 per act (different acts can differ) | Simple act-to-map binding |
| Travel between POIs | Free (any POI reachable), no explicit connections | Simpler schema, DM narrates transitions |
| Hidden POIs | `isHidden` field, revealed by DM/story | Enables progressive map reveal |
| Data architecture | Flat collection + `mapType` discriminator | Simplest queries, easy migration, one set of CRUD |
| Regions on combat maps | Kept (for terrain features like high/low ground) | Future terrain mechanic support |
| Regions on exploration maps | Removed (replaced by POIs) | POIs serve the same purpose at a higher level |
| Game state field | `currentExplorationMapId` (renamed from `currentActiveMapId`) | Clearer intent |

## New Type Hierarchy

### Exploration Map Types

```ts
/** Point of interest on an exploration map — a numbered area players can visit. */
interface PointOfInterest {
  id: string;                    // "poi_docks"
  number: number;                // 1-N, displayed as label on the map image
  name: string;                  // "Valdris Docks"
  description: string;           // DM-facing description for theatre of the mind
  position: { x: number; y: number }; // percentage coordinates on the image (0-100)
  combatMapId: string;           // required — Firestore ID of the child combat map
  isHidden: boolean;             // hidden until revealed by DM agent or story progression
  actNumbers: number[];          // which acts this POI is relevant in
  locationTags: string[];        // for DM agent location matching
  defaultNPCSlugs?: string[];    // NPCs present at this location
}
```

### MapDocument Changes (discriminated union)

```ts
/** Shared fields for all map documents. */
interface BaseMapDocument {
  id?: string;
  name: string;
  backgroundImageUrl?: string;
  createdAt?: number;
  updatedAt?: number;
}

/** Exploration map — zoomed-out image with numbered POIs. */
interface ExplorationMapDocument extends BaseMapDocument {
  mapType: "exploration";
  backgroundImageUrl: string;    // required for exploration maps
  pointsOfInterest: PointOfInterest[];
  // No gridSize, tileData, or regions
}

/** Combat map — tactical battle grid for encounters at a specific POI. */
interface CombatMapDocument extends BaseMapDocument {
  mapType: "combat";
  gridSize: number;              // always 20
  feetPerSquare: number;
  tileData?: number[];           // flat array [gridSize*gridSize]
  regions: MapRegion[];          // kept for terrain features (high/low ground)
  parentMapId: string;           // links to parent exploration map
  poiId: string;                 // which POI this combat map belongs to
}

/** Discriminated union — all map documents. */
type MapDocument = ExplorationMapDocument | CombatMapDocument;
```

### Campaign Spec Changes

```ts
/** Blueprint for an exploration map in a campaign. */
interface CampaignExplorationMapSpec {
  id: string;                    // "valdris-city"
  name: string;                  // "The Free City of Valdris"
  imageDescription: string;      // Prompt for Stability AI exploration image generation
  pointsOfInterest: CampaignPOISpec[];
}

/** POI blueprint within an exploration map spec. */
interface CampaignPOISpec {
  id: string;                    // "poi_docks"
  number: number;                // display order/number
  name: string;                  // "Valdris Docks"
  description: string;           // DM-facing description
  combatMapSpecId: string;       // references CampaignCombatMapSpec.id
  isHidden: boolean;
  actNumbers: number[];
  locationTags: string[];
  defaultNPCSlugs?: string[];
  position?: { x: number; y: number }; // pre-set or placed in editor later
}

/** Blueprint for a combat map (renamed from CampaignMapSpec). */
interface CampaignCombatMapSpec {
  id: string;                    // "valdris-docks"
  name: string;                  // "Valdris Docks, Pier 7"
  layoutDescription: string;     // prose for AI map generator
  feetPerSquare: number;
  terrain: "urban" | "dungeon" | "wilderness" | "underground" | "interior" | "mixed";
  lighting: "bright" | "dim" | "dark" | "mixed";
  atmosphereNotes?: string;
  regions: CampaignMapRegionSpec[];  // kept for combat maps
}

/** Act definition gains an exploration map reference. */
// Add to existing act type:
//   explorationMapSpecId: string;  // which exploration map this act uses
```

### Game State Changes

```ts
// In GameState / StoryState:
currentExplorationMapId?: string;  // renamed from currentActiveMapId
currentPOIId?: string;             // which POI the party is currently at (null = overview)

// Remove:
// currentActiveMapId (renamed above)
// explorationPositions (no grid-based movement in exploration mode)
```

## Crimson Accord Restructuring

The current 8 flat `CampaignMapSpec` entries become:

**1 Exploration Map Spec:** "valdris-city"
- 8 POIs (one per current map), some hidden initially

**8 Combat Map Specs** (one per current map, content mostly unchanged):
- valdris-docks, council-hall, undercity-tunnels, smuggler-warehouse
- caelum-hospital, blackwood-estate, the-narrows, ancient-temple

**Act → Exploration Map binding:**
- Act 1: `explorationMapSpecId: "valdris-city"`
- Act 2: `explorationMapSpecId: "valdris-city"` (same map, different POIs revealed)
- Act 3: `explorationMapSpecId: "valdris-city"` (more POIs revealed)

**Hidden POIs:**
- undercity-tunnels: hidden until Act 1 docks investigation
- smuggler-warehouse: hidden until Act 1 undercity exploration
- the-narrows: hidden until Act 2 masquerade
- ancient-temple: hidden until Act 3

## Map Editor Changes

### Exploration Map Editor (new)
1. Upload background image (required)
2. Click on image to place numbered POI markers
3. Each marker opens a form: name, description, actNumbers, locationTags, isHidden
4. Drag markers to reposition (stores x,y as percentage)
5. Each POI links to a combat map (create new or select existing)

### Combat Map Editor (updated)
- Same as current: upload image, paint collision tiles, paint regions
- Added fields: `parentMapId` and `poiId` for linking
- Region painting retained for terrain features

## Frontend Rendering

### Exploration View (new)
- Full-width background image
- Numbered circle markers at each visible (non-hidden) POI position
- Hover/tap shows POI name
- Click or "go to N" in chat → DM agent narrates the area
- No grid, no tokens, no movement — pure narrative

### Combat View (unchanged)
- 20x20 grid with tileData, regions, NPC tokens
- Triggered when combat starts at a POI
- Returns to exploration view when combat ends

### Transitions
- `currentExplorationMapId` determines which exploration map to show
- `currentPOIId` tracks which POI the party is at
- When DM starts encounter → load POI's combat map → grid view
- When encounter ends → clear encounter → back to exploration view
- Act change → update `currentExplorationMapId` from act's `explorationMapSpecId`

## Generation Pipeline Changes

### Exploration Map Generation
1. Stability AI generates a zoomed-out city/region image from `imageDescription`
2. POI positions can be pre-set in the spec or placed manually in the editor
3. Save to `campaignMaps/{campaignSlug}_{explorationMapSpecId}`

### Combat Map Generation (mostly unchanged)
1. Same pipeline: Stability AI image → Claude Vision analysis, or text-to-grid fallback
2. Each combat map saved with `parentMapId` and `poiId` references
3. Save to `campaignMaps/{campaignSlug}_{combatMapSpecId}`

### `instantiateCampaignMaps` Changes
1. Copy exploration map templates into session
2. Copy all combat map templates into session
3. Set `currentExplorationMapId` to the Act 1 exploration map

## DM Agent Context Changes

Replace `buildMapContext()` (which provided region-based context) with:
- Current exploration map name
- Full POI list with current POI highlighted
- Current POI description + locationTags
- Hidden POIs visible to DM but marked as such
- DM can reveal hidden POIs via `update_game_state`

## Testing Strategy

### Unit Tests
1. Type validation — discriminated union type narrowing (exploration vs combat)
2. POI management — add/remove/update POIs, hidden/revealed toggling
3. Map hierarchy — combat map correctly links to parent exploration map + POI
4. Campaign spec migration — restructured Crimson Accord produces correct data
5. `instantiateCampaignMaps` — creates both exploration and combat maps in session

### Integration Tests
6. Map API CRUD — create/read/update both map types with correct references
7. Game state transitions — `currentExplorationMapId` + `currentPOIId` update correctly
8. Act advancement — switching acts updates the active exploration map
9. Hidden POI reveal — POIs transition from hidden to visible and persist

### Component Tests
10. Exploration map renderer — image + numbered markers, hides hidden POIs, handles click
11. Map editor — POI click-to-place, drag reposition, form editing
12. Combat ↔ exploration transitions — view switches correctly between modes

## Files Affected

| File | Change |
|------|--------|
| `src/app/lib/gameTypes.ts` | New types: PointOfInterest, ExplorationMapDocument, CombatMapDocument, CampaignExplorationMapSpec, CampaignPOISpec, CampaignCombatMapSpec. Rename/restructure MapDocument as discriminated union. |
| `src/app/lib/mapStore.ts` | Update CRUD for new map types, update instantiation logic |
| `src/app/lib/gameState.ts` | `currentExplorationMapId`, `currentPOIId`, update `buildMapContext` |
| `src/app/api/maps/route.ts` | Handle exploration + combat map CRUD, POI management |
| `src/app/map-editor/page.tsx` | New exploration map editor mode, update combat map editor |
| `src/app/components/MapEditor.tsx` | Support exploration map POI placement mode |
| `src/app/components/CombatGrid.tsx` | Only render in combat mode (no changes to grid itself) |
| `src/app/components/ExplorationMap.tsx` | **New** — renders exploration map with POI markers |
| `src/app/dashboard/page.tsx` | Switch between ExplorationMap and CombatGrid based on game state |
| `src/app/hooks/useChat.tsx` | Handle `currentExplorationMapId`, `currentPOIId` state |
| `src/app/agents/dmAgent.ts` | Update context building to use POI-based map info |
| `scripts/campaigns/the-crimson-accord.ts` | Restructure into 1 exploration spec + 8 combat specs |
| `scripts/campaigns/index.ts` | Update CampaignData type for new spec structure |
| `scripts/generateCampaignMaps.ts` | Generate exploration + combat maps in two phases |
| `scripts/lib/stabilityImageAgent.ts` | Support exploration map image generation |
| `scripts/lib/mapGenerationAgent.ts` | Update for combat-only generation |
| `src/app/agents/mapAnalysisAgent.ts` | Update for combat map analysis only |
