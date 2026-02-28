"use client";

/**
 * MapEditor — Canvas-based map editor for painting tile collision data,
 * defining semantic regions, and designating placement areas on a 20x20 grid.
 *
 * Three modes:
 *   1. Collision: click/drag cells to toggle wall (1) / floor (0) / door (2)
 *   2. Region: paint cells to assign them to a named region (arbitrary shapes)
 *   3. Placement: paint enemy/player spawn zones used by computeInitialPositions
 */

import { useRef, useState, useCallback, useEffect } from "react";
import type { MapRegion, RegionType, PlacementArea, PlacementAreaType } from "../lib/gameTypes";

// ─── Constants ────────────────────────────────────────────────────────────────

const GRID_SIZE = 20;
const CANVAS_DIM = 700;
const GAP = 1;
const CELL_SIZE = (CANVAS_DIM - (GRID_SIZE - 1) * GAP) / GRID_SIZE;
const CELL_STEP = CELL_SIZE + GAP;

/** Tile types: 0=floor, 1=wall, 2=door, 3=water, 4=indoors. */
type TileType = 0 | 1 | 2 | 3 | 4;

const TILE_COLORS: Record<TileType, string> = {
  0: "rgba(139, 105, 20, 0.15)",  // floor — faint gold
  1: "rgba(60, 40, 20, 0.85)",     // wall — dark brown
  2: "rgba(100, 80, 40, 0.6)",     // door — medium brown
  3: "rgba(30, 100, 200, 0.45)",   // water — blue
  4: "rgba(180, 140, 80, 0.30)",   // indoors — warm interior
};

/** Region type → overlay color for visualization. */
const REGION_COLORS: Record<RegionType, string> = {
  tavern: "rgba(217, 119, 6, 0.25)",
  shop: "rgba(34, 197, 94, 0.25)",
  temple: "rgba(147, 130, 220, 0.25)",
  dungeon: "rgba(120, 80, 50, 0.25)",
  wilderness: "rgba(34, 150, 34, 0.25)",
  residential: "rgba(180, 160, 120, 0.25)",
  street: "rgba(150, 150, 150, 0.25)",
  guard_post: "rgba(200, 50, 50, 0.25)",
  danger: "rgba(239, 68, 68, 0.30)",
  safe: "rgba(59, 130, 246, 0.25)",
  custom: "rgba(200, 200, 200, 0.20)",
};

/** Placement area type → overlay color for visualization. */
const PLACEMENT_COLORS: Record<PlacementAreaType, string> = {
  enemy: "rgba(239, 68, 68, 0.30)",   // red tint for enemy spawn
  player: "rgba(59, 130, 246, 0.30)", // blue tint for player spawn
};

type EditorMode = "collision" | "region" | "placement";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  tileData: number[];
  regions: MapRegion[];
  placementAreas?: PlacementArea[];
  backgroundImageUrl?: string;
  onTileDataChange: (tileData: number[]) => void;
  onRegionsChange: (regions: MapRegion[]) => void;
  onPlacementAreasChange?: (areas: PlacementArea[]) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MapEditor({
  tileData,
  regions,
  placementAreas = [],
  backgroundImageUrl,
  onTileDataChange,
  onRegionsChange,
  onPlacementAreasChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const [mode, setMode] = useState<EditorMode>("collision");
  const [paintTile, setPaintTile] = useState<TileType>(1); // wall by default
  const [isPainting, setIsPainting] = useState(false);

  // Region paint state
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  /** Stroke mode: determined on mouseDown, held through drag. "add" paints cells, "erase" removes them. */
  const [regionStrokeMode, setRegionStrokeMode] = useState<"add" | "erase" | null>(null);
  const [editingRegion, setEditingRegion] = useState<{ name: string; type: RegionType; dmNote: string } | null>(null);
  const [editingRegionId, setEditingRegionId] = useState<string | null>(null); // non-null = editing existing

  // Placement area paint state
  const [activePlacementType, setActivePlacementType] = useState<PlacementAreaType>("enemy");
  const [placementStrokeMode, setPlacementStrokeMode] = useState<"add" | "erase" | null>(null);

  const [bgLoaded, setBgLoaded] = useState(0);

  // Load background image
  useEffect(() => {
    if (!backgroundImageUrl) {
      bgImageRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    // Cache-bust external URLs to avoid stale CDN responses without CORS headers
    const url = backgroundImageUrl.startsWith("http")
      ? `${backgroundImageUrl}${backgroundImageUrl.includes("?") ? "&" : "?"}cb=1`
      : backgroundImageUrl;
    img.src = url;
    img.onload = () => {
      bgImageRef.current = img;
      setBgLoaded((n) => n + 1);
    };
  }, [backgroundImageUrl]);

  // ─── Drawing ──────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_DIM * dpr;
    canvas.height = CANVAS_DIM * dpr;
    canvas.style.width = `${CANVAS_DIM}px`;
    canvas.style.height = `${CANVAS_DIM}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CANVAS_DIM, CANVAS_DIM);

    // Background image
    const bg = bgImageRef.current;
    if (bg && bg.complete && bg.naturalWidth > 0) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.drawImage(bg, 0, 0, CANVAS_DIM, CANVAS_DIM);
      ctx.restore();
    }

    // Tile cells (collision mode only)
    if (mode === "collision") {
      for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
          const idx = row * GRID_SIZE + col;
          const tile = (tileData[idx] ?? 0) as TileType;
          ctx.fillStyle = TILE_COLORS[tile] ?? TILE_COLORS[0];
          ctx.fillRect(col * CELL_STEP, row * CELL_STEP, CELL_SIZE, CELL_SIZE);
        }
      }
    }

    // Region overlays (region mode only) — paint each cell individually
    if (mode === "region") {
      for (const region of regions) {
        if (!region.cells || region.cells.length === 0) continue;
        const isActive = region.id === activeRegionId;
        const color = REGION_COLORS[region.type] ?? REGION_COLORS.custom;
        ctx.fillStyle = color;

        let sumRow = 0;
        let sumCol = 0;
        for (const cellIndex of region.cells) {
          const row = Math.floor(cellIndex / GRID_SIZE);
          const col = cellIndex % GRID_SIZE;
          ctx.fillRect(col * CELL_STEP, row * CELL_STEP, CELL_SIZE, CELL_SIZE);
          sumRow += row;
          sumCol += col;
        }

        // Highlight border on cells of the active (painting) region
        if (isActive) {
          ctx.strokeStyle = "rgba(201, 168, 76, 0.9)";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          for (const cellIndex of region.cells) {
            const row = Math.floor(cellIndex / GRID_SIZE);
            const col = cellIndex % GRID_SIZE;
            ctx.strokeRect(col * CELL_STEP + 1, row * CELL_STEP + 1, CELL_SIZE - 2, CELL_SIZE - 2);
          }
          ctx.setLineDash([]);
        }

        // Region label at centroid
        const centroidRow = sumRow / region.cells.length;
        const centroidCol = sumCol / region.cells.length;
        ctx.save();
        ctx.font = "bold 10px Cinzel, Georgia, serif";
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillText(
          region.name,
          centroidCol * CELL_STEP + CELL_SIZE / 2,
          centroidRow * CELL_STEP + CELL_SIZE / 2,
        );
        ctx.restore();
      }
    }

    // Placement area overlays (placement mode only)
    if (mode === "placement") {
      for (const area of placementAreas) {
        if (!area.cells || area.cells.length === 0) continue;
        const isActive = area.type === activePlacementType;
        const color = PLACEMENT_COLORS[area.type];
        ctx.fillStyle = color;

        let sumRow = 0;
        let sumCol = 0;
        for (const cellIndex of area.cells) {
          const row = Math.floor(cellIndex / GRID_SIZE);
          const col = cellIndex % GRID_SIZE;
          ctx.fillRect(col * CELL_STEP, row * CELL_STEP, CELL_SIZE, CELL_SIZE);
          sumRow += row;
          sumCol += col;
        }

        // Highlight border on cells of the active (painting) area
        if (isActive) {
          ctx.strokeStyle = area.type === "enemy"
            ? "rgba(239, 68, 68, 0.8)"
            : "rgba(59, 130, 246, 0.8)";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          for (const cellIndex of area.cells) {
            const row = Math.floor(cellIndex / GRID_SIZE);
            const col = cellIndex % GRID_SIZE;
            ctx.strokeRect(col * CELL_STEP + 1, row * CELL_STEP + 1, CELL_SIZE - 2, CELL_SIZE - 2);
          }
          ctx.setLineDash([]);
        }

        // Label at centroid
        const centroidRow = sumRow / area.cells.length;
        const centroidCol = sumCol / area.cells.length;
        ctx.save();
        ctx.font = "bold 10px Cinzel, Georgia, serif";
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillText(
          area.type === "enemy" ? "Enemy Spawn" : "Player Spawn",
          centroidCol * CELL_STEP + CELL_SIZE / 2,
          centroidRow * CELL_STEP + CELL_SIZE / 2,
        );
        ctx.restore();
      }
    }

    // Grid border
    ctx.strokeStyle = "rgba(139, 105, 20, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, CANVAS_DIM, CANVAS_DIM);
  }, [mode, tileData, regions, bgLoaded, activeRegionId, placementAreas, activePlacementType]);

  useEffect(() => {
    draw();
  }, [draw]);

  // ─── Mouse handlers ───────────────────────────────────────────────────

  const pixelToCell = (e: React.MouseEvent): { row: number; col: number } | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const col = Math.floor(x / CELL_STEP);
    const row = Math.floor(y / CELL_STEP);
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;
    return { row, col };
  };

  const paintCell = useCallback(
    (row: number, col: number) => {
      const idx = row * GRID_SIZE + col;
      if (tileData[idx] === paintTile) return;
      const newData = [...tileData];
      newData[idx] = paintTile;
      onTileDataChange(newData);
    },
    [tileData, paintTile, onTileDataChange],
  );

  /**
   * Add or remove a cell from the active region.
   * "add" assigns the cell to the active region (removing from any other).
   * "erase" removes the cell from the active region only.
   */
  const paintRegionCell = useCallback(
    (row: number, col: number, stroke: "add" | "erase") => {
      if (!activeRegionId) return;
      const cellIndex = row * GRID_SIZE + col;

      const updatedRegions = regions.map((r) => {
        const cells = r.cells ?? [];
        if (r.id === activeRegionId) {
          if (stroke === "erase") {
            return { ...r, cells: cells.filter((c) => c !== cellIndex) };
          }
          // Add if not already present
          return cells.includes(cellIndex) ? r : { ...r, cells: [...cells, cellIndex] };
        }
        // When adding, remove this cell from any other region (exclusive ownership)
        if (stroke === "add" && cells.includes(cellIndex)) {
          return { ...r, cells: cells.filter((c) => c !== cellIndex) };
        }
        return r;
      });

      onRegionsChange(updatedRegions);
    },
    [activeRegionId, regions, onRegionsChange],
  );

  /**
   * Add or remove a cell from the active placement area.
   * "add" assigns the cell to the active area (removing from the other area).
   * "erase" removes the cell from the active area only.
   */
  const paintPlacementCell = useCallback(
    (row: number, col: number, stroke: "add" | "erase") => {
      if (!onPlacementAreasChange) return;
      const cellIndex = row * GRID_SIZE + col;

      // Ensure both area types exist in the array
      let areas = [...placementAreas];
      if (!areas.find(a => a.type === "enemy")) areas.push({ type: "enemy", cells: [] });
      if (!areas.find(a => a.type === "player")) areas.push({ type: "player", cells: [] });

      const updated = areas.map((a) => {
        const cells = a.cells ?? [];
        if (a.type === activePlacementType) {
          if (stroke === "erase") {
            return { ...a, cells: cells.filter((c) => c !== cellIndex) };
          }
          return cells.includes(cellIndex) ? a : { ...a, cells: [...cells, cellIndex] };
        }
        // When adding, remove this cell from the other area (exclusive ownership)
        if (stroke === "add" && cells.includes(cellIndex)) {
          return { ...a, cells: cells.filter((c) => c !== cellIndex) };
        }
        return a;
      });

      onPlacementAreasChange(updated);
    },
    [activePlacementType, placementAreas, onPlacementAreasChange],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const cell = pixelToCell(e);
      if (!cell) return;

      if (mode === "collision") {
        setIsPainting(true);
        paintCell(cell.row, cell.col);
      } else if (mode === "region" && activeRegionId) {
        // Determine stroke mode: if cell is already in this region, erase; otherwise add
        const cellIndex = cell.row * GRID_SIZE + cell.col;
        const activeRegion = regions.find((r) => r.id === activeRegionId);
        const stroke = (activeRegion?.cells ?? []).includes(cellIndex) ? "erase" : "add";
        setRegionStrokeMode(stroke);
        setIsPainting(true);
        paintRegionCell(cell.row, cell.col, stroke);
      } else if (mode === "placement") {
        const cellIndex = cell.row * GRID_SIZE + cell.col;
        const activeArea = placementAreas.find(a => a.type === activePlacementType);
        const stroke = (activeArea?.cells ?? []).includes(cellIndex) ? "erase" : "add";
        setPlacementStrokeMode(stroke);
        setIsPainting(true);
        paintPlacementCell(cell.row, cell.col, stroke);
      }
    },
    [mode, paintCell, paintRegionCell, activeRegionId, regions, placementAreas, activePlacementType, paintPlacementCell],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const cell = pixelToCell(e);
      if (!cell) return;

      if (mode === "collision" && isPainting) {
        paintCell(cell.row, cell.col);
      } else if (mode === "region" && isPainting && activeRegionId && regionStrokeMode) {
        paintRegionCell(cell.row, cell.col, regionStrokeMode);
      } else if (mode === "placement" && isPainting && placementStrokeMode) {
        paintPlacementCell(cell.row, cell.col, placementStrokeMode);
      }
    },
    [mode, isPainting, paintCell, activeRegionId, regionStrokeMode, paintRegionCell, placementStrokeMode, paintPlacementCell],
  );

  const handleMouseUp = useCallback(() => {
    setIsPainting(false);
    setRegionStrokeMode(null);
    setPlacementStrokeMode(null);
  }, []);

  const saveRegion = useCallback(() => {
    if (!editingRegion?.name) return;

    if (editingRegionId) {
      // Update existing region metadata in-place
      const updated = regions.map((r) =>
        r.id === editingRegionId
          ? {
              ...r,
              name: editingRegion.name,
              type: editingRegion.type,
              ...(editingRegion.dmNote ? { dmNote: editingRegion.dmNote } : { dmNote: undefined }),
            }
          : r,
      );
      onRegionsChange(updated);
    } else {
      // Create new region with empty cells
      const newRegion: MapRegion = {
        id: `region_${editingRegion.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")}_${Date.now()}`,
        name: editingRegion.name,
        type: editingRegion.type,
        cells: [],
        ...(editingRegion.dmNote ? { dmNote: editingRegion.dmNote } : {}),
      };
      onRegionsChange([...regions, newRegion]);
      // Auto-select the new region for painting
      setActiveRegionId(newRegion.id);
    }
    setEditingRegion(null);
    setEditingRegionId(null);
  }, [editingRegion, editingRegionId, regions, onRegionsChange]);

  const startEditRegion = useCallback((region: MapRegion) => {
    setEditingRegionId(region.id);
    setEditingRegion({
      name: region.name,
      type: region.type,
      dmNote: region.dmNote ?? "",
    });
  }, []);

  const deleteRegion = useCallback(
    (id: string) => {
      onRegionsChange(regions.filter((r) => r.id !== id));
      if (activeRegionId === id) setActiveRegionId(null);
    },
    [regions, onRegionsChange, activeRegionId],
  );

  const clearTiles = useCallback(() => {
    onTileDataChange(new Array(GRID_SIZE * GRID_SIZE).fill(0));
  }, [onTileDataChange]);

  return (
    <div className="flex gap-6">
      {/* Canvas */}
      <div className="flex-shrink-0">
        <canvas
          ref={canvasRef}
          style={{ width: CANVAS_DIM, height: CANVAS_DIM, cursor: mode === "collision" || mode === "placement" ? "crosshair" : (activeRegionId ? "cell" : "default") }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => setIsPainting(false)}
        />
      </div>

      {/* Controls panel */}
      <div className="flex-1 min-w-[280px] space-y-4">
        {/* Mode tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode("collision")}
            className={`px-3 py-1.5 font-cinzel text-xs tracking-wide uppercase rounded border transition-colors ${
              mode === "collision"
                ? "bg-gold/20 border-gold/50 text-gold"
                : "border-parchment/20 text-parchment/50 hover:border-gold/30"
            }`}
          >
            Collision
          </button>
          <button
            onClick={() => setMode("region")}
            className={`px-3 py-1.5 font-cinzel text-xs tracking-wide uppercase rounded border transition-colors ${
              mode === "region"
                ? "bg-gold/20 border-gold/50 text-gold"
                : "border-parchment/20 text-parchment/50 hover:border-gold/30"
            }`}
          >
            Regions
          </button>
          <button
            onClick={() => setMode("placement")}
            className={`px-3 py-1.5 font-cinzel text-xs tracking-wide uppercase rounded border transition-colors ${
              mode === "placement"
                ? "bg-gold/20 border-gold/50 text-gold"
                : "border-parchment/20 text-parchment/50 hover:border-gold/30"
            }`}
          >
            Placement
          </button>
        </div>

        {/* Collision controls */}
        {mode === "collision" && (
          <div className="space-y-3">
            <p className="text-parchment/60 font-crimson text-sm">
              Click or drag to paint tiles. Right-click erases (sets to floor).
            </p>
            <div className="flex flex-wrap gap-2">
              {([
                [1, "Wall", "bg-dungeon-mid"],
                [2, "Door", "bg-amber-900/60"],
                [0, "Floor", "bg-gold/10"],
                [3, "Water", "bg-blue-800/40"],
                [4, "Indoors", "bg-amber-700/30"],
              ] as [TileType, string, string][]).map(([tile, label, bg]) => (
                <button
                  key={tile}
                  onClick={() => setPaintTile(tile)}
                  className={`px-3 py-1.5 rounded border font-cinzel text-xs tracking-wide ${
                    paintTile === tile
                      ? "border-gold/60 text-gold"
                      : "border-parchment/20 text-parchment/50"
                  } ${bg}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={clearTiles}
              className="px-3 py-1 rounded border border-red-800/40 text-red-400/70 font-cinzel text-xs hover:border-red-600/60 transition-colors"
            >
              Clear All Tiles
            </button>
          </div>
        )}

        {/* Placement controls */}
        {mode === "placement" && (
          <div className="space-y-3">
            <p className="text-parchment/60 font-crimson text-sm">
              Paint cells where enemies or players can spawn at the start of combat.
            </p>
            <div className="flex gap-2">
              {(["enemy", "player"] as PlacementAreaType[]).map((type) => {
                const area = placementAreas.find(a => a.type === type);
                const cellCount = area?.cells?.length ?? 0;
                return (
                  <button
                    key={type}
                    onClick={() => setActivePlacementType(type)}
                    className={`flex-1 px-3 py-2 rounded border font-cinzel text-xs tracking-wide transition-colors ${
                      activePlacementType === type
                        ? type === "enemy"
                          ? "bg-red-900/30 border-red-500/60 text-red-300"
                          : "bg-blue-900/30 border-blue-500/60 text-blue-300"
                        : "border-parchment/20 text-parchment/50 hover:border-parchment/40"
                    }`}
                  >
                    <div>{type === "enemy" ? "Enemy Spawn" : "Player Spawn"}</div>
                    <div className="text-parchment/40 mt-0.5">{cellCount} cells</div>
                  </button>
                );
              })}
            </div>
            {(placementAreas.some(a => a.cells.length > 0)) && (
              <button
                onClick={() => onPlacementAreasChange?.(placementAreas.map(a =>
                  a.type === activePlacementType ? { ...a, cells: [] } : a
                ))}
                className="px-3 py-1 rounded border border-red-800/40 text-red-400/70 font-cinzel text-xs hover:border-red-600/60 transition-colors"
              >
                Clear {activePlacementType === "enemy" ? "Enemy" : "Player"} Area
              </button>
            )}
          </div>
        )}

        {/* Region controls */}
        {mode === "region" && (
          <div className="space-y-3">
            <p className="text-parchment/60 font-crimson text-sm">
              {activeRegionId
                ? "Click cells to add/remove them from the selected region."
                : "Select a region to paint, or create a new one."}
            </p>

            {/* New Region button */}
            {!editingRegion && (
              <button
                onClick={() => setEditingRegion({ name: "", type: "custom", dmNote: "" })}
                className="px-3 py-1.5 rounded border border-gold/50 text-gold font-cinzel text-xs hover:bg-gold/10 transition-colors"
              >
                + New Region
              </button>
            )}

            {/* Region form (new or editing metadata) */}
            {editingRegion && (
              <div className="space-y-2 border border-gold/30 rounded p-3 bg-dungeon-mid">
                <input
                  type="text"
                  placeholder="Region name..."
                  value={editingRegion.name}
                  onChange={(e) => setEditingRegion({ ...editingRegion, name: e.target.value })}
                  className="w-full bg-dungeon border border-parchment/20 rounded px-2 py-1.5 text-parchment font-crimson text-sm focus:border-gold/50 focus:outline-none"
                />
                <select
                  value={editingRegion.type}
                  onChange={(e) => setEditingRegion({ ...editingRegion, type: e.target.value as RegionType })}
                  className="w-full bg-dungeon border border-parchment/20 rounded px-2 py-1.5 text-parchment font-crimson text-sm focus:border-gold/50 focus:outline-none"
                >
                  {(Object.keys(REGION_COLORS) as RegionType[]).map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                <textarea
                  placeholder="DM note (optional)..."
                  value={editingRegion.dmNote}
                  onChange={(e) => setEditingRegion({ ...editingRegion, dmNote: e.target.value })}
                  className="w-full bg-dungeon border border-parchment/20 rounded px-2 py-1.5 text-parchment font-crimson text-sm focus:border-gold/50 focus:outline-none"
                  rows={2}
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveRegion}
                    disabled={!editingRegion.name}
                    className="px-3 py-1 rounded border border-gold/50 text-gold font-cinzel text-xs hover:bg-gold/10 transition-colors disabled:opacity-30"
                  >
                    {editingRegionId ? "Update" : "Create Region"}
                  </button>
                  <button
                    onClick={() => { setEditingRegion(null); setEditingRegionId(null); }}
                    className="px-3 py-1 rounded border border-parchment/20 text-parchment/50 font-cinzel text-xs hover:border-parchment/40 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Existing regions list */}
            {regions.length > 0 && (
              <div className="space-y-1">
                <h4 className="font-cinzel text-xs text-gold/70 tracking-wide uppercase">
                  Regions
                </h4>
                {regions.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => setActiveRegionId(activeRegionId === r.id ? null : r.id)}
                    className={`flex items-center justify-between gap-2 px-2 py-1 rounded border cursor-pointer transition-colors ${
                      activeRegionId === r.id
                        ? "bg-gold/10 border-gold/40"
                        : "bg-dungeon-mid border-parchment/10 hover:border-parchment/20"
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="text-parchment font-crimson text-sm truncate block">
                        {r.name}
                      </span>
                      <span className="text-parchment/40 font-crimson text-xs">
                        {r.type} — {(r.cells ?? []).length} cells
                      </span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); startEditRegion(r); }}
                        className="text-gold/50 hover:text-gold text-xs"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteRegion(r.id); }}
                        className="text-red-400/50 hover:text-red-400 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
