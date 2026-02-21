/**
 * srdOverrides.ts
 *
 * Hardcoded SRD mechanical data for all 9 races and 12 classes.
 * Replaces fragile regex parsing of Open5e trait description text.
 *
 * The seed script still fetches narrative text (trait descriptions, lore)
 * from the v2 API — this file provides only the structured mechanical values.
 */

import type { Ability } from "../src/app/lib/gameTypes";

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
        srdRange: "15 feet",
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
