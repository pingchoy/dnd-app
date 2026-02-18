"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { SRDRace, SRDClass } from "../lib/characterStore";
import {
  createCharacter,
  getAllSRDClasses,
  getAllSRDRaces,
  getSRDClassLevel,
} from "../lib/characterStore";
import { getModifier } from "../lib/gameState";
import type { CharacterStats, CharacterFeature, StoryState } from "../lib/gameState";
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

export type WizardStep = 1 | 2 | 3 | 4 | 5;
// 1 = Race, 2 = Class, 3 = Point Buy, 4 = Skills, 5 = Review

const EMPTY_STATS: CharacterStats = {
  strength: 8,
  dexterity: 8,
  constitution: 8,
  intelligence: 8,
  wisdom: 8,
  charisma: 8,
};

export interface CharacterCreationState {
  step: WizardStep;
  races: SRDRace[];
  classes: SRDClass[];
  isLoadingSRD: boolean;
  selectedRace: SRDRace | null;
  selectedClass: SRDClass | null;
  characterName: string;
  /** Base stats before racial ASI */
  baseStats: CharacterStats;
  pointsRemaining: number;
  selectedSkills: string[];
  isSaving: boolean;
  error: string | null;
}

export interface UseCharacterCreationReturn extends CharacterCreationState {
  loadSRD: () => Promise<void>;
  selectRace: (race: SRDRace) => void;
  selectClass: (cls: SRDClass) => void;
  setCharacterName: (name: string) => void;
  adjustStat: (stat: keyof CharacterStats, delta: 1 | -1) => void;
  toggleSkill: (skill: string) => void;
  goToStep: (step: WizardStep) => void;
  /** Computed stats including racial ASI */
  finalStats: CharacterStats;
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
    characterName: "",
    baseStats: { ...EMPTY_STATS },
    pointsRemaining: POINT_BUY_BUDGET,
    selectedSkills: [],
    isSaving: false,
    error: null,
  });

  const patch = useCallback((updates: Partial<CharacterCreationState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  /** Load races and classes from Firestore (called once on wizard mount). */
  const loadSRD = useCallback(async () => {
    patch({ isLoadingSRD: true, error: null });
    try {
      const [races, classes] = await Promise.all([getAllSRDRaces(), getAllSRDClasses()]);
      // Sort alphabetically for consistent display
      races.sort((a, b) => a.name.localeCompare(b.name));
      classes.sort((a, b) => a.name.localeCompare(b.name));
      patch({ races, classes, isLoadingSRD: false });
    } catch (err) {
      patch({
        isLoadingSRD: false,
        error: "Failed to load character options. Check your Firestore connection.",
      });
    }
  }, [patch]);

  const selectRace = useCallback((race: SRDRace) => {
    patch({ selectedRace: race, step: 2 });
  }, [patch]);

  const selectClass = useCallback((cls: SRDClass) => {
    patch({ selectedClass: cls, selectedSkills: [], step: 3 });
  }, [patch]);

  const setCharacterName = useCallback((name: string) => {
    patch({ characterName: name });
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

  const goToStep = useCallback((step: WizardStep) => {
    patch({ step, error: null });
  }, [patch]);

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

  /** Build and save the character to Firestore, then redirect to /dashboard. */
  const confirm = useCallback(async () => {
    const { selectedRace, selectedClass, characterName, baseStats, selectedSkills } = state;

    if (!selectedRace || !selectedClass || !characterName.trim()) {
      patch({ error: "Please complete all steps before confirming." });
      return;
    }

    patch({ isSaving: true, error: null });

    try {
      // Fetch level-1 features from Firestore
      const classSlug = selectedClass.slug;
      const levelData = await getSRDClassLevel(classSlug, 1);

      // Collect race traits + class features into CharacterFeature[]
      const features: CharacterFeature[] = [
        ...(selectedRace.traits ?? []).map((t) => ({
          name: t.name,
          description: t.description,
          level: 0, // 0 = racial, not from a class level
        })),
        ...(levelData?.features ?? []).map((f) => ({
          name: f.name,
          description: f.description,
          level: 1,
        })),
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

      const player = {
        name: characterName.trim(),
        characterClass: selectedClass.name,
        race: selectedRace.name,
        level: 1,
        hitDie: selectedClass.hitDie,
        xp: 0,
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
      };

      const story = buildDefaultStory(characterName.trim(), selectedClass.name);
      const id = await createCharacter(player, story);

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

  return {
    ...state,
    loadSRD,
    selectRace,
    selectClass,
    setCharacterName,
    adjustStat,
    toggleSkill,
    goToStep,
    finalStats,
    confirm,
  };
}
