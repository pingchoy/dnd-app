import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ExplorationMap from "./ExplorationMap";
import type { PointOfInterest } from "../lib/gameTypes";

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
  it("renders the background image", () => {
    render(
      <ExplorationMap
        backgroundImageUrl="https://example.com/map.png"
        pointsOfInterest={mockPOIs}
        currentPOIId={null}
        onPOIClick={vi.fn()}
      />,
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/map.png");
  });

  it("renders visible POI markers but not hidden ones", () => {
    render(
      <ExplorationMap
        backgroundImageUrl="https://example.com/map.png"
        pointsOfInterest={mockPOIs}
        currentPOIId={null}
        onPOIClick={vi.fn()}
      />,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });

  it("highlights the current POI", () => {
    render(
      <ExplorationMap
        backgroundImageUrl="https://example.com/map.png"
        pointsOfInterest={mockPOIs}
        currentPOIId="poi_docks"
        onPOIClick={vi.fn()}
      />,
    );
    const marker = screen.getByText("1").closest("button");
    expect(marker?.className).toContain("ring");
  });

  it("calls onPOIClick when a marker is clicked", () => {
    const handleClick = vi.fn();
    render(
      <ExplorationMap
        backgroundImageUrl="https://example.com/map.png"
        pointsOfInterest={mockPOIs}
        currentPOIId={null}
        onPOIClick={handleClick}
      />,
    );
    fireEvent.click(screen.getByText("1"));
    expect(handleClick).toHaveBeenCalledWith("poi_docks");
  });

  it("shows POI name on hover", () => {
    render(
      <ExplorationMap
        backgroundImageUrl="https://example.com/map.png"
        pointsOfInterest={mockPOIs}
        currentPOIId={null}
        onPOIClick={vi.fn()}
      />,
    );
    const marker = screen.getByText("1").closest("button");
    fireEvent.mouseEnter(marker!);
    expect(screen.getByText("valdris docks")).toBeInTheDocument();
  });
});
