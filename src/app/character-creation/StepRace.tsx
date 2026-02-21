"use client";

import { useState, useEffect, useRef } from "react";
import type { SRDRace } from "../lib/characterStore";
import { toDisplayCase, HIDDEN_RACIAL_TRAITS, LORE_RACIAL_TRAITS } from "../lib/gameTypes";
import { OrnateFrame } from "./OrnateFrame";

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

/** Extract just the size category word from a raw size string. */
function sizeCategory(raw: string): string {
  const m = raw.match(/\b(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/i);
  return m ? m[0] : raw;
}

// ─── Race Detail Modal ────────────────────────────────────────────────────────

interface RaceDetailModalProps {
  race: SRDRace;
  onClose: () => void;
}

function RaceDetailModal({ race, onClose }: RaceDetailModalProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-dungeon-light border border-gold/40 rounded-lg shadow-xl
                   w-full max-w-3xl mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-6 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-cinzel text-xl text-gold">
                {toDisplayCase(race.name)}
              </h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 font-crimson text-sm text-parchment/70 mt-1">
                <span>
                  Speed{" "}
                  <strong className="text-parchment/90">{race.speed} ft</strong>
                </span>
                <span>
                  Size{" "}
                  <strong className="text-parchment/90">
                    {sizeCategory(race.size)}
                  </strong>
                </span>
                {Object.keys(race.abilityBonuses).length > 0 && (
                  <span className="text-gold/80">
                    {asiSummary(race.abilityBonuses)}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-parchment/40 hover:text-parchment text-lg leading-none flex-shrink-0 mt-0.5"
            >
              ✕
            </button>
          </div>

          {/* Lore description */}
          {race.lore?.description && (
            <p className="font-crimson text-sm text-parchment/60 italic leading-relaxed">
              {race.lore.description}
            </p>
          )}

          <div className="border-t border-gold/20" />

          {/* Two-column layout: lore left, traits right — stacks on mobile */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left column: lore */}
            <div className="space-y-3">
              <h3 className="font-cinzel text-sm text-parchment/50 tracking-widest uppercase">
                Details
              </h3>
              {race.lore?.age && (
                <div>
                  <span className="font-cinzel text-xs text-gold/70 tracking-wide uppercase">
                    Age
                  </span>
                  <p className="font-crimson text-sm text-parchment/65 leading-relaxed mt-0.5">
                    {race.lore.age}
                  </p>
                </div>
              )}
              {race.lore?.alignment && (
                <div>
                  <span className="font-cinzel text-xs text-gold/70 tracking-wide uppercase">
                    Alignment
                  </span>
                  <p className="font-crimson text-sm text-parchment/65 leading-relaxed mt-0.5">
                    {race.lore.alignment}
                  </p>
                </div>
              )}
              {race.lore?.sizeDescription && (
                <div>
                  <span className="font-cinzel text-xs text-gold/70 tracking-wide uppercase">
                    Size
                  </span>
                  <p className="font-crimson text-sm text-parchment/65 leading-relaxed mt-0.5">
                    {race.lore.sizeDescription}
                  </p>
                </div>
              )}
              {race.lore?.speedDescription && (
                <div>
                  <span className="font-cinzel text-xs text-gold/70 tracking-wide uppercase">
                    Speed
                  </span>
                  <p className="font-crimson text-sm text-parchment/65 leading-relaxed mt-0.5">
                    {race.lore.speedDescription}
                  </p>
                </div>
              )}
              {race.lore?.languageDescription && (
                <div>
                  <span className="font-cinzel text-xs text-gold/70 tracking-wide uppercase">
                    Languages
                  </span>
                  <p className="font-crimson text-sm text-parchment/65 leading-relaxed mt-0.5">
                    {race.lore.languageDescription}
                  </p>
                </div>
              )}
              {(race.weaponProficiencies ?? []).length > 0 && (
                <div>
                  <span className="font-cinzel text-xs text-gold/70 tracking-wide uppercase">
                    Weapon Proficiencies
                  </span>
                  <p className="font-crimson text-sm text-parchment/65 leading-relaxed mt-0.5">
                    {race.weaponProficiencies!.map(toDisplayCase).join(", ")}
                  </p>
                </div>
              )}
              {(race.armorProficiencies ?? []).length > 0 && (
                <div>
                  <span className="font-cinzel text-xs text-gold/70 tracking-wide uppercase">
                    Armor Proficiencies
                  </span>
                  <p className="font-crimson text-sm text-parchment/65 leading-relaxed mt-0.5">
                    {race.armorProficiencies!.map(toDisplayCase).join(", ")}
                  </p>
                </div>
              )}
            </div>

            {/* Right column: traits */}
            {race.traits.filter((t) => !HIDDEN_RACIAL_TRAITS.has(t.name.toLowerCase()) && !LORE_RACIAL_TRAITS.has(t.name.toLowerCase())).length > 0 && (
              <div className="space-y-3">
                <h3 className="font-cinzel text-sm text-parchment/50 tracking-widest uppercase">
                  Racial Traits
                </h3>
                {race.traits
                  .filter((t) => !HIDDEN_RACIAL_TRAITS.has(t.name.toLowerCase()) && !LORE_RACIAL_TRAITS.has(t.name.toLowerCase()))
                  .map((t) => (
                  <div key={t.name}>
                    <div className="font-cinzel text-sm text-parchment font-semibold">
                      {toDisplayCase(t.name)}
                    </div>
                    {t.description && (
                      <p className="font-crimson text-sm text-parchment/70 leading-relaxed whitespace-pre-line mt-0.5">
                        {t.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Map race slugs to portrait images in public/imgs/. Races without an image get the placeholder. */
const RACE_PORTRAITS: Record<string, string> = {
  dragonborn: "/imgs/races/dragonborn.png",
  dwarf: "/imgs/races/dwarf.png",
  elf: "/imgs/races/elf.png",
  gnome: "/imgs/races/gnome.png",
  "half-elf": "/imgs/races/half-elf.png",
  "half-orc": "/imgs/races/half-orc.png",
  halfling: "/imgs/races/halfling.png",
  human: "/imgs/races/human.png",
  tiefling: "/imgs/races/tiefling.png",
};

// ─── StepRace ────────────────────────────────────────────────────────────────

export default function StepRace({ races, selectedRace, onSelect }: Props) {
  const [detailRace, setDetailRace] = useState<SRDRace | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /** Attach a non-passive wheel listener so preventDefault actually blocks vertical scroll. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollBy({ left: e.deltaY, behavior: "smooth" });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="font-cinzel text-gold text-lg tracking-widest uppercase">
          Choose Your Race
        </h2>
        <p className="font-crimson text-parchment/50 italic text-sm mt-1">
          Your race shapes your heritage, abilities, and place in the world.
        </p>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory"
      >
        {races.map((race) => {
          const isSelected = selectedRace?.slug === race.slug;
          return (
            <div
              key={race.slug}
              className="w-64 flex-shrink-0 snap-center group"
            >
              <OrnateFrame selected={isSelected}>
                <button
                  onClick={() => onSelect(race)}
                  className="w-full h-full text-left flex flex-col"
                >
                  {/* Portrait */}
                  <div className="w-full aspect-[4/5] bg-dungeon flex items-center justify-center overflow-hidden">
                    {RACE_PORTRAITS[race.slug] ? (
                      <img
                        src={RACE_PORTRAITS[race.slug]}
                        alt={race.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      />
                    ) : (
                      <svg
                        className="w-16 h-16 text-gold/20"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
                      </svg>
                    )}
                  </div>

                  {/* Card body — flex column so "See details" pins to bottom */}
                  <div className="p-4 bg-dungeon-mid flex-1 flex flex-col">
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-cinzel text-sm text-parchment tracking-wide">
                          {toDisplayCase(race.name)}
                        </span>
                        {isSelected && (
                          <span className="font-cinzel text-gold text-xs flex-shrink-0">
                            ✦
                          </span>
                        )}
                      </div>
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
                      {race.traits.filter((t) => !HIDDEN_RACIAL_TRAITS.has(t.name.toLowerCase()) && !LORE_RACIAL_TRAITS.has(t.name.toLowerCase())).length > 0 && (
                        <div className="font-crimson text-sm text-parchment/60 mt-1 line-clamp-2">
                          {race.traits
                            .filter((t) => !HIDDEN_RACIAL_TRAITS.has(t.name.toLowerCase()) && !LORE_RACIAL_TRAITS.has(t.name.toLowerCase()))
                            .map((t) => toDisplayCase(t.name))
                            .join(" · ")}
                        </div>
                      )}
                    </div>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailRace(race);
                      }}
                      className="inline-block font-crimson text-sm text-gold/70 hover:text-gold
                                 mt-auto pt-2 cursor-pointer transition-colors"
                    >
                      See details &rarr;
                    </span>
                  </div>
                </button>
              </OrnateFrame>
            </div>
          );
        })}
      </div>

      {detailRace && (
        <RaceDetailModal
          race={detailRace}
          onClose={() => setDetailRace(null)}
        />
      )}
    </div>
  );
}
