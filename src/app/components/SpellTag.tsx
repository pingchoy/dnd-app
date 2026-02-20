"use client";

import { useState, useCallback, useEffect } from "react";
import { toDisplayCase } from "../lib/gameTypes";

/** Module-level cache so re-renders and sibling tags share fetched data. */
const spellCache = new Map<string, SpellData | null>();

interface SpellData {
  name: string;
  level?: number;
  school?: string;
  castingTime?: string;
  range?: string;
  duration?: string;
  components?: string;
  description?: string;
}

interface Props {
  name: string;
  /** Tailwind classes for the pill (colour varies: cantrip vs leveled spell). */
  className: string;
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

interface SpellModalProps {
  name: string;
  onClose: () => void;
}

function SpellModal({ name, onClose }: SpellModalProps) {
  const [spell, setSpell] = useState<SpellData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const slug = toSlug(name);

    if (spellCache.has(slug)) {
      setSpell(spellCache.get(slug) ?? null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/srd?type=spell&slug=${slug}`);
        if (cancelled) return;
        if (!res.ok) {
          spellCache.set(slug, null);
          setSpell(null);
        } else {
          const data = (await res.json()) as SpellData;
          spellCache.set(slug, data);
          setSpell(data);
        }
      } catch {
        if (!cancelled) {
          spellCache.set(slug, null);
          setSpell(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [name]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const levelLabel =
    spell?.level != null
      ? spell.level === 0
        ? "Cantrip"
        : `Level ${spell.level}`
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-dungeon-light border border-gold/40 rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && (
          <div className="flex items-center justify-center py-12">
            <span className="font-cinzel text-gold text-2xl animate-pulse">
              ✦
            </span>
          </div>
        )}

        {!loading && !spell && (
          <div className="p-5 text-center">
            <p className="font-cinzel text-sm text-gold mb-1">{toDisplayCase(name)}</p>
            <p className="font-crimson text-sm text-parchment/40 italic">
              No description available.
            </p>
          </div>
        )}

        {!loading && spell && (
          <div className="p-5 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-cinzel text-lg text-gold">{toDisplayCase(spell.name)}</h2>
              <button
                onClick={onClose}
                className="text-parchment/40 hover:text-parchment text-lg leading-none flex-shrink-0 mt-0.5"
              >
                ✕
              </button>
            </div>

            {/* Meta line */}
            {(levelLabel || spell.school) && (
              <p className="font-crimson text-sm text-parchment/50 italic">
                {[levelLabel, spell.school ? toDisplayCase(spell.school) : null].filter(Boolean).join(" · ")}
              </p>
            )}

            {/* Stats grid */}
            {(spell.castingTime || spell.range || spell.duration || spell.components) && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-crimson text-sm">
                {spell.castingTime && (
                  <div>
                    <span className="text-parchment/40">Casting Time: </span>
                    <span className="text-parchment/80">{spell.castingTime}</span>
                  </div>
                )}
                {spell.range && (
                  <div>
                    <span className="text-parchment/40">Range: </span>
                    <span className="text-parchment/80">{spell.range}</span>
                  </div>
                )}
                {spell.duration && (
                  <div>
                    <span className="text-parchment/40">Duration: </span>
                    <span className="text-parchment/80">{spell.duration}</span>
                  </div>
                )}
                {spell.components && (
                  <div>
                    <span className="text-parchment/40">Components: </span>
                    <span className="text-parchment/80">{spell.components}</span>
                  </div>
                )}
              </div>
            )}

            {/* Divider */}
            {spell.description && (
              <div className="border-t border-gold/15" />
            )}

            {/* Description */}
            {spell.description && (
              <p className="font-crimson text-sm text-parchment/80 leading-relaxed whitespace-pre-line">
                {spell.description}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SpellTag({ name, className }: Props) {
  const [open, setOpen] = useState(false);

  const handleClick = useCallback(() => {
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <>
      <span
        className={`cursor-pointer hover:brightness-110 transition-all ${className}`}
        onClick={handleClick}
      >
        {toDisplayCase(name)}
      </span>

      {open && <SpellModal name={name} onClose={handleClose} />}
    </>
  );
}
