# Auto-Assign Campaign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically assign the sole campaign (`the-crimson-accord`) to every new session at creation time, persisting the campaign slug on the session and populating story fields from campaign data.

**Architecture:** Add `DEFAULT_CAMPAIGN_SLUG` constant and `campaignSlug` field to `StoredSession`. Thread the slug through `createSession()` → `createCharacter()`. The `/api/characters` POST handler fetches campaign data, overrides story defaults, and instantiates campaign maps into the session.

**Tech Stack:** TypeScript, Next.js API routes, Firebase Firestore, React hooks

---

### Task 1: Add `DEFAULT_CAMPAIGN_SLUG` constant and `campaignSlug` to `StoredSession`

**Files:**
- Modify: `src/app/lib/gameTypes.ts:615-626` (StoredSession interface)
- Modify: `src/app/lib/gameTypes.ts:368` (after StoryState, before Campaign Map Types)

**Step 1: Add the constant**

After the `StoryState` interface closing brace (line 368), add:

```ts
/** The only campaign currently available. Used as default for all new sessions. */
export const DEFAULT_CAMPAIGN_SLUG = "the-crimson-accord";
```

**Step 2: Add `campaignSlug` to `StoredSession`**

In the `StoredSession` interface (line 616), add after `story: StoryState;`:

```ts
  /** Campaign this session belongs to. */
  campaignSlug?: string;
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors (existing errors are OK)

**Step 4: Commit**

```bash
git add src/app/lib/gameTypes.ts
git commit -m "feat: add DEFAULT_CAMPAIGN_SLUG constant and campaignSlug to StoredSession"
```

---

### Task 2: Thread `campaignSlug` through `createSession()` and `createCharacter()`

**Files:**
- Modify: `src/app/lib/characterStore.ts:150-162` (createSession)
- Modify: `src/app/lib/characterStore.ts:191-213` (createCharacter)

**Step 1: Update `createSession()` to accept and persist `campaignSlug`**

Change the signature and body at lines 150-162:

```ts
export async function createSession(
  story: StoryState,
  characterId: string,
  campaignSlug?: string,
): Promise<string> {
  const ref = adminDb.collection("sessions").doc();
  await ref.set({
    story,
    characterIds: [characterId],
    ...(campaignSlug ? { campaignSlug } : {}),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return ref.id;
}
```

**Step 2: Update `createCharacter()` to accept and pass `campaignSlug`**

Change the signature at lines 191-213:

```ts
export async function createCharacter(
  player: PlayerState,
  story: StoryState,
  campaignSlug?: string,
): Promise<string> {
  const charRef = adminDb.collection("characters").doc();
  const now = Date.now();

  // Create character doc first so we have the ID for the session
  await charRef.set({
    player,
    sessionId: "", // placeholder — updated below
    createdAt: now,
    updatedAt: now,
  });

  // Create session doc linked to this character
  const sessionId = await createSession(story, charRef.id, campaignSlug);

  // Link the character to its session
  await charRef.update({ sessionId });

  return charRef.id;
}
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

**Step 4: Commit**

```bash
git add src/app/lib/characterStore.ts
git commit -m "feat: thread campaignSlug through createSession and createCharacter"
```

---

### Task 3: Update `/api/characters` POST to fetch campaign and instantiate maps

**Files:**
- Modify: `src/app/api/characters/route.ts:42-65` (POST handler)

**Step 1: Add imports and update the POST handler**

Add imports at top of file (after existing imports):

```ts
import { DEFAULT_CAMPAIGN_SLUG } from "../../lib/gameTypes";
import { getCampaign } from "../../lib/characterStore";
import { instantiateCampaignMaps } from "../../lib/mapStore";
import { saveSessionState } from "../../lib/characterStore";
```

Note: `getCampaign` and `saveSessionState` are already exported from characterStore; merge with the existing import line.

**Step 2: Update the POST handler body**

Replace the POST handler (lines 42-65) with:

```ts
export async function POST(request: NextRequest) {
  try {
    interface CreateCharacterBody {
      player: PlayerState;
      story: StoryState;
    }

    const body = await request.json() as CreateCharacterBody;
    const { player, story } = body;

    if (!player || !story) {
      return NextResponse.json(
        { error: "player and story are required" },
        { status: 400 },
      );
    }

    // Fetch the default campaign and override story fields
    const campaign = await getCampaign(DEFAULT_CAMPAIGN_SLUG);
    if (campaign) {
      story.campaignTitle = campaign.title;
      story.campaignBackground = campaign.playerTeaser;
    }

    const id = await createCharacter(player, story, DEFAULT_CAMPAIGN_SLUG);

    // Instantiate campaign maps into the new session
    if (campaign) {
      // Load the character to get its sessionId
      const charSnap = await (await import("../../lib/firebaseAdmin")).adminDb
        .collection("characters").doc(id).get();
      const sessionId = charSnap.data()?.sessionId as string;
      if (sessionId) {
        const maps = await instantiateCampaignMaps(DEFAULT_CAMPAIGN_SLUG, sessionId);
        if (maps.length > 0) {
          await saveSessionState(sessionId, { activeMapId: maps[0].id });
        }
      }
    }

    return NextResponse.json({ id });
  } catch (err) {
    console.error("[/api/characters] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

**Step 4: Commit**

```bash
git add src/app/api/characters/route.ts
git commit -m "feat: auto-assign campaign and instantiate maps on character creation"
```

---

### Task 4: Update `buildDefaultStory()` in useCharacterCreation

**Files:**
- Modify: `src/app/hooks/useCharacterCreation.ts:173-183` (buildDefaultStory)

**Step 1: Update the default story values**

The server now overrides these from campaign data, but let's set reasonable defaults that indicate the campaign is being loaded. Replace lines 173-183:

```ts
function buildDefaultStory(name: string, className: string): StoryState {
  return {
    campaignTitle: "",
    campaignBackground: "",
    currentLocation: "",
    currentScene: `${name} the ${className} has arrived, ready to make their mark on the world.`,
    activeQuests: [],
    importantNPCs: [],
    recentEvents: [],
  };
}
```

Empty strings for `campaignTitle`, `campaignBackground`, and `currentLocation` signal that the server should populate them from campaign data. The `currentScene` is kept since it's character-specific.

**Step 2: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/app/hooks/useCharacterCreation.ts
git commit -m "feat: clear default story fields so server populates from campaign data"
```

---

### Task 5: Update existing tests

**Files:**
- Modify: `src/app/lib/gameState.test.ts:67-68`
- Modify: `src/app/agents/dmAgent.test.ts:82-83`
- Modify: `src/app/api/chat/route.test.ts:125`

**Step 1: Update test fixtures**

In each test file, the story fixtures use hardcoded `campaignTitle` and `campaignBackground` strings. These are still valid — no changes needed since `StoryState` type hasn't changed. Just verify tests still pass.

**Step 2: Run tests**

Run: `npx jest --passWithNoTests 2>&1 | tail -20`
Expected: All existing tests pass

**Step 3: Commit (only if any test fixes needed)**

```bash
git commit -m "test: fix tests for campaign auto-assignment"
```

---

### Task 6: Final verification

**Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 2: Lint check**

Run: `npm run lint 2>&1 | tail -20`
Expected: No new lint errors

**Step 3: Run full test suite**

Run: `npx jest --passWithNoTests`
Expected: All tests pass
