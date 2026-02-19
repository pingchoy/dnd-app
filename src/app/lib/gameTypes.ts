/**
 * gameTypes.ts
 *
 * Pure types and stateless helper functions for D&D game state.
 * No server imports — safe to import from both client and server components.
 *
 * Server-only logic (Firestore persistence, singleton state) lives in gameState.ts.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CharacterStats {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface CharacterFeature {
  name: string;
  description: string;
  level: number;
  source?: string;
  type?: "active" | "passive" | "reaction";
  scalesWithLevel?: boolean;
  scalingFormula?: string;
}

/** Stored separately from a flat string so modifiers stay live as stats change. */
export interface WeaponStat {
  dice: string;
  stat: "str" | "dex" | "finesse" | "none";
  bonus: number;
}

export interface PlayerState {
  name: string;
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
  features: CharacterFeature[];
  inventory: string[];
  conditions: string[];
  gold: number;
  weaponDamage: Record<string, WeaponStat>;
  subclass?: string;
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
}

export interface StoryState {
  campaignTitle: string;
  campaignBackground: string;
  currentLocation: string;
  currentScene: string;
  activeQuests: string[];
  importantNPCs: string[];
  activeNPCs: NPC[];
  recentEvents: string[];
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

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function getModifier(stat: number): number {
  return Math.floor((stat - 10) / 2);
}

export function getProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

export function formatWeaponDamage(weapon: WeaponStat, stats: CharacterStats): string {
  const strMod = getModifier(stats.strength);
  const dexMod = getModifier(stats.dexterity);
  let mod = weapon.bonus;
  if (weapon.stat === "str") mod += strMod;
  else if (weapon.stat === "dex") mod += dexMod;
  else if (weapon.stat === "finesse") mod += Math.max(strMod, dexMod);
  return mod === 0 ? weapon.dice : `${weapon.dice}${mod >= 0 ? "+" : ""}${mod}`;
}

/** XP required to reach each level (index 0 = level 1). */
export const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

export function xpForLevel(level: number): number {
  return XP_THRESHOLDS[Math.max(0, level - 1)] ?? 0;
}

// ─── UI constants ─────────────────────────────────────────────────────────────

export const OPENING_NARRATIVE = `*Your adventure begins.*

The world stretches before you — full of shadow, wonder, and danger in equal measure. Ancient ruins whisper secrets to those bold enough to listen. Taverns buzz with rumour. Roads fork at crossroads where choices echo for lifetimes.

Describe your first action, and the story will unfold from there.

**What do you do?**`;
