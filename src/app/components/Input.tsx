"use client";

import { useMemo } from "react";
import { detectRollHints } from "../lib/actionKeywords";

export default function Input({
  userInput,
  setUserInput,
  handleSubmit,
  disabled = false,
}: {
  userInput: string;
  setUserInput: React.Dispatch<React.SetStateAction<string>>;
  handleSubmit: () => void;
  disabled?: boolean;
}) {
  const hints = useMemo(() => detectRollHints(userInput), [userInput]);

  return (
    <div className="flex flex-col w-full">
      {/* Roll hint tags — appear above the input when contested keywords are detected */}
      {hints.length > 0 && (
        <div className="flex gap-2 flex-wrap px-4 py-2 border border-b-0 border-[#3a2a1a] bg-dungeon-mid/60 animate-fade-in">
          {hints.map(({ label, ability }) => (
            <span
              key={label}
              className="flex items-center gap-1.5 font-cinzel text-[10px] tracking-widest uppercase
                         text-gold/70 border border-gold/25 rounded px-2.5 py-1 bg-dungeon"
            >
              <span className="text-gold/40">⚄</span>
              {label}
              <span className="text-parchment/30">·</span>
              <span className="text-parchment/40">{ability}</span>
            </span>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex w-full border border-t-0 border-[#3a2a1a] rounded-b-md overflow-hidden shadow-lg">
        <div className="flex-1 relative bg-dungeon-mid overflow-hidden">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gold/50 font-cinzel text-sm pointer-events-none select-none z-10">
            ›
          </span>
          <input
            name="userInput"
            id="userInput"
            value={userInput}
            disabled={disabled}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !disabled) handleSubmit();
            }}
            autoComplete="off"
            placeholder={disabled ? "Awaiting the tale…" : "Speak your action, adventurer…"}
            className="block w-full h-14 pl-8 pr-4 bg-transparent border-0 font-crimson text-base
                       text-parchment/90 placeholder-parchment/30 focus:ring-0 focus:outline-none
                       disabled:opacity-40"
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={disabled}
          className="px-6 h-14 bg-dungeon-light border-l border-[#3a2a1a] font-cinzel text-xs
                     tracking-widest text-gold uppercase hover:bg-gold/10 hover:text-gold-light
                     transition-colors duration-200 active:bg-gold/20 disabled:opacity-40
                     disabled:cursor-not-allowed"
        >
          Act
        </button>
      </div>
    </div>
  );
}
