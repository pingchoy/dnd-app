import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatModifier,
  getModifier,
  getProficiencyBonus,
  rollDice,
  doubleDice,
  crToXP,
  xpForLevel,
  toDisplayCase,
  formatAbilityDamage,
  getWeaponAbilityMod,
  applyEffects,
  rollD20,
  XP_THRESHOLDS,
} from "./gameTypes";
import type { Ability, CharacterStats, PlayerState } from "./gameTypes";

// ─── getModifier ────────────────────────────────────────────────────────────

describe("getModifier", () => {
  it("returns 0 for stat 10", () => {
    expect(getModifier(10)).toBe(0);
  });

  it("returns 0 for stat 11", () => {
    expect(getModifier(11)).toBe(0);
  });

  it("returns -1 for stat 8", () => {
    expect(getModifier(8)).toBe(-1);
  });

  it("returns -1 for stat 9", () => {
    expect(getModifier(9)).toBe(-1);
  });

  it("returns +5 for stat 20", () => {
    expect(getModifier(20)).toBe(5);
  });

  it("returns +1 for stat 12", () => {
    expect(getModifier(12)).toBe(1);
  });

  it("returns -5 for stat 1", () => {
    expect(getModifier(1)).toBe(-5);
  });

  it("returns +4 for stat 18", () => {
    expect(getModifier(18)).toBe(4);
  });
});

// ─── getProficiencyBonus ────────────────────────────────────────────────────

describe("getProficiencyBonus", () => {
  it("returns +2 for levels 1-4", () => {
    expect(getProficiencyBonus(1)).toBe(2);
    expect(getProficiencyBonus(4)).toBe(2);
  });

  it("returns +3 for levels 5-8", () => {
    expect(getProficiencyBonus(5)).toBe(3);
    expect(getProficiencyBonus(8)).toBe(3);
  });

  it("returns +4 for levels 9-12", () => {
    expect(getProficiencyBonus(9)).toBe(4);
    expect(getProficiencyBonus(12)).toBe(4);
  });

  it("returns +5 for levels 13-16", () => {
    expect(getProficiencyBonus(13)).toBe(5);
    expect(getProficiencyBonus(16)).toBe(5);
  });

  it("returns +6 for levels 17-20", () => {
    expect(getProficiencyBonus(17)).toBe(6);
    expect(getProficiencyBonus(20)).toBe(6);
  });
});

// ─── formatModifier ─────────────────────────────────────────────────────────

describe("formatModifier", () => {
  it("formats positive numbers with +", () => {
    expect(formatModifier(3)).toBe("+3");
  });

  it("formats negative numbers with -", () => {
    expect(formatModifier(-1)).toBe("-1");
  });

  it("formats zero as +0", () => {
    expect(formatModifier(0)).toBe("+0");
  });
});

// ─── rollDice ───────────────────────────────────────────────────────────────

describe("rollDice", () => {
  beforeEach(() => {
    // Seed Math.random to always return 0.5 → die result = floor(0.5 * sides) + 1
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rolls 2d6 with deterministic results", () => {
    const result = rollDice("2d6");
    expect(result.expression).toBe("2d6");
    expect(result.rolls).toHaveLength(2);
    // floor(0.5 * 6) + 1 = 4
    expect(result.rolls).toEqual([4, 4]);
    expect(result.total).toBe(8);
  });

  it("rolls 1d8", () => {
    const result = rollDice("1d8");
    expect(result.rolls).toHaveLength(1);
    // floor(0.5 * 8) + 1 = 5
    expect(result.rolls[0]).toBe(5);
    expect(result.total).toBe(5);
  });

  it("returns empty for invalid expression", () => {
    const result = rollDice("abc");
    expect(result.rolls).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("returns empty for partial expression", () => {
    const result = rollDice("d6");
    expect(result.rolls).toEqual([]);
    expect(result.total).toBe(0);
  });
});

// ─── rollD20 ────────────────────────────────────────────────────────────────

describe("rollD20", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 1 when Math.random returns 0", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(rollD20()).toBe(1);
  });

  it("returns 20 when Math.random returns 0.999", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    expect(rollD20()).toBe(20);
  });

  it("returns 11 when Math.random returns 0.5", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(rollD20()).toBe(11);
  });
});

// ─── doubleDice ─────────────────────────────────────────────────────────────

describe("doubleDice", () => {
  it("doubles 2d6 to 4d6", () => {
    expect(doubleDice("2d6")).toBe("4d6");
  });

  it("doubles 1d8 to 2d8", () => {
    expect(doubleDice("1d8")).toBe("2d8");
  });

  it("doubles 3d10 to 6d10", () => {
    expect(doubleDice("3d10")).toBe("6d10");
  });

  it("passes through non-standard input", () => {
    expect(doubleDice("abc")).toBe("abc");
  });

  it("passes through complex expressions", () => {
    expect(doubleDice("2d6+3")).toBe("2d6+3");
  });
});

// ─── crToXP ─────────────────────────────────────────────────────────────────

describe("crToXP", () => {
  it("converts numeric CR", () => {
    expect(crToXP(1)).toBe(200);
    expect(crToXP(5)).toBe(1800);
    expect(crToXP(20)).toBe(25000);
  });

  it("converts string CR", () => {
    expect(crToXP("1")).toBe(200);
    expect(crToXP("10")).toBe(5900);
  });

  it("converts fraction CR 1/4", () => {
    expect(crToXP("1/4")).toBe(50);
  });

  it("converts fraction CR 1/8", () => {
    expect(crToXP("1/8")).toBe(25);
  });

  it("converts fraction CR 1/2", () => {
    expect(crToXP("1/2")).toBe(100);
  });

  it("converts CR 0", () => {
    expect(crToXP(0)).toBe(10);
  });

  it("returns 0 for unknown CR", () => {
    expect(crToXP(999)).toBe(0);
    expect(crToXP("unknown")).toBe(0);
  });
});

// ─── xpForLevel ─────────────────────────────────────────────────────────────

describe("xpForLevel", () => {
  it("returns 0 for level 1", () => {
    expect(xpForLevel(1)).toBe(0);
  });

  it("returns 300 for level 2", () => {
    expect(xpForLevel(2)).toBe(300);
  });

  it("returns 355000 for level 20", () => {
    expect(xpForLevel(20)).toBe(355000);
  });

  it("matches D&D 5e XP thresholds array length", () => {
    expect(XP_THRESHOLDS).toHaveLength(20);
  });

  it("returns 0 for level 0 or below", () => {
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(-1)).toBe(0);
  });

  it("returns 0 for levels above 20", () => {
    expect(xpForLevel(21)).toBe(0);
  });
});

// ─── toDisplayCase ──────────────────────────────────────────────────────────

describe("toDisplayCase", () => {
  it("capitalizes a simple word", () => {
    expect(toDisplayCase("fighter")).toBe("Fighter");
  });

  it("handles minor words in the middle", () => {
    expect(toDisplayCase("lord of the rings")).toBe("Lord of the Rings");
  });

  it("capitalizes the first word even if minor", () => {
    expect(toDisplayCase("the fellowship")).toBe("The Fellowship");
  });

  it("capitalizes the last word even if minor", () => {
    expect(toDisplayCase("back and to")).toBe("Back and To");
  });

  it("handles hyphenated terms", () => {
    expect(toDisplayCase("half-elf")).toBe("Half-Elf");
  });

  it("returns empty string for empty input", () => {
    expect(toDisplayCase("")).toBe("");
  });

  it("handles single character", () => {
    expect(toDisplayCase("a")).toBe("A");
  });
});

// ─── formatAbilityDamage ────────────────────────────────────────────────────

describe("formatAbilityDamage", () => {
  const stats: CharacterStats = {
    strength: 16,    // +3
    dexterity: 14,   // +2
    constitution: 12,
    intelligence: 10,
    wisdom: 10,
    charisma: 8,
  };

  it("formats STR weapon damage", () => {
    const ability: Ability = {
      id: "weapon:longsword",
      name: "Longsword",
      type: "weapon",
      requiresTarget: true,
      damageRoll: "1d8",
      weaponStat: "str",
    };
    expect(formatAbilityDamage(ability, stats)).toBe("1d8+3");
  });

  it("formats DEX weapon damage", () => {
    const ability: Ability = {
      id: "weapon:shortbow",
      name: "Shortbow",
      type: "weapon",
      requiresTarget: true,
      damageRoll: "1d6",
      weaponStat: "dex",
    };
    expect(formatAbilityDamage(ability, stats)).toBe("1d6+2");
  });

  it("formats finesse weapon with higher STR", () => {
    const ability: Ability = {
      id: "weapon:rapier",
      name: "Rapier",
      type: "weapon",
      requiresTarget: true,
      damageRoll: "1d8",
      weaponStat: "finesse",
    };
    // STR (+3) > DEX (+2), picks STR
    expect(formatAbilityDamage(ability, stats)).toBe("1d8+3");
  });

  it("formats weapon with weapon bonus", () => {
    const ability: Ability = {
      id: "weapon:sword+1",
      name: "+1 Longsword",
      type: "weapon",
      requiresTarget: true,
      damageRoll: "1d8",
      weaponStat: "str",
      weaponBonus: 1,
    };
    // 3 (STR) + 1 (bonus) = 4
    expect(formatAbilityDamage(ability, stats)).toBe("1d8+4");
  });

  it("returns just dice for zero modifier", () => {
    const ability: Ability = {
      id: "weapon:club",
      name: "Club",
      type: "weapon",
      requiresTarget: true,
      damageRoll: "1d4",
      weaponStat: "none",
    };
    expect(formatAbilityDamage(ability, stats)).toBe("1d4");
  });

  it("returns empty for no damageRoll", () => {
    const ability: Ability = {
      id: "action:dodge",
      name: "Dodge",
      type: "action",
      requiresTarget: false,
    };
    expect(formatAbilityDamage(ability, stats)).toBe("");
  });
});

// ─── getWeaponAbilityMod ────────────────────────────────────────────────────

describe("getWeaponAbilityMod", () => {
  const stats: CharacterStats = {
    strength: 16,    // +3
    dexterity: 14,   // +2
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  };

  it("returns STR mod and label for str", () => {
    const result = getWeaponAbilityMod("str", stats);
    expect(result.mod).toBe(3);
    expect(result.label).toBe("STR");
  });

  it("returns DEX mod and label for dex", () => {
    const result = getWeaponAbilityMod("dex", stats);
    expect(result.mod).toBe(2);
    expect(result.label).toBe("DEX");
  });

  it("returns higher of STR/DEX for finesse", () => {
    const result = getWeaponAbilityMod("finesse", stats);
    expect(result.mod).toBe(3); // STR > DEX
    expect(result.label).toBe("STR");
  });

  it("prefers DEX when higher for finesse", () => {
    const dexStats = { ...stats, dexterity: 18 }; // DEX +4 > STR +3
    const result = getWeaponAbilityMod("finesse", dexStats);
    expect(result.mod).toBe(4);
    expect(result.label).toBe("DEX");
  });

  it("returns 0 mod for none", () => {
    const result = getWeaponAbilityMod("none", stats);
    expect(result.mod).toBe(0);
    expect(result.label).toBe("NONE");
  });
});

// ─── applyEffects ───────────────────────────────────────────────────────────

describe("applyEffects", () => {
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
      baseArmorClass: 16,
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
      ...overrides,
    };
  }

  it("resets derived fields to defaults with no features", () => {
    const player = makePlayer();
    applyEffects(player);
    expect(player.numAttacks).toBe(1);
    expect(player.meleeAttackBonus).toBe(0);
    expect(player.meleeDamageBonus).toBe(0);
    expect(player.resistances).toEqual([]);
    expect(player.evasion).toBe(false);
  });

  it("aggregates Extra Attack (numAttacks takes max)", () => {
    const player = makePlayer({
      features: [
        {
          name: "Extra Attack",
          level: 5,
          gameplayEffects: { numAttacks: 2 },
        },
      ],
    });
    applyEffects(player);
    expect(player.numAttacks).toBe(2);
  });

  it("stacks flat bonuses from multiple features", () => {
    const player = makePlayer({
      features: [
        {
          name: "Defense",
          level: 1,
          gameplayEffects: { acBonus: 1 },
        },
        {
          name: "Shield of Faith",
          level: 1,
          gameplayEffects: { acBonus: 2 },
        },
      ],
    });
    applyEffects(player);
    // Base 16 + 1 + 2 = 19
    expect(player.armorClass).toBe(19);
  });

  it("applies AC formula (unarmored defense)", () => {
    const player = makePlayer({
      baseArmorClass: 10,
      armorClass: 10,
      stats: {
        strength: 16,
        dexterity: 16, // +3
        constitution: 16, // +3
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      features: [
        {
          name: "Unarmored Defense",
          level: 1,
          gameplayEffects: { acFormula: "10 + dex + con" },
        },
      ],
    });
    applyEffects(player);
    // 10 + 3 (DEX) + 3 (CON) = 16
    expect(player.armorClass).toBe(16);
  });

  it("deduplicates resistances", () => {
    const player = makePlayer({
      features: [
        {
          name: "Rage",
          level: 1,
          gameplayEffects: { resistances: ["bludgeoning", "piercing", "slashing"] },
        },
        {
          name: "Stone Skin",
          level: 5,
          gameplayEffects: { resistances: ["bludgeoning"] },
        },
      ],
    });
    applyEffects(player);
    expect(player.resistances).toEqual(["bludgeoning", "piercing", "slashing"]);
  });

  it("respects conditions — only applies active conditional effects", () => {
    const player = makePlayer({
      activeConditions: ["raging"],
      features: [
        {
          name: "Rage",
          level: 1,
          gameplayEffects: {
            condition: "raging",
            meleeDamageBonus: 2,
            resistances: ["bludgeoning", "piercing", "slashing"],
          },
        },
      ],
    });
    applyEffects(player);
    expect(player.meleeDamageBonus).toBe(2);
    expect(player.resistances).toEqual(["bludgeoning", "piercing", "slashing"]);
  });

  it("skips conditional effects when condition is not active", () => {
    const player = makePlayer({
      activeConditions: [],
      features: [
        {
          name: "Rage",
          level: 1,
          gameplayEffects: {
            condition: "raging",
            meleeDamageBonus: 2,
          },
        },
      ],
    });
    applyEffects(player);
    expect(player.meleeDamageBonus).toBe(0);
  });

  it("aggregates speed bonus", () => {
    const player = makePlayer({
      baseSpeed: 30,
      features: [
        {
          name: "Fast Movement",
          level: 5,
          gameplayEffects: { speedBonus: 10 },
        },
      ],
    });
    applyEffects(player);
    expect(player.speed).toBe(40);
  });

  it("sets boolean flags via OR (evasion)", () => {
    const player = makePlayer({
      features: [
        {
          name: "Evasion",
          level: 7,
          gameplayEffects: { evasion: true },
        },
      ],
    });
    applyEffects(player);
    expect(player.evasion).toBe(true);
  });

  it("takes max of minCheckRoll", () => {
    const player = makePlayer({
      features: [
        {
          name: "Reliable Talent",
          level: 11,
          gameplayEffects: { minCheckRoll: 10 },
        },
      ],
    });
    applyEffects(player);
    expect(player.minCheckRoll).toBe(10);
  });

  it("aggregates bonusDamage strings", () => {
    const player = makePlayer({
      features: [
        {
          name: "Improved Divine Smite",
          level: 11,
          gameplayEffects: { bonusDamage: "1d8 radiant" },
        },
      ],
    });
    applyEffects(player);
    expect(player.bonusDamage).toEqual(["1d8 radiant"]);
  });
});
