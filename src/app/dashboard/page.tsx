"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Input from "../components/Input";
import ChatCard from "../components/ChatCard";
import CharacterSheet from "../components/CharacterSheet";
import CharacterSidebar from "../components/CharacterSidebar";
import DemigodMenu from "../components/DemigodMenu";
import LevelUpWizard from "../components/level-up/LevelUpWizard";
import VictoryScreen from "../components/VictoryScreen";
import CombatGrid, { CombatGridHandle } from "../components/CombatGrid";
import CombatHotbar from "../components/CombatHotbar";
import CombatChatPanel from "../components/CombatChatPanel";
import LastActionToast from "../components/LastActionToast";
import TurnOrderBar from "../components/TurnOrderBar";
import { OrnateFrame } from "../components/OrnateFrame";
import { useChat } from "../hooks/useChat";
import { useCombat } from "../hooks/useCombat";
import { useCombatGrid } from "../hooks/useCombatGrid";
import type { GameState, Ability, StoredEncounter, AOEData, GridPosition } from "../lib/gameTypes";
import { feetDistance, validateAttackRange } from "../lib/combatEnforcement";

interface LoadingIndicatorProps {
  label: string;
}

/** Regex for attack-like actions in player input. */
const ATTACK_PATTERN =
  /\b(attack|strike|hit|stab|slash|shoot|fire|throw|cast)\b/i;

function LoadingIndicator({ label }: LoadingIndicatorProps) {
  return (
    <div className="flex items-center gap-3 px-6 py-4 mt-2 animate-fade-in">
      <div className="w-8 h-8 rounded-full bg-dungeon-mid border border-gold/40 flex items-center justify-center">
        <span className="text-gold text-xs">&#x2726;</span>
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
  // Ref bridges encounter data from useChat API responses to useCombat's setEncounter.
  // Needed because useChat is called before useCombat (hook ordering), but the
  // callback is only invoked asynchronously from fetch handlers.
  const encounterBridgeRef = useRef<
    ((enc: StoredEncounter | null) => void) | null
  >(null);

  const {
    messages,
    gameState,
    isLoading,
    isNarrating,
    totalTokens,
    estimatedCostUsd,
    characterId,
    sendMessage,
    applyDebugResult,
    appendError,
    setGameState,
    setIsNarrating,
    addTokens,
    addCost,
  } = useChat({ onEncounterData: (enc) => encounterBridgeRef.current?.(enc) });

  const {
    encounter,
    isCombatProcessing,
    executeCombatAction,
    combatLabelRef,
    setEncounter,
    victoryData,
    dismissVictory,
  } = useCombat({
    characterId,
    gameState,
    isNarrating,
    setGameState,
    setIsNarrating,
    addTokens,
    addCost,
    onError: appendError,
  });
  encounterBridgeRef.current = setEncounter;

  const [userInput, setUserInput] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fullSheetOpen, setFullSheetOpen] = useState(false);
  const [combatChatOpen, setCombatChatOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [rangeWarning, setRangeWarning] = useState<string | null>(null);
  const [selectedAbility, setSelectedAbility] = useState<Ability | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<CombatGridHandle>(null);
  const prevMsgCountRef = useRef(0);

  // Re-scroll while a dice roll is animating so the expanding card stays in view
  const lastMsg = messages[messages.length - 1];
  const hasAnimatingRoll = lastMsg?.isNewRoll === true;
  useEffect(() => {
    if (!hasAnimatingRoll) return;
    const id = setInterval(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 400);
    // Animation completes in ~3s (d20 tumble + damage tumble)
    const timeout = setTimeout(() => clearInterval(id), 3500);
    return () => {
      clearInterval(id);
      clearTimeout(timeout);
    };
  }, [hasAnimatingRoll]);

  // Escape key clears targeting mode
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedAbility) {
        setSelectedAbility(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedAbility]);

  // Wire combat label callback to the grid's imperative handle
  useEffect(() => {
    combatLabelRef.current = (tokenId, hit, damage) => {
      gridRef.current?.showCombatResult(tokenId, hit, damage);
    };
    return () => {
      combatLabelRef.current = null;
    };
  }, [combatLabelRef]);

  // Track unread messages when combat chat panel is closed
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current && !combatChatOpen) {
      const newest = messages[messages.length - 1];
      if (newest?.role === "assistant") {
        setHasUnread(true);
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages, combatChatOpen]);

  // Clear unread when panel opens
  useEffect(() => {
    if (combatChatOpen) setHasUnread(false);
  }, [combatChatOpen]);

  // Combat state is derived from the encounter (NPCs live in encounters, not sessions)
  const activeNPCs = useMemo(() => encounter?.activeNPCs ?? [], [encounter]);
  // Victory screen or active processing keep the combat layout visible even if
  // encounter data is momentarily null due to Firestore/HTTP race conditions.
  const inCombat =
    victoryData != null ||
    isCombatProcessing ||
    (encounter != null &&
      activeNPCs.some((n) => n.disposition === "hostile" && n.currentHp > 0));

  const { positions, moveToken, gridSize } = useCombatGrid(
    activeNPCs,
    inCombat,
    encounter,
  );

  // Auto-scroll chat to bottom on new messages or when leaving combat view
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isNarrating, isCombatProcessing, inCombat]);

  const isBusy = isNarrating || isCombatProcessing;

  const handleSubmit = useCallback(async () => {
    const input = userInput.trim();
    if (!input) return;

    // Soft range warning during combat — informational only, doesn't block
    if (inCombat && ATTACK_PATTERN.test(input)) {
      const playerPos = positions.get("player");
      if (playerPos) {
        const hostiles = activeNPCs.filter(
          (n) => n.disposition === "hostile" && n.currentHp > 0,
        );
        if (hostiles.length > 0) {
          let nearest = Infinity;
          for (const npc of hostiles) {
            const npcPos = positions.get(npc.id);
            if (npcPos) {
              nearest = Math.min(nearest, feetDistance(playerPos, npcPos));
            }
          }
          if (nearest > 30) {
            setRangeWarning(
              `Nearest hostile is ${nearest} ft away \u2014 you may be out of range.`,
            );
            // Auto-clear after 4 seconds
            setTimeout(() => setRangeWarning(null), 4000);
          } else {
            setRangeWarning(null);
          }
        }
      }
    } else {
      setRangeWarning(null);
    }

    setUserInput("");
    await sendMessage(input);
  }, [userInput, inCombat, positions, activeNPCs, sendMessage]);

  /** Handle ability bar click: non-targeted abilities execute immediately, targeted ones enter targeting mode. */
  const handleSelectAbility = useCallback(
    (ability: Ability) => {
      if (isBusy) return;
      // AOE spells enter AOE targeting mode (grid shows shape preview)
      if (ability.aoe) {
        setSelectedAbility((prev) => (prev?.id === ability.id ? null : ability));
        return;
      }
      if (!ability.requiresTarget) {
        setSelectedAbility(null);
        executeCombatAction(ability);
        return;
      }
      setSelectedAbility((prev) => (prev?.id === ability.id ? null : ability));
    },
    [isBusy, executeCombatAction],
  );

  /** Derive AOE preview data from the selected ability (if it's an AOE spell). */
  const aoePreview = useMemo(() => {
    if (!selectedAbility?.aoe) return undefined;
    const originType = selectedAbility.range?.type === "self" ? "self" as const : "ranged" as const;
    return {
      shape: selectedAbility.aoe,
      originType,
      rangeFeet: selectedAbility.range?.shortRange,
    };
  }, [selectedAbility]);

  /** Handle AOE confirm: player clicks to place the AOE on the grid. */
  const handleAOEConfirm = useCallback(
    (origin: GridPosition, direction?: GridPosition) => {
      if (!selectedAbility || isBusy) return;
      const ability = selectedAbility;
      setSelectedAbility(null);
      setRangeWarning(null);
      executeCombatAction(ability, undefined, { aoeOrigin: origin, aoeDirection: direction });
    },
    [selectedAbility, isBusy, executeCombatAction],
  );

  /** Handle target click on the combat grid during targeting mode. */
  const handleTargetSelected = useCallback(
    (targetId: string) => {
      if (!selectedAbility || isBusy) return;

      const playerPos = positions.get("player");
      const npcPos = positions.get(targetId);

      if (playerPos && npcPos) {
        const rangeCheck = validateAttackRange(
          playerPos,
          npcPos,
          selectedAbility.range,
        );

        if (!rangeCheck.inRange) {
          setRangeWarning(rangeCheck.reason ?? "Target is out of range");
          setTimeout(() => setRangeWarning(null), 4000);
          return;
        }
      }

      const ability = selectedAbility;
      setSelectedAbility(null);
      setRangeWarning(null);
      executeCombatAction(ability, targetId);
    },
    [selectedAbility, isBusy, positions, executeCombatAction],
  );

  const handleOpenFullSheet = useCallback(() => setFullSheetOpen(true), []);

  const handleOpenChatPanel = useCallback(() => setCombatChatOpen(true), []);
  const handleCloseChatPanel = useCallback(() => setCombatChatOpen(false), []);
  const handleToggleChat = useCallback(() => setCombatChatOpen((o) => !o), []);

  // Memoize filtered messages to avoid creating a new array on every keystroke
  const filteredMessages = useMemo(
    () =>
      messages.filter(
        (m) => !(m.role === "user" && m.content.startsWith("[Combat]")),
      ),
    [messages],
  );

  const handleLevelUpComplete = useCallback(
    (newState: GameState) => {
      applyDebugResult(
        newState,
        `You have reached level ${newState.player.level}!`,
      );
    },
    [applyDebugResult],
  );

  if (isLoading || !gameState) {
    return (
      <main className="flex items-center justify-center h-screen bg-dungeon">
        <div className="flex flex-col items-center gap-4">
          <span className="font-cinzel text-gold text-3xl animate-pulse">
            &#x2726;
          </span>
          <p className="font-crimson text-parchment/50 italic text-sm">
            Loading your adventure&hellip;
          </p>
        </div>
      </main>
    );
  }

  const { player, story } = gameState;
  const pendingLevelUp = player.pendingLevelUp ?? null;

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
                  &#x2726; Character Sheet &#x2726;
                </span>
                <button
                  onClick={() => setSheetOpen(false)}
                  className="font-cinzel text-parchment/40 hover:text-parchment text-lg leading-none"
                >
                  &#x2715;
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
                  &#x2726; Character Sheet &#x2726;
                </span>
                <button
                  onClick={() => setFullSheetOpen(false)}
                  className="font-cinzel text-parchment/40 hover:text-parchment text-lg leading-none"
                >
                  &#x2715;
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
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                className="flex-shrink-0"
              >
                <path
                  d="M6.5 2L3.5 5L6.5 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Characters
            </button>
          </div>

          {/* Center: Campaign title */}
          <h1 className="font-cinzel text-gold text-sm sm:text-lg tracking-[0.15em] sm:tracking-[0.2em] uppercase leading-none truncate text-center min-w-0">
            &#x2726; {story.campaignTitle} &#x2726;
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
        {/* ── Left: chat area (swaps to combat grid when in combat) ── */}
        <div
          className={`flex-1 overflow-hidden flex flex-col py-4 min-w-0 ${inCombat ? "" : "px-3 sm:px-4"}`}
        >
          {inCombat ? (
            /* ── Combat layout: left chat panel + map + hotbar at bottom ── */
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Map area with optional left chat panel */}
              <div className="flex-1 overflow-hidden flex min-h-0 px-3 sm:px-4">
                {/* Left chat panel — map shrinks to accommodate */}
                <CombatChatPanel
                  messages={messages}
                  playerName={player.name}
                  isNarrating={isNarrating}
                  open={combatChatOpen}
                  onClose={handleCloseChatPanel}
                  userInput={userInput}
                  setUserInput={setUserInput}
                  handleSubmit={handleSubmit}
                  inputDisabled={isBusy}
                />

                {/* Combat map canvas — fills remaining space */}
                <OrnateFrame className="flex-1 overflow-hidden min-w-0">
                  <div className="relative h-full">
                    <CombatGrid
                      ref={gridRef}
                      player={player}
                      activeNPCs={activeNPCs}
                      positions={positions}
                      onMoveToken={moveToken}
                      gridSize={gridSize}
                      targetingAbility={selectedAbility}
                      onTargetSelected={handleTargetSelected}
                      onCancel={() => setSelectedAbility(null)}
                      aoePreview={aoePreview}
                      onAOEConfirm={handleAOEConfirm}
                      headerExtra={
                        encounter?.turnOrder ? (
                          <TurnOrderBar
                            turnOrder={encounter.turnOrder}
                            currentTurnIndex={encounter.currentTurnIndex ?? 0}
                            activeNPCs={activeNPCs}
                          />
                        ) : undefined
                      }
                    />

                    {/* Last action toast — floating on the map canvas */}
                    <LastActionToast
                      messages={messages}
                      chatOpen={combatChatOpen}
                      onOpenChat={handleOpenChatPanel}
                    />
                  </div>
                </OrnateFrame>
              </div>

              {/* Bottom hotbar — always visible during combat */}
              <div className="flex-shrink-0 px-3 sm:px-4 pt-3">
                <OrnateFrame className="overflow-hidden">
                  <CombatHotbar
                    abilities={player.abilities ?? []}
                    selectedAbility={selectedAbility}
                    onSelectAbility={handleSelectAbility}
                    abilityBarDisabled={isBusy}
                    chatOpen={combatChatOpen}
                    onToggleChat={handleToggleChat}
                    hasUnread={hasUnread}
                    isTargeting={selectedAbility?.requiresTarget === true || !!selectedAbility?.aoe}
                    rangeWarning={rangeWarning}
                  />
                </OrnateFrame>
              </div>
            </div>
          ) : (
            /* ── Normal chat layout ── */
            <OrnateFrame className="flex-1 overflow-hidden">
              <div className="tome-container flex-1 overflow-hidden flex flex-col">
                <div className="scroll-pane flex-1 overflow-y-auto px-4 sm:px-6 py-4">
                  {filteredMessages.map((message) => (
                    <ChatCard
                      key={message.id}
                      message={message}
                      playerName={player.name}
                    />
                  ))}

                  {isNarrating && (
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
          )}
        </div>

        {/* ── Right: character sidebar (desktop only) ── */}
        <aside className="hidden lg:flex w-80 flex-shrink-0 overflow-hidden py-4 pr-3">
          <OrnateFrame className="flex-1 overflow-hidden">
            <CharacterSidebar
              player={player}
              onOpenFullSheet={handleOpenFullSheet}
            />
          </OrnateFrame>
        </aside>
      </div>

      {/* ── Victory screen modal ── */}
      {victoryData && (
        <VictoryScreen
          victoryData={victoryData}
          player={player}
          onDismiss={dismissVictory}
        />
      )}

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
          onResult={(gs, msg, enc) => {
            applyDebugResult(gs, msg);
            if (enc !== undefined) setEncounter(enc);
          }}
          onError={(msg) =>
            applyDebugResult(gameState, `[DEMIGOD ERROR] ${msg}`)
          }
        />
      )}
    </main>
  );
}
