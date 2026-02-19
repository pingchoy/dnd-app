/**
 * Game state — types, singleton, helpers, and Firestore persistence.
 *
 * The in-memory singleton is used within a single request.  Firestore
 * is the durable store: loadGameState() hydrates the singleton at the
 * start of each request; applyStateChangesAndPersist() flushes it at
 * the end.
 *
 * ALL game state (including activeNPCs) is persisted to Firestore.
 */

import {
  getSRDClassLevel,
  loadCharacter,
  saveCharacterState,
} from "./characterStore";

export type {
  CharacterStats,
  CharacterFeature,
  WeaponStat,
  PlayerState,
  NPC,
  StoryState,
  ConversationTurn,
  GameState,
} from "./gameTypes";

export {
  getModifier,
  getProficiencyBonus,
  formatWeaponDamage,
  XP_THRESHOLDS,
  xpForLevel,
  OPENING_NARRATIVE,
} from "./gameTypes";

import {
  CharacterStats,
  NPC,
  PlayerState,
  StoryState,
  GameState,
  WeaponStat,
  getModifier,
  getProficiencyBonus,
  formatWeaponDamage,
  xpForLevel,
  XP_THRESHOLDS,
} from "./gameTypes";

function fmt(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/** Compact single-string summary of the player for injection into prompts. */
export function serializePlayerState(p: PlayerState): string {
  const m = p.stats;
  const lines = [
    `${p.name} | ${p.gender} ${p.race} ${p.characterClass} Lv${p.level}`,
    `HP ${p.currentHP}/${p.maxHP} | AC ${p.armorClass}`,
    `STR ${m.strength}(${fmt(getModifier(m.strength))}) DEX ${m.dexterity}(${fmt(getModifier(m.dexterity))}) CON ${m.constitution}(${fmt(getModifier(m.constitution))}) INT ${m.intelligence}(${fmt(getModifier(m.intelligence))}) WIS ${m.wisdom}(${fmt(getModifier(m.wisdom))}) CHA ${m.charisma}(${fmt(getModifier(m.charisma))})`,
    `Proficiency bonus: ${fmt(getProficiencyBonus(p.level))}`,
    `Saving throws: ${p.savingThrowProficiencies.join(", ")}`,
    `Skills (proficient): ${p.skillProficiencies.join(", ")}`,
    `Inventory: ${p.inventory.join(", ")}`,
    ...Object.entries(p.weaponDamage).map(
      ([name, ws]) => `Weapon: ${name} — ${formatWeaponDamage(ws, p.stats)} (${ws.dice} base, stat: ${ws.stat}, bonus: ${ws.bonus})`,
    ),
    `Conditions: ${p.conditions.length ? p.conditions.join(", ") : "None"}`,
    `Gold: ${p.gold}gp`,
    `XP: ${p.xp} / ${p.xpToNextLevel} (Level ${p.level})`,
    `Features: ${p.features.map((f) => f.chosenOption ? `${f.name} (${f.chosenOption})` : f.name).join(" | ")}`,
  ];

  // Spell block (only for casters)
  if (p.spellcastingAbility) {
    const abilityMod = getModifier(m[p.spellcastingAbility]);
    const prof = getProficiencyBonus(p.level);
    const saveDC = 8 + prof + abilityMod;
    const spellAttack = prof + abilityMod;
    lines.push(`Spellcasting: ${p.spellcastingAbility.toUpperCase()} (save DC ${saveDC}, spell attack ${fmt(spellAttack)})`);

    if (p.cantrips?.length) {
      lines.push(`Cantrips (${p.cantrips.length}/${p.maxCantrips ?? p.cantrips.length}): ${p.cantrips.join(", ")}`);
    }
    if (p.knownSpells?.length) {
      lines.push(`Spells (${p.knownSpells.length}/${p.maxKnownSpells ?? p.knownSpells.length}): ${p.knownSpells.join(", ")}`);
    }
    if (p.spellSlots && Object.keys(p.spellSlots).length > 0) {
      const used = p.spellSlotsUsed ?? {};
      const slotStr = Object.entries(p.spellSlots)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([lvl, total]) => `Lv${lvl}: ${total - (used[lvl] ?? 0)}/${total} remaining`)
        .join(" ");
      lines.push(`Spell Slots: ${slotStr}`);
    }
  }

  return lines.join("\n");
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

// ─── Singleton state ──────────────────────────────────────────────────────────

/**
 * In-memory game state for the current request.
 * Always initialised by loadGameState() before use — the placeholder below
 * is never read in normal operation.
 */
let state: GameState = {
  player: {
    name: "",
    gender: "",
    characterClass: "",
    race: "",
    level: 1,
    hitDie: 8,
    xp: 0,
    xpToNextLevel: 0,
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
    weaponDamage: {},
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

export interface NPCToCreate {
  name: string;
  slug: string;
  disposition: "hostile" | "neutral" | "friendly";
  count?: number;
}

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
  weapon_damage?: Record<string, WeaponStat>;
  /** Update chosenOption on existing class features, keyed by feature name. */
  feature_choice_updates?: Record<string, string>;
  /** Set spell slot usage. Keys are spell level strings, values are the NEW total used count. */
  spell_slots_used?: Record<string, number>;
  spells_learned?: string[];
  spells_removed?: string[];
  cantrips_learned?: string[];
  /** NPCs the DM wants to introduce. Handled by the API route, not applied to state directly. */
  npcs_to_create?: NPCToCreate[];
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
  if (changes.feature_choice_updates) {
    for (const [featureName, choice] of Object.entries(changes.feature_choice_updates)) {
      const feature = p.features.find(
        (f) => f.name.toLowerCase() === featureName.toLowerCase(),
      );
      if (feature) feature.chosenOption = choice;
    }
  }
  if (changes.spell_slots_used) {
    if (!p.spellSlotsUsed) p.spellSlotsUsed = {};
    for (const [lvl, used] of Object.entries(changes.spell_slots_used)) {
      p.spellSlotsUsed[lvl] = Math.max(0, used);
    }
  }
  if (changes.spells_learned?.length) {
    if (!p.knownSpells) p.knownSpells = [];
    for (const spell of changes.spells_learned) {
      if (!p.knownSpells.includes(spell)) p.knownSpells.push(spell);
    }
  }
  if (changes.spells_removed?.length) {
    if (p.knownSpells) {
      p.knownSpells = p.knownSpells.filter(
        (s) => !changes.spells_removed!.some((r) => r.toLowerCase() === s.toLowerCase()),
      );
    }
  }
  if (changes.cantrips_learned?.length) {
    if (!p.cantrips) p.cantrips = [];
    for (const cantrip of changes.cantrips_learned) {
      if (!p.cantrips.includes(cantrip)) p.cantrips.push(cantrip);
    }
  }
  if (changes.weapon_damage) Object.assign(p.weaponDamage, changes.weapon_damage);
  // Remove weaponDamage entries for items that were lost
  if (changes.items_lost?.length) {
    for (const lost of changes.items_lost) {
      for (const key of Object.keys(p.weaponDamage)) {
        if (key.toLowerCase().includes(lost.toLowerCase())) delete p.weaponDamage[key];
      }
    }
  }
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
  xp_value: number;
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
    xpValue: input.xp_value ?? 0,
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
    // Auto-award XP for defeating hostile NPCs; level-up is checked in applyStateChangesAndPersist
    if (npc.disposition === "hostile" && npc.xpValue > 0) {
      state.player.xp = (state.player.xp ?? 0) + npc.xpValue;
    }
    state.story.activeNPCs = state.story.activeNPCs.filter((n) => n.id !== npc.id);
  }
}

// ─── XP / Level-up ────────────────────────────────────────────────────────────

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
 */
export async function loadGameState(characterId: string): Promise<GameState> {
  const stored = await loadCharacter(characterId);
  if (!stored) throw new Error(`Character "${characterId}" not found in Firestore`);

  state = {
    player: stored.player,
    story: stored.story,
    conversationHistory: stored.conversationHistory,
  };

  return state;
}

/** Persist current in-memory state to Firestore. */
async function persistState(characterId: string): Promise<void> {
  await saveCharacterState(characterId, {
    player: state.player,
    story: state.story,
    // Keep last 40 conversation entries (20 user+assistant pairs)
    conversationHistory: state.conversationHistory.slice(-40),
  });
}

/**
 * Apply state changes to the in-memory singleton and persist to Firestore.
 * Always calls awardXPAsync to catch level-ups from both xp_gained and NPC kills.
 */
export async function applyStateChangesAndPersist(
  changes: StateChanges,
  characterId: string,
): Promise<void> {
  applyStateChanges(changes);
  // Check for level-up regardless of source (xp_gained field or NPC kill XP)
  await awardXPAsync(characterId, 0);
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

    // Append new features from Firestore (deduplicate by name).
    // Only store name + level — descriptions bloat Firestore and API responses.
    // The DM can use query_srd to look up full descriptions on demand.
    for (const feat of levelData?.features ?? []) {
      if (!state.player.features.some((f) => f.name === feat.name)) {
        state.player.features.push({
          name: feat.name,
          level: lvl,
        });
      }
    }

    // Spellcasting updates on level-up
    if (levelData?.spellSlots && Object.keys(levelData.spellSlots).length > 0) {
      state.player.spellSlots = levelData.spellSlots;
      state.player.spellSlotsUsed = {}; // level-up grants full slots
    }
    if (levelData?.cantripsKnown != null) {
      state.player.maxCantrips = levelData.cantripsKnown;
    }
    if (levelData?.spellsKnown != null) {
      // Known casters (Bard, Sorcerer, Ranger, Warlock)
      state.player.maxKnownSpells = levelData.spellsKnown;
    } else if (state.player.spellcastingAbility) {
      // Prepared casters (Cleric, Druid, Paladin) — ability_mod + level
      const abilityMod = getModifier(state.player.stats[state.player.spellcastingAbility]);
      state.player.maxKnownSpells = Math.max(1, abilityMod + lvl);
    }

    state.player.level = lvl;
    state.player.xpToNextLevel = xpForLevel(lvl + 1);
  }

  await persistState(characterId);
}
