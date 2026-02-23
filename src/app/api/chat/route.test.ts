import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock all external dependencies ─────────────────────────────────────────

vi.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: vi.fn(),
  credential: { cert: vi.fn() },
  firestore: vi.fn(() => ({})),
}));

vi.mock("../../lib/firebaseAdmin", () => ({
  adminDb: {},
}));

const mockGetDMResponse = vi.fn();
const mockGetCombatResponse = vi.fn();
const mockGetNPCStats = vi.fn();
const mockGetRulesOutcome = vi.fn();
const mockIsContestedAction = vi.fn().mockReturnValue(false);

vi.mock("../../agents/dmAgent", () => ({
  getDMResponse: (...args: unknown[]) => mockGetDMResponse(...args),
}));

vi.mock("../../agents/combatAgent", () => ({
  getCombatResponse: (...args: unknown[]) => mockGetCombatResponse(...args),
}));

vi.mock("../../agents/npcAgent", () => ({
  getNPCStats: (...args: unknown[]) => mockGetNPCStats(...args),
}));

vi.mock("../../agents/rulesAgent", () => ({
  getRulesOutcome: (...args: unknown[]) => mockGetRulesOutcome(...args),
  isContestedAction: (...args: unknown[]) => mockIsContestedAction(...args),
}));

const mockLoadGameState = vi.fn();
const mockGetGameState = vi.fn();
const mockGetSessionId = vi.fn().mockReturnValue("session-1");
const mockApplyStateChangesAndPersist = vi.fn();
const mockGetEncounter = vi.fn().mockReturnValue(null);
const mockGetActiveNPCs = vi.fn().mockReturnValue([]);

vi.mock("../../lib/gameState", () => ({
  loadGameState: (...args: unknown[]) => mockLoadGameState(...args),
  getGameState: () => mockGetGameState(),
  getSessionId: () => mockGetSessionId(),
  applyStateChangesAndPersist: (...args: unknown[]) => mockApplyStateChangesAndPersist(...args),
  getEncounter: () => mockGetEncounter(),
  getActiveNPCs: () => mockGetActiveNPCs(),
  getActiveMapId: vi.fn().mockReturnValue(undefined),
  getExplorationMapId: vi.fn().mockReturnValue(undefined),
  getExplorationPositions: vi.fn().mockReturnValue(undefined),
  getCurrentPOIId: vi.fn().mockReturnValue(undefined),
  setCurrentPOIId: vi.fn(),
  getCampaignSlug: vi.fn().mockReturnValue(undefined),
  setEncounter: vi.fn(),
  createNPC: vi.fn(),
  serializeCampaignContext: vi.fn().mockReturnValue(""),
  serializeExplorationContext: vi.fn().mockReturnValue(""),
  serializeRegionContext: vi.fn().mockReturnValue(""),
}));

vi.mock("../../lib/encounterStore", () => ({
  createEncounter: vi.fn(),
  computeInitialPositions: vi.fn().mockReturnValue({}),
}));

vi.mock("../../lib/mapStore", () => ({
  loadMap: vi.fn().mockResolvedValue(null),
  loadExplorationMap: vi.fn().mockResolvedValue(null),
  updateMap: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/characterStore", () => ({
  querySRD: vi.fn(),
  loadSession: vi.fn().mockResolvedValue(null),
  saveSessionState: vi.fn().mockResolvedValue(undefined),
  getCampaign: vi.fn().mockResolvedValue(null),
  getCampaignAct: vi.fn().mockResolvedValue(null),
}));

const mockCalculateCost = vi.fn().mockReturnValue(0.001);

vi.mock("../../lib/anthropic", () => ({
  MODELS: { NARRATIVE: "test-model", UTILITY: "test-model" },
  calculateCost: (...args: unknown[]) => mockCalculateCost(...args),
}));

const mockAddMessage = vi.fn().mockResolvedValue("msg-1");

vi.mock("../../lib/messageStore", () => ({
  addMessage: (...args: unknown[]) => mockAddMessage(...args),
}));

const mockEnqueueAction = vi.fn().mockResolvedValue("action-1");
const mockClaimNextAction = vi.fn();
const mockCompleteAction = vi.fn().mockResolvedValue(false);
const mockFailAction = vi.fn();

vi.mock("../../lib/actionQueue", () => ({
  enqueueAction: (...args: unknown[]) => mockEnqueueAction(...args),
  claimNextAction: (...args: unknown[]) => mockClaimNextAction(...args),
  completeAction: (...args: unknown[]) => mockCompleteAction(...args),
  failAction: (...args: unknown[]) => mockFailAction(...args),
}));

import { POST, GET } from "./route";
import { NextRequest } from "next/server";

// ─── Helper ─────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>, method = "POST"): NextRequest {
  return new NextRequest("http://localhost:3000/api/chat", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeGETRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/chat");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const mockGameState = {
  player: {
    name: "Test Hero",
    level: 5,
    currentHP: 40,
    maxHP: 40,
    pendingLevelUp: undefined,
  },
  story: {
    campaignTitle: "Test",
    currentLocation: "Tavern",
    currentScene: "Resting",
    activeQuests: [],
    metNPCs: [],
    recentEvents: [],
  },
};

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  mockGetSessionId.mockReturnValue("session-1");
  mockGetEncounter.mockReturnValue(null);
  mockGetActiveNPCs.mockReturnValue([]);
  mockIsContestedAction.mockReturnValue(false);
  mockEnqueueAction.mockResolvedValue("action-1");
  mockCompleteAction.mockResolvedValue(false);
  mockApplyStateChangesAndPersist.mockResolvedValue(undefined);
  mockLoadGameState.mockResolvedValue(mockGameState);
  mockGetGameState.mockReturnValue(mockGameState);
  mockCalculateCost.mockReturnValue(0.001);
  mockAddMessage.mockResolvedValue("msg-1");
});

describe("POST /api/chat", () => {
  it("returns 400 when playerInput is missing", async () => {
    const req = makeRequest({ characterId: "char-1" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("playerInput");
  });

  it("returns 400 when characterId is missing", async () => {
    const req = makeRequest({ playerInput: "hello" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("characterId");
  });

  it("returns 409 when level-up is pending", async () => {
    mockLoadGameState.mockResolvedValueOnce({
      ...mockGameState,
      player: { ...mockGameState.player, pendingLevelUp: { fromLevel: 4, toLevel: 5, levels: [] } },
    });

    const req = makeRequest({ characterId: "char-1", playerInput: "hello" });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.pendingLevelUp).toBe(true);
  });

  it("returns 202 when action is queued (another processor active)", async () => {
    mockClaimNextAction.mockResolvedValueOnce(null); // Can't claim — another processor

    const req = makeRequest({ characterId: "char-1", playerInput: "I look around" });
    const res = await POST(req);
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.queued).toBe(true);
  });

  it("returns 200 with gameState and cost on success", async () => {
    mockClaimNextAction.mockResolvedValueOnce({
      id: "action-1",
      characterId: "char-1",
      type: "chat",
      payload: { playerInput: "I look around" },
      status: "processing",
      createdAt: Date.now(),
    });

    mockGetDMResponse.mockResolvedValueOnce({
      narrative: "You see a dimly lit tavern.",
      stateChanges: null,
      npcDamagePreRolled: 0,
      inputTokens: 200,
      outputTokens: 50,
    });

    const req = makeRequest({ characterId: "char-1", playerInput: "I look around" });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.gameState).toBeDefined();
    expect(json.tokensUsed).toBeDefined();
    expect(json.estimatedCostUsd).toBeDefined();
  });

  it("returns 500 on internal error", async () => {
    mockLoadGameState.mockRejectedValueOnce(new Error("Firestore down"));

    const req = makeRequest({ characterId: "char-1", playerInput: "hello" });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("Firestore down");
  });
});

describe("GET /api/chat", () => {
  it("returns 400 when characterId is missing", async () => {
    const req = makeGETRequest({});
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns gameState on success", async () => {
    const req = makeGETRequest({ characterId: "char-1" });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.gameState).toBeDefined();
    expect(json.sessionId).toBe("session-1");
  });

  it("returns 500 when loadGameState fails", async () => {
    mockLoadGameState.mockRejectedValueOnce(new Error("Not found"));

    const req = makeGETRequest({ characterId: "nonexistent" });
    const res = await GET(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("Not found");
  });
});
