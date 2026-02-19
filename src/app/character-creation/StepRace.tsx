"use client";

import type { SRDRace } from "../lib/characterStore";

interface Props {
  races: SRDRace[];
  selectedRace: SRDRace | null;
  onSelect: (race: SRDRace) => void;
}

function asiSummary(bonuses: Record<string, number>): string {
  return Object.entries(bonuses)
    .map(([ability, bonus]) => `${ability.slice(0, 3).toUpperCase()} +${bonus}`)
    .join(", ");
}

/** Extract just the size category word from a raw size string.
 *  Handles both "Medium" and full sentences like "Your size is Medium." */
function sizeCategory(raw: string): string {
  const m = raw.match(/\b(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/i);
  return m ? m[0] : raw;
}

/**
 * Extract individual trait names from a markdown blob.
 * wotc-srd format: paragraphs starting with **_Name._** or **Name**
 */
function parseTraitNames(markdown: string): string[] {
  return markdown
    .split(/\n\n+/)
    .map((p) => {
      const m = p.trim().match(/^\*\*_?([^*_\n]{1,50}?)_?\.?\*\*/);
      return m ? m[1].trim() : null;
    })
    .filter((n): n is string => n !== null && n.length > 0);
}

function resolveTraitNames(traits: { name: string; description: string }[]): string[] {
  if (traits.length === 1 && traits[0].name === "Racial Traits") {
    return parseTraitNames(traits[0].description);
  }
  return traits.map((t) => t.name);
}

export default function StepRace({ races, selectedRace, onSelect }: Props) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="font-cinzel text-gold text-lg tracking-widest uppercase">Choose Your Race</h2>
        <p className="font-crimson text-parchment/50 italic text-sm mt-1">
          Your race shapes your heritage, abilities, and place in the world.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {races.map((race) => {
          const isSelected = selectedRace?.slug === race.slug;
          const traitNames = resolveTraitNames(race.traits);
          return (
            <button
              key={race.slug}
              onClick={() => onSelect(race)}
              className={`text-left p-4 rounded border transition-all duration-150 ${
                isSelected
                  ? "border-gold bg-dungeon-mid shadow-gold-glow"
                  : "border-gold/20 bg-dungeon-mid hover:border-gold/60 hover:bg-dungeon-light"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-cinzel text-sm text-parchment tracking-wide">{race.name}</span>
                {isSelected && (
                  <span className="font-cinzel text-gold text-xs flex-shrink-0">✦</span>
                )}
              </div>
              <div className="mt-2 space-y-1.5">
                {Object.keys(race.abilityBonuses).length > 0 && (
                  <div className="font-cinzel text-[11px] text-gold/80 tracking-wide">
                    {asiSummary(race.abilityBonuses)}
                  </div>
                )}
                <div className="flex gap-3 font-crimson text-xs text-parchment/50">
                  <span>Speed {race.speed} ft</span>
                  <span>·</span>
                  <span>Size {sizeCategory(race.size)}</span>
                </div>
                {traitNames.length > 0 && (
                  <div className="font-crimson text-[11px] text-parchment/40 italic">
                    {traitNames.slice(0, 3).join(", ")}
                    {traitNames.length > 3 && ` +${traitNames.length - 3} more`}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
