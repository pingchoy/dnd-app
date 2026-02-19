# Archetype Selection — Design

Date: 2026-02-19

## Summary

Add subclass/archetype support to character creation. Seed archetype data from the Open5e API into Firestore, and add a conditional archetype picker step in the wizard for classes that choose at level 1 (Cleric, Sorcerer, Warlock).

---

## Data Layer

### `SRDClass` — two new fields

```ts
archetypes: { slug: string; name: string; description: string }[]
archetypeLevel: number  // level at which the player chooses their archetype
```

Populated in `seedFirestore.ts` → `transformClass`:
- `archetypes`: mapped from Open5e `c.archetypes` array (name, slug, desc)
- `archetypeLevel`: auto-detected by scanning the parsed class level table for the first level where a feature name is a case-insensitive substring of `c.subtypes_name` (e.g. `"divine domain"` ⊂ `"divine domains"`). Defaults to `3` if no match.

No new Firestore collection — archetypes are embedded in the `srdClasses/{slug}` doc. The existing `/api/srd?type=classes` endpoint returns them automatically.

### `PlayerState` — one new field

```ts
subclass?: string  // e.g. "Path of the Berserker", set at character creation for level-1 classes
```

---

## Hook (`useCharacterCreation`)

### New state fields

```ts
selectedArchetype: SRDArchetype | null
showingArchetypeStep: boolean
```

### Behaviour changes

- **`selectClass(cls)`** — if `cls.archetypeLevel === 1`, set `showingArchetypeStep: true`, stay on step 2. Otherwise advance to step 3 as today.
- **`selectArchetype(arch)` (new)** — store archetype, clear `showingArchetypeStep`, advance to step 3.
- **`confirm()`** — if archetype selected: add archetype to `features` list (`level: 1`, `source: "${class} 1"`), set `player.subclass = archetype.name`.

---

## UI

### New component: `StepArchetype`

Card grid matching the style of `StepClass`/`StepRace`. Displays each archetype as a selectable card showing name and description excerpt. Selecting a card calls `selectArchetype`.

### `page.tsx` changes

- When `step === 2 && showingArchetypeStep`: render `<StepArchetype>` instead of `<StepClass>`
- Step indicator: unchanged — still 5 steps, step 2 labelled "Class"
- Back button on `showingArchetypeStep`: calls `selectClass` reset (clears archetype step, shows class grid again)

---

## Approach: Sub-step within Class (Option A)

`WizardStep` type is unchanged (`1|2|3|4|5`). The archetype picker is an internal second screen on step 2, not a new step number. This requires zero renumbering of existing navigation logic.

---

## Files Changed

| File | Change |
|------|--------|
| `scripts/seedFirestore.ts` | `transformClass` adds `archetypes` + `archetypeLevel` |
| `src/app/lib/characterStore.ts` | `SRDClass` type gets `archetypes` + `archetypeLevel` |
| `src/app/lib/gameState.ts` | `PlayerState` gets `subclass?: string` |
| `src/app/hooks/useCharacterCreation.ts` | New state fields + `selectArchetype` action |
| `src/app/character-creation/StepArchetype.tsx` | New component |
| `src/app/character-creation/page.tsx` | Conditional render of `StepArchetype` on step 2 |
