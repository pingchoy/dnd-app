# Gameplay Effects Redesign

## Problem

`GameplayEffects` is stored per-feature on `CharacterFeature`, but:
1. Many effects are **global** (Extra Attack, AC bonuses, speed bonuses) — they modify the character, not just the feature.
2. Some effects are **conditional** (Rage bonuses only while raging, Unarmored Defense only without armor).
3. There is **no aggregation layer** — `actionResolver.ts` ignores `gameplayEffects` entirely and hardcodes feature-name lookups (`findFeature(player, "rage")`), violating the class-agnostic design principle.

## Approach

**Conditional effects on features** with aggregation into `PlayerState` fields.

- Keep `gameplayEffects` on `CharacterFeature` (co-located with the feature that grants them).
- Add a `condition` field to `GameplayEffects` — a string like `"always"`, `"raging"`, `"unarmored"`, `"concentrating:hunters_mark"`, etc.
- Add `activeConditions: string[]` on `PlayerState` — tracks current character state.
- Add base value fields (`baseArmorClass`, `baseSpeed`) so derived values can always be recomputed.
- Add new aggregated fields to `PlayerState` (`numAttacks`, `meleeDamageBonus`, etc.).
- A pure `applyEffects(player)` function iterates features, checks conditions, and writes computed values onto `PlayerState`.
- `actionResolver.ts` reads `PlayerState` fields directly instead of doing feature-name lookups.
- Per-attack choices (Sneak Attack, Divine Smite, GWM) stay with the rules agent's `extra_damage_sources` classification — they are situational/opt-in, not persistent state.

## Data Model Changes

### EffectCondition (string type)

Known conditions:
- `"always"` — Extra Attack, Evasion, Fighting Style: Defense
- `"raging"` — Rage damage bonus, Rage resistances
- `"unarmored"` — Unarmored Defense (Barbarian & Monk)
- `"concentrating:<spell>"` — Hunter's Mark, Hex (typed to specific spell)
- `"wielding_shield"` — Shield-based AC
- `"wearing_heavy_armor"` — Heavy Armor Master
- `"wielding_onehanded"` — Dueling fighting style
- `"wielding_twohanded"` — Great Weapon Fighting, GWM
- `"first_turn"` — Dread Ambusher, Assassinate
- `"wild_shaped"` — Druid Wild Shape

Extensible — new conditions added as strings, no enum restriction.

### GameplayEffects (updated)

```ts
export interface GameplayEffects {
  condition?: string; // defaults to "always" if omitted

  // Offense
  numAttacks?: number;
  meleeAttackBonus?: number;
  rangedAttackBonus?: number;
  spellAttackBonus?: number;
  meleeDamageBonus?: number;
  rangedDamageBonus?: number;
  critBonusDice?: number;
  bonusDamage?: string;
  sneakAttackDice?: number;

  // Defense
  acBonus?: number;
  acFormula?: string;
  resistances?: string[];
  immunities?: string[];
  evasion?: boolean;

  // Movement
  speedBonus?: number;

  // Saves & Checks
  saveAdvantage?: string;
  initiativeAdvantage?: boolean;
  halfProficiency?: boolean;
  minCheckRoll?: number;
  saveProficiencies?: string[];

  // Resources
  resourcePool?: { name: string; perLevel: number };
  healPoolPerLevel?: number;

  // Proficiency
  expertiseSlots?: number;

  // Stats
  statBonuses?: Record<string, number>;

  // Usage
  usesPerRest?: number;
  restType?: "short" | "long";

  // Dice
  dieType?: string;
}
```

### PlayerState (new/changed fields)

```ts
// Base values (set at creation / level-up, never modified by applyEffects)
baseArmorClass: number;
baseSpeed: number;

// Active conditions
activeConditions: string[]; // ["raging", "unarmored", "concentrating:hunters_mark"]

// Aggregated offense
numAttacks: number;             // default 1
meleeAttackBonus: number;       // default 0
rangedAttackBonus: number;      // default 0
spellAttackBonus: number;       // default 0
meleeDamageBonus: number;       // default 0
rangedDamageBonus: number;      // default 0
critBonusDice: number;          // default 0
bonusDamage: string[];          // default []

// Aggregated defense
resistances: string[];          // default []
immunities: string[];           // default []
evasion: boolean;               // default false

// Aggregated saves & checks
initiativeAdvantage: boolean;   // default false
halfProficiency: boolean;       // default false
minCheckRoll: number;           // default 0
bonusSaveProficiencies: string[]; // separate from base savingThrowProficiencies
```

Existing fields `armorClass` and `speed` become derived (reset to base, then effects applied).

## Aggregation: applyEffects()

Pure function in `gameTypes.ts`. Runs at the start of each request after loading from Firestore.

1. Reset derived fields to base values.
2. Iterate `player.features`.
3. For each feature with `gameplayEffects`, check if `condition` (defaulting to `"always"`) is present in `player.activeConditions` or is `"always"`.
4. Apply effects using merge rules:
   - `numAttacks`: `Math.max` (doesn't stack)
   - Bonuses (attack, damage, AC, speed): sum
   - Lists (resistances, immunities, saveProficiencies): concat + dedupe
   - Booleans (evasion, initiativeAdvantage): OR
   - `acFormula`: last-wins (only one AC calculation)
   - `minCheckRoll`: `Math.max`
5. Persist updated `PlayerState` to Firestore.

## actionResolver.ts Changes

### Removed from resolveExtraDamage()
- Rage damage — now in `player.meleeDamageBonus`
- Dueling +2 — now in `player.meleeDamageBonus`
- `rageBonusByLevel()` — deleted, scaling value stored in feature's `gameplayEffects`

### Stays in resolveExtraDamage()
Per-attack choices / situational (classified by rules agent):
- Sneak Attack, Divine Smite, Eldritch Smite, GWM, Colossus Slayer, Dread Ambusher

### Moves to applyEffects() via conditions
- Hunter's Mark: `condition: "concentrating:hunters_mark"`, `bonusDamage: "1d6"`
- Hex: `condition: "concentrating:hex"`, `bonusDamage: "1d6 necrotic"`

### resolveAttack() reads PlayerState directly
```ts
const totalMod = abilityMod + profBonus + weaponBonus + player.meleeAttackBonus; // or rangedAttackBonus
const flatBonus = abilityMod + weaponBonus + player.meleeDamageBonus; // or rangedDamageBonus
```

## Migration

- `srdOverrides.ts`: Add `condition` to features that need it (Rage, Unarmored Defense, fighting styles).
- Existing Firestore characters: Backfill `baseArmorClass`/`baseSpeed` from current values. New fields default to zero/empty.
- `seedFirestore.ts`: Updated to include `condition` when seeding class feature data.
- `applyEffects()` runs on next load and populates everything.

## Out of Scope

- Agent changes (DM, Combat, Rules agents unchanged for now)
- Deterministic state management (future work — agents will stop managing conditions)
- Per-attack choices remain in rules agent classification
