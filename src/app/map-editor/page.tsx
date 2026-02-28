"use client";

/**
 * Map Editor page — upload map art, run AI analysis, paint collision/regions,
 * and save map documents to Firestore.
 *
 * Workflow: Upload image → AI analysis (optional) → Review/correct → Save.
 */

import { useState, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MapEditor from "../components/MapEditor";
import ExplorationMapEditor from "../components/ExplorationMapEditor";
import { normalizeRegions } from "../lib/gameTypes";
import type { CampaignMap, CampaignPOISpec, MapRegion, PlacementArea } from "../lib/gameTypes";

const GRID_SIZE = 20;

export default function MapEditorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-dungeon" />}>
      <MapEditorContent />
    </Suspense>
  );
}

function MapEditorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId") ?? "";

  const [mapType, setMapType] = useState<"exploration" | "combat">("combat");
  const [mapName, setMapName] = useState("");
  const [feetPerSquare, setFeetPerSquare] = useState(5);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<
    string | undefined
  >();
  const [tileData, setTileData] = useState<number[]>(
    new Array(GRID_SIZE * GRID_SIZE).fill(0),
  );
  const [regions, setRegions] = useState<MapRegion[]>([]);
  const [placementAreas, setPlacementAreas] = useState<PlacementArea[]>([]);
  const [pointsOfInterest, setPointsOfInterest] = useState<CampaignPOISpec[]>(
    [],
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisConfidence, setAnalysisConfidence] = useState<string | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Campaign map loader state
  const [campaignSlugs, setCampaignSlugs] = useState<string[]>([]);
  const [campaignSlug, setCampaignSlug] = useState("");
  const [campaignMaps, setCampaignMaps] = useState<CampaignMap[]>([]);
  const [selectedMapSpecId, setSelectedMapSpecId] = useState("");
  const [isLoadingCampaignMaps, setIsLoadingCampaignMaps] = useState(false);
  const [editingCampaignMap, setEditingCampaignMap] = useState<{
    campaignSlug: string;
    mapSpecId: string;
  } | null>(null);
  const [imagePrompt, setImagePrompt] = useState<string | null>(null);

  // Fetch available campaign slugs on mount
  useEffect(() => {
    fetch("/api/maps?slugs=true")
      .then((r) => r.json())
      .then((data) => {
        setCampaignSlugs(data.slugs || []);
        if (data.slugs?.length > 0) setCampaignSlug(data.slugs[0]);
      })
      .catch(() => {});
  }, []);

  // Handle image upload — convert to base64 for AI analysis + data URL for preview
  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setBackgroundImageUrl(dataUrl);
      };
      reader.readAsDataURL(file);
    },
    [],
  );

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
      const mediaType = match[1] as
        | "image/png"
        | "image/jpeg"
        | "image/gif"
        | "image/webp";
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
      setRegions(normalizeRegions(result.regions));
      setAnalysisConfidence(result.confidence);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  }, [backgroundImageUrl, feetPerSquare]);

  // Fetch campaign map list
  const handleLoadCampaignList = useCallback(async () => {
    if (!campaignSlug.trim()) return;
    setIsLoadingCampaignMaps(true);
    setError(null);
    setCampaignMaps([]);
    setSelectedMapSpecId("");

    try {
      const response = await fetch(
        `/api/maps?campaign=${encodeURIComponent(campaignSlug.trim())}`,
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to load campaign maps");
      }
      const data = await response.json();
      setCampaignMaps(data.maps);
      if (data.maps.length > 0) {
        setSelectedMapSpecId(data.maps[0].mapSpecId);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load campaign maps",
      );
    } finally {
      setIsLoadingCampaignMaps(false);
    }
  }, [campaignSlug]);

  // Load a selected campaign map into the editor, detecting its type automatically
  const handleLoadCampaignMap = useCallback(() => {
    const map = campaignMaps.find((m) => m.mapSpecId === selectedMapSpecId);
    if (!map) return;

    const detectedType = map.mapType ?? "combat";
    setMapType(detectedType);
    setMapName(map.name);
    setFeetPerSquare(map.feetPerSquare ?? 5);
    setBackgroundImageUrl(map.backgroundImageUrl);
    setEditingCampaignMap({
      campaignSlug: map.campaignSlug,
      mapSpecId: map.mapSpecId,
    });
    setImagePrompt(map.imagePrompt ?? null);
    setAnalysisConfidence(null);
    setSaveSuccess(false);
    setError(null);

    if (detectedType === "exploration") {
      // Convert PointOfInterest[] to CampaignPOISpec[] for the editor
      const pois: CampaignPOISpec[] = (map.pointsOfInterest ?? []).map(
        (poi) => ({
          id: poi.id,
          number: poi.number,
          name: poi.name,
          description: poi.description,
          combatMapSpecId: poi.combatMapId,
          isHidden: poi.isHidden,
          actNumbers: poi.actNumbers,
          locationTags: poi.locationTags,
          defaultNPCSlugs: poi.defaultNPCSlugs,
          position: poi.position,
        }),
      );
      setPointsOfInterest(pois);
      setTileData(new Array(GRID_SIZE * GRID_SIZE).fill(0));
      setRegions([]);
    } else {
      setTileData(map.tileData ?? new Array(GRID_SIZE * GRID_SIZE).fill(0));
      setRegions(normalizeRegions(map.regions ?? []));
      setPlacementAreas(map.placementAreas ?? []);
      setPointsOfInterest([]);
    }
  }, [campaignMaps, selectedMapSpecId]);

  // Clear campaign edit mode and reset to fresh state
  const handleClearCampaignEdit = useCallback(() => {
    setEditingCampaignMap(null);
    setImagePrompt(null);
    setMapType("combat");
    setMapName("");
    setFeetPerSquare(5);
    setTileData(new Array(GRID_SIZE * GRID_SIZE).fill(0));
    setRegions([]);
    setPlacementAreas([]);
    setPointsOfInterest([]);
    setBackgroundImageUrl(undefined);
    setAnalysisConfidence(null);
    setSaveSuccess(false);
    setError(null);
  }, []);

  // Save map to Firestore — campaign template or session-scoped
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);

    try {
      let response: Response;

      if (editingCampaignMap) {
        // Save back to campaignMaps/{slug}_{specId}
        const changes =
          mapType === "exploration"
            ? {
                name: mapName.trim().toLowerCase(),
                mapType,
                pointsOfInterest,
                backgroundImageUrl,
              }
            : {
                name: mapName.trim().toLowerCase(),
                mapType,
                feetPerSquare,
                tileData,
                regions,
                placementAreas,
                backgroundImageUrl,
              };
        response = await fetch("/api/maps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update-campaign-map",
            campaignSlug: editingCampaignMap.campaignSlug,
            mapSpecId: editingCampaignMap.mapSpecId,
            changes,
          }),
        });
      } else {
        // Existing session-scoped create
        if (!sessionId || !mapName.trim()) {
          setError("Session ID and map name are required.");
          setIsSaving(false);
          return;
        }
        const payload =
          mapType === "exploration"
            ? {
                sessionId,
                name: mapName.trim().toLowerCase(),
                mapType,
                pointsOfInterest,
                backgroundImageUrl,
              }
            : {
                sessionId,
                name: mapName.trim().toLowerCase(),
                mapType,
                feetPerSquare,
                tileData,
                regions,
                placementAreas,
                backgroundImageUrl,
              };
        response = await fetch("/api/maps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

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
  }, [
    sessionId,
    mapName,
    mapType,
    feetPerSquare,
    tileData,
    regions,
    pointsOfInterest,
    backgroundImageUrl,
    editingCampaignMap,
  ]);

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

        {/* Map type selector */}
        <div className="flex gap-1 border-b border-parchment/10 pb-0">
          <button
            onClick={() => setMapType("combat")}
            className={`px-5 py-2 font-cinzel text-xs tracking-wide uppercase rounded-t transition-colors ${
              mapType === "combat"
                ? "bg-dungeon-mid border border-b-0 border-parchment/20 text-gold"
                : "text-parchment/40 hover:text-parchment/70"
            }`}
          >
            Combat Map
          </button>
          <button
            onClick={() => setMapType("exploration")}
            className={`px-5 py-2 font-cinzel text-xs tracking-wide uppercase rounded-t transition-colors ${
              mapType === "exploration"
                ? "bg-dungeon-mid border border-b-0 border-parchment/20 text-gold"
                : "text-parchment/40 hover:text-parchment/70"
            }`}
          >
            Exploration Map
          </button>
        </div>

        {/* Campaign map loader */}
        <div className="space-y-3 p-4 rounded border border-parchment/10 bg-dungeon-mid/50">
          <h2 className="font-cinzel text-xs text-parchment/50 tracking-wide uppercase">
            Load Campaign Map
          </h2>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="font-cinzel text-xs text-parchment/40 tracking-wide uppercase">
                Campaign
              </label>
              <select
                value={campaignSlug}
                onChange={(e) => setCampaignSlug(e.target.value)}
                className="bg-dungeon border border-parchment/20 rounded px-3 py-1.5 text-parchment font-crimson text-sm focus:border-gold/50 focus:outline-none"
              >
                {campaignSlugs.length === 0 && (
                  <option value="">No campaigns found</option>
                )}
                {campaignSlugs.map((slug) => (
                  <option key={slug} value={slug}>
                    {slug}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleLoadCampaignList}
              disabled={isLoadingCampaignMaps || !campaignSlug}
              className="px-4 py-1.5 rounded border border-parchment/30 text-parchment/70 font-cinzel text-xs tracking-wide uppercase hover:text-gold hover:border-gold/40 transition-colors disabled:opacity-30"
            >
              {isLoadingCampaignMaps ? "Loading..." : "Load List"}
            </button>

            {campaignMaps.length > 0 && (
              <>
                <div className="space-y-1">
                  <label className="font-cinzel text-xs text-parchment/40 tracking-wide uppercase">
                    Select Map
                  </label>
                  <select
                    value={selectedMapSpecId}
                    onChange={(e) => setSelectedMapSpecId(e.target.value)}
                    className="bg-dungeon border border-parchment/20 rounded px-3 py-1.5 text-parchment font-crimson text-sm focus:border-gold/50 focus:outline-none"
                  >
                    {campaignMaps.map((m) => (
                      <option key={m.mapSpecId} value={m.mapSpecId}>
                        {m.name} ({m.mapSpecId})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleLoadCampaignMap}
                  disabled={!selectedMapSpecId}
                  className="px-4 py-1.5 rounded border border-gold/50 text-gold font-cinzel text-xs tracking-wide uppercase hover:bg-gold/10 transition-colors disabled:opacity-30"
                >
                  Load Map
                </button>
              </>
            )}
          </div>

          {/* Editing badge */}
          {editingCampaignMap && (
            <div className="flex items-center gap-2">
              <span className="inline-block px-3 py-1 rounded bg-blue-900/30 text-blue-400 border border-blue-800/40 font-cinzel text-xs tracking-wide">
                Editing: {editingCampaignMap.campaignSlug}/
                {editingCampaignMap.mapSpecId}
              </span>
              <button
                onClick={handleClearCampaignEdit}
                className="text-parchment/40 hover:text-red-400 font-cinzel text-xs tracking-wide uppercase transition-colors"
              >
                Clear
              </button>
            </div>
          )}

          {/* Image generation prompt */}
          {imagePrompt && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-cinzel text-xs text-parchment/40 tracking-wide uppercase">
                  Image Prompt
                </span>
                <button
                  onClick={() => navigator.clipboard.writeText(imagePrompt)}
                  className="text-parchment/30 hover:text-gold font-cinzel text-xs tracking-wide uppercase transition-colors"
                >
                  Copy
                </button>
              </div>
              <p className="text-parchment/60 font-crimson text-base leading-relaxed bg-dungeon/50 border border-parchment/10 rounded px-3 py-2">
                {imagePrompt}
              </p>
            </div>
          )}
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

          {/* Feet per square — combat maps only */}
          {mapType === "combat" && (
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
          )}

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

          {/* AI analyze button — combat maps only */}
          {mapType === "combat" && backgroundImageUrl && (
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="px-4 py-1.5 rounded border border-gold/50 text-gold font-cinzel text-xs tracking-wide uppercase hover:bg-gold/10 transition-colors disabled:opacity-50"
            >
              {isAnalyzing ? "Analyzing..." : "AI Analyze"}
            </button>
          )}
        </div>

        {/* Confidence badge — combat maps only */}
        {mapType === "combat" && analysisConfidence && (
          <div
            className={`inline-block px-3 py-1 rounded font-cinzel text-xs tracking-wide ${
              analysisConfidence === "high"
                ? "bg-green-900/30 text-green-400 border border-green-800/40"
                : analysisConfidence === "medium"
                  ? "bg-amber-900/30 text-amber-400 border border-amber-800/40"
                  : "bg-red-900/30 text-red-400 border border-red-800/40"
            }`}
          >
            AI Confidence: {analysisConfidence}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="px-4 py-2 rounded border border-red-800/40 bg-red-900/20 text-red-400 font-crimson text-sm">
            {error}
          </div>
        )}

        {/* Map editor canvas + controls — swap based on map type */}
        {mapType === "exploration" ? (
          backgroundImageUrl ? (
            <ExplorationMapEditor
              imageUrl={backgroundImageUrl}
              pointsOfInterest={pointsOfInterest}
              onPOIsChange={setPointsOfInterest}
            />
          ) : (
            <div className="rounded border border-dashed border-parchment/20 p-12 text-center text-parchment/40 font-crimson">
              Upload a background image above to start placing POIs
            </div>
          )
        ) : (
          <MapEditor
            tileData={tileData}
            regions={regions}
            placementAreas={placementAreas}
            backgroundImageUrl={backgroundImageUrl}
            onTileDataChange={setTileData}
            onRegionsChange={setRegions}
            onPlacementAreasChange={setPlacementAreas}
          />
        )}

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={
              isSaving ||
              (!editingCampaignMap && (!mapName.trim() || !sessionId))
            }
            className="px-6 py-2 rounded border border-gold/50 text-gold font-cinzel text-sm tracking-wide uppercase hover:bg-gold/10 transition-colors disabled:opacity-30"
          >
            {isSaving ? "Saving..." : "Save Map"}
          </button>
          {saveSuccess && (
            <span className="text-green-400 font-crimson text-sm">
              Map saved successfully!
            </span>
          )}
          {editingCampaignMap ? (
            <span className="text-blue-400/70 font-crimson text-sm">
              Saving to campaignMaps/{editingCampaignMap.campaignSlug}_
              {editingCampaignMap.mapSpecId}
            </span>
          ) : (
            !sessionId && (
              <span className="text-amber-400/70 font-crimson text-sm">
                Add ?sessionId=xxx to the URL to save
              </span>
            )
          )}
        </div>
      </div>
    </main>
  );
}
