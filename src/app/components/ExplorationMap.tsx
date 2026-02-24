"use client";

/**
 * Canvas-based exploration map with pan/zoom and clickable POI markers.
 * Renders the background image without gridlines — POI markers are drawn
 * as numbered circles on the canvas with hover tooltips.
 */

import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import type { PointOfInterest } from "../lib/gameTypes";

interface Props {
  backgroundImageUrl: string;
  pointsOfInterest: PointOfInterest[];
  currentPOIId: string | null;
  onPOIClick: (poiId: string) => void;
  /** When true, the built-in header is hidden (used when ExplorationTabs provides its own tab bar). */
  hideHeader?: boolean;
}

const MIN_SCALE = 0.3;
const MAX_SCALE = 4;
const ZOOM_STEP = 0.1;
const MARKER_RADIUS = 18;

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

interface DrawState {
  viewWidth: number;
  viewHeight: number;
  scale: number;
  offset: { x: number; y: number };
  imgWidth: number;
  imgHeight: number;
  hoveredPOI: string | null;
  currentPOIId: string | null;
  pois: PointOfInterest[];
}

function ExplorationMap({
  backgroundImageUrl,
  pointsOfInterest,
  currentPOIId,
  onPOIClick,
  hideHeader = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const bgImageRef = useRef<HTMLImageElement | null>(null);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [viewWidth, setViewWidth] = useState(0);
  const [viewHeight, setViewHeight] = useState(0);
  const [imgWidth, setImgWidth] = useState(0);
  const [imgHeight, setImgHeight] = useState(0);
  const [hoveredPOI, setHoveredPOI] = useState<string | null>(null);
  const [bgLoaded, setBgLoaded] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  const visiblePOIs = useMemo(
    () => pointsOfInterest.filter((poi) => !poi.isHidden),
    [pointsOfInterest],
  );

  const stateRef = useRef<DrawState>({
    viewWidth: 0,
    viewHeight: 0,
    scale: 1,
    offset: { x: 0, y: 0 },
    imgWidth: 0,
    imgHeight: 0,
    hoveredPOI: null,
    currentPOIId: null,
    pois: [],
  });

  useEffect(() => {
    stateRef.current = {
      viewWidth,
      viewHeight,
      scale,
      offset,
      imgWidth,
      imgHeight,
      hoveredPOI,
      currentPOIId,
      pois: visiblePOIs,
    };
  });

  /* ── Load background image ── */
  useEffect(() => {
    if (!backgroundImageUrl) return;
    setBgLoaded(false);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = backgroundImageUrl;
    img.onload = () => {
      bgImageRef.current = img;
      setImgWidth(img.naturalWidth);
      setImgHeight(img.naturalHeight);
      setBgLoaded(true);
    };
  }, [backgroundImageUrl]);

  /* ── Auto-fit image to viewport on first load ── */
  useEffect(() => {
    if (imgWidth <= 0 || imgHeight <= 0 || viewWidth <= 0 || viewHeight <= 0)
      return;
    const fitScale = Math.min(viewWidth / imgWidth, viewHeight / imgHeight, 1);
    const newScale = clampScale(fitScale);
    const centeredOffset = {
      x: (viewWidth - imgWidth * newScale) / 2,
      y: (viewHeight - imgHeight * newScale) / 2,
    };
    setScale(newScale);
    setOffset(centeredOffset);
    stateRef.current.scale = newScale;
    stateRef.current.offset = centeredOffset;
    // Only run once when image dimensions become available
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgWidth > 0 && viewWidth > 0]);

  /* ── ResizeObserver ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setViewWidth(Math.floor(width));
      setViewHeight(Math.floor(height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── RAF draw loop ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw(now: number) {
      const s = stateRef.current;
      const dpr = window.devicePixelRatio || 1;

      const bufW = Math.round(s.viewWidth * dpr);
      const bufH = Math.round(s.viewHeight * dpr);
      if (canvas!.width !== bufW || canvas!.height !== bufH) {
        canvas!.width = bufW;
        canvas!.height = bufH;
      }
      canvas!.style.width = `${s.viewWidth}px`;
      canvas!.style.height = `${s.viewHeight}px`;

      if (s.viewWidth <= 0 || s.viewHeight <= 0) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, s.viewWidth, s.viewHeight);

      // Dark background
      ctx!.fillStyle = "#0d0a08";
      ctx!.fillRect(0, 0, s.viewWidth, s.viewHeight);

      // Blurred backdrop — stretched to fill viewport for an immersive feel
      const bgImg = bgImageRef.current;
      if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
        ctx!.save();
        ctx!.filter = "blur(40px) brightness(0.4) saturate(1.2)";
        ctx!.drawImage(bgImg, -40, -40, s.viewWidth + 80, s.viewHeight + 80);
        ctx!.restore();
      }

      ctx!.save();
      ctx!.translate(s.offset.x, s.offset.y);
      ctx!.scale(s.scale, s.scale);

      // Sharp background image
      if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
        ctx!.drawImage(bgImg, 0, 0, s.imgWidth, s.imgHeight);
      }

      // POI markers
      const markerRadius = MARKER_RADIUS / s.scale;
      const fontSize = Math.max(10, 14 / s.scale);
      const pulse = (Math.sin(((now % 2000) / 2000) * Math.PI * 2) + 1) / 2;

      for (const poi of s.pois) {
        const cx = (poi.position.x / 100) * s.imgWidth;
        const cy = (poi.position.y / 100) * s.imgHeight;
        const isCurrent = poi.id === s.currentPOIId;
        const isHovered = poi.id === s.hoveredPOI;

        // Outer glow — warm ambient halo visible at rest
        ctx!.save();
        ctx!.beginPath();
        ctx!.arc(cx, cy, markerRadius + 3 / s.scale, 0, Math.PI * 2);
        ctx!.shadowColor = isCurrent
          ? "rgba(201, 168, 76, 0.7)"
          : "rgba(139, 105, 20, 0.4)";
        ctx!.shadowBlur = 8 / s.scale;
        ctx!.fillStyle = "transparent";
        ctx!.fill();
        ctx!.restore();

        // Current POI pulsing ring
        if (isCurrent) {
          ctx!.save();
          ctx!.beginPath();
          ctx!.arc(
            cx,
            cy,
            markerRadius + 4 / s.scale + (pulse * 2) / s.scale,
            0,
            Math.PI * 2,
          );
          ctx!.strokeStyle = `rgba(201, 168, 76, ${0.4 + pulse * 0.4})`;
          ctx!.lineWidth = 2.5 / s.scale;
          ctx!.stroke();
          ctx!.restore();
        }

        // Marker circle — dark fill with gold border
        ctx!.beginPath();
        ctx!.arc(cx, cy, markerRadius, 0, Math.PI * 2);
        ctx!.fillStyle = isCurrent
          ? "rgba(139, 105, 20, 0.9)"
          : isHovered
            ? "rgba(26, 20, 16, 0.95)"
            : "rgba(13, 10, 8, 0.85)";
        ctx!.fill();
        ctx!.lineWidth = 1.5 / s.scale;
        ctx!.strokeStyle = isCurrent
          ? "#c9a84c"
          : isHovered
            ? "rgba(201, 168, 76, 0.7)"
            : "rgba(139, 105, 20, 0.5)";
        ctx!.stroke();

        // Number label
        ctx!.shadowColor = "rgba(0, 0, 0, 0.5)";
        ctx!.shadowBlur = 2 / s.scale;
        ctx!.font = `bold ${fontSize}px Cinzel, Georgia, serif`;
        ctx!.textAlign = "center";
        ctx!.textBaseline = "middle";
        ctx!.fillStyle = isCurrent ? "#fef3c7" : "#c9a84c";
        ctx!.fillText(String(poi.number), cx, cy);
        ctx!.shadowColor = "transparent";
        ctx!.shadowBlur = 0;

        // Hover tooltip
        if (isHovered) {
          const tooltipFont = `${Math.max(12, 14 / s.scale)}px Cinzel, Georgia, serif`;
          ctx!.font = tooltipFont;
          const textWidth = ctx!.measureText(poi.name).width;
          const padX = 10 / s.scale;
          const padY = 5 / s.scale;
          const tooltipW = textWidth + padX * 2;
          const tooltipH = fontSize + padY * 2;
          const tooltipX = cx - tooltipW / 2;
          const tooltipY = cy - markerRadius - tooltipH - 8 / s.scale;

          // Tooltip background
          ctx!.fillStyle = "rgba(13, 10, 8, 0.92)";
          ctx!.beginPath();
          ctx!.roundRect(tooltipX, tooltipY, tooltipW, tooltipH, 3 / s.scale);
          ctx!.fill();
          ctx!.strokeStyle = "rgba(139, 105, 20, 0.4)";
          ctx!.lineWidth = 1 / s.scale;
          ctx!.stroke();

          // Tooltip text
          ctx!.fillStyle = "#c9a84c";
          ctx!.textAlign = "center";
          ctx!.textBaseline = "middle";
          ctx!.fillText(poi.name, cx, tooltipY + tooltipH / 2);
        }
      }

      ctx!.restore();
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  /* ── Coordinate helpers ── */

  const viewportToImage = useCallback(
    (vx: number, vy: number) => ({
      x: (vx - offset.x) / scale,
      y: (vy - offset.y) / scale,
    }),
    [scale, offset],
  );

  const hitTestPOI = useCallback(
    (vx: number, vy: number): string | null => {
      if (imgWidth <= 0) return null;
      const img = viewportToImage(vx, vy);
      const r = MARKER_RADIUS / scale;

      for (const poi of visiblePOIs) {
        const cx = (poi.position.x / 100) * imgWidth;
        const cy = (poi.position.y / 100) * imgHeight;
        if (Math.hypot(img.x - cx, img.y - cy) <= r) return poi.id;
      }
      return null;
    },
    [visiblePOIs, imgWidth, imgHeight, scale, viewportToImage],
  );

  const getVP = (e: React.PointerEvent | React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { vx: 0, vy: 0 };
    return { vx: e.clientX - rect.left, vy: e.clientY - rect.top };
  };

  /* ── Pointer events ── */

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const { vx, vy } = getVP(e);

      if (e.button === 0) {
        const hit = hitTestPOI(vx, vy);
        if (hit) {
          onPOIClick(hit);
          return;
        }
        // Pan on empty space
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setIsPanning(true);
        panStart.current = {
          x: e.clientX,
          y: e.clientY,
          offsetX: offset.x,
          offsetY: offset.y,
        };
      } else if (e.button === 1) {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setIsPanning(true);
        panStart.current = {
          x: e.clientX,
          y: e.clientY,
          offsetX: offset.x,
          offsetY: offset.y,
        };
      }
    },
    [offset, hitTestPOI, onPOIClick],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const { vx, vy } = getVP(e);

      if (isPanning) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        const newOffset = {
          x: panStart.current.offsetX + dx,
          y: panStart.current.offsetY + dy,
        };
        stateRef.current.offset = newOffset;
        setOffset(newOffset);
        return;
      }

      const hit = hitTestPOI(vx, vy);
      if (hit !== hoveredPOI) {
        stateRef.current.hoveredPOI = hit;
        setHoveredPOI(hit);
      }
      if (canvasRef.current) {
        canvasRef.current.style.cursor = hit ? "pointer" : "";
      }
    },
    [isPanning, hitTestPOI, hoveredPOI],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning) {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        setIsPanning(false);
      }
    },
    [isPanning],
  );

  /* ── Zoom ── */

  const applyZoom = useCallback(
    (cursorX: number, cursorY: number, direction: number) => {
      const s = stateRef.current;
      const newScale = clampScale(
        s.scale * (direction > 0 ? 1 + ZOOM_STEP : 1 - ZOOM_STEP),
      );
      if (newScale === s.scale) return;
      const ratio = newScale / s.scale;

      const newOffset = {
        x: cursorX - (cursorX - s.offset.x) * ratio,
        y: cursorY - (cursorY - s.offset.y) * ratio,
      };

      stateRef.current.scale = newScale;
      stateRef.current.offset = newOffset;
      setScale(newScale);
      setOffset(newOffset);
    },
    [],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      applyZoom(
        e.clientX - rect.left,
        e.clientY - rect.top,
        e.deltaY < 0 ? 1 : -1,
      );
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyZoom]);

  const zoomIn = useCallback(() => {
    const s = stateRef.current;
    applyZoom(s.viewWidth / 2, s.viewHeight / 2, 1);
  }, [applyZoom]);

  const zoomOut = useCallback(() => {
    const s = stateRef.current;
    applyZoom(s.viewWidth / 2, s.viewHeight / 2, -1);
  }, [applyZoom]);

  const resetView = useCallback(() => {
    if (imgWidth <= 0 || imgHeight <= 0 || viewWidth <= 0 || viewHeight <= 0)
      return;
    const fitScale = clampScale(
      Math.min(viewWidth / imgWidth, viewHeight / imgHeight, 1),
    );
    const centeredOffset = {
      x: (viewWidth - imgWidth * fitScale) / 2,
      y: (viewHeight - imgHeight * fitScale) / 2,
    };
    stateRef.current.scale = fitScale;
    stateRef.current.offset = centeredOffset;
    setScale(fitScale);
    setOffset(centeredOffset);
  }, [imgWidth, imgHeight, viewWidth, viewHeight]);

  return (
    <div className="flex flex-col h-full">
      {/* Header — hidden when ExplorationTabs provides the tab bar */}
      {!hideHeader && (
        <div className="flex-shrink-0 bg-dungeon-mid border-b border-gold/30 px-4 py-1.5 flex items-center justify-between">
          <span className="font-cinzel text-gold text-xs tracking-[0.2em] uppercase">
            ✦ Exploration Map ✦
          </span>
          <span className="font-cinzel text-parchment/40 text-[10px] tracking-widest uppercase">
            {visiblePOIs.length} locations
          </span>
        </div>
      )}

      {/* Canvas area */}
      <div className="flex-1 min-h-0 relative">
        {/* Zoom controls */}
        <div className="combat-zoom-controls">
          <button onClick={zoomIn} title="Zoom in">
            +
          </button>
          <button onClick={zoomOut} title="Zoom out">
            −
          </button>
          <button
            onClick={resetView}
            title="Reset view"
            style={{ fontSize: 11 }}
          >
            ⟲
          </button>
        </div>

        <div
          ref={containerRef}
          className="combat-grid-viewport"
          onDoubleClick={resetView}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        </div>

        {/* Loading overlay — visible while the background image downloads */}
        {!bgLoaded && backgroundImageUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 pointer-events-none">
            <span className="font-cinzel text-gold/80 text-2xl animate-pulse">
              &#x2726;
            </span>
            <div className="w-48 h-[2px] rounded-full bg-gold/10 overflow-hidden">
              <div className="w-1/3 h-full bg-gold/50 rounded-full animate-loading-shimmer" />
            </div>
            <span className="font-cinzel text-parchment/30 text-[11px] tracking-widest uppercase">
              Loading map&hellip;
            </span>
          </div>
        )}
      </div>

      {/* Legend bar — visible POIs */}
      <div className="flex-shrink-0 border-t border-gold/20 px-3 py-1.5 flex flex-wrap gap-x-3 gap-y-1 overflow-x-auto">
        {visiblePOIs.map((poi) => (
          <button
            key={poi.id}
            onClick={() => onPOIClick(poi.id)}
            className={`flex items-center gap-1.5 font-cinzel text-[10px] tracking-wide whitespace-nowrap transition-colors ${
              poi.id === currentPOIId
                ? "text-gold"
                : "text-parchment/40 hover:text-gold/70"
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border ${
                poi.id === currentPOIId
                  ? "bg-gold/20 border-gold/60 text-gold"
                  : "bg-dungeon border-gold/30 text-gold/70"
              }`}
            >
              {poi.number}
            </span>
            {poi.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default React.memo(ExplorationMap);
