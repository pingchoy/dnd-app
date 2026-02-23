"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface UseResizablePanelOptions {
  /** Default width in pixels. */
  defaultWidth: number;
  /** Minimum usable width in pixels. */
  minWidth: number;
  /** Maximum width in pixels. */
  maxWidth: number;
  /** Side the resize handle sits on — determines drag direction. */
  side: "left" | "right";
  /**
   * When dragged below this width the panel collapses (hides).
   * Defaults to minWidth - 40.
   */
  collapseThreshold?: number;
}

/**
 * Manages drag-to-resize state for a panel with snap-to-collapse.
 *
 * When dragged below `collapseThreshold`, the panel collapses with a
 * smooth CSS transition mid-drag. Dragging back out restores it with
 * the same animation. Normal resizing above the threshold is instant
 * (transitions disabled).
 */
export function useResizablePanel({
  defaultWidth,
  minWidth,
  maxWidth,
  side,
  collapseThreshold,
}: UseResizablePanelOptions) {
  const threshold = collapseThreshold ?? minWidth - 40;
  const [width, setWidth] = useState(defaultWidth);
  const [isCollapsed, setIsCollapsed] = useState(false);
  // Suppresses CSS transitions during normal drag resizing.
  // Set to false when crossing the collapse threshold so the animation plays.
  const [suppressTransition, setSuppressTransition] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const preCollapseWidth = useRef(defaultWidth);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startWidth = isCollapsed ? 0 : width;
      dragRef.current = { startX: e.clientX, startWidth };
      if (!isCollapsed) preCollapseWidth.current = width;
      setSuppressTransition(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width, isCollapsed],
  );

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const delta = e.clientX - dragRef.current.startX;
      const rawWidth =
        side === "right"
          ? dragRef.current.startWidth + delta
          : dragRef.current.startWidth - delta;

      if (rawWidth < threshold) {
        if (!isCollapsed) {
          // Crossing into collapse — enable transitions so it animates
          setSuppressTransition(false);
          setIsCollapsed(true);
        }
      } else {
        if (isCollapsed) {
          // Dragging back out — enable transitions for the restore animation,
          // then re-suppress after the transition completes
          setSuppressTransition(false);
          setIsCollapsed(false);
          setWidth(Math.max(minWidth, Math.min(maxWidth, rawWidth)));
          // Re-suppress after transition finishes so further dragging is instant
          setTimeout(() => setSuppressTransition(true), 300);
        } else {
          setWidth(Math.max(minWidth, Math.min(maxWidth, rawWidth)));
        }
      }
    }

    function onMouseUp() {
      if (!dragRef.current) return;
      dragRef.current = null;
      setSuppressTransition(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [minWidth, maxWidth, side, threshold, isCollapsed]);

  /** Programmatically restore from collapsed state to the previous width. */
  const restore = useCallback(() => {
    setSuppressTransition(false);
    setIsCollapsed(false);
    setWidth(preCollapseWidth.current);
  }, []);

  /** Programmatically collapse the panel (e.g. from a close button). */
  const collapse = useCallback(() => {
    preCollapseWidth.current = width;
    setSuppressTransition(false);
    setIsCollapsed(true);
  }, [width]);

  return {
    width,
    isCollapsed,
    /** When true, consumers should disable CSS transitions (normal drag resizing). */
    isDragging: suppressTransition,
    onMouseDown,
    restore,
    collapse,
  };
}
