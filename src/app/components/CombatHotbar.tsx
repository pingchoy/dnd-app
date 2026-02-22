"use client";

import { useState, useRef, useMemo, useCallback } from "react";
import type { Ability } from "../lib/gameTypes";
import { toDisplayCase } from "../lib/gameTypes";

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
 * - Chat toggle button (with unread dot)
 * - Ability buttons (horizontal, scrollable on overflow)
 * - Spell submenu toggle (pops upward)
 * - Targeting hint (when targeting)
 */
export default function CombatHotbar({
  abilities,
  selectedAbility,
  onSelectAbility,
  abilityBarDisabled,
  chatOpen,
  onToggleChat,
  hasUnread,
  isTargeting,
  rangeWarning,
}: Props) {
  const [spellPanelOpen, setSpellPanelOpen] = useState(false);
  const spellBtnRef = useRef<HTMLButtonElement>(null);

  const directAbilities = useMemo(
    () => abilities.filter(a => a.type === "weapon" || a.type === "action"),
    [abilities],
  );
  const spellAbilities = useMemo(
    () => abilities.filter(a => a.type === "cantrip" || a.type === "spell"),
    [abilities],
  );

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

      {/* Main hotbar strip */}
      <div className="combat-hotbar">
        {/* Chat toggle — left side */}
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
        </div>

        {/* Spells toggle button (popup rendered outside the hotbar to escape overflow clipping) */}
        {spellAbilities.length > 0 && (
          <button
            ref={spellBtnRef}
            onClick={toggleSpellPanel}
            disabled={abilityBarDisabled}
            className={`combat-ability-btn flex-shrink-0 ${spellPanelOpen ? "combat-ability-btn-selected" : ""}`}
            title="Spells &amp; Cantrips"
          >
            <span className="combat-ability-name">Spells</span>
            <span className="combat-ability-range">
              {spellAbilities.length}
            </span>
          </button>
        )}

        {/* Targeting hint — shown when a targeted ability is selected */}
        {isTargeting && (
          <>
            <div className="w-px h-8 bg-gold/20 flex-shrink-0" />
            <div className="flex-1 min-w-0 px-3 font-crimson text-sm text-parchment/40 italic truncate">
              Select a target on the map&hellip; <span className="text-parchment/25">(Esc to cancel)</span>
            </div>
          </>
        )}
      </div>

      {/* Spell popup — rendered outside the hotbar so it escapes OrnateFrame overflow clipping */}
      {spellPanelOpen && spellAbilities.length > 0 && spellBtnRef.current && (
        <SpellPopup
          spellBtnRef={spellBtnRef}
          spellAbilities={spellAbilities}
          selectedAbility={selectedAbility}
          abilityBarDisabled={abilityBarDisabled}
          onAbilityClick={handleAbilityClick}
        />
      )}
    </div>
  );
}

interface SpellPopupProps {
  spellBtnRef: React.RefObject<HTMLButtonElement | null>;
  spellAbilities: Ability[];
  selectedAbility: Ability | null;
  abilityBarDisabled: boolean;
  onAbilityClick: (ability: Ability) => void;
}

/**
 * Spell popup rendered with fixed positioning so it escapes any overflow clipping.
 * Positioned above the Spells button using its bounding rect.
 */
function SpellPopup({ spellBtnRef, spellAbilities, selectedAbility, abilityBarDisabled, onAbilityClick }: SpellPopupProps) {
  const btn = spellBtnRef.current;
  if (!btn) return null;
  const rect = btn.getBoundingClientRect();

  return (
    <div
      className="combat-hotbar-spell-popup"
      style={{
        position: "fixed",
        bottom: window.innerHeight - rect.top + 4,
        left: rect.left,
      }}
    >
      {spellAbilities.map((ability) => {
        const isSelected = selectedAbility?.id === ability.id;
        const range = abilityRangeTag(ability);
        return (
          <button
            key={ability.id}
            onClick={() => onAbilityClick(ability)}
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
  );
}
