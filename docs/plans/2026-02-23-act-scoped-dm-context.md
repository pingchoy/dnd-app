# Act-Scoped DM Context Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent the DM agent from leaking campaign mysteries by scoping its context to the current act only, with encounter progression tracking.

**Architecture:** Replace the spoiler-heavy `dmSummary` injection with a spoiler-free version, remove NPC role labels, add encounter tracking to StoryState, and serialize only the next uncompleted encounter's full details into the DM context.

**Tech Stack:** TypeScript, Next.js API routes, Anthropic tool schemas, Firestore persistence

---

### Task 1: Rewrite `dmSummary` in the hardcoded campaign

**Files:**
- Modify: `scripts/campaigns/the-crimson-accord.ts:533-534`

**Step 1: Replace the spoiler dmSummary with a spoiler-free version**

Change the `dmSummary` value from the full arc spoiler to:

```typescript
    dmSummary:
      "Political intrigue in the free city of Valdris. Dark fantasy tone with themes of trust, power, and corruption beneath gilded surfaces. A trade hub governed by a council of merchant lords where people are vanishing from the lower quarters. The campaign rewards careful investigation, relationship-building, and paying attention to NPC motivations over brute force.",
```

This keeps theme, setting, and play-style guidance without revealing who the villain is, who gets betrayed, or who dies.

**Step 2: Commit**

```bash
git add scripts/campaigns/the-crimson-accord.ts
git commit -m "refactor: make dmSummary spoiler-free for DM injection"
```

---

### Task 2: Update the campaign generator prompt to not depend on dmSummary for full arc context

**Files:**
- Modify: `scripts/generateCampaign.ts:373` (generator instruction)
- Modify: `scripts/generateCampaign.ts:188` (interface comment)

**Step 1: Update the generator instruction**

At line 373, change:
```
- The dmSummary must be a compact (~200 token) overview of the full arc for DM reference.
```
to:
```
- The dmSummary must be a compact (~50 token) spoiler-free summary of the campaign's theme, tone, setting, and play style. It must NOT reveal the villain's identity, plot twists, betrayals, or future events — it is injected directly into the DM agent's context on every turn.
```

**Step 2: Update the interface comment**

At line 188, change:
```typescript
  dmSummary: string;                   // ~200 token overall arc summary for DM
```
to:
```typescript
  dmSummary: string;                   // ~50 token spoiler-free theme/tone/setting for DM injection
```

**Step 3: Update the act generation prompt to provide full arc inline**

At lines 434-436, the act generation prompt uses `Campaign summary: ${campaign.dmSummary}`. Since `dmSummary` is now spoiler-free, the act generator needs the full arc. Change:
```typescript
Campaign summary: ${campaign.dmSummary}
```
to:
```typescript
Campaign theme: ${campaign.dmSummary}

Full campaign NPC roster with roles and secrets (for writing act-specific content):
${campaign.npcs.map((n: { name: string; role: string; motivations: string[] }) => `- ${n.name} (${n.role}): ${n.motivations.join("; ")}`).join("\n")}
```

Do the same for the map spec prompt at line 487 — replace `Campaign summary: ${campaign.dmSummary}` with `Campaign theme: ${campaign.dmSummary}`.

**Step 4: Commit**

```bash
git add scripts/generateCampaign.ts
git commit -m "refactor: update generator to use spoiler-free dmSummary"
```

---

### Task 3: Add `completedEncounters` to StoryState and `encounter_completed` to StateChanges

**Files:**
- Modify: `src/app/lib/gameTypes.ts:381-397` (StoryState interface)
- Modify: `src/app/lib/gameState.ts:455-496` (StateChanges interface)
- Modify: `src/app/lib/gameState.ts:509-572` (applyStateChanges function)

**Step 1: Add `completedEncounters` to StoryState**

In `gameTypes.ts`, inside the `StoryState` interface (after the `currentAct` field at line 396), add:

```typescript
  /** Encounter names completed in the current act. Reset on act advance. */
  completedEncounters?: string[];
```

**Step 2: Add `encounter_completed` to StateChanges**

In `gameState.ts`, inside the `StateChanges` interface (after `act_advance` at line 495), add:

```typescript
  /** Mark a campaign encounter as completed by name (e.g. "Dockside Smuggler Ambush"). */
  encounter_completed?: string;
```

**Step 3: Handle `encounter_completed` in applyStateChanges**

In `gameState.ts`, in the `applyStateChanges` function, after the `act_advance` block (line 572), add:

```typescript
  if (changes.encounter_completed) {
    if (!s.completedEncounters) s.completedEncounters = [];
    const lower = changes.encounter_completed.toLowerCase();
    if (!s.completedEncounters.includes(lower)) s.completedEncounters.push(lower);
  }
```

Also: in the `act_advance` block, reset completedEncounters when advancing acts:

```typescript
  if (changes.act_advance != null && changes.act_advance > 0) {
    s.currentAct = changes.act_advance;
    s.completedEncounters = [];
  }
```

**Step 4: Commit**

```bash
git add src/app/lib/gameTypes.ts src/app/lib/gameState.ts
git commit -m "feat: add encounter tracking to StoryState and StateChanges"
```

---

### Task 4: Add `encounter_completed` to the update_game_state tool schema

**Files:**
- Modify: `src/app/agents/tools.ts:19-196` (UPDATE_GAME_STATE_TOOL)

**Step 1: Add the property**

In `tools.ts`, inside `UPDATE_GAME_STATE_TOOL.input_schema.properties`, after the `act_advance` property (line 192), add:

```typescript
      encounter_completed: {
        type: "string",
        description:
          "Mark a campaign encounter as completed when the set-piece wraps up. Use the exact encounter name from the NEXT ENCOUNTER section (e.g. 'Dockside Smuggler Ambush').",
      },
```

**Step 2: Commit**

```bash
git add src/app/agents/tools.ts
git commit -m "feat: add encounter_completed to update_game_state tool schema"
```

---

### Task 5: Rewrite `serializeCampaignContext` to be act-scoped with encounter injection

**Files:**
- Modify: `src/app/lib/gameState.ts:291-328` (serializeCampaignContext function)

**Step 1: Rewrite the function**

Replace the entire `serializeCampaignContext` function with:

```typescript
export function serializeCampaignContext(
  campaign: Campaign,
  act: CampaignAct | null,
  completedEncounters?: string[],
): string {
  const lines: string[] = [];

  lines.push("CAMPAIGN BRIEFING (DM ONLY — never reveal plot spoilers, NPC secrets, or future events to the player):");
  lines.push(campaign.dmSummary);

  if (act) {
    lines.push("");
    lines.push(`CURRENT ACT: ${act.title} (Act ${act.actNumber})`);
    lines.push(act.dmBriefing);
    if (act.plotPoints?.length) {
      lines.push(`Plot points: ${act.plotPoints.join("; ")}`);
    }

    // Encounter progression — full details for next, names-only for upcoming
    const completed = new Set((completedEncounters ?? []).map((e) => e.toLowerCase()));
    const remaining = act.encounters.filter((e) => !completed.has(e.name.toLowerCase()));

    if (remaining.length > 0) {
      const next = remaining[0];
      lines.push("");
      lines.push(`NEXT ENCOUNTER: ${next.name} (${next.type}, ${next.difficulty}) @ ${next.location}`);
      if (next.dmGuidance) lines.push(next.dmGuidance);
      if (next.enemies?.length) {
        lines.push(`Enemies: ${next.enemies.map((e) => `${e.count}x ${e.srdMonsterSlug}${e.notes ? ` (${e.notes})` : ""}`).join(", ")}`);
      }
      if (next.npcInvolvement?.length) {
        lines.push(`NPCs involved: ${next.npcInvolvement.join(", ")}`);
      }
      if (next.rewards) {
        const parts: string[] = [];
        if (next.rewards.xp) parts.push(`${next.rewards.xp} XP`);
        if (next.rewards.gold) parts.push(`${next.rewards.gold} gold`);
        if (next.rewards.items?.length) parts.push(next.rewards.items.join(", "));
        if (parts.length) lines.push(`Rewards: ${parts.join(", ")}`);
      }

      if (remaining.length > 1) {
        lines.push("");
        lines.push("UPCOMING ENCOUNTERS:");
        for (const enc of remaining.slice(1)) {
          lines.push(`  - ${enc.name} (${enc.type}, ${enc.difficulty})`);
        }
      }
    }
  }

  // Compact NPC summaries — act-relevant only, no role tag (use relationship arc instead)
  const relevantIds = act?.relevantNPCIds ?? campaign.npcs.map((n) => n.id);
  const npcs = campaign.npcs.filter((n) => relevantIds.includes(n.id));

  if (npcs.length > 0) {
    lines.push("");
    lines.push("KEY NPCs:");
    for (const npc of npcs) {
      const traits = npc.personality.traits.slice(0, 2).join(", ");
      const actKey = act ? `act${act.actNumber}` as keyof typeof npc.relationshipArc : undefined;
      const rel = actKey ? npc.relationshipArc[actKey] : undefined;
      let line = `  ${npc.name}: ${traits}`;
      if (rel) line += ` | This act: ${rel}`;
      if (npc.voiceNotes) line += ` | Voice: ${npc.voiceNotes.slice(0, 100)}`;
      lines.push(line);
    }
  }

  return lines.join("\n");
}
```

Key changes from the original:
1. New `completedEncounters` parameter to derive next encounter
2. `campaign.dmSummary` is now spoiler-free (from Task 1)
3. Encounter progression: full details for next uncompleted encounter, names-only for upcoming
4. NPC lines no longer include `(${npc.role})` — the relationship arc text serves as the role description

**Step 2: Update the call site in chat/route.ts**

In `src/app/api/chat/route.ts`, the call to `serializeCampaignContext` (line 128) needs to pass `completedEncounters`. Change:

```typescript
        contextParts.push(serializeCampaignContext(campaign, act));
```
to:
```typescript
        contextParts.push(serializeCampaignContext(campaign, act, gameState.story.completedEncounters));
```

**Step 3: Commit**

```bash
git add src/app/lib/gameState.ts src/app/api/chat/route.ts
git commit -m "feat: rewrite serializeCampaignContext for act-scoped injection with encounter tracking"
```

---

### Task 6: Update DM system prompt to use encounter_completed

**Files:**
- Modify: `src/app/agents/dmAgent.ts:45-87` (STATIC_DM_INSTRUCTIONS)

**Step 1: Add encounter completion instruction**

In the CAMPAIGN CONTEXT section of `STATIC_DM_INSTRUCTIONS` (after the `act_advance` instruction at line 84), add:

```
- When a campaign encounter (shown in NEXT ENCOUNTER) reaches its conclusion — combat won, social scene resolved, puzzle completed, exploration finished — call update_game_state with encounter_completed set to the encounter name. This advances the story to the next set-piece.
```

**Step 2: Commit**

```bash
git add src/app/agents/dmAgent.ts
git commit -m "feat: instruct DM to mark encounters completed via update_game_state"
```

---

### Task 7: Update the gameTypes.ts Campaign interface comment

**Files:**
- Modify: `src/app/lib/gameTypes.ts:500`

**Step 1: Update the comment**

Change:
```typescript
  dmSummary: string;                   // Compact overall arc for DM injection (~200 tokens)
```
to:
```typescript
  dmSummary: string;                   // Spoiler-free theme/tone/setting for DM injection (~50 tokens)
```

**Step 2: Commit**

```bash
git add src/app/lib/gameTypes.ts
git commit -m "docs: update dmSummary comment to reflect spoiler-free purpose"
```

---

### Task 8: Verify build compiles

**Step 1: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors (or only pre-existing warnings)

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address type/lint issues from act-scoped DM context changes"
```
