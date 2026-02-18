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

  useEffect(() => {
    if (isHistorical) return;
    setSettled(false);
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

  const isCrit   = result.dieResult === 20;
  const isFumble = result.dieResult === 1;

  const dieColour = isCrit
    ? "text-yellow-300 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]"
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

  if (isHistorical) {
    // Compact inline card shown in chat history
    return (
      <div className="my-3 mx-auto max-w-xs animate-fade-in">
        <div className="card-parchment border border-gold-dark/30 rounded-md overflow-hidden">
          <div className="flex items-center gap-3 px-3 py-2">
            {/* Mini die */}
            <div className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center">
              <div
                className="absolute inset-0 bg-dungeon-mid border border-gold/30"
                style={{ clipPath: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)" }}
              />
              <span className={`relative font-cinzel text-lg font-bold ${dieColour}`}>
                {result.dieResult}
              </span>
            </div>
            {/* Summary */}
            <div className="flex-1 min-w-0">
              <div className="font-cinzel text-[10px] tracking-widest text-gold-dark/80 uppercase">
                {result.checkType}
              </div>
              <div className="font-crimson text-ink/70 text-xs">
                {result.dieResult} + {result.totalModifier} = <strong>{result.total}</strong>
                {result.dcOrAc !== "N/A" && <span className="text-ink/40 ml-1">vs {result.dcOrAc}</span>}
              </div>
              {result.components && (
                <div className="font-crimson text-[10px] text-ink/40 italic truncate">
                  {result.components}
                </div>
              )}
            </div>
            <span className={`font-cinzel text-xs font-bold flex-shrink-0 ${resultColour}`}>
              {isCrit ? "CRIT" : isFumble ? "FUMBLE" : result.success ? "HIT" : "MISS"}
            </span>
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

        {/* Die face */}
        <div className="flex flex-col items-center py-6 gap-3">
          <div className="relative w-24 h-24 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-dungeon-light border-2 border-gold/40"
              style={{ clipPath: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)" }}
            />
            <span className={`relative font-cinzel text-4xl font-bold transition-all duration-100 ${dieColour} ${!settled ? "blur-[1px]" : ""}`}>
              {displayValue}
            </span>
          </div>

          {/* Roll breakdown */}
          {settled && (
            <div className="text-center space-y-1">
              <div className="flex items-center justify-center gap-3 font-crimson text-sm text-ink/80">
                <span><span className="text-ink/50">d20</span> {result.dieResult}</span>
                <span className="text-ink/30">+</span>
                <span><span className="text-ink/50">modifier</span> {result.totalModifier}</span>
                <span className="text-ink/30">=</span>
                <strong className="text-base">{result.total}</strong>
                {result.dcOrAc !== "N/A" && (
                  <span className="text-ink/40">vs {result.dcOrAc}</span>
                )}
              </div>
              {result.components && (
                <div className="font-crimson italic text-ink/50 text-xs px-4">
                  {result.components}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Result banner */}
        {settled && (
          <div className={`text-center py-2 font-cinzel text-sm tracking-widest border-t border-gold-dark/20 ${resultColour}`}>
            {resultLabel}
          </div>
        )}

        {/* Notes */}
        {settled && result.notes && (
          <div className="px-4 pb-3 text-center font-crimson italic text-ink/60 text-sm">
            {result.notes}
          </div>
        )}

        {/* Continue button */}
        {settled && onContinue && (
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
