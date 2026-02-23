"use client";

import { useState, useEffect, useRef } from "react";
import type { ChatMessage } from "../hooks/useChat";

interface Props {
  messages: ChatMessage[];
  /** Whether the chat panel is open (toast is hidden when panel is open). */
  chatOpen: boolean;
  /** Called when the toast is clicked (opens chat panel). */
  onOpenChat: () => void;
}

/**
 * Compact floating toast on the combat map canvas showing the last action.
 *
 * Two content variants:
 * 1. Roll result — dice result + hit/miss + ability name + damage
 * 2. Narrative snippet — first 1-2 sentences of last DM message, truncated
 *
 * Behavior:
 * - Fades in on new action, then gradually dissipates over 5 seconds
 * - Replaced immediately when new action arrives
 * - Hidden when chat panel is open
 * - Click opens chat panel
 */
export default function LastActionToast({ messages, chatOpen, onOpenChat }: Props) {
  const [content, setContent] = useState<{ type: "roll"; text: string } | { type: "narrative"; text: string } | null>(null);
  // Incremented on each new message to restart the CSS animation
  const [animKey, setAnimKey] = useState(0);
  const lastMsgIdRef = useRef<string | null>(null);

  // Watch for new DM messages
  useEffect(() => {
    const lastMsg = messages.filter(m => m.role === "assistant").pop();
    if (!lastMsg || lastMsg.id === lastMsgIdRef.current) return;
    lastMsgIdRef.current = lastMsg.id;

    // Build content
    if (lastMsg.rollResult) {
      const r = lastMsg.rollResult;
      const hitMiss = r.success ? "HIT" : "MISS";
      const parts = [`d20 ${r.dieResult}`, `\u2192 ${hitMiss}!`];
      if (r.checkType) parts.push(r.checkType);
      if (r.success && r.damage?.totalDamage) parts.push(`\u2014 ${r.damage.totalDamage} damage`);
      setContent({ type: "roll", text: parts.join(" ") });
    } else {
      // Narrative: first 1-2 sentences, max ~120 chars
      const raw = lastMsg.content.replace(/[*_#`]/g, "").trim();
      const sentences = raw.match(/[^.!?]+[.!?]+/g);
      let snippet: string;
      if (sentences && sentences.length > 0) {
        snippet = sentences.slice(0, 2).join("").trim();
        if (snippet.length > 120) snippet = snippet.slice(0, 117) + "\u2026";
      } else {
        snippet = raw.length > 120 ? raw.slice(0, 117) + "\u2026" : raw;
      }
      setContent({ type: "narrative", text: snippet });
    }

    // Bump key to restart the dissipate animation
    setAnimKey(k => k + 1);
  }, [messages]);

  // Don't render when chat is open or no content
  if (chatOpen || !content) return null;

  return (
    <div
      key={animKey}
      onClick={onOpenChat}
      className="absolute bottom-28 left-4 z-20 max-w-xs cursor-pointer
                 pointer-events-auto animate-toast-dissipate"
    >
      <div className={`rounded-lg border px-3 py-2 backdrop-blur-sm shadow-lg ${
        content.type === "roll"
          ? "bg-dungeon/90 border-gold/30"
          : "bg-dungeon/85 border-parchment/20"
      }`}>
        {content.type === "roll" ? (
          <p className="font-cinzel text-sm text-gold tracking-wide">
            {content.text}
          </p>
        ) : (
          <p className="font-crimson text-sm text-parchment/80 italic leading-snug">
            {content.text}
          </p>
        )}
      </div>
    </div>
  );
}
