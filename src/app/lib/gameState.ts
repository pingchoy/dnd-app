/**
 * Game state — types, singleton, helpers, and Firestore persistence.
 *
 * The in-memory singleton is used within a single request.  Firestore
 * is the durable store: loadGameState() hydrates the singleton at the
 * start of each request; applyStateChangesAndPersist() flushes it at
 * the end.
 *
 * activeNPCs are ephemeral (per-session only) and are never persisted.
 */

import {
  getSRDClassLevel,
  loadCharacter,
  saveCharacterState,
} from "./characterStore";

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
  level: number;        // level at which the feature was gained
  scalesWithLevel?: boolean;
  scalingFormula?: string; // e.g. "ceil(level/2)" — stored for display only
}

export interface PlayerState {
  name: string;
  characterClass: string;
  race: string;
  level: number;
  hitDie: number;       // class hit die (d6=6, d8=8, d10=10, d12=12)
  xp: number;
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
}

/**
 * A single NPC or monster in the current scene.
 * Created either at startup (pre-defined) or on the fly by the DM's
 * create_npc tool call when introducing a new creature mid-session.
 */
export interface NPC {
  id: string;
  name: string;
  ac: number;
  currentHp: number;
  maxHp: number;
  attackBonus: number;    // added to d20 for attack rolls
  damageDice: string;     // e.g. "1d6", "2d4"
  damageBonus: number;    // flat bonus on damage rolls
  savingThrowBonus: number;
  disposition: "hostile" | "neutral" | "friendly";
  conditions: string[];
  notes: string;          // special abilities, lore, etc.
}

export interface StoryState {
  campaignTitle: string;
  campaignBackground: string;
  currentLocation: string;
  currentScene: string;
  activeQuests: string[];
  importantNPCs: string[];   // narrative list (names + roles)
  activeNPCs: NPC[];         // stat-tracked creatures currently in the scene
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getModifier(stat: number): number {
  return Math.floor((stat - 10) / 2);
}

export function getProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

function fmt(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/** Compact single-string summary of the player for injection into prompts. */
export function serializePlayerState(p: PlayerState): string {
  const m = p.stats;
  return [
    `${p.name} | ${p.race} ${p.characterClass} Lv${p.level}`,
    `HP ${p.currentHP}/${p.maxHP} | AC ${p.armorClass}`,
    `STR ${m.strength}(${fmt(getModifier(m.strength))}) DEX ${m.dexterity}(${fmt(getModifier(m.dexterity))}) CON ${m.constitution}(${fmt(getModifier(m.constitution))}) INT ${m.intelligence}(${fmt(getModifier(m.intelligence))}) WIS ${m.wisdom}(${fmt(getModifier(m.wisdom))}) CHA ${m.charisma}(${fmt(getModifier(m.charisma))})`,
    `Proficiency bonus: ${fmt(getProficiencyBonus(p.level))}`,
    `Saving throws: ${p.savingThrowProficiencies.join(", ")}`,
    `Skills (proficient): ${p.skillProficiencies.join(", ")}`,
    `Inventory: ${p.inventory.join(", ")}`,
    `Conditions: ${p.conditions.length ? p.conditions.join(", ") : "None"}`,
    `Gold: ${p.gold}gp`,
  ].join("\n");
}

/** Compact summary of active NPCs for injection into prompts. */
export function serializeActiveNPCs(npcs: NPC[]): string {
  if (npcs.length === 0) return "";
  return (
    "Active combatants:\n" +
    npcs
      .map(
        (n) =>
          `  ${n.name}: AC ${n.ac}, HP ${n.currentHp}/${n.maxHp}, ATK ${fmt(n.attackBonus)} (${n.damageDice}${n.damageBonus ? fmt(n.damageBonus) : ""}) [${n.disposition}]${n.conditions.length ? ` — ${n.conditions.join(", ")}` : ""}${n.notes ? ` — ${n.notes}` : ""}`,
      )
      .join("\n")
  );
}

/** Compact summary of the story state for prompt injection. */
export function serializeStoryState(s: StoryState): string {
  const npcSection = serializeActiveNPCs(s.activeNPCs);
  return [
    `Campaign: ${s.campaignTitle}`,
    `Location: ${s.currentLocation}`,
    `Scene: ${s.currentScene}`,
    `Quests: ${s.activeQuests.join("; ")}`,
    `Notable NPCs: ${s.importantNPCs.join(", ")}`,
    npcSection,
    s.recentEvents.length
      ? `Recent: ${s.recentEvents.slice(-3).join(" | ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Opening narrative ────────────────────────────────────────────────────────

/**
 * Generic opening message shown in the chat UI for brand-new characters
 * (i.e. those with no conversation history yet).
 * The DM will establish the actual scene in the first response.
 */
export const OPENING_NARRATIVE = `*Your adventure begins.*

The world stretches before you — full of shadow, wonder, and danger in equal measure. Ancient ruins whisper secrets to those bold enough to listen. Taverns buzz with rumour. Roads fork at crossroads where choices echo for lifetimes.

Describe your first action, and the story will unfold from there.

**What do you do?**`;

// ─── Singleton state ──────────────────────────────────────────────────────────

/**
 * In-memory game state for the current request.
 * Always initialised by loadGameState() before use — the placeholder below
 * is never read in normal operation.
 */
let state: GameState = {
  player: {
    name: "",
    characterClass: "",
    race: "",
    level: 1,
    hitDie: 8,
    xp: 0,
    currentHP: 0,
    maxHP: 0,
    armorClass: 10,
    stats: { strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 8 },
    savingThrowProficiencies: [],
    skillProficiencies: [],
    features: [],
    inventory: [],
    conditions: [],
    gold: 0,
  },
  story: {
    campaignTitle: "",
    campaignBackground: "",
    currentLocation: "",
    currentScene: "",
    activeQuests: [],
    importantNPCs: [],
    activeNPCs: [],
    recentEvents: [],
  },
  conversationHistory: [],
};

// ─── Getters / Setters ────────────────────────────────────────────────────────

export function getGameState(): GameState {
  return state;
}

export function addConversationTurn(
  role: "user" | "assistant",
  content: string,
  historyWindow: number,
): void {
  state.conversationHistory.push({ role, content, timestamp: Date.now() });
  if (state.conversationHistory.length > historyWindow * 2) {
    state.conversationHistory = state.conversationHistory.slice(-historyWindow * 2);
  }
}

// ─── Player state changes ─────────────────────────────────────────────────────

export interface StateChanges {
  hp_delta?: number;
  items_gained?: string[];
  items_lost?: string[];
  conditions_added?: string[];
  conditions_removed?: string[];
  location_changed?: string;
  scene_update?: string;
  notable_event?: string;
  gold_delta?: number;
  xp_gained?: number;
}

export function applyStateChanges(changes: StateChanges): void {
  const p = state.player;
  const s = state.story;

  if (changes.hp_delta) {
    p.currentHP = Math.max(0, Math.min(p.maxHP, p.currentHP + changes.hp_delta));
  }
  if (changes.items_gained?.length) {
    p.inventory.push(...changes.items_gained);
  }
  if (changes.items_lost?.length) {
    for (const item of changes.items_lost) {
      const idx = p.inventory.findIndex((i) =>
        i.toLowerCase().includes(item.toLowerCase()),
      );
      if (idx !== -1) p.inventory.splice(idx, 1);
    }
  }
  if (changes.conditions_added?.length) {
    for (const c of changes.conditions_added) {
      if (!p.conditions.includes(c)) p.conditions.push(c);
    }
  }
  if (changes.conditions_removed?.length) {
    p.conditions = p.conditions.filter(
      (c) => !changes.conditions_removed!.some((r) => r.toLowerCase() === c.toLowerCase()),
    );
  }
  if (changes.location_changed) s.currentLocation = changes.location_changed;
  if (changes.scene_update) s.currentScene = changes.scene_update;
  if (changes.notable_event) {
    s.recentEvents.push(changes.notable_event);
    if (s.recentEvents.length > 10) s.recentEvents = s.recentEvents.slice(-10);
  }
  if (changes.gold_delta) p.gold = Math.max(0, p.gold + changes.gold_delta);
  if (changes.xp_gained && changes.xp_gained > 0) p.xp = (p.xp ?? 0) + changes.xp_gained;
}

// ─── NPC management ───────────────────────────────────────────────────────────

export interface CreateNPCInput {
  name: string;
  ac: number;
  max_hp: number;
  attack_bonus: number;
  damage_dice: string;
  damage_bonus: number;
  saving_throw_bonus: number;
  disposition: "hostile" | "neutral" | "friendly";
  notes: string;
}

export function createNPC(input: CreateNPCInput): NPC {
  const npc: NPC = {
    id: `${input.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
    name: input.name,
    ac: input.ac,
    currentHp: input.max_hp,
    maxHp: input.max_hp,
    attackBonus: input.attack_bonus,
    damageDice: input.damage_dice,
    damageBonus: input.damage_bonus,
    savingThrowBonus: input.saving_throw_bonus,
    disposition: input.disposition,
    conditions: [],
    notes: input.notes ?? "",
  };
  state.story.activeNPCs.push(npc);
  return npc;
}

export interface UpdateNPCInput {
  name: string;
  hp_delta?: number;
  conditions_added?: string[];
  conditions_removed?: string[];
  remove_from_scene?: boolean;
}

export function updateNPC(input: UpdateNPCInput): void {
  const npc = state.story.activeNPCs.find(
    (n) => n.name.toLowerCase() === input.name.toLowerCase(),
  );
  if (!npc) return;

  if (input.hp_delta) {
    npc.currentHp = Math.max(0, Math.min(npc.maxHp, npc.currentHp + input.hp_delta));
  }
  if (input.conditions_added?.length) {
    for (const c of input.conditions_added) {
      if (!npc.conditions.includes(c)) npc.conditions.push(c);
    }
  }
  if (input.conditions_removed?.length) {
    npc.conditions = npc.conditions.filter(
      (c) => !input.conditions_removed!.some((r) => r.toLowerCase() === c.toLowerCase()),
    );
  }
  if (input.remove_from_scene) {
    state.story.activeNPCs = state.story.activeNPCs.filter((n) => n.id !== npc.id);
  }
}

// ─── XP / Level-up ────────────────────────────────────────────────────────────

/** XP required to reach each level (index 0 = level 1, index 19 = level 20). */
export const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

export function xpForLevel(level: number): number {
  return XP_THRESHOLDS[Math.max(0, level - 1)] ?? 0;
}

function levelForXP(xp: number): number {
  let level = 1;
  for (let i = 1; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return Math.min(level, 20);
}

// ─── Firestore-backed async functions ─────────────────────────────────────────

/**
 * Load a character from Firestore and hydrate the in-memory singleton.
 * activeNPCs are ephemeral and always start empty.
 */
export async function loadGameState(characterId: string): Promise<GameState> {
  const stored = await loadCharacter(characterId);
  if (!stored) throw new Error(`Character "${characterId}" not found in Firestore`);

  state = {
    player: stored.player,
    story: {
      ...stored.story,
      activeNPCs: [], // ephemeral — never persisted
    },
    conversationHistory: stored.conversationHistory,
  };

  return state;
}

/** Persist current in-memory state to Firestore (strips ephemeral activeNPCs). */
async function persistState(characterId: string): Promise<void> {
  await saveCharacterState(characterId, {
    player: state.player,
    story: {
      ...state.story,
      activeNPCs: [],
    },
    // Keep last 40 conversation entries (20 user+assistant pairs)
    conversationHistory: state.conversationHistory.slice(-40),
  });
}

/**
 * Apply state changes to the in-memory singleton and persist to Firestore.
 * Also triggers awardXPAsync if xp_gained is set and a level-up occurs.
 */
export async function applyStateChangesAndPersist(
  changes: StateChanges,
  characterId: string,
): Promise<void> {
  applyStateChanges(changes);

  if (changes.xp_gained && changes.xp_gained > 0) {
    await awardXPAsync(characterId, 0); // XP already added by applyStateChanges; check level-up
  }

  await persistState(characterId);
}

/**
 * Award XP to the player and handle level-up if a threshold is crossed.
 * Fetches new features from srdClassLevels in Firestore (class-agnostic).
 * HP gain = floor(hitDie / 2) + 1 + CON modifier.
 *
 * @param characterId  Firestore character document ID
 * @param amount       XP to award (0 = just check if current xp triggers level-up)
 */
export async function awardXPAsync(characterId: string, amount: number): Promise<void> {
  if (amount > 0) state.player.xp = (state.player.xp ?? 0) + amount;

  const currentLevel = state.player.level;
  const targetLevel = levelForXP(state.player.xp);

  if (targetLevel <= currentLevel) return; // no level-up needed

  for (let lvl = currentLevel + 1; lvl <= targetLevel; lvl++) {
    const classSlug = state.player.characterClass.toLowerCase();
    const levelData = await getSRDClassLevel(classSlug, lvl);

    // Class-agnostic HP: floor(hitDie/2) + 1 + CON modifier
    const conMod = getModifier(state.player.stats.constitution);
    const hpGain = Math.floor(state.player.hitDie / 2) + 1 + conMod;
    state.player.maxHP += hpGain;
    state.player.currentHP = Math.min(state.player.currentHP + hpGain, state.player.maxHP);

    // Append new features from Firestore (deduplicate by name)
    for (const feat of levelData?.features ?? []) {
      if (!state.player.features.some((f) => f.name === feat.name)) {
        state.player.features.push({
          name: feat.name,
          description: feat.description,
          level: lvl,
        });
      }
    }

    state.player.level = lvl;
  }

  await persistState(characterId);
}
