/**
 * Rules Agent — Claude Haiku (classifier mode)
 *
 * The AI classifies the player's action and calls exactly one tool.
 * All D&D math is computed server-side by actionResolver.ts — the AI
 * never does arithmetic, only classification.
 */

import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MAX_TOKENS, MODELS } from "../lib/anthropic";
import { isContestedAction } from "../lib/actionKeywords";
export { isContestedAction };
import { NPC, PlayerState } from "../lib/gameState";
import { ParsedRollResult } from "../lib/gameTypes";
import {
  resolveAttack,
  resolveSkillCheck,
  resolveSavingThrow,
  markImpossible,
  markNoCheck,
  buildRawSummary,
  AttackInput,
  SkillCheckInput,
  SavingThrowInput,
} from "../lib/actionResolver";

export type { ParsedRollResult, DamageBreakdown } from "../lib/gameTypes";

export interface RulesOutcome {
  parsed: ParsedRollResult;
  raw: string;
  roll: number;
  inputTokens: number;
  outputTokens: number;
}

// ─── Classifier system prompt ────────────────────────────────────────────────

const SYSTEM_PROMPT: Anthropic.Messages.TextBlockParam = {
  type: "text",
  text: `You are a D&D 5e rules classifier. Your ONLY job is to call exactly one tool.

Given a player action and their character summary, decide:
1. ATTACK — if the player attacks a creature with a weapon. Pick the weapon and target.
2. SKILL CHECK — if the action requires a skill check. Pick the skill and set an appropriate DC (easy 10, medium 13, hard 15, very hard 18, nearly impossible 20).
3. SAVING THROW — if something forces a save. Pick the ability and DC.
4. IMPOSSIBLE — if the action can't be attempted (spell not known, item not possessed, violates rules).
5. NO CHECK — if the action is purely narrative and needs no mechanical check.

EXTRA DAMAGE — only include sources the character actually has (check features/conditions):
- "Sneak Attack" — Rogue with finesse/ranged weapon AND advantage or ally adjacent to target
- "Divine Smite" or "Divine Smite N" — Paladin spends spell slot on melee hit (N = slot level, default 1)
- "Eldritch Smite N" — Warlock invocation, expends slot on hit (N = slot level)
- "Rage" — Barbarian currently raging (check conditions), melee STR weapon only
- "Hunter's Mark" — concentrating on the spell (check conditions)
- "Hex" — concentrating on the spell (check conditions)
- "Colossus Slayer" — Hunter Ranger, target is below max HP
- "Dread Ambusher" — Gloom Stalker, first attack of first combat turn
- "Great Weapon Master" — Feat, player explicitly opts for -5/+10 with a heavy weapon
- "Dueling" — Fighting Style, one-handed melee weapon with no other weapon in hand

Do NOT compute any math. Just classify and call the tool.`,
  cache_control: { type: "ephemeral" },
};

// ─── Anthropic tool definitions ──────────────────────────────────────────────

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "resolve_attack",
    description:
      "Resolve a weapon attack against an NPC. The server rolls dice and computes modifiers.",
    input_schema: {
      type: "object" as const,
      properties: {
        weapon: {
          type: "string",
          description: "Weapon name (e.g. 'shortsword', 'longbow')",
        },
        target: {
          type: "string",
          description: "Target NPC name",
        },
        extra_damage_sources: {
          type: "array",
          items: { type: "string" },
          description:
            "Extra damage sources that apply this attack. Valid values: 'Sneak Attack', 'Divine Smite N' (N=slot level), 'Eldritch Smite N', 'Rage', 'Hunter\\'s Mark', 'Hex', 'Colossus Slayer', 'Dread Ambusher', 'Great Weapon Master', 'Dueling'",
        },
      },
      required: ["weapon", "target"],
    },
  },
  {
    name: "resolve_skill_check",
    description:
      "Resolve a skill check. The server rolls dice and computes modifiers.",
    input_schema: {
      type: "object" as const,
      properties: {
        skill: {
          type: "string",
          enum: [
            "acrobatics", "animal handling", "arcana", "athletics",
            "deception", "history", "insight", "intimidation",
            "investigation", "medicine", "nature", "perception",
            "performance", "persuasion", "religion", "sleight of hand",
            "stealth", "survival",
          ],
          description: "The skill to check",
        },
        dc: {
          type: "number",
          description: "Difficulty class (10=easy, 13=medium, 15=hard, 18=very hard, 20=nearly impossible)",
        },
      },
      required: ["skill", "dc"],
    },
  },
  {
    name: "resolve_saving_throw",
    description:
      "Resolve a saving throw. The server rolls dice and computes modifiers.",
    input_schema: {
      type: "object" as const,
      properties: {
        ability: {
          type: "string",
          enum: [
            "strength", "dexterity", "constitution",
            "intelligence", "wisdom", "charisma",
          ],
          description: "The ability for the save",
        },
        dc: {
          type: "number",
          description: "Difficulty class for the save",
        },
        source: {
          type: "string",
          description: "What triggered the save (e.g. 'fire trap', 'Hold Person')",
        },
      },
      required: ["ability", "dc"],
    },
  },
  {
    name: "mark_impossible",
    description:
      "The action is impossible for this character (wrong spell, missing item, rule violation).",
    input_schema: {
      type: "object" as const,
      properties: {
        reason: {
          type: "string",
          description: "Brief reason the action is impossible",
        },
      },
      required: ["reason"],
    },
  },
  {
    name: "mark_no_check",
    description:
      "The action is purely narrative and requires no mechanical check.",
    input_schema: {
      type: "object" as const,
      properties: {
        reason: {
          type: "string",
          description: "Brief reason no check is needed",
        },
      },
      required: ["reason"],
    },
  },
];

// ─── Minimal context builder ─────────────────────────────────────────────────

/**
 * Build a compact character summary for the classifier.
 * Much smaller than serializePlayerState — only what the AI needs to classify.
 */
function buildClassifierContext(
  player: PlayerState,
  activeNPCs: NPC[],
): string {
  const lines = [
    `${player.name} | ${player.race} ${player.characterClass} Lv${player.level}`,
    `Features: ${player.features.map((f) => f.chosenOption ? `${f.name} (${f.chosenOption})` : f.name).join(", ")}`,
    `Inventory: ${player.inventory.join(", ")}`,
    `Weapons: ${Object.keys(player.weaponDamage).join(", ")}`,
    `Conditions: ${player.conditions.length ? player.conditions.join(", ") : "none"}`,
  ];

  if (player.knownSpells?.length) {
    lines.push(`Known spells: ${player.knownSpells.join(", ")}`);
  }
  if (player.cantrips?.length) {
    lines.push(`Cantrips: ${player.cantrips.join(", ")}`);
  }

  if (activeNPCs.length) {
    lines.push(
      `Active NPCs: ${activeNPCs.map((n) => `${n.name} (AC ${n.ac}, ${n.disposition})`).join(", ")}`,
    );
  }

  return lines.join("\n");
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function getRulesOutcome(
  playerInput: string,
  player: PlayerState,
  activeNPCs: NPC[] = [],
): Promise<RulesOutcome> {
  const context = buildClassifierContext(player, activeNPCs);

  const userMessage = `Player action: "${playerInput}"

${context}

Classify this action and call the appropriate tool.`;

  const response = await anthropic.messages.create({
    model: MODELS.UTILITY,
    max_tokens: MAX_TOKENS.RULES_CLASSIFIER,
    system: [SYSTEM_PROMPT],
    tools: TOOLS,
    tool_choice: { type: "any", disable_parallel_tool_use: true },
    messages: [{ role: "user", content: userMessage }],
  });

  // Find the tool_use block
  const toolBlock = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
  );

  // Fallback: if AI returns no tool call, treat as no-check
  if (!toolBlock) {
    const parsed = markNoCheck("No tool call returned by classifier");
    return {
      parsed,
      raw: buildRawSummary(parsed),
      roll: 0,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  // Dispatch to the appropriate resolver
  let parsed: ParsedRollResult;

  switch (toolBlock.name) {
    case "resolve_attack":
      parsed = resolveAttack(
        toolBlock.input as AttackInput,
        player,
        activeNPCs,
      );
      break;
    case "resolve_skill_check":
      parsed = resolveSkillCheck(
        toolBlock.input as SkillCheckInput,
        player,
      );
      break;
    case "resolve_saving_throw":
      parsed = resolveSavingThrow(
        toolBlock.input as SavingThrowInput,
        player,
      );
      break;
    case "mark_impossible":
      parsed = markImpossible(
        (toolBlock.input as { reason: string }).reason,
      );
      break;
    case "mark_no_check":
      parsed = markNoCheck(
        (toolBlock.input as { reason: string }).reason,
      );
      break;
    default:
      parsed = markNoCheck(`Unknown tool: ${toolBlock.name}`);
  }

  return {
    parsed,
    raw: buildRawSummary(parsed),
    roll: parsed.dieResult,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
