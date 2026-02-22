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

/** Duration the toast stays visible after appearing (ms). */
const DISPLAY_DURATION = 6000;
/** Fade animation duration (ms). */
const FADE_DURATION = 300;

/**
 * Compact floating toast on the combat map canvas showing the last action.
 *
 * Two content variants:
 * 1. Roll result — dice result + hit/miss + ability name + damage
 * 2. Narrative snippet — first 1-2 sentences of last DM message, truncated
 *
 * Behavior:
 * - Fade-in on new action, stays 6 seconds, fades out
 * - Replaced immediately when new action arrives
 * - Hidden when chat panel is open
 * - Click opens chat panel
 */
export default function LastActionToast({ messages, chatOpen, onOpenChat }: Props) {
  const [visible, setVisible] = useState(false);
  const [content, setContent] = useState<{ type: "roll"; text: string } | { type: "narrative"; text: string } | null>(null);
  const lastMsgIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Watch for new DM messages
  useEffect(() => {
    const lastMsg = messages.filter(m => m.role === "assistant").pop();
    if (!lastMsg || lastMsg.id === lastMsgIdRef.current) return;
    lastMsgIdRef.current = lastMsg.id;

    // Build content
    if (lastMsg.rollResult) {
      const r = lastMsg.rollResult;
      const hitMiss = r.hit ? "HIT" : "MISS";
      const parts = [`d20 ${r.naturalRoll}`, `\u2192 ${hitMiss}!`];
      if (r.abilityName) parts.push(r.abilityName);
      if (r.hit && r.damageTotal) parts.push(`\u2014 ${r.damageTotal} damage`);
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

    // Show toast
    setVisible(true);

    // Auto-hide after duration
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), DISPLAY_DURATION);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [messages]);

  // Don't render when chat is open or no content
  if (chatOpen || !content) return null;

  return (
    <div
      onClick={onOpenChat}
      className={`absolute bottom-10 left-4 z-20 max-w-xs cursor-pointer
                  transition-opacity pointer-events-auto ${
                    visible ? "opacity-100" : "opacity-0 pointer-events-none"
                  }`}
      style={{ transitionDuration: `${FADE_DURATION}ms` }}
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
