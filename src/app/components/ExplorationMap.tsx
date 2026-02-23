"use client";

import React, { useState, useCallback } from "react";
import type { PointOfInterest } from "../lib/gameTypes";

interface Props {
  backgroundImageUrl: string;
  pointsOfInterest: PointOfInterest[];
  currentPOIId: string | null;
  onPOIClick: (poiId: string) => void;
}

const MARKER_SIZE = 36;

function ExplorationMap({ backgroundImageUrl, pointsOfInterest, currentPOIId, onPOIClick }: Props) {
  const [hoveredPOI, setHoveredPOI] = useState<string | null>(null);

  const visiblePOIs = pointsOfInterest.filter((poi) => !poi.isHidden);

  const handleClick = useCallback((poiId: string) => {
    onPOIClick(poiId);
  }, [onPOIClick]);

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-gray-900">
      <img
        src={backgroundImageUrl}
        alt="Exploration map"
        className="w-full h-auto block"
        draggable={false}
      />

      {visiblePOIs.map((poi) => {
        const isCurrent = poi.id === currentPOIId;
        const isHovered = poi.id === hoveredPOI;

        return (
          <button
            key={poi.id}
            onClick={() => handleClick(poi.id)}
            onMouseEnter={() => setHoveredPOI(poi.id)}
            onMouseLeave={() => setHoveredPOI(null)}
            className={`
              absolute flex items-center justify-center
              rounded-full font-bold text-white text-sm
              transition-all duration-200 cursor-pointer
              ${isCurrent
                ? "bg-amber-500 ring-4 ring-amber-300 ring-opacity-75 scale-110"
                : "bg-indigo-600 hover:bg-indigo-500 hover:scale-110"
              }
            `}
            style={{
              left: `${poi.position.x}%`,
              top: `${poi.position.y}%`,
              width: MARKER_SIZE,
              height: MARKER_SIZE,
              transform: "translate(-50%, -50%)",
            }}
            title={poi.name}
          >
            {poi.number}

            {isHovered && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-3 py-1 text-sm text-gray-100 shadow-lg pointer-events-none">
                {poi.name}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default React.memo(ExplorationMap);
