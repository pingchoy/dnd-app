"use client";

import type { SRDArchetype, SRDClass } from "../lib/characterStore";

interface Props {
  selectedClass: SRDClass;
  selectedArchetype: SRDArchetype | null;
  onSelect: (archetype: SRDArchetype) => void;
  onBack: () => void;
}

export default function StepArchetype({ selectedClass, selectedArchetype, onSelect, onBack }: Props) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="font-cinzel text-gold text-lg tracking-widest uppercase">
          Choose Your {selectedClass.name} Origin
        </h2>
        <p className="font-crimson text-parchment/50 italic text-sm mt-1">
          Your origin shapes your powers and defines who you are at level 1.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {selectedClass.archetypes.map((arch) => {
          const isSelected = selectedArchetype?.slug === arch.slug;
          return (
            <button
              key={arch.slug}
              onClick={() => onSelect(arch)}
              className={`text-left p-4 rounded border transition-all duration-150 ${
                isSelected
                  ? "border-gold bg-dungeon-mid shadow-gold-glow"
                  : "border-gold/20 bg-dungeon-mid hover:border-gold/60 hover:bg-dungeon-light"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-cinzel text-sm text-parchment tracking-wide">{arch.name}</span>
                {isSelected && (
                  <span className="font-cinzel text-gold text-xs flex-shrink-0">✦</span>
                )}
              </div>
              {arch.description && (
                <p className="font-crimson text-xs text-parchment/50 mt-2 line-clamp-3">
                  {arch.description.replace(/#{1,6}\s*/g, "").split("\n")[0]}
                </p>
              )}
            </button>
          );
        })}
      </div>

      <div className="pt-2">
        <button
          onClick={onBack}
          className="font-cinzel text-xs text-parchment/40 tracking-widest uppercase
                     hover:text-parchment transition-colors"
        >
          ← Back to Class
        </button>
      </div>
    </div>
  );
}
