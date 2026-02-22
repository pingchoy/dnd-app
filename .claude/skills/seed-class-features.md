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
  - `numAttacks` -- Extra Attack (2, 3, or 4)
  - `condition` -- when this effect is active ("raging", "unarmored", etc.)
  - `acFormula` -- unarmored AC formula ("10 + dex + con", "10 + dex + wis")
  - `meleeDamageBonus` -- flat melee damage bonus (Rage)
  - `resistances` -- damage type resistances while active
  - `speedBonus` -- walking speed increase in feet
  - `saveAdvantage` -- advantage on saves of this ability type
  - `initiativeAdvantage` -- advantage on initiative
  - `critBonusDice` -- extra weapon dice on crits (Brutal Critical)
  - `sneakAttackDice` -- number of sneak attack dice
  - `resourcePool` -- `{ name: "ki", perLevel: 1 }` or `{ name: "sorcery points", perLevel: 1 }`
  - `healPoolPerLevel` -- HP per level for healing pools (Lay on Hands: 5)
  - `usesPerRest` / `restType` -- limited-use features
  - `dieType` -- die type for scaling features ("d6", "d8", etc.)
  - `expertiseSlots` -- number of expertise choices gained
  - `evasion` -- true for Evasion feature
  - `minCheckRoll` -- minimum d20 roll (Reliable Talent: 10)
  - `halfProficiency` -- half proficiency on non-proficient checks
  - `statBonuses` -- permanent stat bonuses `{ strength: 4, constitution: 4 }`
  - `proficiencyGrants` -- `{ armor: [...], weapons: [...], skills: [...], tools: [...] }`
- For features that scale at multiple levels (Rage, Sneak Attack, Bardic Inspiration), include the feature at EVERY level where it changes, with updated values
- Features without mechanical game effects can omit `gameplayEffects`

### 4. Write to srdOverrides.ts

Insert the new entries into `CLASS_FEATURES_OVERRIDES` in `scripts/srdOverrides.ts`, matching the existing code style:
- Use `// -- ClassName ---...` section headers
- Inline objects for simple features, multi-line for complex ones
- Trailing commas on all entries
- Lowercase all string values

### 5. Type-check

```bash
npx tsc --noEmit
```

Fix any type errors before finishing. The code must compile cleanly.
