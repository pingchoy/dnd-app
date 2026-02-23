import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Firebase + stores to prevent module-level initialization ──────────

vi.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: vi.fn(),
  credential: { cert: vi.fn() },
  firestore: vi.fn(() => ({})),
}));

vi.mock("./firebaseAdmin", () => ({
  adminDb: {},
}));

const mockLoadCharacter = vi.fn();
const mockLoadSession = vi.fn().mockResolvedValue(null);
const mockSaveCharacterState = vi.fn();
const mockGetSRDClass = vi.fn();
const mockGetSRDClassLevel = vi.fn();
const mockGetSRDSubclassLevel = vi.fn();
const mockQuerySRD = vi.fn();

vi.mock("./characterStore", () => ({
  loadCharacter: (...args: unknown[]) => mockLoadCharacter(...args),
  loadSession: (...args: unknown[]) => mockLoadSession(...args),
  saveCharacterState: (...args: unknown[]) => mockSaveCharacterState(...args),
  getSRDClass: (...args: unknown[]) => mockGetSRDClass(...args),
  getSRDClassLevel: (...args: unknown[]) => mockGetSRDClassLevel(...args),
  getSRDSubclassLevel: (...args: unknown[]) => mockGetSRDSubclassLevel(...args),
  querySRD: (...args: unknown[]) => mockQuerySRD(...args),
}));

const mockLoadEncounter = vi.fn();
const mockSaveEncounterState = vi.fn();
const mockCompleteEncounter = vi.fn();

vi.mock("./encounterStore", () => ({
  loadEncounter: (...args: unknown[]) => mockLoadEncounter(...args),
  saveEncounterState: (...args: unknown[]) => mockSaveEncounterState(...args),
  completeEncounter: (...args: unknown[]) => mockCompleteEncounter(...args),
}));

import {
  loadGameState,
  getGameState,
  applyStateChanges,
  createNPC,
  updateNPC,
  setEncounter,
  getEncounter,
  getActiveNPCs,
  awardXPAsync,
  applyStateChangesAndPersist,
  applyLevelUp,
} from "./gameState";
import type { PlayerState, StoredEncounter, NPC, PendingLevelUp, StoryState } from "./gameTypes";

// ─── Test fixtures ──────────────────────────────────────────────────────────

function makeStoredCharacter() {
  return {
    id: "char-1",
    sessionId: "session-1",
    player: makePlayer(),
    story: {
      campaignTitle: "Test Campaign",
      campaignBackground: "A test adventure",
      currentLocation: "Tavern",
      currentScene: "Drinking ale",
      activeQuests: [],
      metNPCs: [],
      recentEvents: [],
    } as StoryState,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    name: "Test Hero",
    gender: "male",
    characterClass: "fighter",
    race: "human",
    level: 3,
    hitDie: 10,
    xp: 900,
    xpToNextLevel: 2700,
    currentHP: 28,
    maxHP: 28,
    armorClass: 16,
    baseArmorClass: 16,
    baseSpeed: 30,
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
    inventory: ["chain mail", "shield", "longsword", "health potion"],
    conditions: [],
    gold: 50,
    ...overrides,
  };
}

function makeEncounter(npcs: NPC[] = []): StoredEncounter {
  return {
    id: "enc-1",
    sessionId: "session-1",
    characterIds: ["char-1"],
    status: "active",
    activeNPCs: npcs,
    positions: { player: { row: 0, col: 0 } },
    gridSize: 10,
    round: 1,
    turnOrder: ["player"],
    currentTurnIndex: 0,
    location: "Forest",
    scene: "Ambush",
  };
}

function makeNPC(overrides: Partial<NPC> = {}): NPC {
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
    ...overrides,
  };
}

// ─── Helper to hydrate the singleton ─────────────────────────────────────────

async function hydrateState(playerOverrides: Partial<PlayerState> = {}, encounterNPCs?: NPC[]) {
  const stored = makeStoredCharacter();
  stored.player = { ...stored.player, ...playerOverrides };
  mockLoadCharacter.mockResolvedValueOnce(stored);

  if (encounterNPCs) {
    // Load via loadGameState's encounter path
    stored.story.activeEncounterId = "enc-1";
    mockLoadEncounter.mockResolvedValueOnce(makeEncounter(encounterNPCs));
  }
  // Don't mock loadEncounter when not needed — avoids leftover mocks

  await loadGameState("char-1");
  return getGameState();
}

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  mockSaveCharacterState.mockResolvedValue(undefined);
  mockSaveEncounterState.mockResolvedValue(undefined);
  mockCompleteEncounter.mockResolvedValue(undefined);
  setEncounter(null);
});

describe("loadGameState", () => {
  it("hydrates state from Firestore", async () => {
    const gs = await hydrateState();
    expect(gs.player.name).toBe("Test Hero");
    expect(gs.story.campaignTitle).toBe("Test Campaign");
  });

  it("throws if character not found", async () => {
    mockLoadCharacter.mockResolvedValueOnce(null);
    await expect(loadGameState("nonexistent")).rejects.toThrow("not found");
  });

  it("loads encounter when activeEncounterId is set", async () => {
    const npcs = [makeNPC()];
    await hydrateState({}, npcs);
    const enc = getEncounter();
    expect(enc).not.toBeNull();
    expect(enc!.activeNPCs).toHaveLength(1);
  });
});

// ─── applyStateChanges ─────────────────────────────────────────────────────

describe("applyStateChanges", () => {
  describe("HP changes", () => {
    it("applies positive hp_delta (healing)", async () => {
      await hydrateState({ currentHP: 20, maxHP: 28 });
      applyStateChanges({ hp_delta: 5 });
      expect(getGameState().player.currentHP).toBe(25);
    });

    it("applies negative hp_delta (damage)", async () => {
      await hydrateState({ currentHP: 20, maxHP: 28 });
      applyStateChanges({ hp_delta: -8 });
      expect(getGameState().player.currentHP).toBe(12);
    });

    it("clamps HP to 0 (no negative HP)", async () => {
      await hydrateState({ currentHP: 5, maxHP: 28 });
      applyStateChanges({ hp_delta: -100 });
      expect(getGameState().player.currentHP).toBe(0);
    });

    it("clamps HP to maxHP (no overhealing)", async () => {
      await hydrateState({ currentHP: 25, maxHP: 28 });
      applyStateChanges({ hp_delta: 100 });
      expect(getGameState().player.currentHP).toBe(28);
    });
  });

  describe("inventory", () => {
    it("adds items", async () => {
      await hydrateState();
      applyStateChanges({ items_gained: ["magic ring", "scroll"] });
      const inv = getGameState().player.inventory;
      expect(inv).toContain("magic ring");
      expect(inv).toContain("scroll");
    });

    it("removes items by case-insensitive substring match", async () => {
      await hydrateState({ inventory: ["Health Potion", "Longsword"] });
      applyStateChanges({ items_lost: ["health potion"] });
      expect(getGameState().player.inventory).toEqual(["Longsword"]);
    });
  });

  describe("conditions", () => {
    it("adds conditions (deduped)", async () => {
      await hydrateState({ conditions: ["poisoned"] });
      applyStateChanges({ conditions_added: ["stunned", "poisoned"] });
      expect(getGameState().player.conditions).toEqual(["poisoned", "stunned"]);
    });

    it("removes conditions case-insensitively", async () => {
      await hydrateState({ conditions: ["poisoned", "stunned"] });
      applyStateChanges({ conditions_removed: ["Poisoned"] });
      expect(getGameState().player.conditions).toEqual(["stunned"]);
    });
  });

  describe("location and story", () => {
    it("updates location", async () => {
      await hydrateState();
      applyStateChanges({ location_changed: "Dark Forest" });
      expect(getGameState().story.currentLocation).toBe("Dark Forest");
    });

    it("updates scene", async () => {
      await hydrateState();
      applyStateChanges({ scene_update: "Campfire under stars" });
      expect(getGameState().story.currentScene).toBe("Campfire under stars");
    });

    it("adds notable event and caps at 10", async () => {
      await hydrateState();
      // Add 12 events
      for (let i = 0; i < 12; i++) {
        applyStateChanges({ notable_event: `event-${i}` });
      }
      const events = getGameState().story.recentEvents;
      expect(events).toHaveLength(10);
      expect(events[0]).toBe("event-2"); // oldest 2 trimmed
      expect(events[9]).toBe("event-11");
    });
  });

  describe("gold", () => {
    it("adds gold", async () => {
      await hydrateState({ gold: 50 });
      applyStateChanges({ gold_delta: 25 });
      expect(getGameState().player.gold).toBe(75);
    });

    it("subtracts gold, clamped to 0", async () => {
      await hydrateState({ gold: 10 });
      applyStateChanges({ gold_delta: -50 });
      expect(getGameState().player.gold).toBe(0);
    });
  });

  describe("XP", () => {
    it("awards XP", async () => {
      await hydrateState({ xp: 100 });
      applyStateChanges({ xp_gained: 200 });
      expect(getGameState().player.xp).toBe(300);
    });
  });

  describe("weapons", () => {
    it("adds weapon abilities from weapons_gained", async () => {
      await hydrateState({ abilities: [] });
      applyStateChanges({
        weapons_gained: [{
          name: "Rapier",
          dice: "1d8",
          stat: "finesse",
          bonus: 0,
          damageType: "piercing",
        }],
      });
      const abilities = getGameState().player.abilities!;
      expect(abilities).toHaveLength(1);
      expect(abilities[0].name).toBe("Rapier");
      expect(abilities[0].weaponStat).toBe("finesse");
    });

    it("removes weapon abilities when items_lost matches", async () => {
      await hydrateState({
        inventory: ["longsword"],
        abilities: [
          {
            id: "weapon:longsword",
            name: "Longsword",
            type: "weapon",
            requiresTarget: true,
            damageRoll: "1d8",
            weaponStat: "str",
          },
        ],
      });
      applyStateChanges({ items_lost: ["longsword"] });
      expect(getGameState().player.abilities).toHaveLength(0);
    });
  });

  describe("memory tiers", () => {
    it("adds milestones and caps at 20", async () => {
      await hydrateState();
      for (let i = 0; i < 22; i++) {
        applyStateChanges({ milestone: `milestone-${i}` });
      }
      const milestones = getGameState().story.milestones!;
      expect(milestones).toHaveLength(20);
    });

    it("updates campaign summary", async () => {
      await hydrateState();
      applyStateChanges({ campaign_summary_update: "New summary" });
      expect(getGameState().story.campaignSummary).toBe("New summary");
    });

    it("adds and completes quests", async () => {
      await hydrateState();
      applyStateChanges({ quests_added: ["Find the sword"] });
      expect(getGameState().story.activeQuests).toContain("find the sword");
      applyStateChanges({ quests_completed: ["find the sword"] });
      expect(getGameState().story.activeQuests).toHaveLength(0);
    });

    it("tracks met NPCs (deduped)", async () => {
      await hydrateState();
      applyStateChanges({ npcs_met: ["Gandalf", "Gandalf"] });
      expect(getGameState().story.metNPCs).toEqual(["gandalf"]);
    });
  });
});

// ─── NPC management ────────────────────────────────────────────────────────

describe("createNPC", () => {
  it("creates an NPC and adds to encounter", async () => {
    await hydrateState({}, []);
    const npc = createNPC({
      name: "Orc Warrior",
      ac: 13,
      max_hp: 15,
      attack_bonus: 5,
      damage_dice: "1d12",
      damage_bonus: 3,
      saving_throw_bonus: 1,
      xp_value: 100,
      disposition: "hostile",
      notes: "Leader of the war band",
    });

    expect(npc.name).toBe("Orc Warrior");
    expect(npc.currentHp).toBe(15);
    expect(npc.maxHp).toBe(15);
    expect(getActiveNPCs()).toHaveLength(1);
  });
});

describe("updateNPC", () => {
  it("applies damage to NPC", async () => {
    const goblin = makeNPC({ currentHp: 7, maxHp: 7 });
    await hydrateState({}, [goblin]);

    const result = updateNPC({ id: goblin.id, hp_delta: -3 });
    expect(result.found).toBe(true);
    expect(result.newHp).toBe(4);
    expect(result.died).toBe(false);
  });

  it("NPC dies at 0 HP but remains in activeNPCs", async () => {
    const goblin = makeNPC({ currentHp: 3, maxHp: 7 });
    await hydrateState({ xp: 0 }, [goblin]);

    const result = updateNPC({ id: goblin.id, hp_delta: -10 });
    expect(result.found).toBe(true);
    expect(result.died).toBe(true);
    expect(result.removed).toBe(false);
    expect(result.newHp).toBe(0);
    expect(getActiveNPCs()).toHaveLength(1);
    expect(getActiveNPCs()[0].currentHp).toBe(0);
  });

  it("defers XP to encounter when hostile NPC is killed", async () => {
    const goblin = makeNPC({ currentHp: 1, maxHp: 7, xpValue: 50, disposition: "hostile" });
    await hydrateState({ xp: 100 }, [goblin]);

    const result = updateNPC({ id: goblin.id, hp_delta: -10 });
    expect(result.xpAwarded).toBe(50);
    // XP is deferred to encounter end, not added to player inline
    expect(getGameState().player.xp).toBe(100);
  });

  it("does NOT award XP for neutral NPCs", async () => {
    const npc = makeNPC({ currentHp: 1, maxHp: 7, xpValue: 50, disposition: "neutral" });
    await hydrateState({ xp: 100 }, [npc]);

    const result = updateNPC({ id: npc.id, hp_delta: -10 });
    expect(result.xpAwarded).toBe(0);
    expect(getGameState().player.xp).toBe(100);
  });

  it("returns found=false for unknown NPC id", async () => {
    await hydrateState({}, [makeNPC()]);
    const result = updateNPC({ id: "unknown-id", hp_delta: -5 });
    expect(result.found).toBe(false);
  });

  it("clamps NPC HP to maxHp (no overhealing)", async () => {
    const npc = makeNPC({ currentHp: 5, maxHp: 7 });
    await hydrateState({}, [npc]);

    updateNPC({ id: npc.id, hp_delta: 100 });
    const updated = getActiveNPCs().find(n => n.id === npc.id);
    expect(updated!.currentHp).toBe(7);
  });

  it("adds and removes conditions", async () => {
    const npc = makeNPC({ conditions: [] });
    await hydrateState({}, [npc]);

    updateNPC({ id: npc.id, conditions_added: ["stunned", "prone"] });
    let updated = getActiveNPCs().find(n => n.id === npc.id);
    expect(updated!.conditions).toEqual(["stunned", "prone"]);

    updateNPC({ id: npc.id, conditions_removed: ["Stunned"] });
    updated = getActiveNPCs().find(n => n.id === npc.id);
    expect(updated!.conditions).toEqual(["prone"]);
  });

  it("records defeated NPC in recentEvents", async () => {
    const goblin = makeNPC({ currentHp: 1, xpValue: 50, disposition: "hostile" });
    await hydrateState({}, [goblin]);

    updateNPC({ id: goblin.id, hp_delta: -10 });
    expect(getGameState().story.recentEvents).toContainEqual(
      expect.stringContaining("Defeated Goblin"),
    );
  });
});

// ─── XP level-up detection ─────────────────────────────────────────────────

describe("awardXPAsync", () => {
  it("detects level-up when XP crosses threshold", async () => {
    // Level 3 requires 900 XP; level 4 requires 2700 XP
    mockGetSRDClass.mockResolvedValue({ asiLevels: [4, 8, 12, 16, 19] });
    mockGetSRDClassLevel.mockResolvedValue({ features: [] });
    mockGetSRDSubclassLevel.mockResolvedValue(null);

    await hydrateState({ level: 3, xp: 2600 });

    await awardXPAsync("char-1", 200); // 2600 + 200 = 2800 → level 4

    const player = getGameState().player;
    expect(player.xp).toBe(2800);
    expect(player.pendingLevelUp).toBeDefined();
    expect(player.pendingLevelUp!.toLevel).toBe(4);
  });

  it("does NOT trigger level-up when XP stays below threshold", async () => {
    await hydrateState({ level: 3, xp: 900 });

    await awardXPAsync("char-1", 50); // 950 → still level 3

    const player = getGameState().player;
    expect(player.pendingLevelUp).toBeUndefined();
  });
});

// ─── applyStateChangesAndPersist ────────────────────────────────────────────

describe("applyStateChangesAndPersist", () => {
  it("persists state to Firestore", async () => {
    await hydrateState();

    await applyStateChangesAndPersist({ hp_delta: -5 }, "char-1");

    expect(mockSaveCharacterState).toHaveBeenCalledWith("char-1", expect.objectContaining({
      player: expect.objectContaining({ currentHP: 23 }),
    }));
  });

  it("completes encounter when no hostile NPCs remain", async () => {
    const goblin = makeNPC({ currentHp: 1, disposition: "hostile" });
    await hydrateState({}, [goblin]);

    // Kill the goblin via updateNPC, then persist
    updateNPC({ id: goblin.id, hp_delta: -10 });
    await applyStateChangesAndPersist({}, "char-1");

    expect(mockCompleteEncounter).toHaveBeenCalledWith("enc-1");
  });

  it("saves encounter state when combat is ongoing", async () => {
    const goblin1 = makeNPC({ id: "g1", currentHp: 7, disposition: "hostile" });
    const goblin2 = makeNPC({ id: "g2", currentHp: 7, disposition: "hostile" });
    await hydrateState({}, [goblin1, goblin2]);

    // Kill one goblin, leave one alive
    updateNPC({ id: "g1", hp_delta: -10 });
    await applyStateChangesAndPersist({}, "char-1");

    expect(mockSaveEncounterState).toHaveBeenCalledWith("enc-1", expect.objectContaining({
      activeNPCs: expect.any(Array),
    }));
    expect(mockCompleteEncounter).not.toHaveBeenCalled();
  });
});

// ─── buildSpellAbility (tested via applyLevelUp) ────────────────────────────

describe("buildSpellAbility via applyLevelUp", () => {
  function makePendingLevelUp(): PendingLevelUp {
    return {
      fromLevel: 4,
      toLevel: 5,
      levels: [{
        level: 5,
        hpGain: 4,
        proficiencyBonus: 3,
        newFeatures: [],
        newSubclassFeatures: [],
        isASILevel: false,
        requiresSubclass: false,
        featureChoices: [],
        newCantripSlots: 0,
        newSpellSlots: 1,
        maxNewSpellLevel: 3,
      }],
    };
  }

  it("AOE spell from SRD: ability has aoe set and requiresTarget false", async () => {
    await hydrateState({
      level: 4,
      characterClass: "wizard",
      spellcastingAbility: "intelligence",
      abilities: [],
      knownSpells: [],
      pendingLevelUp: makePendingLevelUp(),
    });

    // Mock querySRD to return Fireball-like SRD data with AOE
    mockQuerySRD.mockResolvedValue({
      name: "Fireball",
      level: 3,
      range: "150 feet",
      savingThrowAbility: "dexterity",
      damageRoll: "8d6",
      damageTypes: ["fire"],
      aoe: { shape: "sphere", size: 20, origin: "target" },
    });

    await applyLevelUp("char-1", [{
      level: 5,
      newSpells: ["fireball"],
    }]);

    const player = getGameState().player;
    const fireball = player.abilities?.find(a => a.id === "spell:fireball");
    expect(fireball).toBeDefined();
    expect(fireball!.aoe).toEqual({ shape: "sphere", size: 20, origin: "target" });
    expect(fireball!.requiresTarget).toBe(false);
    expect(fireball!.damageRoll).toBe("8d6");
    expect(fireball!.damageType).toBe("fire");
    expect(fireball!.saveAbility).toBe("dexterity");
    expect(fireball!.attackType).toBe("save");
  });

  it("non-AOE spell from SRD: ability has no aoe field", async () => {
    await hydrateState({
      level: 4,
      characterClass: "wizard",
      spellcastingAbility: "intelligence",
      abilities: [],
      knownSpells: [],
      pendingLevelUp: makePendingLevelUp(),
    });

    // Mock querySRD to return a single-target spell (no aoe field)
    mockQuerySRD.mockResolvedValue({
      name: "Magic Missile",
      level: 1,
      range: "120 feet",
      damageRoll: "1d4+1",
      damageTypes: ["force"],
    });

    await applyLevelUp("char-1", [{
      level: 5,
      newSpells: ["magic-missile"],
    }]);

    const player = getGameState().player;
    const mm = player.abilities?.find(a => a.id === "spell:magic-missile");
    expect(mm).toBeDefined();
    expect(mm!.aoe).toBeUndefined();
    expect(mm!.attackType).toBe("auto");
  });

  it("self-origin cone spell sets aoe and requiresTarget false", async () => {
    await hydrateState({
      level: 4,
      characterClass: "wizard",
      spellcastingAbility: "intelligence",
      abilities: [],
      knownSpells: [],
      pendingLevelUp: makePendingLevelUp(),
    });

    mockQuerySRD.mockResolvedValue({
      name: "Burning Hands",
      level: 1,
      range: "Self (15-foot cone)",
      savingThrowAbility: "dexterity",
      damageRoll: "3d6",
      damageTypes: ["fire"],
      aoe: { shape: "cone", size: 15, origin: "self" },
    });

    await applyLevelUp("char-1", [{
      level: 5,
      newSpells: ["burning-hands"],
    }]);

    const player = getGameState().player;
    const bh = player.abilities?.find(a => a.id === "spell:burning-hands");
    expect(bh).toBeDefined();
    expect(bh!.aoe).toEqual({ shape: "cone", size: 15, origin: "self" });
    expect(bh!.requiresTarget).toBe(false);
  });
});
