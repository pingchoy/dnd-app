# Plan: Server-Side Rules Engine via Tool Use

## Context

The Rules Agent (Haiku) currently does **all** D&D math in its prompt — modifier calculations, proficiency, damage dice parsing, success/failure determination. This is unreliable (AI can hallucinate math), token-wasteful (full character stat block serialized into every call), and fragile (`parseRulesOutcome` uses regex to extract structured data from AI text).

**Goal**: Refactor the Rules Agent into a **classifier** that determines *what* check is needed and calls a server-side tool that computes everything deterministically. The AI decides "this is a Stealth check, DC 15" and the server handles the math.

## Architecture Change

```
BEFORE:
  Player input → Rules Agent (AI computes modifiers, total, success, damage) → regex parse → result

AFTER:
  Player input → Rules Agent (AI classifies action, calls tool) → server computes everything → result
```

**Zero frontend changes** — `ParsedRollResult` interface stays identical.

## Files to Create

### 1. `src/app/lib/dnd5eData.ts` — Static D&D 5e reference data

Contains:
- `SKILL_ABILITY_MAP` — maps all 18 skills to their ability score (e.g. `"Stealth" → "dexterity"`)
- `SIMPLE_WEAPONS` / `MARTIAL_WEAPONS` — weapon lists for proficiency checking

### 2. `src/app/lib/actionResolver.ts` — Server-side resolver functions

Five resolver functions, all returning `ParsedRollResult` (existing interface):

- **`resolveAttack(input, player, activeNPCs)`** — Rolls d20, computes attack modifier (ability mod from `WeaponStat.stat` + proficiency if proficient via `weaponProficiencies` + weapon bonus), compares vs target NPC's AC, rolls damage on hit (weapon dice + extra damage sources like Sneak Attack), handles crits (double dice). Uses existing `rollDice()`, `getModifier()`, `getProficiencyBonus()`, `formatModifier()` from `gameTypes.ts`.

- **`resolveSkillCheck(input, player)`** — Rolls d20, looks up ability via `SKILL_ABILITY_MAP`, adds proficiency if in `skillProficiencies`, adds expertise (double prof) if feature "Expertise" `chosenOption` includes the skill, handles Jack of All Trades (half prof on non-proficient checks). Compares vs AI-provided DC.

- **`resolveSavingThrow(input, player)`** — Rolls d20, gets ability mod, adds proficiency if in `savingThrowProficiencies`, compares vs AI-provided DC.

- **`markImpossible(input)`** — Returns `{ impossible: true }` result with reason.

- **`markNoCheck(input)`** — Returns `{ noCheck: true }` result with reason.

**Extra damage handling**: For "Sneak Attack", checks `player.features` for the feature and uses `scalingFormula` if present, otherwise falls back to `Math.ceil(level / 2)d6`. Same pattern extensible to Divine Smite, Rage, etc. in future.

## Files to Modify

### 3. `src/app/agents/rulesAgent.ts` — Refactor to classifier + tool_use

**Replace** the ~45-line system prompt (modifier tables, damage rules, format instructions) with a short **classifier prompt** (~15 lines): "You are a D&D 5e rules classifier. Given a player action, call the correct tool."

**Add 5 tool definitions**:
- `resolve_attack` — `{ weapon, target, extra_damage_sources?, is_spell_attack?, spell_name? }`
- `resolve_skill_check` — `{ skill (enum of 18 skills), dc }`
- `resolve_saving_throw` — `{ ability (enum of 6), dc, source? }`
- `mark_impossible` — `{ reason }`
- `mark_no_check` — `{ reason }`

**Rewrite `getRulesOutcome()`**:
- Send **minimal context** to the AI: character name/class/level, feature names, inventory, weapon names, known spells, conditions, active NPCs. NOT full stat blocks or modifier references.
- Use `tool_choice: { type: "any" }` to force exactly one tool call.
- Dispatch the tool call to the corresponding resolver in `actionResolver.ts`.
- Return `parsed: ParsedRollResult` directly (already typed, no parsing needed).
- Also return `raw: string` via a `buildRawSummary()` helper that generates the old text format for backward-compatible DM agent injection.
- Use `cache_control: { type: "ephemeral" }` on the system prompt.

**Delete**:
- `parseRulesOutcome()` (~110 lines) — no longer needed
- `rollD20()` — d20 rolling moves to resolvers
- Old `SYSTEM_PROMPT` constant

**Update `RulesOutcome` interface**:
```typescript
export interface RulesOutcome {
  parsed: ParsedRollResult;  // NEW: structured result directly
  raw: string;               // text summary for DM agent
  roll: number;
  inputTokens: number;
  outputTokens: number;
}
```

### 4. `src/app/api/roll/route.ts` — Use parsed result directly

```typescript
// Before:
const outcome = await getRulesOutcome(playerInput, gameState.player, gameState.story.activeNPCs);
const parsed = parseRulesOutcome(outcome.raw, outcome.roll);

// After:
const outcome = await getRulesOutcome(playerInput, gameState.player, gameState.story.activeNPCs);
const parsed = outcome.parsed;
```

Remove `parseRulesOutcome` import. Response shape to frontend unchanged.

### 5. `src/app/api/chat/route.ts` — Minor adjustment

The inline rules path (when `precomputedRules` is not provided) uses `getRulesOutcome` directly. Update to use `outcome.raw` and `outcome.roll` from the new return type (both still present). The `precomputedRules` path is unchanged.

### 6. `src/app/agents/dmAgent.ts` — No changes needed

The DM agent receives `rulesOutcome.raw` as text in the user message. `buildRawSummary()` generates text in the same format the AI used to produce, so the DM sees identical context.

## What the AI Still Decides

- What **type** of check (attack / skill / save / impossible / none)
- Which **weapon** is being used (matches against inventory)
- Which **target NPC** (matches against active NPCs)
- What **DC** for skill checks and saves (DM judgment: Easy 10, Medium 15, Hard 20, etc.)
- Which **extra damage sources** apply (e.g. Sneak Attack when conditions are met)

## What the Server Computes

- d20 roll
- All modifiers (ability mod + proficiency + expertise + weapon bonus)
- Total vs DC/AC comparison
- Success/failure determination
- All damage rolls on hit
- Crit handling (double dice, not flat bonus)

## Token Impact

- **Input savings**: Full serialized player state (~300 tokens) replaced by minimal context (~100 tokens). Tool schemas add ~250 tokens but the system prompt shrinks by ~200 tokens. Net: roughly neutral.
- **Output savings**: AI generates a small tool call JSON (~30 tokens) instead of a 7-line structured text response (~80 tokens). ~50 token reduction per call.
- **Reliability**: No more math errors, no more regex parsing failures.

## Implementation Order

1. Create `dnd5eData.ts` (static data, no dependencies)
2. Create `actionResolver.ts` (depends on `gameTypes.ts` + `dnd5eData.ts`)
3. Refactor `rulesAgent.ts` (depends on `actionResolver.ts`)
4. Update `roll/route.ts` (remove `parseRulesOutcome` call)
5. Update `chat/route.ts` (minor type adjustment)
6. Test end-to-end: attack, skill check, saving throw, impossible action, no-check action

## Future Enhancements (not in this PR)

- Advantage/disadvantage support (roll 2d20)
- Divine Smite with spell slot consumption
- Rage bonus damage
- Cantrip damage scaling by character level
- Raw ability checks (no skill, just STR/DEX/etc.)
- Structured JSON injection into DM agent (replace text format)
