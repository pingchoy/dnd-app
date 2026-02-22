"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SRDArchetype } from "../../hooks/useLevelUp";
import { toDisplayCase } from "../../lib/gameTypes";

const markdownClasses = `prose prose-invert prose-sm max-w-none
  prose-p:my-1 prose-ul:my-1 prose-li:my-0
  prose-strong:text-parchment/70`;

/** Extract the first paragraph from a markdown string (skipping headers). */
function getFirstParagraph(md: string): string {
  const lines = md.split("\n");
  const paragraphLines: string[] = [];
  let started = false;
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip leading headers and blank lines
    if (!started) {
      if (!trimmed || /^#{1,6}\s/.test(trimmed)) continue;
      started = true;
    }
    // Stop at the next blank line or header after we've started
    if (started && (!trimmed || /^#{1,6}\s/.test(trimmed))) break;
    paragraphLines.push(trimmed);
  }
  return paragraphLines.join(" ");
}

interface Props {
  className: string;
  archetypes: SRDArchetype[];
  selectedSubclass: string | null;
  onSelect: (slug: string) => void;
  isLoading: boolean;
}

export default function LevelUpSubclass({
  className,
  archetypes,
  selectedSubclass,
  onSelect,
  isLoading,
}: Props) {
  const [expandedArch, setExpandedArch] = useState<SRDArchetype | null>(null);
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <span className="font-cinzel text-gold text-3xl animate-pulse">&#x2726;</span>
          <p className="font-crimson text-parchment/50 italic text-base">
            Loading archetypes…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="font-cinzel text-gold text-lg tracking-widest uppercase">
          Choose Your Path
        </h2>
        <p className="font-crimson text-parchment/50 italic text-base mt-1">
          Select a {toDisplayCase(className)} archetype to define your abilities.
        </p>
      </div>

      {archetypes.length === 0 && (
        <p className="text-center font-crimson text-parchment/40 italic text-base py-8">
          No archetypes found. SRD data may need to be re-seeded.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {archetypes.map((arch) => {
          const isSelected = selectedSubclass === arch.slug;
          return (
            <button
              key={arch.slug}
              onClick={() => onSelect(arch.slug)}
              className={`text-left p-4 rounded border transition-all duration-150 ${
                isSelected
                  ? "border-gold bg-dungeon-mid shadow-gold-glow"
                  : "border-gold/20 bg-dungeon-mid hover:border-gold/60 hover:bg-dungeon-light"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-cinzel text-sm text-parchment tracking-wide">
                  {toDisplayCase(arch.name)}
                </span>
                {isSelected && (
                  <span className="font-cinzel text-gold text-xs flex-shrink-0">&#x2726;</span>
                )}
              </div>
              {arch.description && (
                <div className={`font-crimson text-parchment/50 mt-2 line-clamp-3 ${markdownClasses}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {getFirstParagraph(arch.description)}
                  </ReactMarkdown>
                </div>
              )}
              {arch.description && (
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedArch(arch);
                  }}
                  className="font-crimson text-sm text-gold/60 italic mt-2 inline-block hover:text-gold transition-colors"
                >
                  See more...
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Full description modal */}
      {expandedArch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setExpandedArch(null)}
        >
          <div
            className="bg-dungeon-mid border border-gold/30 rounded-lg shadow-gold-glow
                       max-w-2xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-5 pt-5 pb-3 border-b border-gold/15">
              <h3 className="font-cinzel text-gold text-base tracking-wide">
                {toDisplayCase(expandedArch.name)}
              </h3>
              <button
                onClick={() => setExpandedArch(null)}
                className="text-parchment/40 hover:text-parchment text-xl leading-none transition-colors"
              >
                &times;
              </button>
            </div>
            <div className={`px-5 py-4 overflow-y-auto font-crimson text-parchment/70 text-base leading-relaxed ${markdownClasses} prose-base`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {expandedArch.description}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
