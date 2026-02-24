# Friendly NPCs Design

## Overview

Add support for friendly NPCs that travel with the party and fight alongside them in combat. Friendly NPCs mirror hostile NPC mechanics (pre-rolled attacks, per-turn narration) but target enemies instead of players. The DM agent introduces and dismisses them at its narrative discretion.

## Requirements

- Friendly NPCs get combat turns identical to hostile NPCs (pre-rolled attacks, Haiku narration)
- Friendly NPCs target hostile NPCs instead of players
- DM agent introduces friendly NPCs via existing `npcs_to_create` with `disposition: "friendly"`
- DM agent dismisses friendly NPCs via new `npcs_to_dismiss` field when their narrative role is complete
- Friendly NPCs can die in combat (removed silently, no XP awarded)
- Friendly NPCs appear in the sidebar ("Companions" section), combat grid (emerald tokens), and turn order bar (green-bordered chips)
- Friendly NPCs spawn at the bottom of the combat grid (near the player)

## Data Model

### No changes to NPC interface

`NPC.disposition` already supports `"friendly"`. No new fields needed.

### New field: `npcs_to_dismiss`

Added to the DM agent's `update_game_state` tool schema and `StateChanges` type:

```typescript
npcs_to_dismiss?: string[];  // NPC IDs to remove from the scene
```

Post-processing calls `updateNPC(id, { remove_from_scene: true })` for each.

## Combat Turn Resolution

### Turn order

Turn order reset includes friendly NPCs:

```typescript
encounter.turnOrder = [
  "player",
  ...encounter.activeNPCs
    .filter(n => n.currentHp > 0 && n.disposition === "friendly")
    .map(n => n.id),
  ...encounter.activeNPCs
    .filter(n => n.currentHp > 0 && n.disposition === "hostile")
    .map(n => n.id),
];
```

Friendly NPCs go after the player, before hostile NPCs. This means allies attack first, then enemies retaliate.

### Friendly NPC attack resolution

New function `resolveFriendlyNPCTurn(npc, hostileNPCs)`:

1. Pick a random living hostile NPC as target
2. Roll d20 + npc.attackBonus vs target AC
3. On hit: roll damage dice + damage bonus
4. Return `FriendlyNPCTurnResult` with target info, d20, hit/miss, damage

### Friendly NPC turn processing

In `/api/combat/resolve/route.ts`, the NPC turn loop checks disposition:

- **Hostile NPCs**: attack the player (existing logic)
- **Friendly NPCs**: attack a random hostile NPC (new logic), damage applied via `updateNPC` to the hostile target

### Narration

`narrateNPCTurn` is generalized to accept a target name/HP instead of always targeting the player. For friendly NPCs, the target is the hostile NPC they attacked.

### Hostile NPCs can target friendly NPCs

Hostile NPCs randomly choose between the player and friendly NPCs as targets. This makes combat feel realistic — enemies don't always dogpile the player when there are visible allies.

## DM Agent Prompting

### Introduction

System prompt additions:
- Introduce friendly NPCs when narratively appropriate (guides, rescued prisoners, hired mercenaries, quest allies)
- Use `npcs_to_create` with `disposition: "friendly"` and an SRD slug
- Keep friendly NPC introductions grounded — don't spawn powerful allies that trivialize encounters

### Dismissal

System prompt additions:
- Dismiss friendly NPCs when their narrative purpose is complete
- Use `npcs_to_dismiss` with the NPC's ID
- Narrate the departure naturally (NPC leaves, stays behind, parts ways, etc.)

### Tool schema

Add `npcs_to_dismiss` to `update_game_state`:

```json
{
  "npcs_to_dismiss": {
    "type": "array",
    "description": "IDs of friendly/neutral NPCs to remove from the party",
    "items": { "type": "string" }
  }
}
```

## Grid Positioning

`computeInitialPositions()` updated to place NPCs by disposition:
- **Hostile NPCs**: top rows of the grid (existing behavior)
- **Friendly NPCs**: bottom rows, near the player token
- **Player**: bottom-center (existing behavior)

## UI Changes

### Character sidebar — "Companions" section

New section below player stats, shown only when friendly NPCs exist in the encounter:
- Each friendly NPC: name, HP bar, AC, conditions
- Compact layout — no full stat block needed

### Combat grid

Already supports disposition-based colors (`DISPOSITION_COLORS` in `CombatToken.tsx`):
- Hostile: red
- Friendly: emerald/green
- Neutral: sky blue

No changes needed — already implemented.

### Turn order bar

Color-code chips by disposition:
- Player: gold (existing)
- Friendly NPCs: green border/highlight
- Hostile NPCs: red border/highlight

## Edge Cases

- **No hostile NPCs alive**: Combat ends (victory) — friendly NPCs survive and remain in the party
- **All friendly NPCs die**: No special handling — combat continues as normal
- **Friendly NPC killed by hostile**: Removed from activeNPCs, no XP awarded, DM narrates if desired
- **Friendly NPC present but no combat**: Shown in sidebar companions section, not on grid
- **Multiple friendly NPCs**: Each gets their own turn, picks a random hostile target independently
