# Token Pictures in Combat Map

## Problem
Combat tokens currently show two-letter initials (e.g. "GO" for Goblin, "TG" for Theron Greysteel). This is functional but visually flat. Portrait-style token images would make combat more immersive.

## Design

### Token Image Resolution
1. **NPCs** — slugify `NPC.name` (e.g. "Dire Wolf" → `dire-wolf`) and look up `/tokens/monsters/<slug>.webp`
2. **Player characters** — slugify `PlayerState.race` (e.g. "half-elf" → `half-elf`) and look up `/tokens/races/<slug>.webp`
3. **Fallback** — if no image file exists, fall back to the existing two-letter initials rendering

### Directory Structure
```
public/tokens/
  monsters/    # goblin.webp, skeleton.webp, dire-wolf.webp, ...
  races/       # human.webp, elf.webp, dwarf.webp, halfling.webp, ...
```

Image requirements:
- Square aspect ratio (will be circle-clipped)
- Minimum 128×128px recommended
- WebP format preferred (smaller files, broad browser support)
- PNG also supported as fallback

### Grid Resolution Increase
- Bump `gridDim` from 1000px → 1400px
- Cell size increases from ~49px to ~69px per cell
- Combined with existing device pixel ratio scaling, images render crisply on retina displays

### Token Image Module (`src/app/lib/tokenImages.ts`)
- `slugify(name)` — lowercase, replace spaces/special chars with hyphens
- `getTokenImagePath(name, type: 'monster' | 'race')` → `/tokens/monsters/goblin.webp`
- `TOKEN_MANIFEST` — exported list of expected token names for reference

### Canvas Rendering Changes (`CombatGrid.tsx`)
- **Image preloading**: On mount, preload all needed token images into an `Map<string, HTMLImageElement>` cache
- **`drawToken()` modification**: If a preloaded image exists and has loaded successfully:
  1. Draw the disposition-colored circle as a border ring (slightly larger than before)
  2. Clip a circle and `drawImage()` the portrait inside
  3. All overlays (HP bar, death skull, pulse glow, targeting ring) render on top unchanged
- If no image loaded, existing initials rendering is used unchanged

### What Stays the Same
- All combat mechanics, targeting, range visualization
- Disposition color rings around tokens
- Player pulse glow animation
- HP bars, death skull overlay
- Floating damage labels
- Zoom/pan/drag interactions
- No data model changes — images derived from existing `NPC.name` and `PlayerState.race`

## Files to Create/Modify
| File | Action |
|------|--------|
| `src/app/lib/tokenImages.ts` | **Create** — slugify, path resolution, manifest |
| `src/app/components/CombatGrid.tsx` | **Modify** — image preloading, drawToken with image support, gridDim bump |
| `public/tokens/monsters/` | **Create** — directory for monster token images |
| `public/tokens/races/` | **Create** — directory for race token images |
| `public/tokens/README.md` | **Create** — instructions for adding token images |
