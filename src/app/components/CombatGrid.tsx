"use client";

import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import type { NPC, PlayerState, GridPosition, Ability } from "../lib/gameTypes";
import { toDisplayCase } from "../lib/gameTypes";
import {
  cellsInRange,
  validateMovement,
  validateAttackRange,
  feetDistance,
  DEFAULT_MELEE_REACH,
} from "../lib/combatEnforcement";
import { getTokenImageKey, preloadTokenImages, isImageReady } from "../lib/tokenImages";

interface Props {
  player: PlayerState;
  activeNPCs: NPC[];
  positions: Map<string, GridPosition>;
  onMoveToken: (id: string, pos: GridPosition) => void;
  gridSize: number;
  /** When set, grid enters targeting mode: shows range overlay, highlights valid targets. */
  targetingAbility?: Ability | null;
  /** Called when a valid target is clicked during targeting mode. */
  onTargetSelected?: (targetId: string) => void;
  /** Combat abilities to display in the overlay bar. */
  abilities?: Ability[];
  /** Currently selected ability (for highlight state). */
  selectedAbility?: Ability | null;
  /** Called when an ability button is clicked. */
  onSelectAbility?: (ability: Ability) => void;
  /** Whether the ability bar buttons are disabled (during busy states). */
  abilityBarDisabled?: boolean;
  /** Called on right-click to cancel pending actions (targeting, spell panel, etc.). */
  onCancel?: () => void;
  /** Optional element rendered below the combat map header (e.g. TurnOrderBar). */
  headerExtra?: React.ReactNode;
}

export interface CombatGridHandle {
  showCombatResult: (tokenId: string, hit: boolean, damage: number) => void;
}

interface FloatingCombatLabel {
  tokenId: string;  // "player" or NPC id
  hit: boolean;
  damage: number;   // 0 for misses
  startTime: number; // performance.now() when created
}

/* ── Constants ───────────────────────────────────────────── */

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const ZOOM_STEP = 0.1;
const GAP = 1;
const FEET_PER_SQUARE = 5;
const DEFAULT_SPEED = 30;

/** Disposition → { fill, stroke, text } hex colors for canvas tokens. */
const COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  player:   { fill: "#d97706", stroke: "#fbbf24", text: "#fef3c7" },
  hostile:  { fill: "#991b1b", stroke: "#ef4444", text: "#fee2e2" },
  friendly: { fill: "#065f46", stroke: "#10b981", text: "#d1fae5" },
  neutral:  { fill: "#075985", stroke: "#0ea5e9", text: "#e0f2fe" },
};

/**
 * All mutable state the RAF loop reads.
 * Stored in a ref so the single RAF closure never has stale values.
 */
interface DrawState {
  viewWidth: number;
  viewHeight: number;
  gridDim: number;
  centerX: number;
  centerY: number;
  scale: number;
  offset: { x: number; y: number };
  cellSize: number;
  cellStep: number;
  positions: Map<string, GridPosition>;
  player: PlayerState;
  activeNPCs: NPC[];
  gridSize: number;
  dragId: string | null;
  dragPixel: { x: number; y: number } | null;
  dragOrigin: GridPosition | null;
  playerSpeed: number;
  targetingAbility: Ability | null;
}

/* ── Helpers ─────────────────────────────────────────────── */

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/** Format a compact range tag for an ability button. */
function abilityRangeTag(ability: Ability): string {
  if (ability.type === "action") return "Self";
  const r = ability.range;
  if (!r) return "5 ft";
  switch (r.type) {
    case "self":   return "Self";
    case "touch":  return "Touch";
    case "melee":  return `${r.reach ?? 5} ft`;
    case "ranged": return `${r.shortRange ?? 30} ft`;
    case "both":   return `${r.reach ?? 5}/${r.shortRange ?? 20} ft`;
  }
}

/**
 * Draw a single token on the canvas.
 *
 * If a preloaded token image is ready, draws it circle-clipped with a
 * disposition-colored border ring. Otherwise falls back to the colored
 * circle with two-letter initials.
 *
 * `pulse` is 0–1 sine phase used for the player glow; ignored for NPCs.
 * `tokenImg` is the optional preloaded HTMLImageElement for this token.
 */
function drawToken(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cellSize: number,
  initials: string,
  currentHp: number,
  maxHp: number,
  disposition: string,
  pulse: number,
  tokenImg?: HTMLImageElement,
) {
  const isDead = currentHp <= 0;
  const c = COLORS[disposition] ?? COLORS.neutral;
  const radius = cellSize * 0.4;
  const fontSize = Math.max(7, Math.min(cellSize * 0.3, 14));
  const hasImage = tokenImg && isImageReady(tokenImg);

  ctx.save();

  if (isDead) ctx.globalAlpha = 0.3;

  // Pulse glow (player only)
  if (disposition === "player" && !isDead) {
    const blur = 4 + 8 * pulse;
    const alpha = 0.4 + 0.3 * pulse;
    ctx.shadowColor = `rgba(201, 168, 76, ${alpha})`;
    ctx.shadowBlur = blur;
  }

  if (hasImage) {
    // ── Portrait image token ──
    // Border ring (slightly larger than the image circle)
    const ringRadius = radius + 2;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = c.stroke;
    ctx.stroke();

    // Reset shadow before image
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    // Circle-clip the portrait image
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
    ctx.clip();
    const imgSize = (radius - 1) * 2;
    ctx.drawImage(tokenImg, cx - imgSize / 2, cy - imgSize / 2, imgSize, imgSize);
    ctx.restore();

    // Death skull overlay on top of image
    if (isDead) {
      ctx.font = `${Math.max(10, cellSize * 0.25)}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("\u{1F480}", cx, cy);
    }
  } else {
    // ── Fallback: colored circle + initials ──
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = c.stroke;
    ctx.stroke();

    // Reset shadow before text
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    if (isDead) {
      ctx.font = `${Math.max(10, cellSize * 0.25)}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("\u{1F480}", cx, cy);
    } else {
      ctx.font = `bold ${fontSize}px Cinzel, Georgia, serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = c.text;
      ctx.fillText(initials, cx, cy);
    }
  }

  ctx.restore();
}

/**
 * Get the token info needed to draw a drag ghost from the draw state.
 */
function getDragTokenInfo(s: DrawState): {
  initials: string;
  hp: number;
  maxHp: number;
  disposition: string;
  imagePath: string;
} | null {
  if (!s.dragId) return null;
  if (s.dragId === "player") {
    return {
      initials: getInitials(s.player.name),
      hp: s.player.currentHP,
      maxHp: s.player.maxHP,
      disposition: "player",
      imagePath: getTokenImageKey(s.player.race, "race"),
    };
  }
  const npc = s.activeNPCs.find((n) => n.id === s.dragId);
  if (!npc) return null;
  return {
    initials: getInitials(npc.name),
    hp: npc.currentHp,
    maxHp: npc.maxHp,
    disposition: npc.disposition,
    imagePath: getTokenImageKey(npc.name, "monster"),
  };
}

/**
 * 20×20 tactical combat grid rendered on <canvas>.
 *
 * The canvas fills its container (possibly rectangular); the square grid
 * is drawn centered within it. This eliminates the aspect-ratio CSS fights
 * that plagued the DOM-based grid.
 *
 * Zoom: mouse wheel (toward cursor) or +/− buttons.
 * Pan: left-click drag on empty space, or middle-click drag.
 * Reset: double-click or ⟲ button.
 * Token drag: left-click on any token.
 */
const CombatGrid = forwardRef<CombatGridHandle, Props>(function CombatGrid({
  player,
  activeNPCs,
  positions,
  onMoveToken,
  gridSize,
  targetingAbility = null,
  onTargetSelected,
  abilities = [],
  selectedAbility = null,
  onSelectAbility,
  abilityBarDisabled = false,
  onCancel,
  headerExtra,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const floatingLabelsRef = useRef<FloatingCombatLabel[]>([]);
  const tokenImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  useImperativeHandle(ref, () => ({
    showCombatResult(tokenId: string, hit: boolean, damage: number) {
      // Replace any existing label for the same token
      floatingLabelsRef.current = floatingLabelsRef.current.filter(l => l.tokenId !== tokenId);
      floatingLabelsRef.current.push({ tokenId, hit, damage, startTime: performance.now() });
    },
  }));

  // View transform (user-controlled offset is relative to centered position)
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Token drag — which token id is being dragged, where the ghost is, and origin cell
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragPixel, setDragPixel] = useState<{ x: number; y: number } | null>(null);
  const [dragOrigin, setDragOrigin] = useState<GridPosition | null>(null);

  // Spell submenu panel toggle
  const [spellPanelOpen, setSpellPanelOpen] = useState(false);

  // Pan (left-click on empty space, or middle-click anywhere)
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  // Measured viewport dimensions
  const [viewWidth, setViewWidth] = useState(0);
  const [viewHeight, setViewHeight] = useState(0);

  // Fixed 1400px grid so tokens are large enough for character portrait images.
  // The grid may extend beyond the viewport; the player pans/zooms to navigate.
  const gridDim = 1400;
  const cellSize = gridDim > 0 ? (gridDim - (gridSize - 1) * GAP) / gridSize : 0;
  const cellStep = cellSize + GAP;
  const centerX = (viewWidth - (gridSize * cellStep - GAP)) / 2;
  const centerY = (viewHeight - (gridSize * cellStep - GAP)) / 2;

  /* ── Mutable draw-state ref (read by RAF and imperative handlers) ── */
  const stateRef = useRef<DrawState>({
    viewWidth: 0,
    viewHeight: 0,
    gridDim: 0,
    centerX: 0,
    centerY: 0,
    scale: 1,
    offset: { x: 0, y: 0 },
    cellSize: 0,
    cellStep: 0,
    positions: new Map(),
    player,
    activeNPCs,
    gridSize,
    dragId: null,
    dragPixel: null,
    dragOrigin: null,
    playerSpeed: player.speed ?? DEFAULT_SPEED,
    targetingAbility: null,
  });

  // Keep stateRef in sync every render
  useEffect(() => {
    stateRef.current = {
      viewWidth,
      viewHeight,
      gridDim,
      centerX,
      centerY,
      scale,
      offset,
      cellSize,
      cellStep,
      positions,
      player,
      activeNPCs,
      gridSize,
      dragId,
      dragPixel,
      dragOrigin,
      playerSpeed: player.speed ?? DEFAULT_SPEED,
      targetingAbility,
    };
  });

  /* ── Preload token images when NPC list or player race changes ── */
  useEffect(() => {
    const entries: { name: string; type: "monster" | "race" }[] = [
      { name: player.race, type: "race" },
      ...activeNPCs.map((npc) => ({ name: npc.name, type: "monster" as const })),
    ];
    tokenImageCacheRef.current = preloadTokenImages(entries);
  }, [player.race, activeNPCs]);

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

      // Resize buffer to match viewport
      const bufW = Math.round(s.viewWidth * dpr);
      const bufH = Math.round(s.viewHeight * dpr);
      if (canvas!.width !== bufW || canvas!.height !== bufH) {
        canvas!.width = bufW;
        canvas!.height = bufH;
      }
      canvas!.style.width = `${s.viewWidth}px`;
      canvas!.style.height = `${s.viewHeight}px`;

      if (s.viewWidth <= 0 || s.viewHeight <= 0 || s.cellSize <= 0) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, s.viewWidth, s.viewHeight);

      // View transform: center grid + user pan/zoom
      ctx!.save();
      ctx!.translate(s.centerX + s.offset.x, s.centerY + s.offset.y);
      ctx!.scale(s.scale, s.scale);

      // 1) Checkerboard cells
      for (let row = 0; row < s.gridSize; row++) {
        for (let col = 0; col < s.gridSize; col++) {
          const isAlt = (row + col) % 2 === 1;
          ctx!.fillStyle = isAlt
            ? "rgba(18, 16, 14, 0.85)"
            : "rgba(13, 10, 8, 0.85)";
          ctx!.fillRect(
            col * s.cellStep,
            row * s.cellStep,
            s.cellSize,
            s.cellSize,
          );
        }
      }

      // 1b) Range overlay — targeting ability range or default melee reach
      const pPos = s.positions.get("player");
      if (pPos && s.targetingAbility) {
        // Targeting mode: show ability range
        let rangeFeet = DEFAULT_MELEE_REACH;
        let longRangeFeet: number | undefined;

        const ar = s.targetingAbility.range;
        if (ar) {
          switch (ar.type) {
            case "self":
              rangeFeet = 0;
              break;
            case "touch":
              rangeFeet = ar.reach ?? DEFAULT_MELEE_REACH;
              break;
            case "melee":
              rangeFeet = ar.reach ?? DEFAULT_MELEE_REACH;
              break;
            case "ranged":
              rangeFeet = ar.shortRange ?? 30;
              longRangeFeet = ar.longRange;
              break;
            case "both":
              rangeFeet = ar.shortRange ?? ar.reach ?? 20;
              longRangeFeet = ar.longRange;
              break;
          }
        }

        // Draw long range cells (amber) if applicable
        if (longRangeFeet && longRangeFeet > rangeFeet) {
          const longCells = cellsInRange(pPos, longRangeFeet, s.gridSize);
          ctx!.fillStyle = "rgba(217, 119, 6, 0.06)";
          for (const rc of longCells) {
            ctx!.fillRect(rc.col * s.cellStep, rc.row * s.cellStep, s.cellSize, s.cellSize);
          }
        }
        // Draw normal range cells (green)
        const normalCells = cellsInRange(pPos, rangeFeet, s.gridSize);
        ctx!.fillStyle = "rgba(34, 197, 94, 0.1)";
        for (const rc of normalCells) {
          ctx!.fillRect(rc.col * s.cellStep, rc.row * s.cellStep, s.cellSize, s.cellSize);
        }
      } else if (pPos) {
        // Default melee reach overlay
        const reachCells = cellsInRange(pPos, DEFAULT_MELEE_REACH, s.gridSize);
        ctx!.fillStyle = "rgba(201, 168, 76, 0.08)";
        for (const rc of reachCells) {
          ctx!.fillRect(
            rc.col * s.cellStep,
            rc.row * s.cellStep,
            s.cellSize,
            s.cellSize,
          );
        }
      }

      // 2) Grid border
      const totalDim = s.gridSize * s.cellStep - GAP;
      ctx!.strokeStyle = "rgba(139, 105, 20, 0.3)";
      ctx!.lineWidth = 1;
      ctx!.strokeRect(-0.5, -0.5, totalDim + 1, totalDim + 1);

      // Pulse phase for player glow (2s cycle)
      const pulse = (Math.sin((now % 2000) / 2000 * Math.PI * 2) + 1) / 2;

      // 3) NPC tokens (below player in z-order) — skip the one being dragged
      for (const npc of s.activeNPCs) {
        if (npc.id === s.dragId) continue;
        const pos = s.positions.get(npc.id);
        if (!pos) continue;
        const cx = pos.col * s.cellStep + s.cellSize / 2;
        const cy = pos.row * s.cellStep + s.cellSize / 2;

        // Targeting highlight: pulsing ring around hostile NPCs in range
        if (s.targetingAbility && npc.disposition === "hostile" && npc.currentHp > 0 && pPos) {
          const dist = Math.max(Math.abs(pos.row - pPos.row), Math.abs(pos.col - pPos.col)) * FEET_PER_SQUARE;
          let inRange = false;
          const tr = s.targetingAbility.range;
          if (tr) {
            const maxRange = tr.longRange ?? tr.shortRange ?? tr.reach ?? DEFAULT_MELEE_REACH;
            inRange = tr.type === "self" || dist <= maxRange;
          } else {
            inRange = dist <= DEFAULT_MELEE_REACH;
          }

          if (inRange) {
            const radius = s.cellSize * 0.4;
            const ringPulse = (Math.sin((now % 1500) / 1500 * Math.PI * 2) + 1) / 2;
            ctx!.save();
            ctx!.beginPath();
            ctx!.arc(cx, cy, radius + 3 + ringPulse * 2, 0, Math.PI * 2);
            ctx!.strokeStyle = `rgba(239, 68, 68, ${0.5 + ringPulse * 0.4})`;
            ctx!.lineWidth = 2;
            ctx!.stroke();
            ctx!.restore();
          }
        }

        const npcImgPath = getTokenImageKey(npc.name, "monster");
        const npcImg = tokenImageCacheRef.current.get(npcImgPath);
        drawToken(ctx!, cx, cy, s.cellSize, getInitials(npc.name), npc.currentHp, npc.maxHp, npc.disposition, 0, npcImg);
      }

      // 4) Player token (stationary, hidden while being dragged)
      const playerPos = s.positions.get("player");
      if (playerPos && s.dragId !== "player") {
        const cx = playerPos.col * s.cellStep + s.cellSize / 2;
        const cy = playerPos.row * s.cellStep + s.cellSize / 2;
        const playerImgPath = getTokenImageKey(s.player.race, "race");
        const playerImg = tokenImageCacheRef.current.get(playerImgPath);
        drawToken(ctx!, cx, cy, s.cellSize, getInitials(s.player.name), s.player.currentHP, s.player.maxHP, "player", pulse, playerImg);
      }

      // 5) Drag ghost + measurement line
      if (s.dragId && s.dragPixel && s.dragOrigin) {
        const info = getDragTokenInfo(s);
        if (info) {
          // Origin cell center
          const ox = s.dragOrigin.col * s.cellStep + s.cellSize / 2;
          const oy = s.dragOrigin.row * s.cellStep + s.cellSize / 2;

          // Destination cell under cursor (for distance calc)
          const destCol = Math.floor(s.dragPixel.x / s.cellStep);
          const destRow = Math.floor(s.dragPixel.y / s.cellStep);
          // Chebyshev distance: each diagonal counts as one square (standard 5e grid)
          const gridDist = Math.max(
            Math.abs(destRow - s.dragOrigin.row),
            Math.abs(destCol - s.dragOrigin.col),
          );
          const feet = gridDist * FEET_PER_SQUARE;
          const inRange = feet <= s.playerSpeed;

          // Measurement line from origin to cursor
          const lineColor = inRange ? "rgba(201, 168, 76, 0.7)" : "rgba(239, 68, 68, 0.8)";
          ctx!.save();
          ctx!.setLineDash([6, 4]);
          ctx!.strokeStyle = lineColor;
          ctx!.lineWidth = 2;
          ctx!.beginPath();
          ctx!.moveTo(ox, oy);
          ctx!.lineTo(s.dragPixel.x, s.dragPixel.y);
          ctx!.stroke();
          ctx!.setLineDash([]);
          ctx!.restore();

          // Distance label — positioned at midpoint of the line
          const mx = (ox + s.dragPixel.x) / 2;
          const my = (oy + s.dragPixel.y) / 2;
          const label = `${feet} ft`;
          const labelFont = `bold ${Math.max(10, s.cellSize * 0.28)}px Cinzel, Georgia, serif`;
          ctx!.save();
          ctx!.font = labelFont;
          const metrics = ctx!.measureText(label);
          const padX = 6;
          const padY = 3;
          const lw = metrics.width + padX * 2;
          const lh = 16 + padY * 2;
          // Label background
          ctx!.fillStyle = "rgba(13, 10, 8, 0.85)";
          ctx!.beginPath();
          ctx!.roundRect(mx - lw / 2, my - lh / 2, lw, lh, 4);
          ctx!.fill();
          ctx!.strokeStyle = inRange ? "rgba(201, 168, 76, 0.5)" : "rgba(239, 68, 68, 0.6)";
          ctx!.lineWidth = 1;
          ctx!.stroke();
          // Label text
          ctx!.fillStyle = inRange ? "#fef3c7" : "#fca5a5";
          ctx!.textAlign = "center";
          ctx!.textBaseline = "middle";
          ctx!.fillText(label, mx, my);
          ctx!.restore();

          // Draw the ghost token
          const ghostImg = tokenImageCacheRef.current.get(info.imagePath);
          ctx!.save();
          ctx!.scale(1.15, 1.15);
          drawToken(
            ctx!,
            s.dragPixel.x / 1.15,
            s.dragPixel.y / 1.15,
            s.cellSize,
            info.initials,
            info.hp,
            info.maxHp,
            info.disposition,
            info.disposition === "player" ? pulse : 0,
            ghostImg,
          );
          ctx!.restore();
        }
      }

      // 6) Floating combat labels (HIT/MISS + damage)
      const labels = floatingLabelsRef.current;
      for (let li = labels.length - 1; li >= 0; li--) {
        const label = labels[li];
        const elapsed = now - label.startTime;
        const totalDuration = label.hit ? 2500 : 1000;

        // Cleanup expired labels
        if (elapsed > totalDuration) {
          labels.splice(li, 1);
          continue;
        }

        // Find token position
        const tokenPos = s.positions.get(label.tokenId);
        if (!tokenPos) continue;
        const tcx = tokenPos.col * s.cellStep + s.cellSize / 2;
        const tcy = tokenPos.row * s.cellStep + s.cellSize / 2 - s.cellSize * 0.6;

        const labelFontSize = Math.max(10, s.cellSize * 0.35);
        ctx!.save();
        ctx!.font = `bold ${labelFontSize}px Cinzel, Georgia, serif`;
        ctx!.textAlign = "center";
        ctx!.textBaseline = "middle";

        // Phase 1: HIT or MISS (0–1000ms)
        if (elapsed < 1000) {
          let opacity: number;
          if (elapsed < 150) {
            opacity = elapsed / 150;
          } else if (elapsed < 800) {
            opacity = 1;
          } else {
            opacity = 1 - (elapsed - 800) / 200;
          }
          const text = label.hit ? "HIT" : "MISS";
          const color = label.hit ? "#4ade80" : "#f87171";
          ctx!.shadowColor = "rgba(0, 0, 0, 0.8)";
          ctx!.shadowBlur = 4;
          ctx!.globalAlpha = Math.max(0, Math.min(1, opacity));
          ctx!.fillStyle = color;
          ctx!.fillText(text, tcx, tcy);
        }

        // Phase 2: Damage number (1000–2500ms, hit only)
        if (label.hit && elapsed >= 1000 && elapsed < 2500) {
          const phase2 = elapsed - 1000;
          let opacity: number;
          if (phase2 < 150) {
            opacity = phase2 / 150;
          } else if (phase2 < 1200) {
            opacity = 1;
          } else {
            opacity = 1 - (phase2 - 1200) / 300;
          }
          ctx!.shadowColor = "rgba(0, 0, 0, 0.8)";
          ctx!.shadowBlur = 4;
          ctx!.globalAlpha = Math.max(0, Math.min(1, opacity));
          ctx!.fillStyle = "#ffffff";
          ctx!.fillText(`-${label.damage}`, tcx, tcy);
        }

        ctx!.restore();
      }

      ctx!.restore();
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  /* ── Coordinate conversion ─────────────────────────────── */

  /** Convert viewport-relative pixel to grid-space pixel (undo centering + pan/zoom). */
  const viewportToGrid = useCallback(
    (vx: number, vy: number): { x: number; y: number } => ({
      x: (vx - centerX - offset.x) / scale,
      y: (vy - centerY - offset.y) / scale,
    }),
    [scale, offset, centerX, centerY],
  );

  /** Convert viewport-relative pixel to grid cell. */
  const pixelToCell = useCallback(
    (vx: number, vy: number): GridPosition | null => {
      if (cellSize <= 0) return null;
      const g = viewportToGrid(vx, vy);
      const col = Math.floor(g.x / cellStep);
      const row = Math.floor(g.y / cellStep);
      if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) return null;
      return { row, col };
    },
    [cellSize, cellStep, gridSize, viewportToGrid],
  );

  /** Hit-test all tokens. Returns id of token under (vx, vy), player checked first. */
  const hitTest = useCallback(
    (vx: number, vy: number): string | null => {
      if (cellSize <= 0) return null;
      const g = viewportToGrid(vx, vy);
      const r = cellSize * 0.4;

      const pp = positions.get("player");
      if (pp) {
        const cx = pp.col * cellStep + cellSize / 2;
        const cy = pp.row * cellStep + cellSize / 2;
        if (Math.hypot(g.x - cx, g.y - cy) <= r) return "player";
      }

      for (const npc of activeNPCs) {
        const pos = positions.get(npc.id);
        if (!pos) continue;
        const cx = pos.col * cellStep + cellSize / 2;
        const cy = pos.row * cellStep + cellSize / 2;
        if (Math.hypot(g.x - cx, g.y - cy) <= r) return npc.id;
      }

      return null;
    },
    [cellSize, cellStep, positions, activeNPCs, viewportToGrid],
  );

  /* ── Viewport-relative coords from pointer event ── */
  const getVP = (e: React.PointerEvent | React.MouseEvent): { vx: number; vy: number } => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { vx: 0, vy: 0 };
    return { vx: e.clientX - rect.left, vy: e.clientY - rect.top };
  };

  /* ── Pointer events on canvas ────────────────────────────
   *
   * Left-click (button 0):
   *   - Over a token → drag that token
   *   - Empty space  → pan
   * Middle-click (button 1): pan
   */

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const { vx, vy } = getVP(e);

      if (e.button === 1) {
        // Middle-click always pans
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setIsPanning(true);
        panStart.current = { x: e.clientX, y: e.clientY, offsetX: offset.x, offsetY: offset.y };
        return;
      }

      if (e.button === 0) {
        const hit = hitTest(vx, vy);

        // Targeting mode: clicking an NPC selects it as target
        if (targetingAbility && hit && hit !== "player") {
          e.preventDefault();
          onTargetSelected?.(hit);
          return;
        }

        if (hit === "player" && !targetingAbility) {
          // Drag player token — record origin cell for measurement
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          const origin = positions.get("player") ?? null;
          const gp = viewportToGrid(vx, vy);
          // Write to stateRef immediately so the RAF loop sees it this frame
          stateRef.current.dragId = "player";
          stateRef.current.dragPixel = gp;
          stateRef.current.dragOrigin = origin;
          setDragId("player");
          setDragPixel(gp);
          setDragOrigin(origin);
        } else {
          // Pan on empty space or non-player tokens
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setIsPanning(true);
          panStart.current = { x: e.clientX, y: e.clientY, offsetX: offset.x, offsetY: offset.y };
        }
      }
    },
    [offset, hitTest, viewportToGrid, positions, targetingAbility, onTargetSelected],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const { vx, vy } = getVP(e);

      if (isPanning) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        setOffset({ x: panStart.current.offsetX + dx, y: panStart.current.offsetY + dy });
        return;
      }

      if (dragId) {
        const gp = viewportToGrid(vx, vy);
        stateRef.current.dragPixel = gp;
        setDragPixel(gp);
      }

      // Cursor hint (only when not panning or dragging)
      if (!dragId) {
        const hit = hitTest(vx, vy);
        if (canvasRef.current) {
          if (targetingAbility) {
            // Targeting mode: crosshair on hostiles, default elsewhere
            const isHostile = hit && hit !== "player" && activeNPCs.some(n => n.id === hit && n.currentHp > 0);
            canvasRef.current.style.cursor = isHostile ? "crosshair" : "default";
          } else {
            canvasRef.current.style.cursor = hit === "player" ? "grab" : "";
          }
        }
      }
    },
    [isPanning, dragId, hitTest, viewportToGrid, targetingAbility, activeNPCs],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning) {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        setIsPanning(false);
        return;
      }

      if (dragId) {
        const currentDragId = dragId;
        const origin = dragOrigin;
        // Clear drag state immediately for RAF + React
        stateRef.current.dragId = null;
        stateRef.current.dragPixel = null;
        stateRef.current.dragOrigin = null;
        setDragId(null);
        setDragPixel(null);
        setDragOrigin(null);
        const { vx, vy } = getVP(e);
        const cell = pixelToCell(vx, vy);
        if (!cell) return;

        // Speed check — reject if destination exceeds movement range
        if (origin) {
          const speed = player.speed ?? DEFAULT_SPEED;
          const { allowed } = validateMovement(origin, cell, speed);
          if (!allowed) return;
        }

        // Collision check — don't drop on another token
        for (const [id, pos] of Array.from(positions.entries())) {
          if (id !== currentDragId && pos.row === cell.row && pos.col === cell.col) return;
        }
        onMoveToken(currentDragId, cell);
      }
    },
    [isPanning, dragId, dragOrigin, pixelToCell, positions, onMoveToken, player],
  );

  /* ── Zoom helpers ───────────────────────────────────────
   *
   * The on-screen transform is:
   *   screenX = gridX * scale + (centerX + offset.x)
   *
   * For zoom-toward-point, the standard formula on total translation T is:
   *   T_new = cursor - (cursor - T_old) * ratio
   *
   * We read current values from stateRef to avoid stale closures, then
   * write back to both React state AND stateRef so rapid successive
   * events (e.g. trackpad wheel) always see the latest values.
   */

  const applyZoom = useCallback(
    (cursorX: number, cursorY: number, direction: number) => {
      const s = stateRef.current;
      const newScale = clampScale(s.scale * (direction > 0 ? 1 + ZOOM_STEP : 1 - ZOOM_STEP));
      if (newScale === s.scale) return;
      const ratio = newScale / s.scale;

      // Total translation (centering + user offset)
      const tx = s.centerX + s.offset.x;
      const ty = s.centerY + s.offset.y;

      // Standard zoom-toward-cursor on total translation
      const newTx = cursorX - (cursorX - tx) * ratio;
      const newTy = cursorY - (cursorY - ty) * ratio;

      // Extract user offset by subtracting the centering
      const newOffset = { x: newTx - s.centerX, y: newTy - s.centerY };

      // Write to stateRef immediately so rapid events see the latest values
      stateRef.current.scale = newScale;
      stateRef.current.offset = newOffset;

      setScale(newScale);
      setOffset(newOffset);
    },
    [],
  );

  /* ── Wheel zoom (imperative listener for passive:false) ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      // direction > 0 means zoom in (scroll up), < 0 means zoom out
      applyZoom(cursorX, cursorY, e.deltaY < 0 ? 1 : -1);
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyZoom]);

  /* ── Zoom controls ── */

  const zoomIn = useCallback(() => {
    const s = stateRef.current;
    applyZoom(s.viewWidth / 2, s.viewHeight / 2, 1);
  }, [applyZoom]);

  const zoomOut = useCallback(() => {
    const s = stateRef.current;
    applyZoom(s.viewWidth / 2, s.viewHeight / 2, -1);
  }, [applyZoom]);

  const resetView = useCallback(() => {
    const newOffset = { x: 0, y: 0 };
    stateRef.current.scale = 1;
    stateRef.current.offset = newOffset;
    setScale(1);
    setOffset(newOffset);
  }, []);

  // Close spell panel when targeting is cleared (e.g. Escape pressed)
  useEffect(() => {
    if (!selectedAbility) setSpellPanelOpen(false);
  }, [selectedAbility]);

  // Split abilities: weapons/actions stay as direct buttons, spells/cantrips go in submenu
  const directAbilities = abilities.filter(a => a.type === "weapon" || a.type === "action");
  const spellAbilities = abilities.filter(a => a.type === "cantrip" || a.type === "spell");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 bg-dungeon-mid border-b border-gold/30 px-4 py-1.5 flex items-center justify-between">
        <span className="font-cinzel text-gold text-xs tracking-[0.2em] uppercase">
          ✦ Combat Map ✦
        </span>
        <span className="font-cinzel text-parchment/40 text-[10px] tracking-widest uppercase">
          {activeNPCs.filter((n) => n.currentHp > 0).length} hostiles
        </span>
      </div>

      {headerExtra}

      {/* Canvas area — viewport clips zoomed/panned content */}
      <div className="flex-1 min-h-0 relative">
        {/* Zoom controls */}
        <div className="combat-zoom-controls">
          <button onClick={zoomIn} title="Zoom in">+</button>
          <button onClick={zoomOut} title="Zoom out">−</button>
          <button onClick={resetView} title="Reset view" style={{ fontSize: 11 }}>⟲</button>
        </div>

        {/* Ability bar — right side, vertically centered */}
        {abilities.length > 0 && (
          <div className="combat-ability-bar">
            {/* Targeting hint */}
            {selectedAbility && selectedAbility.requiresTarget && (
              <div className="combat-ability-hint">
                Select target…
              </div>
            )}
            {/* Direct abilities: weapons + universal actions */}
            {directAbilities.map((ability) => {
              const isSelected = selectedAbility?.id === ability.id;
              const range = abilityRangeTag(ability);
              return (
                <button
                  key={ability.id}
                  onClick={() => {
                    setSpellPanelOpen(false);
                    onSelectAbility?.(ability);
                  }}
                  disabled={abilityBarDisabled}
                  className={`combat-ability-btn ${isSelected ? "combat-ability-btn-selected" : ""}`}
                  title={`${toDisplayCase(ability.name)} (${range})`}
                >
                  <span className="combat-ability-name">
                    {toDisplayCase(ability.name)}
                  </span>
                  <span className="combat-ability-range">
                    {range}
                  </span>
                </button>
              );
            })}
            {/* Spells toggle button */}
            {spellAbilities.length > 0 && (
              <button
                onClick={() => setSpellPanelOpen(o => !o)}
                disabled={abilityBarDisabled}
                className={`combat-ability-btn ${spellPanelOpen ? "combat-ability-btn-selected" : ""}`}
                title="Spells & Cantrips"
              >
                <span className="combat-ability-name">Spells</span>
                <span className="combat-ability-range">
                  {spellAbilities.length}
                </span>
              </button>
            )}
          </div>
        )}

        {/* Spell submenu panel — rendered outside ability bar to avoid overflow clipping */}
        {spellPanelOpen && spellAbilities.length > 0 && (
          <div className="combat-spell-panel">
            {spellAbilities.map((ability) => {
              const isSelected = selectedAbility?.id === ability.id;
              const range = abilityRangeTag(ability);
              return (
                <button
                  key={ability.id}
                  onClick={() => {
                    setSpellPanelOpen(false);
                    onSelectAbility?.(ability);
                  }}
                  disabled={abilityBarDisabled}
                  className={`combat-ability-btn ${isSelected ? "combat-ability-btn-selected" : ""}`}
                  style={{ whiteSpace: "nowrap" }}
                  title={`${toDisplayCase(ability.name)} (${range})`}
                >
                  <span className="combat-ability-name">
                    {toDisplayCase(ability.name)}
                  </span>
                  <span className="combat-ability-range">
                    {range}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Viewport */}
        <div
          ref={containerRef}
          className="combat-grid-viewport"
          onDoubleClick={resetView}
          onContextMenu={(e) => {
            e.preventDefault();
            setSpellPanelOpen(false);
            onCancel?.();
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />

        </div>
      </div>

      {/* Legend bar */}
      <div className="flex-shrink-0 border-t border-gold/20 px-3 py-1.5 flex flex-wrap gap-x-3 gap-y-1 overflow-x-auto">
        <span className="flex items-center gap-1.5 font-cinzel text-[10px] text-parchment/70 tracking-wide whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
          {player.name}
        </span>
        {activeNPCs.map((npc) => {
          const color =
            npc.disposition === "hostile" ? "bg-red-600" :
            npc.disposition === "friendly" ? "bg-emerald-600" : "bg-sky-600";
          return (
            <span
              key={npc.id}
              className={`flex items-center gap-1.5 font-cinzel text-[10px] tracking-wide whitespace-nowrap ${
                npc.currentHp <= 0 ? "text-parchment/30 line-through" : "text-parchment/70"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${color} inline-block ${npc.currentHp <= 0 ? "opacity-30" : ""}`} />
              {npc.name}
            </span>
          );
        })}
      </div>
    </div>
  );
});

export default CombatGrid;
