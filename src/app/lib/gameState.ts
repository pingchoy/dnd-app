/**
 * Game state — types, singleton, helpers, and Firestore persistence.
 *
 * The in-memory singleton is used within a single request.  Firestore
 * is the durable store: loadGameState() hydrates the singleton at the
 * start of each request; applyStateChangesAndPersist() flushes it at
 * the end.
 *
 * ALL game state is persisted to Firestore. NPCs live in the encounters
 * collection; story/player data live in sessions/characters.
 */

import {
  getSRDClass,
  getSRDClassLevel,
  getSRDSubclassLevel,
  loadCharacter,
  loadSession,
  saveCharacterState,
  querySRD,
} from "./characterStore";

import {
  loadEncounter,
  saveEncounterState,
  completeEncounter as completeEncounterDoc,
} from "./encounterStore";

export type {
  CharacterStats,
  CharacterFeature,
  GameplayEffects,
  PlayerState,
  NPC,
  StoryState,
  GameState,
  PendingLevelUp,
  PendingLevelData,
  ParsedRollResult,
  DamageBreakdown,
  GridPosition,
  StoredEncounter,
  CombatStats,
  VictoryLootItem,
  VictoryData,
  MapRegion,
  RegionType,
  MapDocument,
} from "./gameTypes";

export {
  formatModifier,
  getModifier,
  getProficiencyBonus,
  formatAbilityDamage,
  toDisplayCase,
  XP_THRESHOLDS,
  xpForLevel,
  OPENING_NARRATIVE,
  rollD20,
  getWeaponAbilityMod,
  doubleDice,
  applyEffects,
  FIGHTING_STYLE_EFFECTS,
  emptyCombatStats,
  normalizeRegion,
  normalizeRegions,
} from "./gameTypes";

import {
  CharacterStats,
  NPC,
  PlayerState,
  StoryState,
  GameState,
  StoredEncounter,
  PendingLevelUp,
  PendingLevelData,
  Ability,
  AbilityRange,
  SpellAttackType,
  GridPosition,
  MapDocument,
  MapRegion,
  Campaign,
  CampaignAct,
  FEATURE_CHOICE_OPTIONS,
  FIGHTING_STYLE_EFFECTS,
  emptyCombatStats,
  formatModifier,
  getModifier,
  getProficiencyBonus,
  formatAbilityDamage,
  xpForLevel,
  XP_THRESHOLDS,
  applyEffects,
} from "./gameTypes";

import { parseSpellRange } from "./combatEnforcement";

/**
 * Build the shared stat lines used by both serializePlayerState and
 * serializeCombatPlayerState. The `compact` flag omits non-combat fields
 * (inventory, gold, XP, skills, features, gender).
 */
function buildStatLines(p: PlayerState, compact: boolean): string[] {
  const m = p.stats;
  const wp = p.weaponProficiencies ?? [];
  const ap = p.armorProficiencies ?? [];

  const lines = [
    compact
      ? `${p.name} | ${p.race} ${p.characterClass} Lv${p.level}`
      : `${p.name} | ${p.gender} ${p.race} ${p.characterClass} Lv${p.level}`,
    `HP ${p.currentHP}/${p.maxHP} | AC ${p.armorClass}`,
    `STR ${m.strength}(${formatModifier(getModifier(m.strength))}) DEX ${m.dexterity}(${formatModifier(getModifier(m.dexterity))}) CON ${m.constitution}(${formatModifier(getModifier(m.constitution))}) INT ${m.intelligence}(${formatModifier(getModifier(m.intelligence))}) WIS ${m.wisdom}(${formatModifier(getModifier(m.wisdom))}) CHA ${m.charisma}(${formatModifier(getModifier(m.charisma))})`,
    `Proficiency bonus: ${formatModifier(getProficiencyBonus(p.level))}`,
    `Saving throws: ${p.savingThrowProficiencies.join(", ")}`,
  ];

  if (!compact) {
    lines.push(`Skills (proficient): ${p.skillProficiencies.join(", ")}`);
    lines.push(`Weapon proficiencies: ${wp.length ? wp.join(", ") : "None"}`);
    lines.push(`Armor proficiencies: ${ap.length ? ap.join(", ") : "None"}`);
    lines.push(`Inventory: ${p.inventory.join(", ")}`);
  }

  lines.push(
    ...(p.abilities ?? [])
      .filter(a => a.type === "weapon")
      .map(a => `Weapon: ${a.name} — ${formatAbilityDamage(a, p.stats)} (${a.damageRoll} base, stat: ${a.weaponStat ?? "str"}, bonus: ${a.weaponBonus ?? 0})`),
  );
  lines.push(`Conditions: ${p.conditions.length ? p.conditions.join(", ") : "None"}`);

  if (!compact) {
    lines.push(`Gold: ${p.gold}gp`);
    lines.push(`XP: ${p.xp} / ${p.xpToNextLevel} (Level ${p.level})`);
    lines.push(`Features: ${p.features.map((f) => f.chosenOption ? `${f.name} (${f.chosenOption})` : f.name).join(" | ")}`);
  }

  // Spell block (only for casters)
  if (p.spellcastingAbility) {
    const abilityMod = getModifier(m[p.spellcastingAbility]);
    const prof = getProficiencyBonus(p.level);
    const saveDC = 8 + prof + abilityMod;
    const spellAttack = prof + abilityMod;
    lines.push(`Spellcasting: ${p.spellcastingAbility.toUpperCase()} (save DC ${saveDC}, spell attack ${formatModifier(spellAttack)})`);

    if (p.cantrips?.length) {
      lines.push(compact
        ? `Cantrips: ${p.cantrips.map(c => c.replace(/-/g, " ")).join(", ")}`
        : `Cantrips (${p.cantrips.length}/${p.maxCantrips ?? p.cantrips.length}): ${p.cantrips.map(c => c.replace(/-/g, " ")).join(", ")}`);
    }
    if (p.preparedSpells?.length) {
      // Prepared casters (Wizard, Cleric, Druid, Paladin)
      lines.push(compact
        ? `Prepared Spells: ${p.preparedSpells.map(s => s.replace(/-/g, " ")).join(", ")}`
        : `Prepared Spells (${p.preparedSpells.length}/${p.maxPreparedSpells ?? p.preparedSpells.length}): ${p.preparedSpells.map(s => s.replace(/-/g, " ")).join(", ")}`);
    } else if (p.knownSpells?.length) {
      // Known casters (Bard, Sorcerer, Ranger, Warlock)
      lines.push(compact
        ? `Spells: ${p.knownSpells.map(s => s.replace(/-/g, " ")).join(", ")}`
        : `Spells (${p.knownSpells.length}/${p.maxKnownSpells ?? p.knownSpells.length}): ${p.knownSpells.map(s => s.replace(/-/g, " ")).join(", ")}`);
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

  return lines;
}

/** Compact single-string summary of the player for injection into prompts. */
export function serializePlayerState(p: PlayerState): string {
  return buildStatLines(p, false).join("\n");
}

/** Compact summary of active NPCs for injection into prompts. Includes unique id for tool calls. */
export function serializeActiveNPCs(npcs: NPC[]): string {
  if (npcs.length === 0) return "";
  return (
    "Active combatants:\n" +
    npcs
      .map(
        (n) =>
          `  [id=${n.id}] ${n.name}: AC ${n.ac}, HP ${n.currentHp}/${n.maxHp}, ATK ${formatModifier(n.attackBonus)} (${n.damageDice}${n.damageBonus ? formatModifier(n.damageBonus) : ""}) [${n.disposition}]${n.conditions.length ? ` — ${n.conditions.join(", ")}` : ""}${n.notes ? ` — ${n.notes}` : ""}`,
      )
      .join("\n")
  );
}

/**
 * Compact summary of the story state for prompt injection.
 *
 * Outputs all memory tiers:
 *   1. campaignSummary (living synopsis) — falls back to campaignBackground
 *   2. milestones (permanent plot beats)
 *   3. activeQuests + importantNPCs (tracked state)
 *   4. recentEvents (all stored, up to 10)
 */
export function serializeStoryState(s: StoryState): string {
  const lines: string[] = [`Campaign: ${s.campaignTitle}`];

  if (s.campaignSummary) {
    lines.push(`Summary: ${s.campaignSummary}`);
  } else if (s.campaignBackground) {
    lines.push(`Background: ${s.campaignBackground}`);
  }

  if (s.milestones?.length) {
    lines.push(`Milestones: ${s.milestones.join(" | ")}`);
  }

  lines.push(`Location: ${s.currentLocation}`);
  lines.push(`Scene: ${s.currentScene}`);

  if (s.activeQuests.length) {
    lines.push(`Active Quests: ${s.activeQuests.join("; ")}`);
  }
  if (s.importantNPCs.length) {
    lines.push(`Notable NPCs: ${s.importantNPCs.join(", ")}`);
  }
  if (s.recentEvents.length) {
    lines.push(`Recent: ${s.recentEvents.join(" | ")}`);
  }

  return lines.join("\n");
}

/**
 * Compact combat-focused player summary for the combat agent.
 * Includes only stats relevant to combat resolution — omits inventory
 * (non-weapon), quests, gold, XP, skill proficiencies, and full features.
 */
export function serializeCombatPlayerState(p: PlayerState): string {
  return buildStatLines(p, true).join("\n");
}

/**
 * Serialize spatial context for the DM agent. Only includes regions where
 * players currently stand. Cost: ~30-60 tokens per player.
 *
 * @param playerPositions Map of characterId/name → grid position
 * @param map The active map document (null if no map loaded)
 */
export function serializeRegionContext(
  playerPositions: Map<string, GridPosition>,
  map: MapDocument | null,
): string {
  if (!map || playerPositions.size === 0) return "";

  const lines: string[] = ["Spatial context:"];

  for (const [playerName, pos] of Array.from(playerPositions.entries())) {
    // Find which region(s) the player is standing in
    const cellIndex = pos.row * 20 + pos.col;
    const matchingRegions = map.regions.filter(
      (r) => (r.cells ?? []).includes(cellIndex),
    );

    if (matchingRegions.length > 0) {
      for (const region of matchingRegions) {
        lines.push(`  ${playerName} [row=${pos.row},col=${pos.col}] → ${region.name} (${region.type})`);
        if (region.dmNote) {
          lines.push(`    Note: ${region.dmNote}`);
        }
        if (region.shopInventory?.length) {
          lines.push(`    Shop items: ${region.shopInventory.join(", ")}`);
        }
      }
    } else {
      lines.push(`  ${playerName} [row=${pos.row},col=${pos.col}] → open area (no named region)`);
    }
  }

  return lines.join("\n");
}

/**
 * Serialize campaign context for the DM agent. Provides a compact briefing
 * (campaign arc, current act objectives, NPC personalities) — enough for
 * most narration. The DM can call query_campaign for deeper detail.
 *
 * Cost: ~800-1000 input tokens.
 */
export function serializeCampaignContext(
  campaign: Campaign,
  act: CampaignAct | null,
): string {
  const lines: string[] = [];

  lines.push("CAMPAIGN BRIEFING (DM ONLY — never reveal plot spoilers, NPC secrets, or future events to the player):");
  lines.push(campaign.dmSummary);

  if (act) {
    lines.push("");
    lines.push(`CURRENT ACT: ${act.title} (Act ${act.actNumber})`);
    lines.push(act.dmBriefing);
    if (act.plotPoints?.length) {
      lines.push(`Plot points: ${act.plotPoints.join("; ")}`);
    }
  }

  // Compact NPC summaries for narration — only act-relevant NPCs
  const relevantIds = act?.relevantNPCIds ?? campaign.npcs.map((n) => n.id);
  const npcs = campaign.npcs.filter((n) => relevantIds.includes(n.id));

  if (npcs.length > 0) {
    lines.push("");
    lines.push("KEY NPCs:");
    for (const npc of npcs) {
      const traits = npc.personality.traits.slice(0, 2).join(", ");
      const actKey = act ? `act${act.actNumber}` as keyof typeof npc.relationshipArc : undefined;
      const rel = actKey ? npc.relationshipArc[actKey] : undefined;
      let line = `  ${npc.name} (${npc.role}): ${traits}`;
      if (rel) line += ` | This act: ${rel}`;
      if (npc.voiceNotes) line += ` | Voice: ${npc.voiceNotes.slice(0, 100)}`;
      lines.push(line);
    }
  }

  return lines.join("\n");
}

/** Max conversation entries persisted (20 user + 20 assistant turns). */


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
    weaponProficiencies: [],
    armorProficiencies: [],
    features: [],
    inventory: [],
    conditions: [],
    gold: 0,
    baseArmorClass: 10,
    baseSpeed: 30,
    activeConditions: [],
    numAttacks: 1,
    meleeAttackBonus: 0,
    rangedAttackBonus: 0,
    spellAttackBonus: 0,
    meleeDamageBonus: 0,
    rangedDamageBonus: 0,
    critBonusDice: 0,
    bonusDamage: [],
    resistances: [],
    immunities: [],
    evasion: false,
    saveAdvantages: [],
    initiativeAdvantage: false,
    halfProficiency: false,
    minCheckRoll: 0,
    bonusSaveProficiencies: [],
  },
  story: {
    campaignTitle: "",
    campaignBackground: "",
    currentLocation: "",
    currentScene: "",
    activeQuests: [],
    importantNPCs: [],
    recentEvents: [],
  },
};

/** SessionId for the current character — set by loadGameState(). */
let currentSessionId = "";
/** Active map ID from the session — set by loadGameState(). */
let currentActiveMapId: string | undefined;
/** Exploration positions from the session — set by loadGameState(). */
let currentExplorationPositions: Record<string, GridPosition> | undefined;
/** Campaign slug from the session — set by loadGameState(). */
let currentCampaignSlug: string | undefined;

// ─── Encounter singleton ─────────────────────────────────────────────────────

/**
 * In-memory encounter state for the current request.
 * Null when no combat encounter is active.
 * Hydrated by loadGameState() when story.activeEncounterId is set.
 */
let encounter: StoredEncounter | null = null;

// ─── Getters / Setters ────────────────────────────────────────────────────────

export function getGameState(): GameState {
  return state;
}

export function getSessionId(): string {
  return currentSessionId;
}

export function getActiveMapId(): string | undefined {
  return currentActiveMapId;
}

export function getExplorationPositions(): Record<string, GridPosition> | undefined {
  return currentExplorationPositions;
}

export function getCampaignSlug(): string | undefined {
  return currentCampaignSlug;
}

export function getEncounter(): StoredEncounter | null {
  return encounter;
}

export function setEncounter(enc: StoredEncounter | null): void {
  encounter = enc;
}

/** Returns the active NPCs from the current encounter, or an empty array if no encounter. */
export function getActiveNPCs(): NPC[] {
  return encounter?.activeNPCs ?? [];
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
  weapons_gained?: Array<{
    name: string;
    dice: string;
    stat: "str" | "dex" | "finesse" | "none";
    bonus: number;
    range?: AbilityRange;
    damageType?: string;
  }>;
  /** Update chosenOption on existing class features, keyed by feature name. */
  feature_choice_updates?: Record<string, string>;
  /** Set spell slot usage. Keys are spell level strings, values are the NEW total used count. */
  spell_slots_used?: Record<string, number>;
  spells_learned?: string[];
  spells_removed?: string[];
  cantrips_learned?: string[];
  /** NPCs the DM wants to introduce. Handled by the API route, not applied to state directly. */
  npcs_to_create?: NPCToCreate[];
  // ─── Memory tier fields ───
  /** A major plot milestone to record permanently (e.g. "defeated the shadow dragon"). */
  milestone?: string;
  /** Updated 2-3 sentence campaign synopsis. Only when the arc shifts significantly. */
  campaign_summary_update?: string;
  /** Quest names to add to active quests. */
  quests_added?: string[];
  /** Quest names completed or abandoned — removed from active quests. */
  quests_completed?: string[];
  /** Names of important NPCs the player has met. */
  npcs_met?: string[];
  /** Advance to a new campaign act number. */
  act_advance?: number;
}

/**
 * Apply a bag of state mutations to the in-memory singleton.
 *
 * Each field in `StateChanges` maps to a specific mutation — HP delta,
 * inventory adds/removes, condition toggles, spell slot tracking, etc.
 * Only non-nullish fields are applied, so callers can pass a sparse object.
 *
 * Item removal uses case-insensitive substring matching so the DM doesn't
 * need to specify exact item names. Weapon damage entries are cleaned up
 * when their associated items are lost.
 */
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
  // ─── Memory tier mutations ───
  if (changes.milestone) {
    if (!s.milestones) s.milestones = [];
    s.milestones.push(changes.milestone.toLowerCase());
    if (s.milestones.length > 20) s.milestones = s.milestones.slice(-20);
  }
  if (changes.campaign_summary_update) {
    s.campaignSummary = changes.campaign_summary_update;
  }
  if (changes.quests_added?.length) {
    for (const q of changes.quests_added) {
      const lower = q.toLowerCase();
      if (!s.activeQuests.includes(lower)) s.activeQuests.push(lower);
    }
  }
  if (changes.quests_completed?.length) {
    s.activeQuests = s.activeQuests.filter(
      (q) => !changes.quests_completed!.some((c) => c.toLowerCase() === q.toLowerCase()),
    );
  }
  if (changes.npcs_met?.length) {
    for (const npc of changes.npcs_met) {
      const lower = npc.toLowerCase();
      if (!s.importantNPCs.includes(lower)) s.importantNPCs.push(lower);
    }
    if (s.importantNPCs.length > 30) s.importantNPCs = s.importantNPCs.slice(-30);
  }
  if (changes.act_advance != null && changes.act_advance > 0) {
    s.currentAct = changes.act_advance;
  }
  if (changes.gold_delta) p.gold = Math.max(0, p.gold + changes.gold_delta);
  // Defer XP during combat — accumulate on encounter, flush to all players when combat ends
  if (changes.xp_gained && changes.xp_gained > 0) {
    if (encounter) {
      encounter.totalXPAwarded = (encounter.totalXPAwarded ?? 0) + changes.xp_gained;
      console.log(`[applyStateChanges] Deferred ${changes.xp_gained} XP to encounter (total: ${encounter.totalXPAwarded})`);
    } else {
      p.xp = (p.xp ?? 0) + changes.xp_gained;
    }
  }
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
  if (changes.weapons_gained?.length) {
    if (!p.abilities) p.abilities = [];
    for (const w of changes.weapons_gained) {
      p.abilities.push({
        id: `weapon:${w.name}`,
        name: w.name,
        type: "weapon",
        weaponStat: w.stat,
        weaponBonus: w.bonus,
        damageRoll: w.dice,
        damageType: w.damageType,
        range: w.range,
        requiresTarget: true,
      });
    }
  }
  // Remove weapon abilities for items that were lost
  if (changes.items_lost?.length) {
    if (p.abilities) {
      p.abilities = p.abilities.filter(a => {
        if (a.type !== "weapon") return true;
        return !changes.items_lost!.some(lost =>
          a.name.toLowerCase().includes(lost.toLowerCase()) ||
          lost.toLowerCase().includes(a.name.toLowerCase()),
        );
      });
    }
  }
}

// ─── NPC management ───────────────────────────────────────────────────────────

export interface CreateNPCInput {
  name: string;
  /** SRD monster slug (e.g. "guard", "goblin") — persisted for region-aware placement. */
  slug?: string;
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
    ...(input.slug ? { slug: input.slug } : {}),
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
  if (!encounter) {
    console.warn(`[createNPC] No active encounter — NPC "${npc.name}" created but not tracked`);
  } else {
    encounter.activeNPCs.push(npc);
  }
  console.log(`[createNPC] Created "${npc.name}" — HP:${npc.maxHp}, AC:${npc.ac}, XP:${npc.xpValue}, disposition:${npc.disposition}`);
  return npc;
}

export interface UpdateNPCInput {
  /** Unique NPC id (matches NPC.id in activeNPCs). */
  id: string;
  hp_delta?: number;
  conditions_added?: string[];
  conditions_removed?: string[];
  remove_from_scene?: boolean;
}

export interface UpdateNPCResult {
  found: boolean;
  name: string;
  died: boolean;
  removed: boolean;
  newHp: number;
  xpAwarded: number;
}

export function updateNPC(input: UpdateNPCInput): UpdateNPCResult {
  if (!encounter) {
    console.warn(`[updateNPC] No active encounter — cannot update NPC "${input.id}"`);
    return { found: false, name: input.id, died: false, removed: false, newHp: 0, xpAwarded: 0 };
  }

  const npc = encounter.activeNPCs.find((n) => n.id === input.id);
  if (!npc) return { found: false, name: input.id, died: false, removed: false, newHp: 0, xpAwarded: 0 };

  const wasAlive = npc.currentHp > 0;

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

  // Detect fresh kill: was alive before this update, now dead.
  // Dead NPCs remain in activeNPCs (rendered as faded corpse on the grid)
  // but XP/snapshot/events only trigger once on the killing blow.
  const justDied = wasAlive && npc.currentHp <= 0;
  const died = npc.currentHp <= 0;
  let xpAwarded = 0;

  if (justDied) {
    // Snapshot the NPC for loot context and victory screen
    if (!encounter.defeatedNPCs) encounter.defeatedNPCs = [];
    encounter.defeatedNPCs.push({ ...npc });

    // Track XP earned from hostile NPC kills — deferred until combat ends
    if (npc.disposition === "hostile" && npc.xpValue > 0) {
      xpAwarded = npc.xpValue;
      encounter.totalXPAwarded = (encounter.totalXPAwarded ?? 0) + xpAwarded;
      console.log(`[updateNPC] Deferred ${xpAwarded} XP for defeating "${npc.name}" (encounter total: ${encounter.totalXPAwarded})`);
    } else {
      console.log(`[updateNPC] No XP awarded for "${npc.name}" — disposition=${npc.disposition}, xpValue=${npc.xpValue}`);
    }
    // Record the kill in recentEvents so the DM agent has context on future turns
    state.story.recentEvents.push(`Defeated ${npc.name}${xpAwarded > 0 ? ` (${xpAwarded} XP)` : ""}`);
    if (state.story.recentEvents.length > 10) state.story.recentEvents = state.story.recentEvents.slice(-10);
  }

  // Explicit remove_from_scene (e.g. NPC flees, DM removes for story reasons)
  if (input.remove_from_scene && !died) {
    encounter.activeNPCs = encounter.activeNPCs.filter((n) => n.id !== npc.id);
    delete encounter.positions[npc.id];
  }

  return { found: true, name: npc.name, died, removed: !!input.remove_from_scene && !died, newHp: npc.currentHp, xpAwarded };
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

/** Default ASI levels — overridden by class-specific asiLevels from Firestore. */
const DEFAULT_ASI_LEVELS = [4, 8, 12, 16, 19];

/**
 * Map of features that require player choices at level-up time.
 * Extends the shared FEATURE_CHOICE_OPTIONS with level-up-only entries.
 */
const LEVELUP_CHOICE_FEATURES: Record<string, { options: string[]; picks?: number }> = {
  ...FEATURE_CHOICE_OPTIONS,
  "additional fighting style": {
    options: FEATURE_CHOICE_OPTIONS["fighting style"].options,
  },
};

/**
 * Compute what the player gains at each level between fromLevel+1 and toLevel.
 * Returns a PendingLevelUp object with per-level data.
 */
async function computePendingLevelUp(
  player: PlayerState,
  fromLevel: number,
  toLevel: number,
): Promise<PendingLevelUp> {
  const classSlug = player.characterClass.toLowerCase();
  const classData = await getSRDClass(classSlug);
  const conMod = getModifier(player.stats.constitution);
  const levels: PendingLevelData[] = [];

  // Track running cantrip/spell maxes to compute deltas
  let runningCantrips = player.maxCantrips ?? 0;
  let runningKnownSpells = player.maxKnownSpells ?? 0;

  for (let lvl = fromLevel + 1; lvl <= toLevel; lvl++) {
    const levelData = await getSRDClassLevel(classSlug, lvl);

    // HP gain: floor(hitDie/2) + 1 + CON mod + hpPerLevel bonuses from features
    const hpPerLevelBonus = player.features
      .filter(f => f.gameplayEffects?.hpPerLevel)
      .reduce((sum, f) => sum + (f.gameplayEffects!.hpPerLevel ?? 0), 0);
    const hpGain = Math.floor(player.hitDie / 2) + 1 + conMod + hpPerLevelBonus;

    // Check ASI using class-specific schedule from Firestore
    const asiLevels = classData?.asiLevels ?? DEFAULT_ASI_LEVELS;
    const isASILevel = asiLevels.includes(lvl);

    // Check subclass required: player has no subclass and this is the archetype level
    const requiresSubclass = !player.subclass && classData?.archetypeLevel === lvl;

    // Subclass features (if player already has a subclass)
    let newSubclassFeatures: PendingLevelData["newSubclassFeatures"] = [];
    if (player.subclass) {
      const subclassSlug = player.subclass.toLowerCase().replace(/\s+/g, "-");
      const subclassLevel = await getSRDSubclassLevel(subclassSlug, lvl);
      if (subclassLevel?.features) {
        newSubclassFeatures = subclassLevel.features.map((f) => ({
          name: f.name,
          description: f.description ?? "",
          ...(f.type ? { type: f.type } : {}),
          ...(f.gameplayEffects ? { gameplayEffects: f.gameplayEffects } : {}),
        }));
      }
    }

    // Class features — filter out "Ability Score Improvement" (handled by ASI step)
    // and subclass archetype feature names (handled by subclass step)
    const rawFeatures = (levelData?.features ?? []).filter(
      (f) => f.name !== "Ability Score Improvement",
    );
    const newFeatures = rawFeatures.map((f) => ({
      name: f.name,
      description: f.description ?? "",
      ...(f.type ? { type: f.type } : {}),
      ...(f.gameplayEffects ? { gameplayEffects: f.gameplayEffects } : {}),
    }));

    // Feature choices from the LEVELUP_CHOICE_FEATURES map
    const featureChoices = rawFeatures
      .filter((f) => LEVELUP_CHOICE_FEATURES[f.name.toLowerCase()])
      .map((f) => {
        const choice = LEVELUP_CHOICE_FEATURES[f.name.toLowerCase()];
        return {
          name: f.name,
          description: f.description ?? "",
          options: choice.options,
          picks: choice.picks,
        };
      });

    // Spell slot data
    const spellSlots = levelData?.spellSlots;

    // Cantrip/spell deltas
    let newCantripSlots = 0;
    let maxCantrips: number | undefined;
    if (levelData?.cantripsKnown != null) {
      newCantripSlots = Math.max(0, levelData.cantripsKnown - runningCantrips);
      runningCantrips = levelData.cantripsKnown;
      maxCantrips = levelData.cantripsKnown;
    }

    let newSpellSlots = 0;
    let maxKnownSpells: number | undefined;
    let maxPreparedSpells: number | undefined;
    if (levelData?.spellsKnown != null) {
      // Known casters (Bard, Sorcerer, Ranger, Warlock) — fixed from class table
      newSpellSlots = Math.max(0, levelData.spellsKnown - runningKnownSpells);
      runningKnownSpells = levelData.spellsKnown;
      maxKnownSpells = levelData.spellsKnown;
    } else if (player.spellcastingAbility) {
      // Prepared casters (Wizard, Cleric, Druid, Paladin) — ability_mod + level
      // No incremental spell learning — they re-select prepared spells each level
      const abilityMod = getModifier(player.stats[player.spellcastingAbility]);
      maxPreparedSpells = Math.max(1, abilityMod + lvl);
      // newSpellSlots stays 0 — "spells" step is skipped, "prepare" step is used instead
    }

    // Highest spell level the player can cast at this level
    let maxNewSpellLevel = 0;
    if (spellSlots) {
      const slotLevels = Object.keys(spellSlots).map(Number).filter((n) => spellSlots[String(n)] > 0);
      if (slotLevels.length > 0) maxNewSpellLevel = Math.max(...slotLevels);
    }

    levels.push({
      level: lvl,
      hpGain,
      proficiencyBonus: getProficiencyBonus(lvl),
      newFeatures,
      newSubclassFeatures,
      spellSlots,
      maxCantrips,
      // Only include the relevant spellcasting limit — Firestore rejects undefined values
      ...(maxKnownSpells != null ? { maxKnownSpells } : {}),
      ...(maxPreparedSpells != null ? { maxPreparedSpells } : {}),
      isASILevel,
      requiresSubclass,
      featureChoices,
      newCantripSlots,
      newSpellSlots,
      maxNewSpellLevel,
    });
  }

  return { fromLevel, toLevel, levels };
}

// ─── Firestore-backed async functions ─────────────────────────────────────────

/**
 * Load a character from Firestore and hydrate the in-memory singletons.
 * If the session has an active encounter, also loads the encounter doc
 * and uses its NPCs as the authoritative source.
 */
export async function loadGameState(characterId: string): Promise<GameState> {
  const stored = await loadCharacter(characterId);
  if (!stored) throw new Error(`Character "${characterId}" not found in Firestore`);

  currentSessionId = stored.sessionId;
  state = {
    player: stored.player,
    story: stored.story,
  };

  // Load session-level spatial data (activeMapId, explorationPositions)
  const session = await loadSession(stored.sessionId);
  currentActiveMapId = session?.activeMapId;
  currentExplorationPositions = session?.explorationPositions;
  currentCampaignSlug = session?.campaignSlug;

  // Hydrate encounter if one is active
  encounter = null;
  if (state.story.activeEncounterId) {
    const enc = await loadEncounter(state.story.activeEncounterId);
    if (enc && enc.status === "active") {
      encounter = enc;
    } else {
      // Encounter was completed or missing — clear the stale reference
      delete state.story.activeEncounterId;
    }
  }

  // Backfill base values for existing characters that predate the effects system
  if (state.player.baseArmorClass == null) {
    state.player.baseArmorClass = state.player.armorClass;
  }
  if (state.player.baseSpeed == null) {
    state.player.baseSpeed = state.player.speed ?? 30;
  }
  if (!state.player.activeConditions) {
    state.player.activeConditions = [];
  }

  // Aggregate gameplay effects from features onto PlayerState
  applyEffects(state.player);

  return state;
}

/** Persist current in-memory state to Firestore. */
async function persistState(characterId: string): Promise<void> {
  await saveCharacterState(characterId, {
    player: state.player,
    story: state.story,
  });
}

/**
 * Apply state changes to the in-memory singleton and persist to Firestore.
 * XP and level-ups are deferred until combat ends — during combat, XP accumulates
 * on the encounter and is flushed to the player when all hostiles are defeated.
 * If an encounter is active, also persists encounter state (NPCs, positions).
 */
export async function applyStateChangesAndPersist(
  changes: StateChanges,
  characterId: string,
): Promise<void> {
  applyStateChanges(changes);
  // Re-aggregate effects in case conditions changed
  applyEffects(state.player);

  // Persist encounter state alongside game state
  if (encounter?.id) {
    // Check if combat is over (no hostile NPCs with HP > 0)
    const stillInCombat = encounter.activeNPCs.some(
      (n) => n.disposition === "hostile" && n.currentHp > 0,
    );

    if (stillInCombat) {
      // XP deferred — persist encounter state including accumulated XP, skip level-up check
      await saveEncounterState(encounter.id, {
        activeNPCs: encounter.activeNPCs,
        positions: encounter.positions,
        round: encounter.round,
        turnOrder: encounter.turnOrder,
        currentTurnIndex: encounter.currentTurnIndex,
        totalXPAwarded: encounter.totalXPAwarded,
      });
    } else {
      // Combat is over — award full encounter XP to every participating character
      const earnedXP = encounter.totalXPAwarded ?? 0;
      const allCharacterIds = encounter.characterIds;
      await completeEncounterDoc(encounter.id);
      delete state.story.activeEncounterId;
      encounter = null;

      if (earnedXP > 0) {
        // Current character: update in-memory singleton directly
        state.player.xp = (state.player.xp ?? 0) + earnedXP;
        console.log(`[combat-end] Awarded ${earnedXP} XP to ${characterId} (total: ${state.player.xp})`);

        // Other characters: load from Firestore, add XP, compute level-up, save back
        const otherIds = allCharacterIds.filter(id => id !== characterId);
        await Promise.all(otherIds.map(id => awardXPToCharacter(id, earnedXP)));
      }

      // Check level-up for the current character
      await awardXPAsync(characterId, 0);
    }
  } else {
    // No active encounter — check for level-up from out-of-combat XP gains
    await awardXPAsync(characterId, 0);
  }

  await persistState(characterId);
}

/**
 * Award XP to the player. If a level threshold is crossed, compute
 * pending level-up data and store it on the player — but do NOT apply
 * any changes. The frontend wizard collects player choices, then
 * POST /api/levelup calls applyLevelUp() to finalize.
 *
 * @param characterId  Firestore character document ID
 * @param amount       XP to award (0 = just check if current xp triggers level-up)
 */
export async function awardXPAsync(characterId: string, amount: number): Promise<void> {
  if (amount > 0) state.player.xp = (state.player.xp ?? 0) + amount;

  const currentLevel = state.player.level;
  const targetLevel = levelForXP(state.player.xp);

  if (targetLevel <= currentLevel) return; // no level-up needed

  // If pending already exists but the target increased, recompute with extended range
  const fromLevel = state.player.pendingLevelUp?.fromLevel ?? currentLevel;

  state.player.pendingLevelUp = await computePendingLevelUp(
    state.player,
    fromLevel,
    targetLevel,
  );

  await persistState(characterId);
}

/**
 * Award XP to a character who is NOT the in-memory singleton.
 * Loads from Firestore, adds XP, computes pending level-up if needed, and saves back.
 */
async function awardXPToCharacter(characterId: string, amount: number): Promise<void> {
  const charDoc = await loadCharacter(characterId);
  if (!charDoc) {
    console.warn(`[awardXPToCharacter] Character "${characterId}" not found — skipping`);
    return;
  }

  const player = charDoc.player;
  player.xp = (player.xp ?? 0) + amount;

  const targetLevel = levelForXP(player.xp);
  if (targetLevel > player.level) {
    const fromLevel = player.pendingLevelUp?.fromLevel ?? player.level;
    player.pendingLevelUp = await computePendingLevelUp(player, fromLevel, targetLevel);
  }

  await saveCharacterState(characterId, { player });
  console.log(`[awardXPToCharacter] Awarded ${amount} XP to ${characterId} (total: ${player.xp})`);
}

// ─── Level-up Application ─────────────────────────────────────────────────────

export interface LevelChoices {
  level: number;
  asiChoices?: Partial<Record<keyof CharacterStats, number>>;
  featChoice?: string;
  featDescription?: string;
  subclassChoice?: string;
  featureChoices?: Record<string, string>;
  newCantrips?: string[];
  newSpells?: string[];
  preparedSpells?: string[];
}

/**
 * Build an Ability entry from SRD spell data. Used during level-up and
 * character creation to create combat-ready ability objects from spell slugs.
 */
function buildSpellAbility(slug: string, srd: Record<string, unknown>): Ability {
  const range = parseSpellRange((srd.range as string) ?? "self");
  const damageRoll = srd.damageRoll as string | undefined;
  const damageType = (srd.damageTypes as string[] | undefined)?.[0];

  let attackType: SpellAttackType = "none";
  if (srd.savingThrowAbility) {
    attackType = "save";
  } else if (srd.attackRoll) {
    const r = ((srd.range as string) ?? "").toLowerCase();
    const isMelee = r === "touch" || (r.match(/^(\d+)/) && parseInt(r) <= 5);
    attackType = isMelee ? "melee" : "ranged";
  } else if (damageRoll) {
    attackType = "auto";
  }

  // Only include optional fields when defined — Firestore rejects undefined values
  const ability: Ability = {
    id: `spell:${slug}`,
    name: (srd.name as string) ?? slug,
    type: "spell",
    spellLevel: (srd.level as number) ?? 1,
    range,
    attackType,
    requiresTarget: attackType !== "none" && attackType !== "auto" && range.type !== "self",
  };
  if (srd.savingThrowAbility) ability.saveAbility = srd.savingThrowAbility as string;
  if (damageRoll) ability.damageRoll = damageRoll;
  if (damageType) ability.damageType = damageType;
  if (srd.upcastScaling) ability.upcastScaling = srd.upcastScaling as Record<string, { damageRoll?: string; targetCount?: number }>;
  if (srd.aoe) {
    ability.aoe = srd.aoe as import("./gameTypes").AOEData;
    ability.requiresTarget = false; // AOE spells target an area, not a single NPC
  }
  return ability;
}

/**
 * Apply all pending level-up changes using the player's choices.
 * Walks each level in order, applying HP, features, ASI/feat, subclass,
 * spell slots, and new spells. Clears pendingLevelUp and persists.
 */
export async function applyLevelUp(
  characterId: string,
  choices: LevelChoices[],
): Promise<GameState> {
  const pending = state.player.pendingLevelUp;
  if (!pending) throw new Error("No pending level-up to apply");

  const choicesByLevel = new Map(choices.map((c) => [c.level, c]));

  for (const levelData of pending.levels) {
    const lvl = levelData.level;
    const choice = choicesByLevel.get(lvl);

    // HP gain
    state.player.maxHP += levelData.hpGain;
    state.player.currentHP = Math.min(
      state.player.currentHP + levelData.hpGain,
      state.player.maxHP,
    );

    // Add class features or update existing ones (for scaling features like
    // Brutal Critical 1→2→3, Extra Attack 2→3→4, Sneak Attack dice, etc.)
    for (const feat of levelData.newFeatures) {
      if (feat.name === "Ability Score Improvement") continue;
      const existing = state.player.features.find((f) => f.name === feat.name);
      if (existing) {
        // Feature re-listed at higher level — update its effects
        if (feat.gameplayEffects) {
          existing.gameplayEffects = feat.gameplayEffects;
        }
      } else {
        const chosenOption = choice?.featureChoices?.[feat.name];
        // For fighting style, apply the chosen style's gameplay effects
        let effects = feat.gameplayEffects;
        if (feat.name.toLowerCase() === "fighting style" && chosenOption) {
          const styleEffects = FIGHTING_STYLE_EFFECTS[chosenOption.toLowerCase()];
          if (styleEffects) effects = styleEffects;
        }
        state.player.features.push({
          name: feat.name,
          description: feat.description,
          level: lvl,
          ...(chosenOption ? { chosenOption } : {}),
          ...(effects ? { gameplayEffects: effects } : {}),
        });
      }
    }

    // Add subclass features (mirrors class feature pattern — supports scaling updates)
    for (const feat of levelData.newSubclassFeatures) {
      const existing = state.player.features.find((f) => f.name === feat.name);
      if (existing) {
        // Scaling: update effects for features re-listed at higher level
        if (feat.gameplayEffects) existing.gameplayEffects = feat.gameplayEffects;
      } else {
        state.player.features.push({
          name: feat.name,
          description: feat.description,
          level: lvl,
          source: state.player.subclass ?? undefined,
          ...(feat.type ? { type: feat.type } : {}),
          ...(feat.gameplayEffects ? { gameplayEffects: feat.gameplayEffects } : {}),
        });
      }
    }

    // Subclass selection
    if (levelData.requiresSubclass && choice?.subclassChoice) {
      state.player.subclass = choice.subclassChoice;
    }

    // ASI or Feat
    if (levelData.isASILevel && choice) {
      if (choice.featChoice) {
        // Add feat as a feature
        state.player.features.push({
          name: choice.featChoice,
          ...(choice.featDescription ? { description: choice.featDescription } : {}),
          level: lvl,
          source: "Feat",
        });
      } else if (choice.asiChoices) {
        // Apply ability score increases (capped at 20)
        for (const [stat, bonus] of Object.entries(choice.asiChoices)) {
          if (bonus && bonus > 0) {
            const key = stat as keyof CharacterStats;
            state.player.stats[key] = Math.min(20, state.player.stats[key] + bonus);
          }
        }
      }
    }

    // Spell slots
    if (levelData.spellSlots && Object.keys(levelData.spellSlots).length > 0) {
      state.player.spellSlots = levelData.spellSlots;
      state.player.spellSlotsUsed = {}; // level-up grants full slots
    }

    // Cantrip/spell maxes
    if (levelData.maxCantrips != null) {
      state.player.maxCantrips = levelData.maxCantrips;
    }
    if (levelData.maxKnownSpells != null) {
      state.player.maxKnownSpells = levelData.maxKnownSpells;
    }

    // New cantrips (add to list and create abilities)
    if (choice?.newCantrips?.length) {
      if (!state.player.cantrips) state.player.cantrips = [];
      if (!state.player.abilities) state.player.abilities = [];
      for (const slug of choice.newCantrips) {
        if (!state.player.cantrips.includes(slug)) {
          state.player.cantrips.push(slug);
        }
        // Add cantrip ability if not already present
        if (!state.player.abilities.some(a => a.id === `cantrip:${slug}`)) {
          const srd = await querySRD("spell", slug);
          if (srd) {
            const ability = buildSpellAbility(slug, srd);
            // Override type/level for cantrip
            ability.id = `cantrip:${slug}`;
            ability.type = "cantrip";
            ability.spellLevel = 0;
            state.player.abilities.push(ability);
          }
        }
      }
    }

    // New spells (known casters only — add to list and create abilities)
    if (choice?.newSpells?.length) {
      if (!state.player.knownSpells) state.player.knownSpells = [];
      if (!state.player.abilities) state.player.abilities = [];
      for (const slug of choice.newSpells) {
        if (!state.player.knownSpells.includes(slug)) {
          state.player.knownSpells.push(slug);
        }
        // Add ability if not already present
        if (!state.player.abilities.some(a => a.id === `spell:${slug}`)) {
          const srd = await querySRD("spell", slug);
          if (srd) state.player.abilities.push(buildSpellAbility(slug, srd));
        }
      }
    }

    // Prepared spells (prepared casters — full replacement, rebuild abilities)
    if (choice?.preparedSpells?.length) {
      state.player.preparedSpells = choice.preparedSpells;
      if (!state.player.abilities) state.player.abilities = [];
      // Remove old spell abilities and rebuild from new prepared list
      state.player.abilities = state.player.abilities.filter(a => a.type !== "spell");
      for (const slug of choice.preparedSpells) {
        const srd = await querySRD("spell", slug);
        if (srd) state.player.abilities.push(buildSpellAbility(slug, srd));
      }
    }
    if (levelData.maxPreparedSpells != null) {
      state.player.maxPreparedSpells = levelData.maxPreparedSpells;
    }

    // Update level
    state.player.level = lvl;
    state.player.xpToNextLevel = xpForLevel(lvl + 1);

    // Scale cantrip damage/targetCount from SRD data at this level
    if (state.player.abilities?.length) {
      for (const ability of state.player.abilities) {
        if (ability.type !== "cantrip") continue;
        const slug = ability.id.replace("cantrip:", "");
        const srd = await querySRD("spell", slug);
        const scaling = srd?.cantripScaling as Record<string, { damageRoll?: string; targetCount?: number }> | undefined;
        if (!scaling) continue;
        // Find the highest threshold at or below the new level
        const best = Object.keys(scaling)
          .map(Number)
          .filter((t) => t <= lvl)
          .sort((a, b) => b - a)[0];
        if (best != null) {
          const entry = scaling[String(best)];
          if (entry.damageRoll) ability.damageRoll = entry.damageRoll;
          if (entry.targetCount != null) ability.targetCount = entry.targetCount;
        }
      }
    }
  }

  // Clear pending level-up
  delete state.player.pendingLevelUp;

  await persistState(characterId);
  return state;
}
