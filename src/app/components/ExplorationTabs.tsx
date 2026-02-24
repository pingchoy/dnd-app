"use client";

/**
 * Tabbed wrapper for the exploration view.
 *
 * Tab 1  — "World Map": the exploration overview with POI markers (always visible).
 * Tab 2  — "[POI name]": the interior/scene map for the active POI.
 *          Only appears while the player is at a point of interest
 *          (i.e. currentPOIId is set). At most one POI tab exists at a time.
 *
 * The POI tab auto-activates when a new POI is entered and auto-hides
 * when the player leaves (currentPOIId becomes null).
 */

import React, { useState, useEffect, useMemo } from "react";
import ExplorationMap from "./ExplorationMap";
import POIMapView from "./POIMapView";
import type { PointOfInterest, CombatMapDocument } from "../lib/gameTypes";
import { toDisplayCase } from "../lib/gameTypes";

interface Props {
  backgroundImageUrl: string;
  pointsOfInterest: PointOfInterest[];
  currentPOIId: string | null;
  onPOIClick: (poiId: string) => void;
  /** The combat map linked to the active POI (null while loading or when no POI selected). */
  poiMap: CombatMapDocument | null;
}

type ActiveTab = "world" | "poi";

function ExplorationTabs({
  backgroundImageUrl,
  pointsOfInterest,
  currentPOIId,
  onPOIClick,
  poiMap,
}: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("world");

  const currentPOI = useMemo(
    () => pointsOfInterest.find((p) => p.id === currentPOIId),
    [pointsOfInterest, currentPOIId],
  );

  const hasPOITab = currentPOIId != null;
  const isPoiLoading = currentPOIId != null && poiMap == null;
  const poiImageUrl = poiMap?.backgroundImageUrl ?? "";
  const poiLabel = currentPOI ? toDisplayCase(currentPOI.name) : "Location";

  const visibleCount = useMemo(
    () => pointsOfInterest.filter((p) => !p.isHidden).length,
    [pointsOfInterest],
  );

  // Auto-switch to POI tab when the player enters a POI
  useEffect(() => {
    if (currentPOIId) setActiveTab("poi");
  }, [currentPOIId]);

  // Fall back to world map when POI tab disappears
  useEffect(() => {
    if (!hasPOITab && activeTab === "poi") setActiveTab("world");
  }, [hasPOITab, activeTab]);

  return (
    <div className="flex flex-col h-full">
      {/* ── Tab bar ── */}
      <div className="flex-shrink-0 h-10 flex items-center bg-dungeon-mid border-b border-gold/30 px-1 overflow-x-auto">
        <TabButton
          label="World Map"
          active={activeTab === "world"}
          onClick={() => setActiveTab("world")}
        />
        {hasPOITab && (
          <TabButton
            label={poiLabel}
            active={activeTab === "poi"}
            onClick={() => setActiveTab("poi")}
            showDot={isPoiLoading}
          />
        )}

        {/* Right-aligned location count */}
        <span className="ml-auto pr-3 font-cinzel text-parchment/40 text-[10px] tracking-widest uppercase flex-shrink-0">
          {visibleCount} locations
        </span>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 min-h-0">
        {activeTab === "poi" && hasPOITab ? (
          isPoiLoading ? (
            <div className="flex items-center justify-center h-full bg-[#0d0a08]">
              <span className="font-cinzel text-gold text-2xl animate-pulse">
                &#x2726;
              </span>
            </div>
          ) : (
            <POIMapView
              backgroundImageUrl={poiImageUrl}
              poiName={poiLabel}
            />
          )
        ) : (
          <ExplorationMap
            backgroundImageUrl={backgroundImageUrl}
            pointsOfInterest={pointsOfInterest}
            currentPOIId={currentPOIId}
            onPOIClick={onPOIClick}
            hideHeader
          />
        )}
      </div>
    </div>
  );
}

/* ── Tab button sub-component ── */

interface TabButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  /** Pulsing dot indicator (e.g. while the POI map is loading). */
  showDot?: boolean;
}

function TabButton({ label, active, onClick, showDot }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        px-3 font-cinzel text-xs tracking-[0.15em] uppercase
        transition-colors whitespace-nowrap
        ${active ? "text-gold" : "text-parchment/40 hover:text-parchment/70"}
      `}
    >
      <span className="flex items-center gap-1.5">
        {active && <span className="text-[8px]">&#x2726;</span>}
        {label}
        {showDot && (
          <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
        )}
      </span>
    </button>
  );
}

export default React.memo(ExplorationTabs);
