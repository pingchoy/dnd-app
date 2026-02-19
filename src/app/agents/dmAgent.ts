/**
 * DM Agent — Claude Haiku
 *
 * Generates the main Dungeon Master narrative response.
 * Uses tool_use to update game state in the same API call:
 *   - update_game_state : player HP, inventory, conditions, location, story events,
 *                         and npcs_to_create (handled by a separate NPC agent post-call)
 *   - update_npc        : damages, conditions, or removes an NPC from the scene
 *   - query_srd         : looks up D&D 5e SRD reference data
 *
 * NPC attack dice are pre-rolled before the call and injected as context,
 * so the DM narrates mechanically accurate outcomes with no extra API call.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  anthropic,
  HISTORY_WINDOW,
  MAX_TOKENS,
  MODELS,
} from "../lib/anthropic";
import {
  GameState,
  NPC,
  StateChanges,
  UpdateNPCInput,
  serializePlayerState,
  serializeStoryState,
  updateNPC,
} from "../lib/gameState";
import { rollDice } from "../lib/gameTypes";
import { querySRD } from "../lib/characterStore";
import { RulesOutcome } from "./rulesAgent";

// ─── Tools ────────────────────────────────────────────────────────────────────

const UPDATE_GAME_STATE_TOOL: Anthropic.Tool = {
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
        description: "New location if the player moved.",
      },
      scene_update: {
        type: "string",
        description: "Current scene state (1-2 sentences).",
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
      weapon_damage: {
        type: "object",
        description:
          "For each weapon in items_gained, provide its damage breakdown keyed by the exact item name.",
        additionalProperties: {
          type: "object",
          properties: {
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
          },
          required: ["dice", "stat", "bonus"],
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
    },
    required: [],
  },
};

const UPDATE_NPC_TOOL: Anthropic.Tool = {
  name: "update_npc",
  description:
    "Update an NPC after taking damage, gaining a condition, or being defeated. Use remove_from_scene when they die or leave.",
  input_schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "NPC name (must match an existing active NPC).",
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
    required: ["name"],
  },
};

const QUERY_SRD_TOOL: Anthropic.Messages.Tool = {
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

// ─── NPC pre-roll ─────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * Pre-roll attack dice for every hostile NPC in the scene.
 * Injected into the DM's context so outcomes are mechanically fair
 * without requiring an extra API call.
 */
function buildNPCRollContext(npcs: NPC[], playerAC: number): string {
  const hostile = npcs.filter(
    (n) => n.disposition === "hostile" && n.currentHp > 0,
  );
  if (hostile.length === 0) return "";

  const lines = hostile.map((n) => {
    const d20 = Math.floor(Math.random() * 20) + 1;
    const attackTotal = d20 + n.attackBonus;
    const hits = attackTotal >= playerAC;
    const dmg = hits ? rollDice(n.damageDice).total + n.damageBonus : 0;
    return `  ${n.name}: d20=${d20}${fmt(n.attackBonus)}=${attackTotal} vs AC ${playerAC} → ${hits ? `HIT — ${dmg} damage` : "MISS"}`;
  });

  return `\n\n[Pre-rolled NPC attack dice — use these if any NPC attacks this turn]\n${lines.join("\n")}`;
}

// ─── System prompt ────────────────────────────────────────────────────────────

/**
 * Static DM instructions — identical across every turn and every player.
 * Placed first in the system prompt so Anthropic's prompt caching can
 * cache the prefix (instructions + tools) and reuse it across turns.
 */
const STATIC_DM_INSTRUCTIONS = `You are an experienced, immersive Dungeon Master running a D&D 5e campaign.

YOUR ROLE:
- Narrate in second person ("You see…", "You hear…"), present tense, vivid and atmospheric.
- Strictly enforce D&D 5e rules. Use provided dice roll outcomes — do not invent your own.
- Call update_game_state whenever the player's HP, inventory, conditions, location, or story state changes. When adding a weapon via items_gained, always include weapon_damage with the item name as the key and { dice, stat, bonus } as the value — e.g. a Longsword +1 is { dice: "1d8", stat: "str", bonus: 1 }. The modifier is computed automatically from the player's current stats.
- Use feature_choice_updates in update_game_state when the player changes or gains a class feature choice (e.g. learning new cantrips, gaining an additional Favored Enemy, changing a Fighting Style). The key must match an existing feature name from the player's features list exactly. The value should be ONLY the chosen option(s), not labels — e.g. { "Spellcasting": "Guidance, Sacred Flame, Thaumaturgy" }.
- When the player asks about their class features or wants to change feature choices, use query_srd with type "class_level" to look up the full feature descriptions first. This tells you exactly what the feature allows (e.g. number of cantrips known, valid options).
- Use query_srd whenever you need accurate rules text you are not fully confident about — monster stats, spell descriptions, class features, conditions, etc. It is better to look it up than to guess incorrectly.
- When introducing ANY new creature, include it in update_game_state's npcs_to_create array with the creature name, SRD slug (kebab-case, e.g. "guard", "bandit", "giant-rat", "goblin", "skeleton", "wolf"), and disposition. Stats are looked up automatically from the SRD — do NOT guess stats. Use an empty string for the slug if the creature is custom/homebrew. Just provide the slug and narrate the creature's entrance.
- Call update_npc after a creature takes damage, gains a condition, or is defeated. Monster kill XP is awarded automatically — do NOT add it to xp_gained.
- NEVER mention your tools, functions, or stat blocks to the player. Never say "let me create" or "I'll generate" — just narrate the story and call tools silently in the background.
- Use update_game_state xp_gained when the player completes a quest, achieves a meaningful milestone, or demonstrates exceptional roleplay. Typical quest XP: minor 50–150, moderate 200–500, major 500–1000+.
- Use pre-rolled NPC attack dice exactly as provided. Do not re-roll or ignore them.
- Use pre-rolled player damage exactly as provided. When the player hits, apply that exact total as hp_delta (negated) to the target NPC via update_npc. Do not invent your own damage numbers.
- SPELLCASTING: The player's known spells, cantrips, and remaining spell slots are in their character state.
  When a leveled spell is cast, call update_game_state with spell_slots_used to set the new used count for that level.
  On long rest, reset all spell_slots_used values to 0. The player can only cast spells they know.
  Cantrips cost no slots. To swap spells on long rest, use spells_removed + spells_learned together.
  Spell save DC and spell attack are pre-computed in the character state — use those values.
  Use query_srd("spell", slug) for spell details (slug = lowercase hyphenated name, e.g. "cure-wounds").
- Do not allow impossible actions or meta-gaming.
- Keep responses to 2–4 paragraphs. Do not end with a question; offer information and let the player decide.
- If the player reaches 0 HP, narrate the dramatic fall and end combat.

FORMATTING:
- Use **bold** for key names, places, and dramatic moments.
- Use *italics* for atmosphere, whispers, or inner sensations.
- Use --- to separate distinct scene beats when appropriate.
- Do not use headers (#) or bullet lists in narrative prose.

TONE: Dark fantasy. Evershade is a city of secrets, shadow, and danger. Rewards careful play.`;

function buildSystemPrompt(
  state: GameState,
): Anthropic.Messages.TextBlockParam[] {
  return [
    {
      type: "text",
      text: STATIC_DM_INSTRUCTIONS,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `CAMPAIGN STATE:\n${serializeStoryState(state.story)}\n\nPLAYER CHARACTER:\n${serializePlayerState(state.player)}`,
    },
  ];
}

// ─── Main agent function ──────────────────────────────────────────────────────

export interface DMResponse {
  narrative: string;
  stateChanges: StateChanges | null;
  inputTokens: number;
  outputTokens: number;
}

/** Maximum query_srd calls allowed per DM response to limit Firestore reads. */
const MAX_SRD_QUERIES = 3;
/** Maximum total loop iterations (guards against unexpected infinite loops). */
const MAX_ITERATIONS = 8;

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

  const historyMessages: Anthropic.MessageParam[] =
    gameState.conversationHistory
      .slice(-HISTORY_WINDOW * 2)
      .map((turn) => ({ role: turn.role, content: turn.content }));

  const messages: Anthropic.MessageParam[] = [
    ...historyMessages,
    { role: "user", content: userContent },
  ];

  const tools: Anthropic.Messages.Tool[] = [
    UPDATE_GAME_STATE_TOOL,
    UPDATE_NPC_TOOL,
    { ...QUERY_SRD_TOOL, cache_control: { type: "ephemeral" } },
  ];

  let narrative = "";
  let stateChanges: StateChanges | null = null;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let srdQueryCount = 0;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    console.log(`[DM Agent] Loop iteration ${iter + 1}/${MAX_ITERATIONS} — calling ${MODELS.NARRATIVE}...`);
    const response = await anthropic.messages.create({
      model: MODELS.NARRATIVE,
      max_tokens: MAX_TOKENS.NARRATIVE,
      system: buildSystemPrompt(gameState),
      tools,
      messages,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;
    console.log(`[DM Agent] Response: stop_reason=${response.stop_reason}, tokens={ in: ${response.usage.input_tokens}, out: ${response.usage.output_tokens} }`);

    // Collect narrative text from this turn
    for (const block of response.content) {
      if (block.type === "text") narrative += block.text;
    }

    // Done — no more tool calls needed
    if (response.stop_reason === "end_turn") {
      console.log("[DM Agent] end_turn — narrative complete");
      break;
    }

    // Build tool results for every tool_use block in this response
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    let hasQuerySRD = false;

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      if (block.name === "update_game_state") {
        console.log("[DM Agent] Tool call: update_game_state", JSON.stringify(block.input, null, 2));
        stateChanges = block.input as StateChanges;
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: '{"ok":true}',
        });
      } else if (block.name === "update_npc") {
        console.log("[DM Agent] Tool call: update_npc", JSON.stringify(block.input));
        updateNPC(block.input as UpdateNPCInput);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: '{"ok":true}',
        });
      } else if (block.name === "query_srd") {
        hasQuerySRD = true;
        const input = block.input as {
          type: string;
          slug?: string;
          class_slug?: string;
          level?: number;
        };
        console.log(`[DM Agent] Tool call: query_srd (${srdQueryCount + 1}/${MAX_SRD_QUERIES})`, JSON.stringify(input));

        let resultContent: string;
        if (srdQueryCount >= MAX_SRD_QUERIES) {
          console.log("[DM Agent] SRD query limit reached — returning error to model");
          resultContent =
            '{"error":"SRD query limit reached for this turn. Use your existing knowledge."}';
        } else {
          srdQueryCount++;
          const docSlug =
            input.type === "class_level"
              ? `${input.class_slug}_${input.level}`
              : (input.slug ?? "");
          const data = await querySRD(input.type, docSlug);
          console.log(`[DM Agent] SRD result for "${docSlug}":`, data ? "found" : "not found");
          resultContent = data
            ? JSON.stringify(data)
            : `{"error":"No ${input.type} found for '${docSlug}'"}`;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: resultContent,
        });
      }
    }

    if (toolResults.length === 0) break; // no tool_use blocks — shouldn't happen, but guard

    // Append assistant turn + tool results so the model can continue
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    // If this iteration had no SRD queries, only state-mutation tools were called.
    // The model is done after receiving their acknowledgements.
    if (!hasQuerySRD) {
      console.log("[DM Agent] No SRD queries this iteration — breaking loop");
      break;
    }
  }

  return {
    narrative: narrative.trim(),
    stateChanges,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };
}
