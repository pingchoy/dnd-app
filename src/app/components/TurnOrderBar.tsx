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
        const npc = id !== "player" ? activeNPCs.find(n => n.id === id) : null;
        const isDead = npc != null && npc.currentHp <= 0;
        const name = id === "player" ? "Player" : npc?.name ?? id;
        const disposition = npc?.disposition ?? null;

        // Color by disposition: green for friendly, red for hostile, gold for player
        const dispositionStyles = isDead
          ? "bg-dungeon/50 border border-parchment/10 text-parchment/20 line-through"
          : isActive
            ? disposition === "friendly"
              ? "bg-emerald-900/40 border border-emerald-400 text-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.3)]"
              : disposition === "hostile"
                ? "bg-red-900/40 border border-red-400 text-red-300 shadow-[0_0_8px_rgba(248,113,113,0.3)]"
                : "bg-gold/20 border border-gold text-gold shadow-[0_0_8px_rgba(212,175,55,0.3)]"
            : disposition === "friendly"
              ? "bg-emerald-900/20 border border-emerald-600/30 text-emerald-400/60"
              : disposition === "hostile"
                ? "bg-red-900/20 border border-red-600/30 text-red-400/60"
                : "bg-dungeon-mid/50 border border-parchment/20 text-parchment/50";

        return (
          <div
            key={id}
            className={`
              px-2.5 py-1 rounded font-cinzel text-xs tracking-wide transition-all duration-300
              ${dispositionStyles}
            `}
          >
            {name}
          </div>
        );
      })}
    </div>
  );
}
