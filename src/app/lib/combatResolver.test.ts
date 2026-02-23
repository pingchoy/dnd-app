import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

vi.mock("./characterStore", () => ({
  loadCharacter: vi.fn(),
  saveCharacterState: vi.fn(),
  getSRDClass: vi.fn(),
  getSRDClassLevel: vi.fn(),
  getSRDSubclassLevel: vi.fn(),
  querySRD: vi.fn(),
}));

vi.mock("./encounterStore", () => ({
  loadEncounter: vi.fn(),
  saveEncounterState: vi.fn(),
  completeEncounter: vi.fn(),
}));

import { buildAOEShape, resolveAOEAction } from "./combatResolver";
import type { AOEResult } from "./combatResolver";
import type { PlayerState, NPC, Ability, AOEData, GridPosition, CharacterStats } from "./gameTypes";

// ─── Test fixtures ──────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    name: "Test Wizard",
    gender: "female",
    characterClass: "wizard",
    race: "human",
    level: 5,
    hitDie: 6,
    xp: 6500,
    xpToNextLevel: 14000,
    currentHP: 30,
    maxHP: 30,
    armorClass: 12,
    baseArmorClass: 12,
    baseSpeed: 30,
    stats: {
      strength: 8,
      dexterity: 14,
      constitution: 12,
      intelligence: 18,   // +4 mod
      wisdom: 10,
      charisma: 10,
    },
    spellcastingAbility: "intelligence",
    savingThrowProficiencies: ["intelligence", "wisdom"],
    skillProficiencies: ["arcana", "investigation"],
    weaponProficiencies: [],
    armorProficiencies: [],
    features: [],
    inventory: ["spellbook", "component pouch"],
    conditions: [],
    gold: 50,
    ...overrides,
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

function makeFireballAbility(overrides: Partial<Ability> = {}): Ability {
  return {
    id: "spell:fireball",
    name: "Fireball",
    type: "spell",
    spellLevel: 3,
    attackType: "save",
    saveAbility: "dexterity",
    requiresTarget: false,
    damageRoll: "8d6",
    damageType: "fire",
    aoe: { shape: "sphere", size: 20, origin: "target" },
    ...overrides,
  };
}

// ─── Setup / teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── buildAOEShape ──────────────────────────────────────────────────────────

describe("buildAOEShape", () => {
  const casterPos: GridPosition = { row: 5, col: 5 };
  const targetOrigin: GridPosition = { row: 10, col: 10 };
  const direction: GridPosition = { row: 5, col: 8 }; // east

  it("sphere AOE uses aoeOrigin as origin (targeted placement)", () => {
    const aoe: AOEData = { shape: "sphere", size: 20, origin: "target" };
    const shape = buildAOEShape(aoe, casterPos, targetOrigin);
    expect(shape.type).toBe("sphere");
    expect(shape.origin).toEqual(targetOrigin);
    if (shape.type === "sphere") {
      expect(shape.radiusFeet).toBe(20);
    }
  });

  it("sphere AOE without aoeOrigin falls back to casterPos", () => {
    const aoe: AOEData = { shape: "sphere", size: 20, origin: "target" };
    const shape = buildAOEShape(aoe, casterPos);
    expect(shape.origin).toEqual(casterPos);
  });

  it("cone AOE always uses casterPos as origin (self-origin)", () => {
    const aoe: AOEData = { shape: "cone", size: 15, origin: "self" };
    const shape = buildAOEShape(aoe, casterPos, targetOrigin, direction);
    expect(shape.type).toBe("cone");
    expect(shape.origin).toEqual(casterPos);
    if (shape.type === "cone") {
      expect(shape.lengthFeet).toBe(15);
      expect(shape.direction).toEqual(direction);
    }
  });

  it("cone without direction defaults to north", () => {
    const aoe: AOEData = { shape: "cone", size: 15, origin: "self" };
    const shape = buildAOEShape(aoe, casterPos);
    if (shape.type === "cone") {
      // Default direction: { row: origin.row - 1, col: origin.col }
      expect(shape.direction).toEqual({ row: 4, col: 5 });
    }
  });

  it("line AOE uses casterPos, default width 5 when aoe.width undefined", () => {
    const aoe: AOEData = { shape: "line", size: 30, origin: "self" };
    const shape = buildAOEShape(aoe, casterPos, undefined, direction);
    expect(shape.type).toBe("line");
    expect(shape.origin).toEqual(casterPos);
    if (shape.type === "line") {
      expect(shape.lengthFeet).toBe(30);
      expect(shape.widthFeet).toBe(5);
      expect(shape.direction).toEqual(direction);
    }
  });

  it("line AOE uses explicit width from aoe.width", () => {
    const aoe: AOEData = { shape: "line", size: 30, origin: "self", width: 10 };
    const shape = buildAOEShape(aoe, casterPos, undefined, direction);
    if (shape.type === "line") {
      expect(shape.widthFeet).toBe(10);
    }
  });

  it("cube AOE uses aoeOrigin", () => {
    const aoe: AOEData = { shape: "cube", size: 10, origin: "target" };
    const shape = buildAOEShape(aoe, casterPos, targetOrigin);
    expect(shape.type).toBe("cube");
    expect(shape.origin).toEqual(targetOrigin);
    if (shape.type === "cube") {
      expect(shape.radiusFeet).toBe(10);
    }
  });

  it("cylinder AOE uses aoeOrigin", () => {
    const aoe: AOEData = { shape: "cylinder", size: 15, origin: "target" };
    const shape = buildAOEShape(aoe, casterPos, targetOrigin);
    expect(shape.type).toBe("cylinder");
    expect(shape.origin).toEqual(targetOrigin);
    if (shape.type === "cylinder") {
      expect(shape.radiusFeet).toBe(15);
    }
  });
});

// ─── resolveAOEAction ───────────────────────────────────────────────────────

describe("resolveAOEAction", () => {
  it("computes DC as 8 + abilityMod + profBonus", () => {
    // INT 18 = +4 mod, level 5 = +3 proficiency → DC = 8 + 4 + 3 = 15
    const player = makePlayer();
    const ability = makeFireballAbility();
    const result = resolveAOEAction(player, ability, [], []);
    expect(result.spellDC).toBe(15);
  });

  it("rolls damage once, shared across all targets", () => {
    // Seed Math.random to return 0.5 consistently → each d6 = 4
    // 8d6 with all 4s = 32
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const player = makePlayer();
    const ability = makeFireballAbility();
    const npcs = [
      makeNPC({ id: "g1", name: "Goblin A" }),
      makeNPC({ id: "g2", name: "Goblin B" }),
    ];
    const result = resolveAOEAction(player, ability, npcs, []);

    expect(result.damageRoll).toBe("8d6");
    expect(result.totalRolled).toBe(32); // 8 * 4
    // Both targets reference the same total
    for (const t of result.targets) {
      expect(t.damageTaken === 32 || t.damageTaken === 16).toBe(true);
    }
  });

  it("NPC that fails save takes full damage", () => {
    // random sequence: first 8 calls for 8d6 damage, then NPC save roll
    const randomValues = [
      // 8d6 damage: each d6 with random 0.5 → 4 each → total 32
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
      // NPC save roll: 0.0 → d20 = 1. With +0 bonus = 1 vs DC 15 → fails
      0.0,
    ];
    let callIdx = 0;
    vi.spyOn(Math, "random").mockImplementation(() => randomValues[callIdx++]);

    const player = makePlayer();
    const ability = makeFireballAbility();
    const npc = makeNPC({ id: "g1", name: "Goblin", savingThrowBonus: 0 });
    const result = resolveAOEAction(player, ability, [npc], []);

    expect(result.targets).toHaveLength(1);
    expect(result.targets[0].saved).toBe(false);
    expect(result.targets[0].damageTaken).toBe(32); // full damage
  });

  it("NPC that passes save takes half damage (floored)", () => {
    const randomValues = [
      // 8d6 damage: 0.5 each → 4 each → total 32
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
      // NPC save roll: 0.99 → d20 = 20. With +0 bonus = 20 vs DC 15 → saves
      0.99,
    ];
    let callIdx = 0;
    vi.spyOn(Math, "random").mockImplementation(() => randomValues[callIdx++]);

    const player = makePlayer();
    const ability = makeFireballAbility();
    const npc = makeNPC({ id: "g1", name: "Goblin", savingThrowBonus: 0 });
    const result = resolveAOEAction(player, ability, [npc], []);

    expect(result.targets[0].saved).toBe(true);
    expect(result.targets[0].damageTaken).toBe(16); // floor(32 / 2) = 16
  });

  it("half damage is floored for odd totals", () => {
    // Force damage total to be 33 (odd) using mix of rolls
    // d6 rolls: 0.0→1, 0.0→1, 0.0→1, 0.0→1, 0.0→1, 0.0→1, 0.0→1, 0.5→4
    // total = 7*1 + 4 = 11  (let me recalculate)
    // Actually, each d6: Math.floor(random * 6) + 1
    // random=0.0 → floor(0)+1 = 1
    // random=0.5 → floor(3)+1 = 4
    // random=0.833→ floor(5)+1 = 6
    // For total=33: 7*1+26 nah, let's just use simple approach
    // 8d6: we need total=33. Use 7 dice at 4 (0.5) and 1 die at 5 (0.666)
    // random=0.7 → floor(0.7*6)+1 = floor(4.2)+1 = 5. So 7*4 + 5 = 33
    const randomValues = [
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.7,  // 8d6: 7*4 + 5 = 33
      0.99, // NPC save: d20=20, saves
    ];
    let callIdx = 0;
    vi.spyOn(Math, "random").mockImplementation(() => randomValues[callIdx++]);

    const player = makePlayer();
    const ability = makeFireballAbility();
    const npc = makeNPC({ id: "g1", name: "Goblin", savingThrowBonus: 0 });
    const result = resolveAOEAction(player, ability, [npc], []);

    expect(result.totalRolled).toBe(33);
    expect(result.targets[0].saved).toBe(true);
    expect(result.targets[0].damageTaken).toBe(16); // floor(33/2) = 16
  });

  it("multiple NPCs get independent save rolls", () => {
    const randomValues = [
      // 8d6 damage: all 0.5 → total 32
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
      // NPC 1 save: 0.0 → d20=1, fails (1+0=1 < 15)
      0.0,
      // NPC 2 save: 0.99 → d20=20, saves (20+0=20 >= 15)
      0.99,
    ];
    let callIdx = 0;
    vi.spyOn(Math, "random").mockImplementation(() => randomValues[callIdx++]);

    const player = makePlayer();
    const ability = makeFireballAbility();
    const npcs = [
      makeNPC({ id: "g1", name: "Goblin A", savingThrowBonus: 0 }),
      makeNPC({ id: "g2", name: "Goblin B", savingThrowBonus: 0 }),
    ];
    const result = resolveAOEAction(player, ability, npcs, []);

    expect(result.targets).toHaveLength(2);
    expect(result.targets[0].saved).toBe(false);
    expect(result.targets[0].damageTaken).toBe(32);
    expect(result.targets[1].saved).toBe(true);
    expect(result.targets[1].damageTaken).toBe(16);
  });

  it("empty targetNPCs returns result with empty targets array", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const player = makePlayer();
    const ability = makeFireballAbility();
    const cells: GridPosition[] = [{ row: 3, col: 3 }];
    const result = resolveAOEAction(player, ability, [], cells);

    expect(result.targets).toHaveLength(0);
    expect(result.spellDC).toBe(15);
    expect(result.affectedCells).toEqual(cells);
  });

  it("defaults save ability to 'dexterity' when ability.saveAbility undefined", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const player = makePlayer();
    const ability = makeFireballAbility({ saveAbility: undefined });
    const result = resolveAOEAction(player, ability, [], []);

    expect(result.checkType).toBe("Fireball (dexterity save)");
  });

  it("uses specified save ability", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const player = makePlayer();
    const ability = makeFireballAbility({ saveAbility: "constitution" });
    const result = resolveAOEAction(player, ability, [], []);

    expect(result.checkType).toBe("Fireball (constitution save)");
  });

  it("defaults damage type to 'magical' when ability.damageType undefined", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const player = makePlayer();
    const ability = makeFireballAbility({ damageType: undefined });
    const result = resolveAOEAction(player, ability, [], []);

    expect(result.damageType).toBe("magical");
  });

  it("returns empty damageRoll when ability.damageRoll undefined", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const player = makePlayer();
    const ability = makeFireballAbility({ damageRoll: undefined });
    const result = resolveAOEAction(player, ability, [], []);

    expect(result.damageRoll).toBe("");
  });

  it("uses saveDCAbility over spellcastingAbility when set", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    // Player has INT 18 (+4) but saveDCAbility is "constitution" (CON 12 → +1)
    // DC = 8 + 1 + 3 = 12
    const player = makePlayer();
    const ability = makeFireballAbility({ saveDCAbility: "constitution" });
    const result = resolveAOEAction(player, ability, [], []);

    expect(result.spellDC).toBe(12);
  });

  it("passes affectedCells through to result", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const cells: GridPosition[] = [
      { row: 3, col: 3 },
      { row: 3, col: 4 },
      { row: 4, col: 3 },
    ];
    const player = makePlayer();
    const ability = makeFireballAbility();
    const result = resolveAOEAction(player, ability, [], cells);

    expect(result.affectedCells).toEqual(cells);
  });

  it("NPC saving throw includes their savingThrowBonus", () => {
    // DC = 15 (INT 18 + prof 3 + 8)
    // NPC save: d20 = 11 (random=0.5), bonus = +5 → total = 16 → saves
    const randomValues = [
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, // 8d6 damage
      0.5, // NPC save: d20 = 11
    ];
    let callIdx = 0;
    vi.spyOn(Math, "random").mockImplementation(() => randomValues[callIdx++]);

    const player = makePlayer();
    const ability = makeFireballAbility();
    const npc = makeNPC({ id: "g1", name: "Ogre", savingThrowBonus: 5 });
    const result = resolveAOEAction(player, ability, [npc], []);

    expect(result.targets[0].saveRoll).toBe(11);
    expect(result.targets[0].saveTotal).toBe(16); // 11 + 5
    expect(result.targets[0].saved).toBe(true);
  });
});
