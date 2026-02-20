"use client";

import { useState, useEffect } from "react";
import { GameState } from "../lib/gameTypes";

interface DebugAction {
  key: string;
  label: string;
  description: string;
}

const ACTIONS: DebugAction[] = [
  {
    key: "force_combat",
    label: "Force Combat",
    description: "Spawn a hostile Goblin into the scene using SRD data.",
  },
  {
    key: "force_level_up",
    label: "Force Level Up",
    description: "Award enough XP to reach the next level instantly.",
  },
];

interface DemigodMenuProps {
  characterId: string;
  isBusy: boolean;
  onResult: (gameState: GameState, message: string) => void;
  onError: (msg: string) => void;
}

export default function DemigodMenu({ characterId, isBusy, onResult, onError }: DemigodMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  async function runAction(actionKey: string) {
    setPending(actionKey);
    try {
      const res = await fetch("/api/debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, action: actionKey }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `Debug action failed (${res.status})`);
      }

      const data = await res.json();
      onResult(data.gameState, data.message);
      setIsOpen(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Debug action failed");
    } finally {
      setPending(null);
    }
  }

  const disabled = isBusy || pending !== null;

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-dungeon-light border-2 border-gold/60 shadow-lg flex items-center justify-center hover:border-gold hover:scale-110 transition-all"
        title="Demigod Menu (Debug)"
      >
        <span className="text-gold text-xl">⚡</span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => !pending && setIsOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg overflow-hidden border-2 border-gold/40 shadow-xl bg-dungeon-light"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="border-b border-gold/30 px-5 py-3 flex items-center justify-between">
              <span className="font-cinzel text-gold text-sm tracking-widest uppercase">
                ⚡ Demigod Menu ⚡
              </span>
              <button
                onClick={() => !pending && setIsOpen(false)}
                className="font-cinzel text-parchment/40 hover:text-parchment text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Actions */}
            <div className="p-5 space-y-3">
              {ACTIONS.map((action) => (
                <button
                  key={action.key}
                  onClick={() => runAction(action.key)}
                  disabled={disabled}
                  className="w-full text-left px-4 py-3 rounded border border-gold/20 bg-dungeon-mid hover:bg-dungeon hover:border-gold/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <div className="font-cinzel text-gold text-sm tracking-wide">
                    {pending === action.key ? "Working…" : action.label}
                  </div>
                  <div className="font-crimson text-parchment/60 text-base mt-1">
                    {action.description}
                  </div>
                </button>
              ))}
            </div>

            {/* Footer note */}
            <div className="border-t border-gold/20 px-5 py-2">
              <p className="font-crimson text-parchment/30 text-xs text-center italic">
                Debug only — hidden in production
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
