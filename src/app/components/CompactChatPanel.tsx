"use client";

import { useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

  // Re-scroll while a dice roll is animating so the Continue button
  // is visible once the animation settles and the button renders.
  useEffect(() => {
    if (!pendingRoll) return;
    const id = setInterval(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 600);
    return () => clearInterval(id);
  }, [pendingRoll]);

  const recentMessages = messages.slice(-6);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2">
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
          return (
            <div
              key={idx}
              className={`py-2 ${idx > 0 ? "border-t border-gold/10" : ""}`}
            >
              <div
                className={`font-cinzel text-[10px] tracking-widest uppercase mb-0.5 ${
                  isDM ? "text-gold/70" : "text-parchment/40"
                }`}
              >
                {isDM ? "DM" : playerName}
              </div>
              <div className="font-crimson text-sm text-parchment/80 leading-snug prose prose-invert prose-sm max-w-none
                prose-strong:text-parchment prose-strong:font-semibold
                prose-em:italic prose-em:text-parchment/70
                prose-p:my-1 prose-p:leading-snug
                prose-ul:my-1 prose-ul:pl-4 prose-li:my-0
                prose-hr:border-gold/20">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              </div>
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
  );
}
