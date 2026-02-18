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
