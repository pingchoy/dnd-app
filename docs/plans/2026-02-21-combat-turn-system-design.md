# Combat Turn System Design

## Problem

Combat currently resolves all turns in a single combat agent call — the player acts, all NPCs react, and one big narrative block comes back. There is no concept of individual turns or rounds. Each entity should have its own turn with its own narrative entry.

## Approach

Turn-based combat with SSE (Server-Sent Events) for real-time turn streaming. Player always goes first, then each NPC acts in sequence. Each turn is a separate AI call producing a separate chat entry. SSE chosen over client-loop polling to support future multiplayer (all connected browsers receive turn events).

## Turn & Round Model

### New fields on StoredEncounter

```ts
turnOrder: string[];        // ["player", npcId1, npcId2, ...] — player always first
currentTurnIndex: number;   // 0 = player's turn, 1+ = NPC turns
round: number;              // already exists, incremented when all turns complete
```

### Turn lifecycle

1. Round starts → `currentTurnIndex = 0` (player's turn), push `round_start` event
2. Player submits action via POST → player turn resolves → push `player_turn` event → `currentTurnIndex = 1`
3. Pre-roll NPC 1's attack → call combat agent for NPC 1 → apply damage → push `npc_turn` event → `currentTurnIndex = 2`
4. Pre-roll NPC 2's attack → call combat agent for NPC 2 → apply damage → push `npc_turn` event → `currentTurnIndex = 3`
5. All NPCs done → round increments → `currentTurnIndex = 0` → push `round_end` event → player input unblocks
6. If player dies mid-round (HP <= 0), remaining NPC turns skipped, push `player_dead` event
7. If an NPC dies during the player's turn, it's removed from the NPC turn sequence (dead NPCs don't act)

## SSE Infrastructure

### Endpoint: `/api/combat/stream` (GET, SSE)

Client connects when combat begins. Connection stays open for the entire encounter.

### Event types

```ts
{ type: "round_start", round: number }
{ type: "player_turn", playerId: string, narrative: string }
{ type: "npc_turn", npcId: string, narrative: string }
{ type: "round_end", round: number }
{ type: "player_dead", playerId: string, narrative: string }
{ type: "combat_end" }
```

Events carry narrative and identifiers only. Game state (HP, NPC status, etc.) is fetched separately by the client after each event.

### Server-side flow

1. Client opens EventSource to `/api/combat/stream?encounterId=xxx` at combat start
2. Player submits action via POST to `/api/combat/action`
3. Server resolves player turn, pushes `player_turn` event
4. Server loops through hostile NPCs in `turnOrder` sequence:
   - Pre-roll just this one NPC's attack (d20 + attackBonus vs player AC, damage if hit)
   - Call combat agent (Haiku) with only this NPC's name, stats, and pre-rolled result
   - Apply damage to player immediately, persist to Firestore
   - Push `npc_turn` event
   - If player HP <= 0, push `player_dead`, stop loop
5. After all NPCs: push `round_end`, increment round, reset `currentTurnIndex` to 0
6. Connection closes on `combat_end` or client disconnect

### Pre-rolling

NPC attacks are pre-rolled **one at a time**, immediately before that NPC's combat agent call. No upfront batch rolling — each call only sees its own NPC's result.

## Combat Agent Changes

### NPC turn calls (new)

- System prompt: "Narrate this NPC's turn in 1 paragraph. Use the exact pre-rolled attack result."
- Input: NPC name + stats, its single pre-rolled attack result, player name + current HP
- Output: narrative text only, no tool calls
- Damage applied deterministically by the server, not the agent

### Player turn calls (modified)

- System prompt: "Narrate the player's turn in up to 2 paragraphs."
- Input: player action, player roll result, target NPC stats
- Output: narrative + `update_npc` tool call for damage to the target
- Existing pattern, largely unchanged

## API Endpoint Changes

### Modified: `/api/combat/action` (POST)

- Currently resolves player turn + all NPC turns in one shot
- Change: Only resolves the player's turn. After resolution, pushes `player_turn` event to SSE stream, then triggers the NPC turn loop.

### New: `/api/combat/stream` (GET, SSE)

- Persistent SSE connection for the duration of combat
- Pushes all turn events
- Server loops through NPC turns sequentially after player turn resolves

## Frontend Changes

### SSE connection (`useChat` hook)

- When encounter starts with hostile NPCs → open EventSource to `/api/combat/stream?encounterId=xxx`
- On `round_start`: update round display
- On `player_turn`: append chat entry
- On `npc_turn`: append chat entry, refetch game state for updated HP
- On `round_end`: unblock player input
- On `player_dead`: handle death state
- On `combat_end`: close EventSource, transition to exploration
- When encounter ends → close EventSource

### Input blocking

- After player submits action, disable input
- Re-enable only on `round_end` event

### Chat entries

- Each turn (player or NPC) becomes its own ChatCard
- Player turns: up to 2 paragraphs
- NPC turns: ~1 paragraph

### Turn Order Bar (new component)

- `TurnOrderBar` component positioned top-left of the combat area
- Reads `turnOrder` and `currentTurnIndex` from encounter state
- Renders each entity ID as a chip/tag
- Active turn gets a visual indicator (highlight/border)
- Updates reactively as SSE events advance `currentTurnIndex`
- Display entity IDs for now (names can be added later)

## Out of Scope

- Initiative rolls (player always goes first, NPCs go in sequence after)
- Bonus actions, reactions, movement phase
- Multiplayer (architecture supports it via SSE, but not implementing now)
