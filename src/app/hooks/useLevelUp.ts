"use client";

import { useState, useMemo, useCallback } from "react";
import type { PendingLevelUp, PendingLevelData, PlayerState, CharacterStats, GameState } from "../lib/gameTypes";

// ─── Types ───────────────────────────────────────────────────────────────────

export type LevelUpStep = "summary" | "subclass" | "asi" | "features" | "spells" | "prepare" | "confirm";

export interface SpellOption {
  slug: string;
  name: string;
  level?: number;
  school: string;
  castingTime: string;
  range: string;
  description: string;
}

export interface SRDFeat {
  slug: string;
  name: string;
  description: string;
  prerequisite?: string;
}

export interface SRDArchetype {
  slug: string;
  name: string;
  description: string;
}

/** Per-level ASI state: either +2/+1+1 distribution or a feat name. */
export interface ASIState {
  level: number;
  mode: "asi" | "feat";
  /** Ability score increases (total = 2). */
  points: Partial<Record<keyof CharacterStats, number>>;
  /** Selected feat name (if mode=feat). */
  featChoice?: string;
}

export interface UseLevelUpReturn {
  steps: LevelUpStep[];
  currentStep: LevelUpStep;
  stepIndex: number;
  canGoNext: boolean;
  canGoBack: boolean;
  goNext: () => void;
  goBack: () => void;
  // Summary
  pending: PendingLevelUp;
  // Subclass
  archetypes: SRDArchetype[];
  selectedSubclass: string | null;
  setSelectedSubclass: (slug: string) => void;
  isLoadingArchetypes: boolean;
  // ASI / Feat
  asiStates: ASIState[];
  setASIMode: (level: number, mode: "asi" | "feat") => void;
  adjustASI: (level: number, stat: keyof CharacterStats, delta: 1 | -1) => void;
  setFeatChoice: (level: number, feat: string) => void;
  feats: SRDFeat[];
  isLoadingFeats: boolean;
  player: PlayerState;
  // Feature choices
  featureChoices: Record<string, string>;
  setFeatureChoice: (featureName: string, choice: string) => void;
  allFeatureChoicesMade: boolean;
  // Spells (known casters + cantrip learners)
  availableCantrips: SpellOption[];
  availableSpells: SpellOption[][];
  selectedCantrips: string[];
  selectedSpells: string[];
  totalCantripSlots: number;
  totalSpellSlots: number;
  toggleCantrip: (name: string) => void;
  toggleSpell: (name: string) => void;
  isLoadingSpells: boolean;
  alreadyKnownCantrips: string[];
  alreadyKnownSpells: string[];
  // Prepare (prepared casters)
  selectedPreparedSpells: string[];
  togglePreparedSpell: (name: string) => void;
  maxPreparedSpells: number;
  needsPreparation: boolean;
  // Confirm
  isConfirming: boolean;
  confirm: () => Promise<GameState>;
  error: string | null;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useLevelUp(
  pending: PendingLevelUp,
  player: PlayerState,
  characterId: string,
): UseLevelUpReturn {
  // ── Derived values ─────────────────────────────────────────────────────────
  const totalCantripSlots = pending.levels.reduce((sum, l) => sum + l.newCantripSlots, 0);
  const totalSpellSlots = pending.levels.reduce((sum, l) => sum + l.newSpellSlots, 0);
  const needsPreparation = pending.levels.some(l => l.maxPreparedSpells != null && l.maxPreparedSpells > 0);
  // Last level's maxPreparedSpells is the target for the "prepare" step
  const maxPreparedSpells = pending.levels.reduce(
    (max, l) => l.maxPreparedSpells != null ? l.maxPreparedSpells : max,
    player.maxPreparedSpells ?? 0,
  );

  // ── Step computation ────────────────────────────────────────────────────────
  const steps = useMemo<LevelUpStep[]>(() => {
    const s: LevelUpStep[] = ["summary"];
    if (pending.levels.some((l) => l.requiresSubclass)) s.push("subclass");
    if (pending.levels.some((l) => l.isASILevel)) s.push("asi");
    if (pending.levels.some((l) => l.featureChoices.length > 0)) s.push("features");
    // "spells" step: for known casters (incremental learning) and cantrip learners
    if (totalCantripSlots > 0 || (totalSpellSlots > 0 && !needsPreparation)) s.push("spells");
    // "prepare" step: for all prepared casters
    if (needsPreparation) s.push("prepare");
    s.push("confirm");
    return s;
  }, [pending, totalCantripSlots, totalSpellSlots, needsPreparation]);

  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = steps[stepIndex];

  // ── Subclass ────────────────────────────────────────────────────────────────
  const [archetypes, setArchetypes] = useState<SRDArchetype[]>([]);
  const [selectedSubclass, setSelectedSubclass] = useState<string | null>(null);
  const [isLoadingArchetypes, setIsLoadingArchetypes] = useState(false);

  const loadArchetypes = useCallback(async () => {
    if (archetypes.length > 0) return;
    setIsLoadingArchetypes(true);
    try {
      const res = await fetch(`/api/srd?type=classes`);
      if (res.ok) {
        const classes = await res.json();
        const cls = classes.find(
          (c: { slug: string }) => c.slug === player.characterClass.toLowerCase(),
        );
        if (cls?.archetypes) setArchetypes(cls.archetypes);
      }
    } finally {
      setIsLoadingArchetypes(false);
    }
  }, [archetypes.length, player.characterClass]);

  // ── ASI / Feat ──────────────────────────────────────────────────────────────
  const [asiStates, setASIStates] = useState<ASIState[]>(() =>
    pending.levels
      .filter((l) => l.isASILevel)
      .map((l) => ({ level: l.level, mode: "asi" as const, points: {} })),
  );
  const [feats, setFeats] = useState<SRDFeat[]>([]);
  const [isLoadingFeats, setIsLoadingFeats] = useState(false);

  const loadFeats = useCallback(async () => {
    if (feats.length > 0) return;
    setIsLoadingFeats(true);
    try {
      const res = await fetch(`/api/srd?type=feats`);
      if (res.ok) setFeats(await res.json());
    } finally {
      setIsLoadingFeats(false);
    }
  }, [feats.length]);

  function setASIMode(level: number, mode: "asi" | "feat") {
    setASIStates((prev) =>
      prev.map((a) =>
        a.level === level ? { ...a, mode, points: {}, featChoice: undefined } : a,
      ),
    );
  }

  function adjustASI(level: number, stat: keyof CharacterStats, delta: 1 | -1) {
    setASIStates((prev) => {
      // Compute cumulative ASI boosts from all prior ASI levels for this stat
      const priorBoost = prev
        .filter((a) => a.level < level && a.mode === "asi")
        .reduce((sum, a) => sum + (a.points[stat] ?? 0), 0);

      return prev.map((a) => {
        if (a.level !== level) return a;
        const current = a.points[stat] ?? 0;
        const newVal = current + delta;
        if (newVal < 0 || newVal > 2) return a;
        const totalOther = Object.entries(a.points)
          .filter(([k]) => k !== stat)
          .reduce((sum, [, v]) => sum + (v ?? 0), 0);
        if (totalOther + newVal > 2) return a;
        // Cap: base stat + all prior ASI boosts + this level's bonus cannot exceed 20
        if (delta > 0 && player.stats[stat] + priorBoost + newVal > 20) return a;
        return { ...a, points: { ...a.points, [stat]: newVal || undefined } };
      });
    });
  }

  function setFeatChoice(level: number, feat: string) {
    setASIStates((prev) =>
      prev.map((a) => (a.level === level ? { ...a, featChoice: feat } : a)),
    );
  }

  // ── Feature choices ─────────────────────────────────────────────────────────
  const [featureChoices, setFeatureChoicesState] = useState<Record<string, string>>({});

  function setFeatureChoice(featureName: string, choice: string) {
    setFeatureChoicesState((prev) => ({ ...prev, [featureName]: choice }));
  }

  const allFeatureChoicelevels = pending.levels.filter((l) => l.featureChoices.length > 0);
  const allFeatureChoicesMade = allFeatureChoicelevels.every((l) =>
    l.featureChoices.every((fc) => {
      const val = featureChoices[fc.name]?.trim();
      if (!val) return false;
      if (fc.picks && fc.picks > 1) {
        return val.split(",").map((s) => s.trim()).filter(Boolean).length === fc.picks;
      }
      return true;
    }),
  );

  // ── Spells (known casters + cantrip learners) ─────────────────────────────
  const [availableCantrips, setAvailableCantrips] = useState<SpellOption[]>([]);
  const [availableSpells, setAvailableSpells] = useState<SpellOption[][]>([]);
  const [selectedCantrips, setSelectedCantrips] = useState<string[]>([]);
  const [selectedSpells, setSelectedSpells] = useState<string[]>([]);
  const [isLoadingSpells, setIsLoadingSpells] = useState(false);

  const alreadyKnownCantrips = player.cantrips ?? [];
  const alreadyKnownSpells = player.knownSpells ?? [];

  const loadSpells = useCallback(async () => {
    if (availableCantrips.length > 0 || availableSpells.length > 0) return;
    setIsLoadingSpells(true);
    try {
      const classSlug = player.characterClass.toLowerCase();
      const maxSpellLevel = Math.max(...pending.levels.map((l) => l.maxNewSpellLevel));

      // Build all fetches and await in parallel
      const spellLevelPromises: Promise<SpellOption[]>[] = [];
      for (let sl = 1; sl <= maxSpellLevel; sl++) {
        spellLevelPromises.push(
          fetch(`/api/srd?type=class-spells&classSlug=${classSlug}&level=${sl}`)
            .then((r) => (r.ok ? r.json() : [])),
        );
      }

      const [cantrips, ...spellsByLevel] = await Promise.all([
        totalCantripSlots > 0
          ? fetch(`/api/srd?type=class-spells&classSlug=${classSlug}&level=0`)
              .then((r) => (r.ok ? r.json() : []))
          : Promise.resolve([]),
        ...spellLevelPromises,
      ]);

      setAvailableCantrips(cantrips);
      setAvailableSpells(spellsByLevel);
    } finally {
      setIsLoadingSpells(false);
    }
  }, [availableCantrips.length, availableSpells.length, player.characterClass, pending.levels, totalCantripSlots]);

  function toggleCantrip(name: string) {
    setSelectedCantrips((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      if (prev.length >= totalCantripSlots) return prev;
      return [...prev, name];
    });
  }

  function toggleSpell(name: string) {
    setSelectedSpells((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      if (prev.length >= totalSpellSlots) return prev;
      return [...prev, name];
    });
  }

  // ── Prepare (prepared casters) ─────────────────────────────────────────────
  const [selectedPreparedSpells, setSelectedPreparedSpells] = useState<string[]>(
    () => player.preparedSpells ?? [],
  );

  /**
   * Load available spells for the "prepare" step.
   * Reuses the same availableSpells state — triggers loadSpells if not yet loaded.
   */
  const loadPrepareSpells = useCallback(async () => {
    // Reuse the same loading mechanism as the "spells" step
    if (availableSpells.length > 0) return;
    setIsLoadingSpells(true);
    try {
      const classSlug = player.characterClass.toLowerCase();
      const maxSpellLevel = Math.max(...pending.levels.map((l) => l.maxNewSpellLevel));

      const spellLevelPromises: Promise<SpellOption[]>[] = [];
      for (let sl = 1; sl <= maxSpellLevel; sl++) {
        spellLevelPromises.push(
          fetch(`/api/srd?type=class-spells&classSlug=${classSlug}&level=${sl}`)
            .then((r) => (r.ok ? r.json() : [])),
        );
      }

      // Also load cantrips if the spells step needs them
      const [cantrips, ...spellsByLevel] = await Promise.all([
        totalCantripSlots > 0
          ? fetch(`/api/srd?type=class-spells&classSlug=${classSlug}&level=0`)
              .then((r) => (r.ok ? r.json() : []))
          : Promise.resolve([]),
        ...spellLevelPromises,
      ]);

      setAvailableCantrips(cantrips);
      setAvailableSpells(spellsByLevel);
    } finally {
      setIsLoadingSpells(false);
    }
  }, [availableSpells.length, player.characterClass, pending.levels, totalCantripSlots]);

  function togglePreparedSpell(name: string) {
    setSelectedPreparedSpells((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      if (prev.length >= maxPreparedSpells) return prev;
      return [...prev, name];
    });
  }

  // ── Step validation ─────────────────────────────────────────────────────────
  const canGoNext = useMemo(() => {
    switch (currentStep) {
      case "summary":
        return true;
      case "subclass":
        return selectedSubclass != null;
      case "asi":
        return asiStates.every((a) => {
          if (a.mode === "feat") return !!a.featChoice;
          const total = Object.values(a.points).reduce((sum, v) => sum + (v ?? 0), 0);
          return total === 2;
        });
      case "features":
        return allFeatureChoicesMade;
      case "spells":
        return (
          selectedCantrips.length === totalCantripSlots &&
          selectedSpells.length === totalSpellSlots
        );
      case "prepare":
        return selectedPreparedSpells.length === maxPreparedSpells;
      case "confirm":
        return true;
      default:
        return false;
    }
  }, [currentStep, selectedSubclass, asiStates, allFeatureChoicesMade, selectedCantrips, selectedSpells, totalCantripSlots, totalSpellSlots, selectedPreparedSpells, maxPreparedSpells]);

  const canGoBack = stepIndex > 0;

  // ── Navigation with lazy loading ───────────────────────────────────────────
  function goNext() {
    if (!canGoNext || stepIndex >= steps.length - 1) return;
    const nextStep = steps[stepIndex + 1];
    // Lazy-load data for the upcoming step
    if (nextStep === "subclass") loadArchetypes();
    if (nextStep === "asi") loadFeats();
    if (nextStep === "spells") loadSpells();
    if (nextStep === "prepare") loadPrepareSpells();
    setStepIndex((i) => i + 1);
  }

  function goBack() {
    if (stepIndex <= 0) return;
    setStepIndex((i) => i - 1);
  }

  // ── Confirm ─────────────────────────────────────────────────────────────────
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(): Promise<GameState> {
    setIsConfirming(true);
    setError(null);
    try {
      // Build choices array from wizard state
      const choices = pending.levels.map((levelData: PendingLevelData) => {
        const lvl = levelData.level;
        const asiState = asiStates.find((a) => a.level === lvl);

        return {
          level: lvl,
          asiChoices: asiState?.mode === "asi" ? asiState.points : undefined,
          featChoice: asiState?.mode === "feat" ? asiState.featChoice : undefined,
          featDescription: asiState?.mode === "feat" && asiState.featChoice
            ? feats.find((f) => f.name === asiState.featChoice)?.description
            : undefined,
          subclassChoice:
            levelData.requiresSubclass && selectedSubclass
              ? archetypes.find((a) => a.slug === selectedSubclass)?.name ?? selectedSubclass
              : undefined,
          featureChoices: levelData.featureChoices.length > 0
            ? Object.fromEntries(
                levelData.featureChoices
                  .filter((fc) => featureChoices[fc.name])
                  .map((fc) => [fc.name, featureChoices[fc.name]]),
              )
            : undefined,
          // Cantrips/spells are distributed across all levels that grant them
          // For simplicity, assign all to the first level that grants slots
          newCantrips: levelData.newCantripSlots > 0 ? selectedCantrips : undefined,
          newSpells: levelData.newSpellSlots > 0 ? selectedSpells : undefined,
          // Prepared spells: full list assigned to the last level with maxPreparedSpells
          preparedSpells: levelData.maxPreparedSpells != null ? selectedPreparedSpells : undefined,
        };
      });

      const res = await fetch("/api/levelup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, choices }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Level-up failed");
      }

      const data = await res.json();
      return data.gameState as GameState;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Level-up failed";
      setError(msg);
      throw err;
    } finally {
      setIsConfirming(false);
    }
  }

  return {
    steps,
    currentStep,
    stepIndex,
    canGoNext,
    canGoBack,
    goNext,
    goBack,
    pending,
    archetypes,
    selectedSubclass,
    setSelectedSubclass,
    isLoadingArchetypes,
    asiStates,
    setASIMode,
    adjustASI,
    setFeatChoice,
    feats,
    isLoadingFeats,
    player,
    featureChoices,
    setFeatureChoice,
    allFeatureChoicesMade,
    availableCantrips,
    availableSpells,
    selectedCantrips,
    selectedSpells,
    totalCantripSlots,
    totalSpellSlots,
    toggleCantrip,
    toggleSpell,
    isLoadingSpells,
    alreadyKnownCantrips,
    alreadyKnownSpells,
    selectedPreparedSpells,
    togglePreparedSpell,
    maxPreparedSpells,
    needsPreparation,
    isConfirming,
    confirm,
    error,
  };
}
