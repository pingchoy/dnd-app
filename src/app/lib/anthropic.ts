import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "dummy-api-key",
});

/**
 * Model selection — chosen for cost efficiency.
 *
 * NARRATIVE: DM story generation. Haiku 4.5 is the default — ~3.75× cheaper
 *   than Sonnet with good narrative quality for most sessions.
 *   Switch to "claude-sonnet-4-6" if you want richer prose.
 *
 * UTILITY: Rules checks and sub-agent calls. Always Haiku (fast + cheap).
 *
 * Rough cost per player turn (50-turn session estimate):
 *   Haiku  DM  ~550 in / 400 out  → ~$0.002  → session ≈ $0.11
 *   Sonnet DM  ~550 in / 400 out  → ~$0.008  → session ≈ $0.40
 */
export const MODELS = {
  NARRATIVE: "claude-haiku-4-5-20251001", // swap to "claude-sonnet-4-6" for richer prose
  UTILITY:   "claude-haiku-4-5-20251001",
} as const;

export const MAX_TOKENS = {
  NARRATIVE: 4096, // DM responses + tool_use blocks
  UTILITY: 300,    // Sub-agent answers should be concise
  NPC_AGENT: 512,  // NPC stat block generation
} as const;

/** Max conversation turns kept in context to bound input-token growth. */
export const HISTORY_WINDOW = 10;

/**
 * Approximate token costs in USD per token.
 * Update these if Anthropic changes pricing.
 * Source: https://www.anthropic.com/pricing
 */
export const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": {
    input:  0.8 / 1_000_000, // $0.80 per million input tokens
    output: 4.0 / 1_000_000, // $4.00 per million output tokens
  },
  "claude-sonnet-4-6": {
    input:  3.0 / 1_000_000,  // $3.00 per million input tokens
    output: 15.0 / 1_000_000, // $15.00 per million output tokens
  },
};

export function calculateCost(
  model: keyof typeof TOKEN_COSTS,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = TOKEN_COSTS[model];
  return rates.input * inputTokens + rates.output * outputTokens;
}
