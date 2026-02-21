# Messages Subcollection + Action Queue Design

## Problem

The current architecture stores `conversationHistory` as an array on the session document. This creates race conditions when multiple players share a session — concurrent writes overwrite each other (last-write-wins). The SSE combat stream is also in-memory only (lost on refresh/reconnect) and doesn't support multiplayer.

## Solution

Two new Firestore subcollections under `sessions/{id}` plus a Firebase client SDK integration for real-time message delivery.

## Messages Subcollection

**Path**: `sessions/{sessionId}/messages/{messageId}`

```typescript
interface StoredMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  characterId?: string;       // which player sent it (null for DM/assistant)
  timestamp: number;
  rollResult?: ParsedRollResult;  // if present, renders DiceRoll component
}
```

All communication — player messages, DM narrations, roll results, combat narrations — stored as individual documents.

**Server-side writes**: Everywhere that currently calls `addConversationTurn()` writes a document to the subcollection instead. No more in-memory array mutation.

**Agent context window**: Before calling an agent, query the last N messages from the subcollection (ordered by timestamp, limited) instead of reading from the singleton's `conversationHistory` array.

**No truncation needed**: Documents stay forever. The 10-turn agent window is just a `.limit(20)` query at call time.

**Replaces**: `conversationHistory` array on session doc, SSE combat stream (`/api/combat/stream`), and `combatEventBus`.

## Action Queue

**Path**: `sessions/{sessionId}/actions/{actionId}`

```typescript
interface StoredAction {
  id?: string;
  characterId: string;
  type: "chat" | "roll" | "combat_action" | "combat_continue";
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: number;
  processedAt?: number;
}
```

**Flow**:
1. Player's POST adds an action doc with `status: "pending"`
2. Same POST runs a Firestore transaction: query oldest pending action, atomically set it to `"processing"`
3. If claim succeeds, process it (run agents, write messages, persist state)
4. When done, mark `"completed"` and check for next pending action — chain-process if one exists
5. If claim fails (another request already processing), return immediately — the active processor picks up this action when it finishes

**Concurrency guarantee**: Only one action per session is ever `"processing"` at a time. The transaction prevents double-claims.

**Failure handling**: If a processing request crashes mid-action, the action stays `"processing"` forever. Staleness check: if `processedAt` is null and `createdAt` > 60s ago, reclaim it.

**Message ordering**: Player messages are NOT written to the subcollection on submit. They are written when the server starts processing that action. This ensures the chat stream is sequential — no interleaving of unrelated messages between a roll and its narration.

## Firebase Client SDK

**New dependency**: `firebase` (client SDK), separate from existing `firebase-admin`.

**New file**: `src/app/lib/firebaseClient.ts` — initializes client Firestore using `NEXT_PUBLIC_` env vars (projectId, apiKey — no secrets).

**Frontend usage**:
- `useChat.tsx` subscribes to `sessions/{sessionId}/messages` via `onSnapshot` ordered by timestamp
- `messages` state derived entirely from the Firestore listener — single source of truth
- API responses no longer return narratives; client gets results via listener

**Roll animations**: Each client tracks animated roll message IDs in a `Set<string>` ref. New messages with `rollResult` animate once; on refresh, render static result.

**Security**: Firestore security rules allow clients to read `sessions/{sessionId}/messages` but writes only via server admin SDK. Client SDK is read-only for game data.

## API Layer Changes

**`POST /api/chat`**: Writes assistant message to subcollection, returns `{ ok: true }` or 202 for queued. No longer returns `narrative` in response.

**`POST /api/roll`**: Still returns roll result directly to the calling player (needed for dice UI input). Also writes roll message to subcollection for other players.

**`POST /api/combat/action`**: Returns `playerResult` for dice UI. Writes roll message to subcollection.

**`POST /api/combat/continue`**: Writes narration messages to subcollection instead of emitting SSE events.

**Removed**: `/api/combat/stream` endpoint, `combatEventBus.ts`.

**New helper**: `getRecentMessages(sessionId, limit)` — queries subcollection server-side for agent context.

**New helper**: `addMessage(sessionId, message)` — writes a document to the messages subcollection.

## What Does NOT Change

- Agent logic (dmAgent, combatAgent, rulesAgent, npcAgent)
- Game state singleton pattern (future refactor)
- Character/session Firestore schema (except removing `conversationHistory` from session doc)
- Encounter storage
