import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DiceRoll from "./DiceRoll";
import type { ParsedRollResult } from "../lib/gameTypes";

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<ParsedRollResult> = {}): ParsedRollResult {
  return {
    checkType: "Attack Roll",
    components: "STR +3, Prof +3 = +6",
    dieResult: 14,
    totalModifier: "+6",
    total: 20,
    dcOrAc: "15",
    success: true,
    notes: "",
    ...overrides,
  };
}

// ─── Tests (historical mode only — no animation timers) ─────────────────────

describe("DiceRoll (historical)", () => {
  it("renders check type", () => {
    render(<DiceRoll result={makeResult()} isHistorical />);

    expect(screen.getByText("Attack Roll")).toBeInTheDocument();
  });

  it("renders die result", () => {
    render(<DiceRoll result={makeResult({ dieResult: 17 })} isHistorical />);

    expect(screen.getByText("17")).toBeInTheDocument();
  });

  it("shows HIT for successful attack", () => {
    render(<DiceRoll result={makeResult({ success: true })} isHistorical />);

    expect(screen.getByText("HIT")).toBeInTheDocument();
  });

  it("shows MISS for failed attack", () => {
    render(<DiceRoll result={makeResult({ success: false })} isHistorical />);

    expect(screen.getByText("MISS")).toBeInTheDocument();
  });

  it("shows CRIT for natural 20", () => {
    render(
      <DiceRoll
        result={makeResult({ dieResult: 20, success: true })}
        isHistorical
      />,
    );

    expect(screen.getByText("CRIT")).toBeInTheDocument();
  });

  it("shows FUMBLE for natural 1", () => {
    render(
      <DiceRoll
        result={makeResult({ dieResult: 1, success: false })}
        isHistorical
      />,
    );

    expect(screen.getByText("FUMBLE")).toBeInTheDocument();
  });

  it("renders damage badge when damage is present", () => {
    const result = makeResult({
      damage: {
        breakdown: [
          { label: "Longsword", rolls: [6], flatBonus: 3, subtotal: 9, damageType: "slashing" },
        ],
        totalDamage: 9,
        isCrit: false,
      },
    });

    render(<DiceRoll result={result} isHistorical />);

    expect(screen.getByText("9 dmg")).toBeInTheDocument();
  });

  it("does not render damage badge when no damage", () => {
    render(<DiceRoll result={makeResult()} isHistorical />);

    expect(screen.queryByText(/dmg/)).not.toBeInTheDocument();
  });

  it("does not render Continue button in historical mode", () => {
    const onContinue = vi.fn();
    render(
      <DiceRoll result={makeResult()} isHistorical onContinue={onContinue} />,
    );

    expect(screen.queryByText(/Continue/)).not.toBeInTheDocument();
  });

  it("displays the total after modifier", () => {
    render(
      <DiceRoll result={makeResult({ dieResult: 14, total: 20, totalModifier: "+6" })} isHistorical />,
    );

    expect(screen.getByText("20", { exact: false })).toBeInTheDocument();
  });
});
