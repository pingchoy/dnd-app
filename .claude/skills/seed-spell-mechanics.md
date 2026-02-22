---
name: seed-spell-mechanics
description: Populate SPELL_OVERRIDES in srdOverrides.ts with AOE, upcast scaling, and cantrip scaling data for D&D 5e SRD spells. Fetches spell list from Open5e v2 API. Usage: /seed-spell-mechanics [spell-slug]
---

# Seed Spell Mechanics

## Arguments
- Optional: a spell slug (e.g., `fireball`, `eldritch-blast`, `cure-wounds`)
- If no argument provided, iterate ALL spells from the API, skipping any already in `SPELL_OVERRIDES`

## Steps

### 1. Fetch spell list from Open5e v2 API

```bash
curl -s "https://api.open5e.com/v2/spells/?document__key=srd-2014&limit=100&format=json"
```

Paginate with `&page=2`, `&page=3` etc. if `next` is non-null in the response (there are ~300 SRD spells).

If a specific spell was requested, filter to that slug.

### 2. Read existing overrides

Read `scripts/srdOverrides.ts` and identify which spell slugs already have entries in `SPELL_OVERRIDES`. In batch mode, skip these.

### 3. Generate override entries

For each spell, produce a `SpellMechanicsOverride` object:

```typescript
interface SpellMechanicsOverride {
  aoe?: AOEData;
  upcastScaling?: Record<string, SpellScalingEntry>;
  cantripScaling?: Record<string, SpellScalingEntry>;
}
```

**Only include an entry if the spell has at least one of: AOE, upcast scaling, or cantrip scaling.** Spells with none of these (e.g., single-target with no scaling like Shield) do NOT need an entry.

**AOE rules (`aoe`):**
```typescript
interface AOEData {
  shape: "cone" | "sphere" | "cube" | "line" | "cylinder";
  size: number;       // radius (sphere/cylinder/cube) or length (cone/line) in feet
  width?: number;     // for line spells only (default 5)
  origin: "self" | "target";  // "self" = from caster, "target" = placed at a point
}
```
- Only for spells that affect an area (not single-target spells)
- "cube" = D&D's "square" areas (Entangle's "20-foot square" = cube size 20)
- "cylinder" = columns/pillars (Moonbeam, Ice Storm)
- Origin "self" for spells emanating from the caster (Thunderwave, Burning Hands, Spirit Guardians)

**Upcast scaling rules (`upcastScaling`):**
```typescript
// Key = slot level as string, value = what changes at that level
upcastScaling: {
  "4": { damageRoll: "9d6" },   // Fireball at 4th level
  "5": { damageRoll: "10d6" },  // Fireball at 5th level
  // ... only include levels where values change
}
```
- Only for leveled spells (level 1+) that improve when cast at a higher slot
- Common patterns:
  - "+1dX per slot level above base" (Fireball: 8d6 -> 9d6 -> 10d6...)
  - "+1 target per slot level" (Magic Missile: 3 -> 4 -> 5...)
  - "increases healing/duration/etc" (Cure Wounds: 1d8 -> 2d8...)
- Include entries from (base level + 1) up to slot level 9
- Use `damageRoll` for damage/healing dice changes, `targetCount` for extra targets

**Cantrip scaling rules (`cantripScaling`):**
```typescript
// Key = character level as string
cantripScaling: {
  "5":  { damageRoll: "2d10" },   // Fire Bolt at level 5
  "11": { damageRoll: "3d10" },   // Fire Bolt at level 11
  "17": { damageRoll: "4d10" },   // Fire Bolt at level 17
}
```
- Only for cantrips (level 0) that scale with character level
- Standard breakpoints: levels 5, 11, 17
- Use `damageRoll` for damage cantrips, `targetCount` for beam cantrips (Eldritch Blast: 2/3/4 beams)

### 4. Write to srdOverrides.ts

Insert new entries into `SPELL_OVERRIDES` in `scripts/srdOverrides.ts`, matching existing code style:
- Organize by spell level: `// -- Cantrips --`, `// -- 1st Level --`, etc.
- Align entries with padding for readability (match existing AOE entry alignment style)
- Inline comments for non-obvious choices

### 5. Type-check

```bash
npx tsc --noEmit
```

Fix any type errors before finishing.
