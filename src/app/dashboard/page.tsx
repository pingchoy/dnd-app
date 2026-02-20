"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Input from "../components/Input";
import ChatCard from "../components/ChatCard";
import DiceRoll from "../components/DiceRoll";
import CharacterSheet from "../components/CharacterSheet";
import CharacterSidebar from "../components/CharacterSidebar";
import DemigodMenu from "../components/DemigodMenu";
import LevelUpWizard from "../components/level-up/LevelUpWizard";
import { OrnateFrame } from "../components/OrnateFrame";
import { useChat } from "../hooks/useChat";
import type { GameState } from "../lib/gameTypes";

interface LoadingIndicatorProps {
  label: string;
}

function LoadingIndicator({ label }: LoadingIndicatorProps) {
  return (
    <div className="flex items-center gap-3 px-6 py-4 mt-2 animate-fade-in">
      <div className="w-8 h-8 rounded-full bg-dungeon-mid border border-gold/40 flex items-center justify-center">
        <span className="text-gold text-xs">✦</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-parchment/50 font-crimson italic text-sm mr-1">
          {label}
        </span>
        <span className="w-1.5 h-1.5 rounded-full bg-gold dot-1" />
        <span className="w-1.5 h-1.5 rounded-full bg-gold dot-2" />
        <span className="w-1.5 h-1.5 rounded-full bg-gold dot-3" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const {
    messages,
    gameState,
    pendingRoll,
    isLoading,
    isRolling,
    isNarrating,
    totalTokens,
    estimatedCostUsd,
    characterId,
    sendMessage,
    confirmRoll,
    applyDebugResult,
  } = useChat();

  const [userInput, setUserInput] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fullSheetOpen, setFullSheetOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingRoll, isRolling, isNarrating]);

  const handleSubmit = async () => {
    const input = userInput.trim();
    if (!input) return;
    setUserInput("");
    await sendMessage(input);
  };

  if (isLoading || !gameState) {
    return (
      <main className="flex items-center justify-center h-screen bg-dungeon">
        <div className="flex flex-col items-center gap-4">
          <span className="font-cinzel text-gold text-3xl animate-pulse">
            ✦
          </span>
          <p className="font-crimson text-parchment/50 italic text-sm">
            Loading your adventure…
          </p>
        </div>
      </main>
    );
  }

  const { player, story } = gameState;
  const pendingLevelUp = player.pendingLevelUp ?? null;
  const isBusy = isRolling || isNarrating || !!pendingRoll;

  function handleLevelUpComplete(newState: GameState) {
    applyDebugResult(newState, `You have reached level ${newState.player.level}!`);
  }

  return (
    <main className="flex flex-col h-screen bg-dungeon bg-stone-texture">
      {/* ── Mobile sheet pop-out ── */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="w-full max-w-sm h-[85vh] rounded-lg overflow-hidden border border-gold-dark/40 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-full flex flex-col">
              <div className="flex-shrink-0 bg-dungeon-light border-b border-gold-dark/40 px-4 py-2 flex items-center justify-between">
                <span className="font-cinzel text-gold text-xs tracking-widest uppercase">
                  ✦ Character Sheet ✦
                </span>
                <button
                  onClick={() => setSheetOpen(false)}
                  className="font-cinzel text-parchment/40 hover:text-parchment text-lg leading-none"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <CharacterSheet player={player} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Desktop full sheet modal ── */}
      {fullSheetOpen && (
        <div
          className="fixed inset-0 z-50 hidden lg:flex items-center justify-center p-8 bg-black/70 backdrop-blur-sm"
          onClick={() => setFullSheetOpen(false)}
        >
          <div
            className="w-full max-w-5xl h-[90vh] rounded-lg overflow-hidden border border-gold-dark/40 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-full flex flex-col">
              <div className="flex-shrink-0 bg-dungeon-light border-b border-gold-dark/40 px-4 py-2 flex items-center justify-between">
                <span className="font-cinzel text-gold text-xs tracking-widest uppercase">
                  ✦ Character Sheet ✦
                </span>
                <button
                  onClick={() => setFullSheetOpen(false)}
                  className="font-cinzel text-parchment/40 hover:text-parchment text-lg leading-none"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <CharacterSheet player={player} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="flex-shrink-0 border-b border-[#3a2a1a] bg-dungeon-light/90 backdrop-blur-sm px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* Left: Characters nav */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => router.push("/characters")}
              className="flex items-center gap-1 font-cinzel text-xs text-parchment/40 tracking-widest uppercase border border-parchment/20 rounded px-3 py-1.5 hover:text-gold hover:border-gold/40 transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="flex-shrink-0">
                <path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Characters
            </button>
          </div>

          {/* Center: Campaign title */}
          <h1 className="font-cinzel text-gold text-sm sm:text-lg tracking-[0.15em] sm:tracking-[0.2em] uppercase leading-none truncate text-center min-w-0">
            ✦ {story.campaignTitle} ✦
          </h1>

          {/* Right: Stats + sheet */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-x-3 text-xs font-cinzel text-parchment/50 tracking-wide">
              <span className="text-parchment/70 hidden md:inline">
                {story.currentLocation}
              </span>
              <span className="text-parchment/30 hidden md:inline">|</span>
              <span>{totalTokens.toLocaleString()} tokens</span>
              <span className="text-gold/50">
                est. ${estimatedCostUsd.toFixed(4)}
              </span>
            </div>
            {/* Mobile sheet button */}
            <button
              onClick={() => setSheetOpen(true)}
              className="lg:hidden font-cinzel text-[10px] tracking-widest text-parchment/40 uppercase border border-parchment/20 rounded px-2 py-1 hover:text-gold hover:border-gold/40 transition-colors"
            >
              Sheet
            </button>
          </div>
        </div>
      </header>

      {/* ── Body: chat + sidebar ── */}
      <div className="flex-1 overflow-hidden flex">
        {/* ── Left: chat area ── */}
        <div className="flex-1 overflow-hidden flex flex-col px-3 sm:px-4 py-4 min-w-0">
          <OrnateFrame className="flex-1 overflow-hidden">
            <div className="tome-container flex-1 overflow-hidden flex flex-col">
              <div className="scroll-pane flex-1 overflow-y-auto px-4 sm:px-6 py-4">
                {messages.map((message, idx) => (
                  <ChatCard
                    key={idx}
                    message={message}
                    playerName={player.name}
                  />
                ))}

                {isRolling && (
                  <LoadingIndicator label="The fates are consulted" />
                )}

                {pendingRoll && (
                  <DiceRoll
                    result={pendingRoll.parsed}
                    onContinue={confirmRoll}
                    isNarrating={isNarrating}
                  />
                )}

                {isNarrating && !pendingRoll && (
                  <LoadingIndicator label="The Dungeon Master weaves the tale" />
                )}

                <div ref={bottomRef} />
              </div>

              {/* Session stats footer */}
              <div className="flex-shrink-0 border-t border-[#3a2a1a] px-4 sm:px-6 py-2 flex items-center justify-end">
                <div className="flex gap-4 text-[11px] font-cinzel text-parchment/30 tracking-wide whitespace-nowrap">
                  <span>{totalTokens.toLocaleString()} tokens</span>
                  <span className="text-parchment/20">|</span>
                  <span className="text-gold/50">
                    est. ${estimatedCostUsd.toFixed(4)}
                  </span>
                </div>
              </div>
            </div>

            <Input
              userInput={userInput}
              setUserInput={setUserInput}
              handleSubmit={handleSubmit}
              disabled={isBusy}
            />
          </OrnateFrame>
        </div>

        {/* ── Right: character sidebar (desktop only) ── */}
        <aside className="hidden lg:flex w-80 flex-shrink-0 overflow-hidden py-4 pr-3">
          <OrnateFrame className="flex-1 overflow-hidden">
            <CharacterSidebar
              player={player}
              onOpenFullSheet={() => setFullSheetOpen(true)}
            />
          </OrnateFrame>
        </aside>
      </div>

      {/* ── Level-up wizard modal ── */}
      {pendingLevelUp && characterId && (
        <LevelUpWizard
          pending={pendingLevelUp}
          player={player}
          characterId={characterId}
          onComplete={handleLevelUpComplete}
        />
      )}

      {/* ── Demigod debug menu (env-gated) ── */}
      {process.env.NEXT_PUBLIC_DEMIGOD_MODE === "true" && characterId && (
        <DemigodMenu
          characterId={characterId}
          isBusy={isBusy}
          onResult={applyDebugResult}
          onError={(msg) =>
            applyDebugResult(gameState, `[DEMIGOD ERROR] ${msg}`)
          }
        />
      )}
    </main>
  );
}
