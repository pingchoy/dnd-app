"use client";

import { useEffect, useState } from "react";
import { ParsedRollResult } from "../agents/rulesAgent";

interface DiceRollProps {
  result: ParsedRollResult;
  /** When true: no animation, no Continue button — shown as a chat history card. */
  isHistorical?: boolean;
  onContinue?: () => void;
  isNarrating?: boolean;
}

export default function DiceRoll({
  result,
  isHistorical = false,
  onContinue,
  isNarrating = false,
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

  // d20 animation
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

  // Damage animation — triggers after d20 settles on a hit with damage
  useEffect(() => {
    if (isHistorical || !settled || !hasDamage) return;
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
  }, [settled, hasDamage, isHistorical, result.damage]);

  const isCrit   = result.dieResult === 20;
  const isFumble = result.dieResult === 1;

  const dieColour = isCrit
    ? "text-amber-400 drop-shadow-[0_0_6px_rgba(201,168,76,0.6)]"
    : isFumble
    ? "text-red-400"
    : settled
    ? result.success ? "text-green-400" : "text-red-400"
    : "text-parchment/60";

  const resultLabel = isCrit ? "✦ Critical Hit!"
    : isFumble       ? "✦ Critical Fumble!"
    : result.success ? "✦ Success"
    :                  "✦ Failure";

  const resultColour = (isCrit || result.success) ? "text-green-400" : "text-red-400";

  // Continue enabled when all phases are done
  const allPhasesComplete = settled && (damagePhase === "settled" || damagePhase === "hidden");

  if (isHistorical) {
    // Compact inline card shown in chat history
    return (
      <div className="my-3 mx-auto max-w-xs animate-fade-in">
        <div className="card-parchment border border-gold-dark/30 rounded-md overflow-hidden">
          <div className="flex items-center gap-3 px-3 py-2">
            {/* Mini die — shows d20 roll */}
            <div className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center">
              <div
                className="absolute inset-0 bg-dungeon-mid border border-gold/30"
                style={{ clipPath: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)" }}
              />
              <span className={`relative font-cinzel text-lg font-bold tabular-nums ${dieColour}`}>
                {result.dieResult}
              </span>
            </div>
            {/* Summary */}
            <div className="flex-1 min-w-0">
              <div className="font-cinzel text-[11px] tracking-widest text-gold-dark/80 uppercase">
                {result.checkType}
              </div>
              <div className="font-crimson text-ink/70 text-sm">
                {result.dieResult} {result.totalModifier} = <strong className="text-base">{result.total}</strong>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {hasDamage && (
                <span className="font-cinzel text-[11px] text-red-400 bg-red-900/30 border border-red-700/30 rounded px-1.5 py-0.5">
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
      <div className="card-parchment border border-gold-dark/50 rounded-lg overflow-hidden shadow-parchment">
        {/* Header */}
        <div className="bg-dungeon-mid px-4 py-2 border-b border-gold-dark/30 text-center">
          <span className="font-cinzel text-gold text-xs tracking-widest uppercase">
            {result.checkType}
          </span>
        </div>

        {/* Die + total */}
        <div className="flex flex-col items-center py-6 gap-4">
          {/* Row: d20 die → + mod → = total */}
          <div className="flex items-center gap-3">
            {/* d20 die */}
            <div className="relative w-20 h-20 flex items-center justify-center">
              <div
                className="absolute inset-0 bg-dungeon-light border-2 border-gold/40"
                style={{ clipPath: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)" }}
              />
              <span className={`relative font-cinzel text-3xl font-bold tabular-nums ${dieColour}`}>
                {displayValue}
              </span>
            </div>

            {settled && (
              <>
                <div className="flex flex-col items-center">
                  <span className="font-cinzel text-2xl font-bold text-ink/70 tabular-nums">
                    {result.totalModifier}
                  </span>
                  <span className="font-crimson text-ink/50 text-[10px] uppercase tracking-wide">mod</span>
                </div>
                <span className="font-crimson text-ink/30 text-xl">=</span>
                <span className={`font-cinzel text-5xl font-bold tabular-nums leading-none ${dieColour}`}>
                  {result.total}
                </span>
              </>
            )}
          </div>

          {/* Components */}
          {settled && result.components && (
            <div className="font-crimson italic text-ink/50 text-xs px-4 text-center">
              {result.components}
            </div>
          )}
        </div>

        {/* Result banner */}
        {settled && (
          <div className={`text-center py-2 font-cinzel text-sm tracking-widest border-t border-gold-dark/20 ${resultColour}`}>
            {resultLabel}
          </div>
        )}

        {/* Damage section */}
        {settled && hasDamage && damagePhase !== "hidden" && (
          <div className="border-t border-gold-dark/20 px-4 py-4">
            <div className="flex flex-col items-center gap-3">
              {/* Animated damage total */}
              <div className="flex items-baseline gap-2">
                <span className="font-cinzel text-xs tracking-widest text-ink/50 uppercase">Damage</span>
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
                    <div key={i} className="flex items-center justify-between font-crimson text-sm text-ink/70">
                      <span className="font-cinzel text-xs text-ink/50 uppercase tracking-wide">{b.label}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-ink/40 text-xs">
                          [{b.rolls.join(", ")}]{b.flatBonus ? (b.flatBonus > 0 ? `+${b.flatBonus}` : b.flatBonus) : ""}
                        </span>
                        <span className="font-bold text-ink/80">= {b.subtotal}</span>
                        {b.damageType && (
                          <span className="text-[11px] text-ink/40 italic">{b.damageType}</span>
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
          <div className="px-4 pb-3 text-center font-crimson italic text-ink/60 text-sm">
            {result.notes}
          </div>
        )}

        {/* Continue button */}
        {allPhasesComplete && onContinue && (
          <div className="px-4 pb-4 flex justify-center">
            <button
              onClick={onContinue}
              disabled={isNarrating}
              className="font-cinzel text-xs tracking-widest uppercase px-6 py-2 border border-gold-dark/60 text-gold-dark rounded hover:bg-gold/10 hover:text-gold transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isNarrating ? "The tale unfolds…" : "Continue Adventure →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
