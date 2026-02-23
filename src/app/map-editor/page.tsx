"use client";

/**
 * Map Editor page — upload map art, run AI analysis, paint collision/regions,
 * and save map documents to Firestore.
 *
 * Workflow: Upload image → AI analysis (optional) → Review/correct → Save.
 */

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MapEditor from "../components/MapEditor";
import type { MapRegion } from "../lib/gameTypes";

const GRID_SIZE = 20;

export default function MapEditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId") ?? "";

  const [mapName, setMapName] = useState("");
  const [feetPerSquare, setFeetPerSquare] = useState(5);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | undefined>();
  const [tileData, setTileData] = useState<number[]>(new Array(GRID_SIZE * GRID_SIZE).fill(0));
  const [regions, setRegions] = useState<MapRegion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisConfidence, setAnalysisConfidence] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Handle image upload — convert to base64 for AI analysis + data URL for preview
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setBackgroundImageUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  }, []);

  // Run AI analysis on the uploaded image
  const handleAnalyze = useCallback(async () => {
    if (!backgroundImageUrl) return;
    setIsAnalyzing(true);
    setError(null);
    setAnalysisConfidence(null);

    try {
      // Extract base64 data and media type from the data URL
      const match = backgroundImageUrl.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) {
        setError("Invalid image format. Please upload a PNG or JPEG.");
        return;
      }
      const mediaType = match[1] as "image/png" | "image/jpeg" | "image/gif" | "image/webp";
      const imageBase64 = match[2];

      const response = await fetch("/api/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "analyze",
          imageBase64,
          mediaType,
          feetPerSquare,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Analysis failed");
      }

      const result = await response.json();
      setTileData(result.tileData);
      setRegions(result.regions);
      setAnalysisConfidence(result.confidence);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  }, [backgroundImageUrl, feetPerSquare]);

  // Save map to Firestore
  const handleSave = useCallback(async () => {
    if (!sessionId || !mapName.trim()) {
      setError("Session ID and map name are required.");
      return;
    }
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          name: mapName.trim().toLowerCase(),
          feetPerSquare,
          tileData,
          regions,
          // backgroundImageUrl is excluded for now — would need Firebase Storage upload
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Save failed");
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }, [sessionId, mapName, feetPerSquare, tileData, regions]);

  return (
    <main className="min-h-screen bg-dungeon bg-stone-texture p-6">
      <div className="max-w-[1200px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="font-cinzel text-gold text-xl tracking-[0.15em] uppercase">
            &#x2726; Map Editor &#x2726;
          </h1>
          <button
            onClick={() => router.back()}
            className="font-cinzel text-xs text-parchment/40 tracking-widest uppercase border border-parchment/20 rounded px-3 py-1.5 hover:text-gold hover:border-gold/40 transition-colors"
          >
            Back
          </button>
        </div>

        {/* Map metadata */}
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <label className="font-cinzel text-xs text-parchment/50 tracking-wide uppercase">
              Map Name
            </label>
            <input
              type="text"
              value={mapName}
              onChange={(e) => setMapName(e.target.value)}
              placeholder="The Rusty Flagon..."
              className="bg-dungeon-mid border border-parchment/20 rounded px-3 py-1.5 text-parchment font-crimson text-sm w-64 focus:border-gold/50 focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="font-cinzel text-xs text-parchment/50 tracking-wide uppercase">
              Feet / Square
            </label>
            <select
              value={feetPerSquare}
              onChange={(e) => setFeetPerSquare(Number(e.target.value))}
              className="bg-dungeon-mid border border-parchment/20 rounded px-3 py-1.5 text-parchment font-crimson text-sm focus:border-gold/50 focus:outline-none"
            >
              <option value={5}>5 ft (detailed)</option>
              <option value={10}>10 ft</option>
              <option value={50}>50 ft (zone)</option>
              <option value={100}>100 ft (overworld)</option>
            </select>
          </div>

          {/* Image upload */}
          <div className="space-y-1">
            <label className="font-cinzel text-xs text-parchment/50 tracking-wide uppercase">
              Background Image
            </label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImageUpload}
              className="text-parchment/50 font-crimson text-sm file:mr-2 file:px-3 file:py-1 file:rounded file:border file:border-parchment/20 file:bg-dungeon-mid file:text-parchment/70 file:font-cinzel file:text-xs file:cursor-pointer"
            />
          </div>

          {/* AI analyze button */}
          {backgroundImageUrl && (
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="px-4 py-1.5 rounded border border-gold/50 text-gold font-cinzel text-xs tracking-wide uppercase hover:bg-gold/10 transition-colors disabled:opacity-50"
            >
              {isAnalyzing ? "Analyzing..." : "AI Analyze"}
            </button>
          )}
        </div>

        {/* Confidence badge */}
        {analysisConfidence && (
          <div className={`inline-block px-3 py-1 rounded font-cinzel text-xs tracking-wide ${
            analysisConfidence === "high" ? "bg-green-900/30 text-green-400 border border-green-800/40" :
            analysisConfidence === "medium" ? "bg-amber-900/30 text-amber-400 border border-amber-800/40" :
            "bg-red-900/30 text-red-400 border border-red-800/40"
          }`}>
            AI Confidence: {analysisConfidence}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="px-4 py-2 rounded border border-red-800/40 bg-red-900/20 text-red-400 font-crimson text-sm">
            {error}
          </div>
        )}

        {/* Map editor canvas + controls */}
        <MapEditor
          tileData={tileData}
          regions={regions}
          backgroundImageUrl={backgroundImageUrl}
          onTileDataChange={setTileData}
          onRegionsChange={setRegions}
        />

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving || !mapName.trim()}
            className="px-6 py-2 rounded border border-gold/50 text-gold font-cinzel text-sm tracking-wide uppercase hover:bg-gold/10 transition-colors disabled:opacity-30"
          >
            {isSaving ? "Saving..." : "Save Map"}
          </button>
          {saveSuccess && (
            <span className="text-green-400 font-crimson text-sm">
              Map saved successfully!
            </span>
          )}
          {!sessionId && (
            <span className="text-amber-400/70 font-crimson text-sm">
              Add ?sessionId=xxx to the URL to save
            </span>
          )}
        </div>
      </div>
    </main>
  );
}
