"use client";

import type { CharacterStats } from "../lib/gameTypes";
import { formatModifier, getModifier } from "../lib/gameTypes";
import type { SRDRace } from "../lib/characterStore";
import { POINT_BUY_COSTS, POINT_BUY_BUDGET, BASE_STAT_MIN, BASE_STAT_MAX } from "../hooks/useCharacterCreation";

const STAT_LABELS: Array<{ key: keyof CharacterStats; label: string; abbr: string }> = [
  { key: "strength",     label: "Strength",     abbr: "STR" },
  { key: "dexterity",    label: "Dexterity",     abbr: "DEX" },
  { key: "constitution", label: "Constitution",  abbr: "CON" },
  { key: "intelligence", label: "Intelligence",  abbr: "INT" },
  { key: "wisdom",       label: "Wisdom",        abbr: "WIS" },
  { key: "charisma",     label: "Charisma",      abbr: "CHA" },
];

interface Props {
  baseStats: CharacterStats;
  finalStats: CharacterStats;
  pointsRemaining: number;
  selectedRace: SRDRace | null;
  onAdjust: (stat: keyof CharacterStats, delta: 1 | -1) => void;
}


export default function StepPointBuy({
  baseStats,
  finalStats,
  pointsRemaining,
  selectedRace,
  onAdjust,
}: Props) {
  const pctUsed = ((POINT_BUY_BUDGET - pointsRemaining) / POINT_BUY_BUDGET) * 100;
  const pointsUsed = POINT_BUY_BUDGET - pointsRemaining;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="font-cinzel text-gold text-xl tracking-widest uppercase">Assign Ability Scores</h2>
        <p className="font-crimson text-parchment/50 italic text-base mt-1">
          Distribute {POINT_BUY_BUDGET} points across your six abilities. Higher scores cost more.
        </p>
      </div>

      {/* Points bar */}
      <div className="bg-dungeon-mid border border-gold/20 rounded p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-cinzel text-xs text-parchment/60 tracking-widest uppercase">Points</span>
          <span className={`font-cinzel text-base font-bold ${pointsRemaining === 0 ? "text-gold" : "text-parchment"}`}>
            {pointsUsed} / {POINT_BUY_BUDGET}
          </span>
        </div>
        <div className="h-2 bg-dungeon rounded-full overflow-hidden">
          <div
            className="h-full bg-gold transition-all duration-200"
            style={{ width: `${pctUsed}%` }}
          />
        </div>
        <div className="mt-1.5 font-crimson text-sm text-parchment/40 text-right">
          {pointsRemaining} remaining
        </div>
      </div>

      {/* Stat rows */}
      <div className="space-y-2">
        {STAT_LABELS.map(({ key, label, abbr }) => {
          const base = baseStats[key];
          const final = finalStats[key];
          const mod = getModifier(final);
          const racialBonus = (selectedRace?.abilityBonuses?.[key] ?? 0);
          const cost = POINT_BUY_COSTS[base] ?? 0;
          const nextCost = base < BASE_STAT_MAX
            ? (POINT_BUY_COSTS[base + 1] ?? 99) - cost
            : 0;
          const canIncrease = base < BASE_STAT_MAX && pointsRemaining >= nextCost;
          const canDecrease = base > BASE_STAT_MIN;

          return (
            <div
              key={key}
              className="flex items-center gap-3 bg-dungeon-mid border border-gold/10 rounded px-3 py-2"
            >
              {/* Ability name */}
              <div className="w-32 flex-shrink-0">
                <span className="font-cinzel text-sm text-parchment/80 tracking-wide">{label}</span>
                <div className="font-crimson text-xs text-parchment/30">{abbr}</div>
              </div>

              {/* Stepper */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onAdjust(key, -1)}
                  disabled={!canDecrease}
                  className="w-8 h-8 rounded border border-gold/30 font-cinzel text-gold text-sm
                             flex items-center justify-center
                             hover:border-gold hover:bg-dungeon-light
                             disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  −
                </button>
                <span className="font-cinzel text-parchment text-lg w-6 text-center">{base}</span>
                <button
                  onClick={() => onAdjust(key, 1)}
                  disabled={!canIncrease}
                  className="w-8 h-8 rounded border border-gold/30 font-cinzel text-gold text-sm
                             flex items-center justify-center
                             hover:border-gold hover:bg-dungeon-light
                             disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  +
                </button>
              </div>

              {/* Next-increase cost hint */}
              <span className={`font-crimson text-sm w-10 text-center ${
                base >= BASE_STAT_MAX ? "text-parchment/20" :
                nextCost >= 2 ? "text-amber-400/80" : "text-parchment/40"
              }`}>
                {base >= BASE_STAT_MAX ? "max" : `${nextCost}pt`}
              </span>

              {/* Racial ASI */}
              {racialBonus > 0 && (
                <span className="font-cinzel text-sm text-gold/70">+{racialBonus}</span>
              )}

              {/* Final score + modifier */}
              <div className="ml-auto flex items-center gap-2">
                <span className="font-cinzel text-parchment text-base font-bold">{final}</span>
                <span className={`font-cinzel text-sm ${mod >= 0 ? "text-success" : "text-red-400"}`}>
                  ({formatModifier(mod)})
                </span>
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
