"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  useCharacterCreation,
  STEP_LABELS,
  type WizardStepId,
} from "../hooks/useCharacterCreation";
import { CornerFlourish } from "./OrnateFrame";
import StepRace from "./StepRace";
import StepClass from "./StepClass";
import StepArchetype from "./StepArchetype";
import StepFeatureChoices from "./StepFeatureChoices";
import StepPointBuy from "./StepPointBuy";
import StepSkills from "./StepSkills";
import StepSpells from "./StepSpells";
import StepReview from "./StepReview";

interface StepIndicatorProps {
  currentIndex: number;
  labels: string[];
}

function StepIndicator({ currentIndex, labels }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      {labels.map((label, i) => {
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={`${label}-${i}`} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center w-6 h-6 rounded-full border font-cinzel text-[10px] leading-none transition-all ${
                isDone
                  ? "border-gold bg-gold text-dungeon"
                  : isCurrent
                    ? "border-gold text-gold"
                    : "border-gold/20 text-parchment/30"
              }`}
            >
              {isDone ? "\u2713" : i + 1}
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
              {label}
            </span>
            {i < labels.length - 1 && (
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

/** Helper to check if all feature choices have been made. */
function allFeaturesChosen(
  choiceFeatures: { name: string; picks?: number }[],
  featureChoices: Record<string, string>,
): boolean {
  return choiceFeatures.every((f) => {
    const val = featureChoices[f.name]?.trim();
    if (!val) return false;
    if (f.picks && f.picks > 1) {
      return val.split(",").map((s) => s.trim()).filter(Boolean).length === f.picks;
    }
    return true;
  });
}

export default function CharacterCreationPage() {
  const router = useRouter();
  const wizard = useCharacterCreation();

  // Load SRD data when the wizard first mounts
  useEffect(() => {
    wizard.loadSRD();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { activeSteps, stepLabels } = wizard;
  const currentIndex = activeSteps.indexOf(wizard.step);

  const canAdvanceFromSkills =
    wizard.selectedSkills.length ===
    (wizard.selectedClass?.skillChoices ?? 0) +
      (wizard.selectedRace?.extraSkillChoices ?? 0);

  // ─── Next button config per step ─────────────────────────────────────────────
  const nextStepId: WizardStepId | undefined = activeSteps[currentIndex + 1];
  const nextLabel = nextStepId ? `Next \u2192 ${STEP_LABELS[nextStepId]}` : "Next";

  function getNextDisabled(): boolean {
    switch (wizard.step) {
      case "race": return !wizard.selectedRace;
      case "class": return !wizard.selectedClass;
      case "archetype": return !wizard.selectedArchetype;
      case "features": return !allFeaturesChosen(wizard.choiceFeatures, wizard.featureChoices);
      case "abilities": return false;
      case "skills": return !canAdvanceFromSkills;
      case "cantrips": return wizard.selectedCantrips.length !== wizard.cantripsToChoose;
      case "spells": return wizard.selectedSpells.length !== wizard.spellsToChoose;
      default: return false;
    }
  }

  function handleNext() {
    switch (wizard.step) {
      case "race":
        wizard.goToStep("class");
        break;
      case "class":
        wizard.advanceFromClass();
        break;
      case "archetype":
        wizard.advanceFromArchetype();
        break;
      case "features":
        wizard.goToStep("abilities");
        break;
      case "abilities":
        wizard.goToStep("skills");
        break;
      case "skills":
        if (wizard.isSpellcaster) {
          wizard.loadSpellData();
        } else {
          wizard.goToStep("review");
        }
        break;
      case "cantrips":
        if (wizard.spellsToChoose > 0) {
          wizard.goToStep("spells");
        } else {
          wizard.goToStep("review");
        }
        break;
      case "spells":
        wizard.goToStep("review");
        break;
    }
  }

  function handleBack() {
    const prevStep = activeSteps[currentIndex - 1];
    if (prevStep) wizard.goToStep(prevStep);
  }

  return (
    <main className="min-h-screen bg-dungeon bg-stone-texture flex flex-col items-center justify-start px-4 py-8">
      {/* Header */}
      <div className="w-full max-w-3xl mb-6">
        <h1 className="font-cinzel text-gold text-center text-xl tracking-[0.2em] uppercase mb-4">
          Create Your Character
        </h1>
        <div className="flex justify-center">
          <StepIndicator
            currentIndex={currentIndex}
            labels={stepLabels}
          />
        </div>
      </div>

      {/* Card — wider on carousel steps (race & class) so the horizontal scroll has room */}
      <div className={`w-full relative ${
        wizard.step === "race" || wizard.step === "class"
          ? "max-w-[90rem]" : "max-w-3xl overflow-hidden"
      }`}>
        {/* Ornate frame */}
        <div className="absolute inset-0 rounded-lg border border-gold-dark/40 pointer-events-none" />
        <div className="absolute inset-[3px] rounded-md border border-gold/10 pointer-events-none" />
        <CornerFlourish className="absolute top-0 left-0 text-gold/40" />
        <CornerFlourish className="absolute top-0 right-0 -scale-x-100 text-gold/40" />
        <CornerFlourish className="absolute bottom-0 left-0 -scale-y-100 text-gold/40" />
        <CornerFlourish className="absolute bottom-0 right-0 -scale-x-100 -scale-y-100 text-gold/40" />

        <div className="bg-dungeon-light rounded-lg shadow-parchment">
          {/* Loading overlay */}
          {wizard.isLoadingSRD && (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <span className="font-cinzel text-gold text-3xl animate-pulse">
                  &#10022;
                </span>
                <p className="font-crimson text-parchment/50 italic text-sm">
                  Consulting the ancient tomes&hellip;
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
              {wizard.step === "race" && (
                <StepRace
                  races={wizard.races}
                  selectedRace={wizard.selectedRace}
                  onSelect={wizard.selectRace}
                />
              )}

              {wizard.step === "class" && (
                <StepClass
                  classes={wizard.classes}
                  selectedClass={wizard.selectedClass}
                  onSelect={wizard.selectClass}
                />
              )}

              {wizard.step === "archetype" && wizard.selectedClass && (
                <StepArchetype
                  selectedClass={wizard.selectedClass}
                  selectedArchetype={wizard.selectedArchetype}
                  onSelect={wizard.selectArchetype}
                />
              )}

              {wizard.step === "features" && (
                <StepFeatureChoices
                  choiceFeatures={wizard.choiceFeatures}
                  featureChoices={wizard.featureChoices}
                  onSetChoice={wizard.setFeatureChoice}
                />
              )}

              {wizard.step === "abilities" && wizard.selectedRace && (
                <StepPointBuy
                  baseStats={wizard.baseStats}
                  finalStats={wizard.finalStats}
                  pointsRemaining={wizard.pointsRemaining}
                  selectedRace={wizard.selectedRace}
                  onAdjust={wizard.adjustStat}
                />
              )}

              {wizard.step === "skills" && wizard.selectedClass && (
                <StepSkills
                  selectedClass={wizard.selectedClass}
                  selectedRace={wizard.selectedRace}
                  selectedSkills={wizard.selectedSkills}
                  onToggle={wizard.toggleSkill}
                />
              )}

              {wizard.step === "cantrips" && (
                <StepSpells
                  title="Choose Your Cantrips"
                  availableCantrips={wizard.availableCantrips}
                  availableSpells={[]}
                  cantripsToChoose={wizard.cantripsToChoose}
                  spellsToChoose={0}
                  selectedCantrips={wizard.selectedCantrips}
                  selectedSpells={[]}
                  onToggleCantrip={wizard.toggleCantrip}
                  onToggleSpell={() => {}}
                  isLoading={wizard.isLoadingSpells}
                />
              )}

              {wizard.step === "spells" && (
                <StepSpells
                  title="Choose Your Spells"
                  availableCantrips={[]}
                  availableSpells={wizard.availableSpells}
                  cantripsToChoose={0}
                  spellsToChoose={wizard.spellsToChoose}
                  selectedCantrips={[]}
                  selectedSpells={wizard.selectedSpells}
                  onToggleCantrip={() => {}}
                  onToggleSpell={wizard.toggleSpell}
                  isLoading={wizard.isLoadingSpells}
                />
              )}

              {wizard.step === "review" &&
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
                        placeholder="Enter your character's name&hellip;"
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

              {/* Generic navigation bar (all steps except review) */}
              {wizard.step !== "review" && (
                <div className="flex justify-between items-center mt-6 pt-4 border-t border-gold/10">
                  {wizard.step === "race" ? (
                    <button
                      onClick={() => router.push("/characters")}
                      className="flex items-center gap-1 font-cinzel text-xs text-parchment/40 tracking-widest uppercase
                               hover:text-parchment transition-colors"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="flex-shrink-0">
                        <path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={handleBack}
                      className="flex items-center gap-1 font-cinzel text-xs text-parchment/40 tracking-widest uppercase
                               hover:text-parchment transition-colors"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="flex-shrink-0">
                        <path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Back
                    </button>
                  )}

                  <button
                    onClick={handleNext}
                    disabled={getNextDisabled()}
                    className="font-cinzel text-xs text-gold border border-gold/40 rounded px-4 py-2
                             tracking-widest uppercase hover:border-gold hover:bg-dungeon-mid
                             disabled:opacity-30 transition-colors"
                  >
                    {nextLabel}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer note */}
      <p className="mt-6 font-crimson text-[11px] text-parchment/20 italic text-center max-w-sm">
        Your character is saved to the cloud. You can return and continue your
        adventure anytime.
      </p>
    </main>
  );
}
