# Deferred Subclass Feature Systems

## Context

The subclass feature overrides pipeline is complete (seed -> compute -> apply). Most features that map to existing `GameplayEffects` fields are now wired up. This document covers all subclass features that require **new systems** to become mechanically active, organized by the system they need.

## Priority Order

| Priority | System | Effort | Features Unlocked |
|----------|--------|--------|-------------------|
| 1 | Damage Resistance Consumption | Small | Rage resistance (already aggregated), Fiendish Resilience |
| 2 | Resource Tracking | Medium | Ki, Sorcery Points, Channel Divinity, Bardic Inspiration |
| 3 | Temporary Hit Points | Small-Medium | Dark One's Blessing, future spells |
| 4 | Feature Choices | Medium | All Hunter features, future choice features |
| 5 | Attack Advantage/Disadvantage | Medium | Assassinate, Reckless Attack |
| 6 | Action Economy | Large | Frenzy, Fast Hands, Cutting Words, reactions |
| 7 | Start/End of Turn Triggers | Small-Medium | Survivor, ongoing effects |
| 8 | Healing Resolver | Medium-Large | All Life Domain healing features |
| 9 | Aura Effects | Large | Aura of Protection, Holy Nimbus |
| 10 | Wild Shape | Very Large | All Moon Druid features |

---

## System 1: Damage Resistance Consumption

### What It Enables
- **Barbarian Rage** — resistance to bludgeoning/piercing/slashing (already aggregated on PlayerState, never consumed)
- **Fiend Warlock — Fiendish Resilience (L10):** choose one damage resistance
- **Bear Totem (if added):** resistance to all damage except psychic
- Any resistance granted by spells or items

### Current State
`resistances` is already aggregated on `PlayerState` as `string[]` by `applyEffects()`. It is just never consumed by resolvers.

### Architecture

**Resolver change** (`combatResolver.ts` and `actionResolver.ts`):
When dealing damage to the player, check `player.resistances`:
```typescript
if (player.resistances?.includes(damageType)) {
  damage = Math.floor(damage / 2);
}
```

**NPC damage must include damage type.** Currently NPC attacks in `resolveNPCAttacks()` roll damage from `npc.damageDice` but the type comes from the NPC stat block. Need to ensure `damageType` is available in the NPC attack resolution path. Options:
1. Add `damageType` field to `NPC` interface (simplest)
2. Parse from NPC stat block during creation

**Fiendish Resilience override update:**
```typescript
// Fiend Warlock, level 10 — resistance type is chosen by player at each long rest
{ name: "fiendish resilience", type: "passive", gameplayEffects: { resistances: [] } }
// Actual resistance populated via chosenOption at rest time — needs rest UI
```

### Files to Change
- `src/app/lib/gameTypes.ts` — add `damageType?: string` to `NPC` interface
- `src/app/lib/combatResolver.ts` — halve damage in `resolveNPCTurn()` / `resolveNPCTurns()` when player has matching resistance
- `src/app/api/combat/action/route.ts` — apply resistance when NPC damage hits player
- `scripts/srdOverrides.ts` — update Fiendish Resilience override when rest UI exists

### Effort: Small
- 1 new NPC field
- 1-2 line resolver change per damage application point

---

## System 2: Resource Tracking (Ki, Sorcery Points, Bardic Inspiration, Channel Divinity)

### What It Enables
- **Open Hand — Open Hand Technique (L3):** spend ki on Flurry of Blows effects
- **Open Hand — Quivering Palm (L17):** spend 3 ki
- **Lore Bard — Cutting Words (L3):** spend Bardic Inspiration die
- **Lore Bard — Peerless Skill (L14):** spend Bardic Inspiration die
- **Devotion — Sacred Weapon (L3):** spend Channel Divinity use
- **Draconic — Draconic Presence (L18):** spend 5 sorcery points
- All Channel Divinity subclass features
- All Ki-based monk features
- All Sorcery Point metamagic

### Current State
`resourcePool` exists on `GameplayEffects` and is used by Monk Ki and Sorcerer Font of Magic in `CLASS_FEATURES_OVERRIDES`. But there is no **tracking** — no current/max counter on PlayerState.

### Architecture

**New PlayerState field:**
```typescript
/** Resource pools with current/max tracking. Keyed by resource name (e.g. "ki", "sorcery points"). */
resources?: Record<string, {
  current: number;
  max: number;
  restType: "short" | "long";
}>;
```

**Aggregation in `applyEffects()`:**
```typescript
// Compute max from features, preserve current from stored state
if (fx.resourcePool) {
  const { name, perLevel } = fx.resourcePool;
  if (!player.resources) player.resources = {};
  const existing = player.resources[name];
  const newMax = perLevel * player.level;
  player.resources[name] = {
    current: existing ? Math.min(existing.current, newMax) : newMax,
    max: newMax,
    restType: fx.restType ?? "long",
  };
}
```

**Rest system:** On short rest, reset resources with `restType: "short"` to max. On long rest, reset all. Needs a rest action in the combat/chat route.

**Spending enforcement:** When a feature is used that costs resources, the combat action route decrements `resources[name].current`. If 0, the feature can't be used.

**UI:** Resource display in character sidebar (e.g. "Ki: 5/8", "Channel Divinity: 1/2").

### Files to Change
- `src/app/lib/gameTypes.ts` — add `resources` to PlayerState
- `src/app/lib/gameTypes.ts` — aggregate in `applyEffects()`
- `src/app/lib/gameState.ts` — initialize resources on level-up, add rest action
- `src/app/api/combat/action/route.ts` — decrement on feature use
- `src/app/components/CharacterSidebar.tsx` — display resource pools
- `src/app/lib/gameState.ts` — add singleton default for `resources`

### Effort: Medium

---

## System 3: Temporary Hit Points

### What It Enables
- **Fiend Warlock — Dark One's Blessing (L1):** gain CHA mod + warlock level temp HP when reducing a hostile to 0 HP
- **Open Hand Monk — Wholeness of Body (L6):** heal 3x monk level (already has `usesPerRest` but heal amount needs tracking)
- Future: Heroism spell, Inspiring Leader feat

### Architecture

**New PlayerState field:**
```typescript
temporaryHP?: number;  // default 0; does not stack (keep highest)
```

**New GameplayEffects field:**
```typescript
/** Temp HP formula triggered on kill. */
onKillTempHP?: string;  // formula: "charisma + level" for Dark One's Blessing
```

**Damage absorption** (`combatResolver.ts`):
```typescript
if (player.temporaryHP && player.temporaryHP > 0) {
  const absorbed = Math.min(damage, player.temporaryHP);
  player.temporaryHP -= absorbed;
  damage -= absorbed;
}
player.currentHP -= damage;
```

**On-kill trigger** (`api/combat/action/route.ts`):
After detecting `targetDied`, check player features for `onKillTempHP`. Parse formula, compute value, set `player.temporaryHP = Math.max(player.temporaryHP ?? 0, computed)` (temp HP doesn't stack — keep higher).

**Formula parser:** Simple eval: `"charisma + level"` -> `getModifier(player.stats.charisma) + player.level`. Reuse approach from `computeACFromFormula()`.

**Override update:**
```typescript
{ name: "dark one's blessing", type: "passive", gameplayEffects: { onKillTempHP: "charisma + level" } }
```

**Persistence:** `temporaryHP` stored in PlayerState in Firestore. Reset to 0 on long rest.

### Files to Change
- `src/app/lib/gameTypes.ts` — add `temporaryHP` to PlayerState, `onKillTempHP` to GameplayEffects
- `src/app/lib/combatResolver.ts` — consume temp HP before real HP
- `src/app/api/combat/action/route.ts` — on-kill trigger
- `src/app/lib/gameState.ts` — add singleton default
- `scripts/srdOverrides.ts` — update Dark One's Blessing
- `src/app/components/CharacterSidebar.tsx` — display temp HP

### Effort: Small-Medium

---

## System 4: Feature Choices (Hunter Ranger Prototype)

### What It Enables
- **Hunter — Hunter's Prey (L3):** choose Colossus Slayer / Giant Killer / Horde Breaker
- **Hunter — Defensive Tactics (L7):** choose Escape the Horde / Multiattack Defense / Steel Will
- **Hunter — Multiattack (L11):** choose Volley / Whirlwind Attack
- **Hunter — Superior Hunter's Defense (L15):** choose Evasion / Stand Against the Tide / Uncanny Dodge
- Future: Totem Barbarian spirit choices, Warlock Pact Boon

### Current State
The data model already supports this — `PendingLevelData.featureChoices` exists and `CharacterFeature.chosenOption` stores the result. What's missing is:
1. Seed data: override entries need to populate `featureChoices` for Hunter levels
2. Level-up UI: a component for subclass feature choices
3. Choice-to-effect mapping: each option needs its own `gameplayEffects`

### Architecture

**New data in `srdOverrides.ts`:**
```typescript
export const FEATURE_CHOICE_EFFECTS: Record<string, Record<string, GameplayEffects>> = {
  "hunter's prey": {
    "colossus slayer": { bonusDamage: "1d8" },
    "giant killer": {},        // reaction attack — needs reaction system
    "horde breaker": {},       // extra attack vs adjacent — needs targeting system
  },
  "defensive tactics": {
    "steel will": { saveAdvantage: "frightened" },
    "escape the horde": {},    // disadvantage on opportunity attacks — DM-adjudicated
    "multiattack defense": {}, // +4 AC after first hit — needs condition tracking
  },
  "superior hunter's defense": {
    "evasion": { evasion: true },
    "uncanny dodge": {},       // reaction halve damage — needs reaction system
    "stand against the tide": {}, // redirect miss — DM-adjudicated
  },
};
```

**Add to `FEATURE_CHOICE_OPTIONS`:**
```typescript
"hunter's prey": { options: ["Colossus Slayer", "Giant Killer", "Horde Breaker"] },
"defensive tactics": { options: ["Escape the Horde", "Multiattack Defense", "Steel Will"] },
"multiattack": { options: ["Volley", "Whirlwind Attack"] },
"superior hunter's defense": { options: ["Evasion", "Stand Against the Tide", "Uncanny Dodge"] },
```

**Level-up flow changes:**
1. `computePendingLevelUp()` — when a subclass feature name matches a key in `FEATURE_CHOICE_OPTIONS`, add it to `featureChoices[]`
2. Level-up UI — render choice selector (reuse fighting style selector pattern)
3. `applyLevelUp()` — look up `FEATURE_CHOICE_EFFECTS[featureName][chosenOption]` and apply as `gameplayEffects`

### Files to Change
- `src/app/lib/gameTypes.ts` — add entries to `FEATURE_CHOICE_OPTIONS`
- `scripts/srdOverrides.ts` — add `FEATURE_CHOICE_EFFECTS`, update Hunter overrides
- `src/app/lib/gameState.ts` — wire into `computePendingLevelUp()` and `applyLevelUp()`
- `src/app/components/level-up/` — new choice selector component

### Effort: Medium

---

## System 5: Attack Advantage/Disadvantage from Features

### What It Enables
- **Assassin — Assassinate (L3):** advantage on attacks vs creatures that haven't acted
- **Barbarian — Reckless Attack (class feature):** advantage on melee attacks (enemies get advantage on you)
- Future: Faerie Fire, Guiding Bolt, Pack Tactics

### Architecture

**New GameplayEffects field:**
```typescript
attackAdvantage?: {
  type: "melee" | "ranged" | "all";
  condition?: string;  // "first_turn", "reckless"
};
```

**New PlayerState aggregated field:**
```typescript
attackAdvantages?: Array<{ type: "melee" | "ranged" | "all" }>;
```

**Resolver changes:** In `resolveWeaponAttack()` and `resolveSpellAttack()`:
```typescript
const hasFeatureAdvantage = player.attackAdvantages?.some(
  a => a.type === "all" || a.type === attackType
);
// Combine with positional advantage
```

**Override update:**
```typescript
{ name: "assassinate", type: "passive", gameplayEffects: {
  attackAdvantage: { type: "all", condition: "first_turn" },
} }
```

### Files to Change
- `src/app/lib/gameTypes.ts` — new fields + aggregation
- `src/app/lib/combatResolver.ts` — combine with positional advantage
- `src/app/lib/actionResolver.ts` — same
- `scripts/srdOverrides.ts` — Assassinate override

### Effort: Medium

---

## System 6: Action Economy (Bonus Actions & Reactions)

### What It Enables
- **Berserker — Frenzy (L3):** bonus action melee attack while raging
- **Berserker — Retaliation (L14):** reaction melee attack when damaged
- **Thief — Fast Hands (L3):** bonus action Use Object/Thieves' Tools
- **Lore Bard — Cutting Words (L3):** reaction to subtract die from enemy roll
- Future: Two-Weapon Fighting bonus attack, Shield spell (reaction), Opportunity Attacks

### Architecture

**Simple version (recommended first):** Frenzy adds +1 to `numAttacks` while raging. Mechanically close enough (extra melee attack per turn). Defer full action economy until more features need it.

**Full version (deferred):**

New PlayerState fields:
```typescript
actionEconomy?: {
  actionUsed: boolean;
  bonusActionUsed: boolean;
  reactionUsed: boolean;  // resets at start of YOUR next turn
};
```

New GameplayEffects fields:
```typescript
bonusActionAttack?: { type: "melee" | "ranged"; condition?: string };
reactionAttack?: { trigger: "damaged" | "ally_attacked" | "enemy_moves"; type: "melee"; condition?: string };
```

Combat route needs multi-phase turns: main action -> bonus action prompt -> end turn.

### Files to Change
- `src/app/lib/gameTypes.ts` — new fields
- `src/app/api/combat/action/route.ts` — multi-phase turn processing
- `src/app/hooks/useCombat.ts` — bonus action UI state
- `src/app/components/CombatGrid.tsx` — bonus action prompt
- `scripts/srdOverrides.ts` — Frenzy, Retaliation overrides

### Effort: Large

---

## System 7: Start/End of Turn Triggers

### What It Enables
- **Champion — Survivor (L18):** at start of turn, if below half HP, regain 5 + CON mod HP
- Future: Regeneration, ongoing damage, concentration checks, condition durations

### Architecture

**New GameplayEffects field:**
```typescript
startOfTurnEffect?: {
  type: "heal";
  formula: string;  // "5 + constitution"
  condition?: string;  // "below_half_hp"
};
```

**Combat route changes:** At the start of the player's turn (before action selection), iterate features with `startOfTurnEffect` and apply them. Formula evaluation reuses the pattern from `computeACFromFormula()`.

### Files to Change
- `src/app/lib/gameTypes.ts` — new field
- `src/app/api/combat/action/route.ts` — turn-start trigger
- `scripts/srdOverrides.ts` — Survivor override

### Effort: Small-Medium

---

## System 8: Healing Spell Resolution (Life Domain)

### What It Enables
- **Life Domain — Disciple of Life (L1):** +2 + spell level HP when casting healing spells
- **Life Domain — Blessed Healer (L6):** heal self 2 + spell level when healing others
- **Life Domain — Supreme Healing (L17):** max healing dice instead of rolling
- Future: deterministic Cure Wounds, Healing Word, etc.

### Architecture

Currently, healing is narrated by the DM/Combat agent — no deterministic resolver.

**New GameplayEffects fields:**
```typescript
healingSpellBonus?: string;   // formula: "2 + spell_level" (Disciple of Life)
selfHealOnHeal?: string;      // formula: "2 + spell_level" (Blessed Healer)
maxHealingDice?: boolean;     // true = maximize dice (Supreme Healing)
```

**New resolver:** `resolveHealingSpell()` in `actionResolver.ts` or new file:
```typescript
function resolveHealingSpell(player: PlayerState, spellLevel: number, baseDice: string): number {
  let healing = rollDice(baseDice).total;
  if (player has maxHealingDice) healing = maxDice(baseDice);
  healing += computeHealingBonus(player, spellLevel);
  return healing;
}
```

**Integration:** The combat action route resolves healing amount deterministically, then passes it to the combat agent for narration.

**Open question:** How to identify which spells are "healing spells"? Options:
1. Tag in SRD spell data (add `isHealing: true`)
2. Keyword match on spell name ("cure", "heal", "restoration")
3. Check if spell has positive HP effect in description

### Files to Change
- `src/app/lib/gameTypes.ts` — new GameplayEffects fields
- `src/app/lib/actionResolver.ts` or new `healingResolver.ts` — resolver
- `src/app/api/combat/action/route.ts` — integration
- `scripts/srdOverrides.ts` — Life Domain overrides
- `scripts/seedFirestore.ts` — tag healing spells in SRD data (if option 1)

### Effort: Medium-Large

---

## System 9: Aura Effects

### What It Enables
- **Paladin — Aura of Protection (L6):** allies within 10ft add CHA to saves
- **Devotion — Aura of Devotion (L7):** allies within 10ft immune to charm
- **Devotion — Holy Nimbus (L20):** 10 radiant damage to enemies starting turn in aura
- Future: Paladin Aura of Courage, Spirit Guardians spell

### Architecture

Auras are positional effects — they depend on distance between tokens on the combat grid.

**New GameplayEffects field:**
```typescript
aura?: {
  radius: number;       // feet (10, 30)
  target: "allies" | "enemies" | "all";
  effects: Partial<GameplayEffects>;  // effects applied to targets in range
};
```

**Grid integration:** The combat grid already tracks positions (`StoredEncounter.positions`). At the start of each turn, check which tokens are within aura range and apply/remove effects.

**Multiplayer considerations:** Whose aura applies? Multiple paladins could overlap auras. Need to track which effects come from which source.

### Files to Change
- `src/app/lib/gameTypes.ts` — new field
- `src/app/lib/combatResolver.ts` — aura distance checks
- `src/app/api/combat/action/route.ts` — per-turn aura application
- `src/app/lib/combatEnforcement.ts` — distance utility (may already exist)

### Effort: Large

---

## System 10: Wild Shape Stat Replacement (Moon Druid)

### What It Enables
- **Moon Druid — Combat Wild Shape (L2):** wild shape as bonus action
- **Moon Druid — Circle Forms (L2):** wild shape into CR 1+ beasts
- **Moon Druid — Primal Strike (L6):** wild shape attacks are magical
- **Moon Druid — Elemental Wild Shape (L10):** wild shape into elementals
- Base Druid Wild Shape (class feature, L2)

### Architecture

Wild Shape **replaces** the character's stat block rather than modifying it.

**New PlayerState fields:**
```typescript
wildShapeForm?: {
  name: string;
  stats: CharacterStats;
  ac: number;
  currentHP: number;
  maxHP: number;
  speed: number;
  attacks: Array<{ name: string; bonus: number; damage: string; damageType: string }>;
  isMagical?: boolean;  // Primal Strike
};
originalStats?: Partial<PlayerState>;
```

**Resolver changes:** When `player.wildShapeForm` is set:
- Use `wildShapeForm.stats` for physical checks
- Use `wildShapeForm.ac` for AC
- Use `wildShapeForm.currentHP` for damage tracking
- When `wildShapeForm.currentHP` reaches 0, revert to original form with overflow damage
- Keep INT/WIS/CHA from original player (D&D 5e rule)

**Beast stat blocks:** Filter SRD monsters collection for `type="beast"`. Moon Druid CR limit: `level / 3` (min 1). Other druids: `level / 8` (min 0), no swim/fly until L4/L8.

### Files to Change
- `src/app/lib/gameTypes.ts` — new PlayerState fields
- `src/app/lib/combatResolver.ts` — form-dependent stat resolution
- `src/app/lib/gameState.ts` — form transition logic
- `src/app/api/combat/action/route.ts` — enter/exit wild shape actions
- `src/app/components/` — form selection UI, stat display swap
- `scripts/seedFirestore.ts` — beast stat block extraction

### Effort: Very Large

---

## Features That Remain Narrative (No System Needed)

These features are intentionally DM-adjudicated and need no mechanical system:

| Feature | Subclass | Reason |
|---------|----------|--------|
| Intimidating Presence | Berserker | Active social ability |
| Fast Hands | Thief | Bonus action Use Object (needs action economy) |
| Use Magic Device | Thief | Magic item requirement bypass |
| Thief's Reflexes | Thief | Two turns in first round (needs initiative system) |
| Infiltration Expertise | Assassin | Downtime/narrative |
| Impostor | Assassin | Social/narrative |
| Evocation Savant | Evocation | Economy/downtime |
| Sculpt Spells | Evocation | Needs AOE friendly-fire exclusion |
| Potent Cantrip | Evocation | Needs half-damage-on-save change |
| Overchannel | Evocation | Active with self-damage cost |
| Open Hand Technique | Open Hand | Needs Flurry of Blows system |
| Tranquility | Open Hand | Sanctuary effect |
| Quivering Palm | Open Hand | Needs ki tracking + special resolution |
| Sacred Weapon | Devotion | Needs dynamic ability-based attack bonus |
| Turn the Unholy | Devotion | Channel Divinity variant |
| Purity of Spirit | Devotion | Permanent Protection from E&G |
| Holy Nimbus | Devotion | Aura damage (needs aura system) |
| Dragon Ancestor | Draconic | Lore + niche CHA bonus |
| Dragon Wings | Draconic | Flying speed (grid doesn't support) |
| Draconic Presence | Draconic | Needs sorcery point spending |
| Dark One's Blessing | Fiend | Needs temp HP + on-kill trigger |
| Fiendish Resilience | Fiend | Needs choosable resistance + resolver |
| All Lore features | Lore | Need Bardic Inspiration resource |
| All Moon features | Moon | Need Wild Shape stat replacement |
| Survivor | Champion | Needs start-of-turn regen trigger |
| Frenzy | Berserker | Needs bonus action attack |
| Retaliation | Berserker | Needs reaction attack |
