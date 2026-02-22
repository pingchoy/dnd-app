import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LevelUpWizard from "./LevelUpWizard";
import type { PendingLevelUp, PlayerState, GameState } from "../../lib/gameTypes";

// ─── Mock the useLevelUp hook ───────────────────────────────────────────────

const mockUseLevelUp = vi.fn();

vi.mock("../../hooks/useLevelUp", () => ({
  useLevelUp: (...args: unknown[]) => mockUseLevelUp(...args),
}));

// Mock sub-components to simplify — just render a marker
vi.mock("./LevelUpSummary", () => ({
  default: () => <div data-testid="step-summary">Summary Step</div>,
}));
vi.mock("./LevelUpSubclass", () => ({
  default: () => <div data-testid="step-subclass">Subclass Step</div>,
}));
vi.mock("./LevelUpASI", () => ({
  default: () => <div data-testid="step-asi">ASI Step</div>,
}));
vi.mock("./LevelUpFeatureChoices", () => ({
  default: () => <div data-testid="step-features">Features Step</div>,
}));
vi.mock("./LevelUpSpells", () => ({
  default: () => <div data-testid="step-spells">Spells Step</div>,
}));
vi.mock("./LevelUpConfirm", () => ({
  default: () => <div data-testid="step-confirm">Confirm Step</div>,
}));

// ─── Fixtures ───────────────────────────────────────────────────────────────

const pending: PendingLevelUp = {
  fromLevel: 4,
  toLevel: 5,
  levels: [
    {
      level: 5,
      hpIncrease: 7,
      newFeatures: [],
    },
  ],
};

const player: PlayerState = {
  name: "Test Hero",
  gender: "male",
  characterClass: "fighter",
  race: "human",
  level: 4,
  hitDie: 10,
  xp: 6500,
  xpToNextLevel: 14000,
  currentHP: 30,
  maxHP: 30,
  armorClass: 16,
  stats: {
    strength: 16, dexterity: 14, constitution: 14,
    intelligence: 10, wisdom: 12, charisma: 8,
  },
  savingThrowProficiencies: ["strength", "constitution"],
  skillProficiencies: ["athletics", "perception"],
  weaponProficiencies: ["simple weapons", "martial weapons"],
  armorProficiencies: ["all armor", "shields"],
  features: [],
  inventory: ["chain mail", "shield", "longsword"],
  conditions: [],
  gold: 50,
};

function makeMockHook(stepOverrides: Record<string, unknown> = {}) {
  return {
    steps: ["summary", "confirm"],
    currentStep: "summary",
    stepIndex: 0,
    canGoNext: true,
    canGoBack: false,
    goNext: vi.fn(),
    goBack: vi.fn(),
    pending,
    archetypes: [],
    selectedSubclass: null,
    setSelectedSubclass: vi.fn(),
    isLoadingArchetypes: false,
    asiStates: [],
    setASIMode: vi.fn(),
    adjustASI: vi.fn(),
    setFeatChoice: vi.fn(),
    feats: [],
    isLoadingFeats: false,
    featureChoices: {},
    setFeatureChoice: vi.fn(),
    availableCantrips: [],
    availableSpells: [],
    selectedCantrips: [],
    selectedSpells: [],
    totalCantripSlots: 0,
    totalSpellSlots: 0,
    toggleCantrip: vi.fn(),
    toggleSpell: vi.fn(),
    isLoadingSpells: false,
    alreadyKnownCantrips: [],
    alreadyKnownSpells: [],
    isConfirming: false,
    error: null,
    confirm: vi.fn(),
    ...stepOverrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("LevelUpWizard", () => {
  it("renders summary step when currentStep is 'summary'", () => {
    mockUseLevelUp.mockReturnValue(makeMockHook({ currentStep: "summary" }));

    render(
      <LevelUpWizard
        pending={pending}
        player={player}
        characterId="char-1"
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getByTestId("step-summary")).toBeInTheDocument();
    expect(screen.queryByTestId("step-confirm")).not.toBeInTheDocument();
  });

  it("renders confirm step when currentStep is 'confirm'", () => {
    mockUseLevelUp.mockReturnValue(makeMockHook({
      currentStep: "confirm",
      stepIndex: 1,
      canGoBack: true,
      canGoNext: false,
    }));

    render(
      <LevelUpWizard
        pending={pending}
        player={player}
        characterId="char-1"
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getByTestId("step-confirm")).toBeInTheDocument();
    expect(screen.queryByTestId("step-summary")).not.toBeInTheDocument();
  });

  it("renders step indicator labels", () => {
    mockUseLevelUp.mockReturnValue(makeMockHook());

    render(
      <LevelUpWizard
        pending={pending}
        player={player}
        characterId="char-1"
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("Confirm")).toBeInTheDocument();
  });

  it("shows navigation footer with Continue button on summary step", () => {
    mockUseLevelUp.mockReturnValue(makeMockHook({ currentStep: "summary" }));

    render(
      <LevelUpWizard
        pending={pending}
        player={player}
        characterId="char-1"
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getByText("Continue")).toBeInTheDocument();
  });

  it("hides navigation footer on confirm step", () => {
    mockUseLevelUp.mockReturnValue(makeMockHook({
      currentStep: "confirm",
      stepIndex: 1,
    }));

    render(
      <LevelUpWizard
        pending={pending}
        player={player}
        characterId="char-1"
        onComplete={vi.fn()}
      />,
    );

    // Navigation footer with "Next"/"Continue"/"Back" is hidden on confirm step
    expect(screen.queryByText("Continue")).not.toBeInTheDocument();
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
  });

  it("renders all step types correctly", () => {
    // Test subclass step
    mockUseLevelUp.mockReturnValue(makeMockHook({
      steps: ["summary", "subclass", "asi", "features", "spells", "confirm"],
      currentStep: "subclass",
      stepIndex: 1,
    }));

    const { unmount } = render(
      <LevelUpWizard pending={pending} player={player} characterId="char-1" onComplete={vi.fn()} />,
    );
    expect(screen.getByTestId("step-subclass")).toBeInTheDocument();
    unmount();

    // Test ASI step
    mockUseLevelUp.mockReturnValue(makeMockHook({
      steps: ["summary", "asi", "confirm"],
      currentStep: "asi",
      stepIndex: 1,
    }));
    const { unmount: u2 } = render(
      <LevelUpWizard pending={pending} player={player} characterId="char-1" onComplete={vi.fn()} />,
    );
    expect(screen.getByTestId("step-asi")).toBeInTheDocument();
    u2();

    // Test features step
    mockUseLevelUp.mockReturnValue(makeMockHook({
      steps: ["summary", "features", "confirm"],
      currentStep: "features",
      stepIndex: 1,
    }));
    const { unmount: u3 } = render(
      <LevelUpWizard pending={pending} player={player} characterId="char-1" onComplete={vi.fn()} />,
    );
    expect(screen.getByTestId("step-features")).toBeInTheDocument();
    u3();

    // Test spells step
    mockUseLevelUp.mockReturnValue(makeMockHook({
      steps: ["summary", "spells", "confirm"],
      currentStep: "spells",
      stepIndex: 1,
    }));
    const { unmount: u4 } = render(
      <LevelUpWizard pending={pending} player={player} characterId="char-1" onComplete={vi.fn()} />,
    );
    expect(screen.getByTestId("step-spells")).toBeInTheDocument();
    u4();
  });
});
