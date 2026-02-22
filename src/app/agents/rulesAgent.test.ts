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

import { getRulesOutcome } from "./rulesAgent";
import type { PlayerState, NPC } from "../lib/gameTypes";

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makePlayer(): PlayerState {
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
      strength: 16,
      dexterity: 14,
      constitution: 14,
      intelligence: 10,
      wisdom: 12,
      charisma: 8,
    },
    savingThrowProficiencies: ["strength", "constitution"],
    skillProficiencies: ["athletics", "perception"],
    weaponProficiencies: ["simple weapons", "martial weapons"],
    armorProficiencies: ["all armor", "shields"],
    features: [],
    inventory: ["chain mail", "shield", "longsword"],
    conditions: [],
    gold: 50,
    abilities: [
      {
        id: "weapon:longsword",
        name: "Longsword",
        type: "weapon",
        requiresTarget: true,
        damageRoll: "1d8",
        damageType: "slashing",
        weaponStat: "str",
        weaponBonus: 0,
      },
    ],
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

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getRulesOutcome", () => {
  it("dispatches resolve_attack tool call to resolver", async () => {
    // Seed random for deterministic attack roll
    vi.spyOn(Math, "random").mockReturnValue(0.7); // d20 = 15

    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          id: "tool-1",
          name: "resolve_attack",
          input: { weapon: "Longsword", target: "Goblin" },
        },
      ],
      usage: { input_tokens: 100, output_tokens: 30 },
    });

    const result = await getRulesOutcome("I attack the goblin", makePlayer(), [makeNPC()]);

    expect(result.parsed.checkType).toContain("Attack");
    expect(result.parsed.success).toBe(true); // 15 + 6 = 21 vs AC 15
    expect(result.roll).toBe(15);
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(30);
  });

  it("dispatches resolve_skill_check tool call", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // d20 = 11

    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          id: "tool-1",
          name: "resolve_skill_check",
          input: { skill: "athletics", dc: 15 },
        },
      ],
      usage: { input_tokens: 80, output_tokens: 25 },
    });

    const result = await getRulesOutcome("I try to climb the wall", makePlayer());

    expect(result.parsed.checkType).toBe("Athletics Check");
    // d20=11, STR+3, Prof+3 = 17 >= 15
    expect(result.parsed.success).toBe(true);
  });

  it("dispatches resolve_saving_throw tool call", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.0); // d20 = 1

    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          id: "tool-1",
          name: "resolve_saving_throw",
          input: { ability: "dexterity", dc: 15, source: "Fire Trap" },
        },
      ],
      usage: { input_tokens: 90, output_tokens: 25 },
    });

    const result = await getRulesOutcome("I dodge the trap", makePlayer());

    expect(result.parsed.checkType).toBe("Dexterity Saving Throw");
    // d20=1, DEX+2, not proficient = 3 < 15
    expect(result.parsed.success).toBe(false);
    expect(result.parsed.notes).toContain("Fire Trap");
  });

  it("dispatches mark_impossible tool call", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          id: "tool-1",
          name: "mark_impossible",
          input: { reason: "Fighter cannot cast Fireball" },
        },
      ],
      usage: { input_tokens: 70, output_tokens: 20 },
    });

    const result = await getRulesOutcome("I cast fireball", makePlayer());

    expect(result.parsed.impossible).toBe(true);
    expect(result.parsed.notes).toBe("Fighter cannot cast Fireball");
  });

  it("dispatches mark_no_check tool call", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          id: "tool-1",
          name: "mark_no_check",
          input: { reason: "Walking across the room needs no check" },
        },
      ],
      usage: { input_tokens: 60, output_tokens: 15 },
    });

    const result = await getRulesOutcome("I walk to the door", makePlayer());

    expect(result.parsed.noCheck).toBe(true);
    expect(result.parsed.notes).toBe("Walking across the room needs no check");
  });

  it("falls back to no-check when AI returns no tool call", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Just narrative" }],
      usage: { input_tokens: 50, output_tokens: 10 },
    });

    const result = await getRulesOutcome("I look around", makePlayer());

    expect(result.parsed.noCheck).toBe(true);
    expect(result.raw).toContain("CHECK: NONE");
  });

  it("returns correct RulesOutcome shape", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          id: "tool-1",
          name: "resolve_skill_check",
          input: { skill: "perception", dc: 12 },
        },
      ],
      usage: { input_tokens: 80, output_tokens: 25 },
    });

    const result = await getRulesOutcome("I look for traps", makePlayer());

    // Verify shape
    expect(result).toHaveProperty("parsed");
    expect(result).toHaveProperty("raw");
    expect(result).toHaveProperty("roll");
    expect(result).toHaveProperty("inputTokens");
    expect(result).toHaveProperty("outputTokens");
    expect(typeof result.raw).toBe("string");
    expect(typeof result.roll).toBe("number");
  });
});
