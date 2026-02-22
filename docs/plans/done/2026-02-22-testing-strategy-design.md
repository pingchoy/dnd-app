# Testing Strategy Design

## Goal

Enable autonomous agents to verify they haven't broken anything when modifying the codebase. A layered test suite that runs fast (`npm test`), requires no external services, and covers all critical paths.

## Decisions

- **Test runner**: Vitest (fast, native ESM/TS, Jest-compatible API)
- **Component testing**: @testing-library/react + @testing-library/jest-dom
- **Mocking strategy**: `vi.mock()` at module level for Firebase and Anthropic SDK — no emulators needed
- **Test location**: Colocated with source files (e.g. `gameTypes.test.ts` next to `gameTypes.ts`)
- **Deterministic randomness**: `vi.spyOn(Math, 'random')` to control dice rolls in tests

## Dependencies to Install

```
vitest @vitejs/plugin-react
@testing-library/react @testing-library/jest-dom @testing-library/user-event
jsdom
```

## npm Scripts

- `npm test` — run all tests once (CI / agent use)
- `npm run test:watch` — interactive watch mode
- `npm run test:coverage` — coverage report

## Test Layers (priority order)

### Layer 1: Pure Function Unit Tests (zero mocking)

**`gameTypes.test.ts`**:
- `getModifier()` — stat 10→0, stat 8→-1, stat 20→+5, edge cases
- `getProficiencyBonus()` — levels 1-20 match D&D 5e table
- `formatModifier()` — positive/negative/zero formatting
- `rollDice()` — valid expressions return correct shape, invalid returns empty
- `doubleDice()` — "2d6"→"4d6", non-standard input passthrough
- `crToXP()` — numeric, string, fraction ("1/4"), unknown CR
- `xpForLevel()` — levels 1-20 match thresholds, out-of-range
- `toDisplayCase()` — hyphens, minor words, empty string
- `formatAbilityDamage()` — STR/DEX/finesse weapons with various stats
- `getWeaponAbilityMod()` — all four stat types
- `applyEffects()` — AC formulas, stacking bonuses, conditional effects, deduplication of resistances/immunities

**`actionResolver.test.ts`**:
- `resolveAttack()` — hit/miss vs AC, nat 20 crit (double dice), nat 1 auto-miss, proficiency, weapon bonus
- `resolveSkillCheck()` — proficient vs non-proficient, expertise, DC pass/fail
- `resolveSavingThrow()` — proficient saves, ability modifier
- `markImpossible()` / `markNoCheck()` — correct shape

**`combatResolver.test.ts`**:
- Weapon attacks with advantage/disadvantage
- NPC turn resolution
- Spell attacks

### Layer 2: State Mutation Tests (mocked Firestore)

**`gameState.test.ts`**:
- HP changes (damage, healing, clamp to 0/max)
- Inventory add/remove
- NPC creation and updates (HP, death at 0)
- XP award and level-up threshold detection
- State round-trip: mutate → persist → reload → verify unchanged

### Layer 3: Agent Tests (mocked Anthropic)

**`dmAgent.test.ts`**, **`combatAgent.test.ts`**, **`rulesAgent.test.ts`**:
- Mock Anthropic SDK to return canned tool_use responses
- Verify agents call correct tools (combat agent → `update_npc`, not story tools)
- Verify output shape matches `DMResponse` / `RulesOutcome`
- Verify conversation history trimming

### Layer 4: API Route Tests

**`route.test.ts`** for `/api/chat`, `/api/combat/action`:
- Returns correct response shape (`{ narrative, gameState }`)
- Handles missing/invalid parameters (400 errors)
- Error responses for server failures (500)

### Layer 5: Component Tests (RTL)

Priority components:
- `ChatCard` — renders markdown, displays roll results
- `CharacterSheet` — stats, inventory, abilities display
- `DiceRoll` — roll breakdown rendering
- `LevelUpWizard` — step navigation, form interaction
- `CharacterSidebar` — character summary display

Test pattern: render with props → query by role/text → assert visible content. No snapshot tests.

## Mock Architecture

### Firebase Mock (`__mocks__/firebase.ts` or inline vi.mock)

```typescript
// All Firestore operations return in-memory data
vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(() => ({ exists: () => true, data: () => mockData })),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  getDocs: vi.fn(),
}));
```

### Anthropic Mock

```typescript
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn(() => Promise.resolve({
        content: [{ type: "tool_use", name: "update_game_state", input: { ... } }],
        usage: { input_tokens: 100, output_tokens: 50 },
      })),
    };
  },
}));
```

## Config Files

### `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

### `src/test-setup.ts`

```typescript
import "@testing-library/jest-dom";
```

## Success Criteria

- `npm test` runs in <30 seconds with zero external dependencies
- All D&D 5e math functions have deterministic tests
- Agents can run `npm test` after any change to verify nothing broke
- Tests serve as living documentation of expected behavior
