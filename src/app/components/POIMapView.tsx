"use client";

/**
 * Image viewer for a Point of Interest's map.
 * Displays the POI's background image with pan/zoom controls,
 * matching the ExplorationMap's interaction model (wheel zoom, pointer drag).
 */

import React, { useRef, useState, useCallback, useEffect } from "react";

interface Props {
  backgroundImageUrl: string;
  poiName: string;
}

const MIN_SCALE = 0.3;
const MAX_SCALE = 4;

interface ViewState {
  scale: number;
  ox: number;
  oy: number;
}

function POIMapView({ backgroundImageUrl, poiName }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const viewRef = useRef<ViewState>({ scale: 1, ox: 0, oy: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const [, rerender] = useState(0);

  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);

  /* ── Observe container size ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── Auto-fit image to container ── */
  const resetView = useCallback(() => {
    const { w: iw, h: ih } = imgNatural;
    const { w: cw, h: ch } = containerSize;
    if (iw <= 0 || cw <= 0) return;

    const fit = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, Math.min(cw / iw, ch / ih, 1)),
    );
    viewRef.current = {
      scale: fit,
      ox: (cw - iw * fit) / 2,
      oy: (ch - ih * fit) / 2,
    };
    rerender((n) => n + 1);
  }, [imgNatural, containerSize]);

  useEffect(() => {
    resetView();
  }, [resetView]);

  const handleImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (img) {
      setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
      setImageLoaded(true);
    }
  }, []);

  /* ── Reset when source image changes ── */
  useEffect(() => {
    setImgNatural({ w: 0, h: 0 });
    setImageLoaded(false);
  }, [backgroundImageUrl]);

  /* ── Wheel zoom (centred on cursor) ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const v = viewRef.current;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, v.scale * factor),
      );
      if (newScale === v.scale) return;
      const ratio = newScale / v.scale;
      viewRef.current = {
        scale: newScale,
        ox: cx - (cx - v.ox) * ratio,
        oy: cy - (cy - v.oy) * ratio,
      };
      rerender((n) => n + 1);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* ── Pointer pan ── */
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    isPanning.current = true;
    panStart.current = {
      x: e.clientX,
      y: e.clientY,
      ox: viewRef.current.ox,
      oy: viewRef.current.oy,
    };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    viewRef.current.ox = panStart.current.ox + (e.clientX - panStart.current.x);
    viewRef.current.oy = panStart.current.oy + (e.clientY - panStart.current.y);
    rerender((n) => n + 1);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isPanning.current) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      isPanning.current = false;
    }
  }, []);

  /* ── Button zoom (centred on viewport) ── */
  const applyButtonZoom = useCallback(
    (direction: 1 | -1) => {
      const { w: cw, h: ch } = containerSize;
      const v = viewRef.current;
      const factor = direction > 0 ? 1.2 : 1 / 1.2;
      const newScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, v.scale * factor),
      );
      if (newScale === v.scale) return;
      const ratio = newScale / v.scale;
      const midX = cw / 2;
      const midY = ch / 2;
      viewRef.current = {
        scale: newScale,
        ox: midX - (midX - v.ox) * ratio,
        oy: midY - (midY - v.oy) * ratio,
      };
      rerender((n) => n + 1);
    },
    [containerSize],
  );

  const v = viewRef.current;

  if (!backgroundImageUrl) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="font-cinzel text-parchment/40 text-sm italic">
          No map available for this location
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 relative">
        {/* Zoom controls */}
        <div className="combat-zoom-controls">
          <button onClick={() => applyButtonZoom(1)} title="Zoom in">
            +
          </button>
          <button onClick={() => applyButtonZoom(-1)} title="Zoom out">
            &minus;
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
          style={{ background: "#0d0a08" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={resetView}
        >
          {/* Blurred backdrop — fills the viewport for an immersive feel */}
          {imageLoaded && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <img
                src={backgroundImageUrl}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: "blur(40px) brightness(0.4) saturate(1.2)" }}
                draggable={false}
              />
            </div>
          )}

          {/* Sharp map image with pan/zoom transform */}
          <img
            ref={imgRef}
            src={backgroundImageUrl}
            alt={poiName}
            crossOrigin="anonymous"
            onLoad={handleImgLoad}
            draggable={false}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              transform: `translate(${v.ox}px, ${v.oy}px) scale(${v.scale})`,
              transformOrigin: "0 0",
              maxWidth: "none",
              userSelect: "none",
              pointerEvents: "none",
              opacity: imageLoaded ? 1 : 0,
              transition: "opacity 300ms ease-in",
              zIndex: 1,
            }}
          />

          {/* Loading overlay — visible while the background image downloads */}
          {!imageLoaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
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
      </div>
    </div>
  );
}

export default React.memo(POIMapView);
