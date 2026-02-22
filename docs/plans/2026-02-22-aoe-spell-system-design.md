# AOE Spell System — Implementation Plan

## Context

The combat system currently only supports single-target abilities. AOE spells (Burning Hands, Fireball, Thunderwave, Lightning Bolt, etc.) are core D&D 5e mechanics that need proper grid-based targeting with visual feedback. The codebase already has **unused AOE geometry functions** in `combatEnforcement.ts` (`getAOECells`, `getAOETargets`, `AOEShape`) that we'll wire up.

**User decisions:**
- Visual shape preview on the grid (cones rotate around player, spheres follow cursor)
- Deterministic per-target saves (each NPC rolls individually)
- Parse AOE data from SRD range strings (e.g. `"Self (15-foot cone)"`)

---

## Step 1: Data Model — Add AOE fields to Ability interface

**File: `src/app/lib/gameTypes.ts`**

Add `AOEData` interface and `aoe?` field to `Ability`:

```typescript
export interface AOEData {
  shape: "cone" | "sphere" | "cube" | "line" | "cylinder";
  size: number;       // radius (sphere/cylinder/cube) or length (cone/line) in feet
  width?: number;     // for line spells only, in feet (default 5)
}

export interface Ability {
  // ... existing fields ...
  aoe?: AOEData;      // present for AOE spells, absent for single-target
}
```

An AOE spell with `aoe` set and `range.type === "self"` means the shape originates from the caster (Burning Hands, Thunderwave). An AOE spell with `aoe` set and `range.type === "ranged"` means the player picks a point within range (Fireball). `requiresTarget` stays `false` for self-origin AOEs (no single NPC target needed) but we add a new check: if `aoe` is set, enter AOE targeting mode instead.

---

## Step 2: Parse AOE from SRD Range Strings

**File: `src/app/lib/combatEnforcement.ts`**

Add `parseAOEFromRange(rangeStr: string): AOEData | null` function. SRD range strings follow patterns:
- `"Self (15-foot cone)"` → `{ shape: "cone", size: 15 }`
- `"Self (20-foot-radius sphere)"` → `{ shape: "sphere", size: 20 }`
- `"Self (15-foot cube)"` → `{ shape: "cube", size: 15 }`
- `"Self (100-foot line)"` → `{ shape: "line", size: 100, width: 5 }`
- `"Self (10-foot-radius sphere)"` → `{ shape: "sphere", size: 10 }`

Regex: `/(\d+)-foot(?:-radius)?\s+(cone|sphere|cube|line|cylinder)/i`

For ranged AOE spells like Fireball (`range: "150 feet"`, description mentions "20-foot-radius sphere"), we also need `parseAOEFromDescription(description: string): AOEData | null` as a fallback, scanning for the same pattern in the spell description text.

Update `parseSpellRange()` to also return AOE data, or export `parseAOEFromRange` separately and call it alongside.

**File: `src/app/hooks/useCharacterCreation.ts`**

Where cantrip and spell abilities are built (lines ~609-674), call `parseAOEFromRange(spell.range)` and if null, call `parseAOEFromDescription(spell.description)`. Attach result as `aoe` field on the Ability object.

Also update `requiresTarget` logic: AOE spells should have `requiresTarget: false` (they don't target a single NPC), but the dashboard will check for `aoe` to enter AOE targeting mode.

---

## Step 3: Export Existing AOE Geometry Functions

**File: `src/app/lib/combatEnforcement.ts`**

The `AOEShape`, `getAOECells`, and `getAOETargets` functions already exist (lines 234-329) but are **not exported**. Export them:

```typescript
export type AOEShape = ...;
export function getAOECells(...): GridPosition[] { ... }
export function getAOETargets(...): string[] { ... }
```

---

## Step 4: Multi-Target Combat Resolution

**File: `src/app/lib/combatResolver.ts`**

Add `resolveAOEAction()` function:

```typescript
export interface AOETargetResult {
  npcId: string;
  npcName: string;
  saved: boolean;
  saveRoll: number;
  saveTotal: number;
  damageTaken: number;
}

export interface AOEResult {
  checkType: string;           // "Fireball (DEX save)"
  spellDC: number;
  damageRoll: string;          // "8d6"
  totalRolled: number;         // 28 (rolled once, shared across all targets)
  damageType: string;
  targets: AOETargetResult[];
  affectedCells: GridPosition[];
}
```

Logic:
1. Roll damage once (e.g. `rollDice("8d6")` → 28)
2. Compute spell DC: `8 + abilityMod + profBonus`
3. For each target NPC in the AOE:
   - Roll `d20 + npc.savingThrowBonus` vs spell DC
   - If save fails: full damage
   - If save succeeds: half damage (`Math.floor(totalRolled / 2)`)
4. Return `AOEResult` with per-target breakdown

**File: `src/app/lib/combatResolver.ts`**

Update `resolvePlayerAction()` to detect AOE abilities (check `ability.aoe`) and route to `resolveAOEAction()` instead of single-target resolvers.

---

## Step 5: Combat Action Route — Multi-Target Support

**File: `src/app/api/combat/action/route.ts`**

Update `CombatActionBody` to support AOE:

```typescript
interface CombatActionBody {
  characterId: string;
  abilityId: string;
  targetId?: string;           // single-target (existing)
  aoeOrigin?: GridPosition;    // for ranged AOEs: center point chosen by player
  aoeDirection?: GridPosition; // for cone/line: cursor position indicating direction
}
```

New flow when ability has `aoe`:
1. Build `AOEShape` from `ability.aoe` + `aoeOrigin`/`aoeDirection` + player position
2. Call `getAOETargets()` to find all NPCs in the area
3. Call `resolveAOEAction()` with the target list
4. Apply HP delta to each affected NPC via `updateNPC()`
5. Accumulate combat stats (multi-target kills, damage dealt)
6. Write AOE result to messages subcollection
7. Return `{ aoeResult, gameState, encounter }`

---

## Step 6: Grid — AOE Shape Preview Rendering

**File: `src/app/components/CombatGrid.tsx`**

### New Props
```typescript
interface Props {
  // ... existing ...
  aoePreview?: {                    // set when in AOE targeting mode
    shape: AOEData;
    originType: "self" | "ranged";  // self = anchored to player, ranged = follows cursor
    rangeFeet?: number;             // for ranged: max placement distance
  };
  onAOEConfirm?: (origin: GridPosition, direction?: GridPosition) => void;
}
```

### AOE Targeting State (inside component)
- Track `aoeHoverCell: GridPosition | null` — the grid cell the cursor is over
- When `aoePreview` is set:
  - **Self-origin cone/line**: Build `AOEShape` with origin = player position, direction = hover cell. Call `getAOECells()` to get affected cells. Render as semi-transparent overlay (e.g. orange/red at 20% opacity).
  - **Self-origin sphere/cube**: Build shape with origin = player position. Show immediately (no cursor tracking needed). Click to confirm.
  - **Ranged sphere/cube**: Build shape with origin = hover cell (clamped to within range of player). Show circle following cursor. Click to confirm placement.
  - **Ranged cone/line**: Build shape with origin = hover cell, direction based on secondary cursor position. (Stretch goal — start with ranged sphere which is most common.)

### Rendering in the RAF loop
Insert a new drawing phase between the range overlay (step 2) and tokens (step 3):
1. Compute `aoeCells = getAOECells(currentShape, gridSize)` based on hover position
2. Draw semi-transparent fill on each affected cell (e.g. `rgba(239, 68, 68, 0.2)` — red tint)
3. Highlight NPCs within the area with a pulsing red ring (reuse existing pulsing ring logic from single-target mode)
4. Show count badge: "3 targets" near the cursor

### Click to confirm
- Left-click while AOE preview is active → call `onAOEConfirm(origin, direction)`
- Right-click / Escape → cancel (existing `onCancel` handler)

---

## Step 7: Dashboard — AOE Targeting Flow

**File: `src/app/dashboard/page.tsx`**

Update `handleSelectAbility`:
```
if ability.aoe is set:
  → enter AOE targeting mode (set aoePreview state)
  → pass aoePreview + onAOEConfirm to CombatGrid
else if ability.requiresTarget:
  → existing single-target mode
else:
  → execute immediately
```

Add `handleAOEConfirm(origin, direction?)`:
1. Call `executeCombatAction(ability, undefined, { aoeOrigin: origin, aoeDirection: direction })`
2. Clear AOE targeting state

Update `executeCombatAction` in `useCombat.ts` to accept optional AOE params and include them in the POST body to `/api/combat/action`.

---

## Step 8: Combat Results UI — Multi-Target Feedback

### Floating Labels on Grid
**File: `src/app/components/CombatGrid.tsx`**

`showCombatResult` already accepts `(tokenId, hit, damage)`. For AOE results, call it once per affected NPC. The existing system already filters by tokenId, so multiple labels will display simultaneously on different tokens.

### Combat Chat / Roll Result Display
**File: `src/app/components/CombatChatPanel.tsx`** (or wherever roll results render)

Add an AOE result card that shows:
- Spell name + total damage rolled
- Per-target breakdown (NPC name, save result, damage taken)
- Visual indicators for saves passed/failed

---

## Files Modified (Summary)

| File | Changes |
|------|---------|
| `src/app/lib/gameTypes.ts` | Add `AOEData` interface, `aoe?` field on `Ability` |
| `src/app/lib/combatEnforcement.ts` | Export `AOEShape`, `getAOECells`, `getAOETargets`; add `parseAOEFromRange()`, `parseAOEFromDescription()` |
| `src/app/lib/combatResolver.ts` | Add `resolveAOEAction()`, `AOEResult`, `AOETargetResult`; update `resolvePlayerAction()` routing |
| `src/app/api/combat/action/route.ts` | Add `aoeOrigin`/`aoeDirection` to request body; multi-target damage loop; AOE combat stats |
| `src/app/hooks/useCharacterCreation.ts` | Parse AOE data when building spell abilities; attach `aoe` field |
| `src/app/components/CombatGrid.tsx` | AOE preview rendering, hover tracking, `onAOEConfirm` callback, multi-label support |
| `src/app/dashboard/page.tsx` | AOE targeting state, `handleAOEConfirm`, route to AOE mode on spell select |
| `src/app/hooks/useCombat.ts` | Pass AOE params through `executeCombatAction` to API |

## Existing Code to Reuse

- **`getAOECells()` / `getAOETargets()`** — `combatEnforcement.ts:243-329` (just need to export)
- **`cellsInRange()`** — `combatEnforcement.ts:31-46` (range overlay for ranged AOE placement)
- **`resolveSpellSave()`** — `combatResolver.ts:267-337` (adapt per-target save logic from here)
- **`rollDice()`** — `gameTypes.ts` (roll AOE damage)
- **Pulsing ring rendering** — `CombatGrid.tsx:569-601` (reuse for AOE-highlighted NPCs)
- **`showCombatResult()`** — `CombatGrid.tsx:291-302` (call per-target for floating labels)
- **`parseSpellRange()`** — `combatEnforcement.ts:116-140` (extend or complement with AOE parser)

---

## Implementation Order

1. **Types first** — `AOEData` in gameTypes.ts, export existing geometry functions
2. **Parser** — `parseAOEFromRange()` + `parseAOEFromDescription()` in combatEnforcement.ts
3. **Character creation** — Wire parser into spell ability building
4. **Combat resolver** — `resolveAOEAction()` + routing update
5. **API route** — Multi-target request body + resolution + persistence
6. **Grid preview** — AOE shape rendering on canvas, hover tracking, confirm/cancel
7. **Dashboard wiring** — AOE targeting state machine, connect grid to combat action
8. **Result display** — Multi-target floating labels + AOE result card in chat

---

## Verification

1. **Unit test AOE parser**: Pass SRD range strings through `parseAOEFromRange()` and verify correct shape/size extraction for cone, sphere, cube, line patterns
2. **Create a test character** with Burning Hands (self cone) and/or Thunderwave (self cube) via character creation — verify `aoe` field is set on the ability
3. **Enter combat** with multiple NPCs positioned near each other
4. **Select AOE spell** from hotbar — verify grid enters AOE targeting mode with shape preview following cursor
5. **Confirm AOE** — verify all NPCs in area receive individual save rolls, damage is applied correctly (full on fail, half on success)
6. **Check floating labels** — each affected NPC should show their damage number
7. **Check combat stats** — kills, damage dealt, spells cast should all accumulate correctly
8. **Test edge cases**: AOE hitting zero enemies (still deducts spell slot), AOE killing multiple NPCs at once, cone rotation at all 8+ directions
