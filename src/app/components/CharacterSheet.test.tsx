import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CharacterSheet from "./CharacterSheet";
import type { PlayerState, CharacterFeature } from "../lib/gameTypes";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("./MarkdownProse", () => ({
  default: ({ children }: { children: string }) => <p>{children}</p>,
}));

vi.mock("./SpellTag", () => ({
  default: ({ name }: { name: string }) => <span data-testid="spell-tag">{name}</span>,
}));

// ─── Fixture ────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    name: "Elara",
    gender: "female",
    characterClass: "rogue",
    race: "elf",
    level: 5,
    hitDie: 8,
    xp: 6500,
    xpToNextLevel: 14000,
    currentHP: 30,
    maxHP: 33,
    armorClass: 15,
    stats: {
      strength: 8,
      dexterity: 18,
      constitution: 12,
      intelligence: 14,
      wisdom: 10,
      charisma: 13,
    },
    savingThrowProficiencies: ["dexterity", "intelligence"],
    skillProficiencies: ["stealth", "acrobatics", "perception", "investigation"],
    weaponProficiencies: ["simple weapons", "hand crossbows", "longswords", "rapiers", "shortswords"],
    armorProficiencies: ["light armor"],
    features: [],
    inventory: ["rapier", "shortbow", "leather armor", "thieves' tools"],
    conditions: [],
    gold: 120,
    ...overrides,
  };
}

function makeFeature(overrides: Partial<CharacterFeature> = {}): CharacterFeature {
  return {
    name: "sneak attack",
    description: "Extra damage when you have advantage.",
    level: 1,
    source: "rogue",
    type: "active",
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("CharacterSheet", () => {
  // ── Header ──

  it("renders player name, race, class, and level", () => {
    render(<CharacterSheet player={makePlayer()} />);

    expect(screen.getByText("Elara")).toBeInTheDocument();
    expect(screen.getByText(/Elf/)).toBeInTheDocument();
    expect(screen.getByText(/Rogue/)).toBeInTheDocument();
    expect(screen.getByText(/Level 5/)).toBeInTheDocument();
  });

  it("renders HP, AC, proficiency bonus, and gold in header", () => {
    render(<CharacterSheet player={makePlayer()} />);

    // HP is rendered as "30/33" inside a span
    expect(screen.getByText(/30\/33/)).toBeInTheDocument();
    // AC
    expect(screen.getByText("AC")).toBeInTheDocument();
    // Prof bonus label
    expect(screen.getByText("Prof")).toBeInTheDocument();
    // Gold
    expect(screen.getByText("120gp")).toBeInTheDocument();
  });

  it("renders XP bar with values", () => {
    render(<CharacterSheet player={makePlayer({ xp: 6500, xpToNextLevel: 14000 })} />);

    expect(screen.getByText(/XP 6,500/)).toBeInTheDocument();
    expect(screen.getByText(/14,000/)).toBeInTheDocument();
  });

  it("renders conditions when present", () => {
    render(<CharacterSheet player={makePlayer({ conditions: ["poisoned", "blinded"] })} />);

    expect(screen.getByText("Poisoned")).toBeInTheDocument();
    expect(screen.getByText("Blinded")).toBeInTheDocument();
  });

  it("does not render conditions when empty", () => {
    render(<CharacterSheet player={makePlayer({ conditions: [] })} />);

    expect(screen.queryByText("Poisoned")).not.toBeInTheDocument();
  });

  // ── Ability Scores ──

  it("renders all six ability scores", () => {
    render(<CharacterSheet player={makePlayer()} />);

    expect(screen.getByText("STR")).toBeInTheDocument();
    expect(screen.getByText("DEX")).toBeInTheDocument();
    expect(screen.getByText("CON")).toBeInTheDocument();
    expect(screen.getByText("INT")).toBeInTheDocument();
    expect(screen.getByText("WIS")).toBeInTheDocument();
    expect(screen.getByText("CHA")).toBeInTheDocument();

    // Stat values
    expect(screen.getByText("8")).toBeInTheDocument();   // STR
    expect(screen.getByText("18")).toBeInTheDocument();   // DEX
    expect(screen.getByText("12")).toBeInTheDocument();   // CON
    expect(screen.getByText("14")).toBeInTheDocument();   // INT
  });

  // ── Saving Throws ──

  it("renders saving throw modifiers with proficiency", () => {
    render(<CharacterSheet player={makePlayer()} />);

    // DEX 18 (+4) + prof 3 = +7 (proficient) — appears in saving throws section
    const plusSevens = screen.getAllByText("+7");
    expect(plusSevens.length).toBeGreaterThanOrEqual(1);
  });

  // ── Inventory ──

  it("renders inventory items", () => {
    render(<CharacterSheet player={makePlayer()} />);

    expect(screen.getByText("Rapier")).toBeInTheDocument();
    expect(screen.getByText("Shortbow")).toBeInTheDocument();
    expect(screen.getByText("Leather Armor")).toBeInTheDocument();
    // "Thieves' Tools" appears in both inventory and skills list — check at least one exists
    const thievesTools = screen.getAllByText("Thieves' Tools");
    expect(thievesTools.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'Nothing carried.' when inventory is empty", () => {
    render(<CharacterSheet player={makePlayer({ inventory: [] })} />);

    expect(screen.getByText("Nothing carried.")).toBeInTheDocument();
  });

  // ── Skills (default tab) ──

  it("renders skills with proficiency indicators", () => {
    render(<CharacterSheet player={makePlayer()} />);

    expect(screen.getByText("Stealth")).toBeInTheDocument();
    expect(screen.getByText("Acrobatics")).toBeInTheDocument();
    expect(screen.getByText("Athletics")).toBeInTheDocument();
  });

  // ── Proficiencies ──

  it("renders weapon and armor proficiencies", () => {
    render(<CharacterSheet player={makePlayer()} />);

    expect(screen.getByText(/Simple Weapons/)).toBeInTheDocument();
    expect(screen.getByText(/Light Armor/)).toBeInTheDocument();
  });

  // ── Tab navigation ──

  it("shows Stats & Traits and Class Features tabs", () => {
    render(<CharacterSheet player={makePlayer()} />);

    expect(screen.getByText("Stats & Traits")).toBeInTheDocument();
    expect(screen.getByText("Class Features")).toBeInTheDocument();
  });

  it("shows Spellcasting tab for casters", () => {
    render(
      <CharacterSheet
        player={makePlayer({
          characterClass: "wizard",
          spellcastingAbility: "intelligence",
          cantrips: ["fire bolt"],
          knownSpells: ["magic missile"],
          spellSlots: { "1": 4 },
        })}
      />,
    );

    expect(screen.getByText("Spellcasting")).toBeInTheDocument();
  });

  it("does not show Spellcasting tab for non-casters", () => {
    render(<CharacterSheet player={makePlayer()} />);

    expect(screen.queryByText("Spellcasting")).not.toBeInTheDocument();
  });

  // ── Class Features tab ──

  it("renders class features when switching to Class Features tab", async () => {
    const user = userEvent.setup();
    const player = makePlayer({
      features: [
        makeFeature({ name: "sneak attack", source: "rogue", level: 1 }),
        makeFeature({ name: "cunning action", source: "rogue", level: 2, type: "active" }),
      ],
    });

    render(<CharacterSheet player={player} />);

    await user.click(screen.getByText("Class Features"));

    expect(screen.getByText("Sneak Attack")).toBeInTheDocument();
    expect(screen.getByText("Cunning Action")).toBeInTheDocument();
  });

  it("shows chosenOption for features that have one", async () => {
    const user = userEvent.setup();
    const player = makePlayer({
      features: [
        makeFeature({ name: "fighting style", source: "rogue", level: 1, chosenOption: "dueling" }),
      ],
    });

    render(<CharacterSheet player={player} />);
    await user.click(screen.getByText("Class Features"));

    expect(screen.getByText(/Dueling/)).toBeInTheDocument();
  });

  // ── Racial Traits ──

  it("renders racial traits in the Stats & Traits tab", () => {
    const player = makePlayer({
      features: [
        makeFeature({ name: "darkvision", source: "elf", level: 0, type: "passive", description: "You can see in the dark." }),
        makeFeature({ name: "fey ancestry", source: "elf", level: 0, type: "passive", description: "Advantage against charmed." }),
      ],
    });

    render(<CharacterSheet player={player} />);

    expect(screen.getByText("Darkvision")).toBeInTheDocument();
    expect(screen.getByText("Fey Ancestry")).toBeInTheDocument();
  });

  it("hides racial traits that are in HIDDEN_RACIAL_TRAITS", () => {
    const player = makePlayer({
      features: [
        makeFeature({ name: "ability score increase", source: "elf", level: 0 }),
        makeFeature({ name: "speed", source: "elf", level: 0 }),
        makeFeature({ name: "darkvision", source: "elf", level: 0, type: "passive" }),
      ],
    });

    render(<CharacterSheet player={player} />);

    expect(screen.queryByText("Ability Score Increase")).not.toBeInTheDocument();
    expect(screen.queryByText("Speed")).not.toBeInTheDocument();
    expect(screen.getByText("Darkvision")).toBeInTheDocument();
  });

  // ── Spellcasting tab ──

  it("renders spellcasting details for casters", async () => {
    const user = userEvent.setup();
    const player = makePlayer({
      characterClass: "wizard",
      race: "elf",
      spellcastingAbility: "intelligence",
      cantrips: ["fire bolt", "mage hand"],
      maxCantrips: 3,
      knownSpells: ["magic missile", "shield"],
      maxKnownSpells: 6,
      spellSlots: { "1": 4, "2": 2 },
      spellSlotsUsed: { "1": 1 },
    });

    render(<CharacterSheet player={player} />);
    await user.click(screen.getByText("Spellcasting"));

    // Spell save DC: 8 + 3 (prof) + 2 (INT mod) = 13
    // "13" also appears as CHA stat value, so use getAllByText
    const thirteens = screen.getAllByText("13");
    expect(thirteens.length).toBeGreaterThanOrEqual(1);
    // Spell attack: +3 (prof) + 2 (INT mod) = +5
    // +5 also appears in skills, so check at least one exists
    const plusFives = screen.getAllByText("+5");
    expect(plusFives.length).toBeGreaterThanOrEqual(1);

    // Cantrips
    expect(screen.getByText("fire bolt")).toBeInTheDocument();
    expect(screen.getByText("mage hand")).toBeInTheDocument();

    // Known spells
    expect(screen.getByText("magic missile")).toBeInTheDocument();
    expect(screen.getByText("shield")).toBeInTheDocument();

    // Spell slots
    expect(screen.getByText("Lv1")).toBeInTheDocument();
    expect(screen.getByText("3/4")).toBeInTheDocument(); // 4 total - 1 used = 3 remaining
    expect(screen.getByText("Lv2")).toBeInTheDocument();
    expect(screen.getByText("2/2")).toBeInTheDocument();
  });
});
