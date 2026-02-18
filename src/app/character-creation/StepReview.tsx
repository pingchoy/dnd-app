"use client";

import type { SRDRace, SRDClass } from "../lib/characterStore";
import type { CharacterStats } from "../lib/gameState";
import { getModifier, getProficiencyBonus } from "../lib/gameState";

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

function fmt(n: number) {
  return n >= 0 ? `+${n}` : `${n}`;
}

function StatBox({ label, value }: { label: string; value: number }) {
  const mod = getModifier(value);
  return (
    <div className="flex flex-col items-center bg-dungeon border border-gold/20 rounded p-2 min-w-[60px]">
      <span className="font-cinzel text-[9px] tracking-widest text-gold/60 uppercase">{label}</span>
      <span className="font-cinzel text-xl text-parchment mt-0.5">{value}</span>
      <span className={`font-cinzel text-xs font-bold ${mod >= 0 ? "text-green-400" : "text-red-400"}`}>
        {fmt(mod)}
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
          {selectedRace.name} · {selectedClass.name} · Level 1
        </div>
        <div className="flex justify-center gap-6 mt-3 font-cinzel text-xs tracking-wide">
          <div className="text-center">
            <div className="text-parchment/40 uppercase text-[9px]">HP</div>
            <div className="text-green-400 font-bold">{maxHP}</div>
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
            <div className="text-gold font-bold">{fmt(profBonus)}</div>
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
          {selectedClass.savingThrows.join(", ") || "None"}
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
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Racial traits preview */}
      {selectedRace.traits.length > 0 && (
        <div>
          <div className="font-cinzel text-[10px] text-parchment/40 tracking-widest uppercase mb-1.5">
            Racial Traits
          </div>
          <div className="space-y-1">
            {selectedRace.traits.slice(0, 3).map((t) => (
              <div key={t.name} className="font-crimson text-xs text-parchment/60">
                <span className="text-parchment/80 font-semibold">{t.name}:</span>{" "}
                {t.description.slice(0, 80)}{t.description.length > 80 ? "…" : ""}
              </div>
            ))}
            {selectedRace.traits.length > 3 && (
              <div className="font-crimson text-xs text-parchment/30 italic">
                +{selectedRace.traits.length - 3} more traits
              </div>
            )}
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
