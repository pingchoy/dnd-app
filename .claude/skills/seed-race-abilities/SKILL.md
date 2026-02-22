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

For each species, examine the traits in the API response to identify racial abilities with mechanical effects (not passive bonuses -- those are already in the base `RACE_OVERRIDES` fields like `abilityBonuses`, `speed`, etc.).

### 2. Read existing overrides

Read `scripts/srdOverrides.ts` and check which race slugs already have a `providedAbilities` array in `RACE_OVERRIDES`. In batch mode, skip these.

### 3. Generate ability entries

For each race with active racial abilities, produce an `Ability[]` array:

```typescript
interface Ability {
  id: string;                    // "racial:<ability-slug>"
  name: string;                  // Display name (Title Case -- this is a name, not stored data)
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
  racialScaling?: Record<string, SpellScalingEntry>;  // character level -> scaling
  aoe?: AOEData;
}
```

**Known SRD racial abilities to generate:**
- **Dragonborn -- Breath Weapon** (already exists as reference): 2d6 damage, DEX save, CON-based DC, 15ft cone or 30ft line (by ancestry), scales at 6/11/16, 1/short rest
- **Tiefling -- Hellish Rebuke** (racial casting): 2d10 fire, reaction, DEX save, CHA-based DC, 1/long rest. Also **Thaumaturgy** (cantrip, no mechanical effect -- skip) and **Darkness** at level 5 (1/long rest, no damage -- include if it has the AOE field)
- **Half-Orc -- Relentless Endurance**: Drop to 1 HP instead of 0, 1/long rest. This is passive/defensive so use `attackType: "none"`, `requiresTarget: false`
- **Half-Orc -- Savage Attacks**: Extra weapon die on crit. This is better as a `gameplayEffects` on a feature, but if it doesn't fit the `Ability` interface, skip it (it's already handled differently)
- **Gnome -- Gnome Cunning**: Advantage on INT/WIS/CHA saves vs magic. This is a passive trait, not an active ability -- skip for `providedAbilities`
- **Dwarf -- Dwarven Resilience**: Advantage on saves vs poison, resistance to poison damage. Passive -- skip
- **Elf -- Fey Ancestry**: Advantage on saves vs charmed, immune to magical sleep. Passive -- skip
- **Elf -- Trance**: 4 hours of meditation instead of 8 hours sleep. Flavorful, not mechanical -- skip
- **Halfling -- Lucky**: Reroll natural 1s on d20s. Passive -- skip
- **Human**: No racial abilities beyond bonus stats

**Important:** Only generate `providedAbilities` entries for **active abilities** the player can choose to use (Breath Weapon, Hellish Rebuke). Passive traits (Gnome Cunning, Dwarven Resilience, Lucky) are not `Ability` objects -- they belong in other fields or `gameplayEffects` on features.

If a race has NO active racial abilities (dwarf, elf, halfling, human, gnome), do not add an empty `providedAbilities: []`. Just skip that race.

### 4. Write to srdOverrides.ts

Add/update the `providedAbilities` array in the existing `RACE_OVERRIDES` entry for each race. Do NOT replace other fields (abilityBonuses, speed, etc.) -- only add/update `providedAbilities`.

### 5. Type-check

```bash
npx tsc --noEmit
```

Fix any type errors before finishing.
