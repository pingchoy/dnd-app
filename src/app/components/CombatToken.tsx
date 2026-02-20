"use client";

import { useState } from "react";

interface Props {
  id: string;
  label: string;
  fullName: string;
  currentHp: number;
  maxHp: number;
  disposition: "hostile" | "neutral" | "friendly" | "player";
  isDraggable: boolean;
  isDragging: boolean;
}

const DISPOSITION_COLORS: Record<Props["disposition"], { bg: string; border: string; text: string }> = {
  player:   { bg: "bg-amber-600",  border: "border-amber-400", text: "text-amber-100" },
  hostile:  { bg: "bg-red-800",    border: "border-red-500",   text: "text-red-100" },
  friendly: { bg: "bg-emerald-800", border: "border-emerald-500", text: "text-emerald-100" },
  neutral:  { bg: "bg-sky-800",    border: "border-sky-500",   text: "text-sky-100" },
};

/** Color-coded token circle that fills its container. */
export default function CombatToken({
  label,
  fullName,
  currentHp,
  maxHp,
  disposition,
  isDraggable,
  isDragging,
}: Props) {
  const [showTooltip, setShowTooltip] = useState(false);
  const isDead = currentHp <= 0;
  const hpPct = maxHp > 0 ? Math.max(0, currentHp / maxHp) : 0;
  const colors = DISPOSITION_COLORS[disposition];

  const hpColor =
    hpPct > 0.5 ? "bg-emerald-400" : hpPct > 0.25 ? "bg-amber-400" : "bg-red-500";

  const isPlayer = disposition === "player";

  return (
    <div
      className={`relative w-full h-full select-none ${
        isDragging ? "combat-token-dragging" : ""
      } ${isDead ? "opacity-30" : ""}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Center the circle inside the cell using flex */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/*
         * Guaranteed perfect circle: aspect-ratio: 1 forces equal width/height
         * regardless of parent shape. We set max-w and max-h to 80% so it fits
         * with padding, and min() in the browser resolves to the smaller axis.
         */}
        <div
          className={`rounded-full border-2 ${colors.bg} ${colors.border} flex items-center justify-center
            ${isPlayer && !isDead ? "animate-token-pulse" : ""}
            ${isDraggable ? (isDragging ? "cursor-grabbing" : "cursor-grab") : ""}
          `}
          style={{ width: "80%", aspectRatio: "1 / 1" }}
        >
          {isDead ? (
            <span className="text-[10px]">💀</span>
          ) : (
            <span
              className={`font-cinzel font-bold ${colors.text} leading-none text-[clamp(7px,2.5cqi,14px)]`}
            >
              {label}
            </span>
          )}
        </div>
      </div>

      {/* HP bar — 2px tall, centered below the token circle */}
      {!isDead && (
        <div className="absolute left-[15%] right-[15%] bottom-[5%] h-[2px] bg-black/60 rounded-full overflow-hidden">
          <div
            className={`h-full ${hpColor} rounded-full transition-all duration-300`}
            style={{ width: `${hpPct * 100}%` }}
          />
        </div>
      )}

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap
          bg-dungeon-mid border border-gold/40 rounded px-2 py-1 pointer-events-none">
          <span className="font-cinzel text-[10px] text-parchment/90 tracking-wide">
            {fullName} {currentHp}/{maxHp} HP
          </span>
        </div>
      )}
    </div>
  );
}
