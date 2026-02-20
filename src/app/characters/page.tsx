"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CHARACTER_ID_KEY, CHARACTER_IDS_KEY } from "../hooks/useChat";
import type { CharacterSummary } from "../lib/gameTypes";
import CharacterCard from "./CharacterCard";

/**
 * Character Select Page.
 *
 * On mount:
 * 1. Read dnd_character_ids from localStorage (with migration from single ID)
 * 2. Fetch summaries via GET /api/characters?ids=a,b,c
 * 3. Prune stale IDs (any not returned by API) from localStorage
 */
export default function CharacterSelectPage() {
  const router = useRouter();
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /** Read (and migrate) the character ID array from localStorage. */
  const readIds = useCallback((): string[] => {
    const raw = localStorage.getItem(CHARACTER_IDS_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as string[];
      } catch {
        return [];
      }
    }
    // Migration: seed from single active ID if the array doesn't exist yet
    const singleId = localStorage.getItem(CHARACTER_ID_KEY);
    if (singleId) {
      const ids = [singleId];
      localStorage.setItem(CHARACTER_IDS_KEY, JSON.stringify(ids));
      return ids;
    }
    return [];
  }, []);

  /** Fetch summaries and prune stale IDs. */
  useEffect(() => {
    const ids = readIds();
    if (ids.length === 0) {
      setIsLoading(false);
      return;
    }

    fetch(`/api/characters?ids=${ids.join(",")}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { characters: CharacterSummary[] }) => {
        const fetched = data.characters;
        setCharacters(fetched);

        // Prune stale IDs — keep only those the API returned
        const validIds = new Set(fetched.map((c) => c.id));
        const pruned = ids.filter((id) => validIds.has(id));
        localStorage.setItem(CHARACTER_IDS_KEY, JSON.stringify(pruned));
      })
      .catch((err) => {
        console.error("[CharacterSelect] Failed to load characters:", err);
      })
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelect(id: string) {
    localStorage.setItem(CHARACTER_ID_KEY, id);
    // Hard navigation to ensure useChat fully remounts and reads the new character ID
    window.location.href = "/dashboard";
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this character? This cannot be undone.")) return;

    setDeletingId(id);
    try {
      const res = await fetch("/api/characters", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Delete failed");

      // Remove from state
      setCharacters((prev) => prev.filter((c) => c.id !== id));

      // Remove from localStorage
      const ids = readIds().filter((i) => i !== id);
      localStorage.setItem(CHARACTER_IDS_KEY, JSON.stringify(ids));

      // If the active character was deleted, clear it
      if (localStorage.getItem(CHARACTER_ID_KEY) === id) {
        localStorage.removeItem(CHARACTER_ID_KEY);
      }
    } catch (err) {
      console.error("[CharacterSelect] Delete failed:", err);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-dungeon bg-stone-texture flex flex-col items-center justify-start px-4 py-8">
      {/* Header */}
      <div className="w-full max-w-3xl mb-6">
        <h1 className="font-cinzel text-gold text-center text-xl tracking-[0.2em] uppercase">
          ✦ Choose Your Adventurer ✦
        </h1>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <span className="font-cinzel text-gold text-3xl animate-pulse">✦</span>
            <p className="font-crimson text-parchment/50 italic text-sm">
              Gathering your heroes…
            </p>
          </div>
        </div>
      )}

      {/* Character grid */}
      {!isLoading && (
        <div className="w-full max-w-3xl">
          {characters.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-16">
              <span className="font-cinzel text-gold/30 text-5xl mb-4">⚔</span>
              <p className="font-crimson text-parchment/50 text-lg text-center mb-1">
                No adventurers yet.
              </p>
              <p className="font-crimson text-parchment/30 text-sm text-center mb-6">
                Create your first character to begin your journey.
              </p>
              <button
                onClick={() => router.push("/character-creation")}
                className="font-cinzel text-sm text-gold border border-gold/40 rounded px-6 py-3
                           tracking-widest uppercase hover:border-gold hover:bg-dungeon-mid transition-colors"
              >
                Create Character
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {characters.map((c) => (
                  <CharacterCard
                    key={c.id}
                    summary={c}
                    onSelect={() => handleSelect(c.id)}
                    onDelete={() => handleDelete(c.id)}
                    isDeleting={deletingId === c.id}
                  />
                ))}

                {/* New Character card */}
                <button
                  onClick={() => router.push("/character-creation")}
                  className="flex flex-col items-center justify-center gap-2 min-h-[140px]
                             border-2 border-dashed border-gold/20 rounded p-4
                             hover:border-gold/50 hover:bg-dungeon-light/30 transition-all"
                >
                  <span className="font-cinzel text-gold/40 text-2xl leading-none">+</span>
                  <span className="font-cinzel text-parchment/40 text-xs tracking-widest uppercase">
                    New Character
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Footer note */}
      <p className="mt-8 font-crimson text-[11px] text-parchment/20 italic text-center max-w-sm">
        Characters are saved to the cloud. You can return and continue your adventures anytime.
      </p>
    </main>
  );
}
