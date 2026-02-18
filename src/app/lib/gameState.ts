/**
 * In-memory game state singleton.
 *
 * Initialised from Xavier's character sheet (Player_Character_Xavier.json)
 * and The Shadows of Evershade campaign (Campaign_Details.json).
 *
 * A Firestore integration can replace this module later without touching
 * the agent or route code — just swap the getter/setter functions.
 */

export interface CharacterStats {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface PlayerState {
  name: string;
  characterClass: string;
  level: number;
  race: string;
  currentHP: number;
  maxHP: number;
  armorClass: number;
  stats: CharacterStats;
  savingThrowProficiencies: string[];
  skillProficiencies: string[];
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

export const OPENING_NARRATIVE = `You are **Xavier**, a **Half-Elf Rogue** of considerable skill and questionable reputation. Five levels deep into a life of shadow-work, you carry a shortsword at your hip, a hand crossbow across your back, and a set of thieves' tools that have never met a lock they couldn't eventually persuade.

---

The city of **Evershade** swallows you whole the moment you pass through its iron gates. It is a place of crooked spires, candlelit alleys, and the persistent smell of river mud and old secrets. You have come here following rumours — three merchants, a city guard, and a minor noble have vanished without trace over the past fortnight. No bodies. No ransom notes. Just absence, spreading through the city like a cold draft under a door.

Your boots find the warped floorboards of **The Dagger's Edge Tavern**, a low-ceilinged den wedged between a tannery and a moneylender on the edge of the Merchant Quarter. The common room is half-full despite the early hour. Dice rattle somewhere in the back. A barmaid moves between tables with the efficiency of someone who has learned not to make eye contact.

*In the far corner, half-hidden by the shadow of a support beam, sits a hooded figure nursing a drink they haven't touched.* They have not looked up since you entered — and yet you have the distinct impression they knew you were coming.

What do you do?`;

// ─── Singleton state ──────────────────────────────────────────────────────────

export const INITIAL_GAME_STATE: GameState = {
  player: {
    name: "Xavier",
    characterClass: "Rogue",
    level: 5,
    race: "Half-Elf",
    currentHP: 27,
    maxHP: 27,
    armorClass: 14,
    stats: {
      strength: 8,
      dexterity: 16,
      constitution: 12,
      intelligence: 14,
      wisdom: 10,
      charisma: 13,
    },
    savingThrowProficiencies: ["Dexterity", "Intelligence"],
    skillProficiencies: [
      "Stealth",
      "Sleight of Hand",
      "Thieves' Tools",
      "Perception",
      "Deception",
      "Athletics",
      "Persuasion",
    ],
    inventory: [
      "Shortsword",
      "Hand Crossbow (20 bolts)",
      "Leather Armor",
      "Thieves' Tools",
      "Burglar's Pack",
      "Dagger (x2)",
    ],
    conditions: [],
    gold: 50,
  },

  story: {
    campaignTitle: "The Shadows of Evershade",
    campaignBackground:
      "A sprawling city with forests, mountains, and ancient ruins. Mysterious disappearances plague the population. A dark conspiracy involving corrupt nobles and an ancient sorcerer named Lord Malakar lurks beneath the surface.",
    currentLocation: "Evershade City — The Dagger's Edge Tavern",
    currentScene:
      "Xavier has just arrived in Evershade City. The Dagger's Edge Tavern buzzes with nervous whispers about recent disappearances. A hooded figure in the corner watches the door.",
    activeQuests: ["Investigate the mysterious disappearances in Evershade"],
    importantNPCs: [
      "Captain Elara Thorne (City Guard, ally)",
      "Robin (Rogue informant, neutral)",
      "Seraphina (Cleric healer, ally)",
      "Lord Malakar (Ancient sorcerer, main villain — unknown to player)",
    ],
    activeNPCs: [],
    recentEvents: [],
  },

  conversationHistory: [],
};

// Server-side mutable copy
let state: GameState = {
  ...INITIAL_GAME_STATE,
  player: { ...INITIAL_GAME_STATE.player },
  story: { ...INITIAL_GAME_STATE.story, activeNPCs: [], importantNPCs: [...INITIAL_GAME_STATE.story.importantNPCs] },
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
