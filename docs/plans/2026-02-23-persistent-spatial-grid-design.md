# Persistent Spatial Grid — Design Document

## Context

The app currently has two completely separate modes: a chat-only view for exploration and a canvas-based combat grid for encounters. The chat view has zero spatial awareness — `currentLocation` is a freeform string like "The Rusty Flagon". The combat grid is well-built (canvas rendering, token drag-to-move, Firestore persistence, AOE overlays) but only activates during combat.

**Problem**: Players have no visual spatial awareness during exploration. The DM narrates locations as prose text with no structured understanding of where characters are relative to each other or the environment. When combat starts, tokens teleport to a separate grid with no continuity.

**Goal**: Make the combat grid layout (grid + chat sidebar) the default view at all times. During exploration, players see a map with their tokens, drag to move freely, and the DM narrates in the chat sidebar based on spatial context. When combat starts, the same grid seamlessly adds combat overlays (initiative, turn-based movement, AOE). Maps support two scales — detailed tile maps for cities/dungeons and zone maps for overworld — both on a 20x20 grid.

**Map authoring workflow**: User uploads map art externally (Photoshop, Procreate, Inkarnate, AI generators, etc.) → uploads to the app → AI vision agent analyzes image and pre-populates collision + region data → user reviews/corrects in map editor → saves template.

---

## Data Model

### New Types (`src/app/lib/gameTypes.ts`)

```typescript
// Semantic region painted on a map — tells the DM what's at each location
export interface MapRegion {
  id: string;                    // "region_tavern_main"
  name: string;                  // "The Rusty Flagon — Common Room"
  type: RegionType;              // tavern, shop, temple, danger, etc.
  bounds: {                      // Bounding box (inclusive cell range)
    minRow: number;
    maxRow: number;
    minCol: number;
    maxCol: number;
  };
  dmNote?: string;               // "Barkeep Mira behind counter. Patrons are tense."
  defaultNPCSlugs?: string[];    // ["guard", "commoner"] — NPCs placed here by default
  shopInventory?: string[];      // for type="shop" — items the DM can reference
}

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

// Full map document — stored in Firestore `maps/{id}`
export interface MapDocument {
  id?: string;
  sessionId: string;
  name: string;                  // "The Rusty Flagon"
  backgroundImageUrl?: string;   // user-uploaded image (Firebase Storage)
  gridSize: number;              // always 20
  feetPerSquare: number;         // 5 for detailed, 50-100 for zone
  regions: MapRegion[];
  tileData?: number[];           // flat array [gridSize*gridSize]: 0=floor, 1=wall, 2=door. Omitted for zone maps.
  createdAt?: number;
  updatedAt?: number;
}
```

### Schema Changes to Existing Types

- `StoredSession` gains `activeMapId?: string` — which map is currently displayed
- `StoredEncounter` gains `mapId?: string` — combat inherits the active map

### Why Bounding Boxes for Regions

A cell list for a 20x20 region could be 400 entries. A bounding box is 4 numbers and covers the 95% case where regions are rectangular. Non-rectangular shapes can be approximated with multiple overlapping regions or handled via `dmNote` ("the L-shaped room wraps around the corner").

---

## DM Spatial Context Injection

### `serializeRegionContext()` (new function in `src/app/lib/gameState.ts`)

Only serializes regions where players currently stand. Cost: ~30-60 tokens per player.

```
Spatial context:
  Aldric [row=12,col=8] → The Rusty Flagon — Common Room (tavern)
    Note: Barkeep Mira is behind the counter. Patrons are tense.
  Seraphine [row=5,col=3] → Back Alley (danger)
    Note: Broken crates, good for ambush cover.
```

**Injection point**: In `dmAgent.ts`, inserted into `userContent` between campaign state and character state. No new DM tools or system prompt changes needed — the spatial context is just facts in the user turn that the DM naturally incorporates.

**What the DM does with it**: If a player is in a `shop` region with `shopInventory`, the DM describes those goods. If `danger` with a trap note, the DM hints at tension. For multiplayer, two players in different regions automatically get distinct spatial descriptions from the same DM call.

**The DM agent receives NO changes to its system prompt or tools.** Spatial context is purely additive facts in the request.

---

## Map Analysis Agent (new: `src/app/agents/mapAnalysisAgent.ts`)

One-shot Claude Sonnet vision call per map upload:

- **Input**: Map image (base64 or URL)
- **Output**: Structured JSON with `tileData` (collision grid) + `regions[]` (annotated areas)
- **Prompt instructs**: Identify walls vs floors vs doors on a 20x20 grid overlay. Identify distinct rooms/areas and categorize by type. Output structured JSON matching `MapDocument` schema. Flag uncertainty.

**Cost**: ~$0.01-0.05 per map. Maps are authored rarely (not per-turn), so negligible.

The AI output pre-populates the map editor. The user reviews, corrects mistakes, adds DM notes, and saves. This replaces most manual painting with a review step.

---

## Unified Grid Component

### Generalizing `CombatGrid.tsx` → `GameGrid`

The existing `CombatGrid` canvas component becomes the base for a unified `GameGrid` with a `mode` prop:

**Always rendered** (replaces the `inCombat ? grid : chat` switch):
- Background image from `MapDocument.backgroundImageUrl`
- Tile grid overlay
- Region overlays (semi-transparent, color-coded by type)
- Player tokens (draggable)
- NPC tokens (placed by DM/system)

**Combat-only overlays** (`mode="combat"`):
- Initiative tracker
- Turn-based movement restrictions (speed limits)
- AOE indicators, range overlays
- Attack targeting mode
- Floating HIT/MISS labels

**Exploration-only behavior** (`mode="exploration"`):
- Free-drag movement with basic tile collision (walls block, everything else allows)
- No turn order, no speed limits
- Player moving to a new region updates DM context on next chat message

### Position Persistence

Exploration positions need Firestore persistence (new field on session or a lightweight positions doc). When combat starts, positions carry over — no teleporting to a separate grid.

---

## Map Editor (`src/app/map-editor/page.tsx`)

New page with four modes:

1. **Image upload**: Upload background art, set `feetPerSquare` (grid is always 20x20)
2. **AI Analysis**: Send image to Map Analysis Agent → pre-populate tile data + regions
3. **Collision paint mode**: Click cells to toggle wall/floor/door (review/correct AI output)
4. **Region paint mode**: Click+drag rectangles → fill in form (name, type, DM note, NPCs, inventory)

Region overlays are color-coded: amber=tavern, red=danger, green=shop, blue=safe, etc.

Canvas rendering reuses patterns from existing `CombatGrid.tsx`.

---

## Map Store (`src/app/lib/mapStore.ts`)

New Firestore CRUD module mirroring `encounterStore.ts`:
- `createMap(sessionId, data)` → save to `maps/{id}`
- `loadMap(mapId)` → hydrate map document
- `updateMap(mapId, changes)` → partial update
- `loadSessionMaps(sessionId)` → list all maps for a session

---

## NPC Placement via Regions

Update `encounterStore.ts`: when creating an encounter on a map with regions, place NPCs inside their matching region bounds (by `defaultNPCSlugs`) instead of at grid edges. Falls back to edge placement if region is full.

---

## Dual-Scale Maps

Same data model, same 20x20 grid, different `feetPerSquare`:

| | Detailed (dungeon/city) | Zone (overworld) |
|---|---|---|
| `gridSize` | 20 | 20 |
| `feetPerSquare` | 5 | 50-100 |
| `tileData` | Full collision grid | Omitted (all walkable) |
| `regions` | Fine-grained (kitchen vs common room) | Coarse (merchant district vs temple quarter) |
| Movement | Per-cell drag with collision | Per-cell drag, no collision |

Both scales use the same 20x20 grid — the difference is purely what each square represents.

---

## Dashboard Layout Change (`src/app/dashboard/page.tsx`)

The current layout:
```
inCombat ? <CombatGrid .../> : <ChatInterface .../>
```

Becomes:
```
<GameGrid ... mode={inCombat ? "combat" : "exploration"} />
<ChatSidebar ... />  // always visible alongside grid
```

The chat sidebar is always visible, matching the current combat layout.

---

## Seamless Combat Transition

**When combat starts:**
1. Encounter created with `mapId` referencing the active map
2. Existing exploration positions become initial combat positions (no recompute)
3. `GameGrid` switches from `mode="exploration"` to `mode="combat"` — same canvas, overlays change
4. Initiative tracker appears, movement becomes turn-based

**When combat ends:**
1. Surviving NPC tokens can stay on map or be removed
2. `GameGrid` switches back to `mode="exploration"`
3. Positions persist as-is

---

## Implementation Order

1. **Types + data model**: Add `MapRegion`, `RegionType`, `MapDocument` to `gameTypes.ts`. Extend `StoredSession` and `StoredEncounter`.
2. **Map store**: Create `mapStore.ts` with Firestore CRUD (mirrors `encounterStore.ts`).
3. **Map Analysis Agent**: Build `mapAnalysisAgent.ts` — vision-based map analyzer.
4. **Map Editor UI**: Build `/map-editor` page with upload, AI analysis, collision paint, region paint.
5. **`serializeRegionContext()`**: Add spatial context serialization to `gameState.ts`.
6. **DM integration**: Inject spatial context into `dmAgent.ts` `userContent` (~5 lines).
7. **Unified GameGrid**: Generalize `CombatGrid` into `GameGrid` with exploration + combat modes.
8. **Dashboard layout**: Replace `inCombat` switch with always-visible grid + chat sidebar.
9. **Exploration positions**: Add Firestore persistence for exploration-mode positions.
10. **NPC region placement**: Update `encounterStore.ts` for region-aware NPC placement.
11. **Seamless combat transition**: Wire up exploration → combat position handoff.
12. **Zone maps**: Add zone-scale support (larger `feetPerSquare`, no collision data).

---

## Critical Files to Modify

| File | Changes |
|---|---|
| `src/app/lib/gameTypes.ts` | Add `MapRegion`, `RegionType`, `MapDocument`; extend `StoredSession`, `StoredEncounter` |
| `src/app/lib/gameState.ts` | Add `serializeRegionContext()`; extend `loadGameState()` for map hydration |
| `src/app/agents/dmAgent.ts` | Inject spatial context into `userContent` (~5 lines) |
| `src/app/components/CombatGrid.tsx` | Generalize into `GameGrid` with exploration/combat modes |
| `src/app/dashboard/page.tsx` | Replace `inCombat` layout switch with always-visible grid + sidebar |
| `src/app/lib/encounterStore.ts` | Region-aware NPC placement in `createEncounter` |

## New Files

| File | Purpose |
|---|---|
| `src/app/lib/mapStore.ts` | Firestore CRUD for map documents |
| `src/app/agents/mapAnalysisAgent.ts` | Vision-based map analysis agent |
| `src/app/map-editor/page.tsx` | Map editor page |
| `src/app/components/MapEditor.tsx` | Map editor canvas component |

---

## Verification

1. **Map editor**: Upload image → run AI analysis → verify collision + regions pre-populated → manually correct → save → verify Firestore document structure
2. **Exploration grid**: Load session with active map → verify grid renders with background + regions → drag token → verify position persists to Firestore → verify DM receives spatial context in next message
3. **DM spatial awareness**: Move token to tavern region → send "look around" → verify DM narrates tavern-appropriate content referencing region's DM note
4. **Combat transition**: Start combat on active map → verify tokens stay in place → verify combat overlays appear → end combat → verify return to exploration mode with positions preserved
5. **Zone maps**: Create zone-scale map (feetPerSquare=100) → verify no collision enforcement → verify regions work at coarse scale
6. **Type check**: `npx tsc --noEmit`
7. **Build**: `npm run build`
