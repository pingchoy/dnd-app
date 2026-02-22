"use client";

import { useState, useMemo, useCallback } from "react";
import type { Ability } from "../lib/gameTypes";
import { toDisplayCase } from "../lib/gameTypes";
import { detectRollHints } from "../lib/actionKeywords";

interface Props {
  abilities: Ability[];
  selectedAbility: Ability | null;
  onSelectAbility: (ability: Ability) => void;
  abilityBarDisabled: boolean;
  /** Whether the left chat panel is currently open. */
  chatOpen: boolean;
  onToggleChat: () => void;
  /** Whether there are unread messages (shows dot indicator on chat toggle). */
  hasUnread: boolean;
  /** Text input state. */
  userInput: string;
  setUserInput: React.Dispatch<React.SetStateAction<string>>;
  handleSubmit: () => void;
  inputDisabled: boolean;
  /** When a targeted ability is selected, show targeting placeholder instead of normal input. */
  isTargeting: boolean;
  /** Range warning message to display above the hotbar. */
  rangeWarning: string | null;
}

/** Format a compact range tag for an ability button. */
function abilityRangeTag(ability: Ability): string {
  if (ability.type === "action") return "Self";
  const r = ability.range;
  if (!r) return "5 ft";
  switch (r.type) {
    case "self":   return "Self";
    case "touch":  return "Touch";
    case "melee":  return `${r.reach ?? 5} ft`;
    case "ranged": return `${r.shortRange ?? 30} ft`;
    case "both":   return `${r.reach ?? 5}/${r.shortRange ?? 20} ft`;
  }
}

/**
 * Fixed-height hotbar at the bottom of the combat layout.
 *
 * Layout (left to right):
 * - Ability buttons (horizontal, scrollable on overflow)
 * - Spell submenu toggle (pops upward)
 * - Chat toggle button (with unread dot)
 * - Input field (takes remaining space)
 */
export default function CombatHotbar({
  abilities,
  selectedAbility,
  onSelectAbility,
  abilityBarDisabled,
  chatOpen,
  onToggleChat,
  hasUnread,
  userInput,
  setUserInput,
  handleSubmit,
  inputDisabled,
  isTargeting,
  rangeWarning,
}: Props) {
  const [spellPanelOpen, setSpellPanelOpen] = useState(false);

  const directAbilities = useMemo(
    () => abilities.filter(a => a.type === "weapon" || a.type === "action"),
    [abilities],
  );
  const spellAbilities = useMemo(
    () => abilities.filter(a => a.type === "cantrip" || a.type === "spell"),
    [abilities],
  );

  const hints = useMemo(() => detectRollHints(userInput), [userInput]);

  const handleAbilityClick = useCallback((ability: Ability) => {
    setSpellPanelOpen(false);
    onSelectAbility(ability);
  }, [onSelectAbility]);

  const toggleSpellPanel = useCallback(() => {
    setSpellPanelOpen(o => !o);
  }, []);

  return (
    <div className="flex-shrink-0 relative">
      {/* Range warning bar */}
      {rangeWarning && (
        <div className="px-3 py-1.5 bg-amber-900/30 border-t border-amber-500/30">
          <p className="font-crimson text-amber-300/80 text-sm italic">
            {rangeWarning}
          </p>
        </div>
      )}

      {/* Roll hint tags */}
      {hints.length > 0 && !isTargeting && (
        <div className="flex gap-2 flex-wrap px-3 py-1.5 border-t border-[#3a2a1a] bg-dungeon-mid/60 animate-fade-in">
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

      {/* Spell submenu — pops upward from the hotbar */}
      {spellPanelOpen && spellAbilities.length > 0 && (
        <div className="combat-hotbar-spell-popup">
          {spellAbilities.map((ability) => {
            const isSelected = selectedAbility?.id === ability.id;
            const range = abilityRangeTag(ability);
            return (
              <button
                key={ability.id}
                onClick={() => handleAbilityClick(ability)}
                disabled={abilityBarDisabled}
                className={`combat-ability-btn ${isSelected ? "combat-ability-btn-selected" : ""}`}
                title={`${toDisplayCase(ability.name)} (${range})`}
              >
                <span className="combat-ability-name">
                  {toDisplayCase(ability.name)}
                </span>
                <span className="combat-ability-range">
                  {range}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main hotbar strip */}
      <div className="combat-hotbar">
        {/* Ability buttons — horizontal row, scrollable */}
        <div className="combat-hotbar-abilities">
          {directAbilities.map((ability) => {
            const isSelected = selectedAbility?.id === ability.id;
            const range = abilityRangeTag(ability);
            return (
              <button
                key={ability.id}
                onClick={() => handleAbilityClick(ability)}
                disabled={abilityBarDisabled}
                className={`combat-ability-btn ${isSelected ? "combat-ability-btn-selected" : ""}`}
                title={`${toDisplayCase(ability.name)} (${range})`}
              >
                <span className="combat-ability-name">
                  {toDisplayCase(ability.name)}
                </span>
                <span className="combat-ability-range">
                  {range}
                </span>
              </button>
            );
          })}

          {/* Spells toggle */}
          {spellAbilities.length > 0 && (
            <button
              onClick={toggleSpellPanel}
              disabled={abilityBarDisabled}
              className={`combat-ability-btn ${spellPanelOpen ? "combat-ability-btn-selected" : ""}`}
              title="Spells &amp; Cantrips"
            >
              <span className="combat-ability-name">Spells</span>
              <span className="combat-ability-range">
                {spellAbilities.length}
              </span>
            </button>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-8 bg-gold/20 flex-shrink-0" />

        {/* Chat toggle */}
        <button
          onClick={onToggleChat}
          className={`combat-hotbar-chat-toggle ${chatOpen ? "combat-hotbar-chat-toggle-active" : ""}`}
          title={chatOpen ? "Hide combat log" : "Show combat log"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {hasUnread && !chatOpen && (
            <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          )}
        </button>

        {/* Separator */}
        <div className="w-px h-8 bg-gold/20 flex-shrink-0" />

        {/* Input field */}
        <div className="flex-1 min-w-0 flex items-center">
          {isTargeting ? (
            <div className="w-full px-3 font-crimson text-sm text-parchment/40 italic truncate">
              Select a target on the map&hellip; <span className="text-parchment/25">(Esc to cancel)</span>
            </div>
          ) : (
            <>
              <input
                value={userInput}
                disabled={inputDisabled}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !inputDisabled) handleSubmit();
                }}
                autoComplete="off"
                placeholder={inputDisabled ? "Awaiting the tale\u2026" : "Speak your action\u2026"}
                className="flex-1 min-w-0 h-full bg-transparent border-0 font-crimson text-base
                           text-parchment/90 placeholder-parchment/30 focus:ring-0 focus:outline-none
                           disabled:opacity-40 px-3"
              />
              <button
                onClick={handleSubmit}
                disabled={inputDisabled}
                className="px-4 h-full font-cinzel text-[10px] tracking-widest text-gold uppercase
                           hover:text-gold-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                           flex-shrink-0"
              >
                Act
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
