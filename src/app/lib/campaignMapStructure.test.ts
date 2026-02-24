import { describe, it, expect } from "vitest";
import { theCrimsonAccord } from "../../../scripts/campaigns/the-crimson-accord";

describe("The Crimson Accord campaign structure", () => {
  it("has exactly 1 exploration map spec", () => {
    expect(theCrimsonAccord.campaign.explorationMapSpecs).toHaveLength(1);
  });

  it("exploration map is valdris-city", () => {
    const explMap = theCrimsonAccord.campaign.explorationMapSpecs![0];
    expect(explMap.id).toBe("valdris-city");
    expect(explMap.name).toContain("Valdris");
  });

  it("has 15 combat map specs", () => {
    expect(theCrimsonAccord.campaign.combatMapSpecs).toHaveLength(15);
  });

  it("exploration map has 15 POIs", () => {
    const explMap = theCrimsonAccord.campaign.explorationMapSpecs![0];
    expect(explMap.pointsOfInterest).toHaveLength(15);
  });

  it("every POI references a valid combat map spec", () => {
    const explMap = theCrimsonAccord.campaign.explorationMapSpecs![0];
    const combatIds = new Set(
      theCrimsonAccord.campaign.combatMapSpecs!.map((s) => s.id),
    );
    for (const poi of explMap.pointsOfInterest) {
      expect(combatIds.has(poi.combatMapSpecId)).toBe(true);
    }
  });

  it("every story beat mapSpecId references a valid combat map spec", () => {
    const combatIds = new Set(
      theCrimsonAccord.campaign.combatMapSpecs!.map((s) => s.id),
    );
    for (const act of theCrimsonAccord.acts) {
      for (const beat of act.storyBeats) {
        if (beat.mapSpecId) {
          expect(combatIds.has(beat.mapSpecId)).toBe(true);
        }
      }
    }
  });

  it("all acts have explorationMapSpecId", () => {
    for (const act of theCrimsonAccord.acts) {
      expect(act.explorationMapSpecId).toBe("valdris-city");
    }
  });

  it("hidden POIs are correct", () => {
    const explMap = theCrimsonAccord.campaign.explorationMapSpecs![0];
    const hidden = explMap.pointsOfInterest
      .filter((p) => p.isHidden)
      .map((p) => p.name);
    expect(hidden).toContain("undercity tunnels");
    expect(hidden).toContain("smuggler warehouse");
    expect(hidden).toContain("the narrows");
    expect(hidden).toContain("ancient temple");
    expect(hidden).toContain("hall of records");
    expect(hidden).toContain("temple district");
  });

  it("POI numbers are sequential 1-15", () => {
    const explMap = theCrimsonAccord.campaign.explorationMapSpecs![0];
    const numbers = explMap.pointsOfInterest.map((p) => p.number).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });
});
