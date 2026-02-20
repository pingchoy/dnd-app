"use client";

import type { SRDArchetype } from "../../hooks/useLevelUp";
import { toDisplayCase } from "../../lib/gameTypes";

interface Props {
  className: string;
  archetypes: SRDArchetype[];
  selectedSubclass: string | null;
  onSelect: (slug: string) => void;
  isLoading: boolean;
}

export default function LevelUpSubclass({
  className,
  archetypes,
  selectedSubclass,
  onSelect,
  isLoading,
}: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <span className="font-cinzel text-gold text-3xl animate-pulse">&#x2726;</span>
          <p className="font-crimson text-parchment/50 italic text-base">
            Loading archetypes…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="font-cinzel text-gold text-lg tracking-widest uppercase">
          Choose Your Path
        </h2>
        <p className="font-crimson text-parchment/50 italic text-base mt-1">
          Select a {toDisplayCase(className)} archetype to define your abilities.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {archetypes.map((arch) => {
          const isSelected = selectedSubclass === arch.slug;
          return (
            <button
              key={arch.slug}
              onClick={() => onSelect(arch.slug)}
              className={`text-left p-4 rounded border transition-all duration-150 ${
                isSelected
                  ? "border-gold bg-dungeon-mid shadow-gold-glow"
                  : "border-gold/20 bg-dungeon-mid hover:border-gold/60 hover:bg-dungeon-light"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-cinzel text-sm text-parchment tracking-wide">
                  {toDisplayCase(arch.name)}
                </span>
                {isSelected && (
                  <span className="font-cinzel text-gold text-xs flex-shrink-0">&#x2726;</span>
                )}
              </div>
              {arch.description && (
                <p className="font-crimson text-sm text-parchment/50 mt-2 line-clamp-3">
                  {arch.description.replace(/#{1,6}\s*/g, "").split("\n")[0]}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
