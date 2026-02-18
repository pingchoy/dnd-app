"use client";

import type { SRDClass } from "../lib/characterStore";

interface Props {
  classes: SRDClass[];
  selectedClass: SRDClass | null;
  onSelect: (cls: SRDClass) => void;
}

const HIT_DIE_LABEL: Record<number, string> = {
  6: "d6 — Fragile",
  8: "d8 — Average",
  10: "d10 — Sturdy",
  12: "d12 — Tank",
};

export default function StepClass({ classes, selectedClass, onSelect }: Props) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="font-cinzel text-gold text-lg tracking-widest uppercase">Choose Your Class</h2>
        <p className="font-crimson text-parchment/50 italic text-sm mt-1">
          Your class defines your capabilities, hit points, and fighting style.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {classes.map((cls) => {
          const isSelected = selectedClass?.slug === cls.slug;
          return (
            <button
              key={cls.slug}
              onClick={() => onSelect(cls)}
              className={`text-left p-4 rounded border transition-all duration-150 ${
                isSelected
                  ? "border-gold bg-dungeon-mid shadow-gold-glow"
                  : "border-gold/20 bg-dungeon-mid hover:border-gold/60 hover:bg-dungeon-light"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-cinzel text-sm text-parchment tracking-wide">{cls.name}</span>
                {isSelected && (
                  <span className="font-cinzel text-gold text-xs flex-shrink-0">✦</span>
                )}
              </div>
              <div className="mt-2 space-y-1">
                <div className="font-cinzel text-[11px] text-gold/70 tracking-wide">
                  Hit Die: d{cls.hitDie}
                  {HIT_DIE_LABEL[cls.hitDie] ? ` — ${HIT_DIE_LABEL[cls.hitDie].split(" — ")[1]}` : ""}
                </div>
                {cls.savingThrows.length > 0 && (
                  <div className="font-crimson text-xs text-parchment/60">
                    Saves: {cls.savingThrows.join(", ")}
                  </div>
                )}
                {cls.skillOptions.length > 0 && (
                  <div className="font-crimson text-[11px] text-parchment/40 italic">
                    {cls.skillChoices} skills from {cls.skillOptions.length} options
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
