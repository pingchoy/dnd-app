"use client";

import { useEffect, useState, memo } from "react";
import { ParsedRollResult } from "../agents/rulesAgent";

interface DiceRollProps {
  result: ParsedRollResult;
  /** When true: no animation — shown as a compact chat history card. */
  isHistorical?: boolean;
}

function DiceRoll({
  result,
  isHistorical = false,
}: DiceRollProps) {
  const [displayValue, setDisplayValue] = useState(isHistorical ? result.dieResult : 1);
  const [settled, setSettled] = useState(isHistorical);

  // Damage phase: hidden (no damage), rolling (animating), settled (final)
  const hasDamage = !!(result.damage && result.damage.breakdown.length > 0);
  const [damagePhase, setDamagePhase] = useState<"hidden" | "rolling" | "settled">(
    isHistorical ? (hasDamage ? "settled" : "hidden") : "hidden",
  );
  const [displayDamage, setDisplayDamage] = useState(
    isHistorical && hasDamage ? result.damage!.totalDamage : 0,
  );

  // Phase 1: d20 tumble animation — rapidly cycle random values for ~1.3s,
  // then snap to the actual roll result and mark as settled.
  useEffect(() => {
    if (isHistorical) return;
    setSettled(false);
    setDamagePhase("hidden");
    let ticks = 0;
    const interval = setInterval(() => {
      ticks++;
      if (ticks >= 18) {
        clearInterval(interval);
        setDisplayValue(result.dieResult);
        setSettled(true);
      } else {
        setDisplayValue(Math.floor(Math.random() * 20) + 1);
      }
    }, 70);
    return () => clearInterval(interval);
  }, [result.dieResult, isHistorical]);

  // Phase 2: Damage tumble animation — waits 600ms after d20 settles,
  // then cycles random damage values for ~0.8s before revealing the real total.
  // Only runs when the d20 phase is done and the attack hit with damage.
  useEffect(() => {
    if (isHistorical || !settled || !hasDamage || damagePhase !== "hidden") return;
    const pauseTimer = setTimeout(() => {
      setDamagePhase("rolling");
      let ticks = 0;
      const maxDmg = result.damage!.totalDamage;
      const interval = setInterval(() => {
        ticks++;
        if (ticks >= 12) {
          clearInterval(interval);
          setDisplayDamage(maxDmg);
          setDamagePhase("settled");
        } else {
          setDisplayDamage(Math.floor(Math.random() * Math.max(maxDmg * 2, 10)) + 1);
        }
      }, 70);
    }, 600);
    return () => clearTimeout(pauseTimer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, hasDamage, isHistorical]);

  const isCrit   = result.dieResult === 20;
  const isFumble = result.dieResult === 1;

  const dieColour = isCrit
    ? "text-amber-400 drop-shadow-[0_0_6px_rgba(201,168,76,0.6)]"
    : isFumble
    ? "text-red-400"
    : settled
    ? result.success ? "text-success" : "text-red-400"
    : "text-parchment/60";

  const resultLabel = isCrit ? "✦ Critical Hit!"
    : isFumble       ? "✦ Critical Fumble!"
    : result.success ? "✦ Success"
    :                  "✦ Failure";

  const resultColour = (isCrit || result.success) ? "text-success" : "text-red-400";

  if (isHistorical) {
    // Compact inline card shown in chat history
    return (
      <div className="my-3 mx-auto max-w-xs animate-fade-in">
        <div className="bg-dungeon-mid/80 border border-red-900/40 rounded-md overflow-hidden">
          <div className="flex items-center gap-3 px-3 py-2">
            {/* Mini die — shows d20 roll */}
            <div className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center">
              <div
                className="absolute inset-0 bg-dungeon-light/60 border border-gold/50 shadow-[0_0_8px_rgba(201,168,76,0.2)]"
                style={{ clipPath: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)" }}
              />
              <span className={`relative font-cinzel text-lg font-bold tabular-nums ${dieColour}`}>
                {result.dieResult}
              </span>
            </div>
            {/* Summary */}
            <div className="flex-1 min-w-0">
              <div className="font-cinzel text-[11px] tracking-widest text-red-400 uppercase">
                {result.checkType}
              </div>
              <div className="font-crimson text-parchment/70 text-sm">
                {result.dieResult} {result.totalModifier} = <strong className="text-parchment/90 text-base">{result.total}</strong>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {hasDamage && (
                <span className="font-cinzel text-[11px] text-white bg-red-800/80 border border-red-600/40 rounded px-1.5 py-0.5">
                  {result.damage!.totalDamage} dmg
                </span>
              )}
              <span className={`font-cinzel text-sm font-bold ${resultColour}`}>
                {isCrit ? "CRIT" : isFumble ? "FUMBLE" : result.success ? "HIT" : "MISS"}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Full interactive card
  return (
    <div className="animate-fade-in my-4 mx-auto max-w-sm">
      <div className="bg-dungeon-mid/80 border border-red-900/40 rounded-lg overflow-hidden shadow-lg">
        {/* Header */}
        <div className="bg-dungeon-mid px-4 py-2 border-b border-red-900/30 text-center">
          <span className="font-cinzel text-red-400 text-xs tracking-widest uppercase">
            {result.checkType}
          </span>
        </div>

        {/* Die + total */}
        <div className="flex flex-col items-center py-4 gap-3">
          {/* Row: d20 die → + mod → = total */}
          <div className="flex items-center gap-2">
            {/* d20 die */}
            <div className="relative w-14 h-14 flex items-center justify-center">
              <div
                className="absolute inset-0 bg-dungeon-light/60 border-2 border-gold/50 shadow-[0_0_10px_rgba(201,168,76,0.25)]"
                style={{ clipPath: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)" }}
              />
              <span className={`relative font-cinzel text-2xl font-bold tabular-nums ${dieColour}`}>
                {displayValue}
              </span>
            </div>

            {settled && (
              <>
                <div className="flex flex-col items-center">
                  <span className="font-cinzel text-lg font-bold text-parchment/70 tabular-nums">
                    {result.totalModifier}
                  </span>
                  <span className="font-crimson text-parchment/40 text-[10px] uppercase tracking-wide">mod</span>
                </div>
                <span className="font-crimson text-parchment/30 text-lg">=</span>
                <span className={`font-cinzel text-3xl font-bold tabular-nums leading-none ${dieColour}`}>
                  {result.total}
                </span>
              </>
            )}
          </div>

          {/* Components */}
          {settled && result.components && (
            <div className="font-crimson italic text-parchment/40 text-xs px-4 text-center">
              {result.components}
            </div>
          )}
        </div>

        {/* Result banner */}
        {settled && (
          <div className={`text-center py-2 font-cinzel text-sm tracking-widest border-t border-red-900/30 ${resultColour}`}>
            {resultLabel}
          </div>
        )}

        {/* Damage section */}
        {settled && hasDamage && damagePhase !== "hidden" && (
          <div className="border-t border-red-900/30 px-4 py-4">
            <div className="flex flex-col items-center gap-3">
              {/* Animated damage total */}
              <div className="flex items-baseline gap-2">
                <span className="font-cinzel text-xs tracking-widest text-parchment/40 uppercase">Damage</span>
                <span className={`font-cinzel text-4xl font-bold tabular-nums ${
                  result.damage!.isCrit ? "text-amber-400 drop-shadow-[0_0_6px_rgba(201,168,76,0.6)]" : "text-red-400"
                }`}>
                  {displayDamage}
                </span>
              </div>
              {/* Breakdown per source */}
              {damagePhase === "settled" && (
                <div className="w-full space-y-1.5 animate-fade-in">
                  {result.damage!.breakdown.map((b, i) => (
                    <div key={i} className="flex items-center justify-between font-crimson text-sm text-parchment/70">
                      <span className="font-cinzel text-xs text-parchment/40 uppercase tracking-wide">{b.label}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-parchment/40 text-xs">
                          [{b.rolls.join(", ")}]{b.flatBonus ? (b.flatBonus > 0 ? `+${b.flatBonus}` : b.flatBonus) : ""}
                        </span>
                        <span className="font-bold text-parchment/80">= {b.subtotal}</span>
                        {b.damageType && (
                          <span className="text-[11px] text-parchment/40 italic">{b.damageType}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notes */}
        {settled && result.notes && (
          <div className="px-4 pb-3 text-center font-crimson italic text-parchment/50 text-sm">
            {result.notes}
          </div>
        )}

      </div>
    </div>
  );
}

export default memo(DiceRoll);
