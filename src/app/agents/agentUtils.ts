/**
 * agentUtils.ts
 *
 * Shared helpers for DM and combat agents.
 */

import { querySRD } from "../lib/characterStore";

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
