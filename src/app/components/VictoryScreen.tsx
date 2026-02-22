"use client";

import React, { useEffect, useRef, useState } from "react";
import type { VictoryData, PlayerState, CombatStats } from "../lib/gameTypes";
import { toDisplayCase } from "../lib/gameTypes";

interface Props {
  victoryData: VictoryData;
  player: PlayerState;
  onDismiss: () => void;
}

/**
 * Full-screen victory modal displayed when all hostile NPCs are defeated.
 * Shows XP earned (with count-up animation), per-player combat stats,
 * loot items, and a DM aftermath narrative.
 */
function VictoryScreen({ victoryData, player, onDismiss }: Props) {
  const [displayXP, setDisplayXP] = useState(0);
  const [sectionsRevealed, setSectionsRevealed] = useState(0);
  const xpRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  // XP count-up animation via requestAnimationFrame
  useEffect(() => {
    const target = victoryData.totalXP;
    if (target <= 0) {
      setDisplayXP(0);
      return;
    }
    const duration = 1500; // ms
    const start = performance.now();
    xpRef.current = 0;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);
      if (current !== xpRef.current) {
        xpRef.current = current;
        setDisplayXP(current);
      }
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [victoryData.totalXP]);

  // Stagger section reveals
  useEffect(() => {
    const totalSections = 5;
    let count = 0;
    const interval = setInterval(() => {
      count++;
      setSectionsRevealed(count);
      if (count >= totalSections) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const stats = victoryData.combatStats[Object.keys(victoryData.combatStats)[0]] as CombatStats | undefined;
  const hitRate = stats && stats.attacksMade > 0
    ? Math.round((stats.attacksHit / stats.attacksMade) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        className="w-full max-w-2xl max-h-[90vh] mx-4 flex flex-col bg-dungeon border border-gold/30 rounded-lg shadow-2xl overflow-hidden animate-victory-reveal"
      >
        {/* ── Header ── */}
        <div className="flex-shrink-0 bg-dungeon-light border-b border-gold/20 px-6 py-5 text-center relative overflow-hidden">
          {/* Decorative glow behind text */}
          <div className="absolute inset-0 bg-gradient-radial from-gold/8 via-transparent to-transparent" />
          <div className="relative">
            <p className="font-cinzel text-gold text-2xl tracking-[0.2em] uppercase">
              Victory
            </p>
            <div className="mt-1 flex items-center justify-center gap-3">
              <span className="h-px w-12 bg-gold/30" />
              <span className="text-gold/50 text-xs">&#x2726;</span>
              <span className="h-px w-12 bg-gold/30" />
            </div>
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 scroll-pane">

          {/* Total XP */}
          <div
            className="text-center transition-all duration-500"
            style={{
              opacity: sectionsRevealed >= 1 ? 1 : 0,
              transform: sectionsRevealed >= 1 ? "translateY(0)" : "translateY(12px)",
            }}
          >
            <p className="font-cinzel text-parchment/50 text-xs tracking-[0.15em] uppercase">
              Experience Earned
            </p>
            <p className="font-cinzel text-gold-bright text-4xl mt-1 tabular-nums">
              {displayXP.toLocaleString()} <span className="text-gold/60 text-lg">XP</span>
            </p>
          </div>

          {/* Defeated NPCs */}
          {victoryData.defeatedNPCs.length > 0 && (
            <div
              className="text-center transition-all duration-500"
              style={{
                opacity: sectionsRevealed >= 1 ? 1 : 0,
                transform: sectionsRevealed >= 1 ? "translateY(0)" : "translateY(12px)",
              }}
            >
              <p className="font-crimson text-parchment/40 text-sm">
                Defeated: {victoryData.defeatedNPCs.map(n => toDisplayCase(n)).join(", ")}
              </p>
              <p className="font-crimson text-parchment/30 text-sm mt-0.5">
                {victoryData.rounds} {victoryData.rounds === 1 ? "round" : "rounds"} of combat
              </p>
            </div>
          )}

          {/* ── Combat Stats Card ── */}
          {stats && (
            <div
              className="bg-dungeon-light/50 border border-gold/15 rounded-lg p-4 transition-all duration-500"
              style={{
                opacity: sectionsRevealed >= 2 ? 1 : 0,
                transform: sectionsRevealed >= 2 ? "translateY(0)" : "translateY(12px)",
              }}
            >
              <p className="font-cinzel text-gold/70 text-xs tracking-[0.15em] uppercase mb-3">
                Combat Performance
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCell label="Damage Dealt" value={stats.damageDealt} />
                <StatCell label="Damage Taken" value={stats.damageTaken} />
                <StatCell
                  label="Accuracy"
                  value={`${stats.attacksHit}/${stats.attacksMade}`}
                  sub={stats.attacksMade > 0 ? `${hitRate}%` : undefined}
                />
                <StatCell label="Critical Hits" value={stats.criticalHits} highlight={stats.criticalHits > 0} />
                <StatCell label="Spells Cast" value={stats.spellsCast} />
                <StatCell label="Kills" value={stats.killCount} />
              </div>

              {/* Abilities used */}
              {stats.abilitiesUsed.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gold/10">
                  <p className="font-crimson text-parchment/40 text-sm mb-1.5">Abilities Used</p>
                  <div className="flex flex-wrap gap-1.5">
                    {stats.abilitiesUsed.map((name) => (
                      <span
                        key={name}
                        className="font-crimson text-parchment/60 text-sm bg-dungeon-mid/80 border border-gold/10 rounded px-2 py-0.5"
                      >
                        {toDisplayCase(name)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Loot Section ── */}
          {(victoryData.loot.length > 0 || victoryData.goldAwarded > 0) && (
            <div
              className="bg-dungeon-light/50 border border-gold/15 rounded-lg p-4 transition-all duration-500"
              style={{
                opacity: sectionsRevealed >= 3 ? 1 : 0,
                transform: sectionsRevealed >= 3 ? "translateY(0)" : "translateY(12px)",
              }}
            >
              <p className="font-cinzel text-gold/70 text-xs tracking-[0.15em] uppercase mb-3">
                Spoils
              </p>

              {victoryData.goldAwarded > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-gold-bright text-lg">&#x2726;</span>
                  <span className="font-crimson text-gold-light text-sm font-medium">
                    {victoryData.goldAwarded} gold
                  </span>
                </div>
              )}

              {victoryData.loot.length > 0 && (
                <div className="space-y-2">
                  {victoryData.loot.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-gold/40 text-sm mt-0.5">&#x25C6;</span>
                      <div>
                        <span className="font-crimson text-parchment text-sm font-medium">
                          {toDisplayCase(item.name)}
                        </span>
                        {item.description && (
                          <p className="font-crimson text-parchment/40 text-sm">
                            {item.description}
                          </p>
                        )}
                        {item.weapon && (
                          <p className="font-crimson text-gold/50 text-sm">
                            {item.weapon.dice} {item.weapon.damageType ?? ""} {item.weapon.bonus > 0 ? `(+${item.weapon.bonus})` : ""}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Aftermath Narrative ── */}
          {victoryData.narrative && (
            <div
              className="transition-all duration-500"
              style={{
                opacity: sectionsRevealed >= 4 ? 1 : 0,
                transform: sectionsRevealed >= 4 ? "translateY(0)" : "translateY(12px)",
              }}
            >
              <p className="font-crimson text-parchment-dm/80 text-sm italic leading-relaxed text-center px-4">
                {victoryData.narrative}
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          className="flex-shrink-0 border-t border-gold/20 px-6 py-4 flex justify-center transition-all duration-500"
          style={{
            opacity: sectionsRevealed >= 5 ? 1 : 0,
            transform: sectionsRevealed >= 5 ? "translateY(0)" : "translateY(8px)",
          }}
        >
          <button
            onClick={onDismiss}
            className="font-cinzel text-sm tracking-[0.15em] uppercase text-gold border border-gold/40 rounded px-8 py-2.5 hover:bg-gold/10 hover:border-gold/60 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

/** Single stat cell for the combat performance grid. */
interface StatCellProps {
  label: string;
  value: number | string;
  sub?: string;
  highlight?: boolean;
}

function StatCell({ label, value, sub, highlight }: StatCellProps) {
  return (
    <div className="text-center">
      <p className={`font-cinzel text-lg tabular-nums ${highlight ? "text-gold-bright" : "text-parchment"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && (
        <p className="font-crimson text-gold/50 text-sm -mt-0.5">{sub}</p>
      )}
      <p className="font-crimson text-parchment/40 text-sm">{label}</p>
    </div>
  );
}

export default React.memo(VictoryScreen);
