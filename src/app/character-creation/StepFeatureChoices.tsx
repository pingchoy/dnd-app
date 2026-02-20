"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChoiceFeature } from "../hooks/useCharacterCreation";
import { toDisplayCase } from "../lib/gameTypes";

interface Props {
  choiceFeatures: ChoiceFeature[];
  featureChoices: Record<string, string>;
  onSetChoice: (featureName: string, choice: string) => void;
}

const markdownClasses = `prose prose-invert prose-sm max-w-none
  prose-p:my-1 prose-ul:my-1 prose-li:my-0
  prose-strong:text-parchment/70`;

/** Parse the comma-separated stored value into an array of selected options. */
function parseSelected(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

interface OptionPickerProps {
  feature: ChoiceFeature;
  selected: string;
  onSetChoice: (value: string) => void;
}

function OptionPicker({ feature, selected, onSetChoice }: OptionPickerProps) {
  const options = feature.options ?? [];
  const picks = feature.picks ?? 1;
  const current = parseSelected(selected);

  function toggle(option: string) {
    if (picks === 1) {
      // Single-select: toggle — clicking the same option deselects it
      onSetChoice(current.includes(option) ? "" : option);
      return;
    }
    // Multi-select
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

export default function StepFeatureChoices({
  choiceFeatures,
  featureChoices,
  onSetChoice,
}: Props) {
  const [expandedFeature, setExpandedFeature] = useState<ChoiceFeature | null>(null);

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="font-cinzel text-gold text-lg tracking-widest uppercase">
          Feature Choices
        </h2>
        <p className="font-crimson text-parchment/50 italic text-base mt-1">
          Some of your class features require you to make a choice.
        </p>
      </div>

      <div className="space-y-5">
        {choiceFeatures.map((f) => (
          <div
            key={f.name}
            className="bg-dungeon-mid border border-gold/20 rounded p-4 space-y-3"
          >
            <div>
              <div className="font-cinzel text-base text-parchment tracking-wide">
                {toDisplayCase(f.name)}
              </div>
              {f.description && (
                <>
                  <div className={`font-crimson text-parchment/50 italic text-sm mt-1 leading-snug line-clamp-3 ${markdownClasses}`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {f.description}
                    </ReactMarkdown>
                  </div>
                  <button
                    onClick={() => setExpandedFeature(f)}
                    className="font-crimson text-sm text-gold/60 italic mt-1 hover:text-gold transition-colors"
                  >
                    Read more...
                  </button>
                </>
              )}
            </div>

            {f.options && f.options.length > 0 ? (
              <OptionPicker
                feature={f}
                selected={featureChoices[f.name] ?? ""}
                onSetChoice={(val) => onSetChoice(f.name, val)}
              />
            ) : (
              <div>
                <label className="font-cinzel text-xs text-gold/70 tracking-widest uppercase block mb-1.5">
                  Your choice
                </label>
                <input
                  type="text"
                  value={featureChoices[f.name] ?? ""}
                  onChange={(e) => onSetChoice(f.name, e.target.value)}
                  placeholder="Enter your choice…"
                  className="w-full bg-dungeon border border-gold/30 rounded px-3 py-2
                             font-crimson text-base text-parchment placeholder-parchment/20
                             focus:outline-none focus:border-gold/70 focus:ring-1 focus:ring-gold/30
                             transition-colors"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Full description modal */}
      {expandedFeature && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setExpandedFeature(null)}
        >
          <div
            className="bg-dungeon-mid border border-gold/30 rounded-lg shadow-gold-glow
                       max-w-2xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-5 pt-5 pb-3 border-b border-gold/15">
              <h3 className="font-cinzel text-gold text-base tracking-wide">
                {toDisplayCase(expandedFeature.name)}
              </h3>
              <button
                onClick={() => setExpandedFeature(null)}
                className="text-parchment/40 hover:text-parchment text-xl leading-none transition-colors"
              >
                &times;
              </button>
            </div>
            <div className={`px-5 py-4 overflow-y-auto font-crimson text-parchment/70 text-base leading-relaxed ${markdownClasses} prose-base`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {expandedFeature.description}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
