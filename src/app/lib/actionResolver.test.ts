import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Firebase Admin to prevent module-level initialization
vi.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: vi.fn(),
  credential: { cert: vi.fn() },
  firestore: vi.fn(() => ({})),
}));

vi.mock("./firebaseAdmin", () => ({
  adminDb: {},
}));

import {
  resolveAttack,
  resolveSkillCheck,
  resolveSavingThrow,
  markImpossible,
  markNoCheck,
  buildRawSummary,
} from "./actionResolver";
import type { PlayerState, NPC } from "./gameTypes";

// ─── Test fixtures ──────────────────────────────────────────────────────────

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
      strength: 16,    // +3
      dexterity: 14,   // +2
      constitution: 14, // +2
      intelligence: 10, // +0
      wisdom: 12,      // +1
      charisma: 8,     // -1
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

// ─── resolveAttack ──────────────────────────────────────────────────────────

describe("resolveAttack", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns impossible when weapon not found", () => {
    const player = makePlayer();
    const result = resolveAttack(
      { weapon: "Greatsword", target: "Goblin" },
      player,
      [makeNPC()],
    );
    expect(result.impossible).toBe(true);
    expect(result.notes).toContain("not found");
  });

  it("returns impossible when target not found", () => {
    const player = makePlayer();
    const result = resolveAttack(
      { weapon: "Longsword", target: "Dragon" },
      player,
      [makeNPC()],
    );
    expect(result.impossible).toBe(true);
    expect(result.notes).toContain("not found");
  });

  it("hits when roll + modifier >= AC", () => {
    // Roll 15 on d20: floor(0.7 * 20) + 1 = 15
    vi.spyOn(Math, "random").mockReturnValue(0.7);
    const player = makePlayer();
    const npc = makeNPC({ ac: 15 });

    const result = resolveAttack(
      { weapon: "Longsword", target: "Goblin" },
      player,
      [npc],
    );

    // d20=15, STR+3, Prof+3 = 21 vs AC 15 → hit
    expect(result.dieResult).toBe(15);
    expect(result.success).toBe(true);
    expect(result.damage).toBeDefined();
    expect(result.damage!.totalDamage).toBeGreaterThan(0);
  });

  it("misses when roll + modifier < AC", () => {
    // Roll 1 on d20: floor(0.0 * 20) + 1 = 1
    vi.spyOn(Math, "random").mockReturnValue(0.0);
    const player = makePlayer();
    const npc = makeNPC({ ac: 15 });

    const result = resolveAttack(
      { weapon: "Longsword", target: "Goblin" },
      player,
      [npc],
    );

    expect(result.dieResult).toBe(1);
    expect(result.success).toBe(false);
    expect(result.notes).toContain("Natural 1");
    expect(result.damage).toBeUndefined();
  });

  it("natural 20 is always a critical hit", () => {
    // Roll 20: floor(0.95 * 20) + 1 = 20
    vi.spyOn(Math, "random").mockReturnValue(0.95);
    const player = makePlayer();
    const npc = makeNPC({ ac: 30 }); // Even very high AC

    const result = resolveAttack(
      { weapon: "Longsword", target: "Goblin" },
      player,
      [npc],
    );

    expect(result.dieResult).toBe(20);
    expect(result.success).toBe(true);
    expect(result.notes).toContain("critical hit");
    expect(result.damage!.isCrit).toBe(true);
    // Crit doubles dice: 1d8 → 2d8
    expect(result.damage!.breakdown[0].dice).toBe("2d8");
  });

  it("natural 1 is always a miss", () => {
    // Roll 1: floor(0.0 * 20) + 1 = 1
    vi.spyOn(Math, "random").mockReturnValue(0.0);
    const player = makePlayer();
    const npc = makeNPC({ ac: 1 }); // Even very low AC

    const result = resolveAttack(
      { weapon: "Longsword", target: "Goblin" },
      player,
      [npc],
    );

    expect(result.dieResult).toBe(1);
    expect(result.success).toBe(false);
    expect(result.notes).toContain("Natural 1");
  });

  it("includes weapon bonus in attack roll", () => {
    // Roll 10: floor(0.45 * 20) + 1 = 10
    vi.spyOn(Math, "random").mockReturnValue(0.45);
    const player = makePlayer({
      abilities: [
        {
          id: "weapon:longsword",
          name: "Longsword",
          type: "weapon",
          requiresTarget: true,
          damageRoll: "1d8",
          damageType: "slashing",
          weaponStat: "str",
          weaponBonus: 1,
        },
      ],
    });
    const npc = makeNPC({ ac: 17 });

    const result = resolveAttack(
      { weapon: "Longsword", target: "Goblin" },
      player,
      [npc],
    );

    // d20=10, STR+3, Prof+3, Bonus+1 = 17 vs AC 17 → hit
    expect(result.total).toBe(17);
    expect(result.success).toBe(true);
    expect(result.components).toContain("Bonus +1");
  });

  it("includes effect attack bonus", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.45); // d20 = 10
    const player = makePlayer({ meleeAttackBonus: 2 });
    const npc = makeNPC({ ac: 19 });

    const result = resolveAttack(
      { weapon: "Longsword", target: "Goblin" },
      player,
      [npc],
    );

    // d20=10, STR+3, Prof+3, Effects+2 = 18 vs AC 19 → miss
    expect(result.total).toBe(18);
    expect(result.components).toContain("Effects +2");
  });
});

// ─── resolveSkillCheck ──────────────────────────────────────────────────────

describe("resolveSkillCheck", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes with proficiency when roll + mod >= DC", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // d20 = 11
    const player = makePlayer();

    const result = resolveSkillCheck(
      { skill: "athletics", dc: 15 },
      player,
    );

    // d20=11, STR+3 (athletics uses str), Prof+3 = 17 vs DC 15 → pass
    expect(result.success).toBe(true);
    expect(result.checkType).toBe("Athletics Check");
    expect(result.components).toContain("Prof");
  });

  it("fails when roll + mod < DC", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.0); // d20 = 1
    const player = makePlayer();

    const result = resolveSkillCheck(
      { skill: "athletics", dc: 15 },
      player,
    );

    // d20=1, STR+3, Prof+3 = 7 vs DC 15 → fail
    expect(result.success).toBe(false);
    expect(result.notes).toContain("fails");
  });

  it("non-proficient skill uses ability mod only", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // d20 = 11
    const player = makePlayer(); // Not proficient in "arcana"

    const result = resolveSkillCheck(
      { skill: "arcana", dc: 10 },
      player,
    );

    // d20=11, INT+0, no prof = 11 vs DC 10 → pass
    expect(result.success).toBe(true);
    expect(result.components).not.toContain("Prof");
  });

  it("returns impossible for unknown skill", () => {
    const player = makePlayer();
    const result = resolveSkillCheck(
      { skill: "nonexistent", dc: 10 },
      player,
    );
    expect(result.impossible).toBe(true);
  });

  it("expertise doubles proficiency bonus", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // d20 = 11
    const player = makePlayer({
      skillProficiencies: ["stealth"],
      features: [
        {
          name: "Expertise",
          level: 1,
          chosenOption: "stealth, thieves' tools",
        },
      ],
    });

    const result = resolveSkillCheck(
      { skill: "stealth", dc: 10 },
      player,
    );

    // d20=11, DEX+2, Expertise+6 (prof 3 * 2) = 19
    expect(result.success).toBe(true);
    expect(result.components).toContain("Expertise");
  });

  it("reliable talent sets minimum d20 roll", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.0); // d20 = 1
    const player = makePlayer({
      minCheckRoll: 10,
    });

    const result = resolveSkillCheck(
      { skill: "athletics", dc: 15 },
      player,
    );

    // d20=1 → effective 10 (Reliable Talent), STR+3, Prof+3 = 16 vs DC 15 → pass
    expect(result.success).toBe(true);
    expect(result.dieResult).toBe(10); // effective die result
    expect(result.notes).toContain("Reliable Talent");
  });

  it("half proficiency applies to non-proficient checks", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // d20 = 11
    const player = makePlayer({
      halfProficiency: true,
    });

    const result = resolveSkillCheck(
      { skill: "arcana", dc: 10 }, // not proficient
      player,
    );

    // d20=11, INT+0, Half Prof+1 (floor(3/2)) = 12 vs DC 10 → pass
    expect(result.success).toBe(true);
    expect(result.components).toContain("Half Prof");
  });
});

// ─── resolveSavingThrow ─────────────────────────────────────────────────────

describe("resolveSavingThrow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("proficient save includes proficiency bonus", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // d20 = 11
    const player = makePlayer(); // proficient in STR, CON

    const result = resolveSavingThrow(
      { ability: "strength", dc: 15 },
      player,
    );

    // d20=11, STR+3, Prof+3 = 17 vs DC 15 → pass
    expect(result.success).toBe(true);
    expect(result.checkType).toBe("Strength Saving Throw");
    expect(result.components).toContain("Prof");
  });

  it("non-proficient save uses only ability modifier", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // d20 = 11
    const player = makePlayer();

    const result = resolveSavingThrow(
      { ability: "wisdom", dc: 15 },
      player,
    );

    // d20=11, WIS+1, no prof = 12 vs DC 15 → fail
    expect(result.success).toBe(false);
    expect(result.components).not.toContain("Prof");
  });

  it("includes source in notes", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const player = makePlayer();

    const result = resolveSavingThrow(
      { ability: "constitution", dc: 10, source: "Poison" },
      player,
    );

    expect(result.notes).toContain("(Poison)");
  });

  it("respects bonus save proficiencies", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // d20 = 11
    const player = makePlayer({
      bonusSaveProficiencies: ["all"],
    });

    const result = resolveSavingThrow(
      { ability: "charisma", dc: 15 },
      player,
    );

    // d20=11, CHA-1, Prof+3 = 13 vs DC 15 → fail
    // But includes proficiency
    expect(result.components).toContain("Prof");
  });
});

// ─── markImpossible & markNoCheck ───────────────────────────────────────────

describe("markImpossible", () => {
  it("returns correct shape", () => {
    const result = markImpossible("Cannot cast 9th level spells");
    expect(result.checkType).toBe("IMPOSSIBLE");
    expect(result.impossible).toBe(true);
    expect(result.success).toBe(false);
    expect(result.dieResult).toBe(0);
    expect(result.notes).toBe("Cannot cast 9th level spells");
  });
});

describe("markNoCheck", () => {
  it("returns correct shape", () => {
    const result = markNoCheck("Walking across the room requires no check");
    expect(result.checkType).toBe("NONE");
    expect(result.noCheck).toBe(true);
    expect(result.success).toBe(false);
    expect(result.dieResult).toBe(0);
    expect(result.notes).toBe("Walking across the room requires no check");
  });
});

// ─── buildRawSummary ────────────────────────────────────────────────────────

describe("buildRawSummary", () => {
  it("formats impossible result", () => {
    const result = markImpossible("No target");
    const summary = buildRawSummary(result);
    expect(summary).toContain("CHECK: IMPOSSIBLE");
    expect(summary).toContain("NOTES: No target");
  });

  it("formats noCheck result", () => {
    const result = markNoCheck("Narrative action");
    const summary = buildRawSummary(result);
    expect(summary).toContain("CHECK: NONE");
    expect(summary).toContain("NOTES: Narrative action");
  });

  it("formats a normal check result", () => {
    const result = {
      checkType: "Longsword Attack",
      components: "STR +3, Prof +3 = +6",
      dieResult: 15,
      totalModifier: "+6",
      total: 21,
      dcOrAc: "15",
      success: true,
      notes: "Attack hits",
    };
    const summary = buildRawSummary(result);
    expect(summary).toContain("CHECK: Longsword Attack");
    expect(summary).toContain("COMPONENTS: STR +3, Prof +3 = +6");
    expect(summary).toContain("ROLL: 15 + +6 = 21");
    expect(summary).toContain("DC/AC: 15");
    expect(summary).toContain("RESULT: SUCCESS");
    expect(summary).toContain("DAMAGE: N/A");
  });
});
