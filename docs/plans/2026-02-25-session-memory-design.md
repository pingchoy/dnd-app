# Session Memory: importantEvents + supportingNPCs

## Problem

The DM agent loses track of important campaign events and emergent NPCs over time:
- `recentEvents` is a rolling 10-item window — old events fall off
- `milestones` is for major plot beats only (1-2 per session)
- NPCs that emerge during play (not defined in the campaign script) have no persistent record

## Solution

Add two new session-level data structures and three new DM agent capabilities:

### Data Model

**SupportingNPC** (new type):
```typescript
interface SupportingNPC {
  id: string;            // kebab-case, e.g. "old-marta-the-fishmonger"
  name: string;          // lowercase per convention
  role: "ally" | "rival" | "neutral" | "informant" | "merchant" | "quest_giver";
  appearance: string;    // 1-2 sentences
  personality: string;   // key traits in a sentence
  motivations: string[]; // what they want
  location: string;      // where they were met/usually found
  notes: string;         // anything else notable
  combatSlug?: string;   // optional SRD monster slug if they might fight
}
```

**StoredSession additions:**
- `importantEvents?: string[]` — permanent event log (generous cap ~50)
- `supportingNPCs?: SupportingNPC[]` — emergent NPC records

These live on the session document, not StoryState, since they're session-scoped emergent data.

### DM Agent Tool Changes

1. **`update_game_state` — new `important_event` field** (string)
   - Pushed to `session.importantEvents[]`
   - For events too important for recentEvents but not major enough for milestones
   - Examples: alliances formed, secrets discovered, promises made, faction relationships changing

2. **New tool: `create_supporting_npc`**
   - Parameters: `name` (required), `role` (required), `context` (required), `combat_slug` (optional)
   - Triggers the supporting NPC agent (Haiku) to generate a full SupportingNPC record
   - DM calls this when introducing a named NPC not in the campaign script that's worth remembering

3. **New tool: `query_session_memory`**
   - Parameter: `query_type` ("important_events" | "supporting_npcs" | "all")
   - Returns formatted text from session's importantEvents and/or supportingNPCs
   - DM calls this when player references past events or NPCs not in immediate context

### Supporting NPC Agent

- **File:** `src/app/agents/supportingNpcAgent.ts`
- **Model:** Haiku (cost-efficient simple generation)
- **Input:** name, role, context, combatSlug?, currentLocation from StoryState
- **Output:** SupportingNPC JSON object
- **Fallback:** If JSON parsing fails, construct minimal SupportingNPC from DM-provided fields
- **System prompt:** ~100 tokens, instructs concise 1-2 sentence fields, lowercase values, valid JSON

### Orchestration Flow

Within the DM agent's tool-use loop (in `/api/chat/route.ts`):

1. `query_session_memory` — reads importantEvents/supportingNPCs from loaded session data, returns formatted text to DM
2. `create_supporting_npc` — runs supporting NPC agent (Haiku), pushes result to session's supportingNPCs array

After the DM agent completes:

3. `important_event` from stateChanges — pushed to session's importantEvents during state mutation

### Persistence

- Both arrays stored on the Firestore session document
- Loaded during session hydration (loadGameState or equivalent)
- Saved during applyStateChangesAndPersist (as part of session save)
- No changes to character documents (session-level data only)

### Cost Impact

- `query_session_memory`: Zero AI cost (reads from Firestore, returns formatted text)
- `create_supporting_npc`: ~$0.001 per NPC (single Haiku call, ~200 input + ~200 output tokens)
- `important_event`: Zero extra cost (added to existing update_game_state tool call)
