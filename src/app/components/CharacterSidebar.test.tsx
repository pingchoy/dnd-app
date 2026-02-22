import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CharacterSidebar from "./CharacterSidebar";
import type { PlayerState } from "../lib/gameTypes";

// ─── Fixture ────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    name: "Thorin",
    gender: "male",
    characterClass: "fighter",
    race: "dwarf",
    level: 5,
    hitDie: 10,
    xp: 6500,
    xpToNextLevel: 14000,
    currentHP: 35,
    maxHP: 40,
    armorClass: 18,
    stats: {
      strength: 16,
      dexterity: 12,
      constitution: 14,
      intelligence: 8,
      wisdom: 10,
      charisma: 10,
    },
    savingThrowProficiencies: ["strength", "constitution"],
    skillProficiencies: ["athletics", "perception"],
    weaponProficiencies: ["simple weapons", "martial weapons"],
    armorProficiencies: ["all armor", "shields"],
    features: [],
    inventory: ["chain mail", "shield", "battleaxe"],
    conditions: [],
    gold: 75,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("CharacterSidebar", () => {
  it("renders player name", () => {
    render(<CharacterSidebar player={makePlayer()} onOpenFullSheet={vi.fn()} />);

    expect(screen.getByText("Thorin")).toBeInTheDocument();
  });

  it("renders race, class, and level", () => {
    render(<CharacterSidebar player={makePlayer()} onOpenFullSheet={vi.fn()} />);

    // toDisplayCase makes them capitalized
    expect(screen.getByText(/Dwarf/)).toBeInTheDocument();
    expect(screen.getByText(/Fighter/)).toBeInTheDocument();
    expect(screen.getByText(/Lv\.5/)).toBeInTheDocument();
  });

  it("renders HP values", () => {
    render(
      <CharacterSidebar player={makePlayer({ currentHP: 25, maxHP: 40 })} onOpenFullSheet={vi.fn()} />,
    );

    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText(/\/ 40/)).toBeInTheDocument();
  });

  it("renders AC value", () => {
    render(<CharacterSidebar player={makePlayer({ armorClass: 18 })} onOpenFullSheet={vi.fn()} />);

    expect(screen.getByText("18")).toBeInTheDocument();
  });

  it("renders gold amount", () => {
    render(<CharacterSidebar player={makePlayer({ gold: 75 })} onOpenFullSheet={vi.fn()} />);

    expect(screen.getByText("75gp")).toBeInTheDocument();
  });

  it("renders inventory items", () => {
    render(
      <CharacterSidebar
        player={makePlayer({ inventory: ["longsword", "shield", "rope"] })}
        onOpenFullSheet={vi.fn()}
      />,
    );

    expect(screen.getByText("Longsword")).toBeInTheDocument();
    expect(screen.getByText("Shield")).toBeInTheDocument();
    expect(screen.getByText("Rope")).toBeInTheDocument();
  });

  it("shows 'Nothing carried' when inventory is empty", () => {
    render(
      <CharacterSidebar player={makePlayer({ inventory: [] })} onOpenFullSheet={vi.fn()} />,
    );

    expect(screen.getByText("Nothing carried.")).toBeInTheDocument();
  });

  it("renders conditions when present", () => {
    render(
      <CharacterSidebar
        player={makePlayer({ conditions: ["poisoned", "stunned"] })}
        onOpenFullSheet={vi.fn()}
      />,
    );

    expect(screen.getByText("Poisoned")).toBeInTheDocument();
    expect(screen.getByText("Stunned")).toBeInTheDocument();
  });

  it("does not render conditions section when empty", () => {
    render(
      <CharacterSidebar player={makePlayer({ conditions: [] })} onOpenFullSheet={vi.fn()} />,
    );

    expect(screen.queryByText("Conditions")).not.toBeInTheDocument();
  });

  it("renders ability score modifiers", () => {
    render(
      <CharacterSidebar
        player={makePlayer({ stats: { strength: 16, dexterity: 12, constitution: 14, intelligence: 8, wisdom: 10, charisma: 10 } })}
        onOpenFullSheet={vi.fn()}
      />,
    );

    // STR 16 => +3 (appears multiple times: modifier + Prof bonus)
    const plusThrees = screen.getAllByText("+3");
    expect(plusThrees.length).toBeGreaterThanOrEqual(1);
    // INT 8 => -1
    expect(screen.getByText("-1")).toBeInTheDocument();
  });

  it("renders XP bar", () => {
    render(
      <CharacterSidebar player={makePlayer({ xp: 6500, xpToNextLevel: 14000 })} onOpenFullSheet={vi.fn()} />,
    );

    expect(screen.getByText(/XP 6,500/)).toBeInTheDocument();
    expect(screen.getByText(/14,000/)).toBeInTheDocument();
  });

  it("calls onOpenFullSheet when button is clicked", async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    render(<CharacterSidebar player={makePlayer()} onOpenFullSheet={handler} />);

    await user.click(screen.getByText("Full Character Sheet"));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("renders subclass when present", () => {
    render(
      <CharacterSidebar
        player={makePlayer({ subclass: "champion" })}
        onOpenFullSheet={vi.fn()}
      />,
    );

    expect(screen.getByText("Champion")).toBeInTheDocument();
  });

  it("renders spell slots for casters", () => {
    render(
      <CharacterSidebar
        player={makePlayer({
          characterClass: "wizard",
          spellSlots: { "1": 4, "2": 3 },
          spellSlotsUsed: { "1": 1 },
        })}
        onOpenFullSheet={vi.fn()}
      />,
    );

    expect(screen.getByText("Spell Slots")).toBeInTheDocument();
    expect(screen.getByText("Lvl 1")).toBeInTheDocument();
    expect(screen.getByText("Lvl 2")).toBeInTheDocument();
  });
});
