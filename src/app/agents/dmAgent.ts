/**
 * DM Agent — Claude Haiku
 *
 * Generates the main Dungeon Master narrative response.
 * Uses tool_use to update game state in the same API call:
 *   - update_game_state : player HP, inventory, conditions, location, story events
 *   - create_npc        : generates a stat block for a new creature (pre-planned or improvised)
 *   - update_npc        : damages, conditions, or removes an NPC from the scene
 *
 * NPC attack dice are pre-rolled before the call and injected as context,
 * so the DM narrates mechanically accurate outcomes with no extra API call.
 */

import Anthropic from "@anthropic-ai/sdk";
import { anthropic, HISTORY_WINDOW, MAX_TOKENS, MODELS } from "../lib/anthropic";
import {
  CreateNPCInput,
  GameState,
  NPC,
  StateChanges,
  UpdateNPCInput,
  createNPC,
  serializePlayerState,
  serializeStoryState,
  updateNPC,
} from "../lib/gameState";
import { RulesOutcome } from "./rulesAgent";

// ─── Tools ────────────────────────────────────────────────────────────────────

const UPDATE_GAME_STATE_TOOL: Anthropic.Tool = {
  name: "update_game_state",
  description:
    "Call whenever the player's state changes: HP, inventory, conditions, location, or notable story events. Omit fields that haven't changed.",
  input_schema: {
    type: "object",
    properties: {
      hp_delta:           { type: "number",  description: "HP change. Negative = damage, positive = healing." },
      items_gained:       { type: "array", items: { type: "string" }, description: "Items added to inventory." },
      items_lost:         { type: "array", items: { type: "string" }, description: "Items removed (used, lost, spent)." },
      conditions_added:   { type: "array", items: { type: "string" }, description: "Conditions applied to the player." },
      conditions_removed: { type: "array", items: { type: "string" }, description: "Conditions removed from the player." },
      location_changed:   { type: "string", description: "New location if the player moved." },
      scene_update:       { type: "string", description: "Current scene state (1-2 sentences)." },
      notable_event:      { type: "string", description: "Key event to record (past tense, 1 sentence)." },
      gold_delta:         { type: "number",  description: "Gold change. Negative = spending, positive = receiving." },
      xp_gained:          { type: "number",  description: "XP awarded for quest completion, clever roleplay, or milestone moments. Do NOT include monster kill XP — that is handled automatically." },
      weapon_damage: {
        type: "object",
        description: "For each weapon in items_gained, provide its damage breakdown keyed by the exact item name.",
        additionalProperties: {
          type: "object",
          properties: {
            dice:  { type: "string", description: "Damage dice, e.g. '1d8', '2d6'." },
            stat:  { type: "string", enum: ["str", "dex", "finesse", "none"], description: "Ability modifier added to damage. Use 'finesse' for finesse weapons, 'none' for e.g. ammunition." },
            bonus: { type: "number", description: "Flat bonus beyond the ability modifier, e.g. 1 for a +1 magic weapon." },
          },
          required: ["dice", "stat", "bonus"],
        },
      },
    },
    required: [],
  },
};

const CREATE_NPC_TOOL: Anthropic.Tool = {
  name: "create_npc",
  description:
    "Create a stat block for any new NPC or monster entering the scene — whether pre-planned or improvised. Use D&D 5e-appropriate stats for the creature type. Call this before the creature takes any actions.",
  input_schema: {
    type: "object",
    properties: {
      name:                { type: "string", description: "Creature name, e.g. 'Bandit', 'City Guard', 'Giant Rat'." },
      ac:                  { type: "number", description: "Armor Class." },
      max_hp:              { type: "number", description: "Maximum hit points." },
      attack_bonus:        { type: "number", description: "Attack roll bonus added to d20." },
      damage_dice:         { type: "string", description: "Damage dice expression, e.g. '1d6', '2d4'." },
      damage_bonus:        { type: "number", description: "Flat bonus added to damage roll." },
      saving_throw_bonus:  { type: "number", description: "General saving throw bonus." },
      xp_value:            { type: "number", description: "XP awarded to the player when this creature is defeated. Use standard D&D 5e XP values (e.g. Giant Rat 25, Bandit 25, Guard 100, Veteran 1100, Mage 2300)." },
      disposition:         { type: "string", enum: ["hostile", "neutral", "friendly"], description: "Attitude toward the player." },
      notes:               { type: "string", description: "Special abilities or notable traits (brief)." },
    },
    required: ["name", "ac", "max_hp", "attack_bonus", "damage_dice", "damage_bonus", "xp_value", "disposition"],
  },
};

const UPDATE_NPC_TOOL: Anthropic.Tool = {
  name: "update_npc",
  description:
    "Update an NPC after taking damage, gaining a condition, or being defeated. Use remove_from_scene when they die or leave.",
  input_schema: {
    type: "object",
    properties: {
      name:               { type: "string",  description: "NPC name (must match an existing active NPC)." },
      hp_delta:           { type: "number",  description: "HP change. Negative = damage." },
      conditions_added:   { type: "array", items: { type: "string" } },
      conditions_removed: { type: "array", items: { type: "string" } },
      remove_from_scene:  { type: "boolean", description: "True when the NPC is defeated or leaves." },
    },
    required: ["name"],
  },
};

// ─── NPC pre-roll ─────────────────────────────────────────────────────────────

function rollDice(expression: string): number {
  const match = expression.match(/^(\d+)d(\d+)$/i);
  if (!match) return 0;
  let total = 0;
  const count = parseInt(match[1]);
  const sides = parseInt(match[2]);
  for (let i = 0; i < count; i++) total += Math.floor(Math.random() * sides) + 1;
  return total;
}

function fmt(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * Pre-roll attack dice for every hostile NPC in the scene.
 * Injected into the DM's context so outcomes are mechanically fair
 * without requiring an extra API call.
 */
function buildNPCRollContext(npcs: NPC[], playerAC: number): string {
  const hostile = npcs.filter((n) => n.disposition === "hostile" && n.currentHp > 0);
  if (hostile.length === 0) return "";

  const lines = hostile.map((n) => {
    const d20 = Math.floor(Math.random() * 20) + 1;
    const attackTotal = d20 + n.attackBonus;
    const hits = attackTotal >= playerAC;
    const dmg = hits ? rollDice(n.damageDice) + n.damageBonus : 0;
    return `  ${n.name}: d20=${d20}${fmt(n.attackBonus)}=${attackTotal} vs AC ${playerAC} → ${hits ? `HIT — ${dmg} damage` : "MISS"}`;
  });

  return `\n\n[Pre-rolled NPC attack dice — use these if any NPC attacks this turn]\n${lines.join("\n")}`;
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(state: GameState): string {
  return `You are an experienced, immersive Dungeon Master running a D&D 5e campaign.

CAMPAIGN STATE:
${serializeStoryState(state.story)}

PLAYER CHARACTER:
${serializePlayerState(state.player)}

YOUR ROLE:
- Narrate in second person ("You see…", "You hear…"), present tense, vivid and atmospheric.
- Strictly enforce D&D 5e rules. Use provided dice roll outcomes — do not invent your own.
- Call update_game_state whenever the player's HP, inventory, conditions, location, or story state changes. When adding a weapon via items_gained, always include weapon_damage with the item name as the key and { dice, stat, bonus } as the value — e.g. a Longsword +1 is { dice: "1d8", stat: "str", bonus: 1 }. The modifier is computed automatically from the player's current stats.
- Call create_npc when introducing ANY new creature (pre-planned or improvised) before it acts. Always set xp_value to the standard D&D 5e XP for that creature type.
- Call update_npc after a creature takes damage, gains a condition, or is defeated. Monster kill XP is awarded automatically — do NOT add it to xp_gained.
- Use update_game_state xp_gained when the player completes a quest, achieves a meaningful milestone, or demonstrates exceptional roleplay. Typical quest XP: minor 50–150, moderate 200–500, major 500–1000+.
- Use pre-rolled NPC attack dice exactly as provided. Do not re-roll or ignore them.
- Do not allow impossible actions or meta-gaming.
- Keep responses to 2–4 paragraphs. Do not end with a question; offer information and let the player decide.
- If the player reaches 0 HP, narrate the dramatic fall and end combat.

FORMATTING:
- Use **bold** for key names, places, and dramatic moments.
- Use *italics* for atmosphere, whispers, or inner sensations.
- Use --- to separate distinct scene beats when appropriate.
- Do not use headers (#) or bullet lists in narrative prose.

TONE: Dark fantasy. Evershade is a city of secrets, shadow, and danger. Rewards careful play.`;
}

// ─── Main agent function ──────────────────────────────────────────────────────

export interface DMResponse {
  narrative: string;
  stateChanges: StateChanges | null;
  inputTokens: number;
  outputTokens: number;
}

export async function getDMResponse(
  playerInput: string,
  gameState: GameState,
  rulesOutcome: RulesOutcome | null,
): Promise<DMResponse> {
  let userContent = playerInput;

  // Append player rules check result
  if (rulesOutcome) {
    userContent += `\n\n[Player roll result — d20 was ${rulesOutcome.roll}]\n${rulesOutcome.raw}`;
  }

  // Append pre-rolled NPC attack dice for this turn
  const npcContext = buildNPCRollContext(
    gameState.story.activeNPCs,
    gameState.player.armorClass,
  );
  if (npcContext) userContent += npcContext;

  const historyMessages: Anthropic.MessageParam[] = gameState.conversationHistory
    .slice(-HISTORY_WINDOW * 2)
    .map((turn) => ({ role: turn.role, content: turn.content }));

  const messages: Anthropic.MessageParam[] = [
    ...historyMessages,
    { role: "user", content: userContent },
  ];

  const response = await anthropic.messages.create({
    model: MODELS.NARRATIVE,
    max_tokens: MAX_TOKENS.NARRATIVE,
    system: buildSystemPrompt(gameState),
    tools: [UPDATE_GAME_STATE_TOOL, CREATE_NPC_TOOL, UPDATE_NPC_TOOL],
    messages,
  });

  let narrative = "";
  let stateChanges: StateChanges | null = null;

  for (const block of response.content) {
    if (block.type === "text") {
      narrative += block.text;
    } else if (block.type === "tool_use") {
      if (block.name === "update_game_state") {
        // Collect changes — the route will apply + persist them
        stateChanges = block.input as StateChanges;
      } else if (block.name === "create_npc") {
        createNPC(block.input as CreateNPCInput);
      } else if (block.name === "update_npc") {
        updateNPC(block.input as UpdateNPCInput);
      }
    }
  }

  return {
    narrative: narrative.trim(),
    stateChanges,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
