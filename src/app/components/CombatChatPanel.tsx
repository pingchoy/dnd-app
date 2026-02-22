"use client";

import { memo } from "react";
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
}

/**
 * Left-side slide panel showing the combat log.
 *
 * - Wraps CompactChatPanel (last ~6 messages, dice rolls, markdown)
 * - Map resizes horizontally (no overlap) via CSS transition
 * - Toggled via the chat button in the hotbar; toast + unread dot handle notifications
 * - Read-only — input stays in the hotbar
 */
const CombatChatPanel = memo(function CombatChatPanel({
  messages,
  playerName,
  isNarrating,
  open,
  onClose,
}: Props) {
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
