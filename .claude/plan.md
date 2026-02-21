# Plan: Encounters Collection + Persistent Combat State

## Problem
- Grid positions are ephemeral (React state only) — lost on page reload
- `activeNPCs` lives in `sessions/{id}.story` mixing combat data with narrative data
- Combat agent receives full `GameState` including story/quests/campaign background it doesn't need
- No dedicated data structure for combat encounters

## Solution: New `encounters` Firestore collection

### Encounter Document Schema

```typescript
// In gameTypes.ts
interface GridPosition {
  row: number;
  col: number;
}

interface StoredEncounter {
  id?: string;
  sessionId: string;           // link back to session
  characterId: string;         // link to character
  status: "active" | "completed";
  activeNPCs: NPC[];           // all combatants in this encounter
  positions: Record<string, GridPosition>;  // "player" | npc.id → {row, col}
  gridSize: number;            // 20
  round: number;               // combat round tracker
  // Denormalized context for combat agent narration (snapshot at encounter start)
  location: string;
  scene: string;
  createdAt: number;
  updatedAt: number;
}
```

### Data Flow Changes

**Current:** `story.activeNPCs` in sessions → ephemeral grid in React state → combat agent reads full GameState

**New:**
1. DM creates hostile NPCs → **encounter doc created** in Firestore with NPCs + initial grid positions
2. `story.activeEncounterId` set on session to link to active encounter
3. Frontend loads encounter data (positions from Firestore, not ephemeral)
4. Player drags token → `POST /api/encounter/move` → position persisted to encounter doc
5. Combat agent reads **encounter doc + character doc only** (no session)
6. Combat ends → encounter marked `"completed"`, `activeEncounterId` cleared from session
7. `story.activeNPCs` cleared from session (NPCs live in encounter during combat)

### Files to Change

#### 1. Types (`src/app/lib/gameTypes.ts`)
- Move `GridPosition` from `useCombatGrid.ts` to here (shared between client + server)
- Add `StoredEncounter` interface
- Add `activeEncounterId?: string` to `StoryState`

#### 2. Encounter Store (`src/app/lib/encounterStore.ts`) — NEW
Firestore CRUD for the `encounters` collection:
- `createEncounter(sessionId, characterId, npcs, location, scene)` → creates doc, returns encounter with initial grid positions (player center, NPCs on edges — reuse `findEdgeSlot` logic server-side)
- `loadEncounter(encounterId)` → read encounter doc
- `loadActiveEncounter(sessionId)` → query for active encounter by sessionId
- `saveEncounterState(encounterId, updates)` → partial update (NPCs, positions, round, status)
- `updateTokenPosition(encounterId, tokenId, position)` → lightweight position-only update
- `completeEncounter(encounterId)` → mark status = "completed"

#### 3. Game State (`src/app/lib/gameState.ts`)
- Add encounter-aware helpers:
  - When NPCs are created during combat, they go into the encounter doc
  - `updateNPC()` writes to encounter's activeNPCs instead of story's
  - New `loadEncounterState()` to hydrate encounter data alongside game state
- Modify `applyStateChangesAndPersist()` to persist encounter changes separately from session
- `createNPC()` should add to encounter when one is active, not to story

#### 4. Chat API Route (`src/app/api/chat/route.ts`)
- On NPC creation: if no active encounter exists and hostile NPCs are being created, create an encounter
- Combat detection: check `story.activeEncounterId` instead of scanning activeNPCs in story
- Pass encounter data to combat agent instead of full gameState
- When all hostile NPCs dead: complete the encounter, clear `activeEncounterId`
- Non-combat turns: DM agent still uses sessions as before

#### 5. New API Route (`src/app/api/encounter/move/route.ts`) — NEW
Lightweight endpoint for grid position updates:
```
POST /api/encounter/move
Body: { encounterId: string, tokenId: string, position: GridPosition }
Response: { success: true }
```
Just a Firestore field update — no AI calls, no game logic. Fast and cheap.

#### 6. Combat Agent (`src/app/agents/combatAgent.ts`)
- Change signature: receive encounter data + player state (not full GameState)
- System prompt context: use encounter's denormalized location/scene
- NPC list comes from encounter, not story
- Conversation history: use encounter-scoped history (or keep passing recent turns from session)

#### 7. Frontend Hook (`src/app/hooks/useCombatGrid.ts`)
- On combat start: load positions from encounter doc (not generate ephemeral ones)
- `moveToken()` calls `POST /api/encounter/move` to persist
- Remove local-only position generation — server handles initial placement in `createEncounter()`
- Still maintains local state for instant UI feedback (optimistic update)

#### 8. Dashboard (`src/app/dashboard/page.tsx`)
- Pass `encounterId` to CombatGrid and useChat
- Combat detection: use `activeEncounterId` presence instead of scanning NPCs

#### 9. GET /api/chat
- When returning game state, include encounter data if `activeEncounterId` is set
- Frontend gets positions + NPC data from encounter, not from story.activeNPCs

### Migration / Backwards Compatibility
- Existing sessions with `activeNPCs` in story will still work — if no `activeEncounterId` exists, fall back to old behavior
- First hostile NPC creation on an old session will create an encounter and migrate NPCs

### What the Combat Agent NO LONGER Receives
- `story.campaignTitle`, `story.campaignBackground`, `story.activeQuests`
- `story.importantNPCs`, `story.recentEvents`
- Full `conversationHistory` (only recent combat turns)

### What the Combat Agent DOES Receive
- Player state (from `characters/{id}`)
- Encounter data: `activeNPCs`, `positions`, `round`, `location`, `scene`
- Recent combat conversation turns (last few from session history)

### Order of Implementation
1. Types + shared GridPosition
2. encounterStore.ts (Firestore CRUD)
3. gameState.ts modifications (encounter-aware NPC management)
4. POST /api/encounter/move (position persistence endpoint)
5. Chat route changes (encounter creation/completion, combat agent routing)
6. Combat agent signature change
7. Frontend hook + dashboard changes (load/persist positions)
8. GET /api/chat response shape (include encounter data)
