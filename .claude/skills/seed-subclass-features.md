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
- Include a comment header: `// -- SubclassName (ParentClass) ----...`
- Common subclass mechanical patterns:
  - `critRange` -- Champion's improved/superior critical (19 -> 18)
  - `acFormula` / `hpPerLevel` -- Draconic Resilience
  - `spellDamageBonusAbility` -- Empowered Evocation ("intelligence")
  - `proficiencyGrants` -- Life Domain heavy armor, Assassin tools
  - `condition` -- features active during specific states

### 4. Write to srdOverrides.ts

Insert new entries into `SUBCLASS_FEATURES_OVERRIDES` in `scripts/srdOverrides.ts`, matching existing code style.

### 5. Type-check

```bash
npx tsc --noEmit
```

Fix any type errors before finishing.
