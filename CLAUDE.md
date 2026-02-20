# AI Dungeon Master — Project Overview

## Purpose
An AI-powered Dungeon Master for D&D 5e, built with Next.js 14 and the Anthropic Claude SDK. A single player interacts via a chat interface; multiple specialized AI agents handle different concerns to keep each call focused and cost-efficient.

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
    └── [Haiku] Rules Agent — validates roll, parses damage

  Phase 2: /api/chat
    ├── [Haiku/Sonnet] DM Agent — narrative + tool_use (update_game_state, update_npc, query_srd)
    ├── [Haiku] NPC Agent — generates stat blocks for new creatures (triggered by DM's npcs_to_create)
    └── [Safety Net] Auto-apply pre-rolled NPC damage if DM omits hp_delta
         ↓
    Returns: { narrative, gameState, tokensUsed, estimatedCostUsd }
```

**Cost optimization**: Haiku for rules checks and NPC stat generation (~$0.001/call), Sonnet/Haiku for DM narrative. The DM uses `update_game_state` tool_use so state changes require zero extra API calls. Rolling 10-turn conversation window keeps input tokens bounded.

## Key Files

| Path | Purpose |
|------|---------|
| **Agents** | |
| `src/app/agents/dmAgent.ts` | DM narrative agent with tool_use loop (update_game_state, update_npc, query_srd) |
| `src/app/agents/rulesAgent.ts` | D&D rules validator, dice interpreter, damage parser |
| `src/app/agents/npcAgent.ts` | Generates NPC combat stat blocks from SRD data |
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
