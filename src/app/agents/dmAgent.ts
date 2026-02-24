/**
 * DM Agent — Claude Haiku
 *
 * Generates the main Dungeon Master narrative response for exploration,
 * roleplay, and story progression. Combat is handled by combatAgent.ts.
 *
 * Uses tool_use to update game state in the same API call:
 *   - update_game_state : player HP, inventory, conditions, location, story events,
 *                         and npcs_to_create (handled by a separate NPC agent post-call)
 *   - update_npc        : damages, conditions, or removes an NPC from the scene
 *   - query_srd         : looks up D&D 5e SRD reference data
 */

import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MAX_TOKENS, MODELS } from "../lib/anthropic";
import {
  GameState,
  StateChanges,
  UpdateNPCInput,
  serializePlayerState,
  serializeStoryState,
  updateNPC,
} from "../lib/gameState";
import { getRecentMessages } from "../lib/messageStore";
import { RulesOutcome } from "./rulesAgent";
import { handleSRDQuery, handleCampaignQuery } from "./agentUtils";
import {
  UPDATE_GAME_STATE_TOOL,
  UPDATE_NPC_TOOL,
  QUERY_SRD_TOOL,
  QUERY_CAMPAIGN_TOOL,
} from "./tools";

// ─── System prompt ────────────────────────────────────────────────────────────

/**
 * Static DM instructions — exploration, roleplay, and story progression.
 * Combat-specific rules (damage routing, pre-rolled dice, death at 0 HP)
 * are handled by the combat agent instead.
 */
const STATIC_DM_INSTRUCTIONS = `You are an experienced, immersive Dungeon Master running a D&D 5e campaign.

YOUR ROLE:
- Narrate in second person ("You see…", "You hear…"), present tense, vivid and atmospheric.
- Strictly enforce D&D 5e rules. Use provided dice roll outcomes — do not invent your own.
- Call update_game_state whenever the player's HP, inventory, conditions, location, or story state changes. When adding a weapon via items_gained, always include weapons_gained with { name, dice, stat, bonus } — e.g. a Longsword +1 is { name: "Longsword +1", dice: "1d8", stat: "str", bonus: 1 }. The modifier is computed automatically from the player's current stats.
- Use feature_choice_updates in update_game_state when the player changes or gains a class feature choice (e.g. learning new cantrips, gaining an additional Favored Enemy, changing a Fighting Style). The key must match an existing feature name from the player's features list exactly. The value should be ONLY the chosen option(s), not labels — e.g. { "Spellcasting": "Guidance, Sacred Flame, Thaumaturgy" }.
- When the player asks about their class features or wants to change feature choices, use query_srd with type "class_level" to look up the full feature descriptions first. This tells you exactly what the feature allows (e.g. number of cantrips known, valid options).
- Use query_srd whenever you need accurate rules text you are not fully confident about — monster stats, spell descriptions, class features, conditions, etc. It is better to look it up than to guess incorrectly.
- When introducing ANY new creature, include it in update_game_state's npcs_to_create array with the creature name, SRD slug (kebab-case, e.g. "guard", "bandit", "giant-rat", "goblin", "skeleton", "wolf"), and disposition. Stats are looked up automatically from the SRD — do NOT guess stats. Use an empty string for the slug if the creature is custom/homebrew. Just provide the slug and narrate the creature's entrance.
- COMBAT INITIATION: Creating hostile creatures via npcs_to_create is the ONLY way to start combat. A separate combat agent takes over once hostile NPCs exist. You MUST call update_game_state with npcs_to_create (disposition: "hostile") whenever enemies appear — an ambush springs, guards turn hostile, monsters attack, etc. NEVER narrate combat damage, attack rolls, or a fight scene without first creating the enemies. Your job is to narrate the enemies' dramatic entrance and set the scene — the combat system handles the rest.
  When NEXT ENCOUNTER lists enemies (e.g. "Enemies: 3x bandit, 1x thug"), use those exact slugs and counts in npcs_to_create when the encounter triggers.
- Call update_npc after a creature takes damage, gains a condition, or is defeated. Monster kill XP is awarded automatically — do NOT add it to xp_gained.
- NEVER mention your tools, functions, or stat blocks to the player. Never say "let me create" or "I'll generate" — just narrate the story and call tools silently in the background.
- Use update_game_state xp_gained when the player completes a quest, achieves a meaningful milestone, or demonstrates exceptional roleplay. Typical quest XP: minor 50–150, moderate 200–500, major 500–1000+.
- SPELLCASTING: The player's castable spells are shown as either "Prepared Spells" (Wizard, Cleric, Druid, Paladin) or "Spells" (Bard, Sorcerer, Ranger, Warlock) in their character state. The player can only cast spells from whichever list is present.
  When a leveled spell is cast, call update_game_state with spell_slots_used to set the new used count for that level.
  On long rest, reset all spell_slots_used values to 0.
  Cantrips cost no slots. To swap spells on long rest, use spells_removed + spells_learned together.
  Spell save DC and spell attack are pre-computed in the character state — use those values.
  Use query_srd("spell", slug) for spell details (slug = lowercase hyphenated name, e.g. "cure-wounds").
- Do not allow impossible actions or meta-gaming.
- Keep responses to 1-2 paragraphs. Do not end with a question; offer information and let the player decide.

STATE TRACKING — use update_game_state on EVERY turn to keep the game state current:
- scene_update: ALWAYS include this. A 1-2 sentence summary of what is happening RIGHT NOW ("The party stands in the dimly lit tavern, negotiating with the innkeeper", "Combat just ended in the dockside warehouse; crates are smashed and the air smells of smoke"). This is the player's at-a-glance scene context.
- location_changed: Set whenever the player moves to a new named location ("Valdris Docks", "The Gilded Tankard", "Sewers beneath the market district").
- set_current_poi: ALWAYS set this when the party travels to a different POI on the exploration map. Use the POI's id (e.g. "poi_docks"). This updates the map marker so the player sees where they are. If the player says they want to go somewhere that matches a POI name, set it immediately.
- notable_event: Granular short-term events ("spoke with the barkeep", "found a hidden passage", "bought a healing potion"). Record one per turn when something noteworthy happens.
- milestone: Permanent major plot beats only ("defeated the shadow dragon", "betrayed by captain aldric", "completed the thieves guild initiation"). Use sparingly — 1-2 per session at most. These are never forgotten.
- campaign_summary_update: Rewrite only when the story fundamentally shifts — a new act begins, a major revelation changes everything, or the core quest changes direction. Do NOT update for minor progress.
- quests_added / quests_completed: Track quest objectives as the player accepts or resolves them. Use short descriptive names ("find the cult leader", "retrieve lyra's stolen holy symbol").
- npcs_met: Record campaign NPCs the player has met using their [id] from the NPC list (e.g. "lysara-thorne", "captain-aldric-vane"). Only story-relevant characters, not every shopkeeper or guard.

FORMATTING:
- Use **bold** for key names, places, and dramatic moments.
- Use *italics* for atmosphere, whispers, or inner sensations.
- Use --- to separate distinct scene beats when appropriate.
- Do not use headers (#) or bullet lists in narrative prose.

CAMPAIGN CONTEXT:
- When a CAMPAIGN BRIEFING is provided, treat it as private DM notes — NEVER reveal plot spoilers, NPC secrets, or future events.
- Guide the story toward the current act's plot points naturally through NPC dialogue and environmental storytelling — never force the player onto rails.
- Use act_advance in update_game_state when the party completes a major act transition. Set it to the next act number.
- When a campaign story beat (shown in NEXT STORY BEAT) reaches its conclusion — combat won, social scene resolved, puzzle completed, exploration finished — call update_game_state with story_beat_completed set to the beat name. This advances the story to the next beat.
- CURRENT POSITION is the authoritative source of where the player is RIGHT NOW. It overrides any location mentioned in conversation history. If the player has moved to a new region, narrate the new surroundings — do not reference the previous location as if they are still there.
- EXPLORATION MAP: When a CURRENT EXPLORATION MAP section is provided, it lists POIs the party can visit. The party's current location is marked with "← PARTY IS HERE". POIs marked [HIDDEN from players] have not yet been discovered — reveal them using reveal_poi when the party finds or learns about them.

WHEN TO USE query_campaign:
- type='npc': Call BEFORE roleplaying a named campaign NPC in dialogue or a significant interaction. The briefing only shows traits — query_campaign gives you their full personality, secrets, motivations, and voice notes for the CURRENT ACT so you can portray them authentically. Always do this the first time an NPC speaks or acts on-screen. NPC data is act-scoped — it only contains what you should know right now, never future-act spoilers.
- type='story_beat': Call when the NEXT STORY BEAT is about to trigger — the player arrives at the beat's location or the narrative naturally leads into it. This gives you dmGuidance with specific DC checks, NPC behavior, and narrative beats to run the scene properly. Do this BEFORE narrating the beat, not during.
- type='act': Call when you need the full act structure — e.g. to understand what mysteries remain, what hooks to use, or what triggers the transition to the next act.
- Do NOT call query_campaign for information already visible in the briefing. Only call it when you need deeper detail.

TONE: Match the campaign's established theme and setting. Default to dark fantasy. Rewards careful play.`;

/** Static-only system prompt — cached across requests. */
const SYSTEM_PROMPT: Anthropic.Messages.TextBlockParam[] = [
  {
    type: "text",
    text: STATIC_DM_INSTRUCTIONS,
    cache_control: { type: "ephemeral" },
  },
];

// ─── Main agent function ──────────────────────────────────────────────────────

export interface DMResponse {
  narrative: string;
  stateChanges: StateChanges | null;
  /** Total pre-rolled NPC damage dealt to the player this turn. */
  npcDamagePreRolled: number;
  inputTokens: number;
  outputTokens: number;
}

/** Maximum query_srd calls allowed per DM response to limit Firestore reads. */
const MAX_SRD_QUERIES = 3;
/** Maximum total loop iterations (guards against unexpected infinite loops). */
const MAX_ITERATIONS = 8;
/** Number of conversation history entries to include (5 turns = 10 entries). */
const DM_HISTORY_ENTRIES = 10;

export async function getDMResponse(
  playerInput: string,
  gameState: GameState,
  rulesOutcome: RulesOutcome | null,
  sessionId: string,
  /** Optional DM context (campaign briefing + spatial context) — injected as-is. */
  dmContext?: string,
  /** Campaign slug for on-demand query_campaign tool calls. */
  campaignSlug?: string,
): Promise<DMResponse> {
  // Prepend dynamic game state so the static system prompt + tools stay fully cacheable
  let userContent = `CAMPAIGN STATE:\n${serializeStoryState(gameState.story)}`;

  // DM context injection — campaign briefing and/or spatial context
  if (dmContext) {
    userContent += `\n\n${dmContext}`;
  }

  userContent += `\n\nPLAYER CHARACTER:\n${serializePlayerState(gameState.player)}\n\n---\n\n${playerInput}`;

  // Append player rules check result
  if (rulesOutcome) {
    userContent += `\n\n[Player roll result — d20 was ${rulesOutcome.roll}]\n${rulesOutcome.raw}`;
  }

  // Fetch recent messages from subcollection for agent context window
  const recentMessages = await getRecentMessages(sessionId, DM_HISTORY_ENTRIES);
  const historyMessages: Anthropic.MessageParam[] = recentMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const messages: Anthropic.MessageParam[] = [
    ...historyMessages,
    { role: "user", content: userContent },
  ];

  const tools: Anthropic.Messages.Tool[] = [
    UPDATE_GAME_STATE_TOOL,
    UPDATE_NPC_TOOL,
    ...(campaignSlug ? [QUERY_CAMPAIGN_TOOL] : []),
    { ...QUERY_SRD_TOOL, cache_control: { type: "ephemeral" } },
  ];

  let narrative = "";
  let stateChanges: StateChanges | null = null;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let srdQueryCount = 0;
  let campaignQueryCount = 0;

  // Tool-use loop: the DM may call tools (update_game_state, update_npc, query_srd)
  // and we continue the conversation so it can incorporate tool results into its
  // narrative. Exits when: (a) the model emits end_turn, (b) only state-mutation
  // tools were called (no further context needed), or (c) MAX_ITERATIONS is hit.
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    console.log(
      `[DM Agent] Loop iteration ${iter + 1}/${MAX_ITERATIONS} — calling ${MODELS.NARRATIVE}...`,
    );
    if (iter === 0)
      console.log(
        "[DM Agent] CAMPAIGN STATE:\n",
        userContent.split("\n\nPLAYER CHARACTER:")[0],
      );
    const response = await anthropic.messages.create({
      model: MODELS.NARRATIVE,
      max_tokens: MAX_TOKENS.NARRATIVE,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;
    console.log(
      `[DM Agent] Response: stop_reason=${response.stop_reason}, tokens={ in: ${response.usage.input_tokens}, out: ${response.usage.output_tokens} }`,
    );

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
        console.log(
          "[DM Agent] Tool call: update_game_state",
          JSON.stringify(block.input, null, 2),
        );
        stateChanges = block.input as StateChanges;
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: '{"ok":true}',
        });
      } else if (block.name === "update_npc") {
        console.log(
          "[DM Agent] Tool call: update_npc",
          JSON.stringify(block.input),
        );
        const result = updateNPC(block.input as UpdateNPCInput);
        const resultPayload: Record<string, unknown> = {
          ok: true,
          newHp: result.newHp,
        };
        if (result.died) {
          resultPayload.died = true;
          resultPayload.name = result.name;
          resultPayload.xp_awarded = result.xpAwarded;
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(resultPayload),
        });
      } else if (block.name === "query_srd") {
        hasQuerySRD = true;
        const input = block.input as {
          type: string;
          slug?: string;
          class_slug?: string;
          level?: number;
        };
        const { resultContent, newCount } = await handleSRDQuery(
          input,
          srdQueryCount,
          MAX_SRD_QUERIES,
          "DM Agent",
        );
        srdQueryCount = newCount;

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: resultContent,
        });
      } else if (block.name === "query_campaign") {
        hasQuerySRD = true; // needs continuation like SRD queries
        const input = block.input as {
          type: string;
          npc_id?: string;
          act_number?: number;
          story_beat_name?: string;
        };
        const { resultContent, newCount } = await handleCampaignQuery(
          input,
          campaignSlug,
          gameState.story.currentAct ?? 1,
          campaignQueryCount,
          MAX_SRD_QUERIES,
          "DM Agent",
        );
        campaignQueryCount = newCount;
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

    // If only state-mutation tools were called (no SRD/campaign queries that need
    // incorporation), we can stop looping — UNLESS the model hasn't produced any
    // narrative yet, in which case we need one more turn for it to narrate.
    if (!hasQuerySRD && narrative.trim().length > 0) {
      console.log(
        "[DM Agent] No SRD queries and narrative present — breaking loop",
      );
      break;
    }
  }

  return {
    narrative: narrative.trim(),
    stateChanges,
    npcDamagePreRolled: 0,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };
}
