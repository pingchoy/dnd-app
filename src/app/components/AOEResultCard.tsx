"use client";

import { memo } from "react";
import type { AOEResultData } from "../lib/gameTypes";

interface Props {
  result: AOEResultData;
  isHistorical: boolean;
  /** When true, uses dark compact styling for the combat chat panel. */
  compact?: boolean;
}

/** Hover tooltip showing the damage dice formula and individual rolls. */
function DamageTooltip({ result }: { result: AOEResultData }) {
  const rolls = result.damageRolls;
  if (!rolls || rolls.length === 0) return null;
  return (
    <span className="pointer-events-none absolute bottom-full right-0 mb-1.5 hidden group-hover/dmg:block z-50 whitespace-nowrap bg-dungeon border border-red-900/60 rounded px-2.5 py-1.5 shadow-lg">
      <span className="flex items-center gap-2 font-crimson text-xs text-parchment/70 leading-relaxed">
        <span className="text-parchment/50">{result.damageRoll}</span>
        <span className="text-parchment/30">→</span>
        <span className="text-parchment/40">({rolls.join("+")})</span>
        <span className="font-bold text-parchment/80">= {result.totalRolled}</span>
        <span className="text-parchment/40 italic">{result.damageType}</span>
      </span>
    </span>
  );
}

/** AOE result card showing spell name, total damage, and per-target breakdown. */
function AOEResultCard({ result, isHistorical, compact = false }: Props) {
  const isDamaging = result.totalRolled > 0;

  if (compact) {
    // Compact dark variant for CompactChatPanel (combat view)
    return (
      <div className={`rounded border border-red-900/40 bg-dungeon-mid/80 ${isHistorical ? "" : "animate-fade-in"}`}>
        <div className="px-3 py-1.5 border-b border-red-900/30 flex items-center justify-between">
          <span className="font-cinzel text-[11px] tracking-widest text-red-400 uppercase">
            {result.checkType}
          </span>
          {isDamaging && (
            <span className="relative group/dmg cursor-default font-cinzel text-sm text-parchment/90">
              {result.totalRolled} {result.damageType}
              <DamageTooltip result={result} />
            </span>
          )}
        </div>
        <div className="px-3 py-1.5 space-y-0.5">
          <div className="font-cinzel text-[10px] text-parchment/40 tracking-wider uppercase mb-1">
            DC {result.spellDC}{isDamaging ? ` \u00B7 ${result.damageRoll} damage` : ""}
          </div>
          {result.targets.map((t) => (
            <div key={t.npcId} className="flex items-center justify-between text-sm font-crimson">
              <span className="text-parchment/80">{t.npcName}</span>
              <span className="flex items-center gap-2">
                <span className={`text-[10px] font-cinzel tracking-wider uppercase ${t.saved ? "text-green-400" : "text-red-400"}`}>
                  {t.saved ? "Saved" : "Failed Save"}
                </span>
              </span>
            </div>
          ))}
          {result.targets.length === 0 && (
            <div className="text-parchment/40 text-sm font-crimson italic">No targets in area</div>
          )}
        </div>
      </div>
    );
  }

  // Chat-card variant — matches DiceRoll dark styling
  return (
    <div className="my-3 mx-auto max-w-xs animate-fade-in">
      <div className="bg-dungeon-mid/80 border border-red-900/40 rounded-md">
        {/* Header: spell name + total damage */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-red-900/30">
          <span className="font-cinzel text-[11px] tracking-widest text-red-400 uppercase">
            {result.checkType}
          </span>
          {isDamaging && (
            <span className="relative group/dmg cursor-default font-cinzel text-[11px] text-white bg-red-800/80 border border-red-600/40 rounded px-1.5 py-0.5">
              {result.totalRolled} {result.damageType}
              <DamageTooltip result={result} />
            </span>
          )}
        </div>
        {/* DC + damage formula */}
        <div className="px-3 pt-2 pb-1">
          <div className="font-cinzel text-[10px] text-parchment/40 tracking-wider uppercase">
            DC {result.spellDC}{isDamaging ? ` \u00B7 ${result.damageRoll} damage` : ""}
          </div>
        </div>
        {/* Per-target breakdown */}
        <div className="px-3 pb-2 space-y-1">
          {result.targets.map((t) => (
            <div key={t.npcId} className="flex items-center justify-between text-sm font-crimson">
              <span className="text-parchment/80">{t.npcName}</span>
              <span className="flex items-center gap-2">
                <span className={`text-[10px] font-cinzel tracking-wider uppercase ${t.saved ? "text-green-400" : "text-red-400"}`}>
                  {t.saved ? "Saved" : "Failed Save"}
                </span>
              </span>
            </div>
          ))}
          {result.targets.length === 0 && (
            <div className="text-parchment/40 text-sm font-crimson italic">No targets in area</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(AOEResultCard);
