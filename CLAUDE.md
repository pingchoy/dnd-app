# AI Dungeon Master — Project Overview

## Purpose
An AI-powered Dungeon Master for D&D 5e, built with Next.js 14 and the Anthropic Claude SDK. A single player interacts via a chat interface; multiple specialized AI agents handle different concerns to keep each call focused and cost-efficient.

## Tech Stack
- **Framework**: Next.js 14 (App Router), React 18, TypeScript
- **AI**: Anthropic Claude SDK (`@anthropic-ai/sdk`)
- **Styling**: Tailwind CSS, HeadlessUI, HeroIcons
- **Storage**: Firebase Firestore (configured, not yet integrated into game flow)

## Multi-Agent Architecture

```
Player Input
    ↓
/api/chat
    ├── [Free]  Keyword detection → contested action?
    ├── [Free]  Dice roll simulation (Math.random)
    ├── [Haiku] Rules Agent   — only for contested actions (attacks, checks, saves)
    └── [Sonnet] DM Agent     — narrative generation + tool_use to update game state
         ↓
    Returns: { dmResponse, gameState, tokensUsed }
```

**Cost optimization**: Haiku for rules checks (~$0.001/call), Sonnet only for DM narrative. The DM uses `update_game_state` tool_use so state changes require zero extra API calls. Rolling 10-turn conversation window keeps input tokens bounded.

## Key Files

| Path | Purpose |
|------|---------|
| `src/app/lib/anthropic.ts` | Anthropic client + model/token constants |
| `src/app/lib/gameState.ts` | In-memory singleton game state (player, story, history) |
| `src/app/agents/dmAgent.ts` | Main DM narrative agent (claude-sonnet-4-6) |
| `src/app/agents/rulesAgent.ts` | D&D rules validator + dice interpreter (claude-3-5-haiku) |
| `src/app/api/chat/route.ts` | Orchestrates the agent pipeline |
| `src/app/hooks/useChat.tsx` | React hook for frontend chat state |
| `src/app/dashboard/page.tsx` | Main chat UI |
| `src/app/components/ChatCard.tsx` | Renders individual messages |
| `Sample_JSON/` | Character sheets and campaign data (Xavier, Glombus, campaign) |

## Player Character
Currently assumes one player: **Xavier** (Half-Elf Rogue 5). Campaign: *The Shadows of Evershade*.

## Environment Variables
```
ANTHROPIC_API_KEY=your-key-here   # Required for AI agents
```

## Development
```bash
npm run dev    # Start dev server at localhost:3000
npm run build  # Production build
npm run lint   # ESLint
```

## Adding More Players
Update `src/app/lib/gameState.ts` — the `GameState` interface can be extended to support multiple players when needed.

## Architecture Principle: Class-Agnostic Design
**Every system must be generic across all D&D 5e classes — never hardcoded for a specific class or campaign.**

When implementing any feature, ask: *"Would this break or need rewriting for a Wizard, Barbarian, or Paladin?"*

Common violations to avoid:
- **Scaling features hardcoded to Rogue logic** — e.g. `Math.ceil(level / 2)` for Sneak Attack dice is Rogue-specific. Instead, store scaling data in `CharacterFeature` itself (e.g. a `scalingFormula` field) or derive it from the feature list rather than the class name.
- **HP-per-level hardcoded to d8** — different classes use d6, d8, d10, d12. Store `hitDie` on the character and compute from that.
- **Proficiency assumptions** — don't assume saving throw or skill proficiencies based on class; always read from the character data.
- **Weapon/damage assumptions** — don't infer damage from weapon names; always use `weaponDamage` in state (set by the DM or character creation).
- **Feature progression tables** — Sneak Attack, Rage uses, Spell Slots, Ki Points etc. should not be computed from class name. Either store the current value in state and let the DM/level-up flow update it, or maintain a class progression table keyed by class name.

**Current known violations to fix:**
- `awardXP` / `updateFeaturesOnLevelUp` in `gameState.ts` — Sneak Attack update logic is Rogue-specific. Should scan `features` array for a `scalesWithLevel` flag rather than knowing about Sneak Attack by name.
- `awardXP` HP gain uses a hardcoded `5` (average of d8). Should use a `hitDie` field on `PlayerState`.
