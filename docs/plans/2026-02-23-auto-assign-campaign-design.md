# Auto-Assign Campaign to All Sessions

**Date:** 2026-02-23
**Status:** Approved

## Problem

The campaign system is fully defined (Campaign → Acts → Encounters → NPCs → Maps) but sessions are created with placeholder story data (`"A New Adventure"`) and no link back to a campaign. Campaign data must be manually loaded on-demand with no session-level reference.

## Goal

Since there is currently only one campaign (`the-crimson-accord`), automatically assign it to every new session at creation time. This wires up the campaign slug so agents can query campaign acts, NPCs, and maps from the session context.

## Design

### 1. Default Campaign Constant

Add to `gameTypes.ts`:

```ts
export const DEFAULT_CAMPAIGN_SLUG = "the-crimson-accord";
```

### 2. StoredSession — Add `campaignSlug`

```ts
export interface StoredSession {
  id?: string;
  story: StoryState;
  campaignSlug?: string;          // ← NEW
  characterIds: string[];
  activeMapId?: string;
  explorationPositions?: Record<string, GridPosition>;
  createdAt?: number;
  updatedAt?: number;
}
```

### 3. `createSession()` — Accept and persist `campaignSlug`

Update signature to accept an optional `campaignSlug` parameter and write it to the session document.

### 4. `createCharacter()` — Campaign-aware initialization

After creating the session:
1. If a `campaignSlug` is provided, call `instantiateCampaignMaps(campaignSlug, sessionId)`.
2. Set the first instantiated map as `activeMapId` on the session.

### 5. Character Creation API (`/api/characters/route.ts`)

Update the POST handler:
1. Fetch the campaign via `getCampaign(DEFAULT_CAMPAIGN_SLUG)`.
2. Override `story.campaignTitle` and `story.campaignBackground` from campaign data (`campaign.title`, `campaign.playerTeaser`).
3. Pass `DEFAULT_CAMPAIGN_SLUG` through to `createCharacter` → `createSession`.

### 6. `useCharacterCreation.ts` — Update `buildDefaultStory()`

Update the default story to use the campaign slug constant on the client side. The server-side API will override title/background from the actual campaign data, but the client should send the slug so the API knows which campaign to load.

## Files Modified

| File | Change |
|------|--------|
| `src/app/lib/gameTypes.ts` | Add `DEFAULT_CAMPAIGN_SLUG` constant, add `campaignSlug` to `StoredSession` |
| `src/app/lib/characterStore.ts` | Update `createSession()` and `createCharacter()` signatures |
| `src/app/api/characters/route.ts` | Fetch campaign, override story fields, pass slug through |
| `src/app/hooks/useCharacterCreation.ts` | Update `buildDefaultStory()` defaults |

## What Does NOT Change

- Agent logic (DM, combat, rules) — unchanged
- Game flow — unchanged
- Map editor — unchanged
- Frontend UI — unchanged (already displays `campaignTitle` from story state)
