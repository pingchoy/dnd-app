"use client";

import { useRef, useEffect } from "react";
import type { ChatMessage, PendingRoll } from "../hooks/useChat";
import DiceRoll from "./DiceRoll";

interface Props {
  messages: ChatMessage[];
  playerName: string;
  pendingRoll: PendingRoll | null;
  isRolling: boolean;
  isNarrating: boolean;
  confirmRoll: () => void;
}

/** Loading dots reused from the dashboard — compact version. */
function CompactLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 animate-fade-in">
      <span className="text-gold text-[10px]">✦</span>
      <span className="text-parchment/50 font-crimson italic text-sm">{label}</span>
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
export default function CompactChatPanel({
  messages,
  playerName,
  pendingRoll,
  isRolling,
  isNarrating,
  confirmRoll,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingRoll, isRolling, isNarrating]);

  // Show last 6 messages
  const recentMessages = messages.slice(-6);

  return (
    <div className="tome-container flex-1 overflow-hidden flex flex-col min-h-0">
      <div className="scroll-pane flex-1 overflow-y-auto px-3 py-2">
        {recentMessages.map((msg, idx) => {
          // Historical roll cards — render inline compact
          if (msg.rollResult) {
            return (
              <div key={idx} className="my-1">
                <DiceRoll result={msg.rollResult} isHistorical />
              </div>
            );
          }

          const isDM = msg.role === "assistant";
          // Truncate long messages for compact view
          const truncated =
            msg.content.length > 200
              ? msg.content.slice(0, 200) + "..."
              : msg.content;

          return (
            <div
              key={idx}
              className={`py-1.5 ${idx > 0 ? "border-t border-[#3a2a1a]/50" : ""}`}
            >
              <span
                className={`font-cinzel text-[10px] tracking-widest uppercase mr-2 ${
                  isDM ? "text-gold/70" : "text-parchment/40"
                }`}
              >
                {isDM ? "DM" : playerName}
              </span>
              <span className="font-crimson text-sm text-parchment/80 leading-snug">
                {truncated}
              </span>
            </div>
          );
        })}

        {isRolling && <CompactLoading label="Consulting the fates" />}

        {pendingRoll && (
          <div className="my-1">
            <DiceRoll
              result={pendingRoll.parsed}
              onContinue={confirmRoll}
              isNarrating={isNarrating}
            />
          </div>
        )}

        {isNarrating && !pendingRoll && (
          <CompactLoading label="The tale unfolds" />
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
