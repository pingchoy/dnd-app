/**
 * generateCampaign.ts
 *
 * CLI tool that uses Claude Sonnet to generate new D&D 5e campaigns and seed
 * them to Firestore. Each campaign has a 3-act structure with rich NPC profiles,
 * story beat definitions, and narrative arcs.
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
  "imagePrompt",
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

// ─── Shared NPC shape ─────────────────────────────────────────────────────────
// This same interface is used in TWO contexts with DIFFERENT rules:
//
// 1. npcMasterPlan (Call 1) — the FULL truth across all 3 acts.
//    Fill ALL fields: true role, all secrets, full relationshipArc (act1+act2+act3),
//    betrayalTrigger, combatStats, and full dmNotes spanning the campaign.
//
// 2. act.npcs (Calls 2-4) — act-scoped, standalone. The AI DM only sees THIS data.
//    - role: the NPC's APPARENT role for this act (e.g. a hidden villain is "patron" in Act 1)
//    - secrets: ONLY secrets discoverable in this act (empty array if none)
//    - betrayalTrigger: ONLY if the betrayal happens in this act (omit otherwise)
//    - combatStats: ONLY if the NPC is fightable in this act (omit otherwise)
//    - relationshipArc: fill ONLY the current act's key, empty strings for other acts
//      e.g. Act 2 NPC → { act1: "", act2: "Warns the party...", act3: "" }
//    - dmNotes: how to portray this NPC in THIS ACT ONLY
//    - motivations: only the motivations relevant/visible to this act
//    - personality: can be adjusted per act (e.g. "increasingly paranoid" in Act 2)

interface CampaignNPC {
  id: string;                          // kebab-case slug, e.g. "lysara-thorne" — must be IDENTICAL across all acts
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
  secrets: string[];                   // master plan: 2-4 total. per-act: only this act's discoverable secrets (can be empty [])
  betrayalTrigger?: string;            // master plan: always present for betrayers. per-act: only in the act the betrayal occurs
  relationshipArc: {
    act1: string;                      // master plan: filled. per-act: filled only in act 1, "" otherwise
    act2: string;                      // master plan: filled. per-act: filled only in act 2, "" otherwise
    act3: string;                      // master plan: filled. per-act: filled only in act 3, "" otherwise
  };
  combatStats?: {                      // master plan: present for fightable NPCs. per-act: only in the act they can be fought
    ac: number;
    hp: number;
    attackBonus: number;
    damageDice: string;
    damageBonus: number;
    xpValue: number;
    specialAbilities?: string;
  };
  dmNotes: string;                     // master plan: ~200 token full-campaign guidance. per-act: THIS ACT portrayal only
  voiceNotes?: string;                 // roleplay hints (can evolve per act)
}

// Call 1 output:
interface CampaignOutput {
  slug: string;                        // kebab-case, e.g. "the-crimson-accord"
  title: string;
  playerTeaser: string;                // spoiler-free hook, 3-4 sentences
  theme: string;
  suggestedLevel: { min: number; max: number };
  estimatedDurationHours: number;      // typically 9 (3 acts x 3 hours)
  actSlugs: string[];                  // ["{slug}_act-1", "{slug}_act-2", "{slug}_act-3"]
  npcMasterPlan: CampaignNPC[];        // 5-7 NPCs — complete truth, all acts. Working reference only, NOT stored.
  dmSummary: string;                   // ~50 token spoiler-free theme/tone/setting for DM injection
}

// Calls 2-4 output:
interface CampaignActOutput {
  campaignSlug: string;
  actNumber: number;                   // 1, 2, or 3
  title: string;
  summary: string;                     // player-facing act summary
  suggestedLevel: { min: number; max: number };
  setting: string;                     // primary location description
  mysteries: string[];                 // 3-5 open questions the party is investigating this act. NO ANSWERS — just the questions. Answers are embedded in NPCs, storyBeats, and dmBriefing.
  storyBeats: StoryBeat[];             // 8-12 story beats per act — sequential narrative milestones
  relevantNPCIds: string[];            // NPC ids active this act (must match npcs[].id)
  npcs: CampaignNPC[];                 // STANDALONE act-scoped NPCs — see CampaignNPC rules above
  hooks: string[];                     // 3-4 adventure hooks for drawing the party into this act
  startingPOIId?: string;              // POI id where the party starts this act (must match a POI from the exploration map)
  transitionToNextAct?: string;        // how this act ends (omit for act 3). Must NOT spoil the next act's villain reveal.
  dmBriefing: string;                  // ~500 token DM briefing. Self-contained — must NOT reference info only available in other acts.
}

interface StoryBeat {
  name: string;
  description: string;
  type: "combat" | "social" | "exploration" | "puzzle" | "boss";
  difficulty: "easy" | "medium" | "hard" | "deadly";
  enemies?: CampaignEnemy[];           // for combat/boss story beats
  npcInvolvement?: string[];           // CampaignNPC ids involved
  location: string;
  mapSpecId?: string;                  // references CampaignMapSpec.id — set in the map specs generation step
  rewards?: {
    xp?: number;
    gold?: number;
    items?: string[];
  };
  dmGuidance?: string;                 // how to run this story beat, MUST include transition to the next beat
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
  feetPerSquare: number;               // 5 for indoor/dungeon
  imagePrompt: string;                 // Detailed prompt for AI image generation
  actNumbers: number[];
  locationTags: string[];
  storyBeatNames: string[];            // which story beats use this map
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
  const required = ["slug", "title", "playerTeaser", "theme", "suggestedLevel", "actSlugs", "dmSummary"];
  for (const field of required) {
    if (data[field] === undefined || data[field] === null) {
      throw new Error(`Campaign missing required field: ${field}`);
    }
  }
  if (!Array.isArray(data.actSlugs) || (data.actSlugs as unknown[]).length !== 3) {
    throw new Error("Campaign must have exactly 3 act slugs");
  }
  // npcMasterPlan is used as a working reference for act generation but not stored
  if (!Array.isArray(data.npcMasterPlan) || (data.npcMasterPlan as unknown[]).length < 4) {
    throw new Error(`Campaign must have at least 4 NPCs in npcMasterPlan, got ${(data.npcMasterPlan as unknown[])?.length ?? 0}`);
  }
}

function validateAct(data: Record<string, unknown>, expectedActNumber: number): void {
  const required = ["campaignSlug", "actNumber", "title", "summary", "suggestedLevel", "setting", "storyBeats", "relevantNPCIds", "npcs", "hooks", "dmBriefing"];
  for (const field of required) {
    if (data[field] === undefined || data[field] === null) {
      throw new Error(`Act ${expectedActNumber} missing required field: ${field}`);
    }
  }
  if (data.actNumber !== expectedActNumber) {
    throw new Error(`Expected act number ${expectedActNumber}, got ${data.actNumber}`);
  }
  if (!Array.isArray(data.storyBeats) || (data.storyBeats as unknown[]).length < 6) {
    throw new Error(`Act ${expectedActNumber} must have at least 6 story beats, got ${(data.storyBeats as unknown[])?.length ?? 0}`);
  }
  if (!Array.isArray(data.npcs) || (data.npcs as unknown[]).length < 2) {
    throw new Error(`Act ${expectedActNumber} must have at least 2 NPCs`);
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

  const systemPrompt = `You are a master D&D 5e campaign designer. You create rich, detailed campaigns with compelling narratives, memorable NPCs, and engaging story beats.

CRITICAL RULES:
- Output ONLY valid JSON matching the schema provided. No commentary, no explanations.
- Must produce a 3-act campaign, each act ~3 hours of gameplay.
- Must include at least one betrayal or major plot twist.
- Combat story beats must reference REAL SRD 5e monster slugs from the provided list.
- All acts must build toward a climactic revelation in Act 3.
- The playerTeaser must be compelling but completely spoiler-free.
- The dmSummary must be a compact (~50 token) spoiler-free summary of the campaign's theme, tone, setting, and play style. It must NOT reveal the villain's identity, plot twists, betrayals, or future events — it is injected directly into the DM agent's context on every turn.
- The dmBriefing for each act must be a detailed (~500 token) guide for running that act. It must NOT contain spoilers from future acts.
- Scale story beat difficulty appropriately for the suggested level range.

STORY BEAT DESIGN:
- Each act must have 8-12 story beats — sequential narrative milestones the DM actively guides the party through.
- Story beats must flow narratively into each other — no disconnected jumps. Each beat's dmGuidance must end with a "Transition:" sentence explaining how it leads to the next beat.
- The FIRST story beat of each act must NOT be combat — it should establish the setting, introduce key NPCs, and set the stakes.
- Mix of types: social scenes, investigation, exploration, combat, and puzzle. Combat should be ~20-30% of beats, not the majority.
- Early beats are smaller focused moments (a conversation, receiving a briefing, canvassing a neighborhood). Later beats can be bigger set-pieces (a raid, a boss fight).
- Include a "boss" type beat only in Act 3's climax.

STANDALONE ACT ARCHITECTURE:
Each act is a self-contained document fed to an AI DM agent. The DM agent ONLY sees the current act's data — never future acts or the master NPC plan. This means:
- Each act must include its own standalone "npcs" array with ONLY what the DM should know at that point.
- Each act must include its own "hooks" for drawing the party into the act's story.
- NPCs in earlier acts must NOT contain future-act spoilers (true villain role, future betrayals, later secrets).
- The dmBriefing must be self-contained — it should not reference information only available in other acts.
${toneInstruction}

${TYPE_SCHEMA}

${COMMON_SRD_MONSTERS}`;

  // ─── Call 1: Campaign overview + NPCs ───────────────────────────────────

  console.log("Step 1/5: Generating campaign overview and NPC master plan...");

  const campaignPrompt = `Create a D&D 5e campaign with the following parameters:
- Theme: ${args.theme}
- Suggested level range: ${minLevel}-${maxLevel}
${args.tone ? `- Tone: ${args.tone}` : ""}

Generate the CampaignOutput JSON:
- Include 5-7 NPCs in npcMasterPlan with FULL profiles spanning all 3 acts. This is the complete truth — true roles, all secrets, full relationship arcs, betrayal triggers. At least one NPC must have a betrayal arc.
- npcMasterPlan is a WORKING REFERENCE that will be passed to each act's generation step so the act generator understands the full story. It is NOT stored on the campaign document and is NOT visible to the DM agent.
- The slug should be derived from the title (kebab-case). actSlugs should be ["{slug}_act-1", "{slug}_act-2", "{slug}_act-3"].
- dmSummary must be completely spoiler-free — it is shown to the AI DM on every turn regardless of the current act.

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
  const masterNPCs = (campaign.npcMasterPlan ?? []) as Array<Record<string, unknown>>;
  for (const npc of masterNPCs) {
    if (typeof npc.id !== "string" || !npc.id) {
      npc.id = toSlug(npc.name as string);
    }
  }

  validateCampaign(campaign);
  console.log(`  ✓ Campaign: "${campaign.title}" (${masterNPCs.length} NPCs in master plan)`);

  // ─── Calls 2-4: Generate each act ──────────────────────────────────────

  const npcSummary = masterNPCs
    .map((npc) => `- ${npc.name} (${npc.id}): role=${npc.role}, srd=${npc.srdMonsterSlug ?? "none"}`)
    .join("\n");

  const npcMasterDetail = JSON.stringify(masterNPCs, null, 2);

  const acts: Array<Record<string, unknown>> = [];

  for (let actNum = 1; actNum <= 3; actNum++) {
    console.log(`Step ${actNum + 1}/5: Generating Act ${actNum}...`);

    // Compute per-act level range
    const levelSpan = maxLevel - minLevel;
    const actMinLevel = minLevel + Math.floor((levelSpan * (actNum - 1)) / 3);
    const actMaxLevel = minLevel + Math.floor((levelSpan * actNum) / 3);

    const actPrompt = `Generate Act ${actNum} for the campaign "${campaign.title}" (slug: "${slug}").

Campaign theme: ${campaign.dmSummary}

MASTER NPC ROSTER (the full truth — use as reference, DO NOT copy directly into the act):
${npcMasterDetail}

NPC ID reference:
${npcSummary}

═══ STANDALONE ACT NPC RULES ═══
The AI DM agent will ONLY see this act's data — never the master plan, never other acts. Every NPC in this act's "npcs" array must be a self-contained portrayal for Act ${actNum} ONLY.

NPC IDs must be IDENTICAL to the master plan (e.g. if master plan has "lysara-thorne", the act must use "lysara-thorne" — not "lysara" or "lysara-thorne-act-${actNum}").

Only include NPCs that are active/relevant in Act ${actNum}.

${actNum === 1 ? `ACT 1 NPC SCOPING:
- role: Use the NPC's COVER role, not their true role. A hidden villain → "patron". A future betrayer → "informant" or "ally".
- secrets: Empty array [] — no secrets are discoverable yet.
- betrayalTrigger: OMIT entirely.
- combatStats: OMIT unless the NPC is fightable in Act 1.
- motivations: Only their apparent motivations (e.g. "hire adventurers to investigate" not "complete a dark ritual").
- personality.bonds/flaws: Rewrite to match the cover identity. A villain's "her plan is her life's work" becomes "deeply invested in the city's safety."
- dmNotes: Describe ONLY how to portray them in Act 1. e.g. "Play as a warm, generous quest-giver. No hidden agenda hints."
- relationshipArc: Fill act1 ONLY, empty strings for act2 and act3.
` : ""}${actNum === 2 ? `ACT 2 NPC SCOPING:
- role: NPCs can still appear in their cover roles, but cracks are forming. A villain is still "patron" but their flaws now hint at evasiveness.
- secrets: Only secrets the party can DISCOVER this act (e.g. "provides forged evidence"). NOT the full truth.
- betrayalTrigger: Include ONLY if the betrayal is revealed in Act 2. Do NOT include future betrayal triggers.
- combatStats: OMIT unless the NPC is fightable in Act 2.
- motivations: Can show mixed motivations (e.g. "redirect suspicion" alongside "support the investigation").
- dmNotes: Describe Act 2 portrayal with emerging suspicion but NOT the full reveal. e.g. "She deflects questions about hospital funding. A DC 16 Insight check reveals evasiveness but nothing more."
- Do NOT name the true mastermind — use indirect references like "a powerful patron" or "someone on the council."
- relationshipArc: Fill act2 ONLY, empty strings for act1 and act3.
` : ""}${actNum === 3 ? `ACT 3 NPC SCOPING:
- FULL REVEAL: True roles, all secrets, betrayal triggers, combat stats — everything.
- role: Use true roles ("villain", "betrayer", etc.).
- secrets: Complete list of all secrets.
- combatStats: Include for all fightable NPCs.
- dmNotes: Full Act 3 portrayal — how to play the revealed villain, redeemed allies, etc.
- relationshipArc: Fill act3 ONLY, empty strings for act1 and act2.
` : ""}
═══ ACT CONTENT ═══
- hooks: 3-4 adventure hooks specific to Act ${actNum} (how the party gets drawn in).${actNum === 1 ? " These are the campaign entry points." : ""}${actNum > 1 ? " These flow from the previous act's conclusion." : ""}
- dmBriefing: Self-contained ~500 token DM briefing. Must NOT reference "the master plan" or information only in other acts. The DM reading this should be able to run Act ${actNum} from this briefing alone.${actNum < 3 ? `
- transitionToNextAct: How this act ends and sets up the next. Must NOT spoil the next act's villain reveal or twists — describe the cliffhanger from the players' perspective.` : `
- This is the final act. Do NOT include transitionToNextAct.`}

Act ${actNum} parameters:
- campaignSlug: "${slug}"
- actNumber: ${actNum}
- suggestedLevel: { min: ${actMinLevel}, max: ${actMaxLevel} }
${actNum === 1 ? "- This is the opening act. Establish the setting, introduce NPCs, and hook the party. Start with a social beat, not combat." : ""}
${actNum === 2 ? "- This is the middle act. Deepen the mystery, introduce betrayals, and raise the stakes. Start with an investigation or social beat." : ""}
${actNum === 3 ? "- This is the climactic act. Reveal the truth, confront the villain, and resolve the story. Include a boss story beat as the final beat. Start with an evidence-gathering or ally-rallying social beat." : ""}

Include 8-12 story beats that flow naturally into each other. Each beat's dmGuidance MUST end with a "Transition:" sentence explaining how it leads to the next beat. The first beat must NOT be combat. Combat should be ~20-30% of beats. Scale difficulty for levels ${actMinLevel}-${actMaxLevel}.

Output ONLY the JSON object, no markdown code blocks.`;

    const actText = await callClaude(systemPrompt, actPrompt);
    const actJSON = extractJSON(actText);
    const act = JSON.parse(actJSON) as Record<string, unknown>;

    // Enforce correct slugs and act number
    act.campaignSlug = slug;
    act.actNumber = actNum;

    // Fix NPC IDs on act-level NPCs to match master plan slugs
    const actNPCs = (act.npcs ?? []) as Array<Record<string, unknown>>;
    for (const npc of actNPCs) {
      if (typeof npc.id !== "string" || !npc.id) {
        npc.id = toSlug(npc.name as string);
      }
    }

    validateAct(act, actNum);
    acts.push(act);

    const npcNames = actNPCs.map((n) => `${n.name} (${n.role})`).join(", ");
    console.log(`  ✓ Act ${actNum}: "${act.title}" (${(act.storyBeats as unknown[]).length} story beats, ${actNPCs.length} NPCs: ${npcNames})`);
  }

  // ─── Call 5: Generate map specs ──────────────────────────────────────────

  console.log("Step 5/5: Generating map specifications...");

  // Gather all story beats and their locations across all acts
  const allBeats = acts.flatMap((act) =>
    (act.storyBeats as Array<Record<string, unknown>>).map((beat) => ({
      name: beat.name as string,
      location: beat.location as string,
      type: beat.type as string,
      actNumber: act.actNumber as number,
    })),
  );

  const beatSummary = allBeats
    .map((e) => `- "${e.name}" (${e.type}, Act ${e.actNumber}): ${e.location}`)
    .join("\n");

  const mapSpecPrompt = `Generate map specifications for the campaign "${campaign.title}" (slug: "${slug}").

Campaign theme: ${campaign.dmSummary}

All story beats and their locations:
${beatSummary}

Generate an array of CampaignMapSpecOutput objects. Each map spec should:
1. Cover one or more story beats that share a location
2. Have a detailed imagePrompt for AI image generation that describes the map as a top-down D&D battle map
3. Group story beats at the same location onto the same map
4. Set connections between maps that are narratively linked
5. Include locationTags that would match the story beat's location strings
6. Set actNumbers to which acts the map appears in


Story beats that span multiple locations or are purely narrative (like timed skill challenges) can be excluded from maps.
Generate 5-10 maps total. Do NOT generate maps for story beats that don't need a physical location.

Output ONLY a JSON object with a single "mapSpecs" array field containing CampaignMapSpecOutput objects. No markdown code blocks.`;

  const mapSpecText = await callClaude(systemPrompt, mapSpecPrompt);
  const mapSpecJSON = extractJSON(mapSpecText);
  const mapSpecData = JSON.parse(mapSpecJSON) as Record<string, unknown>;

  const rawMapSpecs = (mapSpecData.mapSpecs ?? mapSpecData) as Array<Record<string, unknown>>;
  if (!Array.isArray(rawMapSpecs) || rawMapSpecs.length < 3) {
    throw new Error(`Expected at least 3 map specs, got ${Array.isArray(rawMapSpecs) ? rawMapSpecs.length : 0}`);
  }

  // Validate map specs and build mapSpecId references for story beats
  for (const spec of rawMapSpecs) {
    if (!spec.id || !spec.name || !spec.imagePrompt) {
      throw new Error(`Map spec missing required fields: ${JSON.stringify(spec).slice(0, 100)}`);
    }
    // Remove storyBeatNames helper field before persisting
    delete spec.storyBeatNames;
  }

  // Add mapSpecs to campaign and set mapSpecId on matching story beats
  campaign.mapSpecs = rawMapSpecs;

  // Match story beats to map specs by location tag matching
  for (const act of acts) {
    for (const enc of act.storyBeats as Array<Record<string, unknown>>) {
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
    console.log(`    - ${spec.id}: "${spec.name}" (acts ${(spec.actNumbers as number[]).join(",")})`);
  }

  // ─── Seed to Firestore ──────────────────────────────────────────────────

  console.log("\nSeeding to Firestore...");

  // Strip the master NPC plan — it's a working reference, not stored on the campaign doc
  delete campaign.npcMasterPlan;

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
  for (const act of acts) {
    const actNPCs = (act.npcs as Array<Record<string, unknown>>) ?? [];
    console.log(`   Act ${act.actNumber} NPCs: ${actNPCs.map((n) => n.name).join(", ")}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Campaign generation failed:", err);
  process.exit(1);
});
