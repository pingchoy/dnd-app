# SRD Seeding Skills — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create four Claude Code skills (`/seed-class-features`, `/seed-subclass-features`, `/seed-spell-mechanics`, `/seed-race-abilities`) that automate populating `scripts/srdOverrides.ts` with structured D&D 5e mechanical data.

**Architecture:** Each skill is a markdown file in `.claude/skills/` that instructs Claude to: (1) fetch the item list from the Open5e v2 API via `curl`, (2) read `scripts/srdOverrides.ts` to find existing entries, (3) generate typed TypeScript override entries using D&D 5e knowledge, (4) write them into the correct export map, and (5) type-check with `npx tsc --noEmit`. The spell mechanics skill also requires a one-time migration of `SPELL_AOE_OVERRIDES` → `SPELL_OVERRIDES` in both `srdOverrides.ts` and `seedFirestore.ts`.

**Tech Stack:** Claude Code skills (markdown), TypeScript, Open5e v2 REST API, existing project types (`GameplayEffects`, `Ability`, `AOEData`, `SpellScalingEntry` from `gameTypes.ts`).

---

### Task 1: Create `.claude/skills/` directory

**Files:**
- Create: `.claude/skills/` (directory)

**Step 1: Create the directory**

```bash
mkdir -p .claude/skills
```

**Step 2: Commit**

```bash
git add .claude/skills
git commit --allow-empty -m "chore: create .claude/skills directory for custom skills"
```

---

### Task 2: Migrate SPELL_AOE_OVERRIDES → SPELL_OVERRIDES

This must happen before the spell mechanics skill can be written, since it targets the new map shape.

**Files:**
- Modify: `scripts/srdOverrides.ts` (lines 11, 1126–1209)
- Modify: `scripts/seedFirestore.ts` (lines 42, 815)

**Step 1: Add `SpellScalingEntry` import and new interface to `srdOverrides.ts`**

In `scripts/srdOverrides.ts`, change the import on line 11 from:
```typescript
import type { Ability, AOEData, GameplayEffects } from "../src/app/lib/gameTypes";
```
to:
```typescript
import type { Ability, AOEData, GameplayEffects, SpellScalingEntry } from "../src/app/lib/gameTypes";
```

Add the new interface before the export (around line 1126, before the big doc comment):
```typescript
export interface SpellMechanicsOverride {
  aoe?: AOEData;
  upcastScaling?: Record<string, SpellScalingEntry>;
  cantripScaling?: Record<string, SpellScalingEntry>;
}
```

**Step 2: Rename and restructure the spell overrides map**

Change `export const SPELL_AOE_OVERRIDES: Record<string, AOEData>` to `export const SPELL_OVERRIDES: Record<string, SpellMechanicsOverride>`.

Wrap every existing entry's value in `{ aoe: ... }`. For example:
```typescript
// Before
"fireball": { shape: "sphere", size: 20, origin: "target" },
// After
"fireball": { aoe: { shape: "sphere", size: 20, origin: "target" } },
```

Every entry in the map needs this wrapping. There are ~60 entries across cantrips through 9th level.

**Step 3: Update `seedFirestore.ts` import and merge**

In `scripts/seedFirestore.ts`, change the import (line 42) from:
```typescript
  SPELL_AOE_OVERRIDES,
```
to:
```typescript
  SPELL_OVERRIDES,
```

Change the merge line (line 815) from:
```typescript
        aoe: SPELL_AOE_OVERRIDES[slug],
```
to:
```typescript
        aoe: SPELL_OVERRIDES[slug]?.aoe,
        upcastScaling: SPELL_OVERRIDES[slug]?.upcastScaling,
        cantripScaling: SPELL_OVERRIDES[slug]?.cantripScaling,
```

**Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 5: Commit**

```bash
git add scripts/srdOverrides.ts scripts/seedFirestore.ts
git commit -m "refactor: migrate SPELL_AOE_OVERRIDES to SPELL_OVERRIDES with scaling support"
```

---

### Task 3: Create `/seed-class-features` skill

**Files:**
- Create: `.claude/skills/seed-class-features.md`

**Step 1: Write the skill file**

Create `.claude/skills/seed-class-features.md` with the following content:

````markdown
---
name: seed-class-features
description: Populate CLASS_FEATURES_OVERRIDES in srdOverrides.ts with structured mechanical data for D&D 5e class features. Fetches class list from Open5e v2 API, generates typed overrides using D&D 5e knowledge. Usage: /seed-class-features [class-slug]
---

# Seed Class Features

## Arguments
- Optional: a class slug (e.g., `monk`, `wizard`, `barbarian`)
- If no argument provided, iterate ALL classes from the API, skipping any already in `CLASS_FEATURES_OVERRIDES`

## Steps

### 1. Fetch class list from Open5e v2 API

```bash
curl -s "https://api.open5e.com/v2/classes/?document__key=srd-2014&limit=100&format=json"
```

If a specific class was requested, filter to that slug. Otherwise use all results.

For each class, also fetch its feature list to get level-by-level features:
```bash
curl -s "https://api.open5e.com/v2/classes/<class-key>/features/?limit=100&format=json"
```

### 2. Read existing overrides

Read `scripts/srdOverrides.ts` and identify which class slugs already have entries in `CLASS_FEATURES_OVERRIDES`. In batch mode, skip these.

### 3. Generate override entries

For each class, produce a `ClassFeaturesOverride` object:

```typescript
interface ClassFeatureDef {
  name: string;
  type: "active" | "passive" | "reaction";
  gameplayEffects?: GameplayEffects;
}

interface ClassFeaturesOverride {
  asiLevels: number[];
  levels: Record<number, ClassFeatureDef[]>;
}
```

**Rules:**
- `asiLevels`: Most classes = `[4, 8, 12, 16, 19]`. Fighter = `[4, 6, 8, 12, 14, 16, 19]`. Rogue = `[4, 8, 10, 12, 16, 19]`.
- Feature names: all lowercase
- `type`: "active" for features the player chooses to activate (rage, action surge, channel divinity), "passive" for always-on bonuses (extra attack, unarmored defense), "reaction" for reaction-triggered features (uncanny dodge, deflect missiles)
- `gameplayEffects`: Use the typed fields from the `GameplayEffects` interface. Key fields:
  - `numAttacks` — Extra Attack (2, 3, or 4)
  - `condition` — when this effect is active ("raging", "unarmored", etc.)
  - `acFormula` — unarmored AC formula ("10 + dex + con", "10 + dex + wis")
  - `meleeDamageBonus` — flat melee damage bonus (Rage)
  - `resistances` — damage type resistances while active
  - `speedBonus` — walking speed increase in feet
  - `saveAdvantage` — advantage on saves of this ability type
  - `initiativeAdvantage` — advantage on initiative
  - `critBonusDice` — extra weapon dice on crits (Brutal Critical)
  - `sneakAttackDice` — number of sneak attack dice
  - `resourcePool` — `{ name: "ki", perLevel: 1 }` or `{ name: "sorcery points", perLevel: 1 }`
  - `healPoolPerLevel` — HP per level for healing pools (Lay on Hands: 5)
  - `usesPerRest` / `restType` — limited-use features
  - `dieType` — die type for scaling features ("d6", "d8", etc.)
  - `expertiseSlots` — number of expertise choices gained
  - `evasion` — true for Evasion feature
  - `minCheckRoll` — minimum d20 roll (Reliable Talent: 10)
  - `halfProficiency` — half proficiency on non-proficient checks
  - `statBonuses` — permanent stat bonuses `{ strength: 4, constitution: 4 }`
  - `proficiencyGrants` — `{ armor: [...], weapons: [...], skills: [...], tools: [...] }`
- For features that scale at multiple levels (Rage, Sneak Attack, Bardic Inspiration), include the feature at EVERY level where it changes, with updated values
- Features without mechanical game effects can omit `gameplayEffects`

### 4. Write to srdOverrides.ts

Insert the new entries into `CLASS_FEATURES_OVERRIDES` in `scripts/srdOverrides.ts`, matching the existing code style:
- Use `// ── ClassName ───...` section headers
- Inline objects for simple features, multi-line for complex ones
- Trailing commas on all entries
- Lowercase all string values

### 5. Type-check

```bash
npx tsc --noEmit
```

Fix any type errors before finishing. The code must compile cleanly.
````

**Step 2: Commit**

```bash
git add .claude/skills/seed-class-features.md
git commit -m "feat: add /seed-class-features skill for SRD class feature overrides"
```

---

### Task 4: Create `/seed-subclass-features` skill

**Files:**
- Create: `.claude/skills/seed-subclass-features.md`

**Step 1: Write the skill file**

Create `.claude/skills/seed-subclass-features.md` with the following content:

````markdown
---
name: seed-subclass-features
description: Populate SUBCLASS_FEATURES_OVERRIDES in srdOverrides.ts with structured mechanical data for D&D 5e subclass features. Fetches subclass list from Open5e v2 API. Usage: /seed-subclass-features [subclass-slug]
---

# Seed Subclass Features

## Arguments
- Optional: a subclass slug (e.g., `champion`, `evocation`, `thief`, `berserker`)
- If no argument provided, iterate ALL subclasses from the API, skipping any already in `SUBCLASS_FEATURES_OVERRIDES`

## Steps

### 1. Fetch subclass list from Open5e v2 API

First fetch all classes to get their subclass lists:
```bash
curl -s "https://api.open5e.com/v2/classes/?document__key=srd-2014&limit=100&format=json"
```

Each class result has a `subclasses` array. For each subclass, fetch its features:
```bash
curl -s "https://api.open5e.com/v2/classes/<class-key>/features/?limit=100&format=json"
```

Filter features to those belonging to the target subclass. If a specific subclass was requested, only process that one.

### 2. Read existing overrides

Read `scripts/srdOverrides.ts` and identify which subclass slugs already have entries in `SUBCLASS_FEATURES_OVERRIDES`. In batch mode, skip these.

### 3. Generate override entries

For each subclass, produce a `SubclassFeaturesOverride` object:

```typescript
interface SubclassFeaturesOverride {
  levels: Record<number, ClassFeatureDef[]>;
}
```

**Rules:**
- Same `ClassFeatureDef` structure and `gameplayEffects` fields as `/seed-class-features`
- Feature names: all lowercase
- Subclass slug format: lowercase, hyphenated (e.g., `"open-hand"`, `"battle-master"`, `"arcane-trickster"`)
- Include a comment header: `// ── SubclassName (ParentClass) ────...`
- Common subclass mechanical patterns:
  - `critRange` — Champion's improved/superior critical (19 → 18)
  - `acFormula` / `hpPerLevel` — Draconic Resilience
  - `spellDamageBonusAbility` — Empowered Evocation ("intelligence")
  - `proficiencyGrants` — Life Domain heavy armor, Assassin tools
  - `condition` — features active during specific states

### 4. Write to srdOverrides.ts

Insert new entries into `SUBCLASS_FEATURES_OVERRIDES` in `scripts/srdOverrides.ts`, matching existing code style.

### 5. Type-check

```bash
npx tsc --noEmit
```

Fix any type errors before finishing.
````

**Step 2: Commit**

```bash
git add .claude/skills/seed-subclass-features.md
git commit -m "feat: add /seed-subclass-features skill for SRD subclass feature overrides"
```

---

### Task 5: Create `/seed-spell-mechanics` skill

**Files:**
- Create: `.claude/skills/seed-spell-mechanics.md`

**Step 1: Write the skill file**

Create `.claude/skills/seed-spell-mechanics.md` with the following content:

````markdown
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
  - "+1dX per slot level above base" (Fireball: 8d6 → 9d6 → 10d6...)
  - "+1 target per slot level" (Magic Missile: 3 → 4 → 5...)
  - "increases healing/duration/etc" (Cure Wounds: 1d8 → 2d8...)
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
- Organize by spell level: `// ── Cantrips ──`, `// ── 1st Level ──`, etc.
- Align entries with padding for readability (match existing AOE entry alignment style)
- Inline comments for non-obvious choices

### 5. Type-check

```bash
npx tsc --noEmit
```

Fix any type errors before finishing.
````

**Step 2: Commit**

```bash
git add .claude/skills/seed-spell-mechanics.md
git commit -m "feat: add /seed-spell-mechanics skill for SRD spell override data"
```

---

### Task 6: Create `/seed-race-abilities` skill

**Files:**
- Create: `.claude/skills/seed-race-abilities.md`

**Step 1: Write the skill file**

Create `.claude/skills/seed-race-abilities.md` with the following content:

````markdown
---
name: seed-race-abilities
description: Populate RACE_OVERRIDES[].providedAbilities in srdOverrides.ts with structured Ability objects for D&D 5e racial abilities. Fetches species from Open5e v2 API. Usage: /seed-race-abilities [race-slug]
---

# Seed Race Abilities

## Arguments
- Optional: a race slug (e.g., `dragonborn`, `tiefling`, `half-orc`)
- If no argument provided, iterate ALL races from the API, skipping any that already have a `providedAbilities` array in `RACE_OVERRIDES`

## Steps

### 1. Fetch species list from Open5e v2 API

```bash
curl -s "https://api.open5e.com/v2/species/?document__key=srd-2014&limit=100&format=json"
```

If a specific race was requested, filter to that slug.

For each species, examine the traits in the API response to identify racial abilities with mechanical effects (not passive bonuses — those are already in the base `RACE_OVERRIDES` fields like `abilityBonuses`, `speed`, etc.).

### 2. Read existing overrides

Read `scripts/srdOverrides.ts` and check which race slugs already have a `providedAbilities` array in `RACE_OVERRIDES`. In batch mode, skip these.

### 3. Generate ability entries

For each race with active racial abilities, produce an `Ability[]` array:

```typescript
interface Ability {
  id: string;                    // "racial:<ability-slug>"
  name: string;                  // Display name (Title Case — this is a name, not stored data)
  type: "racial";
  attackType?: "ranged" | "melee" | "save" | "auto" | "none";
  saveAbility?: string;          // target's save ability ("dexterity", "constitution", etc.)
  saveDCAbility?: string;        // caster's ability for DC calc ("constitution", "charisma", etc.)
  range?: AbilityRange;          // { type: "ranged"|"melee"|"self"|"touch", shortRange?: number, ... }
  requiresTarget: boolean;
  damageRoll?: string;           // "2d6" base damage
  damageType?: string;           // "fire", "necrotic", etc.
  targetCount?: number;
  usesPerRest?: number;
  restType?: "short" | "long";
  racialScaling?: Record<string, SpellScalingEntry>;  // character level → scaling
  aoe?: AOEData;
}
```

**Known SRD racial abilities to generate:**
- **Dragonborn — Breath Weapon** (already exists as reference): 2d6 damage, DEX save, CON-based DC, 15ft cone or 30ft line (by ancestry), scales at 6/11/16, 1/short rest
- **Tiefling — Hellish Rebuke** (racial casting): 2d10 fire, reaction, DEX save, CHA-based DC, 1/long rest. Also **Thaumaturgy** (cantrip, no mechanical effect — skip) and **Darkness** at level 5 (1/long rest, no damage — include if it has the AOE field)
- **Half-Orc — Relentless Endurance**: Drop to 1 HP instead of 0, 1/long rest. This is passive/defensive so use `attackType: "none"`, `requiresTarget: false`
- **Half-Orc — Savage Attacks**: Extra weapon die on crit. This is better as a `gameplayEffects` on a feature, but if it doesn't fit the `Ability` interface, skip it (it's already handled differently)
- **Gnome — Gnome Cunning**: Advantage on INT/WIS/CHA saves vs magic. This is a passive trait, not an active ability — skip for `providedAbilities`
- **Dwarf — Dwarven Resilience**: Advantage on saves vs poison, resistance to poison damage. Passive — skip
- **Elf — Fey Ancestry**: Advantage on saves vs charmed, immune to magical sleep. Passive — skip
- **Elf — Trance**: 4 hours of meditation instead of 8 hours sleep. Flavorful, not mechanical — skip
- **Halfling — Lucky**: Reroll natural 1s on d20s. Passive — skip
- **Human**: No racial abilities beyond bonus stats

**Important:** Only generate `providedAbilities` entries for **active abilities** the player can choose to use (Breath Weapon, Hellish Rebuke). Passive traits (Gnome Cunning, Dwarven Resilience, Lucky) are not `Ability` objects — they belong in other fields or `gameplayEffects` on features.

If a race has NO active racial abilities (dwarf, elf, halfling, human, gnome), do not add an empty `providedAbilities: []`. Just skip that race.

### 4. Write to srdOverrides.ts

Add/update the `providedAbilities` array in the existing `RACE_OVERRIDES` entry for each race. Do NOT replace other fields (abilityBonuses, speed, etc.) — only add/update `providedAbilities`.

### 5. Type-check

```bash
npx tsc --noEmit
```

Fix any type errors before finishing.
````

**Step 2: Commit**

```bash
git add .claude/skills/seed-race-abilities.md
git commit -m "feat: add /seed-race-abilities skill for SRD racial ability overrides"
```

---

### Task 7: Final verification

**Step 1: Verify all skill files exist**

```bash
ls -la .claude/skills/
```

Expected: 4 files:
- `seed-class-features.md`
- `seed-subclass-features.md`
- `seed-spell-mechanics.md`
- `seed-race-abilities.md`

**Step 2: Type-check the migration**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Test one skill manually**

Run `/seed-race-abilities tiefling` to verify the skill works end-to-end — fetches from API, reads existing overrides, generates correct TypeScript, writes to file, and passes type-check.
