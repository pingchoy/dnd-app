"use client";

import { useEffect } from "react";
import {
  useCharacterCreation,
  type WizardStep,
} from "../hooks/useCharacterCreation";
import StepRace from "./StepRace";
import StepClass from "./StepClass";
import StepArchetype from "./StepArchetype";
import StepFeatureChoices from "./StepFeatureChoices";
import StepPointBuy from "./StepPointBuy";
import StepSkills from "./StepSkills";
import StepSpells from "./StepSpells";
import StepReview from "./StepReview";

const BASE_LABELS = ["Race", "Class", "Abilities", "Skills"];

function StepIndicator({
  current,
  total,
  labels,
}: {
  current: number;
  total: number;
  labels: string[];
}) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => {
        const stepNum = i + 1;
        const isDone = stepNum < current;
        const isCurrent = stepNum === current;
        return (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center w-6 h-6 rounded-full border font-cinzel text-[10px] leading-none transition-all ${
                isDone
                  ? "border-gold bg-gold text-dungeon"
                  : isCurrent
                    ? "border-gold text-gold"
                    : "border-gold/20 text-parchment/30"
              }`}
            >
              {isDone ? "✓" : stepNum}
            </div>
            <span
              className={`font-cinzel text-[10px] tracking-wide hidden sm:block ${
                isCurrent
                  ? "text-gold"
                  : isDone
                    ? "text-parchment/50"
                    : "text-parchment/20"
              }`}
            >
              {labels[i]}
            </span>
            {i < total - 1 && (
              <div
                className={`w-6 h-px ${isDone ? "bg-gold/60" : "bg-gold/15"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CharacterCreationPage() {
  const wizard = useCharacterCreation();

  // Load SRD data when the wizard first mounts
  useEffect(() => {
    wizard.loadSRD();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { totalSteps, reviewStep, isSpellcaster } = wizard;
  const stepLabels = isSpellcaster
    ? [...BASE_LABELS, "Spells", "Review"]
    : [...BASE_LABELS, "Review"];

  const canAdvanceFromSkills =
    wizard.selectedSkills.length ===
    (wizard.selectedClass?.skillChoices ?? 0) +
      (wizard.selectedRace?.extraSkillChoices ?? 0);

  const canAdvanceFromSpells =
    wizard.selectedCantrips.length === wizard.cantripsToChoose &&
    wizard.selectedSpells.length === wizard.spellsToChoose;

  function handleNext() {
    if (wizard.step < reviewStep)
      wizard.goToStep((wizard.step + 1) as WizardStep);
  }
  function handleBack() {
    if (wizard.step > 1) wizard.goToStep((wizard.step - 1) as WizardStep);
  }

  // When navigating to the spells step, load spell data
  const spellStep: WizardStep | null = isSpellcaster ? 5 : null;

  return (
    <main className="min-h-screen bg-dungeon bg-stone-texture flex flex-col items-center justify-start px-4 py-8">
      {/* Header */}
      <div className="w-full max-w-3xl mb-6">
        <h1 className="font-cinzel text-gold text-center text-xl tracking-[0.2em] uppercase mb-4">
          ✦ Create Your Character ✦
        </h1>
        <div className="flex justify-center">
          <StepIndicator
            current={wizard.step}
            total={totalSteps}
            labels={stepLabels}
          />
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-3xl bg-dungeon-light border border-gold-dark/40 rounded-lg shadow-parchment overflow-hidden">
        {/* Loading overlay */}
        {wizard.isLoadingSRD && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <span className="font-cinzel text-gold text-3xl animate-pulse">
                ✦
              </span>
              <p className="font-crimson text-parchment/50 italic text-sm">
                Consulting the ancient tomes…
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {!wizard.isLoadingSRD && wizard.error && (
          <div className="p-6 text-center">
            <p className="font-crimson text-red-400 text-sm">{wizard.error}</p>
            <button
              onClick={wizard.loadSRD}
              className="mt-3 font-cinzel text-xs text-gold border border-gold/30 rounded px-4 py-2
                         hover:border-gold hover:bg-dungeon-mid transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Step content */}
        {!wizard.isLoadingSRD && !wizard.error && (
          <div className="p-5 sm:p-6">
            {wizard.step === 1 && (
              <StepRace
                races={wizard.races}
                selectedRace={wizard.selectedRace}
                onSelect={wizard.selectRace}
              />
            )}

            {wizard.step === 2 &&
              !wizard.showingArchetypeStep &&
              !wizard.showingFeatureChoicesStep && (
                <StepClass
                  classes={wizard.classes}
                  selectedClass={wizard.selectedClass}
                  onSelect={wizard.selectClass}
                />
              )}

            {wizard.step === 2 &&
              wizard.showingArchetypeStep &&
              wizard.selectedClass && (
                <StepArchetype
                  selectedClass={wizard.selectedClass}
                  selectedArchetype={wizard.selectedArchetype}
                  onSelect={wizard.selectArchetype}
                  onBack={() => wizard.goToStep(2)}
                />
              )}

            {wizard.step === 2 &&
              wizard.showingFeatureChoicesStep &&
              !wizard.showingArchetypeStep && (
                <StepFeatureChoices
                  choiceFeatures={wizard.choiceFeatures}
                  featureChoices={wizard.featureChoices}
                  onSetChoice={wizard.setFeatureChoice}
                  onConfirm={wizard.confirmFeatureChoices}
                  onBack={() => wizard.goToStep(2)}
                />
              )}

            {wizard.step === 3 && wizard.selectedRace && (
              <StepPointBuy
                baseStats={wizard.baseStats}
                finalStats={wizard.finalStats}
                pointsRemaining={wizard.pointsRemaining}
                selectedRace={wizard.selectedRace}
                onAdjust={wizard.adjustStat}
              />
            )}

            {wizard.step === 4 && wizard.selectedClass && (
              <StepSkills
                selectedClass={wizard.selectedClass}
                selectedRace={wizard.selectedRace}
                selectedSkills={wizard.selectedSkills}
                onToggle={wizard.toggleSkill}
              />
            )}

            {spellStep && wizard.step === spellStep && (
              <StepSpells
                availableCantrips={wizard.availableCantrips}
                availableSpells={wizard.availableSpells}
                cantripsToChoose={wizard.cantripsToChoose}
                spellsToChoose={wizard.spellsToChoose}
                selectedCantrips={wizard.selectedCantrips}
                selectedSpells={wizard.selectedSpells}
                onToggleCantrip={wizard.toggleCantrip}
                onToggleSpell={wizard.toggleSpell}
                isLoading={wizard.isLoadingSpells}
              />
            )}

            {wizard.step === reviewStep &&
              wizard.selectedRace &&
              wizard.selectedClass && (
                <div className="space-y-4">
                  {/* Character name input */}
                  <div>
                    <label className="font-cinzel text-[10px] text-parchment/40 tracking-widest uppercase block mb-1.5">
                      Character Name
                    </label>
                    <input
                      type="text"
                      value={wizard.characterName}
                      onChange={(e) => wizard.setCharacterName(e.target.value)}
                      placeholder="Enter your character's name…"
                      maxLength={40}
                      className="w-full bg-dungeon border border-gold/30 rounded px-3 py-2
                                 font-cinzel text-sm text-parchment placeholder-parchment/20
                                 focus:outline-none focus:border-gold/70 focus:ring-1 focus:ring-gold/30
                                 transition-colors"
                    />
                  </div>

                  {/* Gender selector */}
                  <div>
                    <label className="font-cinzel text-[10px] text-parchment/40 tracking-widest uppercase block mb-1.5">
                      Gender
                    </label>
                    <div className="flex gap-2">
                      {["Male", "Female"].map((g) => (
                        <button
                          key={g}
                          onClick={() => wizard.setGender(g)}
                          className={`flex-1 font-cinzel text-sm py-2 rounded border transition-colors ${
                            wizard.selectedGender === g
                              ? "border-gold bg-gold/10 text-gold"
                              : "border-gold/20 text-parchment/40 hover:border-gold/50 hover:text-parchment/70"
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  <StepReview
                    characterName={wizard.characterName}
                    selectedRace={wizard.selectedRace}
                    selectedClass={wizard.selectedClass}
                    finalStats={wizard.finalStats}
                    selectedSkills={wizard.selectedSkills}
                    isSaving={wizard.isSaving}
                    onConfirm={wizard.confirm}
                    onBack={handleBack}
                  />
                </div>
              )}

            {/* Navigation (all steps except review have nav bar) */}
            {wizard.step < reviewStep &&
              !wizard.showingArchetypeStep &&
              !wizard.showingFeatureChoicesStep && (
                <div className="flex justify-between items-center mt-6 pt-4 border-t border-gold/10">
                  <button
                    onClick={handleBack}
                    disabled={wizard.step === 1}
                    className="font-cinzel text-xs text-parchment/40 tracking-widest uppercase
                             hover:text-parchment disabled:opacity-0 transition-colors"
                  >
                    ← Back
                  </button>

                  {/* Step 1 and 2: selecting a card advances automatically */}
                  {wizard.step === 3 && (
                    <button
                      onClick={handleNext}
                      className="font-cinzel text-xs text-gold border border-gold/40 rounded px-4 py-2
                               tracking-widest uppercase hover:border-gold hover:bg-dungeon-mid
                               disabled:opacity-30 transition-colors"
                    >
                      Next → Skills
                    </button>
                  )}
                  {wizard.step === 4 && (
                    <button
                      onClick={() => {
                        if (isSpellcaster) {
                          wizard.loadSpellData();
                          wizard.goToStep(5 as WizardStep);
                        } else {
                          wizard.goToStep(reviewStep);
                        }
                      }}
                      disabled={!canAdvanceFromSkills}
                      className="font-cinzel text-xs text-gold border border-gold/40 rounded px-4 py-2
                               tracking-widest uppercase hover:border-gold hover:bg-dungeon-mid
                               disabled:opacity-30 transition-colors"
                    >
                      Next → {isSpellcaster ? "Spells" : "Review"}
                    </button>
                  )}
                  {spellStep && wizard.step === spellStep && (
                    <button
                      onClick={() => wizard.goToStep(reviewStep)}
                      disabled={!canAdvanceFromSpells}
                      className="font-cinzel text-xs text-gold border border-gold/40 rounded px-4 py-2
                               tracking-widest uppercase hover:border-gold hover:bg-dungeon-mid
                               disabled:opacity-30 transition-colors"
                    >
                      Next → Review
                    </button>
                  )}
                  {(wizard.step === 1 || wizard.step === 2) && (
                    <span className="font-crimson text-[11px] text-parchment/30 italic">
                      {wizard.step === 1
                        ? wizard.selectedRace
                          ? "Race selected — choose your class →"
                          : "Select a race to continue"
                        : wizard.selectedClass
                          ? "Class selected — assign ability scores →"
                          : "Select a class to continue"}
                    </span>
                  )}
                </div>
              )}
          </div>
        )}
      </div>

      {/* Footer note */}
      <p className="mt-6 font-crimson text-[11px] text-parchment/20 italic text-center max-w-sm">
        Your character is saved to the cloud. You can return and continue your
        adventure anytime.
      </p>
    </main>
  );
}
