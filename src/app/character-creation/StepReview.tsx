"use client";

import type { SRDRace, SRDClass } from "../lib/characterStore";
import type { CharacterStats } from "../lib/gameTypes";
import { formatModifier, getModifier, getProficiencyBonus, toDisplayCase } from "../lib/gameTypes";

interface Props {
  characterName: string;
  selectedRace: SRDRace;
  selectedClass: SRDClass;
  finalStats: CharacterStats;
  selectedSkills: string[];
  isSaving: boolean;
  onConfirm: () => void;
  onBack: () => void;
}

interface StatBoxProps {
  label: string;
  value: number;
}

function StatBox({ label, value }: StatBoxProps) {
  const mod = getModifier(value);
  return (
    <div className="flex flex-col items-center bg-dungeon border border-gold/20 rounded p-2 min-w-[60px]">
      <span className="font-cinzel text-[9px] tracking-widest text-gold/60 uppercase">{label}</span>
      <span className="font-cinzel text-xl text-parchment mt-0.5">{value}</span>
      <span className={`font-cinzel text-xs font-bold ${mod >= 0 ? "text-success" : "text-red-400"}`}>
        {formatModifier(mod)}
      </span>
    </div>
  );
}

export default function StepReview({
  characterName,
  selectedRace,
  selectedClass,
  finalStats,
  selectedSkills,
  isSaving,
  onConfirm,
  onBack,
}: Props) {
  const conMod = getModifier(finalStats.constitution);
  const maxHP = selectedClass.hitDie + conMod;
  const armorClass = 10 + getModifier(finalStats.dexterity);
  const profBonus = getProficiencyBonus(1);
  const racialSkills = selectedRace.skillProficiencies ?? [];
  const allSkills = Array.from(new Set([...selectedSkills, ...racialSkills]));

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="font-cinzel text-gold text-lg tracking-widest uppercase">Review Character</h2>
        <p className="font-crimson text-parchment/50 italic text-sm mt-1">
          Confirm your character before beginning the adventure.
        </p>
      </div>

      {/* Identity */}
      <div className="bg-dungeon-mid border border-gold/30 rounded p-4 text-center">
        <div className="font-cinzel text-xl text-parchment tracking-wide">{characterName}</div>
        <div className="font-crimson text-parchment/60 italic mt-0.5">
          {toDisplayCase(selectedRace.name)} · {toDisplayCase(selectedClass.name)} · Level 1
        </div>
        <div className="flex justify-center gap-6 mt-3 font-cinzel text-xs tracking-wide">
          <div className="text-center">
            <div className="text-parchment/40 uppercase text-[9px]">HP</div>
            <div className="text-success font-bold">{maxHP}</div>
          </div>
          <div className="text-center">
            <div className="text-parchment/40 uppercase text-[9px]">AC</div>
            <div className="text-parchment font-bold">{armorClass}</div>
          </div>
          <div className="text-center">
            <div className="text-parchment/40 uppercase text-[9px]">Hit Die</div>
            <div className="text-parchment font-bold">d{selectedClass.hitDie}</div>
          </div>
          <div className="text-center">
            <div className="text-parchment/40 uppercase text-[9px]">Proficiency</div>
            <div className="text-gold font-bold">{formatModifier(profBonus)}</div>
          </div>
        </div>
      </div>

      {/* Ability scores */}
      <div>
        <div className="font-cinzel text-[10px] text-parchment/40 tracking-widest uppercase mb-2">
          Ability Scores
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          <StatBox label="STR" value={finalStats.strength} />
          <StatBox label="DEX" value={finalStats.dexterity} />
          <StatBox label="CON" value={finalStats.constitution} />
          <StatBox label="INT" value={finalStats.intelligence} />
          <StatBox label="WIS" value={finalStats.wisdom} />
          <StatBox label="CHA" value={finalStats.charisma} />
        </div>
      </div>

      {/* Saving throws */}
      <div>
        <div className="font-cinzel text-[10px] text-parchment/40 tracking-widest uppercase mb-1.5">
          Saving Throw Proficiencies
        </div>
        <div className="font-crimson text-sm text-parchment/70">
          {selectedClass.savingThrows.map(toDisplayCase).join(", ") || "None"}
        </div>
      </div>

      {/* Skills */}
      {allSkills.length > 0 && (
        <div>
          <div className="font-cinzel text-[10px] text-parchment/40 tracking-widest uppercase mb-1.5">
            Skill Proficiencies
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allSkills.map((skill) => (
              <span
                key={skill}
                className="font-crimson text-xs bg-dungeon-mid border border-gold/20 rounded px-2 py-0.5 text-parchment/70"
              >
                {toDisplayCase(skill)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Weapon & Armor proficiencies */}
      <div>
        <div className="font-cinzel text-[10px] text-parchment/40 tracking-widest uppercase mb-1.5">
          Weapon Proficiencies
        </div>
        <div className="font-crimson text-sm text-parchment/70">
          {(() => {
            const profs = Array.from(new Set([
              ...(selectedClass.weaponProficiencies ?? []),
              ...(selectedRace.weaponProficiencies ?? []),
            ]));
            return profs.length > 0 ? profs.map(toDisplayCase).join(", ") : "None";
          })()}
        </div>
      </div>
      <div>
        <div className="font-cinzel text-[10px] text-parchment/40 tracking-widest uppercase mb-1.5">
          Armor Proficiencies
        </div>
        <div className="font-crimson text-sm text-parchment/70">
          {(() => {
            const profs = Array.from(new Set([
              ...(selectedClass.armorProficiencies ?? []),
              ...(selectedRace.armorProficiencies ?? []),
            ]));
            return profs.length > 0 ? profs.map(toDisplayCase).join(", ") : "None";
          })()}
        </div>
      </div>

      {/* Racial traits preview */}
      {selectedRace.traits.length > 0 && (
        <div>
          <div className="font-cinzel text-[10px] text-parchment/40 tracking-widest uppercase mb-1.5">
            Racial Traits
          </div>
          <div className="font-crimson text-sm text-parchment/70">
            {selectedRace.traits.map((t) => toDisplayCase(t.name)).join(", ")}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onBack}
          disabled={isSaving}
          className="flex-1 border border-gold/30 text-parchment/60 font-cinzel text-xs tracking-widest
                     uppercase rounded py-2.5 hover:border-gold/60 hover:text-parchment
                     disabled:opacity-40 transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="inline-block mr-1 -mt-px flex-shrink-0">
            <path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <button
          onClick={onConfirm}
          disabled={isSaving}
          className="flex-[2] bg-gold/10 border border-gold text-gold font-cinzel text-xs tracking-widest
                     uppercase rounded py-2.5 hover:bg-gold/20 shadow-gold-glow
                     disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isSaving ? "Forging your destiny…" : "Begin the Adventure ✦"}
        </button>
      </div>
    </div>
  );
}
