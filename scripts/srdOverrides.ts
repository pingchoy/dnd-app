/**
 * srdOverrides.ts
 *
 * Hardcoded SRD mechanical data for all 9 races and 12 classes.
 * Replaces fragile regex parsing of Open5e trait description text.
 *
 * The seed script still fetches narrative text (trait descriptions, lore)
 * from the v2 API — this file provides only the structured mechanical values.
 */

import type { Ability, AOEData, GameplayEffects, SpellScalingEntry } from "../src/app/lib/gameTypes";

// ─── Race Overrides ──────────────────────────────────────────────────────────

export interface RaceOverride {
  abilityBonuses: Record<string, number>;
  speed: number;
  size: string;
  languages: string[];
  skillProficiencies?: string[];
  extraSkillChoices?: number;
  weaponProficiencies?: string[];
  armorProficiencies?: string[];
  providedAbilities?: Ability[];
}

export const RACE_OVERRIDES: Record<string, RaceOverride> = {
  dwarf: {
    abilityBonuses: { constitution: 2 },
    speed: 25,
    size: "medium",
    languages: ["common", "dwarvish"],
    weaponProficiencies: ["battleaxe", "handaxe", "light hammer", "warhammer"],
  },
  elf: {
    abilityBonuses: { dexterity: 2 },
    speed: 30,
    size: "medium",
    languages: ["common", "elvish"],
    skillProficiencies: ["perception"],
  },
  halfling: {
    abilityBonuses: { dexterity: 2 },
    speed: 25,
    size: "small",
    languages: ["common", "halfling"],
  },
  human: {
    abilityBonuses: {
      strength: 1,
      dexterity: 1,
      constitution: 1,
      intelligence: 1,
      wisdom: 1,
      charisma: 1,
    },
    speed: 30,
    size: "medium",
    languages: ["common"],
  },
  dragonborn: {
    abilityBonuses: { strength: 2, charisma: 1 },
    speed: 30,
    size: "medium",
    languages: ["common", "draconic"],
    providedAbilities: [
      {
        id: "racial:breath-weapon",
        name: "Breath Weapon",
        type: "racial",
        attackType: "save",
        saveAbility: "dexterity",
        saveDCAbility: "constitution",
        damageRoll: "2d6",
        damageType: "fire",
        range: { type: "ranged", shortRange: 15 },
        requiresTarget: true,
        usesPerRest: 1,
        restType: "short",
        racialScaling: {
          "6": { damageRoll: "3d6" },
          "11": { damageRoll: "4d6" },
          "16": { damageRoll: "5d6" },
        },
      },
    ],
  },
  gnome: {
    abilityBonuses: { intelligence: 2 },
    speed: 25,
    size: "small",
    languages: ["common", "gnomish"],
  },
  "half-elf": {
    abilityBonuses: { charisma: 2 },
    speed: 30,
    size: "medium",
    languages: ["common", "elvish"],
    extraSkillChoices: 2,
  },
  "half-orc": {
    abilityBonuses: { strength: 2, constitution: 1 },
    speed: 30,
    size: "medium",
    languages: ["common", "orc"],
    skillProficiencies: ["intimidation"],
  },
  tiefling: {
    abilityBonuses: { charisma: 2, intelligence: 1 },
    speed: 30,
    size: "medium",
    languages: ["common", "infernal"],
  },
};

// ─── Class Overrides ─────────────────────────────────────────────────────────

export interface ClassOverride {
  skillChoices: number;
  skillOptions: string[];
  weaponProficiencies: string[];
  armorProficiencies: string[];
  spellcastingType: "known" | "prepared" | "none";
  spellcastingAbility: string;
  archetypeLevel: number;
}

export const CLASS_OVERRIDES: Record<string, ClassOverride> = {
  barbarian: {
    skillChoices: 2,
    skillOptions: [
      "animal handling", "athletics", "intimidation",
      "nature", "perception", "survival",
    ],
    weaponProficiencies: ["simple weapons", "martial weapons"],
    armorProficiencies: ["light armor", "medium armor", "shields"],
    spellcastingType: "none",
    spellcastingAbility: "",
    archetypeLevel: 3,
  },
  bard: {
    skillChoices: 3,
    skillOptions: [
      "acrobatics", "animal handling", "arcana", "athletics",
      "deception", "history", "insight", "intimidation",
      "investigation", "medicine", "nature", "perception",
      "performance", "persuasion", "religion", "sleight of hand",
      "stealth", "survival",
    ],
    weaponProficiencies: [
      "simple weapons", "hand crossbows", "longswords",
      "rapiers", "shortswords",
    ],
    armorProficiencies: ["light armor"],
    spellcastingType: "known",
    spellcastingAbility: "charisma",
    archetypeLevel: 3,
  },
  cleric: {
    skillChoices: 2,
    skillOptions: ["history", "insight", "medicine", "persuasion", "religion"],
    weaponProficiencies: ["simple weapons"],
    armorProficiencies: ["light armor", "medium armor", "shields"],
    spellcastingType: "prepared",
    spellcastingAbility: "wisdom",
    archetypeLevel: 1,
  },
  druid: {
    skillChoices: 2,
    skillOptions: [
      "arcana", "animal handling", "insight", "medicine",
      "nature", "perception", "religion", "survival",
    ],
    weaponProficiencies: [
      "clubs", "daggers", "darts", "javelins", "maces",
      "quarterstaffs", "scimitars", "sickles", "slings", "spears",
    ],
    armorProficiencies: ["light armor", "medium armor", "shields"],
    spellcastingType: "prepared",
    spellcastingAbility: "wisdom",
    archetypeLevel: 2,
  },
  fighter: {
    skillChoices: 2,
    skillOptions: [
      "acrobatics", "animal handling", "athletics", "history",
      "insight", "intimidation", "perception", "survival",
    ],
    weaponProficiencies: ["simple weapons", "martial weapons"],
    armorProficiencies: ["all armor", "shields"],
    spellcastingType: "none",
    spellcastingAbility: "",
    archetypeLevel: 3,
  },
  monk: {
    skillChoices: 2,
    skillOptions: [
      "acrobatics", "athletics", "history", "insight",
      "religion", "stealth",
    ],
    weaponProficiencies: ["simple weapons", "shortswords"],
    armorProficiencies: [],
    spellcastingType: "none",
    spellcastingAbility: "",
    archetypeLevel: 3,
  },
  paladin: {
    skillChoices: 2,
    skillOptions: [
      "athletics", "insight", "intimidation", "medicine",
      "persuasion", "religion",
    ],
    weaponProficiencies: ["simple weapons", "martial weapons"],
    armorProficiencies: ["all armor", "shields"],
    spellcastingType: "prepared",
    spellcastingAbility: "charisma",
    archetypeLevel: 3,
  },
  ranger: {
    skillChoices: 3,
    skillOptions: [
      "animal handling", "athletics", "insight", "investigation",
      "nature", "perception", "stealth", "survival",
    ],
    weaponProficiencies: ["simple weapons", "martial weapons"],
    armorProficiencies: ["light armor", "medium armor", "shields"],
    spellcastingType: "known",
    spellcastingAbility: "wisdom",
    archetypeLevel: 3,
  },
  rogue: {
    skillChoices: 4,
    skillOptions: [
      "acrobatics", "athletics", "deception", "insight",
      "intimidation", "investigation", "perception", "performance",
      "persuasion", "sleight of hand", "stealth",
    ],
    weaponProficiencies: [
      "simple weapons", "hand crossbows", "longswords",
      "rapiers", "shortswords",
    ],
    armorProficiencies: ["light armor"],
    spellcastingType: "none",
    spellcastingAbility: "",
    archetypeLevel: 3,
  },
  sorcerer: {
    skillChoices: 2,
    skillOptions: [
      "arcana", "deception", "insight", "intimidation",
      "persuasion", "religion",
    ],
    weaponProficiencies: [
      "daggers", "darts", "slings", "quarterstaffs", "light crossbows",
    ],
    armorProficiencies: [],
    spellcastingType: "known",
    spellcastingAbility: "charisma",
    archetypeLevel: 1,
  },
  warlock: {
    skillChoices: 2,
    skillOptions: [
      "arcana", "deception", "history", "intimidation",
      "investigation", "nature", "religion",
    ],
    weaponProficiencies: ["simple weapons"],
    armorProficiencies: ["light armor"],
    spellcastingType: "known",
    spellcastingAbility: "charisma",
    archetypeLevel: 1,
  },
  wizard: {
    skillChoices: 2,
    skillOptions: [
      "arcana", "history", "insight", "investigation",
      "medicine", "religion",
    ],
    weaponProficiencies: [
      "daggers", "darts", "slings", "quarterstaffs", "light crossbows",
    ],
    armorProficiencies: [],
    spellcastingType: "prepared",
    spellcastingAbility: "intelligence",
    archetypeLevel: 2,
  },
};

// ─── Class Level Spell Progression ───────────────────────────────────────────
//
// Hardcoded SRD 5e spell slot, cantrip, and spells-known tables.
// Each array has 20 entries (index 0 = class level 1, index 19 = class level 20).
// Non-caster classes (barbarian, fighter, monk, rogue) are omitted.

export interface ClassSpellProgression {
  /** Cantrips known at each class level. */
  cantripsKnown?: number[];
  /** Spells known at each class level (only for "known" casters). */
  spellsKnown?: number[];
  /** Spell slots: key = spell level ("1"–"9"), value = slot count at each class level. */
  slots: Record<string, number[]>;
}

/**
 * Standard full-caster spell slot table.
 * Shared by Bard, Cleric, Druid, Sorcerer, Wizard.
 */
//                               L1  L2  L3  L4  L5  L6  L7  L8  L9 L10 L11 L12 L13 L14 L15 L16 L17 L18 L19 L20
const FULL_CASTER_SLOTS: Record<string, number[]> = {
  "1": /* 1st-level slots */   [ 2,  3,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4],
  "2": /* 2nd-level slots */   [ 0,  0,  2,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3],
  "3": /* 3rd-level slots */   [ 0,  0,  0,  0,  2,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3],
  "4": /* 4th-level slots */   [ 0,  0,  0,  0,  0,  0,  1,  2,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3],
  "5": /* 5th-level slots */   [ 0,  0,  0,  0,  0,  0,  0,  0,  1,  2,  2,  2,  2,  2,  2,  2,  2,  3,  3,  3],
  "6": /* 6th-level slots */   [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  1,  1,  1,  1,  1,  1,  1,  1,  2,  2],
  "7": /* 7th-level slots */   [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  1,  1,  1,  1,  1,  1,  1,  2],
  "8": /* 8th-level slots */   [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  1,  1,  1,  1,  1,  1],
  "9": /* 9th-level slots */   [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  1,  1,  1,  1],
};

/**
 * Half-caster spell slot table.
 * Shared by Paladin and Ranger (both start casting at level 2).
 */
//                               L1  L2  L3  L4  L5  L6  L7  L8  L9 L10 L11 L12 L13 L14 L15 L16 L17 L18 L19 L20
const HALF_CASTER_SLOTS: Record<string, number[]> = {
  "1": /* 1st-level slots */   [ 0,  2,  3,  3,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4],
  "2": /* 2nd-level slots */   [ 0,  0,  0,  0,  2,  2,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3],
  "3": /* 3rd-level slots */   [ 0,  0,  0,  0,  0,  0,  0,  0,  2,  2,  3,  3,  3,  3,  3,  3,  3,  3,  3,  3],
  "4": /* 4th-level slots */   [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  1,  1,  2,  2,  3,  3,  3,  3],
  "5": /* 5th-level slots */   [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  1,  1,  2,  2],
};

/**
 * Warlock Pact Magic slots — all slots are the same level, which increases with class level.
 * At any given level, a Warlock only has slots at ONE spell level (their current pact level).
 */
//                               L1  L2  L3  L4  L5  L6  L7  L8  L9 L10 L11 L12 L13 L14 L15 L16 L17 L18 L19 L20
const WARLOCK_PACT_SLOTS: Record<string, number[]> = {
  "1": /* 1st-level slots */   [ 1,  2,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
  "2": /* 2nd-level slots */   [ 0,  0,  2,  2,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
  "3": /* 3rd-level slots */   [ 0,  0,  0,  0,  2,  2,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
  "4": /* 4th-level slots */   [ 0,  0,  0,  0,  0,  0,  2,  2,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
  "5": /* 5th-level slots */   [ 0,  0,  0,  0,  0,  0,  0,  0,  2,  2,  3,  3,  3,  3,  3,  3,  4,  4,  4,  4],
};

export const CLASS_LEVEL_OVERRIDES: Record<string, ClassSpellProgression> = {
  bard: {
    //                          L1  L2  L3  L4  L5  L6  L7  L8  L9 L10 L11 L12 L13 L14 L15 L16 L17 L18 L19 L20
    cantripsKnown:             [ 2,  2,  2,  3,  3,  3,  3,  3,  3,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4],
    spellsKnown:               [ 4,  5,  6,  7,  8,  9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
    slots: FULL_CASTER_SLOTS,
  },
  cleric: {
    cantripsKnown:             [ 3,  3,  3,  4,  4,  4,  4,  4,  4,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5],
    slots: FULL_CASTER_SLOTS,
  },
  druid: {
    cantripsKnown:             [ 2,  2,  2,  3,  3,  3,  3,  3,  3,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4],
    slots: FULL_CASTER_SLOTS,
  },
  paladin: {
    slots: HALF_CASTER_SLOTS,
  },
  ranger: {
    //                          L1  L2  L3  L4  L5  L6  L7  L8  L9 L10 L11 L12 L13 L14 L15 L16 L17 L18 L19 L20
    spellsKnown:               [ 0,  2,  3,  3,  4,  4,  5,  5,  6,  6,  7,  7,  8,  8,  9,  9, 10, 10, 11, 11],
    slots: HALF_CASTER_SLOTS,
  },
  sorcerer: {
    cantripsKnown:             [ 4,  4,  4,  5,  5,  5,  5,  5,  5,  6,  6,  6,  6,  6,  6,  6,  6,  6,  6,  6],
    spellsKnown:               [ 2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
    slots: FULL_CASTER_SLOTS,
  },
  warlock: {
    cantripsKnown:             [ 2,  2,  2,  3,  3,  3,  3,  3,  3,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4],
    spellsKnown:               [ 2,  3,  4,  5,  6,  7,  8,  9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
    slots: WARLOCK_PACT_SLOTS,
  },
  wizard: {
    cantripsKnown:             [ 3,  3,  3,  4,  4,  4,  4,  4,  4,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5],
    slots: FULL_CASTER_SLOTS,
  },
};

// ─── Per-Level Class Feature Overrides ──────────────────────────────────────
//
// Each feature is listed at every level where its mechanical effects change.
// Each entry has the COMPLETE current state of the feature (not incremental).
// Features with no gameplayEffects are still listed for type classification.

export interface ClassFeatureDef {
  name: string;
  type: "active" | "passive" | "reaction";
  gameplayEffects?: GameplayEffects;
}

export interface ClassFeaturesOverride {
  asiLevels: number[];
  levels: Record<number, ClassFeatureDef[]>;
}

export const CLASS_FEATURES_OVERRIDES: Record<string, ClassFeaturesOverride> = {
  // ── Barbarian ───────────────────────────────────────────────────────────────
  barbarian: {
    asiLevels: [4, 8, 12, 16, 19],
    levels: {
      1: [
        { name: "rage", type: "active", gameplayEffects: { condition: "raging", meleeDamageBonus: 2, resistances: ["bludgeoning", "piercing", "slashing"], usesPerRest: 2, restType: "long" } },
        { name: "unarmored defense", type: "passive", gameplayEffects: { condition: "unarmored", acFormula: "10 + dex + con" } },
      ],
      2: [
        { name: "reckless attack", type: "active" },
        { name: "danger sense", type: "passive", gameplayEffects: { saveAdvantage: "dexterity" } },
      ],
      3: [
        { name: "rage", type: "active", gameplayEffects: { condition: "raging", meleeDamageBonus: 2, resistances: ["bludgeoning", "piercing", "slashing"], usesPerRest: 3, restType: "long" } },
      ],
      5: [
        { name: "extra attack", type: "passive", gameplayEffects: { numAttacks: 2 } },
        { name: "fast movement", type: "passive", gameplayEffects: { speedBonus: 10 } },
      ],
      6: [
        { name: "rage", type: "active", gameplayEffects: { condition: "raging", meleeDamageBonus: 2, resistances: ["bludgeoning", "piercing", "slashing"], usesPerRest: 4, restType: "long" } },
      ],
      7: [
        { name: "feral instinct", type: "passive", gameplayEffects: { initiativeAdvantage: true } },
      ],
      9: [
        { name: "brutal critical", type: "passive", gameplayEffects: { critBonusDice: 1 } },
        { name: "rage", type: "active", gameplayEffects: { condition: "raging", meleeDamageBonus: 3, resistances: ["bludgeoning", "piercing", "slashing"], usesPerRest: 4, restType: "long" } },
      ],
      11: [
        { name: "relentless rage", type: "passive" },
      ],
      12: [
        { name: "rage", type: "active", gameplayEffects: { condition: "raging", meleeDamageBonus: 3, resistances: ["bludgeoning", "piercing", "slashing"], usesPerRest: 5, restType: "long" } },
      ],
      13: [
        { name: "brutal critical", type: "passive", gameplayEffects: { critBonusDice: 2 } },
      ],
      15: [
        { name: "persistent rage", type: "passive" },
      ],
      16: [
        { name: "rage", type: "active", gameplayEffects: { condition: "raging", meleeDamageBonus: 4, resistances: ["bludgeoning", "piercing", "slashing"], usesPerRest: 5, restType: "long" } },
      ],
      17: [
        { name: "brutal critical", type: "passive", gameplayEffects: { critBonusDice: 3 } },
        { name: "rage", type: "active", gameplayEffects: { condition: "raging", meleeDamageBonus: 4, resistances: ["bludgeoning", "piercing", "slashing"], usesPerRest: 6, restType: "long" } },
      ],
      18: [
        { name: "indomitable might", type: "passive" },
      ],
      20: [
        { name: "primal champion", type: "passive", gameplayEffects: { statBonuses: { strength: 4, constitution: 4 } } },
        { name: "rage", type: "active", gameplayEffects: { condition: "raging", meleeDamageBonus: 4, resistances: ["bludgeoning", "piercing", "slashing"], restType: "long" } },
      ],
    },
  },

  // ── Bard ─────────────────────────────────────────────────────────────────────
  bard: {
    asiLevels: [4, 8, 12, 16, 19],
    levels: {
      1: [
        { name: "spellcasting", type: "passive" },
        { name: "bardic inspiration", type: "active", gameplayEffects: { dieType: "d6", restType: "long" } },
      ],
      2: [
        { name: "jack of all trades", type: "passive", gameplayEffects: { halfProficiency: true } },
        { name: "song of rest", type: "active", gameplayEffects: { dieType: "d6" } },
      ],
      3: [
        { name: "expertise", type: "passive", gameplayEffects: { expertiseSlots: 2 } },
      ],
      5: [
        { name: "bardic inspiration", type: "active", gameplayEffects: { dieType: "d8", restType: "short" } },
        { name: "font of inspiration", type: "passive" },
      ],
      6: [
        { name: "countercharm", type: "active" },
      ],
      9: [
        { name: "song of rest", type: "active", gameplayEffects: { dieType: "d8" } },
      ],
      10: [
        { name: "bardic inspiration", type: "active", gameplayEffects: { dieType: "d10", restType: "short" } },
        { name: "expertise", type: "passive", gameplayEffects: { expertiseSlots: 2 } },
        { name: "magical secrets", type: "passive" },
      ],
      13: [
        { name: "song of rest", type: "active", gameplayEffects: { dieType: "d10" } },
      ],
      14: [
        { name: "magical secrets", type: "passive" },
      ],
      15: [
        { name: "bardic inspiration", type: "active", gameplayEffects: { dieType: "d12", restType: "short" } },
      ],
      17: [
        { name: "song of rest", type: "active", gameplayEffects: { dieType: "d12" } },
      ],
      18: [
        { name: "magical secrets", type: "passive" },
      ],
      20: [
        { name: "superior inspiration", type: "passive" },
      ],
    },
  },

  // ── Cleric ───────────────────────────────────────────────────────────────────
  cleric: {
    asiLevels: [4, 8, 12, 16, 19],
    levels: {
      1: [
        { name: "spellcasting", type: "passive" },
      ],
      2: [
        { name: "channel divinity", type: "active", gameplayEffects: { usesPerRest: 1, restType: "short" } },
        { name: "turn undead", type: "active" },
      ],
      5: [
        { name: "destroy undead", type: "passive" },
      ],
      6: [
        { name: "channel divinity", type: "active", gameplayEffects: { usesPerRest: 2, restType: "short" } },
      ],
      10: [
        { name: "divine intervention", type: "active" },
      ],
      18: [
        { name: "channel divinity", type: "active", gameplayEffects: { usesPerRest: 3, restType: "short" } },
      ],
    },
  },

  // ── Druid ────────────────────────────────────────────────────────────────────
  druid: {
    asiLevels: [4, 8, 12, 16, 19],
    levels: {
      1: [
        { name: "druidic", type: "passive" },
        { name: "spellcasting", type: "passive" },
      ],
      2: [
        { name: "wild shape", type: "active", gameplayEffects: { usesPerRest: 2, restType: "short" } },
      ],
      18: [
        { name: "timeless body", type: "passive" },
        { name: "beast spells", type: "passive" },
      ],
      20: [
        { name: "archdruid", type: "passive" },
      ],
    },
  },

  // ── Fighter ──────────────────────────────────────────────────────────────────
  fighter: {
    asiLevels: [4, 6, 8, 12, 14, 16, 19],
    levels: {
      1: [
        { name: "fighting style", type: "passive" },
        { name: "second wind", type: "active", gameplayEffects: { usesPerRest: 1, restType: "short" } },
      ],
      2: [
        { name: "action surge", type: "active", gameplayEffects: { usesPerRest: 1, restType: "short" } },
      ],
      5: [
        { name: "extra attack", type: "passive", gameplayEffects: { numAttacks: 2 } },
      ],
      9: [
        { name: "indomitable", type: "passive", gameplayEffects: { usesPerRest: 1, restType: "long" } },
      ],
      11: [
        { name: "extra attack", type: "passive", gameplayEffects: { numAttacks: 3 } },
      ],
      13: [
        { name: "indomitable", type: "passive", gameplayEffects: { usesPerRest: 2, restType: "long" } },
      ],
      17: [
        { name: "action surge", type: "active", gameplayEffects: { usesPerRest: 2, restType: "short" } },
        { name: "indomitable", type: "passive", gameplayEffects: { usesPerRest: 3, restType: "long" } },
      ],
      20: [
        { name: "extra attack", type: "passive", gameplayEffects: { numAttacks: 4 } },
      ],
    },
  },

  // ── Monk ─────────────────────────────────────────────────────────────────────
  monk: {
    asiLevels: [4, 8, 12, 16, 19],
    levels: {
      1: [
        { name: "unarmored defense", type: "passive", gameplayEffects: { condition: "unarmored", acFormula: "10 + dex + wis" } },
        { name: "martial arts", type: "passive", gameplayEffects: { dieType: "d4" } },
      ],
      2: [
        { name: "ki", type: "active", gameplayEffects: { resourcePool: { name: "ki", perLevel: 1 } } },
        { name: "unarmored movement", type: "passive", gameplayEffects: { condition: "unarmored", speedBonus: 10 } },
      ],
      3: [
        { name: "deflect missiles", type: "reaction" },
      ],
      4: [
        { name: "slow fall", type: "reaction" },
      ],
      5: [
        { name: "extra attack", type: "passive", gameplayEffects: { numAttacks: 2 } },
        { name: "stunning strike", type: "active" },
        { name: "martial arts", type: "passive", gameplayEffects: { dieType: "d6" } },
      ],
      6: [
        { name: "ki-empowered strikes", type: "passive" },
        { name: "unarmored movement", type: "passive", gameplayEffects: { condition: "unarmored", speedBonus: 15 } },
      ],
      7: [
        { name: "evasion", type: "passive", gameplayEffects: { evasion: true } },
        { name: "stillness of mind", type: "active" },
      ],
      9: [
        { name: "unarmored movement", type: "passive", gameplayEffects: { condition: "unarmored", speedBonus: 20 } },
      ],
      10: [
        { name: "purity of body", type: "passive", gameplayEffects: { immunities: ["disease", "poison"] } },
      ],
      11: [
        { name: "martial arts", type: "passive", gameplayEffects: { dieType: "d8" } },
      ],
      13: [
        { name: "tongue of the sun and moon", type: "passive" },
      ],
      14: [
        { name: "diamond soul", type: "passive", gameplayEffects: { saveProficiencies: ["all"] } },
        { name: "unarmored movement", type: "passive", gameplayEffects: { condition: "unarmored", speedBonus: 25 } },
      ],
      15: [
        { name: "timeless body", type: "passive" },
      ],
      17: [
        { name: "martial arts", type: "passive", gameplayEffects: { dieType: "d10" } },
      ],
      18: [
        { name: "empty body", type: "active" },
        { name: "unarmored movement", type: "passive", gameplayEffects: { condition: "unarmored", speedBonus: 30 } },
      ],
      20: [
        { name: "perfect self", type: "passive" },
      ],
    },
  },

  // ── Paladin ──────────────────────────────────────────────────────────────────
  paladin: {
    asiLevels: [4, 8, 12, 16, 19],
    levels: {
      1: [
        { name: "divine sense", type: "active" },
        { name: "lay on hands", type: "active", gameplayEffects: { healPoolPerLevel: 5 } },
      ],
      2: [
        { name: "fighting style", type: "passive" },
        { name: "spellcasting", type: "passive" },
        { name: "divine smite", type: "active" },
      ],
      3: [
        { name: "divine health", type: "passive", gameplayEffects: { immunities: ["disease"] } },
      ],
      5: [
        { name: "extra attack", type: "passive", gameplayEffects: { numAttacks: 2 } },
      ],
      6: [
        { name: "aura of protection", type: "passive" },
      ],
      10: [
        { name: "aura of courage", type: "passive" },
      ],
      11: [
        { name: "improved divine smite", type: "passive", gameplayEffects: { bonusDamage: "1d8 radiant" } },
      ],
      14: [
        { name: "cleansing touch", type: "active" },
      ],
    },
  },

  // ── Ranger ───────────────────────────────────────────────────────────────────
  ranger: {
    asiLevels: [4, 8, 12, 16, 19],
    levels: {
      1: [
        { name: "favored enemy", type: "passive" },
        { name: "natural explorer", type: "passive" },
      ],
      2: [
        { name: "fighting style", type: "passive" },
        { name: "spellcasting", type: "passive" },
      ],
      3: [
        { name: "primeval awareness", type: "active" },
      ],
      5: [
        { name: "extra attack", type: "passive", gameplayEffects: { numAttacks: 2 } },
      ],
      6: [
        { name: "favored enemy", type: "passive" },
        { name: "natural explorer", type: "passive" },
      ],
      8: [
        { name: "land's stride", type: "passive" },
      ],
      10: [
        { name: "hide in plain sight", type: "active" },
        { name: "natural explorer", type: "passive" },
      ],
      14: [
        { name: "vanish", type: "passive" },
        { name: "favored enemy", type: "passive" },
      ],
      18: [
        { name: "feral senses", type: "passive" },
      ],
      20: [
        { name: "foe slayer", type: "passive" },
      ],
    },
  },

  // ── Rogue ────────────────────────────────────────────────────────────────────
  rogue: {
    asiLevels: [4, 8, 10, 12, 16, 19],
    levels: {
      1: [
        { name: "expertise", type: "passive", gameplayEffects: { expertiseSlots: 2 } },
        { name: "sneak attack", type: "passive", gameplayEffects: { sneakAttackDice: 1 } },
        { name: "thieves' cant", type: "passive" },
      ],
      2: [
        { name: "cunning action", type: "active" },
      ],
      3: [
        { name: "sneak attack", type: "passive", gameplayEffects: { sneakAttackDice: 2 } },
      ],
      5: [
        { name: "uncanny dodge", type: "reaction" },
        { name: "sneak attack", type: "passive", gameplayEffects: { sneakAttackDice: 3 } },
      ],
      6: [
        { name: "expertise", type: "passive", gameplayEffects: { expertiseSlots: 2 } },
      ],
      7: [
        { name: "evasion", type: "passive", gameplayEffects: { evasion: true } },
        { name: "sneak attack", type: "passive", gameplayEffects: { sneakAttackDice: 4 } },
      ],
      9: [
        { name: "sneak attack", type: "passive", gameplayEffects: { sneakAttackDice: 5 } },
      ],
      11: [
        { name: "reliable talent", type: "passive", gameplayEffects: { minCheckRoll: 10 } },
        { name: "sneak attack", type: "passive", gameplayEffects: { sneakAttackDice: 6 } },
      ],
      13: [
        { name: "sneak attack", type: "passive", gameplayEffects: { sneakAttackDice: 7 } },
      ],
      14: [
        { name: "blindsense", type: "passive" },
      ],
      15: [
        { name: "slippery mind", type: "passive", gameplayEffects: { saveProficiencies: ["wisdom"] } },
        { name: "sneak attack", type: "passive", gameplayEffects: { sneakAttackDice: 8 } },
      ],
      17: [
        { name: "sneak attack", type: "passive", gameplayEffects: { sneakAttackDice: 9 } },
      ],
      18: [
        { name: "elusive", type: "passive" },
      ],
      19: [
        { name: "sneak attack", type: "passive", gameplayEffects: { sneakAttackDice: 10 } },
      ],
      20: [
        { name: "stroke of luck", type: "active", gameplayEffects: { usesPerRest: 1, restType: "short" } },
      ],
    },
  },

  // ── Sorcerer ─────────────────────────────────────────────────────────────────
  sorcerer: {
    asiLevels: [4, 8, 12, 16, 19],
    levels: {
      1: [
        { name: "spellcasting", type: "passive" },
      ],
      2: [
        { name: "font of magic", type: "active", gameplayEffects: { resourcePool: { name: "sorcery points", perLevel: 1 } } },
      ],
      3: [
        { name: "metamagic", type: "active" },
      ],
      10: [
        { name: "metamagic", type: "active" },
      ],
      17: [
        { name: "metamagic", type: "active" },
      ],
      20: [
        { name: "sorcerous restoration", type: "passive" },
      ],
    },
  },

  // ── Warlock ──────────────────────────────────────────────────────────────────
  warlock: {
    asiLevels: [4, 8, 12, 16, 19],
    levels: {
      1: [
        { name: "pact magic", type: "passive" },
      ],
      2: [
        { name: "eldritch invocations", type: "passive" },
      ],
      3: [
        { name: "pact boon", type: "passive" },
      ],
      11: [
        { name: "mystic arcanum", type: "passive" },
      ],
      13: [
        { name: "mystic arcanum", type: "passive" },
      ],
      15: [
        { name: "mystic arcanum", type: "passive" },
      ],
      17: [
        { name: "mystic arcanum", type: "passive" },
      ],
      20: [
        { name: "eldritch master", type: "active", gameplayEffects: { usesPerRest: 1, restType: "long" } },
      ],
    },
  },

  // ── Wizard ───────────────────────────────────────────────────────────────────
  wizard: {
    asiLevels: [4, 8, 12, 16, 19],
    levels: {
      1: [
        { name: "spellcasting", type: "passive" },
        { name: "arcane recovery", type: "active", gameplayEffects: { usesPerRest: 1, restType: "long" } },
      ],
      18: [
        { name: "spell mastery", type: "passive" },
      ],
      20: [
        { name: "signature spells", type: "passive" },
      ],
    },
  },
};

// ─── Per-Level Subclass Feature Overrides ────────────────────────────────────
//
// Same pattern as CLASS_FEATURES_OVERRIDES: type + optional gameplayEffects.
// Features that are purely narrative get type but no gameplayEffects.

export interface SubclassFeaturesOverride {
  levels: Record<number, ClassFeatureDef[]>;
}

export const SUBCLASS_FEATURES_OVERRIDES: Record<string, SubclassFeaturesOverride> = {
  // ── Champion (Fighter) ────────────────────────────────────────────────────
  champion: {
    levels: {
      3: [
        { name: "improved critical", type: "passive", gameplayEffects: { critRange: 19 } },
      ],
      7: [
        { name: "remarkable athlete", type: "passive", gameplayEffects: { halfProficiency: true } },
      ],
      10: [
        { name: "additional fighting style", type: "passive" },
      ],
      15: [
        { name: "superior critical", type: "passive", gameplayEffects: { critRange: 18 } },
      ],
      18: [
        { name: "survivor", type: "passive" },
      ],
    },
  },

  // ── Berserker (Barbarian) ─────────────────────────────────────────────────
  berserker: {
    levels: {
      3: [
        { name: "frenzy", type: "active", gameplayEffects: { condition: "raging" } },
      ],
      6: [
        { name: "mindless rage", type: "passive", gameplayEffects: { condition: "raging", immunities: ["charmed", "frightened"] } },
      ],
      10: [
        { name: "intimidating presence", type: "active" },
      ],
      14: [
        { name: "retaliation", type: "reaction" },
      ],
    },
  },

  // ── Life (Cleric) ─────────────────────────────────────────────────────────
  life: {
    levels: {
      1: [
        { name: "bonus proficiency", type: "passive", gameplayEffects: { proficiencyGrants: { armor: ["heavy armor"] } } },
        { name: "disciple of life", type: "passive" },
      ],
      2: [
        { name: "preserve life", type: "active" },
      ],
      6: [
        { name: "blessed healer", type: "passive" },
      ],
      8: [
        { name: "divine strike", type: "passive", gameplayEffects: { bonusDamage: "1d8 radiant" } },
      ],
      14: [
        { name: "divine strike", type: "passive", gameplayEffects: { bonusDamage: "2d8 radiant" } },
      ],
      17: [
        { name: "supreme healing", type: "passive" },
      ],
    },
  },

  // ── Thief (Rogue) ─────────────────────────────────────────────────────────
  thief: {
    levels: {
      3: [
        { name: "fast hands", type: "active" },
        { name: "second-story work", type: "passive" },
      ],
      9: [
        { name: "supreme sneak", type: "passive" },
      ],
      13: [
        { name: "use magic device", type: "passive" },
      ],
      17: [
        { name: "thief's reflexes", type: "passive" },
      ],
    },
  },

  // ── Assassin (Rogue) ──────────────────────────────────────────────────────
  assassin: {
    levels: {
      3: [
        { name: "bonus proficiencies", type: "passive", gameplayEffects: { proficiencyGrants: { tools: ["disguise kit", "poisoner's kit"] } } },
        { name: "assassinate", type: "passive" },
      ],
      9: [
        { name: "infiltration expertise", type: "passive" },
      ],
      13: [
        { name: "impostor", type: "passive" },
      ],
      17: [
        { name: "death strike", type: "passive" },
      ],
    },
  },

  // ── Evocation (Wizard) ────────────────────────────────────────────────────
  evocation: {
    levels: {
      2: [
        { name: "evocation savant", type: "passive" },
        { name: "sculpt spells", type: "active" },
      ],
      6: [
        { name: "potent cantrip", type: "passive" },
      ],
      10: [
        { name: "empowered evocation", type: "passive", gameplayEffects: { spellDamageBonusAbility: "intelligence" } },
      ],
      14: [
        { name: "overchannel", type: "active" },
      ],
    },
  },

  // ── Open Hand (Monk) ──────────────────────────────────────────────────────
  "open-hand": {
    levels: {
      3: [
        { name: "open hand technique", type: "active" },
      ],
      6: [
        { name: "wholeness of body", type: "active", gameplayEffects: { usesPerRest: 1, restType: "long" } },
      ],
      11: [
        { name: "tranquility", type: "passive" },
      ],
      17: [
        { name: "quivering palm", type: "active" },
      ],
    },
  },

  // ── Devotion (Paladin) ────────────────────────────────────────────────────
  devotion: {
    levels: {
      3: [
        { name: "sacred weapon", type: "active" },
        { name: "turn the unholy", type: "active" },
      ],
      7: [
        { name: "aura of devotion", type: "passive", gameplayEffects: { immunities: ["charmed"] } },
      ],
      15: [
        { name: "purity of spirit", type: "passive" },
      ],
      20: [
        { name: "holy nimbus", type: "active" },
      ],
    },
  },

  // ── Hunter (Ranger) ───────────────────────────────────────────────────────
  hunter: {
    levels: {
      3: [
        { name: "hunter's prey", type: "passive" },
      ],
      7: [
        { name: "defensive tactics", type: "passive" },
      ],
      11: [
        { name: "multiattack", type: "active" },
      ],
      15: [
        { name: "superior hunter's defense", type: "passive" },
      ],
    },
  },

  // ── Draconic (Sorcerer) ───────────────────────────────────────────────────
  draconic: {
    levels: {
      1: [
        { name: "dragon ancestor", type: "passive" },
        { name: "draconic resilience", type: "passive", gameplayEffects: { acFormula: "13 + dex", hpPerLevel: 1 } },
      ],
      6: [
        { name: "elemental affinity", type: "passive", gameplayEffects: { spellDamageBonusAbility: "charisma" } },
      ],
      14: [
        { name: "dragon wings", type: "active" },
      ],
      18: [
        { name: "draconic presence", type: "active" },
      ],
    },
  },

  // ── Fiend (Warlock) ───────────────────────────────────────────────────────
  fiend: {
    levels: {
      1: [
        { name: "dark one's blessing", type: "passive" },
      ],
      6: [
        { name: "dark one's own luck", type: "active", gameplayEffects: { usesPerRest: 1, restType: "short" } },
      ],
      10: [
        { name: "fiendish resilience", type: "passive" },
      ],
      14: [
        { name: "hurl through hell", type: "active", gameplayEffects: { usesPerRest: 1, restType: "long" } },
      ],
    },
  },

  // ── Lore (Bard) ───────────────────────────────────────────────────────────
  lore: {
    levels: {
      3: [
        { name: "bonus proficiencies", type: "passive" },
        { name: "cutting words", type: "reaction" },
      ],
      6: [
        { name: "additional magical secrets", type: "passive" },
      ],
      14: [
        { name: "peerless skill", type: "passive" },
      ],
    },
  },

  // ── Moon (Druid) ──────────────────────────────────────────────────────────
  moon: {
    levels: {
      2: [
        { name: "combat wild shape", type: "active" },
        { name: "circle forms", type: "passive" },
      ],
      6: [
        { name: "primal strike", type: "passive" },
      ],
      10: [
        { name: "elemental wild shape", type: "active" },
      ],
      14: [
        { name: "thousand forms", type: "active" },
      ],
    },
  },
};

// ─── Spell AOE Overrides ────────────────────────────────────────────────────

export interface SpellMechanicsOverride {
  aoe?: AOEData;
  upcastScaling?: Record<string, SpellScalingEntry>;
  cantripScaling?: Record<string, SpellScalingEntry>;
}

/**
 * Complete AOE data for all SRD spells with area effects.
 * Keyed by spell slug (after stripping the "srd_" prefix).
 * Manually maintained — regex parsing was too fragile for the varied
 * phrasing in Open5e descriptions (e.g. "a line 100 feet long").
 *
 * size = radius for sphere/cylinder/cube, length for cone/line (in feet).
 * origin = "self" when the AOE emanates from the caster, "target" when placed at a point.
 */
export const SPELL_OVERRIDES: Record<string, SpellMechanicsOverride> = {
  // ── Cantrips ───────────────────────────────────────────────
  "acid-splash": {
    aoe: { shape: "sphere", size: 5, origin: "target" },    // 2 creatures within 5 ft
    cantripScaling: { "5": { damageRoll: "2d6" }, "11": { damageRoll: "3d6" }, "17": { damageRoll: "4d6" } },
  },
  "chill-touch": {
    cantripScaling: { "5": { damageRoll: "2d8" }, "11": { damageRoll: "3d8" }, "17": { damageRoll: "4d8" } },
  },
  "eldritch-blast": {
    cantripScaling: { "5": { targetCount: 2 }, "11": { targetCount: 3 }, "17": { targetCount: 4 } },
  },
  "fire-bolt": {
    cantripScaling: { "5": { damageRoll: "2d10" }, "11": { damageRoll: "3d10" }, "17": { damageRoll: "4d10" } },
  },
  "poison-spray": {
    aoe: { shape: "cone", size: 10, origin: "self" },       // 10-foot cone (Tasha's variant)
    cantripScaling: { "5": { damageRoll: "2d12" }, "11": { damageRoll: "3d12" }, "17": { damageRoll: "4d12" } },
  },
  "produce-flame": {
    cantripScaling: { "5": { damageRoll: "2d8" }, "11": { damageRoll: "3d8" }, "17": { damageRoll: "4d8" } },
  },
  "ray-of-frost": {
    cantripScaling: { "5": { damageRoll: "2d8" }, "11": { damageRoll: "3d8" }, "17": { damageRoll: "4d8" } },
  },
  "sacred-flame": {
    cantripScaling: { "5": { damageRoll: "2d8" }, "11": { damageRoll: "3d8" }, "17": { damageRoll: "4d8" } },
  },
  "shocking-grasp": {
    cantripScaling: { "5": { damageRoll: "2d8" }, "11": { damageRoll: "3d8" }, "17": { damageRoll: "4d8" } },
  },
  "vicious-mockery": {
    cantripScaling: { "5": { damageRoll: "2d4" }, "11": { damageRoll: "3d4" }, "17": { damageRoll: "4d4" } },
  },
  "thunderclap": {
    aoe: { shape: "sphere", size: 5, origin: "self" },
    cantripScaling: { "5": { damageRoll: "2d6" }, "11": { damageRoll: "3d6" }, "17": { damageRoll: "4d6" } },
  },
  "word-of-radiance": {
    aoe: { shape: "sphere", size: 5, origin: "self" },
    cantripScaling: { "5": { damageRoll: "2d6" }, "11": { damageRoll: "3d6" }, "17": { damageRoll: "4d6" } },
  },
  "sword-burst": {
    aoe: { shape: "sphere", size: 5, origin: "self" },
    cantripScaling: { "5": { damageRoll: "2d6" }, "11": { damageRoll: "3d6" }, "17": { damageRoll: "4d6" } },
  },

  // ── 1st Level ──────────────────────────────────────────────
  "bane": {
    upcastScaling: { "2": { targetCount: 4 }, "3": { targetCount: 5 }, "4": { targetCount: 6 }, "5": { targetCount: 7 }, "6": { targetCount: 8 }, "7": { targetCount: 9 }, "8": { targetCount: 10 }, "9": { targetCount: 11 } },
  },
  "bless": {
    upcastScaling: { "2": { targetCount: 4 }, "3": { targetCount: 5 }, "4": { targetCount: 6 }, "5": { targetCount: 7 }, "6": { targetCount: 8 }, "7": { targetCount: 9 }, "8": { targetCount: 10 }, "9": { targetCount: 11 } },
  },
  "burning-hands": {
    aoe: { shape: "cone", size: 15, origin: "self" },
    upcastScaling: { "2": { damageRoll: "4d6" }, "3": { damageRoll: "5d6" }, "4": { damageRoll: "6d6" }, "5": { damageRoll: "7d6" }, "6": { damageRoll: "8d6" }, "7": { damageRoll: "9d6" }, "8": { damageRoll: "10d6" }, "9": { damageRoll: "11d6" } },
  },
  "charm-person": {
    upcastScaling: { "2": { targetCount: 2 }, "3": { targetCount: 3 }, "4": { targetCount: 4 }, "5": { targetCount: 5 }, "6": { targetCount: 6 }, "7": { targetCount: 7 }, "8": { targetCount: 8 }, "9": { targetCount: 9 } },
  },
  "color-spray": {
    aoe: { shape: "cone", size: 15, origin: "self" },
    upcastScaling: { "2": { damageRoll: "8d10" }, "3": { damageRoll: "10d10" }, "4": { damageRoll: "12d10" }, "5": { damageRoll: "14d10" }, "6": { damageRoll: "16d10" }, "7": { damageRoll: "18d10" }, "8": { damageRoll: "20d10" }, "9": { damageRoll: "22d10" } },
  },
  "command": {
    upcastScaling: { "2": { targetCount: 2 }, "3": { targetCount: 3 }, "4": { targetCount: 4 }, "5": { targetCount: 5 }, "6": { targetCount: 6 }, "7": { targetCount: 7 }, "8": { targetCount: 8 }, "9": { targetCount: 9 } },
  },
  "cure-wounds": {
    upcastScaling: { "2": { damageRoll: "2d8" }, "3": { damageRoll: "3d8" }, "4": { damageRoll: "4d8" }, "5": { damageRoll: "5d8" }, "6": { damageRoll: "6d8" }, "7": { damageRoll: "7d8" }, "8": { damageRoll: "8d8" }, "9": { damageRoll: "9d8" } },
  },
  "entangle":                { aoe: { shape: "cube", size: 20, origin: "target" } },
  "faerie-fire":             { aoe: { shape: "cube", size: 20, origin: "target" } },
  "fog-cloud":               { aoe: { shape: "sphere", size: 20, origin: "target" } },
  "grease":                  { aoe: { shape: "cube", size: 10, origin: "target" } },
  "guiding-bolt": {
    upcastScaling: { "2": { damageRoll: "5d6" }, "3": { damageRoll: "6d6" }, "4": { damageRoll: "7d6" }, "5": { damageRoll: "8d6" }, "6": { damageRoll: "9d6" }, "7": { damageRoll: "10d6" }, "8": { damageRoll: "11d6" }, "9": { damageRoll: "12d6" } },
  },
  "healing-word": {
    upcastScaling: { "2": { damageRoll: "2d4" }, "3": { damageRoll: "3d4" }, "4": { damageRoll: "4d4" }, "5": { damageRoll: "5d4" }, "6": { damageRoll: "6d4" }, "7": { damageRoll: "7d4" }, "8": { damageRoll: "8d4" }, "9": { damageRoll: "9d4" } },
  },
  "hellish-rebuke": {
    upcastScaling: { "2": { damageRoll: "3d10" }, "3": { damageRoll: "4d10" }, "4": { damageRoll: "5d10" }, "5": { damageRoll: "6d10" }, "6": { damageRoll: "7d10" }, "7": { damageRoll: "8d10" }, "8": { damageRoll: "9d10" }, "9": { damageRoll: "10d10" } },
  },
  "inflict-wounds": {
    upcastScaling: { "2": { damageRoll: "4d10" }, "3": { damageRoll: "5d10" }, "4": { damageRoll: "6d10" }, "5": { damageRoll: "7d10" }, "6": { damageRoll: "8d10" }, "7": { damageRoll: "9d10" }, "8": { damageRoll: "10d10" }, "9": { damageRoll: "11d10" } },
  },
  "magic-missile": {
    upcastScaling: { "2": { targetCount: 4 }, "3": { targetCount: 5 }, "4": { targetCount: 6 }, "5": { targetCount: 7 }, "6": { targetCount: 8 }, "7": { targetCount: 9 }, "8": { targetCount: 10 }, "9": { targetCount: 11 } },
  },
  "sleep": {
    aoe: { shape: "sphere", size: 20, origin: "target" },
    upcastScaling: { "2": { damageRoll: "7d8" }, "3": { damageRoll: "9d8" }, "4": { damageRoll: "11d8" }, "5": { damageRoll: "13d8" }, "6": { damageRoll: "15d8" }, "7": { damageRoll: "17d8" }, "8": { damageRoll: "19d8" }, "9": { damageRoll: "21d8" } },
  },
  "thunderwave": {
    aoe: { shape: "cube", size: 15, origin: "self" },
    upcastScaling: { "2": { damageRoll: "3d8" }, "3": { damageRoll: "4d8" }, "4": { damageRoll: "5d8" }, "5": { damageRoll: "6d8" }, "6": { damageRoll: "7d8" }, "7": { damageRoll: "8d8" }, "8": { damageRoll: "9d8" }, "9": { damageRoll: "10d8" } },
  },

  // ── 2nd Level ──────────────────────────────────────────────
  "acid-arrow": {
    upcastScaling: { "3": { damageRoll: "5d4" }, "4": { damageRoll: "6d4" }, "5": { damageRoll: "7d4" }, "6": { damageRoll: "8d4" }, "7": { damageRoll: "9d4" }, "8": { damageRoll: "10d4" }, "9": { damageRoll: "11d4" } },
  },
  "blindnessdeafness": {
    upcastScaling: { "3": { targetCount: 2 }, "4": { targetCount: 3 }, "5": { targetCount: 4 }, "6": { targetCount: 5 }, "7": { targetCount: 6 }, "8": { targetCount: 7 }, "9": { targetCount: 8 } },
  },
  "branding-smite": {
    upcastScaling: { "3": { damageRoll: "3d6" }, "4": { damageRoll: "4d6" }, "5": { damageRoll: "5d6" }, "6": { damageRoll: "6d6" }, "7": { damageRoll: "7d6" }, "8": { damageRoll: "8d6" }, "9": { damageRoll: "9d6" } },
  },
  "calm-emotions":           { aoe: { shape: "sphere", size: 20, origin: "target" } },
  "darkness":                { aoe: { shape: "sphere", size: 15, origin: "target" } },
  "flame-blade": {
    upcastScaling: { "4": { damageRoll: "4d6" }, "6": { damageRoll: "5d6" }, "8": { damageRoll: "6d6" } },   // +1d6 per 2 slots
  },
  "flaming-sphere": {
    aoe: { shape: "sphere", size: 5, origin: "target" },
    upcastScaling: { "3": { damageRoll: "3d6" }, "4": { damageRoll: "4d6" }, "5": { damageRoll: "5d6" }, "6": { damageRoll: "6d6" }, "7": { damageRoll: "7d6" }, "8": { damageRoll: "8d6" }, "9": { damageRoll: "9d6" } },
  },
  "gust-of-wind":            { aoe: { shape: "line", size: 60, width: 10, origin: "self" } },
  "heat-metal": {
    upcastScaling: { "3": { damageRoll: "3d8" }, "4": { damageRoll: "4d8" }, "5": { damageRoll: "5d8" }, "6": { damageRoll: "6d8" }, "7": { damageRoll: "7d8" }, "8": { damageRoll: "8d8" }, "9": { damageRoll: "9d8" } },
  },
  "hold-person": {
    upcastScaling: { "3": { targetCount: 2 }, "4": { targetCount: 3 }, "5": { targetCount: 4 }, "6": { targetCount: 5 }, "7": { targetCount: 6 }, "8": { targetCount: 7 }, "9": { targetCount: 8 } },
  },
  "invisibility": {
    upcastScaling: { "3": { targetCount: 2 }, "4": { targetCount: 3 }, "5": { targetCount: 4 }, "6": { targetCount: 5 }, "7": { targetCount: 6 }, "8": { targetCount: 7 }, "9": { targetCount: 8 } },
  },
  "moonbeam": {
    aoe: { shape: "cylinder", size: 5, origin: "target" },
    upcastScaling: { "3": { damageRoll: "3d10" }, "4": { damageRoll: "4d10" }, "5": { damageRoll: "5d10" }, "6": { damageRoll: "6d10" }, "7": { damageRoll: "7d10" }, "8": { damageRoll: "8d10" }, "9": { damageRoll: "9d10" } },
  },
  "prayer-of-healing": {
    upcastScaling: { "3": { damageRoll: "3d8" }, "4": { damageRoll: "4d8" }, "5": { damageRoll: "5d8" }, "6": { damageRoll: "6d8" }, "7": { damageRoll: "7d8" }, "8": { damageRoll: "8d8" }, "9": { damageRoll: "9d8" } },
  },
  "scorching-ray": {
    upcastScaling: { "3": { targetCount: 4 }, "4": { targetCount: 5 }, "5": { targetCount: 6 }, "6": { targetCount: 7 }, "7": { targetCount: 8 }, "8": { targetCount: 9 }, "9": { targetCount: 10 } },
  },
  "shatter": {
    aoe: { shape: "sphere", size: 10, origin: "target" },
    upcastScaling: { "3": { damageRoll: "4d8" }, "4": { damageRoll: "5d8" }, "5": { damageRoll: "6d8" }, "6": { damageRoll: "7d8" }, "7": { damageRoll: "8d8" }, "8": { damageRoll: "9d8" }, "9": { damageRoll: "10d8" } },
  },
  "silence":                 { aoe: { shape: "sphere", size: 20, origin: "target" } },
  "spike-growth":            { aoe: { shape: "sphere", size: 20, origin: "target" } },
  "spiritual-weapon": {
    upcastScaling: { "4": { damageRoll: "2d8" }, "6": { damageRoll: "3d8" }, "8": { damageRoll: "4d8" } },   // +1d8 per 2 slots
  },
  "web":                     { aoe: { shape: "cube", size: 20, origin: "target" } },

  // ── 3rd Level ──────────────────────────────────────────────
  "call-lightning": {
    aoe: { shape: "cylinder", size: 60, origin: "target" },
    upcastScaling: { "4": { damageRoll: "4d10" }, "5": { damageRoll: "5d10" }, "6": { damageRoll: "6d10" }, "7": { damageRoll: "7d10" }, "8": { damageRoll: "8d10" }, "9": { damageRoll: "9d10" } },
  },
  "daylight":                { aoe: { shape: "sphere", size: 60, origin: "target" } },
  "fear":                    { aoe: { shape: "cone", size: 30, origin: "self" } },
  "fireball": {
    aoe: { shape: "sphere", size: 20, origin: "target" },
    upcastScaling: { "4": { damageRoll: "9d6" }, "5": { damageRoll: "10d6" }, "6": { damageRoll: "11d6" }, "7": { damageRoll: "12d6" }, "8": { damageRoll: "13d6" }, "9": { damageRoll: "14d6" } },
  },
  "fly": {
    upcastScaling: { "4": { targetCount: 2 }, "5": { targetCount: 3 }, "6": { targetCount: 4 }, "7": { targetCount: 5 }, "8": { targetCount: 6 }, "9": { targetCount: 7 } },
  },
  "glyph-of-warding": {
    upcastScaling: { "4": { damageRoll: "6d8" }, "5": { damageRoll: "7d8" }, "6": { damageRoll: "8d8" }, "7": { damageRoll: "9d8" }, "8": { damageRoll: "10d8" }, "9": { damageRoll: "11d8" } },
  },
  "hypnotic-pattern":        { aoe: { shape: "cube", size: 30, origin: "target" } },
  "lightning-bolt": {
    aoe: { shape: "line", size: 100, width: 5, origin: "self" },
    upcastScaling: { "4": { damageRoll: "9d6" }, "5": { damageRoll: "10d6" }, "6": { damageRoll: "11d6" }, "7": { damageRoll: "12d6" }, "8": { damageRoll: "13d6" }, "9": { damageRoll: "14d6" } },
  },
  "mass-healing-word": {
    upcastScaling: { "4": { damageRoll: "2d4" }, "5": { damageRoll: "3d4" }, "6": { damageRoll: "4d4" }, "7": { damageRoll: "5d4" }, "8": { damageRoll: "6d4" }, "9": { damageRoll: "7d4" } },
  },
  "sleet-storm":             { aoe: { shape: "cylinder", size: 40, origin: "target" } },
  "slow":                    { aoe: { shape: "cube", size: 40, origin: "target" } },
  "spirit-guardians": {
    aoe: { shape: "sphere", size: 15, origin: "self" },
    upcastScaling: { "4": { damageRoll: "4d8" }, "5": { damageRoll: "5d8" }, "6": { damageRoll: "6d8" }, "7": { damageRoll: "7d8" }, "8": { damageRoll: "8d8" }, "9": { damageRoll: "9d8" } },
  },
  "stinking-cloud":          { aoe: { shape: "sphere", size: 20, origin: "target" } },
  "plant-growth":            { aoe: { shape: "sphere", size: 100, origin: "target" } },
  "vampiric-touch": {
    upcastScaling: { "4": { damageRoll: "4d6" }, "5": { damageRoll: "5d6" }, "6": { damageRoll: "6d6" }, "7": { damageRoll: "7d6" }, "8": { damageRoll: "8d6" }, "9": { damageRoll: "9d6" } },
  },

  // ── 4th Level ──────────────────────────────────────────────
  "banishment": {
    upcastScaling: { "5": { targetCount: 2 }, "6": { targetCount: 3 }, "7": { targetCount: 4 }, "8": { targetCount: 5 }, "9": { targetCount: 6 } },
  },
  "black-tentacles":         { aoe: { shape: "cube", size: 20, origin: "target" } },
  "blight": {
    upcastScaling: { "5": { damageRoll: "9d8" }, "6": { damageRoll: "10d8" }, "7": { damageRoll: "11d8" }, "8": { damageRoll: "12d8" }, "9": { damageRoll: "13d8" } },
  },
  "confusion":               { aoe: { shape: "sphere", size: 10, origin: "target" } },
  "ice-storm": {
    aoe: { shape: "cylinder", size: 20, origin: "target" },
    upcastScaling: { "5": { damageRoll: "3d8" }, "6": { damageRoll: "4d8" }, "7": { damageRoll: "5d8" }, "8": { damageRoll: "6d8" }, "9": { damageRoll: "7d8" } },  // bludgeoning component scales
  },
  "phantasmal-killer": {
    upcastScaling: { "5": { damageRoll: "5d10" }, "6": { damageRoll: "6d10" }, "7": { damageRoll: "7d10" }, "8": { damageRoll: "8d10" }, "9": { damageRoll: "9d10" } },
  },
  "wall-of-fire": {
    upcastScaling: { "5": { damageRoll: "6d8" }, "6": { damageRoll: "7d8" }, "7": { damageRoll: "8d8" }, "8": { damageRoll: "9d8" }, "9": { damageRoll: "10d8" } },
  },

  // ── 5th Level ──────────────────────────────────────────────
  "arcane-hand": {
    upcastScaling: { "6": { damageRoll: "6d8" }, "7": { damageRoll: "8d8" }, "8": { damageRoll: "10d8" }, "9": { damageRoll: "12d8" } },  // clenched fist +2d8/slot
  },
  "cloudkill": {
    aoe: { shape: "sphere", size: 20, origin: "target" },
    upcastScaling: { "6": { damageRoll: "6d8" }, "7": { damageRoll: "7d8" }, "8": { damageRoll: "8d8" }, "9": { damageRoll: "9d8" } },
  },
  "cone-of-cold": {
    aoe: { shape: "cone", size: 60, origin: "self" },
    upcastScaling: { "6": { damageRoll: "9d8" }, "7": { damageRoll: "10d8" }, "8": { damageRoll: "11d8" }, "9": { damageRoll: "12d8" } },
  },
  "flame-strike": {
    aoe: { shape: "cylinder", size: 10, origin: "target" },
    upcastScaling: { "6": { damageRoll: "5d6" }, "7": { damageRoll: "6d6" }, "8": { damageRoll: "7d6" }, "9": { damageRoll: "8d6" } },  // fire or radiant +1d6/slot
  },
  "hold-monster": {
    upcastScaling: { "6": { targetCount: 2 }, "7": { targetCount: 3 }, "8": { targetCount: 4 }, "9": { targetCount: 5 } },
  },
  "insect-plague": {
    aoe: { shape: "sphere", size: 20, origin: "target" },
    upcastScaling: { "6": { damageRoll: "5d10" }, "7": { damageRoll: "6d10" }, "8": { damageRoll: "7d10" }, "9": { damageRoll: "8d10" } },
  },
  "mass-cure-wounds": {
    upcastScaling: { "6": { damageRoll: "4d8" }, "7": { damageRoll: "5d8" }, "8": { damageRoll: "6d8" }, "9": { damageRoll: "7d8" } },
  },

  // ── 6th Level ──────────────────────────────────────────────
  "blade-barrier":           { aoe: { shape: "line", size: 100, width: 5, origin: "target" } },
  "chain-lightning": {
    aoe: { shape: "sphere", size: 30, origin: "target" },    // bounces to targets within 30 ft
    upcastScaling: { "7": { targetCount: 5 }, "8": { targetCount: 6 }, "9": { targetCount: 7 } },  // +1 secondary target/slot
  },
  "circle-of-death": {
    aoe: { shape: "sphere", size: 60, origin: "target" },
    upcastScaling: { "7": { damageRoll: "10d6" }, "8": { damageRoll: "12d6" }, "9": { damageRoll: "14d6" } },  // +2d6/slot
  },
  "disintegrate": {
    upcastScaling: { "7": { damageRoll: "13d6" }, "8": { damageRoll: "16d6" }, "9": { damageRoll: "19d6" } },  // +3d6/slot
  },
  "freezing-sphere": {
    aoe: { shape: "sphere", size: 60, origin: "target" },
    upcastScaling: { "7": { damageRoll: "11d6" }, "8": { damageRoll: "12d6" }, "9": { damageRoll: "13d6" } },
  },
  "sunbeam":                 { aoe: { shape: "line", size: 60, width: 5, origin: "self" } },
  "wall-of-ice": {
    upcastScaling: { "7": { damageRoll: "12d6" }, "8": { damageRoll: "14d6" }, "9": { damageRoll: "16d6" } },  // +2d6/slot
  },
  "wall-of-thorns": {
    upcastScaling: { "7": { damageRoll: "8d8" }, "8": { damageRoll: "9d8" }, "9": { damageRoll: "10d8" } },
  },

  // ── 7th Level ──────────────────────────────────────────────
  "delayed-blast-fireball": {
    aoe: { shape: "sphere", size: 20, origin: "target" },
    upcastScaling: { "8": { damageRoll: "13d6" }, "9": { damageRoll: "14d6" } },
  },
  "fire-storm":              { aoe: { shape: "cube", size: 10, origin: "target" } },     // ten 10-ft cubes
  "finger-of-death": {
    upcastScaling: { "8": { damageRoll: "8d8" }, "9": { damageRoll: "9d8" } },  // +1d8+30 per slot
  },
  "prismatic-spray":         { aoe: { shape: "cone", size: 60, origin: "self" } },
  "reverse-gravity":         { aoe: { shape: "cylinder", size: 50, origin: "target" } },

  // ── 8th Level ──────────────────────────────────────────────
  "earthquake":              { aoe: { shape: "sphere", size: 100, origin: "target" } },
  "incendiary-cloud":        { aoe: { shape: "sphere", size: 20, origin: "target" } },
  "sunburst":                { aoe: { shape: "sphere", size: 60, origin: "target" } },

  // ── 9th Level ──────────────────────────────────────────────
  "meteor-swarm":            { aoe: { shape: "sphere", size: 40, origin: "target" } },
  "storm-of-vengeance":      { aoe: { shape: "cylinder", size: 360, origin: "target" } },
  "weird":                   { aoe: { shape: "sphere", size: 30, origin: "target" } },
};
