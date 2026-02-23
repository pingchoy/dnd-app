"use client";

/**
 * ExplorationMapEditor — click-to-place numbered POI markers on an exploration
 * map image. Supports drag-to-reposition, inline editing of POI properties,
 * and a sidebar list of all placed POIs.
 *
 * Coordinates are stored as percentages (0-100) of the image dimensions so
 * they remain correct regardless of display size.
 */

import React, { useState, useCallback, useRef, useMemo } from "react";
import type { CampaignPOISpec } from "../lib/gameTypes";

interface Props {
  imageUrl: string;
  pointsOfInterest: CampaignPOISpec[];
  onPOIsChange: (pois: CampaignPOISpec[]) => void;
}

function ExplorationMapEditor({ imageUrl, pointsOfInterest, onPOIsChange }: Props) {
  const [selectedPOI, setSelectedPOI] = useState<string | null>(null);
  const [editingPOI, setEditingPOI] = useState<CampaignPOISpec | null>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const poiCounter = useRef(pointsOfInterest.length);

  /** Place a new POI at the click position (percentage-based). */
  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging.current) return;
    if (!imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    poiCounter.current += 1;
    const nextNumber = pointsOfInterest.length + 1;
    const newPOI: CampaignPOISpec = {
      id: `poi_${poiCounter.current}`,
      number: nextNumber,
      name: "",
      description: "",
      combatMapSpecId: "",
      isHidden: false,
      actNumbers: [1],
      locationTags: [],
      position: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 },
    };

    onPOIsChange([...pointsOfInterest, newPOI]);
    setSelectedPOI(newPOI.id);
    setEditingPOI(newPOI);
  }, [pointsOfInterest, onPOIsChange]);

  /** Begin drag on a marker — track mouse globally until mouseup. */
  const handleDragPOI = useCallback((poiId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!imageRef.current) return;

    isDragging.current = true;
    const rect = imageRef.current.getBoundingClientRect();

    const handleMove = (me: MouseEvent) => {
      const x = ((me.clientX - rect.left) / rect.width) * 100;
      const y = ((me.clientY - rect.top) / rect.height) * 100;
      const clamped = {
        x: Math.max(0, Math.min(100, Math.round(x * 10) / 10)),
        y: Math.max(0, Math.min(100, Math.round(y * 10) / 10)),
      };
      onPOIsChange(
        pointsOfInterest.map((p) =>
          p.id === poiId ? { ...p, position: clamped } : p,
        ),
      );
    };

    const handleUp = () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      requestAnimationFrame(() => { isDragging.current = false; });
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }, [pointsOfInterest, onPOIsChange]);

  /** Update a single field on the currently-selected POI. */
  const updateEditingPOI = useCallback((field: string, value: unknown) => {
    if (!editingPOI) return;
    const updated = { ...editingPOI, [field]: value };
    setEditingPOI(updated);
    onPOIsChange(
      pointsOfInterest.map((p) => (p.id === updated.id ? updated : p)),
    );
  }, [editingPOI, pointsOfInterest, onPOIsChange]);

  /** Remove a POI and renumber the remaining ones. */
  const deletePOI = useCallback((poiId: string) => {
    const filtered = pointsOfInterest
      .filter((p) => p.id !== poiId)
      .map((p, i) => ({ ...p, number: i + 1 }));
    onPOIsChange(filtered);
    if (selectedPOI === poiId) {
      setSelectedPOI(null);
      setEditingPOI(null);
    }
  }, [pointsOfInterest, selectedPOI, onPOIsChange]);

  return (
    <div className="flex gap-4">
      {/* Map image with POI markers */}
      <div
        ref={imageRef}
        className="relative flex-1 cursor-crosshair"
        onClick={handleImageClick}
      >
        <img src={imageUrl} alt="Exploration map" className="w-full h-auto block rounded-lg" draggable={false} />
        {pointsOfInterest.map((poi) => (
          <button
            key={poi.id}
            className={`absolute w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm
              ${selectedPOI === poi.id ? "bg-amber-500 ring-4 ring-amber-300" : poi.isHidden ? "bg-gray-500" : "bg-indigo-600"}
            `}
            style={{
              left: `${poi.position?.x ?? 50}%`,
              top: `${poi.position?.y ?? 50}%`,
              transform: "translate(-50%, -50%)",
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedPOI(poi.id);
              setEditingPOI(poi);
            }}
            onMouseDown={(e) => handleDragPOI(poi.id, e)}
            title={poi.name || `POI ${poi.number}`}
          >
            {poi.number}
          </button>
        ))}
      </div>

      {/* POI edit form */}
      <div className="w-80 shrink-0 space-y-3">
        <h3 className="font-semibold text-lg text-gray-200">
          {editingPOI ? `Edit POI ${editingPOI.number}` : "Click map to place POI"}
        </h3>
        {editingPOI && (
          <>
            <label className="block">
              <span className="text-sm text-gray-400">Name</span>
              <input
                type="text"
                className="w-full rounded bg-gray-700 px-3 py-2 text-white"
                value={editingPOI.name}
                onChange={(e) => updateEditingPOI("name", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-400">Description (DM-facing)</span>
              <textarea
                className="w-full rounded bg-gray-700 px-3 py-2 text-white h-24"
                value={editingPOI.description}
                onChange={(e) => updateEditingPOI("description", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-400">Combat Map Spec ID</span>
              <input
                type="text"
                className="w-full rounded bg-gray-700 px-3 py-2 text-white"
                value={editingPOI.combatMapSpecId}
                onChange={(e) => updateEditingPOI("combatMapSpecId", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-400">Location Tags (comma-separated)</span>
              <input
                type="text"
                className="w-full rounded bg-gray-700 px-3 py-2 text-white"
                value={editingPOI.locationTags.join(", ")}
                onChange={(e) => updateEditingPOI("locationTags", e.target.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))}
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-400">Act Numbers (comma-separated)</span>
              <input
                type="text"
                className="w-full rounded bg-gray-700 px-3 py-2 text-white"
                value={editingPOI.actNumbers.join(", ")}
                onChange={(e) => updateEditingPOI("actNumbers", e.target.value.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n)))}
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editingPOI.isHidden}
                onChange={(e) => updateEditingPOI("isHidden", e.target.checked)}
              />
              <span className="text-sm text-gray-400">Hidden (revealed later)</span>
            </label>
            <button
              onClick={() => deletePOI(editingPOI.id)}
              className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500"
            >
              Delete POI
            </button>
          </>
        )}

        {/* POI list */}
        <div className="mt-4 space-y-1">
          <h4 className="text-sm font-semibold text-gray-400">All POIs</h4>
          {pointsOfInterest.map((poi) => (
            <button
              key={poi.id}
              onClick={() => { setSelectedPOI(poi.id); setEditingPOI(poi); }}
              className={`block w-full text-left rounded px-2 py-1 text-sm
                ${selectedPOI === poi.id ? "bg-indigo-600 text-white" : "text-gray-300 hover:bg-gray-700"}
                ${poi.isHidden ? "opacity-60 italic" : ""}
              `}
            >
              {poi.number}. {poi.name || "(unnamed)"}
              {poi.isHidden && " [hidden]"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default React.memo(ExplorationMapEditor);
