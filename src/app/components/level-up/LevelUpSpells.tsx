"use client";

import { useState } from "react";
import type { SpellOption } from "../../hooks/useLevelUp";
import { toDisplayCase } from "../../lib/gameTypes";

interface Props {
  availableCantrips: SpellOption[];
  availableSpells: SpellOption[][];
  selectedCantrips: string[];
  selectedSpells: string[];
  totalCantripSlots: number;
  totalSpellSlots: number;
  onToggleCantrip: (name: string) => void;
  onToggleSpell: (name: string) => void;
  isLoading: boolean;
  alreadyKnownCantrips: string[];
  alreadyKnownSpells: string[];
}

const SCHOOL_COLORS: Record<string, string> = {
  abjuration: "bg-blue-900/40 text-blue-300 border-blue-500/30",
  conjuration: "bg-yellow-900/40 text-yellow-300 border-yellow-500/30",
  divination: "bg-cyan-900/40 text-cyan-300 border-cyan-500/30",
  enchantment: "bg-pink-900/40 text-pink-300 border-pink-500/30",
  evocation: "bg-red-900/40 text-red-300 border-red-500/30",
  illusion: "bg-purple-900/40 text-purple-300 border-purple-500/30",
  necromancy: "bg-gray-900/40 text-gray-300 border-gray-500/30",
  transmutation: "bg-green-900/40 text-green-300 border-green-500/30",
};

interface SpellCardProps {
  spell: SpellOption;
  isSelected: boolean;
  isKnown: boolean;
  disabled: boolean;
  onToggle: () => void;
  onExpand: () => void;
}

function SpellCard({ spell, isSelected, isKnown, disabled, onToggle, onExpand }: SpellCardProps) {
  const schoolClass = SCHOOL_COLORS[spell.school] ?? "bg-ink/20 text-parchment/60 border-ink/30";

  return (
    <button
      onClick={onToggle}
      disabled={(disabled && !isSelected) || isKnown}
      className={`w-full text-left rounded-lg border p-3 transition-all ${
        isKnown
          ? "border-gold/10 bg-dungeon-mid opacity-30 cursor-not-allowed"
          : isSelected
          ? "border-gold bg-gold/10 shadow-gold-glow"
          : disabled
          ? "border-gold/10 bg-dungeon-mid opacity-40 cursor-not-allowed"
          : "border-gold/20 bg-dungeon-mid hover:border-gold/50 hover:bg-dungeon-mid/80"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-cinzel text-sm text-parchment font-semibold">
              {toDisplayCase(spell.name)}
            </span>
            <span
              className={`font-cinzel text-[10px] tracking-wider uppercase px-1.5 py-0.5 rounded border ${schoolClass}`}
            >
              {toDisplayCase(spell.school)}
            </span>
            {isKnown && (
              <span className="font-cinzel text-[10px] tracking-wider uppercase px-1.5 py-0.5 rounded border border-success-dark/40 bg-success-dark/20 text-success">
                Known
              </span>
            )}
          </div>
          <div className="flex gap-3 mt-1 font-crimson text-sm text-parchment/50">
            <span>{spell.castingTime}</span>
            <span>·</span>
            <span>{spell.range}</span>
          </div>
          <p className="font-crimson text-sm text-parchment/40 mt-1 line-clamp-2 leading-snug">
            {spell.description}
          </p>
          <button
            onClick={(e) => { e.stopPropagation(); onExpand(); }}
            className="font-crimson text-sm text-gold/50 italic mt-0.5 hover:text-gold transition-colors"
          >
            Read more...
          </button>
        </div>
        <div className="flex-shrink-0 mt-0.5">
          <div
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
              isSelected
                ? "border-gold bg-gold text-dungeon"
                : isKnown
                ? "border-green-500/30 bg-green-900/30"
                : "border-gold/30"
            }`}
          >
            {(isSelected || isKnown) && (
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function LevelUpSpells({
  availableCantrips,
  availableSpells,
  selectedCantrips,
  selectedSpells,
  totalCantripSlots,
  totalSpellSlots,
  onToggleCantrip,
  onToggleSpell,
  isLoading,
  alreadyKnownCantrips,
  alreadyKnownSpells,
}: Props) {
  const [expandedSpell, setExpandedSpell] = useState<SpellOption | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <span className="font-cinzel text-gold text-3xl animate-pulse">&#x2726;</span>
          <p className="font-crimson text-parchment/50 italic text-base">
            Consulting the spellbook…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="font-cinzel text-gold text-lg tracking-widest uppercase">
          Learn New Spells
        </h2>
        <p className="font-crimson text-parchment/50 italic text-base mt-1">
          Choose the spells you will learn at your new level.
        </p>
      </div>

      {/* Cantrips section */}
      {totalCantripSlots > 0 && availableCantrips.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-cinzel text-sm text-gold/80 tracking-widest uppercase">
              New Cantrips
            </h3>
            <span
              className={`font-cinzel text-sm ${
                selectedCantrips.length === totalCantripSlots
                  ? "text-success"
                  : "text-parchment/40"
              }`}
            >
              {selectedCantrips.length} / {totalCantripSlots}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {availableCantrips.map((spell) => {
              const isKnown = alreadyKnownCantrips.includes(spell.name);
              return (
                <SpellCard
                  key={spell.slug}
                  spell={spell}
                  isSelected={selectedCantrips.includes(spell.name)}
                  isKnown={isKnown}
                  disabled={selectedCantrips.length >= totalCantripSlots}
                  onToggle={() => onToggleCantrip(spell.name)}
                  onExpand={() => setExpandedSpell(spell)}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Spells by level */}
      {totalSpellSlots > 0 && availableSpells.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-cinzel text-sm text-gold/80 tracking-widest uppercase">
              New Spells
            </h3>
            <span
              className={`font-cinzel text-sm ${
                selectedSpells.length === totalSpellSlots
                  ? "text-success"
                  : "text-parchment/40"
              }`}
            >
              {selectedSpells.length} / {totalSpellSlots}
            </span>
          </div>
          {availableSpells.map((spellsAtLevel, idx) => {
            if (spellsAtLevel.length === 0) return null;
            const spellLevel = idx + 1;
            return (
              <div key={spellLevel} className="mb-4">
                <h4 className="font-cinzel text-xs text-parchment/40 tracking-widest uppercase mb-2">
                  Level {spellLevel} Spells
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {spellsAtLevel.map((spell) => {
                    const isKnown = alreadyKnownSpells.includes(spell.name);
                    return (
                      <SpellCard
                        key={spell.slug}
                        spell={spell}
                        isSelected={selectedSpells.includes(spell.name)}
                        isKnown={isKnown}
                        disabled={selectedSpells.length >= totalSpellSlots}
                        onToggle={() => onToggleSpell(spell.name)}
                        onExpand={() => setExpandedSpell(spell)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Full description modal */}
      {expandedSpell && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setExpandedSpell(null)}
        >
          <div
            className="bg-dungeon-mid border border-gold/30 rounded-lg shadow-gold-glow max-w-2xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-5 pt-5 pb-3 border-b border-gold/15">
              <div>
                <h3 className="font-cinzel text-gold text-base tracking-wide">
                  {toDisplayCase(expandedSpell.name)}
                </h3>
                <div className="flex gap-3 mt-1 font-crimson text-sm text-parchment/50">
                  <span className="capitalize">{toDisplayCase(expandedSpell.school)}</span>
                  <span>·</span>
                  <span>{expandedSpell.castingTime}</span>
                  <span>·</span>
                  <span>{expandedSpell.range}</span>
                </div>
              </div>
              <button
                onClick={() => setExpandedSpell(null)}
                className="text-parchment/40 hover:text-parchment text-xl leading-none transition-colors"
              >
                &times;
              </button>
            </div>
            <div className="px-5 py-4 overflow-y-auto font-crimson text-parchment/70 text-base leading-relaxed">
              {expandedSpell.description}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
