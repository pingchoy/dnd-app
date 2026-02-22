"use client";

import { useRef, useEffect, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../hooks/useChat";
import DiceRoll from "./DiceRoll";
import AOEResultCard from "./AOEResultCard";

interface Props {
  messages: ChatMessage[];
  playerName: string;
  isNarrating: boolean;
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
              <AOEResultCard result={msg.aoeResult} isHistorical={!msg.isNewRoll} compact />
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
