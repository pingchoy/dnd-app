"use client";

import { useMemo, memo } from "react";
import CompactChatPanel from "./CompactChatPanel";
import { OrnateFrame } from "./OrnateFrame";
import { detectRollHints } from "../lib/actionKeywords";
import type { ChatMessage } from "../hooks/useChat";

interface Props {
  messages: ChatMessage[];
  playerName: string;
  isNarrating: boolean;
  /** Whether the panel is open. */
  open: boolean;
  /** Called to close the panel. */
  onClose: () => void;
  /** Text input state. */
  userInput: string;
  setUserInput: React.Dispatch<React.SetStateAction<string>>;
  handleSubmit: () => void;
  inputDisabled: boolean;
}

/**
 * Left-side slide panel showing the combat log with text input at the bottom.
 *
 * - Wraps CompactChatPanel in an OrnateFrame
 * - Map resizes horizontally (no overlap) via CSS transition
 * - Gap between panel and map via right margin
 * - Text input at bottom for player actions
 */
const CombatChatPanel = memo(function CombatChatPanel({
  messages,
  playerName,
  isNarrating,
  open,
  onClose,
  userInput,
  setUserInput,
  handleSubmit,
  inputDisabled,
}: Props) {
  const hints = useMemo(() => detectRollHints(userInput), [userInput]);

  return (
    <div
      className={`flex-shrink-0 overflow-hidden transition-all duration-300 ease-in-out ${
        open ? "w-80 md:w-80 max-md:w-64 mr-3" : "w-0 mr-0"
      }`}
    >
      <div className="w-80 max-md:w-64 h-full">
        <OrnateFrame className="h-full overflow-hidden">
          <div className="h-full flex flex-col bg-dungeon/95 backdrop-blur-sm">
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

            {/* Roll hint tags */}
            {hints.length > 0 && (
              <div className="flex gap-2 flex-wrap px-3 py-1.5 border-t border-gold/20 bg-dungeon-mid/60 animate-fade-in">
                {hints.map(({ label, ability }) => (
                  <span
                    key={label}
                    className="flex items-center gap-1.5 font-cinzel text-[10px] tracking-widest uppercase
                               text-gold/70 border border-gold/25 rounded px-2.5 py-1 bg-dungeon"
                  >
                    <span className="text-gold/40">&#x2684;</span>
                    {label}
                    <span className="text-parchment/30">&middot;</span>
                    <span className="text-parchment/40">{ability}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="flex-shrink-0 border-t border-gold/30">
              <div className="flex items-center">
                <span className="pl-3 text-gold/50 font-cinzel text-sm pointer-events-none select-none">
                  &#x203A;
                </span>
                <input
                  value={userInput}
                  disabled={inputDisabled}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !inputDisabled) handleSubmit();
                  }}
                  autoComplete="off"
                  placeholder={inputDisabled ? "Awaiting the tale\u2026" : "Speak your action\u2026"}
                  className="flex-1 min-w-0 h-11 bg-transparent border-0 font-crimson text-sm
                             text-parchment/90 placeholder-parchment/30 focus:ring-0 focus:outline-none
                             disabled:opacity-40 px-2"
                />
                <button
                  onClick={handleSubmit}
                  disabled={inputDisabled}
                  className="px-3 h-11 font-cinzel text-[10px] tracking-widest text-gold uppercase
                             hover:text-gold-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                             flex-shrink-0"
                >
                  Act
                </button>
              </div>
            </div>
          </div>
        </OrnateFrame>
      </div>
    </div>
  );
});

export default CombatChatPanel;
