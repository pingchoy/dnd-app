"use client";

import { useState } from "react";
import type { SpellOption } from "../hooks/useCharacterCreation";
import { toDisplayCase } from "../lib/gameTypes";

interface Props {
  title?: string;
  availableCantrips: SpellOption[];
  availableSpells: SpellOption[];
  cantripsToChoose: number;
  spellsToChoose: number;
  selectedCantrips: string[];
  selectedSpells: string[];
  onToggleCantrip: (name: string) => void;
  onToggleSpell: (name: string) => void;
  isLoading: boolean;
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
  disabled: boolean;
  onToggle: () => void;
  onExpand: () => void;
}

function SpellCard({ spell, isSelected, disabled, onToggle, onExpand }: SpellCardProps) {
  const schoolClass = SCHOOL_COLORS[spell.school] ?? "bg-ink/20 text-parchment/60 border-ink/30";

  return (
    <button
      onClick={onToggle}
      disabled={disabled && !isSelected}
      className={`w-full text-left rounded-lg border p-3 transition-all ${
        isSelected
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
                : "border-gold/30"
            }`}
          >
            {isSelected && (
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

interface PageControlsProps {
  current: number;
  total: number;
  onChange: (page: number) => void;
}

function PageControls({ current, total, onChange }: PageControlsProps) {
  return (
    <div className="flex items-center justify-center gap-3 mt-4">
      <button
        onClick={() => onChange(current - 1)}
        disabled={current === 0}
        className="font-cinzel text-xs text-parchment/40 hover:text-parchment disabled:opacity-20 transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="inline-block">
          <path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          onClick={() => onChange(i)}
          className={`w-6 h-6 rounded-full font-cinzel text-[10px] leading-none border transition-all ${
            i === current
              ? "border-gold text-gold"
              : "border-gold/20 text-parchment/30 hover:border-gold/50 hover:text-parchment/60"
          }`}
        >
          {i + 1}
        </button>
      ))}
      <button
        onClick={() => onChange(current + 1)}
        disabled={current === total - 1}
        className="font-cinzel text-xs text-parchment/40 hover:text-parchment disabled:opacity-20 transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="inline-block">
          <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

export default function StepSpells({
  title,
  availableCantrips,
  availableSpells,
  cantripsToChoose,
  spellsToChoose,
  selectedCantrips,
  selectedSpells,
  onToggleCantrip,
  onToggleSpell,
  isLoading,
}: Props) {
  const [expandedSpell, setExpandedSpell] = useState<SpellOption | null>(null);
  const [cantripPage, setCantripPage] = useState(0);
  const [spellPage, setSpellPage] = useState(0);
  const PAGE_SIZE = 6;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <span className="font-cinzel text-gold text-3xl animate-pulse">✦</span>
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
          {title ?? "Choose Your Spells"}
        </h2>
        <p className="font-crimson text-parchment/50 italic text-base mt-1">
          Select the spells you will know at level 1.
        </p>
      </div>

      {/* Cantrips section */}
      {cantripsToChoose > 0 && availableCantrips.length > 0 && (() => {
        const totalPages = Math.ceil(availableCantrips.length / PAGE_SIZE);
        const pageSpells = availableCantrips.slice(cantripPage * PAGE_SIZE, (cantripPage + 1) * PAGE_SIZE);
        return (
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="font-cinzel text-sm text-gold/80 tracking-widest uppercase">
                Cantrips
              </h3>
              <span
                className={`font-cinzel text-sm ${
                  selectedCantrips.length === cantripsToChoose
                    ? "text-success"
                    : "text-parchment/40"
                }`}
              >
                {selectedCantrips.length} / {cantripsToChoose}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {pageSpells.map((spell) => (
                <SpellCard
                  key={spell.slug}
                  spell={spell}
                  isSelected={selectedCantrips.includes(spell.slug)}
                  disabled={selectedCantrips.length >= cantripsToChoose}
                  onToggle={() => onToggleCantrip(spell.slug)}
                  onExpand={() => setExpandedSpell(spell)}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <PageControls current={cantripPage} total={totalPages} onChange={setCantripPage} />
            )}
          </section>
        );
      })()}

      {/* Spells section */}
      {spellsToChoose > 0 && availableSpells.length > 0 && (() => {
        const totalPages = Math.ceil(availableSpells.length / PAGE_SIZE);
        const pageSpells = availableSpells.slice(spellPage * PAGE_SIZE, (spellPage + 1) * PAGE_SIZE);
        return (
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="font-cinzel text-sm text-gold/80 tracking-widest uppercase">
                1st-Level Spells
              </h3>
              <span
                className={`font-cinzel text-sm ${
                  selectedSpells.length === spellsToChoose
                    ? "text-success"
                    : "text-parchment/40"
                }`}
              >
                {selectedSpells.length} / {spellsToChoose}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {pageSpells.map((spell) => (
                <SpellCard
                  key={spell.slug}
                  spell={spell}
                  isSelected={selectedSpells.includes(spell.slug)}
                  disabled={selectedSpells.length >= spellsToChoose}
                  onToggle={() => onToggleSpell(spell.slug)}
                  onExpand={() => setExpandedSpell(spell)}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <PageControls current={spellPage} total={totalPages} onChange={setSpellPage} />
            )}
          </section>
        );
      })()}

      {/* Full description modal */}
      {expandedSpell && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setExpandedSpell(null)}
        >
          <div
            className="bg-dungeon-mid border border-gold/30 rounded-lg shadow-gold-glow
                       max-w-2xl w-full max-h-[80vh] flex flex-col"
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
