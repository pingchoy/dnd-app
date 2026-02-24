// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Firestore dependencies ─────────────────────────────────────────────

vi.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: vi.fn(),
  credential: { cert: vi.fn() },
  firestore: vi.fn(() => ({})),
}));

vi.mock("../lib/firebaseAdmin", () => ({
  adminDb: {},
}));

const mockGetCampaign = vi.fn();
const mockGetCampaignAct = vi.fn();

vi.mock("../lib/characterStore", () => ({
  getCampaign: (...args: unknown[]) => mockGetCampaign(...args),
  getCampaignAct: (...args: unknown[]) => mockGetCampaignAct(...args),
  querySRD: vi.fn(),
}));

import { handleCampaignQuery, handleSessionMemoryQuery } from "./agentUtils";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const CAMPAIGN_SLUG = "the-crimson-accord";

const fakeCampaign = {
  slug: CAMPAIGN_SLUG,
  title: "The Crimson Accord",
  dmSummary: "A dark political intrigue campaign.",
  npcs: [
    {
      id: "lysara-thorne",
      name: "Lysara Thorne",
      role: "patron",
      personality: { traits: ["cunning", "charismatic"], ideals: [], bonds: [], flaws: [] },
      motivations: ["power"],
      secrets: ["secretly a villain"],
      relationshipArc: { act1: "helpful patron", act2: "growing suspicion", act3: "revealed villain" },
    },
    {
      id: "captain-aldric-vane",
      name: "Captain Aldric Vane",
      role: "ally",
      personality: { traits: ["loyal", "gruff"], ideals: [], bonds: [], flaws: [] },
      motivations: ["justice"],
      secrets: ["has a dark past"],
      relationshipArc: { act1: "reluctant ally", act2: "trusted friend", act3: "sacrifices himself" },
    },
  ],
};

const fakeAct = {
  actNumber: 1,
  title: "Shadows Over Valdris",
  dmBriefing: "The party investigates disappearances.",
  storyBeats: [
    {
      name: "Dockside Smuggler Ambush",
      type: "combat",
      difficulty: "medium",
      location: "Valdris Docks",
      dmGuidance: "Smugglers attack from the shadows. DC 14 Perception to avoid surprise.",
      enemies: [{ count: 3, srdMonsterSlug: "bandit" }],
      rewards: { xp: 150, gold: 25 },
    },
    {
      name: "Council Reception",
      type: "social",
      difficulty: "easy",
      location: "Valdris Council Hall",
      dmGuidance: "Lysara introduces the party. DC 12 Insight to notice tension between council members.",
      npcInvolvement: ["lysara-thorne"],
    },
  ],
  npcs: [
    {
      id: "lysara-thorne",
      name: "Lysara Thorne",
      role: "patron",
      personality: { traits: ["charming", "polished"], ideals: [], bonds: [], flaws: [] },
      motivations: ["hire adventurers to investigate"],
      secrets: [],
      relationshipArc: { act1: "trusted patron", act2: "", act3: "" },
      dmNotes: "Play her as a warm, generous quest-giver. No hidden agenda hints.",
    },
    {
      id: "captain-aldric-vane",
      name: "Captain Aldric Vane",
      role: "ally",
      personality: { traits: ["loyal", "gruff"], ideals: [], bonds: [], flaws: [] },
      motivations: ["justice"],
      secrets: ["has unofficial case files"],
      relationshipArc: { act1: "cautious ally", act2: "", act3: "" },
    },
  ],
};

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  mockGetCampaign.mockResolvedValue(fakeCampaign);
  mockGetCampaignAct.mockResolvedValue(fakeAct);
});

describe("handleCampaignQuery", () => {
  describe("type='npc'", () => {
    it("returns act-scoped NPC data (spoiler-safe) when act has npcs", async () => {
      const { resultContent, newCount } = await handleCampaignQuery(
        { type: "npc", npc_id: "lysara-thorne" },
        CAMPAIGN_SLUG, 1, [], 0, 3, "Test",
      );

      const result = JSON.parse(resultContent);
      expect(result.id).toBe("lysara-thorne");
      expect(result.name).toBe("Lysara Thorne");
      expect(result.role).toBe("patron");
      expect(result.secrets).toEqual([]);
      expect(result.relationshipArc.act1).toBe("trusted patron");
      expect(result.personality.traits).toContain("charming");
      expect(newCount).toBe(1);
    });

    it("returns error when act has no npcs array", async () => {
      mockGetCampaignAct.mockResolvedValueOnce({ ...fakeAct, npcs: undefined });

      const { resultContent } = await handleCampaignQuery(
        { type: "npc", npc_id: "lysara-thorne" },
        CAMPAIGN_SLUG, 1, [], 0, 3, "Test",
      );

      const result = JSON.parse(resultContent);
      expect(result.error).toContain("lysara-thorne");
    });

    it("returns error for unknown npc_id", async () => {
      const { resultContent, newCount } = await handleCampaignQuery(
        { type: "npc", npc_id: "nonexistent" },
        CAMPAIGN_SLUG, 1, [], 0, 3, "Test",
      );

      const result = JSON.parse(resultContent);
      expect(result.error).toContain("nonexistent");
      expect(newCount).toBe(1);
    });
  });

  describe("type='act'", () => {
    it("returns act data for current act", async () => {
      const { resultContent, newCount } = await handleCampaignQuery(
        { type: "act" },
        CAMPAIGN_SLUG, 1, [], 0, 3, "Test",
      );

      const result = JSON.parse(resultContent);
      expect(result.actNumber).toBe(1);
      expect(result.title).toBe("Shadows Over Valdris");
      // storyBeats should be stripped from act queries
      expect(result.storyBeats).toBeUndefined();
      expect(newCount).toBe(1);
    });

    it("uses explicit act_number over currentAct", async () => {
      await handleCampaignQuery(
        { type: "act", act_number: 2 },
        CAMPAIGN_SLUG, 1, [], 0, 3, "Test",
      );

      expect(mockGetCampaignAct).toHaveBeenCalledWith(CAMPAIGN_SLUG, 2);
    });

    it("returns error when act not found", async () => {
      mockGetCampaignAct.mockResolvedValueOnce(null);

      const { resultContent } = await handleCampaignQuery(
        { type: "act", act_number: 99 },
        CAMPAIGN_SLUG, 1, [], 0, 3, "Test",
      );

      const result = JSON.parse(resultContent);
      expect(result.error).toContain("Act 99");
    });
  });

  describe("type='story_beat'", () => {
    it("returns story beat data by name (case-insensitive)", async () => {
      const { resultContent, newCount } = await handleCampaignQuery(
        { type: "story_beat", story_beat_name: "dockside smuggler ambush" },
        CAMPAIGN_SLUG, 1, [], 0, 3, "Test",
      );

      const result = JSON.parse(resultContent);
      expect(result.name).toBe("Dockside Smuggler Ambush");
      expect(result.dmGuidance).toContain("DC 14 Perception");
      expect(result.enemies).toHaveLength(1);
      expect(newCount).toBe(1);
    });

    it("returns error for unknown story beat name", async () => {
      const { resultContent } = await handleCampaignQuery(
        { type: "story_beat", story_beat_name: "Nonexistent Battle" },
        CAMPAIGN_SLUG, 1, [], 0, 3, "Test",
      );

      const result = JSON.parse(resultContent);
      expect(result.error).toContain("Nonexistent Battle");
    });

    it("blocks querying future story beats", async () => {
      const { resultContent } = await handleCampaignQuery(
        { type: "story_beat", story_beat_name: "Council Reception" },
        CAMPAIGN_SLUG, 1, [], 0, 3, "Test",
      );

      const result = JSON.parse(resultContent);
      expect(result.error).toContain("Cannot query future story beats");
    });

    it("allows querying completed story beats", async () => {
      const { resultContent } = await handleCampaignQuery(
        { type: "story_beat", story_beat_name: "Dockside Smuggler Ambush" },
        CAMPAIGN_SLUG, 1, ["Dockside Smuggler Ambush"], 0, 3, "Test",
      );

      const result = JSON.parse(resultContent);
      expect(result.name).toBe("Dockside Smuggler Ambush");
    });

    it("returns error when act not found for story beat query", async () => {
      mockGetCampaignAct.mockResolvedValueOnce(null);

      const { resultContent } = await handleCampaignQuery(
        { type: "story_beat", story_beat_name: "Dockside Smuggler Ambush", act_number: 99 },
        CAMPAIGN_SLUG, 1, [], 0, 3, "Test",
      );

      const result = JSON.parse(resultContent);
      expect(result.error).toContain("Act 99");
    });
  });

  describe("edge cases", () => {
    it("returns error when no campaign slug is set", async () => {
      const { resultContent, newCount } = await handleCampaignQuery(
        { type: "npc", npc_id: "lysara-thorne" },
        undefined, 1, [], 0, 3, "Test",
      );

      const result = JSON.parse(resultContent);
      expect(result.error).toContain("No campaign");
      expect(newCount).toBe(0);
      expect(mockGetCampaign).not.toHaveBeenCalled();
    });

    it("returns error when query limit is reached", async () => {
      const { resultContent, newCount } = await handleCampaignQuery(
        { type: "npc", npc_id: "lysara-thorne" },
        CAMPAIGN_SLUG, 1, [], 3, 3, "Test",
      );

      const result = JSON.parse(resultContent);
      expect(result.error).toContain("limit");
      expect(newCount).toBe(3);
      expect(mockGetCampaign).not.toHaveBeenCalled();
    });

    it("increments query count on each successful call", async () => {
      const r1 = await handleCampaignQuery(
        { type: "npc", npc_id: "lysara-thorne" },
        CAMPAIGN_SLUG, 1, [], 0, 3, "Test",
      );
      expect(r1.newCount).toBe(1);

      const r2 = await handleCampaignQuery(
        { type: "npc", npc_id: "captain-aldric-vane" },
        CAMPAIGN_SLUG, 1, [], r1.newCount, 3, "Test",
      );
      expect(r2.newCount).toBe(2);
    });

    it("returns error for unknown query type", async () => {
      const { resultContent, newCount } = await handleCampaignQuery(
        { type: "unknown" },
        CAMPAIGN_SLUG, 1, [], 0, 3, "Test",
      );

      const result = JSON.parse(resultContent);
      expect(result.error).toContain("Unknown");
      expect(newCount).toBe(0);
    });
  });
});

describe("handleSessionMemoryQuery", () => {
  it("returns important events when query_type is important_events", () => {
    const result = handleSessionMemoryQuery(
      { query_type: "important_events" },
      ["allied with the dockworkers guild", "discovered the mayor's secret"],
      [],
    );
    expect(result).toContain("allied with the dockworkers guild");
    expect(result).toContain("discovered the mayor's secret");
  });

  it("returns supporting NPCs when query_type is supporting_npcs", () => {
    const result = handleSessionMemoryQuery(
      { query_type: "supporting_npcs" },
      [],
      [{
        id: "old-marta",
        name: "old marta",
        role: "informant",
        appearance: "weathered fisherwoman",
        personality: "shrewd",
        motivations: ["protect her grandchildren"],
        location: "valdris docks",
        notes: "saw suspicious activity",
      }],
    );
    expect(result).toContain("old marta");
    expect(result).toContain("informant");
    expect(result).toContain("valdris docks");
  });

  it("returns both when query_type is all", () => {
    const result = handleSessionMemoryQuery(
      { query_type: "all" },
      ["allied with the dockworkers guild"],
      [{ id: "old-marta", name: "old marta", role: "informant", appearance: "", personality: "", motivations: [], location: "docks", notes: "" }],
    );
    expect(result).toContain("allied with the dockworkers guild");
    expect(result).toContain("old marta");
  });

  it("returns empty message when no data exists", () => {
    const result = handleSessionMemoryQuery(
      { query_type: "all" },
      [],
      [],
    );
    expect(result).toContain("No important events");
    expect(result).toContain("No supporting NPCs");
  });
});
