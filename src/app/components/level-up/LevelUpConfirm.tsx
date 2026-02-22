"use client";

import type { PendingLevelUp, PlayerState } from "../../lib/gameTypes";
import { formatModifier, getModifier, getProficiencyBonus, toDisplayCase } from "../../lib/gameTypes";
import type { ASIState } from "../../hooks/useLevelUp";

interface Props {
  pending: PendingLevelUp;
  player: PlayerState;
  asiStates: ASIState[];
  selectedSubclass: string | null;
  featureChoices: Record<string, string>;
  selectedCantrips: string[];
  selectedSpells: string[];
  selectedPreparedSpells: string[];
  isConfirming: boolean;
  error: string | null;
  onConfirm: () => void;
}

export default function LevelUpConfirm({
  pending,
  player,
  asiStates,
  selectedSubclass,
  featureChoices,
  selectedCantrips,
  selectedSpells,
  selectedPreparedSpells,
  isConfirming,
  error,
  onConfirm,
}: Props) {
  const totalHpGain = pending.levels.reduce((sum, l) => sum + l.hpGain, 0);
  const oldProfBonus = getProficiencyBonus(pending.fromLevel);
  const newProfBonus = getProficiencyBonus(pending.toLevel);

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="font-cinzel text-gold text-lg tracking-widest uppercase">
          Confirm Level Up
        </h2>
        <p className="font-crimson text-parchment/50 italic text-base mt-1">
          Review your choices before advancing.
        </p>
      </div>

      <div className="bg-dungeon-mid border border-gold/20 rounded-lg p-5 space-y-4">
        {/* Level change */}
        <div className="flex items-center justify-between border-b border-gold/10 pb-3">
          <span className="font-cinzel text-sm text-parchment/60 uppercase tracking-wide">Level</span>
          <span className="font-cinzel text-base text-gold">
            {pending.fromLevel} &rarr; {pending.toLevel}
          </span>
        </div>

        {/* HP */}
        <div className="flex items-center justify-between border-b border-gold/10 pb-3">
          <span className="font-cinzel text-sm text-parchment/60 uppercase tracking-wide">Hit Points</span>
          <span className="font-crimson text-base text-parchment">
            {player.maxHP}{" "}
            <span className="text-success">+{totalHpGain}</span>{" "}
            &rarr; {player.maxHP + totalHpGain}
          </span>
        </div>

        {/* Proficiency bonus */}
        {newProfBonus !== oldProfBonus && (
          <div className="flex items-center justify-between border-b border-gold/10 pb-3">
            <span className="font-cinzel text-sm text-parchment/60 uppercase tracking-wide">Proficiency</span>
            <span className="font-crimson text-base text-parchment">
              +{oldProfBonus} &rarr; <span className="text-gold">+{newProfBonus}</span>
            </span>
          </div>
        )}

        {/* Subclass */}
        {selectedSubclass && (
          <div className="flex items-center justify-between border-b border-gold/10 pb-3">
            <span className="font-cinzel text-sm text-parchment/60 uppercase tracking-wide">Subclass</span>
            <span className="font-crimson text-base text-purple-300">{toDisplayCase(selectedSubclass)}</span>
          </div>
        )}

        {/* ASI / Feat */}
        {asiStates.length > 0 && (
          <div className="border-b border-gold/10 pb-3 space-y-2">
            <span className="font-cinzel text-sm text-parchment/60 uppercase tracking-wide">
              Ability Score Improvements
            </span>
            {asiStates.map((asi) => (
              <div key={asi.level} className="ml-2 font-crimson text-base text-parchment/70">
                <span className="text-parchment/40">Lv{asi.level}:</span>{" "}
                {asi.mode === "feat" ? (
                  <span className="text-blue-300">Feat: {asi.featChoice}</span>
                ) : (
                  Object.entries(asi.points)
                    .filter(([, v]) => v && v > 0)
                    .map(([stat, v]) => (
                      <span key={stat} className="text-success mr-2">
                        {stat.slice(0, 3).toUpperCase()} +{v}
                      </span>
                    ))
                )}
              </div>
            ))}
          </div>
        )}

        {/* Feature choices */}
        {Object.keys(featureChoices).length > 0 && (
          <div className="border-b border-gold/10 pb-3 space-y-1">
            <span className="font-cinzel text-sm text-parchment/60 uppercase tracking-wide">
              Feature Choices
            </span>
            {Object.entries(featureChoices).map(([name, choice]) => (
              <div key={name} className="ml-2 font-crimson text-base text-parchment/70">
                <span className="text-parchment/40">{toDisplayCase(name)}:</span>{" "}
                <span className="text-yellow-300">{toDisplayCase(choice)}</span>
              </div>
            ))}
          </div>
        )}

        {/* New cantrips */}
        {selectedCantrips.length > 0 && (
          <div className="border-b border-gold/10 pb-3">
            <span className="font-cinzel text-sm text-parchment/60 uppercase tracking-wide">
              New Cantrips
            </span>
            <div className="mt-1 flex flex-wrap gap-2">
              {selectedCantrips.map((name) => (
                <span
                  key={name}
                  className="font-crimson text-sm text-cyan-300 bg-cyan-900/30 border border-cyan-500/30 rounded px-2 py-0.5"
                >
                  {toDisplayCase(name)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* New spells (known casters) */}
        {selectedSpells.length > 0 && (
          <div className="border-b border-gold/10 pb-3">
            <span className="font-cinzel text-sm text-parchment/60 uppercase tracking-wide">
              New Spells
            </span>
            <div className="mt-1 flex flex-wrap gap-2">
              {selectedSpells.map((name) => (
                <span
                  key={name}
                  className="font-crimson text-sm text-cyan-300 bg-cyan-900/30 border border-cyan-500/30 rounded px-2 py-0.5"
                >
                  {toDisplayCase(name)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Prepared spells (prepared casters) */}
        {selectedPreparedSpells.length > 0 && (
          <div className="pb-1">
            <span className="font-cinzel text-sm text-parchment/60 uppercase tracking-wide">
              Prepared Spells ({selectedPreparedSpells.length})
            </span>
            <div className="mt-1 flex flex-wrap gap-2">
              {selectedPreparedSpells.map((name) => (
                <span
                  key={name}
                  className="font-crimson text-sm text-gold-light bg-gold/10 border border-gold/30 rounded px-2 py-0.5"
                >
                  {toDisplayCase(name)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* New features (non-choice) */}
        {pending.levels.some((l) => l.newFeatures.length > 0 || l.newSubclassFeatures.length > 0) && (
          <div className="pt-2">
            <span className="font-cinzel text-sm text-parchment/60 uppercase tracking-wide">
              New Features
            </span>
            <div className="mt-1 space-y-1">
              {pending.levels.flatMap((l) => [
                ...l.newFeatures.map((f) => (
                  <div key={`${l.level}-${f.name}`} className="ml-2 font-crimson text-base text-parchment/70">
                    {toDisplayCase(f.name)}
                    {featureChoices[f.name] && (
                      <span className="text-yellow-300 ml-1">({toDisplayCase(featureChoices[f.name])})</span>
                    )}
                  </div>
                )),
                ...l.newSubclassFeatures.map((f) => (
                  <div key={`${l.level}-sub-${f.name}`} className="ml-2 font-crimson text-base text-purple-300/70">
                    {toDisplayCase(f.name)} <span className="text-parchment/30 text-sm">({toDisplayCase(player.subclass ?? "")})</span>
                  </div>
                )),
              ])}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/30 rounded p-3 text-center">
          <p className="font-crimson text-base text-red-300">{error}</p>
        </div>
      )}

      <div className="flex justify-center pt-2">
        <button
          onClick={onConfirm}
          disabled={isConfirming}
          className="font-cinzel text-sm text-dungeon bg-gold border border-gold rounded px-8 py-3
                     tracking-widest uppercase hover:bg-gold/90
                     disabled:opacity-50 disabled:cursor-not-allowed transition-all
                     shadow-gold-glow"
        >
          {isConfirming ? "Applying…" : "Confirm Level Up"}
        </button>
      </div>
    </div>
  );
}
