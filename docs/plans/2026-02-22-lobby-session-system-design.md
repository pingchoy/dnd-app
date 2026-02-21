# Lobby & Session System Design

**Date:** 2026-02-22
**Status:** Approved

## Summary

Replace the character-select home page with a session lobby. Players create or join sessions (campaigns), each with a theme, invite code, and member list. Characters are reusable across sessions but can only be in one active session at a time. Firebase Authentication (Google sign-in) gates access.

## Goals

- Session lobby as the app's home page
- Create sessions with a theme and invite code
- Join sessions via invite code
- Characters are independent entities that move between sessions
- Enforce one-active-session-per-character constraint
- Data model supports future multiplayer

## Data Model

### `users/{uid}`

```typescript
interface StoredUser {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  createdAt: number;
  updatedAt: number;
}
```

### `characters/{id}` (updated)

```typescript
interface StoredCharacterV3 {
  id: string;
  ownerId: string;                // Firebase Auth UID
  activeSessionId: string | null; // null = free, set = in a campaign
  player: PlayerState;
  createdAt: number;
  updatedAt: number;
}
```

**Changes from V2:**
- Removed: `sessionId` (replaced by `activeSessionId`)
- Added: `ownerId`, `activeSessionId`

### `sessions/{id}` (updated)

```typescript
interface SessionMember {
  uid: string;
  characterId: string;
  joinedAt: number;
}

interface StoredSessionV2 {
  id: string;
  ownerId: string;                       // Firebase Auth UID of creator
  inviteCode: string;                    // 6-char uppercase alphanumeric, unique
  title: string;                         // campaign title
  theme: string;                         // "dark-fantasy", "classic-adventure", etc.
  settingSummary: string;                // 1-2 sentence setting blurb
  campaignImage: string | null;          // URL or null (placeholder used in UI)
  status: "active" | "completed";
  members: SessionMember[];              // players in this session
  story: StoryState;                     // includes activeEncounterId
  conversationHistory: ConversationTurn[];
  createdAt: number;
  updatedAt: number;
}
```

**Changes from V1:**
- Added: `ownerId`, `inviteCode`, `theme`, `settingSummary`, `campaignImage`, `status`, `members[]`

### `encounters/{id}` (unchanged)

No changes to the encounter model.

## Authentication

- **Provider:** Firebase Authentication, Google sign-in only
- **Client:** `AuthProvider` React context wrapping the app
- **Server:** Firebase Admin SDK verifies ID tokens in API route headers
- **Flow:** Visit `/` → check auth → signed in → lobby, not signed in → sign-in page

## Navigation & Pages

| Route | Purpose |
|-------|---------|
| `/` | Auth gate: redirect to `/lobby` (signed in) or show sign-in (not signed in) |
| `/lobby` | Session list: your sessions + "Create" and "Join" buttons |
| `/lobby/create` | Create session: pick theme → pick/create character → confirm |
| `/lobby/join` | Join session: enter invite code → pick/create character → confirm |
| `/characters` | Character roster: manage characters independent of sessions |
| `/character-creation` | Existing wizard (unchanged) |
| `/dashboard?session=xxx` | Gameplay (keyed by session ID, not character ID) |

**Key change:** Dashboard switches from `characterId` in localStorage to `sessionId` in the URL query parameter.

## Session Create Flow

1. Player clicks "Create Session" on lobby
2. **Pick a theme** — grid of theme cards with icons and descriptions
3. **Pick or create character** — shows characters with `activeSessionId === null`; option to create new
4. **Confirm & start** — creates session doc, sets character's `activeSessionId`, generates invite code, navigates to dashboard

### Themes (initial set)

| Slug | Label | Description |
|------|-------|-------------|
| `classic-adventure` | Classic Adventure | Heroes, dungeons, and dragons |
| `dark-fantasy` | Dark Fantasy | Grim worlds, moral ambiguity, survival |
| `political-intrigue` | Political Intrigue | Courts, alliances, betrayal |
| `seafaring` | Seafaring | Pirates, naval battles, island exploration |
| `urban-mystery` | Urban Mystery | City investigations, guilds, underworld |
| `wilderness-survival` | Wilderness Survival | Harsh environments, exploration, resource management |

## Session Join Flow

1. Player clicks "Join Session" on lobby
2. **Enter invite code** — 6-character uppercase alphanumeric
3. **Validate** — look up session by invite code, check it exists and is active
4. **Pick or create character** — same as create flow (only free characters)
5. **Confirm & join** — adds to session's `members[]`, sets character's `activeSessionId`, navigates to dashboard

### Invite Code Generation

- 6-character uppercase alphanumeric (e.g., `A3KX7B`)
- Generated on session creation
- Stored on session doc
- Uniqueness enforced via Firestore query before saving

## Session Card (Lobby UI)

Each session card displays:
- **Campaign image** (theme-based placeholder for now)
- **Campaign title**
- **Setting summary** (1-2 sentences)
- **Player count** (e.g., "1/4 players")
- **Last played** (relative time)
- **Status badge** ("Active" / "Completed")
- **Your character** name and class in this session

## Character Lifecycle

```
Create character → ownerId set, activeSessionId = null
  ↓
Join/create session → activeSessionId = session.id
  ↓
Play in session → activeSessionId remains set
  ↓
Session completed or player leaves → activeSessionId = null
  ↓
Character is free to join another session
```

**Constraint:** A character with a non-null `activeSessionId` cannot join another session.

## Migration

Existing `characters` and `sessions` docs need migration:
- Characters: add `ownerId` (assign to a default user or require re-auth), rename `sessionId` → `activeSessionId`
- Sessions: add `ownerId`, `inviteCode`, `theme`, `settingSummary`, `campaignImage`, `status`, `members[]`

This can be done via a one-time migration script or lazy migration on first access.
