"use client";

import type { PendingLevelUp } from "../../lib/gameTypes";
import { toDisplayCase } from "../../lib/gameTypes";

interface Props {
  pending: PendingLevelUp;
  featureChoices: Record<string, string>;
  onSetChoice: (featureName: string, choice: string) => void;
}

/** Parse the comma-separated stored value into an array of selected options. */
function parseSelected(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

interface OptionPickerProps {
  feature: { name: string; description: string; options: string[]; picks?: number };
  selected: string;
  onSetChoice: (value: string) => void;
}

function OptionPicker({ feature, selected, onSetChoice }: OptionPickerProps) {
  const options = feature.options ?? [];
  const picks = feature.picks ?? 1;
  const current = parseSelected(selected);

  function toggle(option: string) {
    if (picks === 1) {
      onSetChoice(option);
      return;
    }
    if (current.includes(option)) {
      onSetChoice(current.filter((o) => o !== option).join(", "));
    } else if (current.length < picks) {
      onSetChoice([...current, option].join(", "));
    }
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-cinzel text-xs text-gold/70 tracking-widest uppercase">
          {picks > 1 ? `Choose ${picks}` : "Choose one"}
        </span>
        {picks > 1 && (
          <span
            className={`font-cinzel text-xs ${
              current.length === picks ? "text-success" : "text-parchment/40"
            }`}
          >
            {current.length} / {picks}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = current.includes(option);
          const atCap = current.length >= picks && !isSelected;
          return (
            <button
              key={option}
              onClick={() => toggle(option)}
              disabled={atCap}
              className={`font-crimson text-base px-3 py-1.5 rounded-lg border transition-all ${
                isSelected
                  ? "border-gold bg-gold/15 text-parchment shadow-gold-glow"
                  : atCap
                  ? "border-gold/10 text-parchment/20 cursor-not-allowed"
                  : "border-gold/25 text-parchment/70 hover:border-gold/50 hover:bg-dungeon"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function LevelUpFeatureChoices({
  pending,
  featureChoices,
  onSetChoice,
}: Props) {
  const allChoiceFeatures = pending.levels.flatMap((l) =>
    l.featureChoices.map((fc) => ({ ...fc, level: l.level })),
  );

  if (allChoiceFeatures.length === 0) return null;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="font-cinzel text-gold text-lg tracking-widest uppercase">
          Feature Choices
        </h2>
        <p className="font-crimson text-parchment/50 italic text-base mt-1">
          Some of your new features require you to make a choice.
        </p>
      </div>

      <div className="space-y-5">
        {allChoiceFeatures.map((f) => (
          <div
            key={`${f.level}-${f.name}`}
            className="bg-dungeon-mid border border-gold/20 rounded p-4 space-y-3"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-cinzel text-base text-parchment tracking-wide">
                  {toDisplayCase(f.name)}
                </span>
                <span className="font-cinzel text-xs text-parchment/30">
                  Level {f.level}
                </span>
              </div>
              {f.description && (
                <p className="font-crimson text-sm text-parchment/50 italic mt-1 leading-snug line-clamp-3">
                  {f.description.replace(/#{1,6}\s*/g, "").split("\n")[0]}
                </p>
              )}
            </div>

            <OptionPicker
              feature={f}
              selected={featureChoices[f.name] ?? ""}
              onSetChoice={(val) => onSetChoice(f.name, val)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
