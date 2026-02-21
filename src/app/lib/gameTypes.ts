/**
 * gameTypes.ts
 *
 * Pure types and stateless helper functions for D&D game state.
 * No server imports — safe to import from both client and server components.
 *
 * Server-only logic (Firestore persistence, singleton state) lives in gameState.ts.
 */

// ─── Grid & Combat Types ─────────────────────────────────────────────────────

export interface GridPosition {
  row: number;
  col: number;
}

export interface WeaponRange {
  type: "melee" | "ranged" | "both";  // "both" = thrown weapons
  reach?: number;       // melee reach in feet (default 5)
  shortRange?: number;  // normal range in feet for ranged/thrown
  longRange?: number;   // max range (disadvantage beyond short)
}

export interface SRDWeaponData {
  slug: string;
  name: string;
  category: string;       // "Simple Melee Weapons", "Martial Ranged Weapons", etc.
  damageDice: string;
  damageType: string;
  properties: string[];   // ["reach", "thrown (range 30/120)", "ammunition (range 80/320)"]
  range?: number;         // normal range in feet (0 for melee-only)
  longRange?: number;     // long range in feet (0 for melee-only)
  isSimple?: boolean;     // true for simple weapons, false for martial
}

// ─── Ability Types ───────────────────────────────────────────────────────────

export type SpellAttackType = "ranged" | "melee" | "save" | "auto" | "none";

/** Per-level scaling override for spells (upcast) and cantrips (player level). */
export interface SpellScalingEntry {
  damageRoll?: string;
  targetCount?: number;
}

export interface Ability {
  id: string;                    // "weapon:rapier", "cantrip:fire-bolt", "action:dodge"
  name: string;
  type: "weapon" | "cantrip" | "spell" | "action" | "racial";
  spellLevel?: number;           // 0=cantrip, 1+=leveled (base level for spells)
  attackType?: SpellAttackType;  // how this ability targets
  saveAbility?: string;          // "dexterity" for Sacred Flame etc.
  /** Ability score used to compute save DC (DC = 8 + prof + this mod). e.g. "constitution" for Breath Weapon. */
  saveDCAbility?: string;
  srdRange?: string;             // SRD range string ("120 feet", "Touch", "Self")
  weaponRange?: WeaponRange;     // parsed range for weapons
  requiresTarget: boolean;       // false for Self spells, Dodge, Dash, Disengage
  damageRoll?: string;           // "1d10" — current damage (updated at level-up for cantrips)
  damageType?: string;           // "fire", "piercing"
  /** Number of targets/beams (e.g. Eldritch Blast). Updated at level-up for scaling cantrips. */
  targetCount?: number;
  /** Leveled spells: slot level → scaling overrides. Only breakpoint levels stored. */
  upcastScaling?: Record<string, SpellScalingEntry>;
  /** Racial abilities: character level → scaling overrides (levels 6, 11, 16). */
  racialScaling?: Record<string, SpellScalingEntry>;
  /** How many times this ability can be used per rest (informational). */
  usesPerRest?: number;
  /** Short or long rest recharge (informational). */
  restType?: "short" | "long";
  /** Ability modifier type for weapons (str/dex/finesse/none). */
  weaponStat?: "str" | "dex" | "finesse" | "none";
  /** Flat bonus to attack/damage for weapons (e.g. +1 magic weapon). */
  weaponBonus?: number;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CharacterStats {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface GameplayEffects {
  // ─── Offense ───
  /** Total attacks per Attack action (Extra Attack: 2/3/4). */
  numAttacks?: number;
  /** Flat bonus to attack rolls (Archery style: +2). */
  attackBonus?: number;
  /** Flat melee damage bonus (Rage: +2/+3/+4). */
  meleeDamageBonus?: number;
  /** Extra weapon dice on crits (Brutal Critical: 1/2/3). */
  critBonusDice?: number;
  /** Bonus damage on every hit, e.g. "1d8 radiant" (Improved Divine Smite). */
  bonusDamage?: string;
  /** Number of Sneak Attack dice (Rogue: 1–10). */
  sneakAttackDice?: number;

  // ─── Defense ───
  /** Flat AC bonus (Defense style: +1). */
  acBonus?: number;
  /** Unarmored AC formula ("10 + dex + con" or "10 + dex + wis"). */
  acFormula?: string;
  /** Damage resistances while active (Rage). */
  resistances?: string[];
  /** Conditions/types immune to (disease, poison). */
  immunities?: string[];
  /** DEX save: success=0 damage, fail=half. */
  evasion?: boolean;

  // ─── Movement ───
  /** Walking speed bonus in feet (+10, +15, etc). */
  speedBonus?: number;

  // ─── Saves & Checks ───
  /** Advantage on saves of this type ("dexterity"). */
  saveAdvantage?: string;
  /** Advantage on initiative rolls. */
  initiativeAdvantage?: boolean;
  /** Half proficiency on non-proficient checks. */
  halfProficiency?: boolean;
  /** Minimum d20 on proficient checks (Reliable Talent: 10). */
  minCheckRoll?: number;
  /** Proficiency in additional saves (["wisdom"] or ["all"]). */
  saveProficiencies?: string[];

  // ─── Resources ───
  /** Resource pool name + per-level amount (Ki, Sorcery Points). */
  resourcePool?: { name: string; perLevel: number };
  /** Healing pool HP per level (Lay on Hands: 5). */
  healPoolPerLevel?: number;

  // ─── Proficiency ───
  /** Number of expertise slots gained. */
  expertiseSlots?: number;

  // ─── Stats ───
  /** Permanent stat bonuses (Primal Champion: +4 STR/CON). */
  statBonuses?: Record<string, number>;

  // ─── Usage ───
  /** Uses per rest period. Omit for stat-dependent or unlimited uses. */
  usesPerRest?: number;
  /** Rest type that recharges this feature. */
  restType?: "short" | "long";

  // ─── Dice ───
  /** Die type for the feature's scaling effect (Bardic Inspiration: "d6"→"d12"). */
  dieType?: string;
}

export interface CharacterFeature {
  name: string;
  description?: string;
  level: number;
  source?: string;
  type?: "active" | "passive" | "reaction";
  scalesWithLevel?: boolean;
  scalingFormula?: string;
  /** Player's chosen option for features that require a choice (e.g. Favored Enemy). */
  chosenOption?: string;
  /** Typed mechanical effects for this feature. */
  gameplayEffects?: GameplayEffects;
}

export interface PlayerState {
  name: string;
  gender: string;
  characterClass: string;
  race: string;
  level: number;
  hitDie: number;
  xp: number;
  xpToNextLevel: number;
  currentHP: number;
  maxHP: number;
  armorClass: number;
  stats: CharacterStats;
  savingThrowProficiencies: string[];
  skillProficiencies: string[];
  weaponProficiencies: string[];
  armorProficiencies: string[];
  features: CharacterFeature[];
  inventory: string[];
  conditions: string[];
  gold: number;
  subclass?: string;
  // ─── Movement ───
  speed?: number; // walking speed in feet (default 30)
  // ─── Spellcasting (optional — non-casters carry none of these) ───
  spellcastingAbility?: keyof CharacterStats;
  cantrips?: string[];
  maxCantrips?: number;
  knownSpells?: string[];
  maxKnownSpells?: number;
  spellSlots?: Record<string, number>;
  spellSlotsUsed?: Record<string, number>;
  // ─── Abilities (weapons + cantrips + spells + universal actions) ───
  abilities?: Ability[];
  // ─── Level-up wizard (set when XP crosses a threshold) ───
  pendingLevelUp?: PendingLevelUp;
}

// ─── Level-Up Types ──────────────────────────────────────────────────────────

export interface PendingLevelUp {
  fromLevel: number;
  toLevel: number;
  levels: PendingLevelData[];
}

export interface PendingLevelData {
  level: number;
  hpGain: number;
  proficiencyBonus: number;
  newFeatures: Array<{ name: string; description: string; type?: "active" | "passive" | "reaction"; gameplayEffects?: GameplayEffects }>;
  newSubclassFeatures: Array<{ name: string; description: string }>;
  spellSlots?: Record<string, number>;
  maxCantrips?: number;
  maxKnownSpells?: number;
  isASILevel: boolean;
  requiresSubclass: boolean;
  featureChoices: Array<{ name: string; description: string; options: string[]; picks?: number }>;
  newCantripSlots: number;
  newSpellSlots: number;
  maxNewSpellLevel: number;
}

export interface NPC {
  id: string;
  name: string;
  ac: number;
  currentHp: number;
  maxHp: number;
  attackBonus: number;
  damageDice: string;
  damageBonus: number;
  savingThrowBonus: number;
  xpValue: number;
  disposition: "hostile" | "neutral" | "friendly";
  conditions: string[];
  notes: string;
  speed?: number;  // walking speed in feet (default 30)
}

export interface StoryState {
  campaignTitle: string;
  campaignBackground: string;
  currentLocation: string;
  currentScene: string;
  activeQuests: string[];
  importantNPCs: string[];
  recentEvents: string[];
  /** Firestore ID of the active combat encounter, if any. */
  activeEncounterId?: string;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface GameState {
  player: PlayerState;
  story: StoryState;
  conversationHistory: ConversationTurn[];
}

// ─── Firestore V2 Storage Types ───────────────────────────────────────────────

/** Character document (characters/{id}) — player data only. */
export interface StoredCharacterV2 {
  id?: string;
  player: PlayerState;
  sessionId: string;
  createdAt?: number;
  updatedAt?: number;
}

/** Encounter document (encounters/{id}) — combat-specific state. */
export interface StoredEncounter {
  id?: string;
  sessionId: string;
  characterId: string;
  status: "active" | "completed";
  activeNPCs: NPC[];
  /** Token positions keyed by "player" or NPC id. */
  positions: Record<string, GridPosition>;
  gridSize: number;
  round: number;
  /** Snapshot of location at encounter start (for combat agent narration). */
  location: string;
  /** Snapshot of scene at encounter start (for combat agent narration). */
  scene: string;
  createdAt?: number;
  updatedAt?: number;
}

/** Session document (sessions/{id}) — story + conversation history. */
export interface StoredSession {
  id?: string;
  story: StoryState;
  conversationHistory: ConversationTurn[];
  characterIds: string[];
  createdAt?: number;
  updatedAt?: number;
}

/** Lightweight summary for the character select page. */
export interface CharacterSummary {
  id: string;
  name: string;
  race: string;
  characterClass: string;
  level: number;
  currentHP: number;
  maxHP: number;
  campaignTitle: string;
  updatedAt: number;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** Format a signed modifier for display (e.g. 3 → "+3", -1 → "-1"). */
export function formatModifier(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function getModifier(stat: number): number {
  return Math.floor((stat - 10) / 2);
}

export function getProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

/** Format weapon damage from an Ability for display (e.g. "1d8+3"). */
export function formatAbilityDamage(ability: Ability, stats: CharacterStats): string {
  if (!ability.damageRoll) return "";
  const strMod = getModifier(stats.strength);
  const dexMod = getModifier(stats.dexterity);
  let mod = ability.weaponBonus ?? 0;
  if (ability.weaponStat === "str") mod += strMod;
  else if (ability.weaponStat === "dex") mod += dexMod;
  else if (ability.weaponStat === "finesse") mod += Math.max(strMod, dexMod);
  return mod === 0 ? ability.damageRoll : `${ability.damageRoll}${mod >= 0 ? "+" : ""}${mod}`;
}

/** XP required to reach each level (index 0 = level 1). */
export const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

export function xpForLevel(level: number): number {
  return XP_THRESHOLDS[Math.max(0, level - 1)] ?? 0;
}

/** Title-case a lowercase D&D term for display. Handles hyphens and minor words. */
export function toDisplayCase(s: string): string {
  if (!s) return s;
  const MINOR_WORDS = new Set(["of", "the", "and", "or", "in", "a", "an", "at", "to", "for", "on", "by", "with"]);
  const words = s.split(" ");
  return words
    .map((word, i) => {
      const parts = word.split("-");
      return parts
        .map((part, j) => {
          if (i === 0 && j === 0) return part.charAt(0).toUpperCase() + part.slice(1);
          if (i === words.length - 1 && j === parts.length - 1) return part.charAt(0).toUpperCase() + part.slice(1);
          if (MINOR_WORDS.has(part.toLowerCase())) return part.toLowerCase();
          return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join("-");
    })
    .join(" ");
}

// ─── Shared combat helpers ────────────────────────────────────────────────────

/** Roll a single d20. */
export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

/** Resolve the ability modifier for a weapon's stat type. */
export function getWeaponAbilityMod(
  stat: "str" | "dex" | "finesse" | "none",
  stats: CharacterStats,
): { mod: number; label: string } {
  const strMod = getModifier(stats.strength);
  const dexMod = getModifier(stats.dexterity);
  switch (stat) {
    case "str":
      return { mod: strMod, label: "STR" };
    case "dex":
      return { mod: dexMod, label: "DEX" };
    case "finesse":
      return strMod >= dexMod
        ? { mod: strMod, label: "STR" }
        : { mod: dexMod, label: "DEX" };
    case "none":
      return { mod: 0, label: "NONE" };
  }
}

/** Double the dice count in a standard NdS expression (for critical hits). */
export function doubleDice(expr: string): string {
  const dm = expr.match(/^(\d+)(d\d+)$/i);
  if (dm) return `${parseInt(dm[1]) * 2}${dm[2]}`;
  return expr;
}

// ─── Dice rolling ─────────────────────────────────────────────────────────────

export interface DiceRollResult {
  expression: string;  // "2d6"
  rolls: number[];     // [3, 5]
  total: number;       // 8
}

/**
 * Roll dice from a standard NdS expression (e.g. "2d6", "1d8").
 * Returns individual rolls and the total.
 */
export function rollDice(expression: string): DiceRollResult {
  const match = expression.match(/^(\d+)d(\d+)$/i);
  if (!match) return { expression, rolls: [], total: 0 };
  const count = parseInt(match[1]);
  const sides = parseInt(match[2]);
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1);
  }
  return { expression, rolls, total: rolls.reduce((a, b) => a + b, 0) };
}

// ─── CR → XP table ───────────────────────────────────────────────────────────

/** Standard D&D 5e Challenge Rating to XP mapping. */
const CR_TO_XP: Record<string, number> = {
  "0": 10, "0.125": 25, "0.25": 50, "0.5": 100,
  "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800,
  "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900,
  "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000,
  "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
  "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000,
  "26": 90000, "27": 105000, "28": 120000, "29": 135000, "30": 155000,
};

/** Convert a challenge rating (number or string like "1/4") to XP. */
export function crToXP(cr: number | string): number {
  let num: number;
  if (typeof cr === "string") {
    if (cr.includes("/")) {
      const [a, b] = cr.split("/").map(Number);
      num = b ? a / b : 0;
    } else {
      num = parseFloat(cr);
    }
  } else {
    num = cr;
  }
  return CR_TO_XP[String(num)] ?? 0;
}

// ─── Rules / Roll result types ────────────────────────────────────────────────

export interface DamageBreakdown {
  label: string; // "Shortsword", "Sneak Attack"
  dice: string; // "1d6", "3d6"
  rolls: number[]; // individual die results
  flatBonus: number; // stat mod + magic bonus
  subtotal: number; // rolls total + flatBonus
  damageType?: string; // "piercing"
}

export interface ParsedRollResult {
  checkType: string;
  components: string; // e.g. "DEX +3, Proficiency +3, Expertise +3 = +9"
  dieResult: number;
  totalModifier: string; // e.g. "+9"
  total: number;
  dcOrAc: string;
  success: boolean;
  notes: string;
  /** True when the action is impossible for this character (e.g. spell too high level). */
  impossible?: boolean;
  /** True when the action is purely narrative and no mechanical check is needed. */
  noCheck?: boolean;
  damage?: {
    breakdown: DamageBreakdown[];
    totalDamage: number;
    isCrit: boolean;
  };
}

// ─── Feature choice options ──────────────────────────────────────────────────

/**
 * Shared option data for features that require a player choice.
 * Used at both character creation and level-up time.
 */
export const FEATURE_CHOICE_OPTIONS: Record<string, { options: string[]; picks?: number }> = {
  "fighting style": {
    options: ["Archery", "Defense", "Dueling", "Great Weapon Fighting", "Protection", "Two-Weapon Fighting"],
  },
  "favored enemy": {
    options: ["Aberrations", "Beasts", "Celestials", "Constructs", "Dragons", "Elementals", "Fey", "Fiends", "Giants", "Monstrosities", "Oozes", "Plants", "Undead"],
  },
  "natural explorer": {
    options: ["Arctic", "Coast", "Desert", "Forest", "Grassland", "Mountain", "Swamp"],
  },
  "expertise": {
    options: [
      "Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception",
      "History", "Insight", "Intimidation", "Investigation", "Medicine",
      "Nature", "Perception", "Performance", "Persuasion", "Religion",
      "Sleight of Hand", "Stealth", "Survival", "Thieves' Tools",
    ],
    picks: 2,
  },
};

// ─── UI constants ─────────────────────────────────────────────────────────────

export const OPENING_NARRATIVE = `*Your adventure begins.*

The world stretches before you — full of shadow, wonder, and danger in equal measure. Ancient ruins whisper secrets to those bold enough to listen. Taverns buzz with rumour. Roads fork at crossroads where choices echo for lifetimes.

Describe your first action, and the story will unfold from there.

**What do you do?**`;
