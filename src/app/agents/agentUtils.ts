/**
 * agentUtils.ts
 *
 * Shared helpers for DM and combat agents.
 */

import { querySRD, getCampaign, getCampaignAct } from "../lib/characterStore";

/**
 * Handle a query_srd tool call, enforcing a per-turn query limit.
 * Returns the content string for the tool result and the updated query count.
 */
export async function handleSRDQuery(
  input: { type: string; slug?: string; class_slug?: string; level?: number },
  srdQueryCount: number,
  maxQueries: number,
  agentLabel: string,
): Promise<{ resultContent: string; newCount: number }> {
  console.log(`[${agentLabel}] Tool call: query_srd (${srdQueryCount + 1}/${maxQueries})`, JSON.stringify(input));

  if (srdQueryCount >= maxQueries) {
    console.log(`[${agentLabel}] SRD query limit reached — returning error to model`);
    return {
      resultContent: '{"error":"SRD query limit reached for this turn. Use your existing knowledge."}',
      newCount: srdQueryCount,
    };
  }

  const docSlug =
    input.type === "class_level"
      ? `${input.class_slug}_${input.level}`
      : (input.slug ?? "");
  const data = await querySRD(input.type, docSlug);
  console.log(`[${agentLabel}] SRD result for "${docSlug}":`, data ? "found" : "not found");

  const resultContent = data
    ? JSON.stringify(data)
    : `{"error":"No ${input.type} found for '${docSlug}'"}`;

  return { resultContent, newCount: srdQueryCount + 1 };
}

/**
 * Handle a query_campaign tool call, enforcing a per-turn query limit.
 * Returns the content string for the tool result and the updated query count.
 */
export async function handleCampaignQuery(
  input: { type: string; npc_id?: string; act_number?: number; encounter_name?: string },
  campaignSlug: string | undefined,
  currentAct: number,
  queryCount: number,
  maxQueries: number,
  agentLabel: string,
): Promise<{ resultContent: string; newCount: number }> {
  if (!campaignSlug) {
    return { resultContent: '{"error":"No campaign linked to this session."}', newCount: queryCount };
  }
  if (queryCount >= maxQueries) {
    return { resultContent: '{"error":"Campaign query limit reached."}', newCount: queryCount };
  }

  console.log(`[${agentLabel}] Tool call: query_campaign (${queryCount + 1}/${maxQueries})`, JSON.stringify(input));

  if (input.type === "npc") {
    const campaign = await getCampaign(campaignSlug);
    const npc = campaign?.npcs.find((n) => n.id === input.npc_id);
    if (!npc) return { resultContent: `{"error":"NPC '${input.npc_id}' not found."}`, newCount: queryCount + 1 };
    return { resultContent: JSON.stringify(npc), newCount: queryCount + 1 };
  }

  if (input.type === "act") {
    const actNum = input.act_number ?? currentAct;
    const act = await getCampaignAct(campaignSlug, actNum);
    if (!act) return { resultContent: `{"error":"Act ${actNum} not found."}`, newCount: queryCount + 1 };
    return { resultContent: JSON.stringify(act), newCount: queryCount + 1 };
  }

  if (input.type === "encounter") {
    const actNum = input.act_number ?? currentAct;
    const act = await getCampaignAct(campaignSlug, actNum);
    if (!act) return { resultContent: `{"error":"Act ${actNum} not found."}`, newCount: queryCount + 1 };
    const enc = act.encounters.find((e) =>
      e.name.toLowerCase() === input.encounter_name?.toLowerCase(),
    );
    if (!enc) return { resultContent: `{"error":"Encounter '${input.encounter_name}' not found in act ${actNum}."}`, newCount: queryCount + 1 };
    return { resultContent: JSON.stringify(enc), newCount: queryCount + 1 };
  }

  return { resultContent: '{"error":"Unknown query type."}', newCount: queryCount };
}
