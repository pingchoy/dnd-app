# SRD Seeding Skills — Design Doc

**Date:** 2026-02-22

## Purpose

Create four Claude Code skills (slash commands) that automate populating `scripts/srdOverrides.ts` with structured mechanical data for D&D 5e SRD content. Each skill fetches item lists from the Open5e v2 API, uses Claude's D&D 5e knowledge to generate structured TypeScript override entries, and writes them into the correct export map.

## Problem

Mechanical ability data (damage dice, scaling, AOE, save DCs, gameplayEffects) must be hardcoded in config rather than regex-parsed from descriptions (per CLAUDE.md). Manually writing hundreds of override entries is tedious and error-prone. These skills automate the bulk of that work.

## Shared Skill Behavior

All four skills follow the same pattern:

1. **Fetch from Open5e v2 API** — `curl https://api.open5e.com/v2/<endpoint>?document__key=srd-2014&limit=100` (paginate if needed) to get the full item list with names, slugs, and descriptions.
2. **Read `scripts/srdOverrides.ts`** — check what entries already exist in the target export map.
3. **Targeted vs batch mode:**
   - Targeted: `/skill-name <item>` — generate override for that specific item only.
   - Batch: `/skill-name` (no args) — iterate all items from the API, **skip** any that already have overrides.
4. **Generate structured data** — using Claude's D&D 5e SRD knowledge combined with the API description text to produce correctly typed TypeScript objects.
5. **Write to `srdOverrides.ts`** — insert entries into the correct export map, matching existing code style (lowercase strings, trailing commas, inline comments for clarity).
6. **Type-check** — run `npx tsc --noEmit` to verify the output compiles against the existing types.

## Skill Definitions

### 1. `/seed-class-features`

- **File:** `.claude/skills/seed-class-features.md`
- **API endpoint:** `/classes?document__key=srd-2014`
- **Target map:** `CLASS_FEATURES_OVERRIDES` (`Record<string, ClassFeaturesOverride>`)
- **Args:** Optional class slug (e.g., `monk`, `wizard`). No args = all 12 classes.
- **Generates:** `asiLevels` array + per-level `ClassFeatureDef[]` with `name`, `type` (active/passive/reaction), and `gameplayEffects`.
- **Reference:** Existing entries for all 12 classes show the exact format and `gameplayEffects` field patterns (e.g., `numAttacks`, `resourcePool`, `condition`, `usesPerRest`, `acFormula`, etc.).

### 2. `/seed-subclass-features`

- **File:** `.claude/skills/seed-subclass-features.md`
- **API endpoint:** `/classes?document__key=srd-2014` (subclasses are nested in class data)
- **Target map:** `SUBCLASS_FEATURES_OVERRIDES` (`Record<string, SubclassFeaturesOverride>`)
- **Args:** Optional subclass slug (e.g., `champion`, `evocation`). No args = all SRD subclasses.
- **Generates:** Per-level `ClassFeatureDef[]` with `gameplayEffects`.
- **Reference:** 13 subclasses currently documented (1 per class). Additional SRD subclasses can be discovered via the API.

### 3. `/seed-spell-mechanics`

- **File:** `.claude/skills/seed-spell-mechanics.md`
- **API endpoint:** `/spells?document__key=srd-2014`
- **Target map:** `SPELL_OVERRIDES` (renamed from `SPELL_AOE_OVERRIDES`)
- **Args:** Optional spell slug (e.g., `fireball`, `eldritch-blast`). No args = all ~300 SRD spells (only those needing AOE or scaling data).
- **Generates:** `SpellMechanicsOverride` containing:
  - `aoe?: AOEData` — shape, size, width, origin
  - `upcastScaling?: Record<string, SpellScalingEntry>` — per-slot-level damage/target overrides
  - `cantripScaling?: Record<string, SpellScalingEntry>` — per-character-level damage/target overrides
- **Migration:** Existing `SPELL_AOE_OVERRIDES` entries (~60 spells) are preserved and expanded with scaling data where applicable.

### 4. `/seed-race-abilities`

- **File:** `.claude/skills/seed-race-abilities.md`
- **API endpoint:** `/species?document__key=srd-2014`
- **Target map:** `RACE_OVERRIDES[slug].providedAbilities` (appends `Ability[]`)
- **Args:** Optional race slug (e.g., `dragonborn`, `tiefling`). No args = all 9 SRD races.
- **Generates:** `Ability` objects with `id`, `name`, `type: "racial"`, `attackType`, `saveAbility`, `saveDCAbility`, `damageRoll`, `damageType`, `range`, `racialScaling`, `aoe`, `usesPerRest`, `restType`.
- **Reference:** Dragonborn Breath Weapon is the existing example of a fully populated racial ability.

## Migration: SPELL_AOE_OVERRIDES → SPELL_OVERRIDES

### Type Change

```typescript
// Before
export const SPELL_AOE_OVERRIDES: Record<string, AOEData> = { ... };

// After
interface SpellMechanicsOverride {
  aoe?: AOEData;
  upcastScaling?: Record<string, SpellScalingEntry>;
  cantripScaling?: Record<string, SpellScalingEntry>;
}
export const SPELL_OVERRIDES: Record<string, SpellMechanicsOverride> = { ... };
```

### Data Migration

Existing entries like `"fireball": { shape: "sphere", size: 20, origin: "target" }` become `"fireball": { aoe: { shape: "sphere", size: 20, origin: "target" } }`.

### Seed Script Update

In `seedFirestore.ts`, the merge line changes from:
```typescript
aoe: SPELL_AOE_OVERRIDES[slug],
```
to:
```typescript
aoe: SPELL_OVERRIDES[slug]?.aoe,
upcastScaling: SPELL_OVERRIDES[slug]?.upcastScaling,
cantripScaling: SPELL_OVERRIDES[slug]?.cantripScaling,
```

## File Structure

```
.claude/skills/
  seed-class-features.md
  seed-subclass-features.md
  seed-spell-mechanics.md
  seed-race-abilities.md
```

## Out of Scope

- Monster stat block seeding
- Equipment/weapon/armor seeding
- Running `npm run seed` (the skills only write to `srdOverrides.ts`; the user runs the seed script separately)
- Modifying the Open5e API fetch logic in `seedFirestore.ts` (only the merge logic for spell overrides changes)
