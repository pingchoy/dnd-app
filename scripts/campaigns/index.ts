/**
 * campaigns/index.ts
 *
 * Barrel export for all premade campaigns.
 * Each campaign file exports a CampaignData object containing
 * the campaign metadata + all act definitions.
 *
 * To add a new campaign:
 *   1. Create a new file in this folder (e.g. tomb-of-the-sun-king.ts)
 *   2. Export a CampaignData object as the default export
 *   3. Import and add it to the ALL_CAMPAIGNS array below
 */

import type { Campaign, CampaignAct } from "../../src/app/lib/gameTypes";

export interface CampaignData {
  campaign: Campaign;
  acts: CampaignAct[];
}

import { theCrimsonAccord } from "./the-crimson-accord";

/** All premade campaigns to seed. */
export const ALL_CAMPAIGNS: CampaignData[] = [
  theCrimsonAccord,
];
