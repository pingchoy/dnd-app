# Persistent Companions Design

## Problem

Friendly NPCs only exist inside `encounter.activeNPCs` during combat. Once an encounter resolves, surviving friendly NPCs vanish from game state. The DM agent has no awareness of them outside combat, so companions cannot persist between encounters.

## Goals

- Friendly NPCs survive between encounters as persistent companions
- DM agent is aware of companions during exploration/roleplay
- Companions auto-join future combats
- Story NPCs (SupportingNPC) can be linked to companion stat blocks
- Companion deaths and departures are tracked narratively

## Data Model

### GameState — new `companions` field

```typescript
companions: NPC[];  // max 3, disposition always "friendly"
```

Top-level array on `GameState`, persisted to Firestore. Contains pure combat stat blocks (name, AC, HP, attack stats). No personality or story data.

### SupportingNPC — new fields

```typescript
export interface SupportingNPC {
  // ... existing fields (name, role, appearance, personality, motivations, location, notes)
  combatSlug?: string;        // existing — SRD monster slug for stat lookup
  companionNpcId?: string;    // NEW — links to NPC.id in companions[]
  status: "active" | "dead" | "departed";  // NEW — tracks fate
}
```

When a story NPC is also a companion, `companionNpcId` points to their entry in `companions[]`.

### StateChanges — new tool actions

```typescript
companions_to_add?: Array<{ slug: string; name?: string; supportingNpcId?: string }>;
companions_to_remove?: string[];  // NPC IDs to remove from companions[]
```

## Companion Lifecycle

### Creation — 3 paths

**Path A — DM creates a generic companion during exploration:**
1. DM agent calls `update_game_state` with `companions_to_add: [{ slug: "guard" }]`
2. Chat route looks up SRD stats via slug, creates NPC with `disposition: "friendly"`
3. NPC added to `GameState.companions[]`
4. Cap enforced: if at 3 companions, DM prompt says "party is at companion limit"

**Path B — DM creates a story NPC who is also a companion:**
1. DM creates a SupportingNPC AND includes `companions_to_add: [{ slug: "veteran", supportingNpcId: "snpc_123" }]`
2. Chat route creates combat NPC, sets `SupportingNPC.companionNpcId` to new NPC's ID
3. Both persisted

**Path C — Post-combat persistence:**
1. Combat ends (all hostiles dead/fled)
2. Chat route detects surviving friendly NPCs in the encounter
3. Combat agent is given context: "The following friendly NPCs survived combat: [list]. Use `companions_to_add` to keep any as companions, or they will depart."
4. Combat agent decides narratively which survivors stay
5. Non-persisted friendly NPCs are discarded from the encounter

### Combat Entry

When a new encounter starts and `companions[]` is non-empty:
1. All companions copied into `encounter.activeNPCs` with `disposition: "friendly"`
2. Placed near the player on the grid (existing positioning logic)
3. Added to turn order before hostiles (existing turn order logic)
4. HP carries over from `companions[]` (no auto-heal between fights)

### Dismissal

- Either agent calls `companions_to_remove: ["npc_123"]` via `update_game_state`
- If linked to a SupportingNPC: clear `companionNpcId`, set `status = "departed"`
- NPC removed from `companions[]`

### Death

- Companion dies in combat (HP <= 0)
- Removed from `companions[]` after combat
- If linked to a SupportingNPC: clear `companionNpcId`, set `status = "dead"`, update notes
- Generic companions silently removed from array

## Agent Responsibilities

### Combat Agent

- Narrates companion deaths during combat turns
- After combat ends, decides which surviving friendly NPCs persist via `companions_to_add`
- Narrates departures for those that don't stay
- Has access to `companions_to_remove` for removing dead companions

### DM Agent

- System prompt includes serialized companion list: "Companions: [Guard (HP 22/27), Veteran (HP 35/40)]"
- Can create new companions via `companions_to_add`
- Can dismiss companions via `companions_to_remove`
- Prompt includes companion cap guidance
- Sees SupportingNPC data as usual; knows which story NPCs are also companions

## UI Changes

### CharacterSidebar

- Outside combat: read from `GameState.companions[]`
- During combat: read from `encounter.activeNPCs` filtered by disposition (existing behavior)
- Show companion name, HP bar, and indicator if linked to a story NPC

No other UI changes needed — combat grid and turn order already handle friendly NPCs.

## Firestore Persistence

- `companions[]` serialized as part of GameState (follows "No Ephemeral Game State" principle)
- `SupportingNPC.companionNpcId` and `SupportingNPC.status` persisted in session's supportingNPCs array
- HP carries between encounters — companions don't auto-heal
- DM can narratively heal companions (short rest, potion) by updating HP via `update_game_state`

## Constraints

- Hard cap of 3 companions maximum
- Companion HP carries over between fights (no auto-heal)
- Generic companions (guards, soldiers) are nameless stat blocks; story comes from SupportingNPC
- XP is never awarded for companion kills (existing rule preserved)
