/**
 * Shared tool definitions for DM and Combat agents.
 *
 * Both agents use the same three Anthropic tool schemas:
 *   - update_game_state: mutate the player's state
 *   - update_npc: mutate an NPC's state
 *   - query_srd: look up D&D 5e SRD reference data
 *
 * Also exports ROLL_NPC_ATTACKS_TOOL and buildNPCRollContext() for
 * on-demand NPC attack rolling during the combat agent's tool-use loop.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NPC, formatModifier } from "../lib/gameState";
import { rollDice } from "../lib/gameTypes";

// ─── Tool Definitions ────────────────────────────────────────────────────────

export const UPDATE_GAME_STATE_TOOL: Anthropic.Tool = {
  name: "update_game_state",
  description:
    "Call whenever the player's state changes: HP, inventory, conditions, location, or notable story events. Omit fields that haven't changed.",
  input_schema: {
    type: "object",
    properties: {
      hp_delta: {
        type: "number",
        description: "HP change. Negative = damage, positive = healing.",
      },
      items_gained: {
        type: "array",
        items: { type: "string" },
        description: "Items added to inventory.",
      },
      items_lost: {
        type: "array",
        items: { type: "string" },
        description: "Items removed (used, lost, spent).",
      },
      conditions_added: {
        type: "array",
        items: { type: "string" },
        description: "Conditions applied to the player.",
      },
      conditions_removed: {
        type: "array",
        items: { type: "string" },
        description: "Conditions removed from the player.",
      },
      location_changed: {
        type: "string",
        description: "New named location if the player moved (e.g. 'Valdris Docks', 'The Gilded Tankard').",
      },
      scene_update: {
        type: "string",
        description: "ALWAYS include. 1-2 sentence snapshot of what is happening right now (e.g. 'The party negotiates with the innkeeper in the dimly lit tavern').",
      },
      notable_event: {
        type: "string",
        description: "Key event to record (past tense, 1 sentence).",
      },
      gold_delta: {
        type: "number",
        description: "Gold change. Negative = spending, positive = receiving.",
      },
      xp_gained: {
        type: "number",
        description:
          "XP awarded for quest completion, clever roleplay, or milestone moments. Do NOT include monster kill XP — that is handled automatically.",
      },
      weapons_gained: {
        type: "array",
        description:
          "Weapons gained. Creates a combat-ready weapon ability.",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Weapon name, e.g. 'Longsword +1'.",
            },
            dice: {
              type: "string",
              description: "Damage dice, e.g. '1d8', '2d6'.",
            },
            stat: {
              type: "string",
              enum: ["str", "dex", "finesse", "none"],
              description:
                "Ability modifier added to damage. Use 'finesse' for finesse weapons, 'none' for e.g. ammunition.",
            },
            bonus: {
              type: "number",
              description:
                "Flat bonus beyond the ability modifier, e.g. 1 for a +1 magic weapon.",
            },
            damageType: {
              type: "string",
              description: "Damage type, e.g. 'slashing', 'piercing'.",
            },
          },
          required: ["name", "dice", "stat", "bonus"],
        },
      },
      feature_choice_updates: {
        type: "object",
        description:
          'Update a class feature\'s chosen option, keyed by exact feature name. Value should be ONLY the chosen option(s), not labels or descriptions. Example: { "Favored Enemy": "Undead, Dragons", "Cantrips": "Guidance, Sacred Flame, Thaumaturgy" }. Do NOT include prefixes like \'Cantrips Known:\' — just the values.',
        additionalProperties: { type: "string" },
      },
      spell_slots_used: {
        type: "object",
        description:
          "Set spell slot usage. Keys are spell level strings ('1','2',...), values are the NEW total used count. Only include changed levels. Set to 0 to restore (e.g. on long rest).",
        additionalProperties: { type: "number" },
      },
      spells_learned: {
        type: "array",
        items: { type: "string" },
        description: "Spell names to add to known spells.",
      },
      spells_removed: {
        type: "array",
        items: { type: "string" },
        description: "Spell names to remove from known spells.",
      },
      cantrips_learned: {
        type: "array",
        items: { type: "string" },
        description: "Cantrip names to add.",
      },
      npcs_to_create: {
        type: "array",
        description:
          "NPCs or monsters to introduce into the scene. Provide the creature name and SRD slug; stats are looked up automatically.",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description:
                "Creature name, e.g. 'Guard', 'Bandit', 'Giant Rat'.",
            },
            slug: {
              type: "string",
              description:
                "SRD monster slug in kebab-case, e.g. 'guard', 'bandit', 'giant-rat'. Use empty string for custom creatures not in the SRD.",
            },
            disposition: {
              type: "string",
              enum: ["hostile", "neutral", "friendly"],
              description: "Attitude toward the player.",
            },
            count: {
              type: "number",
              description: "Number of this creature to create. Default 1.",
            },
          },
          required: ["name", "slug", "disposition"],
        },
      },
      // ─── Memory tier fields ───
      milestone: {
        type: "string",
        description:
          "A major plot milestone to remember permanently (e.g. 'defeated the sewer king', 'betrayed by captain aldric'). Use sparingly — only for events that should be remembered for the entire campaign. 1-2 per session max.",
      },
      campaign_summary_update: {
        type: "string",
        description:
          "Updated 2-3 sentence campaign summary. Only provide when the story arc shifts significantly (new act, major revelation, fundamental change in the quest). This overwrites the previous summary.",
      },
      quests_added: {
        type: "array",
        items: { type: "string" },
        description: "Quest names to add to active quests when the player accepts or discovers a new objective.",
      },
      quests_completed: {
        type: "array",
        items: { type: "string" },
        description: "Quest names that have been completed or abandoned. These are removed from active quests.",
      },
      npcs_met: {
        type: "array",
        items: { type: "string" },
        description: "IDs of campaign NPCs the player has met or interacted with significantly (use the [id] shown in the NPC list, e.g. \"lysara-thorne\"). Not every shopkeeper — only story-relevant characters from the campaign.",
      },
      act_advance: {
        type: "integer",
        description:
          "Advance the campaign to a new act number (e.g. 2 or 3). Use when the party completes the current act's climax or major plot milestone.",
      },
      encounter_completed: {
        type: "string",
        description:
          "Mark a campaign encounter as completed when the set-piece wraps up. Use the exact encounter name from the NEXT ENCOUNTER section (e.g. 'Dockside Smuggler Ambush').",
      },
      reveal_poi: {
        type: "string",
        description:
          "POI ID to reveal on the exploration map (sets isHidden to false). Use when the party discovers a new location.",
      },
      set_current_poi: {
        type: "string",
        description:
          "Set the current POI ID where the party is located. Use when the party travels to a new point of interest.",
      },
    },
    required: [],
  },
};

/**
 * Slimmed-down version of UPDATE_GAME_STATE_TOOL for combat.
 * Omits fields irrelevant during combat (location, scene, weapons_gained,
 * feature_choice_updates, spells_learned/removed, cantrips_learned, xp_gained).
 * Saves ~400 input tokens per API call.
 */
export const COMBAT_UPDATE_GAME_STATE_TOOL: Anthropic.Tool = {
  name: "update_game_state",
  description:
    "Update the player's state during combat. Omit fields that haven't changed.",
  input_schema: {
    type: "object",
    properties: {
      hp_delta: {
        type: "number",
        description: "HP change. Negative = damage, positive = healing.",
      },
      items_gained: {
        type: "array",
        items: { type: "string" },
        description: "Items looted from fallen enemies.",
      },
      conditions_added: {
        type: "array",
        items: { type: "string" },
        description: "Conditions applied to the player.",
      },
      conditions_removed: {
        type: "array",
        items: { type: "string" },
        description: "Conditions removed from the player.",
      },
      gold_delta: {
        type: "number",
        description: "Gold looted. Positive = receiving.",
      },
      spell_slots_used: {
        type: "object",
        description:
          "Spell slot usage. Keys are spell level strings ('1','2',...), values are the NEW total used count.",
        additionalProperties: { type: "number" },
      },
      npcs_to_create: {
        type: "array",
        description: "Reinforcements to introduce. Stats are looked up automatically.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Creature name." },
            slug: { type: "string", description: "SRD slug in kebab-case." },
            disposition: { type: "string", enum: ["hostile", "neutral", "friendly"] },
            count: { type: "number", description: "Number to create. Default 1." },
          },
          required: ["name", "slug", "disposition"],
        },
      },
    },
    required: [],
  },
};

export const UPDATE_NPC_TOOL: Anthropic.Tool = {
  name: "update_npc",
  description:
    "Update an NPC after taking damage, gaining a condition, or being defeated. Use the NPC's unique id (shown as [id=...] in the combatant list). Use remove_from_scene when they die or leave.",
  input_schema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Unique NPC id (from [id=...] in the active combatants list).",
      },
      hp_delta: {
        type: "number",
        description: "HP change. Negative = damage.",
      },
      conditions_added: { type: "array", items: { type: "string" } },
      conditions_removed: { type: "array", items: { type: "string" } },
      remove_from_scene: {
        type: "boolean",
        description: "True when the NPC is defeated or leaves.",
      },
    },
    required: ["id"],
  },
};

export const QUERY_SRD_TOOL: Anthropic.Messages.Tool = {
  name: "query_srd",
  description:
    "Look up D&D 5e SRD reference data — monster stat blocks, spell descriptions, magic items, conditions, feats, armor, class spell lists, or class level features. " +
    "Call this when you need accurate rules text before narrating. Costs a database read, so only call it when the data is genuinely needed for this turn.",
  input_schema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: [
          "monster",
          "spell",
          "magic_item",
          "condition",
          "feat",
          "background",
          "armor",
          "spell_list",
          "class_level",
        ],
        description: "Category of data to fetch.",
      },
      slug: {
        type: "string",
        description:
          "Kebab-case identifier, e.g. 'giant-rat', 'fireball', 'ring-of-protection', 'wizard'. Omit for class_level.",
      },
      class_slug: {
        type: "string",
        description:
          "Class identifier, e.g. 'wizard'. Required when type is 'class_level'.",
      },
      level: {
        type: "number",
        description: "Level 1–20. Required when type is 'class_level'.",
      },
    },
    required: ["type"],
  },
};

export const QUERY_CAMPAIGN_TOOL: Anthropic.Tool = {
  name: "query_campaign",
  description:
    "Look up detailed campaign data. Use when you need more detail than the compact campaign briefing provides — e.g. full NPC personality/secrets/motivations, an encounter's dmGuidance with specific DC checks and NPC behavior, or an act's mysteries/keyEvents.",
  input_schema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["npc", "act", "encounter"],
        description:
          "'npc' = full personality, secrets, motivations, voice notes for a campaign NPC. " +
          "'act' = encounters list, mysteries, keyEvents, transitionToNextAct for an act. " +
          "'encounter' = a specific encounter's dmGuidance, enemies, rewards, NPC involvement.",
      },
      npc_id: {
        type: "string",
        description: "NPC id (e.g. 'lysara-thorne'). Required when type='npc'.",
      },
      act_number: {
        type: "integer",
        description: "Act number (1, 2, 3). Used by type='act' and type='encounter'. Defaults to current act.",
      },
      encounter_name: {
        type: "string",
        description: "Encounter name to look up (e.g. 'Smuggler Warehouse Raid'). Required when type='encounter'.",
      },
    },
    required: ["type"],
  },
};

// ─── NPC attack rolling ──────────────────────────────────────────────────────

export interface NPCPreRollResult {
  contextString: string;
  totalDamage: number;
  /** Per-NPC damage for computing surviving NPC damage after deaths. */
  perNPC: { id: string; damage: number }[];
}

/**
 * Roll attack dice for every hostile NPC that is still alive.
 * Called on-demand (via the roll_npc_attacks tool) so that NPCs killed
 * by the player's action on this turn never get a roll.
 *
 * Returns the total damage dealt so the route can auto-apply it
 * as a safety net if the agent forgets to call update_game_state.
 */
export function buildNPCRollContext(npcs: NPC[], playerAC: number): NPCPreRollResult {
  const hostile = npcs.filter(
    (n) => n.disposition === "hostile" && n.currentHp > 0,
  );
  if (hostile.length === 0) return { contextString: "No hostile NPCs remain to attack.", totalDamage: 0, perNPC: [] };

  let totalDamage = 0;
  const perNPC: { id: string; damage: number }[] = [];
  const lines = hostile.map((n) => {
    const d20 = Math.floor(Math.random() * 20) + 1;
    const attackTotal = d20 + n.attackBonus;
    const hits = attackTotal >= playerAC;
    const dmg = hits ? rollDice(n.damageDice).total + n.damageBonus : 0;
    if (hits) totalDamage += dmg;
    perNPC.push({ id: n.id, damage: dmg });
    return `  [id=${n.id}] ${n.name}: d20=${d20}${formatModifier(n.attackBonus)}=${attackTotal} vs AC ${playerAC} → ${hits ? `HIT — ${dmg} damage` : "MISS"}`;
  });

  return {
    contextString: `[PRE-ROLLED NPC attacks — ignore any NPC killed by the player this turn]\n${lines.join("\n")}`,
    totalDamage,
    perNPC,
  };
}
