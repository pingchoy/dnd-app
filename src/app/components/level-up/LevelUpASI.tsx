"use client";

import { useState } from "react";
import type { CharacterStats, PlayerState } from "../../lib/gameTypes";
import { formatModifier, getModifier, toDisplayCase } from "../../lib/gameTypes";
import type { ASIState, SRDFeat } from "../../hooks/useLevelUp";

interface Props {
  asiStates: ASIState[];
  player: PlayerState;
  feats: SRDFeat[];
  isLoadingFeats: boolean;
  onSetMode: (level: number, mode: "asi" | "feat") => void;
  onAdjust: (level: number, stat: keyof CharacterStats, delta: 1 | -1) => void;
  onSetFeat: (level: number, feat: string) => void;
}

const STAT_NAMES: { key: keyof CharacterStats; label: string }[] = [
  { key: "strength", label: "STR" },
  { key: "dexterity", label: "DEX" },
  { key: "constitution", label: "CON" },
  { key: "intelligence", label: "INT" },
  { key: "wisdom", label: "WIS" },
  { key: "charisma", label: "CHA" },
];

interface ASISectionProps {
  asi: ASIState;
  player: PlayerState;
  feats: SRDFeat[];
  isLoadingFeats: boolean;
  onSetMode: (mode: "asi" | "feat") => void;
  onAdjust: (stat: keyof CharacterStats, delta: 1 | -1) => void;
  onSetFeat: (feat: string) => void;
}

function ASISection({
  asi,
  player,
  feats,
  isLoadingFeats,
  onSetMode,
  onAdjust,
  onSetFeat,
}: ASISectionProps) {
  const totalPoints = Object.values(asi.points).reduce((sum, v) => sum + (v ?? 0), 0);
  const remaining = 2 - totalPoints;
  const [expandedFeat, setExpandedFeat] = useState<SRDFeat | null>(null);

  return (
    <div className="bg-dungeon-mid border border-gold/20 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-cinzel text-gold/90 text-base tracking-wide">
          Level {asi.level}
        </h3>
        <span className="font-cinzel text-xs text-parchment/40">
          Ability Score Improvement
        </span>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => onSetMode("asi")}
          className={`font-cinzel text-xs tracking-widest uppercase px-3 py-1.5 rounded border transition-all ${
            asi.mode === "asi"
              ? "border-gold bg-gold/15 text-gold"
              : "border-gold/20 text-parchment/50 hover:border-gold/40"
          }`}
        >
          +2 Ability Scores
        </button>
        <button
          onClick={() => onSetMode("feat")}
          className={`font-cinzel text-xs tracking-widest uppercase px-3 py-1.5 rounded border transition-all ${
            asi.mode === "feat"
              ? "border-gold bg-gold/15 text-gold"
              : "border-gold/20 text-parchment/50 hover:border-gold/40"
          }`}
        >
          Choose a Feat
        </button>
      </div>

      {asi.mode === "asi" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-cinzel text-xs text-parchment/50 tracking-widest uppercase">
              Distribute 2 points
            </span>
            <span
              className={`font-cinzel text-xs ${
                remaining === 0 ? "text-success" : "text-parchment/40"
              }`}
            >
              {remaining} remaining
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {STAT_NAMES.map(({ key, label }) => {
              const base = player.stats[key];
              const bonus = asi.points[key] ?? 0;
              const effective = base + bonus;
              const atMax = effective >= 20;

              return (
                <div
                  key={key}
                  className="flex items-center justify-between bg-dungeon border border-gold/10 rounded px-3 py-2"
                >
                  <div>
                    <span className="font-cinzel text-xs text-parchment/60 tracking-wide">
                      {label}
                    </span>
                    <div className="font-crimson text-base text-parchment">
                      {effective}
                      <span className="text-parchment/40 ml-1 text-sm">
                        ({formatModifier(getModifier(effective))})
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => onAdjust(key, 1)}
                      disabled={remaining <= 0 || atMax || bonus >= 2}
                      className="w-6 h-6 flex items-center justify-center text-gold/60 hover:text-gold disabled:text-parchment/15 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M6 2V10M2 6H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onAdjust(key, -1)}
                      disabled={bonus <= 0}
                      className="w-6 h-6 flex items-center justify-center text-gold/60 hover:text-gold disabled:text-parchment/15 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {asi.mode === "feat" && (
        <div className="space-y-3">
          {isLoadingFeats ? (
            <div className="flex items-center justify-center py-8">
              <span className="font-cinzel text-gold text-2xl animate-pulse">&#x2726;</span>
            </div>
          ) : feats.length === 0 ? (
            <p className="font-crimson text-parchment/50 italic text-base text-center py-4">
              No feats available in the SRD data.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
              {feats.map((feat) => {
                const isSelected = asi.featChoice === feat.name;
                return (
                  <button
                    key={feat.slug}
                    onClick={() => onSetFeat(feat.name)}
                    className={`text-left p-3 rounded border transition-all ${
                      isSelected
                        ? "border-gold bg-gold/10 shadow-gold-glow"
                        : "border-gold/15 bg-dungeon hover:border-gold/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-cinzel text-sm text-parchment tracking-wide">
                          {toDisplayCase(feat.name)}
                        </span>
                        {feat.prerequisite && (
                          <span className="font-crimson text-xs text-parchment/30 ml-2">
                            (Prereq: {feat.prerequisite})
                          </span>
                        )}
                        <p className="font-crimson text-sm text-parchment/40 mt-1 line-clamp-2 leading-snug">
                          {feat.description?.split("\n")[0]?.slice(0, 150)}
                        </p>
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpandedFeat(feat); }}
                          className="font-crimson text-sm text-gold/50 italic mt-0.5 hover:text-gold transition-colors"
                        >
                          Read more...
                        </button>
                      </div>
                      {isSelected && (
                        <span className="font-cinzel text-gold text-xs flex-shrink-0 mt-0.5">
                          &#x2726;
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Expanded feat modal */}
      {expandedFeat && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setExpandedFeat(null)}
        >
          <div
            className="bg-dungeon-mid border border-gold/30 rounded-lg shadow-gold-glow max-w-2xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-5 pt-5 pb-3 border-b border-gold/15">
              <h3 className="font-cinzel text-gold text-base tracking-wide">
                {toDisplayCase(expandedFeat.name)}
              </h3>
              <button
                onClick={() => setExpandedFeat(null)}
                className="text-parchment/40 hover:text-parchment text-xl leading-none transition-colors"
              >
                &times;
              </button>
            </div>
            <div className="px-5 py-4 overflow-y-auto font-crimson text-parchment/70 text-base leading-relaxed">
              {expandedFeat.prerequisite && (
                <p className="text-parchment/40 italic mb-2">
                  Prerequisite: {expandedFeat.prerequisite}
                </p>
              )}
              {expandedFeat.description}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LevelUpASI({
  asiStates,
  player,
  feats,
  isLoadingFeats,
  onSetMode,
  onAdjust,
  onSetFeat,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="font-cinzel text-gold text-lg tracking-widest uppercase">
          Ability Score Improvement
        </h2>
        <p className="font-crimson text-parchment/50 italic text-base mt-1">
          Increase your abilities or choose a feat.
        </p>
      </div>

      {asiStates.map((asi) => (
        <ASISection
          key={asi.level}
          asi={asi}
          player={player}
          feats={feats}
          isLoadingFeats={isLoadingFeats}
          onSetMode={(mode) => onSetMode(asi.level, mode)}
          onAdjust={(stat, delta) => onAdjust(asi.level, stat, delta)}
          onSetFeat={(feat) => onSetFeat(asi.level, feat)}
        />
      ))}
    </div>
  );
}
