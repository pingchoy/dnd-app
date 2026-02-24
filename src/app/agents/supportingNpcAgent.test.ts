// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

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
  MODELS: { UTILITY: "test-model" },
  MAX_TOKENS: { NPC_AGENT: 512 },
}));

import { getSupportingNPCProfile } from "./supportingNpcAgent";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getSupportingNPCProfile", () => {
  it("returns a SupportingNPC from valid JSON response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            id: "old-marta",
            name: "old marta",
            role: "informant",
            appearance:
              "a weathered fisherwoman with calloused hands and a knowing gaze",
            personality:
              "shrewd and tight-lipped, but warms to those who buy her fish",
            motivations: [
              "protect her grandchildren",
              "keep the docks peaceful",
            ],
            location: "valdris docks",
            notes:
              "knows all the dock gossip, saw suspicious activity last week",
          }),
        },
      ],
      usage: { input_tokens: 150, output_tokens: 100 },
    });

    const result = await getSupportingNPCProfile({
      name: "Old Marta",
      role: "informant",
      context: "A fishmonger at the docks who witnessed the smuggling.",
      currentLocation: "Valdris Docks",
    });

    expect(result.npc.id).toBe("old-marta");
    expect(result.npc.name).toBe("old marta");
    expect(result.npc.role).toBe("informant");
    expect(result.npc.appearance).toBeTruthy();
    expect(result.inputTokens).toBe(150);
    expect(result.outputTokens).toBe(100);
  });

  it("builds fallback NPC when JSON parsing fails", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "This is not valid JSON at all" }],
      usage: { input_tokens: 150, output_tokens: 50 },
    });

    const result = await getSupportingNPCProfile({
      name: "Old Marta",
      role: "informant",
      context: "A fishmonger at the docks.",
      currentLocation: "Valdris Docks",
    });

    expect(result.npc.name).toBe("old marta");
    expect(result.npc.role).toBe("informant");
    expect(result.npc.location).toBe("valdris docks");
    expect(result.npc.notes).toContain("fishmonger");
  });
});
