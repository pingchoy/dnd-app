"use client";

import type { PendingLevelUp, PlayerState } from "../../lib/gameTypes";
import { getProficiencyBonus, toDisplayCase } from "../../lib/gameTypes";

interface Props {
  pending: PendingLevelUp;
  player: PlayerState;
}

export default function LevelUpSummary({ pending, player }: Props) {
  const oldProfBonus = getProficiencyBonus(pending.fromLevel);
  const newProfBonus = getProficiencyBonus(pending.toLevel);
  const profChanged = newProfBonus !== oldProfBonus;

  return (
    <div className="space-y-6">
      {/* Celebration header */}
      <div className="text-center py-4">
        <div className="text-5xl mb-3 animate-pulse">&#x2728;</div>
        <h2 className="font-cinzel text-gold text-2xl tracking-widest uppercase">
          Level {pending.toLevel}!
        </h2>
        <p className="font-crimson text-parchment/60 italic text-base mt-2">
          {pending.fromLevel === pending.toLevel - 1
            ? "You have gained enough experience to advance."
            : `You advance from level ${pending.fromLevel} to level ${pending.toLevel}!`}
        </p>
      </div>

      {/* Per-level breakdown */}
      <div className="space-y-4">
        {pending.levels.map((levelData) => (
          <div
            key={levelData.level}
            className="bg-dungeon-mid border border-gold/20 rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-cinzel text-gold/90 text-base tracking-wide">
                Level {levelData.level}
              </h3>
              <span className="font-cinzel text-xs text-parchment/40 tracking-widest">
                {toDisplayCase(player.characterClass)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* HP gain */}
              <div className="flex items-center gap-2">
                <span className="font-cinzel text-xs text-parchment/50 uppercase tracking-wide">
                  HP
                </span>
                <span className="font-crimson text-base text-success">
                  +{levelData.hpGain}
                </span>
              </div>

              {/* Proficiency bonus (if changed at this level) */}
              {getProficiencyBonus(levelData.level) !== getProficiencyBonus(levelData.level - 1) && (
                <div className="flex items-center gap-2">
                  <span className="font-cinzel text-xs text-parchment/50 uppercase tracking-wide">
                    Prof
                  </span>
                  <span className="font-crimson text-base text-gold">
                    +{getProficiencyBonus(levelData.level)}
                  </span>
                </div>
              )}
            </div>

            {/* New features */}
            {levelData.newFeatures.length > 0 && (
              <div>
                <span className="font-cinzel text-xs text-gold/60 tracking-widest uppercase">
                  New Features
                </span>
                <div className="mt-1 space-y-1">
                  {levelData.newFeatures.map((f) => (
                    <div
                      key={f.name}
                      className="font-crimson text-base text-parchment/70"
                    >
                      <span className="text-parchment/90">{toDisplayCase(f.name)}</span>
                      {f.description && (
                        <span className="text-parchment/40 ml-1">
                          — {f.description.split("\n")[0].slice(0, 120)}
                          {f.description.length > 120 ? "…" : ""}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* New subclass features */}
            {levelData.newSubclassFeatures.length > 0 && (
              <div>
                <span className="font-cinzel text-xs text-gold/60 tracking-widest uppercase">
                  {toDisplayCase(player.subclass ?? "")} Features
                </span>
                <div className="mt-1 space-y-1">
                  {levelData.newSubclassFeatures.map((f) => (
                    <div
                      key={f.name}
                      className="font-crimson text-base text-parchment/70"
                    >
                      <span className="text-parchment/90">{toDisplayCase(f.name)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Markers for steps to come */}
            <div className="flex flex-wrap gap-2 pt-1">
              {levelData.isASILevel && (
                <span className="font-cinzel text-[10px] tracking-wider uppercase px-2 py-0.5 rounded border border-blue-500/30 bg-blue-900/30 text-blue-300">
                  Ability Score Improvement
                </span>
              )}
              {levelData.requiresSubclass && (
                <span className="font-cinzel text-[10px] tracking-wider uppercase px-2 py-0.5 rounded border border-purple-500/30 bg-purple-900/30 text-purple-300">
                  Choose Subclass
                </span>
              )}
              {levelData.featureChoices.length > 0 && (
                <span className="font-cinzel text-[10px] tracking-wider uppercase px-2 py-0.5 rounded border border-yellow-500/30 bg-yellow-900/30 text-yellow-300">
                  Feature Choice
                </span>
              )}
              {(levelData.newCantripSlots > 0 || levelData.newSpellSlots > 0) && (
                <span className="font-cinzel text-[10px] tracking-wider uppercase px-2 py-0.5 rounded border border-cyan-500/30 bg-cyan-900/30 text-cyan-300">
                  New Spells
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Proficiency bonus summary */}
      {profChanged && (
        <div className="text-center font-crimson text-base text-parchment/60">
          Proficiency bonus increases to{" "}
          <span className="text-gold font-semibold">+{newProfBonus}</span>
        </div>
      )}
    </div>
  );
}
