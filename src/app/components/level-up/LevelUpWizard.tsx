"use client";

import type { PendingLevelUp, PlayerState, GameState } from "../../lib/gameTypes";
import { useLevelUp } from "../../hooks/useLevelUp";
import LevelUpSummary from "./LevelUpSummary";
import LevelUpSubclass from "./LevelUpSubclass";
import LevelUpASI from "./LevelUpASI";
import LevelUpFeatureChoices from "./LevelUpFeatureChoices";
import LevelUpSpells from "./LevelUpSpells";
import LevelUpConfirm from "./LevelUpConfirm";

interface Props {
  pending: PendingLevelUp;
  player: PlayerState;
  characterId: string;
  onComplete: (newState: GameState) => void;
}

const STEP_LABELS: Record<string, string> = {
  summary: "Summary",
  subclass: "Subclass",
  asi: "Abilities",
  features: "Features",
  spells: "Spells",
  confirm: "Confirm",
};

export default function LevelUpWizard({ pending, player, characterId, onComplete }: Props) {
  const lu = useLevelUp(pending, player, characterId);

  async function handleConfirm() {
    try {
      const newState = await lu.confirm();
      onComplete(newState);
    } catch {
      // Error is handled by the hook's error state
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] mx-4 flex flex-col bg-dungeon border border-gold/30 rounded-lg shadow-2xl overflow-hidden">
        {/* Step indicator */}
        <div className="flex-shrink-0 bg-dungeon-light border-b border-gold/20 px-6 py-3">
          <div className="flex items-center justify-center gap-2">
            {lu.steps.map((step, idx) => {
              const isCurrent = idx === lu.stepIndex;
              const isComplete = idx < lu.stepIndex;
              return (
                <div key={step} className="flex items-center">
                  {idx > 0 && (
                    <div
                      className={`w-8 h-px mx-1 ${
                        isComplete ? "bg-gold/50" : "bg-gold/15"
                      }`}
                    />
                  )}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-cinzel transition-all ${
                        isCurrent
                          ? "bg-gold text-dungeon shadow-gold-glow"
                          : isComplete
                          ? "bg-gold/30 text-gold"
                          : "bg-dungeon-mid border border-gold/20 text-parchment/30"
                      }`}
                    >
                      {isComplete ? (
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <span
                      className={`font-cinzel text-[9px] tracking-wider uppercase mt-1 ${
                        isCurrent ? "text-gold" : "text-parchment/30"
                      }`}
                    >
                      {STEP_LABELS[step]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {lu.currentStep === "summary" && (
            <LevelUpSummary pending={pending} player={player} />
          )}
          {lu.currentStep === "subclass" && (
            <LevelUpSubclass
              className={player.characterClass}
              archetypes={lu.archetypes}
              selectedSubclass={lu.selectedSubclass}
              onSelect={lu.setSelectedSubclass}
              isLoading={lu.isLoadingArchetypes}
            />
          )}
          {lu.currentStep === "asi" && (
            <LevelUpASI
              asiStates={lu.asiStates}
              player={player}
              feats={lu.feats}
              isLoadingFeats={lu.isLoadingFeats}
              onSetMode={lu.setASIMode}
              onAdjust={lu.adjustASI}
              onSetFeat={lu.setFeatChoice}
            />
          )}
          {lu.currentStep === "features" && (
            <LevelUpFeatureChoices
              pending={pending}
              featureChoices={lu.featureChoices}
              onSetChoice={lu.setFeatureChoice}
            />
          )}
          {lu.currentStep === "spells" && (
            <LevelUpSpells
              availableCantrips={lu.availableCantrips}
              availableSpells={lu.availableSpells}
              selectedCantrips={lu.selectedCantrips}
              selectedSpells={lu.selectedSpells}
              totalCantripSlots={lu.totalCantripSlots}
              totalSpellSlots={lu.totalSpellSlots}
              onToggleCantrip={lu.toggleCantrip}
              onToggleSpell={lu.toggleSpell}
              isLoading={lu.isLoadingSpells}
              alreadyKnownCantrips={lu.alreadyKnownCantrips}
              alreadyKnownSpells={lu.alreadyKnownSpells}
            />
          )}
          {lu.currentStep === "confirm" && (
            <LevelUpConfirm
              pending={pending}
              player={player}
              asiStates={lu.asiStates}
              selectedSubclass={lu.selectedSubclass}
              featureChoices={lu.featureChoices}
              selectedCantrips={lu.selectedCantrips}
              selectedSpells={lu.selectedSpells}
              isConfirming={lu.isConfirming}
              error={lu.error}
              onConfirm={handleConfirm}
            />
          )}
        </div>

        {/* Navigation footer */}
        {lu.currentStep !== "confirm" && (
          <div className="flex-shrink-0 border-t border-gold/20 px-6 py-3 flex items-center justify-between bg-dungeon-light/50">
            <button
              onClick={lu.goBack}
              disabled={!lu.canGoBack}
              className="font-cinzel text-xs text-parchment/40 tracking-widest uppercase
                         hover:text-parchment disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            >
              {lu.canGoBack && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="inline-block mr-1 -mt-px flex-shrink-0">
                  <path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              Back
            </button>
            <button
              onClick={lu.goNext}
              disabled={!lu.canGoNext}
              className="font-cinzel text-xs text-gold border border-gold/40 rounded px-4 py-2
                         tracking-widest uppercase hover:border-gold hover:bg-dungeon-mid
                         disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {lu.currentStep === "summary" ? "Continue" : "Next"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
