"use client";

import { useEffect, useRef, memo } from "react";
import CompactChatPanel from "./CompactChatPanel";
import type { ChatMessage } from "../hooks/useChat";

interface Props {
  messages: ChatMessage[];
  playerName: string;
  isNarrating: boolean;
  /** Whether the panel is open. */
  open: boolean;
  /** Called to close the panel. */
  onClose: () => void;
  /** Called to open the panel (for auto-open on new message). */
  onOpen: () => void;
}

/** Seconds of no new messages before auto-closing. */
const AUTO_CLOSE_DELAY = 5000;

/**
 * Left-side slide panel showing the combat log.
 *
 * - Wraps CompactChatPanel (last ~6 messages, dice rolls, markdown)
 * - Map resizes horizontally (no overlap) via CSS transition
 * - Auto-opens when a new DM message arrives (if closed)
 * - Auto-closes after 5 seconds of no new messages
 * - Read-only — input stays in the hotbar
 */
const CombatChatPanel = memo(function CombatChatPanel({
  messages,
  playerName,
  isNarrating,
  open,
  onClose,
  onOpen,
}: Props) {
  const lastMsgCountRef = useRef(messages.length);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-open on new DM message, auto-close after 5 seconds of quiet
  useEffect(() => {
    if (messages.length <= lastMsgCountRef.current) {
      lastMsgCountRef.current = messages.length;
      return;
    }
    lastMsgCountRef.current = messages.length;

    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === "assistant") {
      onOpen();

      // Reset auto-close timer
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = setTimeout(() => {
        onClose();
      }, AUTO_CLOSE_DELAY);
    }

    return () => {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    };
  }, [messages, onOpen, onClose]);

  return (
    <div
      className={`flex-shrink-0 overflow-hidden transition-all duration-300 ease-in-out border-r border-gold/20 ${
        open ? "w-80 md:w-80 max-md:w-64" : "w-0"
      }`}
    >
      <div className="w-80 max-md:w-64 h-full flex flex-col bg-dungeon/95 backdrop-blur-sm">
        {/* Header */}
        <div className="flex-shrink-0 bg-dungeon-mid border-b border-gold/30 px-3 py-1.5 flex items-center justify-between">
          <span className="font-cinzel text-gold text-[10px] tracking-widest uppercase">
            Combat Log
          </span>
          <button
            onClick={onClose}
            className="font-cinzel text-[10px] tracking-widest text-parchment/50 uppercase hover:text-gold transition-colors"
          >
            &#x2715;
          </button>
        </div>

        {/* Chat content */}
        <div className="flex-1 overflow-hidden">
          <CompactChatPanel
            messages={messages}
            playerName={playerName}
            isNarrating={isNarrating}
          />
        </div>
      </div>
    </div>
  );
});

export default CombatChatPanel;
