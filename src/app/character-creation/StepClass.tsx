"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SRDClass } from "../lib/characterStore";
import { toDisplayCase } from "../lib/gameTypes";
import { OrnateFrame } from "./OrnateFrame";

interface Props {
  classes: SRDClass[];
  selectedClass: SRDClass | null;
  onSelect: (cls: SRDClass) => void;
}

const HIT_DIE_LABEL: Record<number, string> = {
  6: "Fragile",
  8: "Average",
  10: "Sturdy",
  12: "Tank",
};

/** Map class slugs to portrait images in public/imgs/. Classes without an image get the shield placeholder. */
const CLASS_PORTRAITS: Record<string, string> = {
  barbarian: "/imgs/classes/barbarian.png",
  bard: "/imgs/classes/bard.png",
  cleric: "/imgs/classes/cleric.png",
  druid: "/imgs/classes/druid.png",
  fighter: "/imgs/classes/fighter.png",
  monk: "/imgs/classes/monk.png",
  paladin: "/imgs/classes/paladin.png",
  ranger: "/imgs/classes/ranger.png",
  rogue: "/imgs/classes/rogue.png",
  sorcerer: "/imgs/classes/sorcerer.png",
  wizard: "/imgs/classes/wizard.png",
  warlock: "/imgs/classes/warlock.png",
  // Empty for now — all classes use fallback SVG icon
};

// ─── Class Detail Modal ──────────────────────────────────────────────────────

interface ClassDetailModalProps {
  cls: SRDClass;
  onClose: () => void;
}

function ClassDetailModal({ cls, onClose }: ClassDetailModalProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const spellLabel =
    cls.spellcastingType === "known"
      ? "Known"
      : cls.spellcastingType === "prepared"
        ? "Prepared"
        : "None";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-dungeon-light border border-gold/40 rounded-lg shadow-xl
                   w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-6 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-cinzel text-xl text-gold">
                {toDisplayCase(cls.name)}
              </h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 font-crimson text-sm text-parchment/70 mt-1">
                <span>
                  Hit Die{" "}
                  <strong className="text-parchment/90">d{cls.hitDie}</strong>
                </span>
                {cls.primaryAbility && (
                  <span>
                    Primary{" "}
                    <strong className="text-parchment/90">
                      {toDisplayCase(cls.primaryAbility)}
                    </strong>
                  </span>
                )}
                <span>
                  Spellcasting{" "}
                  <strong className="text-parchment/90">{spellLabel}</strong>
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-parchment/40 hover:text-parchment text-lg leading-none flex-shrink-0 mt-0.5"
            >
              ✕
            </button>
          </div>

          {/* Proficiencies & stats — two columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {/* Left column: weapon & armor proficiencies */}
            <div className="space-y-3">
              {cls.weaponProficiencies.length > 0 && (
                <div>
                  <span className="font-cinzel text-xs text-gold/70 tracking-wide uppercase">
                    Weapon Proficiencies
                  </span>
                  <p className="font-crimson text-sm text-parchment/65 leading-relaxed mt-0.5">
                    {cls.weaponProficiencies.map(toDisplayCase).join(", ")}
                  </p>
                </div>
              )}

              {cls.armorProficiencies.length > 0 && (
                <div>
                  <span className="font-cinzel text-xs text-gold/70 tracking-wide uppercase">
                    Armor Proficiencies
                  </span>
                  <p className="font-crimson text-sm text-parchment/65 leading-relaxed mt-0.5">
                    {cls.armorProficiencies.map(toDisplayCase).join(", ")}
                  </p>
                </div>
              )}
            </div>

            {/* Right column: saves, skills, spellcasting */}
            <div className="space-y-3">
              <div>
                <span className="font-cinzel text-xs text-gold/70 tracking-wide uppercase">
                  Saving Throws
                </span>
                <p className="font-crimson text-sm text-parchment/65 leading-relaxed mt-0.5">
                  {cls.savingThrows.map(toDisplayCase).join(", ")}
                </p>
              </div>

              {cls.skillOptions.length > 0 && (
                <div>
                  <span className="font-cinzel text-xs text-gold/70 tracking-wide uppercase">
                    Skill Options (choose {cls.skillChoices})
                  </span>
                  <p className="font-crimson text-sm text-parchment/65 leading-relaxed mt-0.5">
                    {cls.skillOptions.map(toDisplayCase).join(", ")}
                  </p>
                </div>
              )}

              {cls.spellcastingType !== "none" && cls.spellcastingAbility && (
                <div>
                  <span className="font-cinzel text-xs text-gold/70 tracking-wide uppercase">
                    Spellcasting Ability
                  </span>
                  <p className="font-crimson text-sm text-parchment/65 leading-relaxed mt-0.5">
                    {toDisplayCase(cls.spellcastingAbility)} ({spellLabel}{" "}
                    caster)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Archetypes */}
          {cls.archetypes.length > 0 && (
            <>
              <div className="border-t border-gold/15" />
              <div>
                <span className="font-cinzel text-xs text-gold/70 tracking-wide uppercase">
                  Archetypes (Level {cls.archetypeLevel})
                </span>
                <div className="mt-1 space-y-1.5">
                  {cls.archetypes.map((a) => (
                    <div key={a.slug}>
                      <div className="font-cinzel text-sm text-parchment font-semibold">
                        {toDisplayCase(a.name)}
                      </div>
                      {a.description && (
                        <p className="font-crimson text-sm text-parchment/70 leading-relaxed whitespace-pre-line mt-0.5 line-clamp-3">
                          {a.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Description (class features) */}
          {cls.description && (
            <>
              <div className="border-t border-gold/15" />
              <div
                className="prose prose-invert prose-sm max-w-none
              prose-headings:font-cinzel prose-headings:text-gold/80 prose-headings:tracking-wide
              prose-h3:text-base prose-h3:mt-4 prose-h3:mb-1
              prose-p:font-crimson prose-p:text-parchment/60 prose-p:leading-relaxed prose-p:my-1.5
              prose-strong:text-parchment/80
              prose-em:text-parchment/50
              prose-ul:my-1 prose-li:my-0 prose-li:text-parchment/60 prose-li:font-crimson"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {cls.description}
                </ReactMarkdown>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── StepClass ───────────────────────────────────────────────────────────────

export default function StepClass({ classes, selectedClass, onSelect }: Props) {
  const [detailClass, setDetailClass] = useState<SRDClass | null>(null);
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
          Choose Your Class
        </h2>
        <p className="font-crimson text-parchment/50 italic text-sm mt-1">
          Your class defines your capabilities, hit points, and fighting style.
        </p>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory"
      >
        {classes.map((cls) => {
          const isSelected = selectedClass?.slug === cls.slug;
          return (
            <div
              key={cls.slug}
              className="w-64 flex-shrink-0 snap-center group"
            >
              <OrnateFrame selected={isSelected}>
                <button
                  onClick={() => onSelect(cls)}
                  className="w-full h-full text-left flex flex-col"
                >
                  {/* Portrait */}
                  <div className="w-full aspect-[4/5] bg-dungeon flex items-center justify-center overflow-hidden">
                    {CLASS_PORTRAITS[cls.slug] ? (
                      <img
                        src={CLASS_PORTRAITS[cls.slug]}
                        alt={cls.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      />
                    ) : (
                      <svg
                        className="w-16 h-16 text-gold/20"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" />
                      </svg>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="p-4 bg-dungeon-mid flex-1 flex flex-col">
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-cinzel text-sm text-parchment tracking-wide">
                          {toDisplayCase(cls.name)}
                        </span>
                        {isSelected && (
                          <span className="font-cinzel text-gold text-xs flex-shrink-0">
                            &#10022;
                          </span>
                        )}
                      </div>
                      <div className="font-cinzel text-[11px] text-gold/70 tracking-wide">
                        Hit Die: d{cls.hitDie} {HIT_DIE_LABEL[cls.hitDie] ?? ""}
                      </div>
                      {cls.savingThrows.length > 0 && (
                        <div className="font-crimson text-xs text-parchment/60">
                          Saves:{" "}
                          {cls.savingThrows.map(toDisplayCase).join(", ")}
                        </div>
                      )}
                      {cls.skillOptions.length > 0 && (
                        <div className="font-crimson text-[11px] text-parchment/40 italic">
                          {cls.skillChoices} skills from{" "}
                          {cls.skillOptions.length} options
                        </div>
                      )}
                    </div>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailClass(cls);
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

      {detailClass && (
        <ClassDetailModal
          cls={detailClass}
          onClose={() => setDetailClass(null)}
        />
      )}
    </div>
  );
}
