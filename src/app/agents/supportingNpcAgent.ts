/**
 * Supporting NPC Agent — Claude Haiku
 *
 * Generates lightweight profiles for non-campaign NPCs that emerge during play.
 * Single-shot, no tools, no conversation history.
 * Returns a SupportingNPC JSON object.
 *
 * Fallback: if JSON parsing fails, constructs a minimal profile from the
 * DM-provided fields.
 */

import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODELS, MAX_TOKENS } from "../lib/anthropic";
import type { SupportingNPC } from "../lib/gameTypes";

export interface SupportingNPCRequest {
  name: string;
  role: string;
  context: string;
  combatSlug?: string;
  currentLocation: string;
}

export interface SupportingNPCResult {
  npc: SupportingNPC;
  inputTokens: number;
  outputTokens: number;
}

const SYSTEM_PROMPT: Anthropic.Messages.TextBlockParam = {
  type: "text",
  text: `You generate supporting NPC profiles for a D&D 5e campaign. Given a name, role, context, and location, produce a JSON object with these fields:

- id: kebab-case identifier (e.g. "old-marta-the-fishmonger")
- name: the NPC's name (lowercase)
- role: one of "ally", "rival", "neutral", "informant", "merchant", "quest_giver"
- appearance: 1-2 sentences describing how they look
- personality: 1 sentence capturing key personality traits
- motivations: array of 1-3 short strings describing what they want
- location: where they are usually found (lowercase)
- notes: 1-2 sentences of anything else notable about them
- combatSlug: SRD monster slug if provided, omit otherwise

All string values must be lowercase. Respond with ONLY valid JSON, no markdown fencing.`,
  cache_control: { type: "ephemeral" },
};

export async function getSupportingNPCProfile(
  request: SupportingNPCRequest,
): Promise<SupportingNPCResult> {
  const userMessage = JSON.stringify({
    name: request.name,
    role: request.role,
    context: request.context,
    location: request.currentLocation,
    combatSlug: request.combatSlug,
  });

  const response = await anthropic.messages.create({
    model: MODELS.UTILITY,
    max_tokens: MAX_TOKENS.NPC_AGENT,
    system: [SYSTEM_PROMPT],
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText =
    response.content[0].type === "text" ? response.content[0].text : "{}";

  let npc: SupportingNPC;
  try {
    npc = JSON.parse(rawText) as SupportingNPC;
    // Ensure required fields exist
    if (!npc.id || !npc.name) throw new Error("Missing required fields");
  } catch {
    npc = buildFallbackNPC(request);
  }

  // Sanitize — ensure lowercase and valid role
  npc.name = npc.name.toLowerCase();
  npc.location = (npc.location || request.currentLocation).toLowerCase();
  if (request.combatSlug) npc.combatSlug = request.combatSlug;

  return {
    npc,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

function buildFallbackNPC(request: SupportingNPCRequest): SupportingNPC {
  const id = request.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return {
    id,
    name: request.name.toLowerCase(),
    role: (request.role as SupportingNPC["role"]) || "neutral",
    appearance: "",
    personality: "",
    motivations: [],
    location: request.currentLocation.toLowerCase(),
    notes: request.context.toLowerCase(),
  };
}
