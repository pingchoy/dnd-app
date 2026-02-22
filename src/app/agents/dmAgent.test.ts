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
  MAX_TOKENS: { NARRATIVE: 2048, COMBAT: 1024, UTILITY: 300, RULES_CLASSIFIER: 256 },
}));

const mockGetRecentMessages = vi.fn().mockResolvedValue([]);

vi.mock("../lib/messageStore", () => ({
  getRecentMessages: (...args: unknown[]) => mockGetRecentMessages(...args),
}));

vi.mock("../lib/gameState", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    updateNPC: vi.fn().mockReturnValue({
      found: true,
      name: "Goblin",
      died: false,
      removed: false,
      newHp: 5,
      xpAwarded: 0,
    }),
  };
});

import { getDMResponse } from "./dmAgent";
import type { GameState } from "../lib/gameTypes";

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeGameState(): GameState {
  return {
    player: {
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
    },
    story: {
      campaignTitle: "Test Campaign",
      campaignBackground: "A test adventure",
      currentLocation: "Tavern",
      currentScene: "Drinking ale",
      activeQuests: [],
      importantNPCs: [],
      recentEvents: [],
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  mockGetRecentMessages.mockResolvedValue([]);
});

describe("getDMResponse", () => {
  it("returns narrative from a simple end_turn response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "You enter the tavern." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 200, output_tokens: 50 },
    });

    const result = await getDMResponse(
      "I walk into the tavern",
      makeGameState(),
      null,
      "session-1",
    );

    expect(result.narrative).toBe("You enter the tavern.");
    expect(result.stateChanges).toBeNull();
    expect(result.inputTokens).toBe(200);
    expect(result.outputTokens).toBe(50);
  });

  it("extracts stateChanges from update_game_state tool call", async () => {
    // First call: AI responds with tool use
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: "text", text: "The merchant hands you a healing potion. " },
        {
          type: "tool_use",
          id: "tool-1",
          name: "update_game_state",
          input: {
            items_gained: ["healing potion"],
            gold_delta: -25,
            notable_event: "Bought a healing potion",
          },
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 200, output_tokens: 80 },
    });

    // DM agent breaks loop after state mutation with no SRD queries — no second call needed

    const result = await getDMResponse(
      "I buy a healing potion",
      makeGameState(),
      null,
      "session-1",
    );

    expect(result.stateChanges).toEqual({
      items_gained: ["healing potion"],
      gold_delta: -25,
      notable_event: "Bought a healing potion",
    });
    expect(result.narrative).toContain("merchant");
    expect(result.inputTokens).toBe(200);
    expect(result.outputTokens).toBe(80);
  });

  it("returns DMResponse shape with all required fields", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Test." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 20 },
    });

    const result = await getDMResponse("test", makeGameState(), null, "session-1");

    expect(result).toHaveProperty("narrative");
    expect(result).toHaveProperty("stateChanges");
    expect(result).toHaveProperty("npcDamagePreRolled");
    expect(result).toHaveProperty("inputTokens");
    expect(result).toHaveProperty("outputTokens");
    expect(typeof result.narrative).toBe("string");
    expect(typeof result.npcDamagePreRolled).toBe("number");
  });

  it("includes rules outcome in user message when provided", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "You climb the wall." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 200, output_tokens: 50 },
    });

    const rulesOutcome = {
      parsed: {
        checkType: "Athletics Check",
        components: "STR +3, Prof +3 = +6",
        dieResult: 15,
        totalModifier: "+6",
        total: 21,
        dcOrAc: "15",
        success: true,
        notes: "Check succeeds",
      },
      raw: "CHECK: Athletics Check\nRESULT: SUCCESS",
      roll: 15,
      inputTokens: 50,
      outputTokens: 20,
    };

    await getDMResponse("I climb the wall", makeGameState(), rulesOutcome, "session-1");

    // Verify the API was called with user content containing the roll result
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    const lastMessage = callArgs.messages[callArgs.messages.length - 1];
    expect(lastMessage.content).toContain("Player roll result");
    expect(lastMessage.content).toContain("15");
  });
});
