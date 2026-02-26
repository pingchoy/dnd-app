/**
 * gameTypes.ts
 *
 * Pure types and stateless helper functions for D&D game state.
 * No server imports — safe to import from both client and server components.
 *
 * Server-only logic (Firestore persistence, singleton state) lives in gameState.ts.
 */

// ─── Map & Region Types ──────────────────────────────────────────────────────

export type RegionType =
  | "tavern"
  | "shop"
  | "temple"
  | "dungeon"
  | "wilderness"
  | "residential"
  | "street"
  | "guard_post"
  | "danger" // traps, hazards — DM generates tension
  | "safe" // players can long rest here
  | "custom"; // freeform — use dmNote for description

/** Semantic region painted on a map — tells the DM what's at each location. */
export interface MapRegion {
  id: string; // "region_tavern_main"
  name: string; // "The Rusty Flagon — Common Room"
  type: RegionType;
  cells: number[]; // flat cell indices (row * 20 + col) — arbitrary shape
  dmNote?: string; // "Barkeep Mira behind counter. Patrons are tense."
  defaultNPCSlugs?: string[]; // ["guard", "commoner"] — NPCs placed here by default
  shopInventory?: string[]; // for type="shop" — items the DM can reference
}

/**
 * Normalize a region from Firestore — converts legacy `bounds` format to `cells`.
 * Safe to call on regions that already have `cells`.
 */
export function normalizeRegion(r: Record<string, unknown>): MapRegion {
  const region = r as unknown as MapRegion & {
    bounds?: { minRow: number; maxRow: number; minCol: number; maxCol: number };
  };
  if (region.cells && Array.isArray(region.cells))
    return { ...region, cells: region.cells };
  // Convert legacy bounds → cells
  if (region.bounds) {
    const { minRow, maxRow, minCol, maxCol } = region.bounds;
    const cells: number[] = [];
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        cells.push(row * 20 + col);
      }
    }
    const { bounds: _, ...rest } = region;
    return { ...rest, cells } as MapRegion;
  }
  return { ...region, cells: [] } as MapRegion;
}

/** Normalize an array of regions from Firestore (handles missing `cells`). */
export function normalizeRegions(regions: unknown[]): MapRegion[] {
  if (!Array.isArray(regions)) return [];
  return regions.map((r) => normalizeRegion(r as Record<string, unknown>));
}

/** A numbered point of interest on an exploration map — links to a combat map. */
export interface PointOfInterest {
  id: string; // "poi_docks"
  number: number; // display number on the map (1-indexed)
  name: string; // "valdris docks"
  description: string; // "a busy waterfront district"
  position: { x: number; y: number }; // percentage coordinates on the exploration image (0-100)
  combatMapId: string; // Firestore ID of the linked CombatMapDocument
  isHidden: boolean; // hidden POIs are revealed by DM during play
  actNumbers: number[]; // which acts this POI is relevant in
  locationTags: string[]; // patterns for DM agent location matching
  defaultNPCSlugs?: string[]; // NPCs placed here by default
}

/** Shared fields for all map documents — not exported directly. */
interface BaseMapDocument {
  id?: string;
  name: string;
  backgroundImageUrl?: string; // user-uploaded or AI-generated image
  createdAt?: number;
  updatedAt?: number;
}

/** Exploration map — a background image with numbered points of interest. */
export interface ExplorationMapDocument extends BaseMapDocument {
  mapType: "exploration";
  backgroundImageUrl: string; // required for exploration maps (overrides optional base)
  pointsOfInterest: PointOfInterest[];
}

/** Combat (tactical battle grid) map — stored in Firestore `sessions/{sessionId}/maps/{id}`. */
export interface CombatMapDocument extends BaseMapDocument {
  mapType: "combat";
  gridSize: number; // always 20
  feetPerSquare: number; // 5 for detailed, 50-100 for zone
  regions: MapRegion[];
  tileData?: number[]; // flat array [gridSize*gridSize]: 0=floor, 1=wall, 2=door
  parentMapId?: string; // Firestore ID of the parent ExplorationMapDocument
  poiId?: string; // PointOfInterest.id this combat map is linked from
}

/** Discriminated union — narrow on `mapType` to access type-specific fields. */
export type MapDocument = ExplorationMapDocument | CombatMapDocument;

// ─── Grid & Combat Types ─────────────────────────────────────────────────────

export interface GridPosition {
  row: number;
  col: number;
}

export interface AbilityRange {
  type: "melee" | "ranged" | "both" | "self" | "touch"; // "both" = thrown weapons
  reach?: number; // melee/touch reach in feet (default 5)
  shortRange?: number; // normal range in feet for ranged/thrown
  longRange?: number; // max range (disadvantage beyond short)
}
export interface SRDWeaponData {
  slug: string;
  name: string;
  category: string; // "Simple Melee Weapons", "Martial Ranged Weapons", etc.
  damageDice: string;
  damageType: string;
  properties: string[]; // ["reach", "thrown (range 30/120)", "ammunition (range 80/320)"]
  range?: number; // normal range in feet (0 for melee-only)
  longRange?: number; // long range in feet (0 for melee-only)
  isSimple?: boolean; // true for simple weapons, false for martial
}

// ─── Ability Types ───────────────────────────────────────────────────────────

export interface AOEData {
  shape: "cone" | "sphere" | "cube" | "line" | "cylinder";
  size: number; // radius (sphere/cylinder/cube) or length (cone/line) in feet
  width?: number; // for line spells only, in feet (default 5)
  origin: "self" | "target"; // "self" = emanates from caster (Burning Hands), "target" = placed at a point (Fireball)
}

export type SpellAttackType = "ranged" | "melee" | "save" | "auto" | "none";

/** Per-level scaling override for spells (upcast) and cantrips (player level). */
export interface SpellScalingEntry {
  damageRoll?: string;
  targetCount?: number;
}

export interface Ability {
  id: string; // "weapon:rapier", "cantrip:fire-bolt", "action:dodge"
  name: string;
  type: "weapon" | "cantrip" | "spell" | "action" | "racial";
  spellLevel?: number; // 0=cantrip, 1+=leveled (base level for spells)
  attackType?: SpellAttackType; // how this ability targets
  saveAbility?: string; // "dexterity" for Sacred Flame etc.
  /** Ability score used to compute save DC (DC = 8 + prof + this mod). e.g. "constitution" for Breath Weapon. */
  saveDCAbility?: string;
  range?: AbilityRange; // unified parsed range (weapons, spells, cantrips)
  requiresTarget: boolean; // false for Self spells, Dodge, Dash, Disengage
  damageRoll?: string; // "1d10" — current damage (updated at level-up for cantrips)
  damageType?: string; // "fire", "piercing"
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
  /** AOE shape data for area-of-effect spells (absent for single-target). */
  aoe?: AOEData;
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
  /**
   * When this effect is active. Defaults to "always" if omitted.
   * Known conditions: "always", "raging", "unarmored", "concentrating:<spell>",
   * "wielding_shield", "wearing_heavy_armor", "wielding_onehanded",
   * "wielding_twohanded", "first_turn", "wild_shaped".
   */
  condition?: string;

  // ─── Offense ───
  /** Total attacks per Attack action (Extra Attack: 2/3/4). */
  numAttacks?: number;
  /** Flat bonus to melee attack rolls. */
  meleeAttackBonus?: number;
  /** Flat bonus to ranged attack rolls (Archery style: +2). */
  rangedAttackBonus?: number;
  /** Flat bonus to spell attack rolls. */
  spellAttackBonus?: number;
  /** Flat melee damage bonus (Rage: +2/+3/+4). */
  meleeDamageBonus?: number;
  /** Flat ranged damage bonus. */
  rangedDamageBonus?: number;
  /** Extra weapon dice on crits (Brutal Critical: 1/2/3). */
  critBonusDice?: number;
  /** Ability score whose modifier is added to spell damage (Empowered Evocation: "intelligence"). */
  spellDamageBonusAbility?: string;
  /** Minimum d20 roll that scores a critical hit (default 20; Champion: 19, 18). */
  critRange?: number;
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
  /** Bonus HP per class level (Draconic Resilience: 1). Applied during level-up HP calculation. */
  hpPerLevel?: number;

  // ─── Proficiency ───
  /** Proficiency grants from features (e.g. Life Domain heavy armor, Assassin tools). */
  proficiencyGrants?: {
    armor?: string[];
    weapons?: string[];
    skills?: string[];
    tools?: string[];
  };
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
  // ─── Base values (set at creation / level-up, never modified by applyEffects) ───
  baseArmorClass?: number;
  baseSpeed?: number;
  // ─── Active conditions (tracks current character state for effect aggregation) ───
  activeConditions?: string[];
  // ─── Aggregated offense (computed by applyEffects from feature gameplayEffects) ───
  numAttacks?: number; // default 1
  meleeAttackBonus?: number; // default 0
  rangedAttackBonus?: number; // default 0
  spellAttackBonus?: number; // default 0
  meleeDamageBonus?: number; // default 0
  rangedDamageBonus?: number; // default 0
  critBonusDice?: number; // default 0
  critRange?: number; // default 20
  spellDamageBonus?: number; // default 0
  bonusDamage?: string[]; // default []
  // ─── Aggregated defense (computed by applyEffects) ───
  resistances?: string[]; // default []
  immunities?: string[]; // default []
  evasion?: boolean; // default false
  // ─── Aggregated saves & checks (computed by applyEffects) ───
  saveAdvantages?: string[]; // default [] — abilities with save advantage (e.g. "dexterity")
  initiativeAdvantage?: boolean; // default false
  halfProficiency?: boolean; // default false
  minCheckRoll?: number; // default 0
  bonusSaveProficiencies?: string[]; // separate from base savingThrowProficiencies
  // ─── Spellcasting (optional — non-casters carry none of these) ───
  spellcastingAbility?: keyof CharacterStats;
  cantrips?: string[];
  maxCantrips?: number;
  knownSpells?: string[];
  maxKnownSpells?: number;
  preparedSpells?: string[];
  maxPreparedSpells?: number;
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
  newFeatures: Array<{
    name: string;
    description: string;
    type?: "active" | "passive" | "reaction";
    gameplayEffects?: GameplayEffects;
  }>;
  newSubclassFeatures: Array<{
    name: string;
    description: string;
    type?: "active" | "passive" | "reaction";
    gameplayEffects?: GameplayEffects;
  }>;
  spellSlots?: Record<string, number>;
  maxCantrips?: number;
  maxKnownSpells?: number;
  maxPreparedSpells?: number;
  isASILevel: boolean;
  requiresSubclass: boolean;
  featureChoices: Array<{
    name: string;
    description: string;
    options: string[];
    picks?: number;
  }>;
  newCantripSlots: number;
  newSpellSlots: number;
  maxNewSpellLevel: number;
}

export interface NPC {
  id: string;
  name: string;
  /** SRD monster slug (e.g. "guard", "goblin") — used for region-aware placement. */
  slug?: string;
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
  speed?: number; // walking speed in feet (default 30)
  /** Why this companion joined the party — helps the DM know when to dismiss them. */
  companionReason?: string;
}

export interface StoryState {
  campaignTitle: string;
  campaignBackground: string;
  /** Living 2-3 sentence synopsis of the campaign arc, updated by the DM agent. */
  campaignSummary?: string;
  currentLocation: string;
  currentScene: string;
  activeQuests: string[];
  metNPCs: string[];
  /** Permanent major plot beats (boss defeats, betrayals, quest completions). Cap 20. */
  milestones?: string[];
  recentEvents: string[];
  /** Firestore ID of the active combat encounter, if any. */
  activeEncounterId?: string;
  /** Current act number within the campaign (1-indexed). Defaults to 1. */
  currentAct?: number;
  /** Story beat names completed in the current act. Reset on act advance. */
  completedStoryBeats?: string[];
  /** Long-term important events (alliances, secrets, promises). Persisted to session doc. */
  importantEvents?: string[];
}

/** The only campaign currently available. Used as default for all new sessions. */
export const DEFAULT_CAMPAIGN_SLUG = "the-crimson-accord";

// ─── Campaign Map Types ──────────────────────────────────────────────────────

/** Point-of-interest blueprint for a campaign exploration map. */
export interface CampaignPOISpec {
  id: string; // "poi_docks"
  number: number; // display number (1-indexed)
  name: string; // "valdris docks"
  description: string;
  combatMapSpecId: string; // References CampaignCombatMapSpec.id
  isHidden: boolean;
  actNumbers: number[];
  locationTags: string[];
  defaultNPCSlugs?: string[];
  position?: { x: number; y: number }; // percentage coordinates for map editor placement
}

/** Blueprint for an exploration map — a background image with numbered POIs. */
export interface CampaignExplorationMapSpec {
  id: string; // "valdris-city"
  name: string; // "The Free City of Valdris"
  imagePrompt: string; // Copy-pasteable prompt for AI image generation
  pointsOfInterest: CampaignPOISpec[];
}

/** Blueprint for a combat (tactical battle grid) map. */
export interface CampaignCombatMapSpec {
  id: string; // "valdris-docks" — unique within the campaign
  name: string; // "Valdris Docks, Pier 7"
  feetPerSquare: number; // 5 for indoor/dungeon, 50-100 for zone
  imagePrompt: string; // Copy-pasteable prompt for AI image generation
}

/** @deprecated Use CampaignCombatMapSpec instead. Kept for backwards compatibility. */
export type CampaignMapSpec = CampaignCombatMapSpec;

/** Pre-generated map template for a campaign location. */
export interface CampaignMap {
  campaignSlug: string;
  mapSpecId: string; // References CampaignCombatMapSpec.id or CampaignExplorationMapSpec.id
  mapType: "exploration" | "combat";
  name: string;
  imagePrompt?: string; // Copy-pasteable prompt for AI image generation
  // Combat map fields
  gridSize?: number; // 20 (combat maps only)
  feetPerSquare?: number;
  tileData?: number[]; // 400-element flat array (combat maps only)
  regions?: MapRegion[]; // combat maps only
  // Exploration map fields
  pointsOfInterest?: PointOfInterest[]; // exploration maps only
  backgroundImageUrl?: string;
  generatedAt: number;
}

// ─── Campaign Types ──────────────────────────────────────────────────────────

export interface CampaignNPC {
  id: string; // "lysara-thorne"
  name: string; // "Lysara Thorne"
  srdMonsterSlug?: string; // SRD creature slug for combat stats (e.g. "noble")
  role:
    | "patron"
    | "ally"
    | "rival"
    | "villain"
    | "informant"
    | "betrayer"
    | "neutral";
  appearance: string;
  personality: {
    traits: string[];
    ideals: string[];
    bonds: string[];
    flaws: string[];
  };
  motivations: string[];
  secrets: string[];
  betrayalTrigger?: string;
  relationshipArc: {
    act1: string;
    act2: string;
    act3: string;
  };
  combatStats?: {
    ac: number;
    hp: number;
    attackBonus: number;
    damageDice: string;
    damageBonus: number;
    xpValue: number;
    specialAbilities?: string;
  };
  dmNotes: string;
  voiceNotes?: string;
}

export interface Campaign {
  slug: string; // "the-crimson-accord"
  title: string; // "The Crimson Accord"
  playerTeaser: string; // Spoiler-free hook
  theme: string; // "political intrigue"
  suggestedLevel: { min: number; max: number };
  estimatedDurationHours: number;
  actSlugs: string[]; // ["the-crimson-accord_act-1", ...]
  dmSummary: string; // Spoiler-free theme/tone/setting for DM injection (~50 tokens)
  /** @deprecated Use explorationMapSpecs + combatMapSpecs instead. */
  mapSpecs?: CampaignMapSpec[]; // Legacy: flat list of combat map blueprints
  explorationMapSpecs?: CampaignExplorationMapSpec[];
  combatMapSpecs?: CampaignCombatMapSpec[];
}

export interface CampaignEnemy {
  srdMonsterSlug: string; // "bandit", "thug", "guard"
  count: number;
  notes?: string;
}

export interface StoryBeat {
  name: string; // "Smuggler Warehouse Raid"
  description: string;
  type: "combat" | "social" | "exploration" | "puzzle" | "boss";
  difficulty: "easy" | "medium" | "hard" | "deadly";
  enemies?: CampaignEnemy[];
  npcInvolvement?: string[]; // CampaignNPC ids involved
  location: string;
  mapSpecId?: string; // References CampaignMapSpec.id
  rewards?: {
    xp?: number;
    gold?: number;
    items?: string[];
  };
  dmGuidance?: string;
  completionTrigger: string; // "All smugglers defeated" or "Lysara recommends visiting the watch house"
}

export interface CampaignAct {
  campaignSlug: string; // "the-crimson-accord"
  actNumber: number; // 1, 2, or 3
  title: string; // "Shadows in the Market"
  summary: string; // Player-facing act summary
  suggestedLevel: { min: number; max: number };
  setting: string; // Primary location description
  mysteries: string[]; // Open questions the party investigates — no answers (answers live in NPCs/storyBeats)
  storyBeats: StoryBeat[];
  relevantNPCIds: string[];
  transitionToNextAct?: string;
  dmBriefing: string; // Compact DM briefing for injection (~500 tokens)
  /** Exploration map spec to activate when this act begins. */
  explorationMapSpecId?: string;
  /** POI where the party starts when this act begins. */
  startingPOIId?: string;
  /** Standalone NPC data for this act — only contains what the DM should know at this point in the story. */
  npcs?: CampaignNPC[];
  /** Act-specific adventure hooks for drawing the party into this act's story. */
  hooks?: string[];
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface GameState {
  player: PlayerState;
  story: StoryState;
}

// ─── Combat Victory Types ────────────────────────────────────────────────────

export interface CombatStats {
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
  criticalHits: number;
  attacksMade: number;
  attacksHit: number;
  spellsCast: number;
  abilitiesUsed: string[];
  killCount: number;
  npcsDefeated: string[];
}

export function emptyCombatStats(): CombatStats {
  return {
    damageDealt: 0,
    damageTaken: 0,
    healingDone: 0,
    criticalHits: 0,
    attacksMade: 0,
    attacksHit: 0,
    spellsCast: 0,
    abilitiesUsed: [],
    killCount: 0,
    npcsDefeated: [],
  };
}

export interface VictoryLootItem {
  name: string;
  description?: string;
  weapon?: { dice: string; stat: string; bonus: number; damageType?: string };
}

export interface VictoryData {
  totalXP: number;
  combatStats: Record<string, CombatStats>;
  loot: VictoryLootItem[];
  goldAwarded: number;
  defeatedNPCs: string[];
  rounds: number;
  narrative: string;
  tokensUsed: number;
  estimatedCostUsd: number;
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
  /** All player characters participating in this encounter. */
  characterIds: string[];
  /** Map this encounter takes place on (inherits from session's activeMapId). */
  mapId?: string;
  status: "active" | "completed";
  activeNPCs: NPC[];
  /** Token positions keyed by "player" or NPC id. */
  positions: Record<string, GridPosition>;
  gridSize: number;
  round: number;
  /** Turn order: ["player", npcId1, npcId2, ...]. Player always first. */
  turnOrder: string[];
  /** Index into turnOrder for whose turn it is (0 = player). */
  currentTurnIndex: number;
  /** Snapshot of location at encounter start (for combat agent narration). */
  location: string;
  /** Snapshot of scene at encounter start (for combat agent narration). */
  scene: string;
  /** Per-player combat stats accumulated during the encounter. */
  combatStats?: Record<string, CombatStats>;
  /** Snapshot of NPCs before removal (for loot context). */
  defeatedNPCs?: NPC[];
  /** Cumulative XP earned in this encounter. Flushed to all players when combat ends. */
  totalXPAwarded?: number;
  /** Most recent NPC attack result — written after each NPC turn for real-time label display. */
  lastNpcResult?: {
    npcId: string;
    /** Who was attacked — "player" or an NPC id. */
    targetId: string;
    hit: boolean;
    damage: number;
    timestamp: number;
    /** Grid position the NPC moved from (if movement occurred this turn). */
    movedFrom?: GridPosition;
    /** Grid position the NPC moved to (if movement occurred this turn). */
    movedTo?: GridPosition;
  };
  /** Populated when combat ends — consumed by the frontend victory screen. */
  victoryData?: VictoryData;
  createdAt?: number;
  updatedAt?: number;
}

/** A non-campaign NPC that emerged during play and is worth remembering. */
export interface SupportingNPC {
  id: string;
  name: string;
  role: "ally" | "rival" | "neutral" | "informant" | "merchant" | "quest_giver";
  appearance: string;
  personality: string;
  motivations: string[];
  location: string;
  notes: string;
  combatSlug?: string;
  /** Links to NPC.id in session companions[] when this story NPC is also a combat companion. */
  companionNpcId?: string;
  /** Tracks fate of the NPC across the session. Defaults to "active". */
  status?: "active" | "dead" | "departed";
}

/** Session document (sessions/{id}) — story + conversation history. */
export interface StoredSession {
  id?: string;
  story: StoryState;
  /** Campaign this session is running (e.g. "the-crimson-accord"). */
  campaignSlug?: string;
  characterIds: string[];
  /** Firestore ID of the currently active exploration map. */
  currentExplorationMapId?: string;
  /** Currently active PointOfInterest.id within the exploration map. Null when on world map. */
  currentPOIId?: string | null;
  /** @deprecated Use currentExplorationMapId / currentPOIId instead. Which combat map is currently displayed. */
  activeMapId?: string;
  /** @deprecated Exploration-mode token positions keyed by "player" or characterId. */
  explorationPositions?: Record<string, GridPosition>;
  /** Important events worth remembering long-term (alliances, secrets, promises). */
  importantEvents?: string[];
  /** Non-campaign NPCs that emerged during play. */
  supportingNPCs?: SupportingNPC[];
  /** Persistent friendly NPC companions that survive between encounters. */
  companions?: NPC[];
  createdAt?: number;
  updatedAt?: number;
}

// ─── Messages Subcollection Types ────────────────────────────────────────────

/** Individual message document (sessions/{sessionId}/messages/{messageId}). */
export interface StoredMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  characterId?: string;
  timestamp: number;
  rollResult?: ParsedRollResult;
  aoeResult?: AOEResultData;
}

/** AOE result stored in messages — mirrors AOEResult from combatResolver. */
export interface AOEResultData {
  checkType: string;
  spellDC: number;
  damageRoll: string;
  damageRolls?: number[];
  totalRolled: number;
  damageType: string;
  targets: Array<{
    npcId: string;
    npcName: string;
    saved: boolean;
    saveRoll: number;
    saveTotal: number;
    damageTaken: number;
  }>;
  affectedCells: GridPosition[];
}

// ─── Action Queue Types ──────────────────────────────────────────────────────

/** Action document (sessions/{sessionId}/actions/{actionId}). */
export interface StoredAction {
  id?: string;
  characterId: string;
  type: "chat" | "roll" | "combat_action" | "combat_resolve";
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: number;
  processedAt?: number;
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
export function formatAbilityDamage(
  ability: Ability,
  stats: CharacterStats,
): string {
  if (!ability.damageRoll) return "";
  const strMod = getModifier(stats.strength);
  const dexMod = getModifier(stats.dexterity);
  let mod = ability.weaponBonus ?? 0;
  if (ability.weaponStat === "str") mod += strMod;
  else if (ability.weaponStat === "dex") mod += dexMod;
  else if (ability.weaponStat === "finesse") mod += Math.max(strMod, dexMod);
  return mod === 0
    ? ability.damageRoll
    : `${ability.damageRoll}${mod >= 0 ? "+" : ""}${mod}`;
}

/** XP required to reach each level (index 0 = level 1). */
export const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000,
  120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

export function xpForLevel(level: number): number {
  return XP_THRESHOLDS[Math.max(0, level - 1)] ?? 0;
}

/** Racial traits already surfaced as discrete stats — fully hidden from all trait lists. */
export const HIDDEN_RACIAL_TRAITS = new Set([
  "ability score increase",
  "speed",
]);

/** Racial traits that are lore/flavour — hidden from the main trait list, shown in a dedicated lore section. */
export const LORE_RACIAL_TRAITS = new Set([
  "age",
  "alignment",
  "size",
  "languages",
]);

/** Title-case a lowercase D&D term for display. Handles hyphens and minor words. */
export function toDisplayCase(s: string): string {
  if (!s) return s;
  const MINOR_WORDS = new Set([
    "of",
    "the",
    "and",
    "or",
    "in",
    "a",
    "an",
    "at",
    "to",
    "for",
    "on",
    "by",
    "with",
  ]);
  const words = s.split(" ");
  return words
    .map((word, i) => {
      const parts = word.split("-");
      return parts
        .map((part, j) => {
          if (i === 0 && j === 0)
            return part.charAt(0).toUpperCase() + part.slice(1);
          if (i === words.length - 1 && j === parts.length - 1)
            return part.charAt(0).toUpperCase() + part.slice(1);
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
  expression: string; // "2d6"
  rolls: number[]; // [3, 5]
  total: number; // 8
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
  "0": 10,
  "0.125": 25,
  "0.25": 50,
  "0.5": 100,
  "1": 200,
  "2": 450,
  "3": 700,
  "4": 1100,
  "5": 1800,
  "6": 2300,
  "7": 2900,
  "8": 3900,
  "9": 5000,
  "10": 5900,
  "11": 7200,
  "12": 8400,
  "13": 10000,
  "14": 11500,
  "15": 13000,
  "16": 15000,
  "17": 18000,
  "18": 20000,
  "19": 22000,
  "20": 25000,
  "21": 33000,
  "22": 41000,
  "23": 50000,
  "24": 62000,
  "25": 75000,
  "26": 90000,
  "27": 105000,
  "28": 120000,
  "29": 135000,
  "30": 155000,
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

// ─── Effect Aggregation ─────────────────────────────────────────────────────

/**
 * Parse an acFormula like "10 + dex + con" into a computed AC value.
 * Recognizes ability abbreviations (str, dex, con, int, wis, cha).
 */
function computeACFromFormula(formula: string, stats: CharacterStats): number {
  const abilityMap: Record<string, keyof CharacterStats> = {
    str: "strength",
    dex: "dexterity",
    con: "constitution",
    int: "intelligence",
    wis: "wisdom",
    cha: "charisma",
  };
  const parts = formula.split("+").map((p) => p.trim().toLowerCase());
  let ac = 0;
  for (const part of parts) {
    const num = parseInt(part);
    if (!isNaN(num)) {
      ac += num;
    } else if (abilityMap[part]) {
      ac += getModifier(stats[abilityMap[part]]);
    }
  }
  return ac;
}

/**
 * Aggregate gameplayEffects from all active features onto PlayerState.
 *
 * Pure function — mutates only the derived/aggregated fields on `player`.
 * Runs at the start of each request after loading from Firestore.
 *
 * Merge rules:
 *  - numAttacks: Math.max (doesn't stack)
 *  - Bonuses (attack, damage, AC, speed): sum
 *  - Lists (resistances, immunities, saveProficiencies): concat + dedupe
 *  - Booleans (evasion, initiativeAdvantage, halfProficiency): OR
 *  - acFormula: last-wins (only one AC calculation formula)
 *  - minCheckRoll: Math.max
 */
export function applyEffects(player: PlayerState): void {
  const baseAC = player.baseArmorClass ?? player.armorClass;
  const baseSpd = player.baseSpeed ?? player.speed ?? 30;

  // Reset derived fields to base/default values
  player.armorClass = baseAC;
  player.speed = baseSpd;
  player.numAttacks = 1;
  player.meleeAttackBonus = 0;
  player.rangedAttackBonus = 0;
  player.spellAttackBonus = 0;
  player.meleeDamageBonus = 0;
  player.rangedDamageBonus = 0;
  player.critBonusDice = 0;
  player.critRange = 20;
  player.spellDamageBonus = 0;
  player.bonusDamage = [];
  player.resistances = [];
  player.immunities = [];
  player.evasion = false;
  player.saveAdvantages = [];
  player.initiativeAdvantage = false;
  player.halfProficiency = false;
  player.minCheckRoll = 0;
  player.bonusSaveProficiencies = [];

  const conditions = player.activeConditions ?? [];
  let acFormula: string | undefined;
  let acBonus = 0;
  let speedBonus = 0;

  for (const feature of player.features) {
    const fx = feature.gameplayEffects;
    if (!fx) continue;

    const cond = fx.condition ?? "always";
    if (cond !== "always" && !conditions.includes(cond)) continue;

    // Offense
    if (fx.numAttacks != null)
      player.numAttacks = Math.max(player.numAttacks!, fx.numAttacks);
    if (fx.meleeAttackBonus) player.meleeAttackBonus! += fx.meleeAttackBonus;
    if (fx.rangedAttackBonus) player.rangedAttackBonus! += fx.rangedAttackBonus;
    if (fx.spellAttackBonus) player.spellAttackBonus! += fx.spellAttackBonus;
    if (fx.meleeDamageBonus) player.meleeDamageBonus! += fx.meleeDamageBonus;
    if (fx.rangedDamageBonus) player.rangedDamageBonus! += fx.rangedDamageBonus;
    if (fx.critBonusDice) player.critBonusDice! += fx.critBonusDice;
    if (fx.critRange != null)
      player.critRange = Math.min(player.critRange!, fx.critRange);
    if (fx.bonusDamage) player.bonusDamage!.push(fx.bonusDamage);
    if (fx.spellDamageBonusAbility) {
      const abilityMap: Record<string, keyof CharacterStats> = {
        strength: "strength",
        dexterity: "dexterity",
        constitution: "constitution",
        intelligence: "intelligence",
        wisdom: "wisdom",
        charisma: "charisma",
      };
      const stat = abilityMap[fx.spellDamageBonusAbility];
      if (stat) player.spellDamageBonus! += getModifier(player.stats[stat]);
    }

    // Defense
    if (fx.acBonus) acBonus += fx.acBonus;
    if (fx.acFormula) acFormula = fx.acFormula; // last-wins
    if (fx.resistances?.length) {
      for (const r of fx.resistances) {
        if (!player.resistances!.includes(r)) player.resistances!.push(r);
      }
    }
    if (fx.immunities?.length) {
      for (const im of fx.immunities) {
        if (!player.immunities!.includes(im)) player.immunities!.push(im);
      }
    }
    if (fx.evasion) player.evasion = true;

    // Movement
    if (fx.speedBonus) speedBonus += fx.speedBonus;

    // Saves & Checks
    if (fx.saveAdvantage) {
      if (!player.saveAdvantages!.includes(fx.saveAdvantage)) {
        player.saveAdvantages!.push(fx.saveAdvantage);
      }
    }
    if (fx.initiativeAdvantage) player.initiativeAdvantage = true;
    if (fx.halfProficiency) player.halfProficiency = true;
    if (fx.minCheckRoll != null)
      player.minCheckRoll = Math.max(player.minCheckRoll!, fx.minCheckRoll);
    if (fx.saveProficiencies?.length) {
      for (const sp of fx.saveProficiencies) {
        if (!player.bonusSaveProficiencies!.includes(sp))
          player.bonusSaveProficiencies!.push(sp);
      }
    }

    // Proficiency grants
    if (fx.proficiencyGrants) {
      if (fx.proficiencyGrants.armor) {
        for (const a of fx.proficiencyGrants.armor) {
          if (!player.armorProficiencies.includes(a))
            player.armorProficiencies.push(a);
        }
      }
      if (fx.proficiencyGrants.weapons) {
        for (const w of fx.proficiencyGrants.weapons) {
          if (!player.weaponProficiencies.includes(w))
            player.weaponProficiencies.push(w);
        }
      }
      if (fx.proficiencyGrants.skills) {
        for (const s of fx.proficiencyGrants.skills) {
          if (!player.skillProficiencies.includes(s))
            player.skillProficiencies.push(s);
        }
      }
    }
  }

  // Apply AC: formula overrides base, then add flat bonuses
  if (acFormula) {
    player.armorClass = computeACFromFormula(acFormula, player.stats) + acBonus;
  } else {
    player.armorClass = baseAC + acBonus;
  }

  // Apply speed bonus
  player.speed = baseSpd + speedBonus;
}

// ─── Feature choice options ──────────────────────────────────────────────────

/**
 * Gameplay effects for each fighting style choice.
 * Applied to the "fighting style" feature's gameplayEffects when the player picks one.
 * Used at character creation and by applyEffects() aggregation.
 */
export const FIGHTING_STYLE_EFFECTS: Record<string, GameplayEffects> = {
  archery: { rangedAttackBonus: 2 },
  defense: { acBonus: 1 },
  dueling: { condition: "wielding_onehanded", meleeDamageBonus: 2 },
  "great weapon fighting": { condition: "wielding_twohanded" },
  protection: { condition: "wielding_shield" },
  "two-weapon fighting": {},
};

/**
 * Shared option data for features that require a player choice.
 * Used at both character creation and level-up time.
 */
export const FEATURE_CHOICE_OPTIONS: Record<
  string,
  { options: string[]; picks?: number }
> = {
  "fighting style": {
    options: [
      "Archery",
      "Defense",
      "Dueling",
      "Great Weapon Fighting",
      "Protection",
      "Two-Weapon Fighting",
    ],
  },
  "favored enemy": {
    options: [
      "Aberrations",
      "Beasts",
      "Celestials",
      "Constructs",
      "Dragons",
      "Elementals",
      "Fey",
      "Fiends",
      "Giants",
      "Monstrosities",
      "Oozes",
      "Plants",
      "Undead",
    ],
  },
  "natural explorer": {
    options: [
      "Arctic",
      "Coast",
      "Desert",
      "Forest",
      "Grassland",
      "Mountain",
      "Swamp",
    ],
  },
  expertise: {
    options: [
      "Acrobatics",
      "Animal Handling",
      "Arcana",
      "Athletics",
      "Deception",
      "History",
      "Insight",
      "Intimidation",
      "Investigation",
      "Medicine",
      "Nature",
      "Perception",
      "Performance",
      "Persuasion",
      "Religion",
      "Sleight of Hand",
      "Stealth",
      "Survival",
      "Thieves' Tools",
    ],
    picks: 2,
  },
};
