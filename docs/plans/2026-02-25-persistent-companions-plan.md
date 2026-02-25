# Persistent Companions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist friendly NPCs between encounters so they survive combat, auto-join future fights, and the DM agent knows about them during exploration.

**Architecture:** Add a `companions: NPC[]` field to `StoredSession` (persisted to Firestore). Manage it via a session-level singleton in `gameState.ts` (mirroring the existing `sessionSupportingNPCs` pattern). Expose `companions_to_add` and `companions_to_remove` tool actions to both DM and combat agents. Auto-inject companions into new encounters.

**Tech Stack:** TypeScript, Next.js API routes, Firestore, Anthropic Claude SDK tool schemas

---

### Task 1: Add `companions` field to StoredSession and SupportingNPC types

**Files:**
- Modify: `src/app/lib/gameTypes.ts:723-733` (SupportingNPC interface)
- Modify: `src/app/lib/gameTypes.ts:736-756` (StoredSession interface)

**Step 1: Add `companionNpcId` and `status` to SupportingNPC**

In `src/app/lib/gameTypes.ts`, update the `SupportingNPC` interface (line 723):

```typescript
export interface SupportingNPC {
  id: string;
  name: string;
  role: "ally" | "rival" | "neutral" | "informant" | "merchant" | "quest_giver";
  appearance: string;
  personality: string;
  motivations: string[];
  location: string;
  notes: string;
  combatSlug?: string;
  /** Links to NPC.id in session companions[] when this story NPC is also a combat companion. */
  companionNpcId?: string;
  /** Tracks fate of the NPC across the session. Defaults to "active". */
  status?: "active" | "dead" | "departed";
}
```

**Step 2: Add `companions` to StoredSession**

In `src/app/lib/gameTypes.ts`, update the `StoredSession` interface (line 736):

Add after the `supportingNPCs` field:

```typescript
  /** Persistent friendly NPC companions that survive between encounters. Max 3. */
  companions?: NPC[];
```

**Step 3: Run type-check**

Run: `npx tsc --noEmit`
Expected: PASS (new fields are optional, no existing code breaks)

**Step 4: Commit**

```bash
git add src/app/lib/gameTypes.ts
git commit -m "feat: add companions field to StoredSession and status to SupportingNPC"
```

---

### Task 2: Add `companions_to_add` and `companions_to_remove` to StateChanges

**Files:**
- Modify: `src/app/lib/gameState.ts:627-678` (StateChanges interface)

**Step 1: Add new fields to StateChanges**

In `src/app/lib/gameState.ts`, add to the `StateChanges` interface (after `npcs_to_dismiss`):

```typescript
  /** Friendly NPCs to persist as companions. Looked up from SRD by slug. */
  companions_to_add?: Array<{
    slug: string;
    name?: string;
    supportingNpcId?: string;
  }>;
  /** Companion NPC IDs to remove from the party. */
  companions_to_remove?: string[];
```

**Step 2: Run type-check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/app/lib/gameState.ts
git commit -m "feat: add companions_to_add and companions_to_remove to StateChanges"
```

---

### Task 3: Add companion singleton management to gameState.ts

**Files:**
- Modify: `src/app/lib/gameState.ts`

This follows the exact same singleton pattern as `sessionSupportingNPCs` (line 544).

**Step 1: Add the companion singleton and accessors**

Near line 544 (after the `sessionSupportingNPCs` declaration), add:

```typescript
/** Persistent companions from the session — set by loadGameState(). */
let sessionCompanions: NPC[] | undefined;
```

**Step 2: Add getter/setter/mutator functions**

Near line 603 (after `addSupportingNPC`), add:

```typescript
/** Max number of persistent companions allowed. */
export const MAX_COMPANIONS = 3;

export function getSessionCompanions(): NPC[] {
  return sessionCompanions ?? [];
}

export function addCompanion(npc: NPC): boolean {
  if (!sessionCompanions) sessionCompanions = [];
  if (sessionCompanions.length >= MAX_COMPANIONS) return false;
  sessionCompanions.push(npc);
  return true;
}

export function removeCompanion(npcId: string): NPC | undefined {
  if (!sessionCompanions) return undefined;
  const idx = sessionCompanions.findIndex((c) => c.id === npcId);
  if (idx === -1) return undefined;
  return sessionCompanions.splice(idx, 1)[0];
}

/** Sync a companion's HP/conditions back from an encounter NPC. */
export function syncCompanionFromEncounter(encounterNpc: NPC): void {
  if (!sessionCompanions) return;
  const companion = sessionCompanions.find((c) => c.id === encounterNpc.id);
  if (companion) {
    companion.currentHp = encounterNpc.currentHp;
    companion.conditions = [...encounterNpc.conditions];
  }
}
```

**Step 3: Hydrate companions in loadGameState()**

In `loadGameState()` (near line 1296 where `sessionSupportingNPCs` is hydrated), add:

```typescript
  sessionCompanions = session?.companions;
```

**Step 4: Add serializeCompanions() function**

Near `serializeActiveNPCs()` (line 207), add:

```typescript
export function serializeCompanions(companions: NPC[]): string {
  if (companions.length === 0) return "";
  return (
    "Party companions:\n" +
    companions
      .map(
        (c) =>
          `  [id=${c.id}] ${c.name}: AC ${c.ac}, HP ${c.currentHp}/${c.maxHp}, ATK ${formatModifier(c.attackBonus)} (${c.damageDice}${c.damageBonus ? formatModifier(c.damageBonus) : ""})${c.conditions.length ? ` — ${c.conditions.join(", ")}` : ""}`,
      )
      .join("\n")
  );
}
```

**Step 5: Run type-check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 6: Commit**

```bash
git add src/app/lib/gameState.ts
git commit -m "feat: add companion singleton management to gameState"
```

---

### Task 4: Add companion tool schema to agents

**Files:**
- Modify: `src/app/agents/tools.ts:19-221` (UPDATE_GAME_STATE_TOOL)
- Modify: `src/app/agents/tools.ts:229-282` (COMBAT_UPDATE_GAME_STATE_TOOL)

**Step 1: Add companion fields to UPDATE_GAME_STATE_TOOL**

In `src/app/agents/tools.ts`, add to the `properties` of `UPDATE_GAME_STATE_TOOL` (after `npcs_to_dismiss`):

```typescript
      companions_to_add: {
        type: "array",
        description:
          "Persist friendly NPCs as party companions (max 3 total). Use SRD slug for stats. Companions auto-join future combats.",
        items: {
          type: "object",
          properties: {
            slug: {
              type: "string",
              description: "SRD monster slug for stat lookup (e.g. 'guard', 'veteran', 'knight').",
            },
            name: {
              type: "string",
              description: "Display name. Defaults to the SRD creature name if omitted.",
            },
            supporting_npc_id: {
              type: "string",
              description: "ID of a SupportingNPC to link this companion to (for story NPCs who also fight).",
            },
          },
          required: ["slug"],
        },
      },
      companions_to_remove: {
        type: "array",
        description: "Remove companions from the party by NPC ID. Use when a companion departs or is dismissed.",
        items: { type: "string" },
      },
```

**Step 2: Add same fields to COMBAT_UPDATE_GAME_STATE_TOOL**

Add the same `companions_to_add` and `companions_to_remove` properties to the combat tool schema.

**Step 3: Run type-check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/agents/tools.ts
git commit -m "feat: add companion tool schema to DM and combat agent tools"
```

---

### Task 5: Update DM agent prompt with companion awareness

**Files:**
- Modify: `src/app/agents/dmAgent.ts`

**Step 1: Update system prompt instructions**

In `STATIC_DM_INSTRUCTIONS` (around line 57-61 where friendly NPC instructions live), update/add:

```
COMPANIONS: The party may have persistent companions (shown in CAMPAIGN STATE). These are friendly NPCs who travel with the party between encounters and auto-join combat. You can add new companions with companions_to_add (max 3 total — check current count before adding). You can dismiss companions with companions_to_remove when their narrative role is complete. Narrate their departure naturally.
```

**Step 2: Inject companion context into user message**

In `getDMResponse()` (around line 156-164 where `userContent` is built), inject companion data:

```typescript
const companions = getSessionCompanions();
if (companions.length > 0) {
  userContent += `\n\n${serializeCompanions(companions)}`;
}
if (companions.length >= MAX_COMPANIONS) {
  userContent += `\n(Party is at the companion limit of ${MAX_COMPANIONS}.)`;
}
```

Import `getSessionCompanions`, `serializeCompanions`, and `MAX_COMPANIONS` from `gameState.ts`.

**Step 3: Run type-check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/agents/dmAgent.ts
git commit -m "feat: add companion awareness to DM agent prompt"
```

---

### Task 6: Update combat agent prompt with companion awareness

**Files:**
- Modify: `src/app/agents/combatAgent.ts`

**Step 1: Update system prompt instructions**

In the combat agent's static instructions (around line 47-83), add:

```
COMPANION PERSISTENCE: After combat ends with all hostiles defeated, surviving friendly NPCs may be kept as persistent companions. Use companions_to_add with their SRD slug to persist survivors you think should stay with the party. Friendly NPCs not persisted will depart after the encounter. Use companions_to_remove for any companions that died during combat (HP 0).
```

**Step 2: Inject surviving companion context after combat ends**

The combat agent's `getCombatResponse()` already receives the encounter data. The chat route (Task 7) will inject context about surviving friendlies when combat ends — no changes needed here beyond the prompt update.

**Step 3: Run type-check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/agents/combatAgent.ts
git commit -m "feat: add companion persistence instructions to combat agent"
```

---

### Task 7: Process companion tool actions in chat route

**Files:**
- Modify: `src/app/api/chat/route.ts`

This is the core orchestration task. The chat route needs to:
1. Process `companions_to_add` from agent responses (create NPC stat blocks, add to session)
2. Process `companions_to_remove` from agent responses (remove from session, update SupportingNPC)
3. Auto-inject existing companions into new encounters
4. Sync companion HP after combat
5. Persist companions to Firestore

**Step 1: Import new functions**

At the top of the file, add imports:

```typescript
import {
  getSessionCompanions,
  addCompanion,
  removeCompanion,
  syncCompanionFromEncounter,
  serializeCompanions,
  MAX_COMPANIONS,
} from "../../lib/gameState";
```

**Step 2: Process `companions_to_add` after NPC creation**

After the existing `npcs_to_dismiss` processing block (around line 427), add a new block:

```typescript
// ── Companion persistence ────────────────────────────────────────────────
if (dmResult.stateChanges?.companions_to_add?.length) {
  const requests = dmResult.stateChanges.companions_to_add;
  console.log("[Companions] Adding companions:", requests);

  for (const req of requests) {
    const currentCompanions = getSessionCompanions();
    if (currentCompanions.length >= MAX_COMPANIONS) {
      console.log("[Companions] At cap, skipping:", req.slug);
      break;
    }

    // Look up SRD stats for the companion
    const srdData = await fetchSRDMonster(req.slug);
    const stats = await getNPCStats(req.slug, srdData, "friendly");
    const npc = createNPC(
      req.name ?? stats.name,
      stats,
      "friendly",
      req.slug,
    );

    const added = addCompanion(npc);
    if (added) {
      console.log(`[Companions] Added "${npc.name}" (${npc.id})`);

      // Link to SupportingNPC if specified
      if (req.supportingNpcId) {
        const supportingNPCs = getSessionSupportingNPCs();
        const snpc = supportingNPCs.find((s) => s.id === req.supportingNpcId);
        if (snpc) {
          snpc.companionNpcId = npc.id;
          snpc.status = "active";
        }
      }
    }
  }
  delete dmResult.stateChanges.companions_to_add;
}

if (dmResult.stateChanges?.companions_to_remove?.length) {
  for (const npcId of dmResult.stateChanges.companions_to_remove) {
    const removed = removeCompanion(npcId);
    if (removed) {
      console.log(`[Companions] Removed "${removed.name}"`);

      // Update linked SupportingNPC
      const supportingNPCs = getSessionSupportingNPCs();
      const linked = supportingNPCs.find((s) => s.companionNpcId === npcId);
      if (linked) {
        linked.companionNpcId = undefined;
        linked.status = "departed";
        linked.notes += ` Departed from the party.`;
      }
    }
  }
  delete dmResult.stateChanges.companions_to_remove;
}
```

Note: `fetchSRDMonster`, `getNPCStats`, and `createNPC` are already used in the existing NPC creation block — reuse the same functions. Check exact import names from the existing code.

**Step 3: Auto-inject companions into new encounters**

In the NPC creation block (around line 310-415), after a new encounter is created and NPCs are added, inject existing companions:

```typescript
// Inject persistent companions into the new encounter
const companions = getSessionCompanions();
if (needsEncounter && enc && companions.length > 0) {
  for (const companion of companions) {
    // Add companion to encounter's active NPCs (clone to avoid shared references)
    enc.activeNPCs.push({ ...companion });
  }
  console.log(`[Encounter] Injected ${companions.length} persistent companion(s)`);
}
```

This should go BEFORE the `computeInitialPositions` and turn order initialization calls so companions are included.

**Step 4: Sync companion HP after combat ends**

In the `combatJustEnded` block (around line 545), add companion HP sync:

```typescript
if (combatJustEnded) {
  // Sync surviving companion HP back from encounter
  const endedEncounter = getEncounter();
  if (endedEncounter) {
    for (const npc of endedEncounter.activeNPCs) {
      if (npc.disposition === "friendly" && npc.currentHp > 0) {
        syncCompanionFromEncounter(npc);
      } else if (npc.disposition === "friendly" && npc.currentHp <= 0) {
        // Companion died — remove from persistent companions
        const removed = removeCompanion(npc.id);
        if (removed) {
          console.log(`[Companions] "${removed.name}" died in combat — removed`);
          // Update linked SupportingNPC
          const supportingNPCs = getSessionSupportingNPCs();
          const linked = supportingNPCs.find((s) => s.companionNpcId === npc.id);
          if (linked) {
            linked.companionNpcId = undefined;
            linked.status = "dead";
            linked.notes += ` Killed in combat.`;
          }
        }
      }
    }
  }
}
```

**Step 5: Persist companions to Firestore**

In the persistence block (around line 536-540), add companion persistence alongside supportingNPCs:

```typescript
// Persist session-level data
const supportingNPCs = getSessionSupportingNPCs();
const companions = getSessionCompanions();
const sessionUpdates: Partial<StoredSession> = {};
if (supportingNPCs.length > 0) sessionUpdates.supportingNPCs = supportingNPCs;
sessionUpdates.companions = companions; // Always persist (even empty array clears old data)
await saveSessionState(sessionId, sessionUpdates);
```

This replaces the existing `supportingNPCs`-only save.

**Step 6: Include companions in GET response**

In the GET handler (around line 759), the response already returns `gameState` which now includes everything. But companions live on the session, not on GameState. Add to the GET response:

```typescript
return NextResponse.json({
  gameState,
  encounter: getEncounter(),
  companions: getSessionCompanions(),  // NEW
  sessionId,
  // ... existing fields
});
```

And in the POST response (around line 608):

```typescript
return {
  gameState: getGameState(),
  encounter: getEncounter(),
  companions: getSessionCompanions(),  // NEW
  // ... existing fields
};
```

**Step 7: Run type-check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 8: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: process companion tool actions and persist to Firestore"
```

---

### Task 8: Handle companion death in combat resolve route

**Files:**
- Modify: `src/app/api/combat/resolve/route.ts`

**Step 1: Sync companion HP after each combat round**

After all NPC turns resolve and before the response is sent, sync surviving companion HP and remove dead ones:

```typescript
import { syncCompanionFromEncounter, removeCompanion, getSessionSupportingNPCs } from "../../lib/gameState";

// After all turns resolved, sync companion state
for (const npc of encounter.activeNPCs) {
  if (npc.disposition === "friendly") {
    if (npc.currentHp > 0) {
      syncCompanionFromEncounter(npc);
    } else {
      const removed = removeCompanion(npc.id);
      if (removed) {
        console.log(`[Companions] "${removed.name}" killed in combat — removed`);
        const supportingNPCs = getSessionSupportingNPCs();
        const linked = supportingNPCs.find((s) => s.companionNpcId === npc.id);
        if (linked) {
          linked.companionNpcId = undefined;
          linked.status = "dead";
          linked.notes += ` Killed in combat.`;
        }
      }
    }
  }
}
```

**Step 2: Persist companion changes after combat resolve**

After the encounter state is saved, also persist session companions:

```typescript
import { getSessionCompanions } from "../../lib/gameState";
import { saveSessionState } from "../../lib/characterStore";

// Persist companion state alongside encounter state
await saveSessionState(sessionId, {
  companions: getSessionCompanions(),
  supportingNPCs: getSessionSupportingNPCs(),
});
```

**Step 3: Run type-check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/api/combat/resolve/route.ts
git commit -m "feat: sync companion state during combat resolution"
```

---

### Task 9: Update frontend to display persistent companions

**Files:**
- Modify: `src/app/dashboard/page.tsx` (lines 150-154, 656-658)
- Modify: `src/app/hooks/useChat.tsx`

**Step 1: Add companions state to useChat hook**

The hook needs to track `companions` from both the GET response (initial load) and POST responses (after each turn). Add state management:

```typescript
// In useChat or the dashboard, track companions from API responses
const [persistentCompanions, setPersistentCompanions] = useState<NPC[]>([]);
```

Update the API response handlers to capture companions:

```typescript
// In the GET response handler:
if (data.companions) setPersistentCompanions(data.companions);

// In the POST response handler:
if (data.companions) setPersistentCompanions(data.companions);
```

**Step 2: Update dashboard companions derivation**

In `src/app/dashboard/page.tsx` (around line 152), update the companions memo:

```typescript
const companions = useMemo(() => {
  // During combat, show encounter's friendly NPCs (live HP updates from combat grid)
  if (encounter) {
    return activeNPCs.filter(n => n.disposition === "friendly" && n.currentHp > 0);
  }
  // Outside combat, show persistent companions from session
  return persistentCompanions;
}, [encounter, activeNPCs, persistentCompanions]);
```

**Step 3: Run type-check and dev server**

Run: `npx tsc --noEmit`
Expected: PASS

Run: `npm run dev` — verify sidebar shows companions outside combat.

**Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx src/app/hooks/useChat.tsx
git commit -m "feat: display persistent companions in sidebar outside combat"
```

---

### Task 10: Inject surviving friendly NPC context for post-combat agent call

**Files:**
- Modify: `src/app/api/chat/route.ts`

When combat just ended and the DM/combat agent is called for the first post-combat turn, inject context about surviving friendly NPCs so the agent can decide who to persist.

**Step 1: Detect post-combat state and inject context**

Before the agent call (around the `inCombat` check at line 159), check if combat *just* ended on a previous turn and there are surviving friendlies not yet persisted. This can be detected by checking if the encounter has friendly NPCs but is no longer in combat mode.

In practice, the simplest approach: when `combatJustEnded` is true (line 545), build a context string for the NEXT agent call. Since combat ending and the next agent call happen in the same request cycle, inject the context directly:

After combat ends and before the DM agent call, add to the user content:

```typescript
// If combat just ended and there are surviving friendly NPCs not in companions[], prompt the agent
if (combatJustEnded) {
  const endedEncounter = /* reference to encounter before it was cleared */;
  const survivingFriendlies = endedEncounter.activeNPCs.filter(
    (n) => n.disposition === "friendly" && n.currentHp > 0
  );
  const existingCompanionIds = new Set(getSessionCompanions().map((c) => c.id));
  const newFriendlies = survivingFriendlies.filter((n) => !existingCompanionIds.has(n.id));

  if (newFriendlies.length > 0) {
    const names = newFriendlies.map((n) => `${n.name} (${n.slug ?? "unknown"})`).join(", ");
    // Append to player input context for the agent
    playerInputWithContext += `\n\n[SYSTEM: The following friendly NPCs survived combat: ${names}. Use companions_to_add to keep any as persistent companions, or narrate their departure.]`;
  }
}
```

Note: The exact placement depends on whether the combat agent or DM agent handles the post-combat turn. Check the `inCombat` flag — when `combatJustEnded` is true, `inCombat` was true at the start of the request, so the combat agent handles this turn. The context should be added to the combat agent's input.

**Step 2: Run type-check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: inject surviving friendly NPC context for post-combat persistence"
```

---

### Task 11: Persist companions in persistState

**Files:**
- Modify: `src/app/lib/gameState.ts:1327-1333` (persistState function)

Currently `persistState` saves only `player` and `story`. Since companions live on the session doc (not the character doc), they need to be saved via `saveSessionState` — which is already handled in the chat route (Task 7). However, we should also ensure `applyStateChangesAndPersist` handles companion saves for completeness.

**Step 1: Add companion persistence to applyStateChangesAndPersist**

In `applyStateChangesAndPersist()` (around line 1341), after `persistState(characterId)`, add:

```typescript
  // Persist session-level companions
  const sessionId = getSessionId();
  if (sessionId) {
    await saveSessionState(sessionId, {
      companions: getSessionCompanions(),
    });
  }
```

Note: Check if this duplicates the save in the chat route. If so, remove the one in the chat route and centralize here. The goal is a single save path.

**Step 2: Run type-check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/app/lib/gameState.ts
git commit -m "feat: persist companions in applyStateChangesAndPersist"
```

---

### Task 12: End-to-end manual test

**No files to modify — this is a verification task.**

**Step 1: Run the type-checker**

Run: `npx tsc --noEmit`
Expected: PASS with zero errors

**Step 2: Run the linter**

Run: `npm run lint`
Expected: PASS

**Step 3: Run existing tests**

Run: `npm test` (or `npx jest` if configured)
Expected: All existing tests pass

**Step 4: Manual test plan**

1. Start a new session with a character
2. Have the DM introduce a friendly NPC (e.g., "A guard offers to accompany you")
3. Verify the companion appears in the sidebar
4. Trigger combat — verify the companion auto-joins the encounter
5. Survive combat — verify the companion persists after combat ends
6. Refresh the page — verify the companion still appears (Firestore persistence)
7. Trigger another combat — verify the companion auto-joins with their current HP
8. Have the DM dismiss the companion — verify they disappear from sidebar

**Step 5: Final commit**

If any fixes were needed during testing, commit them.
