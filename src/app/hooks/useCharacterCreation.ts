"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { SRDRace, SRDClass, SRDArchetype } from "../lib/characterStore";
import { getModifier, xpForLevel } from "../lib/gameTypes";
import type { CharacterStats, CharacterFeature, StoryState } from "../lib/gameTypes";
import { CHARACTER_ID_KEY } from "./useChat";

// ─── Point Buy ────────────────────────────────────────────────────────────────

/** Point cost per base score (before racial ASI). Max purchasable base is 15. */
export const POINT_BUY_COSTS: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};
export const POINT_BUY_BUDGET = 27;
export const BASE_STAT_MIN = 8;
export const BASE_STAT_MAX = 15;

function pointCostFor(score: number): number {
  return POINT_BUY_COSTS[score] ?? 0;
}

function totalPointsSpent(stats: CharacterStats): number {
  return Object.values(stats).reduce((sum, v) => sum + pointCostFor(v), 0);
}

// ─── Wizard steps ────────────────────────────────────────────────────────────

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;
// 1 = Race, 2 = Class, 3 = Point Buy, 4 = Skills, 5 = Spells, 6 = Review

const EMPTY_STATS: CharacterStats = {
  strength: 8,
  dexterity: 8,
  constitution: 8,
  intelligence: 8,
  wisdom: 8,
  charisma: 8,
};

export interface ChoiceFeature {
  name: string;
  description: string;
  /** Curated options for the player to pick from. */
  options?: string[];
  /** How many options to pick. Default 1. */
  picks?: number;
}

/**
 * Allowlist of level-1 features that require a character-creation-time choice.
 * Keyed by exact feature name from the SRD. Value is a prompt hint shown to the player.
 *
 * Subclass picks (Divine Domain, Sorcerous Origin, etc.) are handled by StepArchetype.
 * Spell/cantrip selection is handled by StepSpells.
 * Everything else that mentions "choose" in its description is a gameplay decision, not creation-time.
 */
const CREATION_TIME_CHOICES: Record<string, {
  prompt: string;
  options: string[];
  picks?: number; // default 1
}> = {
  "Fighting Style": {
    prompt: "Choose a fighting style",
    options: ["Archery", "Defense", "Dueling", "Great Weapon Fighting", "Protection", "Two-Weapon Fighting"],
  },
  "Favored Enemy": {
    prompt: "Choose a favored enemy type",
    options: ["Aberrations", "Beasts", "Celestials", "Constructs", "Dragons", "Elementals", "Fey", "Fiends", "Giants", "Monstrosities", "Oozes", "Plants", "Undead"],
  },
  "Natural Explorer": {
    prompt: "Choose a favored terrain",
    options: ["Arctic", "Coast", "Desert", "Forest", "Grassland", "Mountain", "Swamp"],
  },
  "Expertise": {
    prompt: "Choose two proficiencies to double",
    options: [
      "Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception",
      "History", "Insight", "Intimidation", "Investigation", "Medicine",
      "Nature", "Perception", "Performance", "Persuasion", "Religion",
      "Sleight of Hand", "Stealth", "Survival", "Thieves' Tools",
    ],
    picks: 2,
  },
};

export interface SpellOption {
  slug: string;
  name: string;
  school: string;
  castingTime: string;
  range: string;
  description: string;
}

export interface CharacterCreationState {
  step: WizardStep;
  races: SRDRace[];
  classes: SRDClass[];
  isLoadingSRD: boolean;
  selectedRace: SRDRace | null;
  selectedClass: SRDClass | null;
  selectedArchetype: SRDArchetype | null;
  showingArchetypeStep: boolean;
  /** Features that require the player to pick an option (e.g. Favored Enemy). */
  choiceFeatures: ChoiceFeature[];
  showingFeatureChoicesStep: boolean;
  featureChoices: Record<string, string>;
  characterName: string;
  selectedGender: string;
  /** Base stats before racial ASI */
  baseStats: CharacterStats;
  pointsRemaining: number;
  selectedSkills: string[];
  // Spell selection
  isSpellcaster: boolean;
  availableCantrips: SpellOption[];
  availableSpells: SpellOption[];
  cantripsToChoose: number;
  spellsToChoose: number;
  selectedCantrips: string[];
  selectedSpells: string[];
  isLoadingSpells: boolean;
  isSaving: boolean;
  error: string | null;
}

export interface UseCharacterCreationReturn extends CharacterCreationState {
  loadSRD: () => Promise<void>;
  selectRace: (race: SRDRace) => void;
  selectClass: (cls: SRDClass) => void;
  selectArchetype: (archetype: SRDArchetype) => void;
  setFeatureChoice: (featureName: string, choice: string) => void;
  confirmFeatureChoices: () => void;
  setCharacterName: (name: string) => void;
  setGender: (gender: string) => void;
  adjustStat: (stat: keyof CharacterStats, delta: 1 | -1) => void;
  toggleSkill: (skill: string) => void;
  toggleCantrip: (name: string) => void;
  toggleSpell: (name: string) => void;
  loadSpellData: () => Promise<void>;
  goToStep: (step: WizardStep) => void;
  /** Computed stats including racial ASI */
  finalStats: CharacterStats;
  /** Total wizard steps (5 for non-casters, 6 for casters) */
  totalSteps: number;
  /** The step number that is "Review" (5 or 6) */
  reviewStep: WizardStep;
  confirm: () => Promise<void>;
}

// ─── Default story state for new characters ───────────────────────────────────

function buildDefaultStory(name: string, className: string): StoryState {
  return {
    campaignTitle: "A New Adventure",
    campaignBackground: "Your adventure is just beginning. The world awaits.",
    currentLocation: "The Starting Town",
    currentScene: `${name} the ${className} has arrived, ready to make their mark on the world.`,
    activeQuests: [],
    importantNPCs: [],
    activeNPCs: [],
    recentEvents: [],
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCharacterCreation(): UseCharacterCreationReturn {
  const router = useRouter();

  const [state, setState] = useState<CharacterCreationState>({
    step: 1,
    races: [],
    classes: [],
    isLoadingSRD: false,
    selectedRace: null,
    selectedClass: null,
    selectedArchetype: null,
    showingArchetypeStep: false,
    choiceFeatures: [],
    showingFeatureChoicesStep: false,
    featureChoices: {},
    characterName: "",
    selectedGender: "",
    baseStats: { ...EMPTY_STATS },
    pointsRemaining: POINT_BUY_BUDGET,
    selectedSkills: [],
    isSpellcaster: false,
    availableCantrips: [],
    availableSpells: [],
    cantripsToChoose: 0,
    spellsToChoose: 0,
    selectedCantrips: [],
    selectedSpells: [],
    isLoadingSpells: false,
    isSaving: false,
    error: null,
  });

  const patch = useCallback((updates: Partial<CharacterCreationState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  /** Load races and classes from API (called once on wizard mount). */
  const loadSRD = useCallback(async () => {
    patch({ isLoadingSRD: true, error: null });
    try {
      const [racesRes, classesRes] = await Promise.all([
        fetch("/api/srd?type=races"),
        fetch("/api/srd?type=classes"),
      ]);

      if (!racesRes.ok || !classesRes.ok) {
        throw new Error("Failed to fetch SRD data");
      }

      const [races, classes]: [SRDRace[], SRDClass[]] = await Promise.all([
        racesRes.json(),
        classesRes.json(),
      ]);

      // Sort alphabetically for consistent display
      races.sort((a, b) => a.name.localeCompare(b.name));
      classes.sort((a, b) => a.name.localeCompare(b.name));
      patch({ races, classes, isLoadingSRD: false });
    } catch (err) {
      patch({
        isLoadingSRD: false,
        error: "Failed to load character options. Check your connection.",
      });
    }
  }, [patch]);

  const selectRace = useCallback((race: SRDRace) => {
    patch({ selectedRace: race, step: 2 });
  }, [patch]);

  /** Check level-1 features against the creation-time choice allowlist. */
  const checkForFeatureChoices = useCallback(async (classSlug: string) => {
    try {
      const res = await fetch(`/api/srd?type=class-level&classSlug=${classSlug}&level=1`);
      if (!res.ok) { patch({ choiceFeatures: [], showingFeatureChoicesStep: false, step: 3 }); return; }
      const data = await res.json() as { features?: Array<{ name: string; description: string }> };
      const choiceFeatures: ChoiceFeature[] = (data.features ?? [])
        .filter((f) => f.name in CREATION_TIME_CHOICES)
        .map((f) => {
          const meta = CREATION_TIME_CHOICES[f.name];
          return {
            ...f,
            description: f.description || meta.prompt,
            options: meta.options,
            picks: meta.picks,
          };
        });
      if (choiceFeatures.length > 0) {
        patch({ choiceFeatures, showingFeatureChoicesStep: true, featureChoices: {} });
      } else {
        patch({ choiceFeatures: [], showingFeatureChoicesStep: false, step: 3 });
      }
    } catch {
      patch({ choiceFeatures: [], showingFeatureChoicesStep: false, step: 3 });
    }
  }, [patch]);

  const selectClass = useCallback((cls: SRDClass) => {
    const isCaster = cls.spellcastingType !== "none";
    if (cls.archetypeLevel === 1 && cls.archetypes.length > 0) {
      patch({ selectedClass: cls, selectedArchetype: null, selectedSkills: [], isSpellcaster: isCaster, showingArchetypeStep: true, showingFeatureChoicesStep: false });
    } else {
      patch({ selectedClass: cls, selectedArchetype: null, selectedSkills: [], isSpellcaster: isCaster, showingArchetypeStep: false });
      checkForFeatureChoices(cls.slug);
    }
  }, [patch, checkForFeatureChoices]);

  const selectArchetype = useCallback((archetype: SRDArchetype) => {
    patch({ selectedArchetype: archetype, showingArchetypeStep: false });
    // Check for feature choices after archetype is confirmed
    setState((prev) => {
      if (prev.selectedClass) checkForFeatureChoices(prev.selectedClass.slug);
      return prev;
    });
  }, [patch, checkForFeatureChoices]);

  const setFeatureChoice = useCallback((featureName: string, choice: string) => {
    setState((prev) => ({
      ...prev,
      featureChoices: { ...prev.featureChoices, [featureName]: choice },
    }));
  }, []);

  const confirmFeatureChoices = useCallback(() => {
    patch({ showingFeatureChoicesStep: false, step: 3 });
  }, [patch]);

  const setCharacterName = useCallback((name: string) => {
    patch({ characterName: name });
  }, [patch]);

  const setGender = useCallback((gender: string) => {
    patch({ selectedGender: gender });
  }, [patch]);

  const adjustStat = useCallback(
    (stat: keyof CharacterStats, delta: 1 | -1) => {
      setState((prev) => {
        const current = prev.baseStats[stat];
        const next = current + delta;

        if (next < BASE_STAT_MIN || next > BASE_STAT_MAX) return prev;

        const newStats = { ...prev.baseStats, [stat]: next };
        const spent = totalPointsSpent(newStats);

        if (spent > POINT_BUY_BUDGET) return prev; // would exceed budget

        return {
          ...prev,
          baseStats: newStats,
          pointsRemaining: POINT_BUY_BUDGET - spent,
        };
      });
    },
    [],
  );

  const toggleSkill = useCallback((skill: string) => {
    setState((prev) => {
      const { selectedSkills, selectedClass } = prev;
      const maxSkills = (selectedClass?.skillChoices ?? 2) +
        (prev.selectedRace?.extraSkillChoices ?? 0);

      if (selectedSkills.includes(skill)) {
        return { ...prev, selectedSkills: selectedSkills.filter((s) => s !== skill) };
      }
      if (selectedSkills.length >= maxSkills) return prev; // at cap
      return { ...prev, selectedSkills: [...selectedSkills, skill] };
    });
  }, []);

  /** Compute final stats by applying racial ASI on top of base stats. */
  const finalStats: CharacterStats = (() => {
    const bonuses = state.selectedRace?.abilityBonuses ?? {};
    const result = { ...state.baseStats };
    for (const [ability, bonus] of Object.entries(bonuses)) {
      const key = ability.toLowerCase() as keyof CharacterStats;
      if (key in result) result[key] = (result[key] ?? 8) + bonus;
    }
    return result;
  })();

  const toggleCantrip = useCallback((name: string) => {
    setState((prev) => {
      if (prev.selectedCantrips.includes(name)) {
        return { ...prev, selectedCantrips: prev.selectedCantrips.filter((c) => c !== name) };
      }
      if (prev.selectedCantrips.length >= prev.cantripsToChoose) return prev;
      return { ...prev, selectedCantrips: [...prev.selectedCantrips, name] };
    });
  }, []);

  const toggleSpell = useCallback((name: string) => {
    setState((prev) => {
      if (prev.selectedSpells.includes(name)) {
        return { ...prev, selectedSpells: prev.selectedSpells.filter((s) => s !== name) };
      }
      if (prev.selectedSpells.length >= prev.spellsToChoose) return prev;
      return { ...prev, selectedSpells: [...prev.selectedSpells, name] };
    });
  }, []);

  /** Load spell data after class + stats are known. */
  const loadSpellData = useCallback(async () => {
    const cls = state.selectedClass;
    if (!cls || cls.spellcastingType === "none") {
      patch({ isSpellcaster: false, isLoadingSpells: false });
      return;
    }

    patch({ isLoadingSpells: true });

    try {
      // Fetch level-1 class data for slot/cantrip counts
      const levelRes = await fetch(`/api/srd?type=class-level&classSlug=${cls.slug}&level=1`);
      if (!levelRes.ok) { patch({ isSpellcaster: false, isLoadingSpells: false }); return; }
      const levelData = await levelRes.json() as {
        spellSlots?: Record<string, number>;
        cantripsKnown?: number;
        spellsKnown?: number;
      };

      const hasSpellSlots = levelData.spellSlots && Object.keys(levelData.spellSlots).length > 0;
      const hasCantrips = (levelData.cantripsKnown ?? 0) > 0;

      if (!hasSpellSlots && !hasCantrips) {
        patch({ isSpellcaster: false, isLoadingSpells: false });
        return;
      }

      // Fetch cantrips and level-1 spells in parallel
      const [cantripsRes, spellsRes] = await Promise.all([
        hasCantrips
          ? fetch(`/api/srd?type=class-spells&classSlug=${cls.slug}&level=0`)
          : Promise.resolve(null),
        hasSpellSlots
          ? fetch(`/api/srd?type=class-spells&classSlug=${cls.slug}&level=1`)
          : Promise.resolve(null),
      ]);

      const availableCantrips: SpellOption[] = cantripsRes?.ok
        ? await cantripsRes.json()
        : [];
      const availableSpells: SpellOption[] = spellsRes?.ok
        ? await spellsRes.json()
        : [];

      const cantripsToChoose = levelData.cantripsKnown ?? 0;

      // Compute spellsToChoose
      let spellsToChoose = 0;
      if (levelData.spellsKnown) {
        // Known caster (Bard, Ranger, Sorcerer, Warlock) — fixed from class table
        spellsToChoose = levelData.spellsKnown;
      } else if (hasSpellSlots) {
        // Prepared caster (Cleric, Druid, Paladin, Wizard) — ability_mod + level
        const raw = cls.spellcastingAbility || cls.primaryAbility || "";
        const ability = raw.toLowerCase();
        const abilityKey = (
          ability === "wisdom" || ability === "charisma" || ability === "intelligence"
            ? ability
            : ability.includes("wisdom") ? "wisdom"
            : ability.includes("charisma") ? "charisma"
            : ability.includes("intelligence") ? "intelligence"
            : null
        ) as keyof typeof finalStats | null;
        if (abilityKey) {
          const mod = getModifier(finalStats[abilityKey]);
          spellsToChoose = Math.max(1, mod + 1); // level 1
        }
      }

      patch({
        isSpellcaster: true,
        availableCantrips,
        availableSpells,
        cantripsToChoose,
        spellsToChoose,
        selectedCantrips: [],
        selectedSpells: [],
        isLoadingSpells: false,
      });
    } catch {
      patch({ isSpellcaster: false, isLoadingSpells: false });
    }
  }, [state.selectedClass, finalStats, patch]);

  const goToStep = useCallback((step: WizardStep) => {
    patch({ step, error: null, showingArchetypeStep: false, showingFeatureChoicesStep: false });
  }, [patch]);

  /** Build and save the character via API, then redirect to /dashboard. */
  const confirm = useCallback(async () => {
    const { selectedRace, selectedClass, characterName, selectedSkills } = state;

    if (!selectedRace || !selectedClass || !characterName.trim() || !state.selectedGender) {
      patch({ error: "Please complete all steps before confirming." });
      return;
    }

    patch({ isSaving: true, error: null });

    try {
      // Fetch level-1 features from API
      const classSlug = selectedClass.slug;
      const levelRes = await fetch(`/api/srd?type=class-level&classSlug=${classSlug}&level=1`);
      const levelData = levelRes.ok ? await levelRes.json() : null;

      // Collect race traits + class features + archetype into CharacterFeature[]
      const features: CharacterFeature[] = [
        ...(selectedRace.traits ?? []).map((t) => ({
          name: t.name,
          description: t.description,
          level: 0, // 0 = racial, not from a class level
          source: selectedRace.name,
        })),
        ...(levelData?.features ?? []).map((f: { name: string; description: string }) => ({
          name: f.name,
          description: f.description,
          level: 1,
          source: selectedClass.name,
          ...(state.featureChoices[f.name] ? { chosenOption: state.featureChoices[f.name] } : {}),
        })),
        ...(state.selectedArchetype ? [{
          name: state.selectedArchetype.name,
          description: state.selectedArchetype.description,
          level: 1,
          source: `${selectedClass.name} 1`,
        }] : []),
      ];

      // Compute derived HP: hitDie + CON modifier (max roll at level 1)
      const conMod = getModifier(finalStats.constitution);
      const maxHP = selectedClass.hitDie + conMod;

      // Saving throw proficiencies come from the class
      const savingThrowProficiencies = selectedClass.savingThrows;

      // Skill proficiencies: class-chosen + fixed racial grants
      const racialSkills = selectedRace.skillProficiencies ?? [];
      const skillProficiencies = Array.from(new Set([...selectedSkills, ...racialSkills]));

      // AC: 10 + DEX modifier (unarmored default — DM will set proper AC after equipping)
      const armorClass = 10 + getModifier(finalStats.dexterity);

      // Determine spellcasting ability for casters (from SRD class data)
      const spellcastingAbility = (
        selectedClass.spellcastingAbility?.toLowerCase() || undefined
      ) as keyof import("../lib/gameTypes").CharacterStats | undefined;

      const player = {
        name: characterName.trim(),
        gender: state.selectedGender,
        characterClass: selectedClass.name,
        race: selectedRace.name,
        level: 1,
        hitDie: selectedClass.hitDie,
        xp: 0,
        xpToNextLevel: xpForLevel(2),
        currentHP: maxHP,
        maxHP,
        armorClass,
        stats: finalStats,
        savingThrowProficiencies,
        skillProficiencies,
        features,
        inventory: [],
        conditions: [],
        gold: 0,
        weaponDamage: {},
        ...(state.selectedArchetype ? { subclass: state.selectedArchetype.name } : {}),
        // Spellcasting (only for casters)
        ...(state.isSpellcaster && spellcastingAbility ? {
          spellcastingAbility,
          cantrips: state.selectedCantrips,
          maxCantrips: state.cantripsToChoose,
          knownSpells: state.selectedSpells,
          maxKnownSpells: state.spellsToChoose,
          spellSlots: (levelData?.spellSlots as Record<string, number>) ?? {},
          spellSlotsUsed: {} as Record<string, number>,
        } : {}),
      };

      const story = buildDefaultStory(characterName.trim(), selectedClass.name);

      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player, story }),
      });

      if (!res.ok) {
        throw new Error("Failed to create character");
      }

      const { id } = await res.json() as { id: string };
      localStorage.setItem(CHARACTER_ID_KEY, id);
      router.replace("/dashboard");
    } catch (err) {
      console.error("[useCharacterCreation] confirm error:", err);
      patch({
        isSaving: false,
        error: "Failed to save character. Please try again.",
      });
    }
  }, [state, finalStats, patch, router]);

  const totalSteps = state.isSpellcaster ? 6 : 5;
  const reviewStep: WizardStep = state.isSpellcaster ? 6 : 5;

  return {
    ...state,
    loadSRD,
    selectRace,
    selectClass,
    selectArchetype,
    setFeatureChoice,
    confirmFeatureChoices,
    setCharacterName,
    setGender,
    adjustStat,
    toggleSkill,
    toggleCantrip,
    toggleSpell,
    loadSpellData,
    goToStep,
    finalStats,
    totalSteps,
    reviewStep,
    confirm,
  };
}
