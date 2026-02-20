"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { SRDRace, SRDClass, SRDArchetype } from "../lib/characterStore";
import { getModifier, xpForLevel } from "../lib/gameTypes";
import type { CharacterStats, CharacterFeature, StoryState } from "../lib/gameTypes";
import { CHARACTER_ID_KEY, CHARACTER_IDS_KEY } from "./useChat";

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

export type WizardStepId =
  | "race" | "class" | "archetype" | "features"
  | "abilities" | "skills" | "cantrips" | "spells" | "review";

export const STEP_LABELS: Record<WizardStepId, string> = {
  race: "Race",
  class: "Class",
  archetype: "Origin",
  features: "Features",
  abilities: "Abilities",
  skills: "Skills",
  cantrips: "Cantrips",
  spells: "Spells",
  review: "Review",
};

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
  "fighting style": {
    prompt: "Choose a fighting style",
    options: ["Archery", "Defense", "Dueling", "Great Weapon Fighting", "Protection", "Two-Weapon Fighting"],
  },
  "favored enemy": {
    prompt: "Choose a favored enemy type",
    options: ["Aberrations", "Beasts", "Celestials", "Constructs", "Dragons", "Elementals", "Fey", "Fiends", "Giants", "Monstrosities", "Oozes", "Plants", "Undead"],
  },
  "natural explorer": {
    prompt: "Choose a favored terrain",
    options: ["Arctic", "Coast", "Desert", "Forest", "Grassland", "Mountain", "Swamp"],
  },
  "expertise": {
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
  step: WizardStepId;
  races: SRDRace[];
  classes: SRDClass[];
  isLoadingSRD: boolean;
  selectedRace: SRDRace | null;
  selectedClass: SRDClass | null;
  selectedArchetype: SRDArchetype | null;
  /** Features that require the player to pick an option (e.g. Favored Enemy). */
  choiceFeatures: ChoiceFeature[];
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

/**
 * Compute which wizard steps are active based on current state.
 * Recomputed each render — the step indicator grows as we learn more
 * (e.g. "cantrips"/"spells" appear after loadSpellData resolves).
 */
function computeActiveSteps(state: CharacterCreationState): WizardStepId[] {
  const steps: WizardStepId[] = ["race", "class"];
  if (state.selectedClass?.archetypeLevel === 1 && (state.selectedClass.archetypes?.length ?? 0) > 0)
    steps.push("archetype");
  if (state.choiceFeatures.length > 0)
    steps.push("features");
  steps.push("abilities", "skills");
  if (state.cantripsToChoose > 0) steps.push("cantrips");
  if (state.spellsToChoose > 0) steps.push("spells");
  steps.push("review");
  return steps;
}

export interface UseCharacterCreationReturn extends CharacterCreationState {
  loadSRD: () => Promise<void>;
  selectRace: (race: SRDRace) => void;
  selectClass: (cls: SRDClass) => void;
  advanceFromClass: () => void;
  selectArchetype: (archetype: SRDArchetype) => void;
  advanceFromArchetype: () => void;
  setFeatureChoice: (featureName: string, choice: string) => void;
  setCharacterName: (name: string) => void;
  setGender: (gender: string) => void;
  adjustStat: (stat: keyof CharacterStats, delta: 1 | -1) => void;
  toggleSkill: (skill: string) => void;
  toggleCantrip: (name: string) => void;
  toggleSpell: (name: string) => void;
  loadSpellData: () => Promise<void>;
  goToStep: (step: WizardStepId) => void;
  /** Computed stats including racial ASI */
  finalStats: CharacterStats;
  /** Ordered list of active step IDs for the current class selection */
  activeSteps: WizardStepId[];
  /** Display labels for each active step */
  stepLabels: string[];
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
    step: "race",
    races: [],
    classes: [],
    isLoadingSRD: false,
    selectedRace: null,
    selectedClass: null,
    selectedArchetype: null,
    choiceFeatures: [],
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
    patch({ selectedRace: race });
  }, [patch]);

  /** Check level-1 features against the creation-time choice allowlist. */
  const checkForFeatureChoices = useCallback(async (classSlug: string) => {
    try {
      const res = await fetch(`/api/srd?type=class-level&classSlug=${classSlug}&level=1`);
      if (!res.ok) { patch({ choiceFeatures: [], step: "abilities" }); return; }
      const data = await res.json() as { features?: Array<{ name: string; description: string }> };
      const choiceFeatures: ChoiceFeature[] = (data.features ?? [])
        .filter((f) => f.name.toLowerCase() in CREATION_TIME_CHOICES)
        .map((f) => {
          const meta = CREATION_TIME_CHOICES[f.name.toLowerCase()];
          return {
            ...f,
            description: f.description || meta.prompt,
            options: meta.options,
            picks: meta.picks,
          };
        });
      if (choiceFeatures.length > 0) {
        patch({ choiceFeatures, featureChoices: {}, step: "features" });
      } else {
        patch({ choiceFeatures: [], step: "abilities" });
      }
    } catch {
      patch({ choiceFeatures: [], step: "abilities" });
    }
  }, [patch]);

  const selectClass = useCallback((cls: SRDClass) => {
    const isCaster = cls.spellcastingType !== "none";
    patch({ selectedClass: cls, selectedArchetype: null, selectedSkills: [], isSpellcaster: isCaster });
  }, [patch]);

  /** Advance from the class selection step — navigates to archetype, features, or abilities. */
  const advanceFromClass = useCallback(() => {
    setState((prev) => {
      const cls = prev.selectedClass;
      if (!cls) return prev;
      if (cls.archetypeLevel === 1 && cls.archetypes.length > 0) {
        return { ...prev, step: "archetype" as WizardStepId };
      }
      // checkForFeatureChoices will navigate to "features" or "abilities"
      checkForFeatureChoices(cls.slug);
      return prev;
    });
  }, [checkForFeatureChoices]);

  /** Select an archetype (click-to-highlight only, no navigation). */
  const selectArchetype = useCallback((archetype: SRDArchetype) => {
    patch({ selectedArchetype: archetype });
  }, [patch]);

  /** Advance from the archetype step — checks for feature choices or goes to abilities. */
  const advanceFromArchetype = useCallback(() => {
    setState((prev) => {
      if (prev.selectedClass) checkForFeatureChoices(prev.selectedClass.slug);
      return prev;
    });
  }, [checkForFeatureChoices]);

  const setFeatureChoice = useCallback((featureName: string, choice: string) => {
    setState((prev) => ({
      ...prev,
      featureChoices: { ...prev.featureChoices, [featureName]: choice },
    }));
  }, []);

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

  /**
   * Load available cantrips and spells from the SRD for the selected class.
   *
   * Flow:
   * 1. Fetch level-1 class data (slot counts, cantrips known, spells known)
   * 2. Early-exit if the class has no slots or cantrips at level 1
   * 3. Fetch cantrip and spell lists from the class's spell list in parallel
   * 4. Compute spellsToChoose: fixed count for known-casters (Bard, Sorcerer),
   *    ability_mod + level for prepared-casters (Cleric, Wizard)
   * 5. Navigate to the right step (cantrips, spells, or review)
   */
  const loadSpellData = useCallback(async () => {
    const cls = state.selectedClass;
    if (!cls || cls.spellcastingType === "none") {
      patch({ isSpellcaster: false, isLoadingSpells: false, step: "review" });
      return;
    }

    patch({ isLoadingSpells: true });

    try {
      // Fetch level-1 class data for slot/cantrip counts
      const levelRes = await fetch(`/api/srd?type=class-level&classSlug=${cls.slug}&level=1`);
      if (!levelRes.ok) { patch({ isSpellcaster: false, isLoadingSpells: false, step: "review" }); return; }
      const levelData = await levelRes.json() as {
        spellSlots?: Record<string, number>;
        cantripsKnown?: number;
        spellsKnown?: number;
      };

      const hasSpellSlots = levelData.spellSlots && Object.keys(levelData.spellSlots).length > 0;
      const hasCantrips = (levelData.cantripsKnown ?? 0) > 0;

      if (!hasSpellSlots && !hasCantrips) {
        patch({ isSpellcaster: false, isLoadingSpells: false, step: "review" });
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

      // Navigate to the right spell step after loading
      const nextStep: WizardStepId = cantripsToChoose > 0 ? "cantrips"
        : spellsToChoose > 0 ? "spells"
        : "review";

      patch({
        isSpellcaster: cantripsToChoose > 0 || spellsToChoose > 0,
        availableCantrips,
        availableSpells,
        cantripsToChoose,
        spellsToChoose,
        selectedCantrips: [],
        selectedSpells: [],
        isLoadingSpells: false,
        step: nextStep,
      });
    } catch {
      patch({ isSpellcaster: false, isLoadingSpells: false, step: "review" });
    }
  }, [state.selectedClass, finalStats, patch]);

  const goToStep = useCallback((step: WizardStepId) => {
    patch({ step, error: null });
  }, [patch]);

  /**
   * Finalize character creation: assemble the full PlayerState from wizard
   * selections, POST to /api/characters, store the character ID in localStorage,
   * and redirect to /dashboard.
   *
   * Assembles: racial traits + class features + archetype into features[],
   * computes HP (hitDie + CON mod), AC (10 + DEX mod), skill proficiencies,
   * and spellcasting fields for casters.
   */
  const confirm = useCallback(async () => {
    const { selectedRace, selectedClass, characterName, selectedSkills } = state;

    if (!selectedRace || !selectedClass || !characterName.trim() || !state.selectedGender) {
      patch({ error: "Please complete all steps before confirming." });
      return;
    }

    patch({ isSaving: true, error: null });

    try {
      // Fetch level-1 features and starting equipment from API in parallel
      const classSlug = selectedClass.slug;
      const [levelRes, gearRes] = await Promise.all([
        fetch(`/api/srd?type=class-level&classSlug=${classSlug}&level=1`),
        fetch(`/api/srd?type=starting-equipment&classSlug=${classSlug}`),
      ]);
      const levelData = levelRes.ok ? await levelRes.json() : null;
      const gear = gearRes.ok ? await gearRes.json() : null;

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

      // Weapon + armor proficiencies: class data from Firestore + racial grants
      const weaponProficiencies = Array.from(new Set([
        ...(selectedClass.weaponProficiencies ?? []),
        ...(selectedRace.weaponProficiencies ?? []),
      ]));
      const armorProficiencies = Array.from(new Set([
        ...(selectedClass.armorProficiencies ?? []),
        ...(selectedRace.armorProficiencies ?? []),
      ]));

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
        weaponProficiencies,
        armorProficiencies,
        features,
        inventory: gear?.inventory ?? [],
        conditions: [],
        gold: gear?.gold ?? 0,
        weaponDamage: gear?.weaponDamage ?? {},
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

      // Append to the character IDs array
      let ids: string[] = [];
      try { ids = JSON.parse(localStorage.getItem(CHARACTER_IDS_KEY) ?? "[]"); } catch { ids = []; }
      if (!ids.includes(id)) ids.push(id);
      localStorage.setItem(CHARACTER_IDS_KEY, JSON.stringify(ids));

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

  const activeSteps = computeActiveSteps(state);
  const stepLabels = activeSteps.map((s) => STEP_LABELS[s]);

  return {
    ...state,
    loadSRD,
    selectRace,
    selectClass,
    advanceFromClass,
    selectArchetype,
    advanceFromArchetype,
    setFeatureChoice,
    setCharacterName,
    setGender,
    adjustStat,
    toggleSkill,
    toggleCantrip,
    toggleSpell,
    loadSpellData,
    goToStep,
    finalStats,
    activeSteps,
    stepLabels,
    confirm,
  };
}
