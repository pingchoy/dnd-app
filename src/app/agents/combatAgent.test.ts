import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock external dependencies ─────────────────────────────────────────────

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
  MODELS: { NARRATIVE: "test-model", UTILITY: "test-model" },
  MAX_TOKENS: { NARRATIVE: 2048, COMBAT: 1024, COMBAT_TURN: 400, UTILITY: 300, RULES_CLASSIFIER: 256 },
}));

const mockGetRecentMessages = vi.fn().mockResolvedValue([]);

vi.mock("../lib/messageStore", () => ({
  getRecentMessages: (...args: unknown[]) => mockGetRecentMessages(...args),
}));

import { getCombatResponse } from "./combatAgent";
import type { CombatContext } from "./combatAgent";
import type { PlayerState, StoredEncounter, NPC } from "../lib/gameTypes";

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    name: "Test Hero",
    gender: "male",
    characterClass: "fighter",
    race: "human",
    level: 5,
    hitDie: 10,
    xp: 6500,
    xpToNextLevel: 14000,
    currentHP: 40,
    maxHP: 40,
    armorClass: 16,
    stats: {
      strength: 16, dexterity: 14, constitution: 14,
      intelligence: 10, wisdom: 12, charisma: 8,
    },
    savingThrowProficiencies: ["strength", "constitution"],
    skillProficiencies: ["athletics", "perception"],
    weaponProficiencies: ["simple weapons", "martial weapons"],
    armorProficiencies: ["all armor", "shields"],
    features: [],
    inventory: ["chain mail", "shield", "longsword"],
    conditions: [],
    gold: 50,
    ...overrides,
  };
}

function makeNPC(): NPC {
  return {
    id: "goblin-1",
    name: "Goblin",
    ac: 15,
    currentHp: 7,
    maxHp: 7,
    attackBonus: 4,
    damageDice: "1d6",
    damageBonus: 2,
    savingThrowBonus: 0,
    xpValue: 50,
    disposition: "hostile",
    conditions: [],
    notes: "",
  };
}

function makeCombatContext(playerOverrides: Partial<PlayerState> = {}): CombatContext {
  return {
    player: makePlayer(playerOverrides),
    encounter: {
      id: "enc-1",
      sessionId: "session-1",
      characterId: "char-1",
      status: "active",
      activeNPCs: [makeNPC()],
      positions: { player: { row: 0, col: 0 }, "goblin-1": { row: 1, col: 1 } },
      gridSize: 10,
      round: 1,
      turnOrder: ["player", "goblin-1"],
      currentTurnIndex: 0,
      location: "Dark Forest",
      scene: "Goblin ambush",
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  mockGetRecentMessages.mockResolvedValue([]);
});

describe("getCombatResponse", () => {
  it("returns early with canned narrative when player at 0 HP", async () => {
    const context = makeCombatContext({ currentHP: 0 });

    const result = await getCombatResponse(
      "I try to fight",
      context,
      null,
      "session-1",
    );

    expect(result.narrative).toContain("Darkness closes in");
    expect(result.stateChanges).toBeNull();
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    // No Anthropic API call should have been made
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns narrative from end_turn response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "You shout a battle cry!" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 150, output_tokens: 40 },
    });

    const result = await getCombatResponse(
      "I shout to intimidate the goblin",
      makeCombatContext(),
      null,
      "session-1",
    );

    expect(result.narrative).toBe("You shout a battle cry!");
    expect(result.inputTokens).toBe(150);
    expect(result.outputTokens).toBe(40);
  });

  it("extracts stateChanges from update_game_state tool call (no hp_delta)", async () => {
    // Combat agent strips hp_delta from update_game_state
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: "text", text: "You use a healing potion. " },
        {
          type: "tool_use",
          id: "tool-1",
          name: "update_game_state",
          input: {
            items_lost: ["healing potion"],
            conditions_removed: ["poisoned"],
          },
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 150, output_tokens: 60 },
    });

    // Second call: AI finishes narrative
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "The poison fades." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 200, output_tokens: 20 },
    });

    const result = await getCombatResponse(
      "I drink a healing potion",
      makeCombatContext(),
      null,
      "session-1",
    );

    expect(result.stateChanges).toBeDefined();
    expect(result.stateChanges!.items_lost).toContain("healing potion");
    expect(result.narrative).toContain("potion");
  });

  it("returns DMResponse shape with all required fields", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Combat action." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 20 },
    });

    const result = await getCombatResponse("test", makeCombatContext(), null, "session-1");

    expect(result).toHaveProperty("narrative");
    expect(result).toHaveProperty("stateChanges");
    expect(result).toHaveProperty("npcDamagePreRolled");
    expect(result).toHaveProperty("inputTokens");
    expect(result).toHaveProperty("outputTokens");
  });
});
