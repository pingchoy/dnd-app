import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ExplorationMap from "./ExplorationMap";
import type { PointOfInterest } from "../lib/gameTypes";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
  global.ResizeObserver = class MockResizeObserver {
    cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) { this.cb = cb; }
    observe() {
      this.cb(
        [{ contentRect: { width: 800, height: 600 } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const mockPOIs: PointOfInterest[] = [
  {
    id: "poi_docks",
    number: 1,
    name: "valdris docks",
    description: "a busy waterfront",
    position: { x: 25, y: 80 },
    combatMapId: "map_1",
    isHidden: false,
    actNumbers: [1],
    locationTags: ["docks"],
  },
  {
    id: "poi_council",
    number: 2,
    name: "council hall",
    description: "the seat of government",
    position: { x: 50, y: 30 },
    combatMapId: "map_2",
    isHidden: false,
    actNumbers: [1, 3],
    locationTags: ["council"],
  },
  {
    id: "poi_temple",
    number: 3,
    name: "ancient temple",
    description: "hidden underground temple",
    position: { x: 75, y: 60 },
    combatMapId: "map_3",
    isHidden: true,
    actNumbers: [3],
    locationTags: ["temple"],
  },
];

describe("ExplorationMap", () => {
  it("renders a canvas element", () => {
    const { container } = render(
      <ExplorationMap
        backgroundImageUrl="https://example.com/map.png"
        pointsOfInterest={mockPOIs}
        currentPOIId={null}
        onPOIClick={vi.fn()}
      />,
    );
    expect(container.querySelector("canvas")).toBeTruthy();
  });

  it("shows visible POIs in the legend bar but not hidden ones", () => {
    render(
      <ExplorationMap
        backgroundImageUrl="https://example.com/map.png"
        pointsOfInterest={mockPOIs}
        currentPOIId={null}
        onPOIClick={vi.fn()}
      />,
    );
    expect(screen.getByText("valdris docks")).toBeInTheDocument();
    expect(screen.getByText("council hall")).toBeInTheDocument();
    expect(screen.queryByText("ancient temple")).not.toBeInTheDocument();
  });

  it("highlights the current POI in the legend", () => {
    render(
      <ExplorationMap
        backgroundImageUrl="https://example.com/map.png"
        pointsOfInterest={mockPOIs}
        currentPOIId="poi_docks"
        onPOIClick={vi.fn()}
      />,
    );
    const legendBtn = screen.getByText("valdris docks").closest("button");
    expect(legendBtn?.className).toContain("text-gold");
  });

  it("calls onPOIClick when a legend item is clicked", () => {
    const handleClick = vi.fn();
    render(
      <ExplorationMap
        backgroundImageUrl="https://example.com/map.png"
        pointsOfInterest={mockPOIs}
        currentPOIId={null}
        onPOIClick={handleClick}
      />,
    );
    fireEvent.click(screen.getByText("valdris docks"));
    expect(handleClick).toHaveBeenCalledWith("poi_docks");
  });

  it("shows the correct location count in the header", () => {
    render(
      <ExplorationMap
        backgroundImageUrl="https://example.com/map.png"
        pointsOfInterest={mockPOIs}
        currentPOIId={null}
        onPOIClick={vi.fn()}
      />,
    );
    expect(screen.getByText("2 locations")).toBeInTheDocument();
  });
});
