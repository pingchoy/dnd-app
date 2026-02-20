"use client";

import type { CharacterSummary } from "../lib/gameTypes";
import { toDisplayCase } from "../lib/gameTypes";

interface Props {
  summary: CharacterSummary;
  onSelect: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

/** Format a relative time string like "2h ago" or "3d ago". */
function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function CharacterCard({ summary, onSelect, onDelete, isDeleting }: Props) {
  const hpPct = summary.maxHP > 0 ? Math.round((summary.currentHP / summary.maxHP) * 100) : 0;

  return (
    <button
      onClick={onSelect}
      disabled={isDeleting}
      className="group relative text-left w-full bg-dungeon-mid border border-gold/20 rounded p-4
                 hover:border-gold/60 hover:bg-dungeon-light transition-all disabled:opacity-50"
    >
      {/* Delete button — visible on hover */}
      <span
        role="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded
                   text-parchment/0 group-hover:text-parchment/40 hover:!text-red-400
                   transition-colors cursor-pointer text-sm"
        title="Delete character"
      >
        ✕
      </span>

      {/* Name */}
      <h3 className="font-cinzel text-parchment text-base leading-tight truncate pr-6">
        {summary.name}
      </h3>

      {/* Race · Class · Level */}
      <p className="font-crimson text-parchment/60 text-sm mt-0.5">
        {toDisplayCase(summary.race)} · {toDisplayCase(summary.characterClass)} · Lv.{summary.level}
      </p>

      {/* Campaign title */}
      <p className="font-crimson text-gold/60 text-sm italic mt-1 truncate">
        {summary.campaignTitle}
      </p>

      {/* HP bar */}
      <div className="mt-2">
        <div className="flex items-center justify-between mb-0.5">
          <span className="font-cinzel text-[10px] text-parchment/40 tracking-wide uppercase">HP</span>
          <span className="font-crimson text-[11px] text-parchment/50">
            {summary.currentHP}/{summary.maxHP}
          </span>
        </div>
        <div className="h-1.5 bg-dungeon rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              hpPct > 50 ? "bg-emerald-500/70" : hpPct > 25 ? "bg-yellow-500/70" : "bg-red-500/70"
            }`}
            style={{ width: `${hpPct}%` }}
          />
        </div>
      </div>

      {/* Last played */}
      <p className="font-crimson text-[11px] text-parchment/30 mt-2">
        Last played: {timeAgo(summary.updatedAt)}
      </p>
    </button>
  );
}
