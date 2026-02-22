# AI Dungeon Master — Project Overview

## Purpose
An AI-powered Dungeon Master for D&D 5e, built with Next.js 14 and the Anthropic Claude SDK. Multiple players join a shared session via a chat interface; multiple specialized AI agents handle different concerns to keep each call focused and cost-efficient.

## Architecture Principle: Build for Multiplayer
**All new code must assume multiple players in a session.** Never hardcode single-player assumptions (e.g. a singular `player` field, skipping `characterId` checks, assuming only one user sends messages). The message subcollection and action queue already support multiplayer — game state, agents, and frontend need to follow.

Key patterns:
- **Identify by `characterId`**, not by role or position — every player action, state mutation, and UI element must know which character it belongs to.
- **Animate for others, not yourself** — this client's own actions appear optimistically; other players' messages arrive via onSnapshot and should animate in.
- **Shared session, per-player state** — story/encounter state is shared; HP, inventory, abilities, and conditions are per-character.

## Tech Stack
- **Framework**: Next.js 14 (App Router), React 18, TypeScript
- **AI**: Anthropic Claude SDK (`@anthropic-ai/sdk`)
- **Styling**: Tailwind CSS, HeadlessUI, HeroIcons
- **Storage**: Firebase Firestore (all game state, SRD data, character data)

## Multi-Agent Architecture

```
Player Input
    ↓
Two-phase turn flow:
  Phase 1: /api/roll (contested actions only)
    ├── [Free]  Keyword detection → contested action?
    ├── [Free]  Dice roll simulation (Math.random)
    └── [Haiku] Rules Agent — validates roll target and action legality

  Phase 2: /api/chat
    ├── [Haiku] Combat Agent (if hostile NPCs alive) — damage routing + narration
    ├── [Haiku/Sonnet] DM Agent (otherwise) — story, roleplay, world state
    └── [Deterministic] NPC creation — stat blocks from SRD data lookup + fallback
         ↓
    Returns: { narrative, gameState, tokensUsed, estimatedCostUsd }
```

**Cost optimization**: Haiku for rules checks and combat (~$0.001/call), Sonnet/Haiku for DM narrative. The DM uses `update_game_state` tool_use so state changes require zero extra API calls. Rolling 10-turn conversation window keeps input tokens bounded.

## Architecture Principle: Strict Agent Responsibilities

**Each agent has a narrow, well-defined job. Agents must NOT exceed their responsibilities.** Every token of input costs money; keep each agent's context minimal for its specific task.

### Rules Agent (`rulesAgent.ts`)
**Job: Validate whether a contested action is legal and has a legitimate target.**
- Receives: player input, action keywords
- Validates: Is this a valid D&D 5e action? Does it have a legitimate target? Is it physically possible?
- Returns: validation result + pre-rolled dice outcome
- Does NOT: narrate, update state, calculate complex modifiers, or make story decisions

### Combat Agent (`combatAgent.ts`)
**Job: Route damage numbers to the correct targets, handle XP/loot, then narrate the turn result.**
- Receives: player input, pre-rolled player attack result, pre-rolled NPC attack results
- Determines: which targets take damage and how much (using the pre-rolled numbers)
- Calls: `update_npc` (NPC takes damage), `update_game_state` (player takes damage, loot, XP)
- Narrates: the combat turn based on the resolved state
- Does NOT: calculate attack modifiers (pre-rolled), make story/plot decisions, handle exploration or roleplay, generate NPC stat blocks

### DM Agent (`dmAgent.ts`)
**Job: Handle storytelling, roleplay, exploration, and overarching plot.**
- Receives: player input, conversation history, full game state
- Handles: narrative prose, NPC dialogue, scene descriptions, world-building, quest progression
- Calls: `update_game_state` (location, inventory, conditions, story events, introducing NPCs), `query_srd` (rules lookups)
- Does NOT: resolve combat damage (combat agent handles that), validate dice rolls (rules agent handles that)

### NPC Creation (deterministic, no AI call needed)
**Job: Create NPC stat blocks from SRD data.**
- When the DM agent includes `npcs_to_create`, stats are looked up from SRD Firestore data and created deterministically via `buildFallbackNPCs`-style logic.
- An AI call (NPC agent) is only needed for custom/homebrew creatures with no SRD entry — and even then, consider whether the DM agent can provide the stats inline instead.

## Key Files

| Path | Purpose |
|------|---------|
| **Agents** | |
| `src/app/agents/dmAgent.ts` | DM narrative agent — story, roleplay, exploration only |
| `src/app/agents/combatAgent.ts` | Combat agent — damage routing, XP/loot, combat narration |
| `src/app/agents/rulesAgent.ts` | Rules agent — validates contested actions and targets |
| `src/app/agents/npcAgent.ts` | NPC stat block generation (mostly deterministic from SRD; AI fallback for homebrew) |
| **Lib** | |
| `src/app/lib/anthropic.ts` | Anthropic client, model constants, token/cost helpers |
| `src/app/lib/gameTypes.ts` | Shared types (PlayerState, GameState, NPC, etc.) and pure utility functions (formatModifier, getModifier, rollDice) |
| `src/app/lib/gameState.ts` | In-memory singleton, state mutation, XP/level-up, Firestore persistence |
| `src/app/lib/characterStore.ts` | Firestore CRUD for characters and SRD data queries |
| `src/app/lib/actionKeywords.ts` | Keyword detection for contested actions |
| **API Routes** | |
| `src/app/api/chat/route.ts` | Phase 2: orchestrates DM + NPC agents, persists state |
| `src/app/api/roll/route.ts` | Phase 1: rules check for contested actions |
| `src/app/api/characters/route.ts` | POST: create new character |
| `src/app/api/srd/route.ts` | GET: SRD data lookups (races, classes, spells, monsters) |
| `src/app/api/debug/route.ts` | Demigod debug actions (force_combat, force_level_up) |
| **Frontend** | |
| `src/app/hooks/useChat.tsx` | React hook for chat state, roll flow, game state |
| `src/app/hooks/useCharacterCreation.ts` | Character creation wizard state machine |
| `src/app/dashboard/page.tsx` | Main chat UI with character sidebar |
| `src/app/character-creation/page.tsx` | Character creation wizard |
| `src/app/components/` | UI components (ChatCard, DiceRoll, CharacterSheet, CharacterSidebar, SpellTag, DemigodMenu, etc.) |

## Player Character
Characters are created via the character creation wizard (`/character-creation`). The wizard supports all D&D 5e SRD races and classes with point-buy ability scores, skill selection, archetype selection, feature choices, and spellcasting setup. Character data is persisted to Firestore.

## Environment Variables
```
ANTHROPIC_API_KEY=your-key-here            # Required for AI agents
NEXT_PUBLIC_DEMIGOD_MODE=true              # Optional: enables debug menu (floating button, bottom-right)
```

## Development
```bash
npm run dev    # Start dev server at localhost:3000
npm run build  # Production build
npm run lint   # ESLint
npx tsc --noEmit  # Type-check without emitting
```

## Architecture Principle: No Ephemeral Game State
**All game state must be persisted to Firestore — nothing game-related should live only in memory.** The in-memory singleton in `gameState.ts` exists only as a per-request working copy. It is hydrated from Firestore at the start of each request (`loadGameState`) and flushed back at the end (`applyStateChangesAndPersist`). If a player refreshes the page, all state (player, story, activeNPCs, conversation history) must survive.

Never strip or zero out fields during persistence. If data is part of `GameState`, it gets saved.

## Architecture Principle: Class-Agnostic Design
**Every system must be generic across all D&D 5e classes — never hardcoded for a specific class or campaign.**

When implementing any feature, ask: *"Would this break or need rewriting for a Wizard, Barbarian, or Paladin?"*

Common violations to avoid:
- **Scaling features hardcoded to Rogue logic** — e.g. `Math.ceil(level / 2)` for Sneak Attack dice is Rogue-specific. Instead, store scaling data in `CharacterFeature` itself (e.g. a `scalingFormula` field) or derive it from the feature list rather than the class name.
- **HP-per-level hardcoded to d8** — different classes use d6, d8, d10, d12. Store `hitDie` on the character and compute from that.
- **Proficiency assumptions** — don't assume saving throw or skill proficiencies based on class; always read from the character data.
- **Weapon/damage assumptions** — don't infer damage from weapon names; always use `weaponDamage` in state (set by the DM or character creation).
- **Feature progression tables** — Sneak Attack, Rage uses, Spell Slots, Ki Points etc. should not be computed from class name. Either store the current value in state and let the DM/level-up flow update it, or maintain a class progression table keyed by class name.

## UI Design Rules
- **Minimum description text size: 16px** — No description or body text should be smaller than 16px (`text-sm` in Tailwind, overridden to 16px). Labels and navigation chrome may use smaller sizes, but any text the player reads for content must be at least `text-sm`.

## Data Storage Rules
- **Lowercase all string data persisted to Firestore** — When storing string values (proficiency names, skill names, item names, slugs, etc.) in Firestore, always normalize to lowercase. Display-layer code can capitalize for presentation, but the canonical stored form is lowercase.

## Codebase Conventions
- **Named interfaces for all component props** — Every React component uses a named `Props` (or `XxxProps`) interface. No inline prop type annotations on function signatures.
- **Shared utility functions in `gameTypes.ts`** — Pure functions like `formatModifier`, `getModifier`, `getProficiencyBonus`, `rollDice`, `formatWeaponDamage` live in `gameTypes.ts`. Server-side code imports them via re-exports from `gameState.ts`. Never duplicate these locally.
- **Named interfaces for request bodies** — API route handlers define a named interface for `req.json()` casts (e.g. `ChatRequestBody`, `DebugRequestBody`).
- **Comments on complex logic** — Non-obvious algorithms, multi-phase animations, and multi-step orchestration flows should have a doc comment explaining the high-level approach.
- **`React.memo` on expensive components** — Wrap components that are expensive to render (e.g. those using ReactMarkdown, inventory loops, spell slot arrays) in `React.memo` to prevent unnecessary re-renders when parent state changes but props are unchanged. Stabilize callback props with `useCallback` and derived arrays with `useMemo` so memo checks succeed.
