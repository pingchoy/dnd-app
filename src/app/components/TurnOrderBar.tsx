"use client";

import { useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import type { NPC } from "../lib/gameTypes";

interface TurnOrderBarProps {
  turnOrder: string[];
  currentTurnIndex: number;
  activeNPCs: NPC[];
}

interface TooltipState {
  name: string;
  x: number;
  y: number;
}

/**
 * Displays the combat turn order as a horizontal chip bar.
 * Active turn gets a gold highlight. Positioned top-left of the combat area.
 *
 * Tooltip is portalled to document.body so it escapes the overflow-x-auto
 * scrollable wrapper (overflow in one axis forces the other to auto per CSS spec,
 * and backdrop-filter creates a new containing block that traps fixed children).
 */
export default function TurnOrderBar({ turnOrder, currentTurnIndex, activeNPCs }: TurnOrderBarProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const showTooltip = useCallback((name: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ name, x: rect.left + rect.width / 2, y: rect.bottom + 6 });
  }, []);

  const hideTooltip = useCallback(() => setTooltip(null), []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (scrollRef.current) {
      e.preventDefault();
      scrollRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  if (turnOrder.length === 0) return null;

  return (
    <div ref={scrollRef} onWheel={onWheel} className="flex items-center gap-1.5 px-3 py-2 bg-dungeon-mid/80 backdrop-blur-sm border-b border-gold/20 overflow-x-auto scrollbar-thin scrollbar-thumb-gold/20">
      <span className="font-cinzel text-[10px] text-parchment/40 tracking-widest uppercase mr-1 flex-shrink-0">
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
            onMouseEnter={name.length > 8 ? (e) => showTooltip(name, e) : undefined}
            onMouseLeave={name.length > 8 ? hideTooltip : undefined}
            className={`
              px-2.5 py-1 rounded font-cinzel text-xs tracking-wide transition-all duration-300
              max-w-[80px] truncate flex-shrink-0 cursor-default hover:brightness-125
              ${dispositionStyles}
            `}
          >
            {name}
          </div>
        );
      })}

      {/* Portal tooltip to document.body to escape overflow + backdrop-filter clipping */}
      {tooltip && createPortal(
        <div
          className="fixed px-2 py-1 rounded bg-dungeon border border-gold/30 text-parchment font-cinzel text-xs whitespace-nowrap pointer-events-none z-50 -translate-x-1/2"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.name}
        </div>,
        document.body,
      )}
    </div>
  );
}
