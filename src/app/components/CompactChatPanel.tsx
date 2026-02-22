"use client";

import { useRef, useEffect, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../hooks/useChat";
import type { AOEResultData } from "../lib/gameTypes";
import DiceRoll from "./DiceRoll";

interface Props {
  messages: ChatMessage[];
  playerName: string;
  isNarrating: boolean;
}

/** Compact AOE result card showing spell name, total damage, and per-target breakdown. */
function AOEResultCard({ result, isHistorical }: { result: AOEResultData; isHistorical: boolean }) {
  return (
    <div className={`rounded border border-red-900/40 bg-dungeon-mid/80 ${isHistorical ? "" : "animate-fade-in"}`}>
      {/* Header: spell name + total damage */}
      <div className="px-3 py-1.5 border-b border-red-900/30 flex items-center justify-between">
        <span className="font-cinzel text-[11px] tracking-widest text-red-400 uppercase">
          {result.checkType}
        </span>
        <span className="font-cinzel text-sm text-parchment/90">
          {result.totalRolled} {result.damageType}
        </span>
      </div>
      {/* Per-target breakdown */}
      <div className="px-3 py-1.5 space-y-0.5">
        <div className="font-cinzel text-[10px] text-parchment/40 tracking-wider uppercase mb-1">
          DC {result.spellDC} &middot; {result.damageRoll} damage
        </div>
        {result.targets.map((t) => (
          <div key={t.npcId} className="flex items-center justify-between text-sm font-crimson">
            <span className="text-parchment/80">{t.npcName}</span>
            <span className="flex items-center gap-2">
              <span className={`text-[10px] font-cinzel tracking-wider uppercase ${t.saved ? "text-green-400" : "text-red-400"}`}>
                {t.saved ? "SAVED" : "FAILED"}
              </span>
              <span className="text-parchment/50 text-[10px]">
                ({t.saveRoll}+{t.saveTotal - t.saveRoll}={t.saveTotal})
              </span>
              <span className="text-parchment/90 font-semibold">
                -{t.damageTaken}
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

/** Loading dots reused from the dashboard — compact version. */
function CompactLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 animate-fade-in">
      <span className="text-gold text-[10px]">✦</span>
      <span className="text-parchment/50 font-crimson italic text-sm">
        {label}
      </span>
      <span className="w-1 h-1 rounded-full bg-gold dot-1" />
      <span className="w-1 h-1 rounded-full bg-gold dot-2" />
      <span className="w-1 h-1 rounded-full bg-gold dot-3" />
    </div>
  );
}

/**
 * Condensed chat panel shown below the combat grid.
 * Displays last few messages in compact form with dice roll support.
 */
function CompactChatPanel({ messages, playerName, isNarrating }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isNarrating]);

  // Re-scroll while a dice roll is animating so the expanding card stays in view
  const lastMsg = messages[messages.length - 1];
  const hasAnimatingRoll = lastMsg?.isNewRoll === true;
  useEffect(() => {
    if (!hasAnimatingRoll) return;
    const id = setInterval(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 400);
    const timeout = setTimeout(() => clearInterval(id), 3500);
    return () => {
      clearInterval(id);
      clearTimeout(timeout);
    };
  }, [hasAnimatingRoll]);

  const recentMessages = messages.slice(-10);
  return (
    <div className="flex-1 min-h-0 px-3 py-2 overflow-hidden">
      {recentMessages.map((msg, idx) => {
        // AOE result cards
        if (msg.aoeResult) {
          return (
            <div
              key={msg.id}
              className={`my-1 ${msg.isNew ? "animate-chat-enter" : ""}`}
            >
              <AOEResultCard result={msg.aoeResult} isHistorical={!msg.isNewRoll} />
            </div>
          );
        }

        // Roll cards — animate if new, compact if historical
        if (msg.rollResult) {
          return (
            <div
              key={msg.id}
              className={`my-1 ${msg.isNew ? "animate-chat-enter" : ""}`}
            >
              <DiceRoll result={msg.rollResult} isHistorical={!msg.isNewRoll} />
            </div>
          );
        }

        const isDM = msg.role === "assistant";
        return (
          <div
            key={msg.id}
            className={`py-2 ${idx > 0 ? "border-t border-gold/10" : ""} ${msg.isNew ? "animate-chat-enter" : ""}`}
          >
            <div
              className={`font-cinzel text-[10px] tracking-widest uppercase mb-0.5 ${
                isDM ? "text-gold/70" : "text-parchment/40"
              }`}
            >
              {isDM ? "DM" : playerName}
            </div>
            <div
              className="font-crimson text-sm text-parchment/80 leading-snug prose prose-invert prose-sm max-w-none
                prose-strong:text-parchment prose-strong:font-semibold
                prose-em:italic prose-em:text-parchment/70
                prose-p:my-1 prose-p:leading-snug
                prose-ul:my-1 prose-ul:pl-4 prose-li:my-0
                prose-hr:border-gold/20"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {msg.content}
              </ReactMarkdown>
            </div>
          </div>
        );
      })}

      {isNarrating && <CompactLoading label="The tale unfolds" />}

      <div ref={bottomRef} />
    </div>
  );
}

export default memo(CompactChatPanel);
