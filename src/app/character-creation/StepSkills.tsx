"use client";

import type { SRDClass, SRDRace } from "../lib/characterStore";

interface Props {
  selectedClass: SRDClass;
  selectedRace: SRDRace | null;
  selectedSkills: string[];
  onToggle: (skill: string) => void;
}

export default function StepSkills({ selectedClass, selectedRace, selectedSkills, onToggle }: Props) {
  const classChoices = selectedClass.skillChoices;
  const racialChoices = selectedRace?.extraSkillChoices ?? 0;
  const totalAllowed = classChoices + racialChoices;
  const remaining = totalAllowed - selectedSkills.length;

  // Class skill pool — always show
  const classPool = selectedClass.skillOptions;
  // Racial fixed skills (auto-granted, not toggled)
  const racialFixed = selectedRace?.skillProficiencies ?? [];

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="font-cinzel text-gold text-lg tracking-widest uppercase">Choose Skills</h2>
        <p className="font-crimson text-parchment/50 italic text-sm mt-1">
          Pick {totalAllowed} skill proficienc{totalAllowed === 1 ? "y" : "ies"} from your class pool.
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3 bg-dungeon-mid border border-gold/20 rounded px-4 py-2">
        <span className="font-cinzel text-[11px] text-parchment/60 tracking-widest uppercase flex-1">
          Selected
        </span>
        <div className="flex gap-1">
          {Array.from({ length: totalAllowed }).map((_, i) => (
            <span
              key={i}
              className={`w-3 h-3 rounded-full border ${
                i < selectedSkills.length
                  ? "bg-gold border-gold-dark"
                  : "border-gold/30"
              }`}
            />
          ))}
        </div>
        <span className="font-cinzel text-[11px] text-parchment/60">
          {selectedSkills.length}/{totalAllowed}
        </span>
      </div>

      {/* Class skill pool */}
      {classPool.length > 0 && (
        <div>
          <div className="font-cinzel text-[10px] text-parchment/40 tracking-widest uppercase mb-2">
            {selectedClass.name} Skills (choose {classChoices + racialChoices})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {classPool.map((skill) => {
              const isSelected = selectedSkills.includes(skill);
              const isFixed = racialFixed.includes(skill);
              const canSelect = remaining > 0 || isSelected;

              return (
                <button
                  key={skill}
                  onClick={() => !isFixed && onToggle(skill)}
                  disabled={isFixed || (!isSelected && !canSelect)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded border text-left transition-colors ${
                    isFixed
                      ? "border-gold/40 bg-dungeon-mid cursor-default"
                      : isSelected
                      ? "border-gold bg-dungeon-mid"
                      : canSelect
                      ? "border-gold/20 bg-dungeon-mid hover:border-gold/60 cursor-pointer"
                      : "border-gold/10 bg-dungeon opacity-40 cursor-not-allowed"
                  }`}
                >
                  <span
                    className={`w-3 h-3 rounded-full border flex-shrink-0 ${
                      isFixed
                        ? "bg-gold/50 border-gold/60"
                        : isSelected
                        ? "bg-gold border-gold-dark"
                        : "border-gold/30"
                    }`}
                  />
                  <span className="font-crimson text-sm text-parchment/80">{skill}</span>
                  {isFixed && (
                    <span className="font-cinzel text-[9px] text-gold/60 ml-auto uppercase tracking-wide">
                      racial
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Racial fixed skills (if outside class pool) */}
      {racialFixed.filter((s) => !classPool.includes(s)).length > 0 && (
        <div>
          <div className="font-cinzel text-[10px] text-parchment/40 tracking-widest uppercase mb-2">
            Racial Skill Grants
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {racialFixed
              .filter((s) => !classPool.includes(s))
              .map((skill) => (
                <div
                  key={skill}
                  className="flex items-center gap-2.5 px-3 py-2 rounded border border-gold/40 bg-dungeon-mid"
                >
                  <span className="w-3 h-3 rounded-full bg-gold/50 border border-gold/60 flex-shrink-0" />
                  <span className="font-crimson text-sm text-parchment/80">{skill}</span>
                  <span className="font-cinzel text-[9px] text-gold/60 ml-auto uppercase tracking-wide">
                    racial
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
