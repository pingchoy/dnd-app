"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import CharacterSheet from "../components/CharacterSheet";
import CharacterSidebar from "../components/CharacterSidebar";
import DemigodMenu from "../components/DemigodMenu";
import LevelUpWizard from "../components/level-up/LevelUpWizard";
import VictoryScreen from "../components/VictoryScreen";
import CombatGrid, { CombatGridHandle } from "../components/CombatGrid";
import ExplorationTabs from "../components/ExplorationTabs";
import CombatHotbar from "../components/CombatHotbar";
import CombatChatPanel from "../components/CombatChatPanel";
import LastActionToast from "../components/LastActionToast";
import TurnOrderBar from "../components/TurnOrderBar";
import { OrnateFrame } from "../components/OrnateFrame";
import { useChat } from "../hooks/useChat";
import { useCombat } from "../hooks/useCombat";
import { useCombatGrid } from "../hooks/useCombatGrid";
import { useResizablePanel } from "../hooks/useResizablePanel";
import type { GameState, Ability, StoredEncounter, GridPosition, MapDocument, CombatMapDocument } from "../lib/gameTypes";
import { feetDistance, validateAttackRange } from "../lib/combatEnforcement";

/** Regex for attack-like actions in player input. */
const ATTACK_PATTERN =
  /\b(attack|strike|hit|stab|slash|shoot|fire|throw|cast)\b/i;

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
    sessionId,
    sendMessage,
    applyDebugResult,
    appendError,
    setGameState,
    setIsNarrating,
    addTokens,
    addCost,
    explorationPositions,
    activeMap,
    currentPOIId,
    setCurrentPOIId,
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

  const { width: chatWidth, isDragging: isChatResizing, isCollapsed: isChatCollapsed, onMouseDown: onChatResizeMouseDown, restore: restoreChat, collapse: collapseChat } =
    useResizablePanel({ defaultWidth: 600, minWidth: 200, maxWidth: 600, side: "right" });
  const { width: sidebarWidth, isDragging: isSidebarResizing, isCollapsed: isSidebarCollapsed, onMouseDown: onSidebarResizeMouseDown, restore: restoreSidebar, collapse: collapseSidebar } =
    useResizablePanel({ defaultWidth: 288, minWidth: 200, maxWidth: 500, side: "left" });

  const [userInput, setUserInput] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fullSheetOpen, setFullSheetOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [showChatTab, setShowChatTab] = useState(false);
  const [showSidebarTab, setShowSidebarTab] = useState(false);
  const [rangeWarning, setRangeWarning] = useState<string | null>(null);
  const [selectedAbility, setSelectedAbility] = useState<Ability | null>(null);
  const [combatMap, setCombatMap] = useState<CombatMapDocument | null>(null);
  const gridRef = useRef<CombatGridHandle>(null);
  const prevMsgCountRef = useRef(0);

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
    if (messages.length > prevMsgCountRef.current && isChatCollapsed) {
      const newest = messages[messages.length - 1];
      if (newest?.role === "assistant") {
        setHasUnread(true);
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages, isChatCollapsed]);

  // Clear unread when panel opens
  useEffect(() => {
    if (!isChatCollapsed) setHasUnread(false);
  }, [isChatCollapsed]);

  // Delay showing restore tabs until after the collapse transition (300ms)
  useEffect(() => {
    if (isChatCollapsed) {
      const t = setTimeout(() => setShowChatTab(true), 300);
      return () => clearTimeout(t);
    }
    setShowChatTab(false);
  }, [isChatCollapsed]);

  useEffect(() => {
    if (isSidebarCollapsed) {
      const t = setTimeout(() => setShowSidebarTab(true), 300);
      return () => clearTimeout(t);
    }
    setShowSidebarTab(false);
  }, [isSidebarCollapsed]);

  // Combat state is derived from the encounter (NPCs live in encounters, not sessions)
  const activeNPCs = useMemo(() => encounter?.activeNPCs ?? [], [encounter]);
  const companions = useMemo(
    () => activeNPCs.filter(n => n.disposition === "friendly" && n.currentHp > 0),
    [activeNPCs],
  );
  // Victory screen or active processing keep the combat layout visible even if
  // encounter data is momentarily null due to Firestore/HTTP race conditions.
  const inCombat =
    victoryData != null ||
    isCombatProcessing ||
    (encounter != null &&
      activeNPCs.some((n) => n.disposition === "hostile" && n.currentHp > 0));

  // Load the POI's combat map whenever a POI is selected (exploration tabs + combat both use it)
  useEffect(() => {
    if (!sessionId || !currentPOIId || activeMap?.mapType !== "exploration") {
      setCombatMap(null);
      return;
    }
    const poi = activeMap.pointsOfInterest.find((p) => p.id === currentPOIId);
    if (!poi?.combatMapId) {
      setCombatMap(null);
      return;
    }

    // Clear stale map while the new one loads
    setCombatMap(null);

    let cancelled = false;
    fetch(`/api/maps?sessionId=${encodeURIComponent(sessionId)}&mapId=${encodeURIComponent(poi.combatMapId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.map) setCombatMap(data.map);
      })
      .catch((err) => console.error("[Dashboard] Failed to load map for POI:", err));
    return () => { cancelled = true; };
  }, [sessionId, currentPOIId, activeMap]);

  const { positions, moveToken, gridSize } = useCombatGrid(
    activeNPCs,
    inCombat,
    encounter,
    sessionId,
    explorationPositions,
  );

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
    const originType = selectedAbility.aoe.origin === "self" ? "self" as const : "ranged" as const;
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

  const handleOpenChatPanel = useCallback(() => restoreChat(), [restoreChat]);
  const handleCloseChatPanel = useCallback(() => collapseChat(), [collapseChat]);
  const handleToggleChat = useCallback(() => {
    if (isChatCollapsed) restoreChat();
    else collapseChat();
  }, [isChatCollapsed, restoreChat, collapseChat]);

  /** Handle POI click on the exploration map: persist POI to Firestore and tell the DM. */
  const handlePOIClick = useCallback(
    (poiId: string) => {
      if (isBusy) return;
      const poi =
        activeMap?.mapType === "exploration"
          ? activeMap.pointsOfInterest.find((p) => p.id === poiId)
          : undefined;
      setCurrentPOIId(poiId);

      // Persist to Firestore immediately (fire-and-forget)
      if (sessionId) {
        fetch("/api/maps", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, currentPOIId: poiId }),
        }).catch((err) => console.error("[POI] Failed to persist currentPOIId:", err));
      }

      const label = poi ? `area ${poi.number} (${poi.name})` : `area ${poiId}`;
      sendMessage(`I want to go to ${label}`);
    },
    [isBusy, activeMap, setCurrentPOIId, sendMessage, sessionId],
  );

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

      {/* ── Body: always-visible grid + chat sidebar ── */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left panel restore tab — sits flush against page edge */}
        {showChatTab && (
          <div className="flex flex-col items-center justify-start flex-shrink-0 py-4 mr-2">
            <button
              onClick={handleOpenChatPanel}
              className="w-6 h-16 flex items-center justify-center rounded-r
                         border border-l-0 border-gold/30 bg-dungeon-mid/80
                         text-gold/50 hover:text-gold hover:border-gold/50
                         transition-colors cursor-pointer relative"
              title="Show chat"
            >
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                <path d="M2 2L6 7L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {hasUnread && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-gold animate-pulse" />
              )}
            </button>
          </div>
        )}

        {/* ── Left: grid + hotbar (always visible) ── */}
        <div className="flex-1 overflow-hidden flex flex-col py-4 min-w-0">
          {/* Map area with optional left chat panel (combat) */}
          <div className="flex-1 overflow-hidden flex min-h-0 px-3 sm:px-4">
            {/* Left chat panel (always rendered for smooth transitions) */}
            <div
              className="flex-shrink-0 overflow-hidden relative"
              style={{
                width: isChatCollapsed ? 0 : chatWidth,
                paddingRight: isChatCollapsed ? 0 : 12,
                transition: isChatResizing ? "none" : "width 300ms ease-in-out, padding-right 300ms ease-in-out",
              }}
            >
              {/* Resize handle — straddles the content's right edge */}
              {!isChatCollapsed && (
                <div
                  className="resize-handle"
                  style={{ right: 8 }}
                  onMouseDown={onChatResizeMouseDown}
                />
              )}
              <CombatChatPanel
                messages={filteredMessages}
                playerName={player.name}
                isNarrating={isNarrating}
                onClose={handleCloseChatPanel}
                userInput={userInput}
                setUserInput={setUserInput}
                handleSubmit={handleSubmit}
                inputDisabled={isBusy}
              />
            </div>

            {/* Game grid / exploration map — always visible, switches mode */}
            <OrnateFrame className="flex-1 overflow-hidden min-w-0">
              <div className="relative h-full">
                {!inCombat && activeMap?.mapType === "exploration" ? (
                  /* Exploration tabs — world map overview + POI interior map */
                  <ExplorationTabs
                    backgroundImageUrl={activeMap.backgroundImageUrl}
                    pointsOfInterest={activeMap.pointsOfInterest}
                    currentPOIId={currentPOIId}
                    onPOIClick={handlePOIClick}
                    poiMap={combatMap}
                  />
                ) : (
                  /* Tactical grid — combat or grid-based exploration */
                  <CombatGrid
                    ref={gridRef}
                    player={player}
                    activeNPCs={activeNPCs}
                    positions={positions}
                    onMoveToken={moveToken}
                    gridSize={gridSize}
                    mode={inCombat ? "combat" : "exploration"}
                    tileData={combatMap?.tileData ?? (activeMap?.mapType === "combat" ? activeMap.tileData : undefined)}
                    regions={combatMap?.regions ?? (activeMap?.mapType === "combat" ? activeMap.regions : undefined)}
                    mapBackgroundUrl={combatMap?.backgroundImageUrl ?? activeMap?.backgroundImageUrl}
                    feetPerSquare={combatMap?.feetPerSquare ?? (activeMap?.mapType === "combat" ? activeMap.feetPerSquare : undefined)}
                    targetingAbility={inCombat ? selectedAbility : null}
                    onTargetSelected={inCombat ? handleTargetSelected : undefined}
                    onCancel={inCombat ? () => setSelectedAbility(null) : undefined}
                    aoePreview={inCombat ? aoePreview : undefined}
                    onAOEConfirm={inCombat ? handleAOEConfirm : undefined}
                    headerExtra={
                      inCombat && encounter?.turnOrder ? (
                        <TurnOrderBar
                          turnOrder={encounter.turnOrder}
                          currentTurnIndex={encounter.currentTurnIndex ?? 0}
                          activeNPCs={activeNPCs}
                        />
                      ) : undefined
                    }
                    footerExtra={
                      inCombat ? (
                        <CombatHotbar
                          abilities={player.abilities ?? []}
                          selectedAbility={selectedAbility}
                          onSelectAbility={handleSelectAbility}
                          abilityBarDisabled={isBusy}
                          isTargeting={selectedAbility?.requiresTarget === true || !!selectedAbility?.aoe}
                          rangeWarning={rangeWarning}
                        />
                      ) : undefined
                    }
                  />
                )}

                {/* Last action toast — floating on the map canvas when chat is closed */}
                <LastActionToast
                  messages={messages}
                  chatOpen={!isChatCollapsed}
                  onOpenChat={handleOpenChatPanel}
                />
              </div>
            </OrnateFrame>
          </div>

        </div>

        {/* Right sidebar restore tab — shown when collapsed */}
        {showSidebarTab && (
          <div className="hidden lg:flex flex-col items-center justify-start py-4 ml-2 flex-shrink-0">
            <button
              onClick={restoreSidebar}
              className="w-6 h-16 flex items-center justify-center rounded-l
                         border border-r-0 border-gold/30 bg-dungeon-mid/80
                         text-gold/50 hover:text-gold hover:border-gold/50
                         transition-colors cursor-pointer"
              title="Show character sidebar"
            >
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                <path d="M6 2L2 7L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )}

        {/* ── Right: character sidebar (always rendered for smooth transitions) ── */}
        <div
          className="hidden lg:flex flex-col flex-shrink-0 overflow-hidden py-4 relative"
          style={{
            width: isSidebarCollapsed ? 0 : sidebarWidth,
            paddingRight: isSidebarCollapsed ? 0 : 12,
            transition: isSidebarResizing ? "none" : "width 300ms ease-in-out, padding-right 300ms ease-in-out",
          }}
        >
          {/* Resize handle on left edge */}
          {!isSidebarCollapsed && (
            <div
              className="resize-handle resize-handle-left"
              onMouseDown={onSidebarResizeMouseDown}
            />
          )}
          <OrnateFrame className="flex-1 overflow-hidden">
            <CharacterSidebar
              player={player}
              companions={companions}
              onOpenFullSheet={handleOpenFullSheet}
              onClose={collapseSidebar}
            />
          </OrnateFrame>
        </div>
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
