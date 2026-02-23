/**
 * generateCampaign.ts
 *
 * CLI tool that uses Claude Sonnet to generate new D&D 5e campaigns and seed
 * them to Firestore. Each campaign has a 3-act structure with rich NPC profiles,
 * encounter definitions, and narrative arcs.
 *
 * Usage:
 *   npx tsx scripts/generateCampaign.ts --theme "dungeon crawl" --levels "3-7" [--tone "dark fantasy"]
 *
 * Prerequisites:
 *   - ANTHROPIC_API_KEY env var
 *   - FIREBASE_SERVICE_ACCOUNT_KEY env var containing service account JSON string
 *
 * Cost: ~$0.12-0.18 per campaign (5 Sonnet calls, ~2K input + ~4K output each)
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import Anthropic from "@anthropic-ai/sdk";
import * as admin from "firebase-admin";

// ─── Firebase Admin Init ──────────────────────────────────────────────────────

admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!),
  ),
});

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// ─── Anthropic Client ─────────────────────────────────────────────────────────

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = "claude-sonnet-4-6";

// ─── CLI Argument Parsing ─────────────────────────────────────────────────────

interface CLIArgs {
  theme: string;
  levels: string;
  tone?: string;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      const key = args[i].replace("--", "");
      parsed[key] = args[++i];
    }
  }

  if (!parsed.theme || !parsed.levels) {
    console.error("Usage: npx tsx scripts/generateCampaign.ts --theme <theme> --levels <min-max> [--tone <tone>]");
    console.error("  --theme   Required. Campaign theme (e.g. 'dungeon crawl', 'political intrigue')");
    console.error("  --levels  Required. Level range (e.g. '1-5', '3-7', '5-10')");
    console.error("  --tone    Optional. Narrative tone (e.g. 'dark fantasy', 'lighthearted', 'horror')");
    process.exit(1);
  }

  return {
    theme: parsed.theme,
    levels: parsed.levels,
    tone: parsed.tone,
  };
}

// ─── Lowercase normalizer ─────────────────────────────────────────────────────

const PRESERVE_CASE_KEYS = new Set([
  "description",
  "playerTeaser",
  "dmSummary",
  "dmBriefing",
  "dmNotes",
  "dmGuidance",
  "voiceNotes",
  "appearance",
  "betrayalTrigger",
  "transitionToNextAct",
  "summary",
  "setting",
  "specialAbilities",
  "layoutDescription",
  "atmosphereNotes",
]);

function lowercaseStrings(value: unknown, key?: string): unknown {
  if (key && PRESERVE_CASE_KEYS.has(key)) return value;
  if (typeof value === "string") return value.toLowerCase();
  if (Array.isArray(value)) return value.map((item) => lowercaseStrings(item));
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = lowercaseStrings(v, k);
    }
    return result;
  }
  return value;
}

// ─── Batch writer ─────────────────────────────────────────────────────────────

const BATCH_SIZE = 400;

async function batchWrite(
  colPath: string,
  docs: Array<{ id: string; data: Record<string, unknown> }>,
): Promise<void> {
  console.log(`  Writing ${docs.length} docs to ${colPath}...`);
  let batch = db.batch();
  let opCount = 0;

  for (const { id, data } of docs) {
    batch.set(
      db.collection(colPath).doc(id),
      lowercaseStrings(data) as Record<string, unknown>,
    );
    opCount++;

    if (opCount >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  }

  if (opCount > 0) await batch.commit();
}

// ─── Type Definitions for Claude's Output ─────────────────────────────────────

const TYPE_SCHEMA = `
You must output valid JSON matching these TypeScript interfaces exactly:

interface CampaignNPC {
  id: string;                          // kebab-case slug, e.g. "lysara-thorne"
  name: string;
  srdMonsterSlug?: string;             // SRD creature slug for combat stats (e.g. "noble", "mage", "veteran", "spy", "commoner", "priest", "bandit-captain", "knight", "assassin", "archmage")
  role: "patron" | "ally" | "rival" | "villain" | "informant" | "betrayer" | "neutral";
  appearance: string;                  // 2-3 sentences physical description
  personality: {
    traits: string[];                  // 2-3 personality traits
    ideals: string[];                  // 1-2 ideals
    bonds: string[];                   // 1-2 bonds
    flaws: string[];                   // 1-2 flaws
  };
  motivations: string[];               // 2-3 motivations
  secrets: string[];                   // 2-4 hidden secrets
  betrayalTrigger?: string;            // what causes betrayal (if applicable)
  relationshipArc: {
    act1: string;                      // how they relate to party in act 1
    act2: string;                      // how they relate to party in act 2
    act3: string;                      // how they relate to party in act 3
  };
  combatStats?: {                      // only for fightable NPCs
    ac: number;
    hp: number;
    attackBonus: number;
    damageDice: string;
    damageBonus: number;
    xpValue: number;
    specialAbilities?: string;
  };
  dmNotes: string;                     // ~200 token DM guidance
  voiceNotes?: string;                 // roleplay hints
}

// Call 1 output:
interface CampaignOutput {
  slug: string;                        // kebab-case, e.g. "the-crimson-accord"
  title: string;
  playerTeaser: string;                // spoiler-free hook, 3-4 sentences
  theme: string;
  suggestedLevel: { min: number; max: number };
  estimatedDurationHours: number;      // typically 9 (3 acts x 3 hours)
  hooks: string[];                     // 3-4 adventure hooks
  actSlugs: string[];                  // ["{slug}_act-1", "{slug}_act-2", "{slug}_act-3"]
  npcs: CampaignNPC[];                 // 5-7 important NPCs
  dmSummary: string;                   // ~200 token overall arc summary for DM
}

// Calls 2-4 output:
interface CampaignActOutput {
  campaignSlug: string;
  actNumber: number;                   // 1, 2, or 3
  title: string;
  summary: string;                     // player-facing act summary
  suggestedLevel: { min: number; max: number };
  setting: string;                     // primary location description
  plotPoints: string[];                // 5-7 key story beats
  mysteries: string[];                 // 3-5 clues/revelations
  keyEvents: string[];                 // 6-8 major events
  encounters: CampaignEncounter[];     // 3-4 encounters per act
  relevantNPCIds: string[];            // which NPCs are active this act
  transitionToNextAct?: string;        // how this act ends (omit for act 3)
  dmBriefing: string;                  // ~500 token DM briefing
}

interface CampaignEncounter {
  name: string;
  description: string;
  type: "combat" | "social" | "exploration" | "puzzle" | "boss";
  difficulty: "easy" | "medium" | "hard" | "deadly";
  enemies?: CampaignEnemy[];           // for combat/boss encounters
  npcInvolvement?: string[];           // CampaignNPC ids involved
  location: string;
  mapSpecId?: string;                  // references CampaignMapSpec.id — set in the map specs generation step
  rewards?: {
    xp?: number;
    gold?: number;
    items?: string[];
  };
  dmGuidance?: string;                 // how to run this encounter
}

interface CampaignEnemy {
  srdMonsterSlug: string;              // MUST be a real SRD 5e monster slug
  count: number;
  notes?: string;
}

// Call 5 output:
interface CampaignMapSpecOutput {
  id: string;                          // kebab-case, e.g. "valdris-docks"
  name: string;
  layoutDescription: string;           // Prose description of physical layout
  feetPerSquare: number;               // 5 for indoor/dungeon
  terrain: "urban" | "dungeon" | "wilderness" | "underground" | "interior" | "mixed";
  lighting: "bright" | "dim" | "dark" | "mixed";
  atmosphereNotes?: string;
  regions: {
    id: string;                        // "region_<snake_case>"
    name: string;
    type: string;                      // RegionType
    approximateSize: "small" | "medium" | "large";
    position?: "north" | "south" | "east" | "west" | "center" | "northeast" | "northwest" | "southeast" | "southwest";
    dmNote?: string;
    defaultNPCSlugs?: string[];
    shopInventory?: string[];
  }[];
  connections?: {
    targetMapSpecId: string;
    direction: string;
    description: string;
  }[];
  actNumbers: number[];
  locationTags: string[];
  encounterNames: string[];            // which encounters use this map
}
`;

const COMMON_SRD_MONSTERS = `
Common SRD monster slugs (use ONLY these for enemies):
Tier 1 (CR 0-2): commoner, guard, bandit, cultist, goblin, kobold, skeleton, zombie, giant-rat, wolf, spider, thug, acolyte, scout, tribal-warrior, gnoll, orc, ghoul, shadow, bugbear, ogre
Tier 2 (CR 2-5): bandit-captain, berserker, cult-fanatic, druid, ghast, specter, wight, gargoyle, animated-armor, minotaur, werewolf, worg, hell-hound, winter-wolf, owlbear, basilisk, manticore, veteran, knight, troll, wraith, air-elemental, earth-elemental, fire-elemental, water-elemental
Tier 3 (CR 5-10): gladiator, assassin, mage, night-hag, vampire-spawn, hill-giant, frost-giant, young-white-dragon, young-black-dragon, young-green-dragon, clay-golem, stone-golem, spirit-naga
Boss NPCs: noble, spy, priest, archmage, adult-red-dragon, adult-blue-dragon, lich, vampire
`;

// ─── Claude Call Helpers ──────────────────────────────────────────────────────

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  return textBlock.text;
}

function extractJSON(text: string): string {
  // Try to extract JSON from markdown code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  // Try to find raw JSON (object starting with {)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];

  throw new Error("No JSON found in Claude response");
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateCampaign(data: Record<string, unknown>): void {
  const required = ["slug", "title", "playerTeaser", "theme", "suggestedLevel", "hooks", "actSlugs", "npcs", "dmSummary"];
  for (const field of required) {
    if (data[field] === undefined || data[field] === null) {
      throw new Error(`Campaign missing required field: ${field}`);
    }
  }
  if (!Array.isArray(data.npcs) || (data.npcs as unknown[]).length < 4) {
    throw new Error(`Campaign must have at least 4 NPCs, got ${(data.npcs as unknown[])?.length ?? 0}`);
  }
  if (!Array.isArray(data.actSlugs) || (data.actSlugs as unknown[]).length !== 3) {
    throw new Error("Campaign must have exactly 3 act slugs");
  }
}

function validateAct(data: Record<string, unknown>, expectedActNumber: number): void {
  const required = ["campaignSlug", "actNumber", "title", "summary", "suggestedLevel", "setting", "plotPoints", "encounters", "relevantNPCIds", "dmBriefing"];
  for (const field of required) {
    if (data[field] === undefined || data[field] === null) {
      throw new Error(`Act ${expectedActNumber} missing required field: ${field}`);
    }
  }
  if (data.actNumber !== expectedActNumber) {
    throw new Error(`Expected act number ${expectedActNumber}, got ${data.actNumber}`);
  }
  if (!Array.isArray(data.encounters) || (data.encounters as unknown[]).length < 2) {
    throw new Error(`Act ${expectedActNumber} must have at least 2 encounters`);
  }
}

// ─── Slug Generation ──────────────────────────────────────────────────────────

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Main Generation Flow ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  const [minLevel, maxLevel] = args.levels.split("-").map(Number);
  if (!minLevel || !maxLevel || minLevel > maxLevel) {
    console.error("Invalid level range. Use format: '1-5', '3-7', etc.");
    process.exit(1);
  }

  const toneInstruction = args.tone
    ? `The narrative tone should be: ${args.tone}.`
    : "";

  console.log(`\nGenerating campaign...`);
  console.log(`  Theme: ${args.theme}`);
  console.log(`  Levels: ${minLevel}-${maxLevel}`);
  if (args.tone) console.log(`  Tone: ${args.tone}`);
  console.log();

  const systemPrompt = `You are a master D&D 5e campaign designer. You create rich, detailed campaigns with compelling narratives, memorable NPCs, and engaging encounters.

CRITICAL RULES:
- Output ONLY valid JSON matching the schema provided. No commentary, no explanations.
- Must produce a 3-act campaign, each act ~3 hours of gameplay.
- Must include at least one betrayal or major plot twist.
- NPCs must have rich personality profiles with secrets and relationship arcs across all 3 acts.
- Combat encounters must reference REAL SRD 5e monster slugs from the provided list.
- All acts must build toward a climactic revelation in Act 3.
- The playerTeaser must be compelling but completely spoiler-free.
- The dmSummary must be a compact (~200 token) overview of the full arc for DM reference.
- The dmBriefing for each act must be a detailed (~500 token) guide for running that act.
- Include a mix of encounter types: combat, social, exploration, puzzle, and boss.
- Scale encounter difficulty appropriately for the suggested level range.
${toneInstruction}

${TYPE_SCHEMA}

${COMMON_SRD_MONSTERS}`;

  // ─── Call 1: Campaign overview + NPCs ───────────────────────────────────

  console.log("Step 1/5: Generating campaign overview and NPC profiles...");

  const campaignPrompt = `Create a D&D 5e campaign with the following parameters:
- Theme: ${args.theme}
- Suggested level range: ${minLevel}-${maxLevel}
${args.tone ? `- Tone: ${args.tone}` : ""}

Generate the CampaignOutput JSON. Include 5-7 NPCs with rich profiles. At least one NPC should have a betrayal arc. The slug should be derived from the title (kebab-case). actSlugs should be ["{slug}_act-1", "{slug}_act-2", "{slug}_act-3"].

Output ONLY the JSON object, no markdown code blocks.`;

  const campaignText = await callClaude(systemPrompt, campaignPrompt);
  const campaignJSON = extractJSON(campaignText);
  const campaign = JSON.parse(campaignJSON) as Record<string, unknown>;

  // Ensure slug is consistent
  const slug = toSlug(campaign.title as string);
  campaign.slug = slug;
  campaign.actSlugs = [`${slug}_act-1`, `${slug}_act-2`, `${slug}_act-3`];
  campaign.estimatedDurationHours = campaign.estimatedDurationHours ?? 9;

  // Fix NPC slugs to match campaign slug format
  if (Array.isArray(campaign.npcs)) {
    for (const npc of campaign.npcs as Array<Record<string, unknown>>) {
      if (typeof npc.id !== "string" || !npc.id) {
        npc.id = toSlug(npc.name as string);
      }
    }
  }

  validateCampaign(campaign);
  console.log(`  ✓ Campaign: "${campaign.title}" (${(campaign.npcs as unknown[]).length} NPCs)`);

  // ─── Calls 2-4: Generate each act ──────────────────────────────────────

  const npcSummary = (campaign.npcs as Array<Record<string, unknown>>)
    .map((npc) => `- ${npc.name} (${npc.id}): role=${npc.role}, srd=${npc.srdMonsterSlug ?? "none"}`)
    .join("\n");

  const acts: Array<Record<string, unknown>> = [];

  for (let actNum = 1; actNum <= 3; actNum++) {
    console.log(`Step ${actNum + 1}/5: Generating Act ${actNum}...`);

    // Compute per-act level range
    const levelSpan = maxLevel - minLevel;
    const actMinLevel = minLevel + Math.floor((levelSpan * (actNum - 1)) / 3);
    const actMaxLevel = minLevel + Math.floor((levelSpan * actNum) / 3);

    const actPrompt = `Generate Act ${actNum} for the campaign "${campaign.title}" (slug: "${slug}").

Campaign summary: ${campaign.dmSummary}

Available NPCs:
${npcSummary}

Act ${actNum} parameters:
- campaignSlug: "${slug}"
- actNumber: ${actNum}
- suggestedLevel: { min: ${actMinLevel}, max: ${actMaxLevel} }
${actNum < 3 ? "- Include transitionToNextAct describing how this act leads into the next." : "- This is the final act. Do NOT include transitionToNextAct."}
${actNum === 1 ? "- This is the opening act. Establish the setting, introduce NPCs, and hook the party." : ""}
${actNum === 2 ? "- This is the middle act. Deepen the mystery, introduce betrayals, and raise the stakes." : ""}
${actNum === 3 ? "- This is the climactic act. Reveal the truth, confront the villain, and resolve the story. Include a boss encounter." : ""}

Include 3-4 encounters with a mix of types. Scale difficulty for levels ${actMinLevel}-${actMaxLevel}.

Output ONLY the JSON object, no markdown code blocks.`;

    const actText = await callClaude(systemPrompt, actPrompt);
    const actJSON = extractJSON(actText);
    const act = JSON.parse(actJSON) as Record<string, unknown>;

    // Enforce correct slugs and act number
    act.campaignSlug = slug;
    act.actNumber = actNum;

    validateAct(act, actNum);
    acts.push(act);
    console.log(`  ✓ Act ${actNum}: "${act.title}" (${(act.encounters as unknown[]).length} encounters)`);
  }

  // ─── Call 5: Generate map specs ──────────────────────────────────────────

  console.log("Step 5/5: Generating map specifications...");

  // Gather all encounters and their locations across all acts
  const allEncounters = acts.flatMap((act) =>
    (act.encounters as Array<Record<string, unknown>>).map((enc) => ({
      name: enc.name as string,
      location: enc.location as string,
      type: enc.type as string,
      actNumber: act.actNumber as number,
    })),
  );

  const encounterSummary = allEncounters
    .map((e) => `- "${e.name}" (${e.type}, Act ${e.actNumber}): ${e.location}`)
    .join("\n");

  const mapSpecPrompt = `Generate map specifications for the campaign "${campaign.title}" (slug: "${slug}").

Campaign summary: ${campaign.dmSummary}

All encounters and their locations:
${encounterSummary}

Generate an array of CampaignMapSpecOutput objects. Each map spec should:
1. Cover one or more encounters that share a location
2. Have a detailed layoutDescription (2-4 sentences) describing the physical layout
3. Include 3-6 regions per map with appropriate types, sizes, and positions
4. Group encounters at the same location onto the same map
5. Set connections between maps that are narratively linked
6. Include locationTags that would match the encounter's location strings
7. Set actNumbers to which acts the map appears in

Region types: tavern, shop, temple, dungeon, wilderness, residential, street, guard_post, danger, safe, custom.
Region positions: north, south, east, west, center, northeast, northwest, southeast, southwest.

Encounters that span multiple locations or are purely narrative (like timed skill challenges) can be excluded from maps.
Generate 5-10 maps total. Do NOT generate maps for encounters that don't need a physical location.

Output ONLY a JSON object with a single "mapSpecs" array field containing CampaignMapSpecOutput objects. No markdown code blocks.`;

  const mapSpecText = await callClaude(systemPrompt, mapSpecPrompt);
  const mapSpecJSON = extractJSON(mapSpecText);
  const mapSpecData = JSON.parse(mapSpecJSON) as Record<string, unknown>;

  const rawMapSpecs = (mapSpecData.mapSpecs ?? mapSpecData) as Array<Record<string, unknown>>;
  if (!Array.isArray(rawMapSpecs) || rawMapSpecs.length < 3) {
    throw new Error(`Expected at least 3 map specs, got ${Array.isArray(rawMapSpecs) ? rawMapSpecs.length : 0}`);
  }

  // Validate map specs and build mapSpecId references for encounters
  for (const spec of rawMapSpecs) {
    if (!spec.id || !spec.name || !spec.layoutDescription || !Array.isArray(spec.regions)) {
      throw new Error(`Map spec missing required fields: ${JSON.stringify(spec).slice(0, 100)}`);
    }
    if ((spec.regions as unknown[]).length < 2) {
      throw new Error(`Map spec "${spec.id}" must have at least 2 regions`);
    }
    // Remove encounterNames helper field before persisting
    delete spec.encounterNames;
  }

  // Add mapSpecs to campaign and set mapSpecId on matching encounters
  campaign.mapSpecs = rawMapSpecs;

  // Match encounters to map specs by location tag matching
  for (const act of acts) {
    for (const enc of act.encounters as Array<Record<string, unknown>>) {
      const encLocation = (enc.location as string)?.toLowerCase() ?? "";
      for (const spec of rawMapSpecs) {
        const tags = (spec.locationTags as string[]) ?? [];
        if (tags.some((tag) => encLocation.includes((tag as string).toLowerCase()))) {
          enc.mapSpecId = spec.id;
          break;
        }
      }
    }
  }

  console.log(`  ✓ Map specs: ${rawMapSpecs.length} maps generated`);
  for (const spec of rawMapSpecs) {
    console.log(`    - ${spec.id}: "${spec.name}" (${(spec.regions as unknown[]).length} regions, acts ${(spec.actNumbers as number[]).join(",")})`);
  }

  // ─── Seed to Firestore ──────────────────────────────────────────────────

  console.log("\nSeeding to Firestore...");

  await batchWrite("campaigns", [
    { id: slug, data: campaign },
  ]);
  console.log(`  ✓ Campaign "${campaign.title}" seeded to campaigns/${slug}`);

  const actDocs = acts.map((act) => ({
    id: `${slug}_act-${act.actNumber}`,
    data: act,
  }));
  await batchWrite("campaignActs", actDocs);
  for (const act of acts) {
    console.log(`  ✓ Act ${act.actNumber}: "${act.title}" seeded to campaignActs/${slug}_act-${act.actNumber}`);
  }

  console.log(`\n✅ Campaign generation complete!`);
  console.log(`   Slug: ${slug}`);
  console.log(`   Title: ${campaign.title}`);
  console.log(`   Acts: ${acts.map((a) => a.title).join(" → ")}`);
  console.log(`   NPCs: ${(campaign.npcs as Array<Record<string, unknown>>).map((n) => n.name).join(", ")}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Campaign generation failed:", err);
  process.exit(1);
});
