/**
 * NPC Agent — Claude Haiku
 *
 * Generates D&D 5e stat blocks for NPCs introduced by the DM.
 * Single-shot, no tools, no conversation history.
 * Receives SRD monster data (or null) and returns structured JSON.
 *
 * Fallback: if JSON parsing fails, buildFallbackNPCs() extracts stats
 * directly from SRD data fields.
 */

import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODELS, MAX_TOKENS } from "../lib/anthropic";
import { CreateNPCInput } from "../lib/gameState";
import { crToXP } from "../lib/gameTypes";

interface NPCRequest {
  name: string;
  slug: string;
  disposition: "hostile" | "neutral" | "friendly";
  count: number;
}

const SYSTEM_PROMPT: Anthropic.Messages.TextBlockParam = {
  type: "text",
  text: `You are a D&D 5e stat block generator. Given a creature name, disposition, count, and optional SRD reference data, produce a JSON array of stat block objects.

If SRD data is provided, extract stats from it accurately:
- ac: use armorClass
- max_hp: use hitPoints
- attack_bonus: derive from the first melee or ranged action's attack_bonus field
- damage_dice: derive from the first action's damage_dice expression
- damage_bonus: derive from the first action's damage_bonus field
- saving_throw_bonus: use the highest save bonus from the data, or estimate as floor(CR/2)+2
- xp_value: use the xp field directly (if 0 or missing, compute from challengeRating using CR-to-XP: CR 0.25=50, CR 1=200, CR 2=450, etc.)
- notes: summarize 1-2 key special abilities (or equipment) in a short sentence

If SRD data is null (custom creature), generate reasonable D&D 5e stats appropriate for the creature name using standard 5e monster design.

When count > 1, return that many objects with identical stats but unique names using letter suffixes (e.g. "Bandit A", "Bandit B").

Respond with ONLY a valid JSON array. No markdown fencing, no explanation.`,
  cache_control: { type: "ephemeral" },
};

export interface NPCAgentResult {
  npcs: CreateNPCInput[];
  inputTokens: number;
  outputTokens: number;
}

export async function getNPCStats(
  request: NPCRequest,
  srdData: Record<string, unknown> | null,
): Promise<NPCAgentResult> {
  const count = request.count || 1;

  const userMessage = JSON.stringify({
    name: request.name,
    disposition: request.disposition,
    count,
    srdData,
  });

  const response = await anthropic.messages.create({
    model: MODELS.UTILITY,
    max_tokens: MAX_TOKENS.NPC_AGENT,
    system: [SYSTEM_PROMPT],
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText =
    response.content[0].type === "text" ? response.content[0].text : "[]";

  let npcs: CreateNPCInput[];
  try {
    const parsed = JSON.parse(rawText);
    npcs = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    npcs = buildFallbackNPCs(request, srdData);
  }

  // Validate and sanitize each NPC
  // The AI may use "xp_value", "xp", or omit it — derive from CR as fallback.
  const srdCR = srdData?.challengeRating as number | string | undefined;
  const xpFromCR = srdCR != null ? crToXP(srdCR) : 0;
  npcs = npcs.map((npc: CreateNPCInput) => ({
    name: (npc.name as string) || request.name,
    slug: request.slug || undefined,
    ac: (npc.ac as number) || 10,
    max_hp: (npc.max_hp as number) || 1,
    attack_bonus: (npc.attack_bonus as number) ?? 0,
    damage_dice: (npc.damage_dice as string) || "1d4",
    damage_bonus: (npc.damage_bonus as number) ?? 0,
    saving_throw_bonus: (npc.saving_throw_bonus as number) ?? 0,
    xp_value: (npc.xp_value as number) || xpFromCR,
    disposition: request.disposition,
    notes: (npc.notes as string) || "",
  }));

  return {
    npcs,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

/** Deterministic fallback when the agent returns unparseable output. */
function buildFallbackNPCs(
  request: NPCRequest,
  srdData: Record<string, unknown> | null,
): CreateNPCInput[] {
  const count = request.count || 1;
  const base: CreateNPCInput = srdData
    ? {
        name: request.name,
        slug: request.slug || undefined,
        ac: (srdData.armorClass as number) ?? 10,
        max_hp: (srdData.hitPoints as number) ?? 1,
        attack_bonus: extractAttackBonus(srdData),
        damage_dice: extractDamageDice(srdData),
        damage_bonus: extractDamageBonus(srdData),
        saving_throw_bonus: 0,
        xp_value: crToXP(srdData.challengeRating as number | string),
        disposition: request.disposition,
        notes: "",
      }
    : {
        name: request.name,
        slug: request.slug || undefined,
        ac: 10,
        max_hp: 4,
        attack_bonus: 2,
        damage_dice: "1d6",
        damage_bonus: 0,
        saving_throw_bonus: 0,
        xp_value: 10,
        disposition: request.disposition,
        notes: "Stats estimated (SRD lookup failed).",
      };

  return Array.from({ length: count }, (_, i) => ({
    ...base,
    name:
      count > 1
        ? `${request.name} ${String.fromCharCode(65 + i)}`
        : request.name,
  }));
}

function extractAttackBonus(srd: Record<string, unknown>): number {
  const actions = srd.actions as Array<Record<string, unknown>> | undefined;
  if (!actions?.length) return 0;
  return (actions[0].attack_bonus as number) ?? 0;
}

function extractDamageDice(srd: Record<string, unknown>): string {
  const actions = srd.actions as Array<Record<string, unknown>> | undefined;
  if (!actions?.length) return "1d4";
  return (actions[0].damage_dice as string) ?? "1d4";
}

function extractDamageBonus(srd: Record<string, unknown>): number {
  const actions = srd.actions as Array<Record<string, unknown>> | undefined;
  if (!actions?.length) return 0;
  return (actions[0].damage_bonus as number) ?? 0;
}
