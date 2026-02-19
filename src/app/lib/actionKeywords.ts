/**
 * actionKeywords.ts
 *
 * Single source of truth for contested-action keyword detection.
 * Pure module — no server or client imports, safe for both sides.
 *
 * Used by:
 *   rulesAgent.ts  — isContestedAction() to decide whether to invoke Haiku
 *   Input.tsx      — detectRollHints() to show roll-hint tags above the input
 */

export interface RollHint {
  pattern: RegExp;
  label: string;
  /** Abbreviated ability score(s) relevant to this check */
  ability: string;
}

export const ROLL_HINTS: RollHint[] = [
  { pattern: /\b(attack|strike|hit|stab|slash|shoot|fire|throw)\b/i, label: "Attack Roll",     ability: "STR/DEX" },
  { pattern: /\bcast\b/i,                                             label: "Spell Attack",    ability: "INT/WIS/CHA" },
  { pattern: /\b(sneak|hide|stealth)\b/i,                             label: "Stealth",         ability: "DEX" },
  { pattern: /\b(steal|pick|unlock|lockpick|disarm)\b/i,              label: "Sleight of Hand", ability: "DEX" },
  { pattern: /\b(persuade|persuasion|convince|charm)\b/i,             label: "Persuasion",      ability: "CHA" },
  { pattern: /\b(deceive|deception|lie|bluff|distract)\b/i,           label: "Deception",       ability: "CHA" },
  { pattern: /\b(intimidate|intimidation)\b/i,                        label: "Intimidation",    ability: "CHA" },
  { pattern: /\b(climb|jump|leap|swim|grapple|push|shove|sprint|athletics)\b/i, label: "Athletics", ability: "STR" },
  { pattern: /\b(dodge|acrobatics)\b/i,                               label: "Acrobatics",      ability: "DEX" },
  { pattern: /\b(search|investigate|examine|investigation)\b/i,       label: "Investigation",   ability: "INT" },
  { pattern: /\b(detect|perceive|notice|perception)\b/i,              label: "Perception",      ability: "WIS" },
  { pattern: /\b(insight)\b/i,                                        label: "Insight",         ability: "WIS" },
  { pattern: /\b(arcana)\b/i,                                         label: "Arcana",          ability: "INT" },
  { pattern: /\b(survival)\b/i,                                       label: "Survival",        ability: "WIS" },
  { pattern: /\b(nature|history|religion|medicine)\b/i,               label: "Knowledge",       ability: "INT" },
];

/** Returns true if the player's input contains any contested-action keyword. */
export function isContestedAction(input: string): boolean {
  return ROLL_HINTS.some(({ pattern }) => pattern.test(input));
}

/** Returns deduplicated roll hints for all keywords found in the input. */
export function detectRollHints(input: string): RollHint[] {
  if (!input.trim()) return [];
  const seen = new Set<string>();
  const results: RollHint[] = [];
  for (const hint of ROLL_HINTS) {
    if (hint.pattern.test(input) && !seen.has(hint.label)) {
      seen.add(hint.label);
      results.push(hint);
    }
  }
  return results;
}
