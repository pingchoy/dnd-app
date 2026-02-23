"use client";

/**
 * MapEditor — Canvas-based map editor for painting tile collision data
 * and defining semantic regions on a 20×20 grid.
 *
 * Four modes:
 *   1. Upload: set background image and feetPerSquare
 *   2. Analyze: send image to AI vision agent for auto-population
 *   3. Collision: click/drag cells to toggle wall (1) / floor (0) / door (2)
 *   4. Region: click+drag rectangles to define named regions
 */

import { useRef, useState, useCallback, useEffect } from "react";
import type { MapRegion, RegionType } from "../lib/gameTypes";

// ─── Constants ────────────────────────────────────────────────────────────────

const GRID_SIZE = 20;
const CANVAS_DIM = 700;
const GAP = 1;
const CELL_SIZE = (CANVAS_DIM - (GRID_SIZE - 1) * GAP) / GRID_SIZE;
const CELL_STEP = CELL_SIZE + GAP;

/** Tile types: 0=floor, 1=wall, 2=door. */
type TileType = 0 | 1 | 2;

const TILE_COLORS: Record<TileType, string> = {
  0: "rgba(139, 105, 20, 0.15)",  // floor — faint gold
  1: "rgba(60, 40, 20, 0.85)",     // wall — dark brown
  2: "rgba(100, 80, 40, 0.6)",     // door — medium brown
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

type EditorMode = "collision" | "region";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  tileData: number[];
  regions: MapRegion[];
  backgroundImageUrl?: string;
  onTileDataChange: (tileData: number[]) => void;
  onRegionsChange: (regions: MapRegion[]) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MapEditor({
  tileData,
  regions,
  backgroundImageUrl,
  onTileDataChange,
  onRegionsChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const [mode, setMode] = useState<EditorMode>("collision");
  const [paintTile, setPaintTile] = useState<TileType>(1); // wall by default
  const [isPainting, setIsPainting] = useState(false);

  // Region drawing state
  const [regionStart, setRegionStart] = useState<{ row: number; col: number } | null>(null);
  const [regionEnd, setRegionEnd] = useState<{ row: number; col: number } | null>(null);
  const [editingRegion, setEditingRegion] = useState<Partial<MapRegion> | null>(null);

  // Load background image
  useEffect(() => {
    if (!backgroundImageUrl) {
      bgImageRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = backgroundImageUrl;
    img.onload = () => {
      bgImageRef.current = img;
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

    // Tile cells
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const idx = row * GRID_SIZE + col;
        const tile = (tileData[idx] ?? 0) as TileType;
        ctx.fillStyle = TILE_COLORS[tile] ?? TILE_COLORS[0];
        ctx.fillRect(col * CELL_STEP, row * CELL_STEP, CELL_SIZE, CELL_SIZE);
      }
    }

    // Region overlays
    for (const region of regions) {
      const color = REGION_COLORS[region.type] ?? REGION_COLORS.custom;
      ctx.fillStyle = color;
      const x = region.bounds.minCol * CELL_STEP;
      const y = region.bounds.minRow * CELL_STEP;
      const w = (region.bounds.maxCol - region.bounds.minCol + 1) * CELL_STEP - GAP;
      const h = (region.bounds.maxRow - region.bounds.minRow + 1) * CELL_STEP - GAP;
      ctx.fillRect(x, y, w, h);

      // Region label
      ctx.save();
      ctx.font = "bold 10px Cinzel, Georgia, serif";
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.textBaseline = "top";
      ctx.fillText(region.name, x + 3, y + 3);
      ctx.restore();
    }

    // Active region selection preview
    if (regionStart && regionEnd) {
      const minRow = Math.min(regionStart.row, regionEnd.row);
      const maxRow = Math.max(regionStart.row, regionEnd.row);
      const minCol = Math.min(regionStart.col, regionEnd.col);
      const maxCol = Math.max(regionStart.col, regionEnd.col);
      ctx.strokeStyle = "rgba(201, 168, 76, 0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      const x = minCol * CELL_STEP;
      const y = minRow * CELL_STEP;
      const w = (maxCol - minCol + 1) * CELL_STEP - GAP;
      const h = (maxRow - minRow + 1) * CELL_STEP - GAP;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }

    // Grid border
    ctx.strokeStyle = "rgba(139, 105, 20, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, CANVAS_DIM, CANVAS_DIM);
  }, [tileData, regions, regionStart, regionEnd]);

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

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const cell = pixelToCell(e);
      if (!cell) return;

      if (mode === "collision") {
        setIsPainting(true);
        paintCell(cell.row, cell.col);
      } else if (mode === "region") {
        setRegionStart(cell);
        setRegionEnd(cell);
      }
    },
    [mode, paintCell],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const cell = pixelToCell(e);
      if (!cell) return;

      if (mode === "collision" && isPainting) {
        paintCell(cell.row, cell.col);
      } else if (mode === "region" && regionStart) {
        setRegionEnd(cell);
      }
    },
    [mode, isPainting, paintCell, regionStart],
  );

  const handleMouseUp = useCallback(() => {
    if (mode === "collision") {
      setIsPainting(false);
    } else if (mode === "region" && regionStart && regionEnd) {
      // Open region form
      setEditingRegion({
        bounds: {
          minRow: Math.min(regionStart.row, regionEnd.row),
          maxRow: Math.max(regionStart.row, regionEnd.row),
          minCol: Math.min(regionStart.col, regionEnd.col),
          maxCol: Math.max(regionStart.col, regionEnd.col),
        },
        type: "custom",
        name: "",
      });
      setRegionStart(null);
      setRegionEnd(null);
    }
  }, [mode, regionStart, regionEnd]);

  const saveRegion = useCallback(() => {
    if (!editingRegion?.name || !editingRegion.bounds) return;
    const newRegion: MapRegion = {
      id: `region_${editingRegion.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")}_${Date.now()}`,
      name: editingRegion.name,
      type: editingRegion.type ?? "custom",
      bounds: editingRegion.bounds as MapRegion["bounds"],
      ...(editingRegion.dmNote ? { dmNote: editingRegion.dmNote } : {}),
    };
    onRegionsChange([...regions, newRegion]);
    setEditingRegion(null);
  }, [editingRegion, regions, onRegionsChange]);

  const deleteRegion = useCallback(
    (id: string) => {
      onRegionsChange(regions.filter((r) => r.id !== id));
    },
    [regions, onRegionsChange],
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
          style={{ width: CANVAS_DIM, height: CANVAS_DIM, cursor: mode === "collision" ? "crosshair" : "cell" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            setIsPainting(false);
            if (mode === "region") {
              setRegionStart(null);
              setRegionEnd(null);
            }
          }}
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
        </div>

        {/* Collision controls */}
        {mode === "collision" && (
          <div className="space-y-3">
            <p className="text-parchment/60 font-crimson text-sm">
              Click or drag to paint tiles. Right-click erases (sets to floor).
            </p>
            <div className="flex gap-2">
              {([
                [1, "Wall", "bg-dungeon-mid"],
                [2, "Door", "bg-amber-900/60"],
                [0, "Floor", "bg-gold/10"],
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

        {/* Region controls */}
        {mode === "region" && (
          <div className="space-y-3">
            <p className="text-parchment/60 font-crimson text-sm">
              Click and drag on the grid to define a rectangular region.
            </p>

            {/* Region form (appears after drawing a rectangle) */}
            {editingRegion && (
              <div className="space-y-2 border border-gold/30 rounded p-3 bg-dungeon-mid">
                <input
                  type="text"
                  placeholder="Region name..."
                  value={editingRegion.name ?? ""}
                  onChange={(e) => setEditingRegion({ ...editingRegion, name: e.target.value })}
                  className="w-full bg-dungeon border border-parchment/20 rounded px-2 py-1.5 text-parchment font-crimson text-sm focus:border-gold/50 focus:outline-none"
                />
                <select
                  value={editingRegion.type ?? "custom"}
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
                  value={editingRegion.dmNote ?? ""}
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
                    Save Region
                  </button>
                  <button
                    onClick={() => setEditingRegion(null)}
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
                    className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-dungeon-mid border border-parchment/10"
                  >
                    <div className="min-w-0">
                      <span className="text-parchment font-crimson text-sm truncate block">
                        {r.name}
                      </span>
                      <span className="text-parchment/40 font-crimson text-xs">
                        {r.type} ({r.bounds.minRow},{r.bounds.minCol})–({r.bounds.maxRow},{r.bounds.maxCol})
                      </span>
                    </div>
                    <button
                      onClick={() => deleteRegion(r.id)}
                      className="text-red-400/50 hover:text-red-400 text-xs flex-shrink-0"
                    >
                      ✕
                    </button>
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
