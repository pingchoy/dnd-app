import { describe, it, expect } from "vitest";
import type {
  PointOfInterest,
  ExplorationMapDocument,
  CombatMapDocument,
  MapDocument,
  CampaignExplorationMapSpec,
  CampaignPOISpec,
  CampaignCombatMapSpec,
} from "./gameTypes";

describe("PointOfInterest type", () => {
  it("accepts a valid POI with all required fields", () => {
    const poi: PointOfInterest = {
      id: "poi_docks",
      number: 1,
      name: "valdris docks",
      description: "a busy waterfront district",
      position: { x: 25.5, y: 80.0 },
      combatMapId: "map_abc123",
      isHidden: false,
      actNumbers: [1],
      locationTags: ["docks", "waterfront"],
    };
    expect(poi.id).toBe("poi_docks");
    expect(poi.position.x).toBe(25.5);
    expect(poi.isHidden).toBe(false);
  });

  it("accepts optional defaultNPCSlugs", () => {
    const poi: PointOfInterest = {
      id: "poi_tavern",
      number: 2,
      name: "the rusty flagon",
      description: "a lively tavern",
      position: { x: 50, y: 50 },
      combatMapId: "map_def456",
      isHidden: false,
      actNumbers: [1, 2],
      locationTags: ["tavern"],
      defaultNPCSlugs: ["barkeeper", "commoner"],
    };
    expect(poi.defaultNPCSlugs).toEqual(["barkeeper", "commoner"]);
  });
});

describe("MapDocument discriminated union", () => {
  it("narrows to ExplorationMapDocument when mapType is exploration", () => {
    const doc: MapDocument = {
      mapType: "exploration",
      name: "valdris city",
      backgroundImageUrl: "https://example.com/valdris.png",
      pointsOfInterest: [],
    };
    if (doc.mapType === "exploration") {
      expect(doc.pointsOfInterest).toEqual([]);
      expect(doc.backgroundImageUrl).toBe("https://example.com/valdris.png");
    }
  });

  it("narrows to CombatMapDocument when mapType is combat", () => {
    const doc: MapDocument = {
      mapType: "combat",
      name: "docks battle map",
      gridSize: 20,
      feetPerSquare: 5,
      regions: [],
      parentMapId: "expl_123",
      poiId: "poi_docks",
    };
    if (doc.mapType === "combat") {
      expect(doc.gridSize).toBe(20);
      expect(doc.parentMapId).toBe("expl_123");
      expect(doc.regions).toEqual([]);
    }
  });

  it("combat map can have tileData and backgroundImageUrl", () => {
    const doc: MapDocument = {
      mapType: "combat",
      name: "docks battle map",
      gridSize: 20,
      feetPerSquare: 5,
      regions: [],
      parentMapId: "expl_123",
      poiId: "poi_docks",
      tileData: new Array(400).fill(0),
      backgroundImageUrl: "https://example.com/docks.png",
    };
    if (doc.mapType === "combat") {
      expect(doc.tileData?.length).toBe(400);
    }
  });
});

describe("Campaign exploration/combat spec types", () => {
  it("CampaignExplorationMapSpec has required fields", () => {
    const spec: CampaignExplorationMapSpec = {
      id: "valdris-city",
      name: "The Free City of Valdris",
      imageDescription: "A sprawling port city viewed from above",
      pointsOfInterest: [],
    };
    expect(spec.id).toBe("valdris-city");
  });

  it("CampaignPOISpec links to a combat map spec", () => {
    const poi: CampaignPOISpec = {
      id: "poi_docks",
      number: 1,
      name: "valdris docks",
      description: "a busy waterfront district",
      combatMapSpecId: "valdris-docks",
      isHidden: false,
      actNumbers: [1],
      locationTags: ["docks", "waterfront"],
    };
    expect(poi.combatMapSpecId).toBe("valdris-docks");
  });

  it("CampaignCombatMapSpec has layout and regions", () => {
    const spec: CampaignCombatMapSpec = {
      id: "valdris-docks",
      name: "Valdris Docks, Pier 7",
      layoutDescription: "A waterfront pier district",
      feetPerSquare: 5,
      terrain: "urban",
      lighting: "dim",
      regions: [],
    };
    expect(spec.terrain).toBe("urban");
  });
});
