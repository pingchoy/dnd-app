"use client";

import React, { useMemo } from "react";

// Common D&D action verbs / skill names that typically trigger a roll
const CONTESTED_ROOTS = [
  "attack", "strike", "hit", "stab", "slash", "shoot", "fire", "cast",
  "throw", "sneak", "hide", "steal", "pick", "unlock", "lockpick",
  "persuade", "deceive", "intimidate", "charm", "bluff",
  "climb", "jump", "leap", "swim", "dodge", "grapple", "shove", "sprint",
  "search", "investigate", "detect", "disarm", "distract",
  "perception", "stealth", "acrobatics", "athletics",
  "persuasion", "deception", "intimidation", "insight",
  "arcana", "survival", "nature", "history", "religion", "medicine",
];

function renderHighlighted(text: string): React.ReactNode {
  // Split on word boundaries, keeping both words and separators as tokens
  const tokens = text.split(/(\b[a-zA-Z]+\b)/);
  return tokens.map((token, i) => {
    const lower = token.toLowerCase();
    const isContested = lower.length > 2 && CONTESTED_ROOTS.some(
      (root) => lower === root || lower.startsWith(root),
    );
    if (isContested) {
      return (
        <span key={i} className="text-amber-400">
          {token}
        </span>
      );
    }
    return <React.Fragment key={i}>{token}</React.Fragment>;
  });
}

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
  const highlighted = useMemo(() => renderHighlighted(userInput), [userInput]);

  return (
    <div className="flex w-full border border-t-0 border-[#3a2a1a] rounded-b-md overflow-hidden shadow-lg">
      <div className="flex-1 relative bg-dungeon-mid overflow-hidden">
        {/* Gold arrow prefix */}
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gold/50 font-cinzel text-sm pointer-events-none select-none z-10">
          ›
        </span>

        {/* Backdrop: renders highlighted text behind the transparent input */}
        <div
          aria-hidden
          className="absolute inset-0 pl-8 pr-4 flex items-center font-crimson text-base pointer-events-none select-none overflow-hidden whitespace-nowrap"
          style={{ color: "rgba(240,225,195,0.9)" }}
        >
          {userInput ? highlighted : (
            <span className="text-parchment/30">
              {disabled ? "Awaiting the tale…" : "Speak your action, adventurer…"}
            </span>
          )}
        </div>

        {/* Transparent input sits on top so the user can type normally */}
        <input
          name="userInput"
          id="userInput"
          value={userInput}
          disabled={disabled}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !disabled) handleSubmit();
          }}
          placeholder=""
          className="relative z-10 block w-full h-14 pl-8 pr-4 bg-transparent border-0 font-crimson text-base focus:ring-0 focus:outline-none disabled:opacity-40"
          style={{ color: "transparent", caretColor: "rgba(240,225,195,0.9)" }}
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={disabled}
        className="px-6 h-14 bg-dungeon-light border-l border-[#3a2a1a] font-cinzel text-xs tracking-widest text-gold uppercase hover:bg-gold/10 hover:text-gold-light transition-colors duration-200 active:bg-gold/20 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Act
      </button>
    </div>
  );
}
