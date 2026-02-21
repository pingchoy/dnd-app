"use client";

import type { NPC } from "../lib/gameTypes";

interface TurnOrderBarProps {
  turnOrder: string[];
  currentTurnIndex: number;
  activeNPCs: NPC[];
}

/**
 * Displays the combat turn order as a horizontal chip bar.
 * Active turn gets a gold highlight. Positioned top-left of the combat area.
 */
export default function TurnOrderBar({ turnOrder, currentTurnIndex, activeNPCs }: TurnOrderBarProps) {
  if (turnOrder.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 bg-dungeon-mid/80 backdrop-blur-sm border-b border-gold/20">
      <span className="font-cinzel text-[10px] text-parchment/40 tracking-widest uppercase mr-1">
        Turn
      </span>
      {turnOrder.map((id, index) => {
        const isActive = index === currentTurnIndex;
        const isDead = id !== "player" && !activeNPCs.some(n => n.id === id && n.currentHp > 0);
        const name = id === "player"
          ? "Player"
          : activeNPCs.find(n => n.id === id)?.name ?? id;

        return (
          <div
            key={id}
            className={`
              px-2.5 py-1 rounded font-cinzel text-xs tracking-wide transition-all duration-300
              ${isDead
                ? "bg-dungeon/50 border border-parchment/10 text-parchment/20 line-through"
                : isActive
                  ? "bg-gold/20 border border-gold text-gold shadow-[0_0_8px_rgba(212,175,55,0.3)]"
                  : "bg-dungeon-mid/50 border border-parchment/20 text-parchment/50"
              }
            `}
          >
            {name}
          </div>
        );
      })}
    </div>
  );
}
