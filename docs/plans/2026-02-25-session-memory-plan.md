# Session Memory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add persistent session memory (importantEvents + supportingNPCs) so the DM agent can record and recall significant events and emergent NPCs across the entire campaign.

**Architecture:** Two new arrays on the session document (importantEvents, supportingNPCs), a new `important_event` field on StateChanges, two new DM tools (`create_supporting_npc`, `query_session_memory`), and a lightweight Haiku-powered supporting NPC agent. All handled within the DM's existing tool-use loop.

**Tech Stack:** TypeScript, Anthropic Claude SDK (Haiku), Firestore, Vitest

---

### Task 1: Add SupportingNPC type and StoredSession fields

**Files:**
- Modify: `src/app/lib/gameTypes.ts:720-736` (StoredSession interface)

**Step 1: Add the SupportingNPC interface and update StoredSession**

In `src/app/lib/gameTypes.ts`, add the `SupportingNPC` interface before `StoredSession`, and add the two new optional fields to `StoredSession`:

```typescript
/** A non-campaign NPC that emerged during play and is worth remembering. */
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
}
```

Add to `StoredSession`:
```typescript
  /** Important events worth remembering long-term (alliances, secrets, promises). */
  importantEvents?: string[];
  /** Non-campaign NPCs that emerged during play. */
  supportingNPCs?: SupportingNPC[];
```

**Step 2: Commit**

```bash
git add src/app/lib/gameTypes.ts
git commit -m "feat: add SupportingNPC type and session memory fields"
```

---

### Task 2: Add important_event to StateChanges and wire up mutation + merge logic

**Files:**
- Modify: `src/app/lib/gameState.ts:603-650` (StateChanges interface)
- Modify: `src/app/lib/gameState.ts:662-731` (mergeStateChanges)
- Modify: `src/app/lib/gameState.ts:744-822` (applyStateChanges)

**Step 1: Write the failing test**

In `src/app/lib/gameState.test.ts`, add a test for `important_event`:

```typescript
it("important_event pushes to session importantEvents", async () => {
  await hydrateState();
  applyStateChanges({ important_event: "allied with the dockworkers guild" });
  const gs = getGameState();
  expect(gs.story.importantEvents).toContain("allied with the dockworkers guild");
});

it("important_event caps at 50 entries", async () => {
  await hydrateState();
  for (let i = 0; i < 55; i++) {
    applyStateChanges({ important_event: `event-${i}` });
  }
  const events = getGameState().story.importantEvents!;
  expect(events).toHaveLength(50);
  expect(events[0]).toBe("event-5");
  expect(events[49]).toBe("event-54");
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/lib/gameState.test.ts -t "important_event"`
Expected: FAIL — `important_event` not recognized in StateChanges, `importantEvents` not on StoryState

**Step 3: Add important_event to StateChanges interface**

In `src/app/lib/gameState.ts`, add to the `StateChanges` interface (after `notable_event`):

```typescript
  /** An important event to remember permanently (e.g. "allied with the dockworkers guild"). More granular than milestones, never rolls off like recentEvents. */
  important_event?: string;
```

**Step 4: Add importantEvents to StoryState**

Since `applyStateChanges` mutates `state.story`, we need `importantEvents` on `StoryState` as well. In `src/app/lib/gameTypes.ts`, add to `StoryState`:

```typescript
  /** Long-term important events (alliances, secrets, promises). Persisted to session doc. */
  importantEvents?: string[];
```

Note: We'll persist this to the session document. The field lives on `StoryState` for in-memory convenience (the story object is what the DM agent sees), and `saveCharacterState` already writes `story` to the session doc.

**Step 5: Add important_event to mergeStateChanges**

In the "Scalar strings — latest wins" section of `mergeStateChanges`, add `"important_event"` to the array:

```typescript
  for (const key of [
    "location_changed",
    "scene_update",
    "notable_event",
    "important_event",
    "milestone",
    // ...rest
  ] as const) {
```

**Step 6: Add important_event mutation to applyStateChanges**

After the `notable_event` block (line ~783), add:

```typescript
  if (changes.important_event) {
    if (!s.importantEvents) s.importantEvents = [];
    s.importantEvents.push(changes.important_event.toLowerCase());
    if (s.importantEvents.length > 50) s.importantEvents = s.importantEvents.slice(-50);
  }
```

**Step 7: Run test to verify it passes**

Run: `npx vitest run src/app/lib/gameState.test.ts -t "important_event"`
Expected: PASS

**Step 8: Commit**

```bash
git add src/app/lib/gameTypes.ts src/app/lib/gameState.ts src/app/lib/gameState.test.ts
git commit -m "feat: add important_event to StateChanges with mutation and merge logic"
```

---

### Task 3: Add important_event to update_game_state tool schema

**Files:**
- Modify: `src/app/agents/tools.ts:58-61` (after notable_event property)

**Step 1: Add important_event property to UPDATE_GAME_STATE_TOOL**

In `src/app/agents/tools.ts`, after the `notable_event` property block, add:

```typescript
      important_event: {
        type: "string",
        description: "An important event to remember permanently — alliances formed, secrets discovered, promises made, faction shifts. More significant than notable_event (which rolls off after 10), less dramatic than milestone (major plot beats only).",
      },
```

**Step 2: Commit**

```bash
git add src/app/agents/tools.ts
git commit -m "feat: add important_event to update_game_state tool schema"
```

---

### Task 4: Add DM agent prompt instructions for important_event

**Files:**
- Modify: `src/app/agents/dmAgent.ts:66-76` (STATE TRACKING section)

**Step 1: Add important_event instruction to STATE TRACKING block**

After the `notable_event` line (line 70) and before the `milestone` line (line 71), add:

```
- important_event: Significant events worth remembering for the entire campaign — alliances formed ("allied with the dockworkers guild"), secrets discovered ("learned the mayor is secretly a vampire"), promises made ("swore to protect the orphanage"), faction relationships changing ("earned the thieves guild's trust"). These persist permanently (unlike notable_event which rolls off). Use when the event shapes future interactions but isn't a major plot milestone.
```

**Step 2: Commit**

```bash
git add src/app/agents/dmAgent.ts
git commit -m "feat: add important_event instruction to DM agent prompt"
```

---

### Task 5: Add session memory loading to gameState singleton

**Files:**
- Modify: `src/app/lib/gameState.ts` (module-level variables, loadGameState, getters)

**Step 1: Add in-memory variables and getters for session memory**

Near the other module-level variables (around where `currentCampaignSlug` is declared), add:

```typescript
let sessionImportantEvents: string[] | undefined;
let sessionSupportingNPCs: SupportingNPC[] | undefined;
```

Add getter functions:

```typescript
export function getSessionImportantEvents(): string[] {
  return sessionImportantEvents ?? [];
}

export function getSessionSupportingNPCs(): SupportingNPC[] {
  return sessionSupportingNPCs ?? [];
}
```

Add a mutator for appending supporting NPCs (called from the chat route when `create_supporting_npc` resolves):

```typescript
export function addSupportingNPC(npc: SupportingNPC): void {
  if (!sessionSupportingNPCs) sessionSupportingNPCs = [];
  sessionSupportingNPCs.push(npc);
}
```

**Step 2: Load session memory in loadGameState**

In `loadGameState`, after loading session-level spatial data (line ~1253), add:

```typescript
  // Load session memory (important events, supporting NPCs)
  sessionImportantEvents = session?.importantEvents;
  sessionSupportingNPCs = session?.supportingNPCs;
```

**Step 3: Persist session memory in applyStateChangesAndPersist**

The `important_event` field is already applied to `state.story.importantEvents` via `applyStateChanges`. Since `persistState` writes `state.story` to the session doc, this is automatically persisted.

For `supportingNPCs`, we need to persist them separately since they're on the session doc but not on StoryState. In `applyStateChangesAndPersist`, after `persistState(characterId)` (line ~1353), add:

```typescript
  // Persist session-level memory (supportingNPCs) if changed
  if (sessionSupportingNPCs) {
    await saveSessionState(currentSessionId, { supportingNPCs: sessionSupportingNPCs });
  }
```

Wait — `supportingNPCs` is on `StoredSession`, and `saveSessionState` accepts `Partial<Omit<StoredSession, ...>>`. But `importantEvents` is on `StoryState` which gets saved via `saveCharacterState` (which writes `story` to the session doc). So we need `importantEvents` on `StoryState`, which we already added in Task 2 Step 4.

For `supportingNPCs`, since it's not on `StoryState` but on `StoredSession`, we need to persist it separately. Add the `saveSessionState` call.

**Step 4: Add SupportingNPC import**

Add `SupportingNPC` to the imports from `gameTypes.ts` in `gameState.ts`.

**Step 5: Commit**

```bash
git add src/app/lib/gameState.ts
git commit -m "feat: load and persist session memory (importantEvents + supportingNPCs)"
```

---

### Task 6: Create supporting NPC agent

**Files:**
- Create: `src/app/agents/supportingNpcAgent.ts`

**Step 1: Write the failing test**

Create `src/app/agents/supportingNpcAgent.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: vi.fn(),
  credential: { cert: vi.fn() },
  firestore: vi.fn(() => ({})),
}));

vi.mock("../lib/firebaseAdmin", () => ({
  adminDb: {},
}));

const mockCreate = vi.fn();

vi.mock("../lib/anthropic", () => ({
  anthropic: {
    messages: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
  MODELS: { UTILITY: "test-model" },
  MAX_TOKENS: { NPC_AGENT: 512 },
}));

import { getSupportingNPCProfile } from "./supportingNpcAgent";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getSupportingNPCProfile", () => {
  it("returns a SupportingNPC from valid JSON response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: "text",
        text: JSON.stringify({
          id: "old-marta",
          name: "old marta",
          role: "informant",
          appearance: "a weathered fisherwoman with calloused hands and a knowing gaze",
          personality: "shrewd and tight-lipped, but warms to those who buy her fish",
          motivations: ["protect her grandchildren", "keep the docks peaceful"],
          location: "valdris docks",
          notes: "knows all the dock gossip, saw suspicious activity last week",
        }),
      }],
      usage: { input_tokens: 150, output_tokens: 100 },
    });

    const result = await getSupportingNPCProfile({
      name: "Old Marta",
      role: "informant",
      context: "A fishmonger at the docks who witnessed the smuggling.",
      currentLocation: "Valdris Docks",
    });

    expect(result.npc.id).toBe("old-marta");
    expect(result.npc.name).toBe("old marta");
    expect(result.npc.role).toBe("informant");
    expect(result.npc.appearance).toBeTruthy();
    expect(result.inputTokens).toBe(150);
    expect(result.outputTokens).toBe(100);
  });

  it("builds fallback NPC when JSON parsing fails", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "This is not valid JSON at all" }],
      usage: { input_tokens: 150, output_tokens: 50 },
    });

    const result = await getSupportingNPCProfile({
      name: "Old Marta",
      role: "informant",
      context: "A fishmonger at the docks.",
      currentLocation: "Valdris Docks",
    });

    expect(result.npc.name).toBe("old marta");
    expect(result.npc.role).toBe("informant");
    expect(result.npc.location).toBe("valdris docks");
    expect(result.npc.notes).toContain("fishmonger");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/agents/supportingNpcAgent.test.ts`
Expected: FAIL — module not found

**Step 3: Create the supporting NPC agent**

Create `src/app/agents/supportingNpcAgent.ts`:

```typescript
/**
 * Supporting NPC Agent — Claude Haiku
 *
 * Generates lightweight profiles for non-campaign NPCs that emerge during play.
 * Single-shot, no tools, no conversation history.
 * Returns a SupportingNPC JSON object.
 *
 * Fallback: if JSON parsing fails, constructs a minimal profile from the
 * DM-provided fields.
 */

import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODELS, MAX_TOKENS } from "../lib/anthropic";
import type { SupportingNPC } from "../lib/gameTypes";

export interface SupportingNPCRequest {
  name: string;
  role: string;
  context: string;
  combatSlug?: string;
  currentLocation: string;
}

export interface SupportingNPCResult {
  npc: SupportingNPC;
  inputTokens: number;
  outputTokens: number;
}

const SYSTEM_PROMPT: Anthropic.Messages.TextBlockParam = {
  type: "text",
  text: `You generate supporting NPC profiles for a D&D 5e campaign. Given a name, role, context, and location, produce a JSON object with these fields:

- id: kebab-case identifier (e.g. "old-marta-the-fishmonger")
- name: the NPC's name (lowercase)
- role: one of "ally", "rival", "neutral", "informant", "merchant", "quest_giver"
- appearance: 1-2 sentences describing how they look
- personality: 1 sentence capturing key personality traits
- motivations: array of 1-3 short strings describing what they want
- location: where they are usually found (lowercase)
- notes: 1-2 sentences of anything else notable about them
- combatSlug: SRD monster slug if provided, omit otherwise

All string values must be lowercase. Respond with ONLY valid JSON, no markdown fencing.`,
  cache_control: { type: "ephemeral" },
};

export async function getSupportingNPCProfile(
  request: SupportingNPCRequest,
): Promise<SupportingNPCResult> {
  const userMessage = JSON.stringify({
    name: request.name,
    role: request.role,
    context: request.context,
    location: request.currentLocation,
    combatSlug: request.combatSlug,
  });

  const response = await anthropic.messages.create({
    model: MODELS.UTILITY,
    max_tokens: MAX_TOKENS.NPC_AGENT,
    system: [SYSTEM_PROMPT],
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText =
    response.content[0].type === "text" ? response.content[0].text : "{}";

  let npc: SupportingNPC;
  try {
    npc = JSON.parse(rawText) as SupportingNPC;
    // Ensure required fields exist
    if (!npc.id || !npc.name) throw new Error("Missing required fields");
  } catch {
    npc = buildFallbackNPC(request);
  }

  // Sanitize — ensure lowercase and valid role
  npc.name = npc.name.toLowerCase();
  npc.location = (npc.location || request.currentLocation).toLowerCase();
  if (request.combatSlug) npc.combatSlug = request.combatSlug;

  return {
    npc,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

function buildFallbackNPC(request: SupportingNPCRequest): SupportingNPC {
  const id = request.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    id,
    name: request.name.toLowerCase(),
    role: (request.role as SupportingNPC["role"]) || "neutral",
    appearance: "",
    personality: "",
    motivations: [],
    location: request.currentLocation.toLowerCase(),
    notes: request.context.toLowerCase(),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/agents/supportingNpcAgent.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/agents/supportingNpcAgent.ts src/app/agents/supportingNpcAgent.test.ts
git commit -m "feat: add supporting NPC agent (Haiku, single-shot JSON generation)"
```

---

### Task 7: Add create_supporting_npc and query_session_memory tool definitions

**Files:**
- Modify: `src/app/agents/tools.ts` (add two new tool definitions)

**Step 1: Add the two new tool constants**

At the end of `src/app/agents/tools.ts` (before the NPC attack rolling section), add:

```typescript
export const CREATE_SUPPORTING_NPC_TOOL: Anthropic.Tool = {
  name: "create_supporting_npc",
  description:
    "Create a persistent profile for a non-campaign NPC worth remembering. Call this when introducing a named NPC that isn't in the campaign script and seems important enough to recall later (e.g. a helpful shopkeeper, a suspicious stranger, a rescued prisoner). Do NOT use for campaign NPCs or generic unnamed NPCs.",
  input_schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "The NPC's name (e.g. 'Old Marta', 'Bartender Gideon').",
      },
      role: {
        type: "string",
        enum: ["ally", "rival", "neutral", "informant", "merchant", "quest_giver"],
        description: "The NPC's relationship to the party.",
      },
      context: {
        type: "string",
        description: "1-2 sentences about who they are and why they matter.",
      },
      combat_slug: {
        type: "string",
        description: "Optional SRD monster slug if this NPC might fight (e.g. 'commoner', 'guard', 'noble').",
      },
    },
    required: ["name", "role", "context"],
  },
};

export const QUERY_SESSION_MEMORY_TOOL: Anthropic.Tool = {
  name: "query_session_memory",
  description:
    "Recall important events and supporting NPCs from this session's history. Call this when the player references past events, NPCs, or relationships that aren't in your immediate context. Costs no API call — just a database read.",
  input_schema: {
    type: "object",
    properties: {
      query_type: {
        type: "string",
        enum: ["important_events", "supporting_npcs", "all"],
        description: "'important_events' = significant past events. 'supporting_npcs' = non-campaign NPCs met during play. 'all' = both.",
      },
    },
    required: ["query_type"],
  },
};
```

**Step 2: Commit**

```bash
git add src/app/agents/tools.ts
git commit -m "feat: add create_supporting_npc and query_session_memory tool definitions"
```

---

### Task 8: Add session memory query handler to agentUtils

**Files:**
- Modify: `src/app/agents/agentUtils.ts` (add handleSessionMemoryQuery)
- Test: `src/app/agents/agentUtils.test.ts`

**Step 1: Write the failing test**

Add to `src/app/agents/agentUtils.test.ts`:

```typescript
import { handleSessionMemoryQuery } from "./agentUtils";

describe("handleSessionMemoryQuery", () => {
  it("returns important events when query_type is important_events", () => {
    const result = handleSessionMemoryQuery(
      { query_type: "important_events" },
      ["allied with the dockworkers guild", "discovered the mayor's secret"],
      [],
    );
    expect(result).toContain("allied with the dockworkers guild");
    expect(result).toContain("discovered the mayor's secret");
  });

  it("returns supporting NPCs when query_type is supporting_npcs", () => {
    const result = handleSessionMemoryQuery(
      { query_type: "supporting_npcs" },
      [],
      [{
        id: "old-marta",
        name: "old marta",
        role: "informant",
        appearance: "weathered fisherwoman",
        personality: "shrewd",
        motivations: ["protect her grandchildren"],
        location: "valdris docks",
        notes: "saw suspicious activity",
      }],
    );
    expect(result).toContain("old marta");
    expect(result).toContain("informant");
    expect(result).toContain("valdris docks");
  });

  it("returns both when query_type is all", () => {
    const result = handleSessionMemoryQuery(
      { query_type: "all" },
      ["allied with the dockworkers guild"],
      [{ id: "old-marta", name: "old marta", role: "informant", appearance: "", personality: "", motivations: [], location: "docks", notes: "" }],
    );
    expect(result).toContain("allied with the dockworkers guild");
    expect(result).toContain("old marta");
  });

  it("returns empty message when no data exists", () => {
    const result = handleSessionMemoryQuery(
      { query_type: "all" },
      [],
      [],
    );
    expect(result).toContain("No important events");
    expect(result).toContain("No supporting NPCs");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/agents/agentUtils.test.ts -t "handleSessionMemoryQuery"`
Expected: FAIL — function does not exist

**Step 3: Implement handleSessionMemoryQuery**

In `src/app/agents/agentUtils.ts`, add the import and function:

```typescript
import type { SupportingNPC } from "../lib/gameTypes";

/**
 * Format session memory (important events and/or supporting NPCs) as a string
 * for the DM agent's tool result.
 */
export function handleSessionMemoryQuery(
  input: { query_type: string },
  importantEvents: string[],
  supportingNPCs: SupportingNPC[],
): string {
  const parts: string[] = [];

  if (input.query_type === "important_events" || input.query_type === "all") {
    if (importantEvents.length > 0) {
      parts.push("IMPORTANT EVENTS:\n" + importantEvents.map((e, i) => `${i + 1}. ${e}`).join("\n"));
    } else {
      parts.push("No important events recorded yet.");
    }
  }

  if (input.query_type === "supporting_npcs" || input.query_type === "all") {
    if (supportingNPCs.length > 0) {
      const npcLines = supportingNPCs.map((npc) => {
        let line = `- ${npc.name} [${npc.role}] (${npc.location})`;
        if (npc.appearance) line += ` — ${npc.appearance}`;
        if (npc.personality) line += ` Personality: ${npc.personality}`;
        if (npc.motivations.length > 0) line += ` Wants: ${npc.motivations.join(", ")}`;
        if (npc.notes) line += ` Notes: ${npc.notes}`;
        return line;
      });
      parts.push("SUPPORTING NPCs:\n" + npcLines.join("\n"));
    } else {
      parts.push("No supporting NPCs recorded yet.");
    }
  }

  return parts.join("\n\n");
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/agents/agentUtils.test.ts -t "handleSessionMemoryQuery"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/agents/agentUtils.ts src/app/agents/agentUtils.test.ts
git commit -m "feat: add handleSessionMemoryQuery to format session memory for DM agent"
```

---

### Task 9: Wire new tools into DM agent tool-use loop

**Files:**
- Modify: `src/app/agents/dmAgent.ts` (imports, tools array, tool-use loop handlers)

**Step 1: Update imports**

Add to imports at top of `dmAgent.ts`:

```typescript
import {
  handleSessionMemoryQuery,
} from "./agentUtils";
import {
  UPDATE_GAME_STATE_TOOL,
  UPDATE_NPC_TOOL,
  QUERY_SRD_TOOL,
  QUERY_CAMPAIGN_TOOL,
  CREATE_SUPPORTING_NPC_TOOL,
  QUERY_SESSION_MEMORY_TOOL,
} from "./tools";
```

Also import `getSessionImportantEvents`, `getSessionSupportingNPCs`, and `addSupportingNPC` from `../lib/gameState`, and `getSupportingNPCProfile` from `./supportingNpcAgent`.

**Step 2: Add new tools to the tools array**

In `getDMResponse`, update the tools array (line ~163):

```typescript
  const tools: Anthropic.Messages.Tool[] = [
    UPDATE_GAME_STATE_TOOL,
    UPDATE_NPC_TOOL,
    CREATE_SUPPORTING_NPC_TOOL,
    QUERY_SESSION_MEMORY_TOOL,
    ...(campaignSlug ? [QUERY_CAMPAIGN_TOOL] : []),
    { ...QUERY_SRD_TOOL, cache_control: { type: "ephemeral" } },
  ];
```

**Step 3: Add tool handlers in the tool-use loop**

In the `for (const block of response.content)` loop (line ~236), add handlers for the two new tools:

After the `query_campaign` handler block, add:

```typescript
      } else if (block.name === "query_session_memory") {
        hasQuerySRD = true; // needs continuation like SRD/campaign queries
        const input = block.input as { query_type: string };
        console.log(
          `[DM Agent] Tool call: query_session_memory (${input.query_type})`,
        );
        const resultContent = handleSessionMemoryQuery(
          input,
          getSessionImportantEvents(),
          getSessionSupportingNPCs(),
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: resultContent,
        });
      } else if (block.name === "create_supporting_npc") {
        const input = block.input as {
          name: string;
          role: string;
          context: string;
          combat_slug?: string;
        };
        console.log(
          `[DM Agent] Tool call: create_supporting_npc — ${input.name} (${input.role})`,
        );
        const result = await getSupportingNPCProfile({
          name: input.name,
          role: input.role,
          context: input.context,
          combatSlug: input.combat_slug,
          currentLocation: gameState.story.currentLocation,
        });
        addSupportingNPC(result.npc);
        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;
        console.log(
          `[DM Agent] Created supporting NPC: ${result.npc.id} (${result.npc.role})`,
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ ok: true, npc_id: result.npc.id }),
        });
```

**Step 4: Update the hasLookupCall check**

Update the `hasLookupCall` check (~line 207) to include the new query tool:

```typescript
    const hasLookupCall = response.content.some(
      (b) =>
        b.type === "tool_use" &&
        (b.name === "query_srd" || b.name === "query_campaign" || b.name === "query_session_memory"),
    );
```

**Step 5: Commit**

```bash
git add src/app/agents/dmAgent.ts
git commit -m "feat: wire create_supporting_npc and query_session_memory into DM agent loop"
```

---

### Task 10: Add DM prompt instructions for new tools

**Files:**
- Modify: `src/app/agents/dmAgent.ts` (STATIC_DM_INSTRUCTIONS)

**Step 1: Add instructions for the two new tools**

After the `WHEN TO USE query_campaign` section (line ~95), add:

```
WHEN TO USE query_session_memory:
- Call when the player references past events, NPCs, or relationships that aren't in your immediate context (CAMPAIGN STATE section).
- Call when you need to recall what happened earlier in the campaign but the details aren't in recentEvents or milestones.
- The query costs nothing — it's a local database read, not an API call. Don't hesitate to use it.

WHEN TO USE create_supporting_npc:
- Call when you introduce a named NPC that is NOT listed in the campaign's NPC roster but seems worth remembering for future interactions.
- Good candidates: helpful shopkeepers, suspicious strangers, rescued prisoners, informants, quest givers who appeared organically.
- Do NOT use for: campaign NPCs (already tracked), unnamed generic NPCs (guards, commoners), or enemies (use npcs_to_create for combat stat blocks).
- The NPC profile is generated automatically — just provide the name, role, and a brief context sentence.
```

**Step 2: Commit**

```bash
git add src/app/agents/dmAgent.ts
git commit -m "feat: add DM prompt instructions for session memory tools"
```

---

### Task 11: Persist supportingNPCs from chat route

**Files:**
- Modify: `src/app/api/chat/route.ts` (add saveSessionState call for supportingNPCs)

**Step 1: Update imports**

Add `getSessionSupportingNPCs` to the imports from `../../lib/gameState`.

**Step 2: Add persistence after state changes**

After `applyStateChangesAndPersist` (line ~509), add:

```typescript
  // Persist session-level supporting NPCs (not part of StoryState)
  const supportingNPCs = getSessionSupportingNPCs();
  if (supportingNPCs.length > 0) {
    await saveSessionState(sessionId, { supportingNPCs });
  }
```

Note: `importantEvents` is automatically persisted because it lives on `StoryState` which is written to the session doc by `saveCharacterState`. `supportingNPCs` needs explicit persistence because it's on `StoredSession` but not `StoryState`.

Wait — actually, looking back at Task 5 Step 3, I had `saveSessionState` in `applyStateChangesAndPersist`. Let me reconsider: it's cleaner to do it in the chat route since that's where the orchestration happens, and `applyStateChangesAndPersist` shouldn't need to know about session memory. Remove the saveSessionState from Task 5 Step 3 and do it here instead.

**Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: persist supportingNPCs to session doc after DM agent runs"
```

---

### Task 12: Add StoredSession fields to type and verify build

**Files:**
- None new — verification step

**Step 1: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Commit (if any fixes needed)**

If any type errors or test failures required fixes, commit those fixes.

---

### Task 13: Update DM agent test for new tools

**Files:**
- Modify: `src/app/agents/dmAgent.test.ts`

**Step 1: Add test for create_supporting_npc tool handling**

Add mock for `supportingNpcAgent`:

```typescript
const mockGetSupportingNPCProfile = vi.fn();

vi.mock("./supportingNpcAgent", () => ({
  getSupportingNPCProfile: (...args: unknown[]) => mockGetSupportingNPCProfile(...args),
}));
```

Add test:

```typescript
  it("handles create_supporting_npc tool call", async () => {
    mockGetSupportingNPCProfile.mockResolvedValueOnce({
      npc: {
        id: "old-marta",
        name: "old marta",
        role: "informant",
        appearance: "weathered fisherwoman",
        personality: "shrewd",
        motivations: ["protect her grandchildren"],
        location: "valdris docks",
        notes: "saw suspicious activity",
      },
      inputTokens: 100,
      outputTokens: 80,
    });

    // First call: tool use for create_supporting_npc + narrative
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: "text", text: "You meet an old fisherwoman at the docks. " },
        {
          type: "tool_use",
          id: "tool-1",
          name: "create_supporting_npc",
          input: {
            name: "Old Marta",
            role: "informant",
            context: "A fishmonger who witnessed the smuggling.",
          },
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 200, output_tokens: 80 },
    });

    const result = await getDMResponse(
      "I talk to the fisherwoman",
      makeGameState(),
      null,
      "session-1",
    );

    expect(mockGetSupportingNPCProfile).toHaveBeenCalledOnce();
    expect(result.narrative).toContain("fisherwoman");
  });
```

**Step 2: Run test**

Run: `npx vitest run src/app/agents/dmAgent.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/app/agents/dmAgent.test.ts
git commit -m "test: add DM agent test for create_supporting_npc tool handling"
```

---

### Task 14: Final verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Build**

Run: `npm run build`
Expected: Successful build

**Step 4: Final commit if needed**

If any fixes were required, commit them.
