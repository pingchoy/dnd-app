/**
 * The Crimson Accord
 *
 * A political intrigue campaign set in the free city of Valdris.
 * Levels 1-5 | 3 acts | ~9 hours estimated playtime
 *
 * Theme: Political intrigue, betrayal, conspiracy
 * Setting: The free city of Valdris, a trade hub governed by a council of five merchant lords
 *
 * Overarching Plot:
 * The party is hired by Councilor Lysara Thorne to investigate disappearances in
 * the lower quarters. The trail leads through smugglers, a fake charitable hospital,
 * and political rivalries — but every thread leads back to Lysara herself. She has
 * been orchestrating the kidnappings to fuel an ancient blood magic ritual called
 * "The Crimson Accord" that would grant her immortality and domination over the city.
 */

import type {
  CampaignCombatMapSpec,
  CampaignExplorationMapSpec,
} from "../../src/app/lib/gameTypes";
import type { CampaignData } from "./index";

const SLUG = "the-crimson-accord";

// ─── Combat Map Specifications ──────────────────────────────────────────────
// Each combat map defines the physical layout for a single encounter location.
// The imagePrompt field is a copy-pasteable prompt for AI image generation.

const CRIMSON_ACCORD_COMBAT_MAP_SPECS: CampaignCombatMapSpec[] = [
  {
    id: "valdris-docks",
    name: "Valdris Docks, Pier 7",
    feetPerSquare: 5,
    imagePrompt:
      "Top-down fantasy D&D battle map of a nighttime waterfront pier district. The southern edge is open water with wooden dock platforms extending outward. Two large cargo ships moored along the south and southeast. Wooden pier walkways (5 ft wide) run between ships and along the waterfront. Northern half has a row of warehouses and storage sheds with narrow alleys between them. Crates and barrels stacked in clusters on the pier providing cover. Main dock road runs east-west through center connecting the pier to city streets on the western edge. Harbormaster's shack in the northwest corner. Urban terrain, dim lighting. Rain-slicked wooden planks, lanterns swaying on ship masts, fog rolling in from the harbor. Detailed tabletop RPG battle map, painted illustration, no text, no labels.",
  },
  {
    id: "council-hall",
    name: "Valdris Council Hall",
    feetPerSquare: 5,
    imagePrompt:
      "Top-down fantasy D&D battle map of an imposing marble government building interior. Main entrance on the south opens into a grand foyer with pillars. Central feature is a large circular council chamber with a raised dais and five ornate chairs in a semicircle. Eastern wing has a grand reception room with long banquet tables and a balcony overlooking the city. Western wing has private offices and meeting rooms connected by a corridor. Servants' passage along the northern wall connects kitchen to reception room. Interior terrain, bright lighting. Polished marble floors, crystal chandeliers, tapestries depicting city history, beeswax candles. Detailed tabletop RPG battle map, painted illustration, no text, no labels.",
  },
  {
    id: "undercity-tunnels",
    name: "Valdris Undercity Tunnels",
    feetPerSquare: 5,
    imagePrompt:
      "Top-down fantasy D&D battle map of a network of old sewer tunnels and forgotten basements. Main tunnel runs north-south through center, roughly 10 ft wide with arched brick ceilings. Side passages branch east and west, some collapsed and impassable. Flooded section in the southeast forces a detour. Northwest has a wider junction where three tunnels meet. Rat nests cluster in dead-end alcoves along the eastern wall. Southern exit connects to docks, northern passage leads toward a warehouse. Underground terrain, dark lighting. Dripping water, brick walls, stale air, patches of bioluminescent fungus providing faint green light. Detailed tabletop RPG battle map, painted illustration, no text, no labels.",
  },
  {
    id: "smuggler-warehouse",
    name: "Undercity Warehouse",
    feetPerSquare: 5,
    imagePrompt:
      "Top-down fantasy D&D battle map of a large converted basement used as a smuggler staging area. Main floor is a rectangular open space filled with crates and cargo arranged in rows. Raised wooden platform along the eastern wall overlooking the floor. Northern end has a walled-off office with desk and document storage. Iron cages line the western wall. Tunnel entrance on the south connects to the undercity. Locked iron door in the northeast corner leads deeper underground. Underground terrain, dim lighting. Lantern-lit with deep shadows between crate rows, iron cages with scattered personal belongings. Detailed tabletop RPG battle map, painted illustration, no text, no labels.",
  },
  {
    id: "caelum-hospital",
    name: "Brother Caelum's Hospital",
    feetPerSquare: 5,
    imagePrompt:
      "Top-down fantasy D&D battle map of a modest two-story stone building converted into a charitable hospital. Ground floor has a main ward room with rows of cots along east and west walls, reception area near the southern entrance, supply closet in the southwest corner with a concealed door to the basement. Western side has private quarters — a small bedroom and study. Basement accessed via concealed door contains a corridor leading to a large ritual preparation room with arcane circles on the floor, alchemical equipment on tables, and restraint chairs. Interior terrain, mixed lighting — bright herbs-and-linen upper floor, dim sinister basement with faintly glowing arcane symbols. Detailed tabletop RPG battle map, painted illustration, no text, no labels.",
  },
  {
    id: "blackwood-estate",
    name: "Blackwood Estate",
    feetPerSquare: 5,
    imagePrompt:
      "Top-down fantasy D&D battle map of a lavish noble estate. Southern entrance through a pillared portico into a marble-floored foyer. Grand ballroom dominates the center — vast room with dance floor, crystal chandeliers, and musicians' gallery on upper level. Eastern wing has formal dining room and kitchen. Western wing contains a private study and library. Garden terrace extends from the northern side with hedgerows and a fountain. Servants' stairs in the northeast connect all levels. Interior terrain, bright lighting. Opulent slightly dated decor — fur-trimmed curtains, jeweled candelabras, oil paintings of merchant ships. Detailed tabletop RPG battle map, painted illustration, no text, no labels.",
  },
  {
    id: "the-narrows",
    name: "The Narrows",
    feetPerSquare: 5,
    imagePrompt:
      "Top-down fantasy D&D battle map of a twisting narrow alley connecting two city quarters. Alley is only 5-10 ft wide, hemmed in by tall three-story buildings on both sides. Main passage runs roughly north-south with a slight S-curve in the middle. Dead-end side alleys branch east and west. Wooden balconies and clotheslines overhang the alley reducing visibility. Small courtyard opens in the center where the alley widens around a dry well. Northern and southern exits connect to wider streets. Urban terrain, dim lighting. Claustrophobic and shadowy, buildings leaning inward overhead, puddles, faint moonlight. Detailed tabletop RPG battle map, painted illustration, no text, no labels.",
  },
  {
    id: "ancient-temple",
    name: "Ancient Temple Complex",
    feetPerSquare: 5,
    imagePrompt:
      "Top-down fantasy D&D battle map of a vast ancient underground temple. Entrance is a descending staircase from the north leading into a main hall with crumbling stone pillars and faded murals. Central corridor runs south through a trapped hallway. Collapsed bridge spans a deep chasm in the middle section. Eastern wing has a preparation chamber with arcane circles. Western wing contains the grand ritual chamber — a massive cathedral-like space with a 30 ft diameter ritual circle inscribed in the floor, an altar at the center, and tiered viewing galleries above. Ancient statues of forgotten gods flank the ritual circle. Dungeon terrain, dark lighting. Ancient stonework covered in moss and dried blood, faded murals of robed figures, a low hum of arcane energy, thick warm air. Detailed tabletop RPG battle map, painted illustration, no text, no labels.",
  },
];

// ─── Exploration Map Specification ──────────────────────────────────────────
// The city-level exploration map with numbered POIs linking to combat maps.
// Hidden POIs are revealed through play; all POI names are lowercase per
// project convention (lowercase strings persisted to Firestore).

const CRIMSON_ACCORD_EXPLORATION_MAP_SPECS: CampaignExplorationMapSpec[] = [
  {
    id: "valdris-city",
    name: "The Free City of Valdris",
    imagePrompt:
      "Top-down bird's-eye view of a sprawling medieval fantasy port city. Southern edge borders a harbor with wooden docks and moored cargo ships. City rises northward through narrow streets lined with stone buildings, from crowded lower quarters to an elegant upper district with marble government buildings and noble estates. A river or canal cuts through the middle. Temple spires and market squares dot the landscape. Dim and atmospheric — a city of intrigue beneath torchlit streets. Detailed fantasy cartography, parchment-style overworld map, painted illustration, warm muted colors, atmospheric lighting, no text, no labels, no grid lines.",
    pointsOfInterest: [
      {
        id: "poi_docks",
        number: 1,
        name: "valdris docks",
        description: "A nighttime waterfront pier district. Rain-slicked wooden planks, moored cargo ships, warehouses with narrow alleys, and crates providing cover. The harbormaster's shack sits in the northwest corner.",
        combatMapSpecId: "valdris-docks",
        isHidden: false,
        actNumbers: [1],
        locationTags: ["valdris docks", "pier 7", "docks", "harbor", "waterfront"],
      },
      {
        id: "poi_council",
        number: 2,
        name: "council hall",
        description: "An imposing marble government building with a grand foyer, circular council chamber, reception room, private offices, and servants' passages.",
        combatMapSpecId: "council-hall",
        isHidden: false,
        actNumbers: [1, 3],
        locationTags: ["council hall", "council chambers", "council reception", "valdris council"],
      },
      {
        id: "poi_undercity",
        number: 3,
        name: "undercity tunnels",
        description: "A network of old sewer tunnels beneath the lower quarters. Arched brick ceilings, flooded sections, rat nests, and a junction where tunnels meet.",
        combatMapSpecId: "undercity-tunnels",
        isHidden: true,
        actNumbers: [1],
        locationTags: ["undercity", "tunnels", "sewers", "underground", "beneath the lower quarters"],
      },
      {
        id: "poi_warehouse",
        number: 4,
        name: "smuggler warehouse",
        description: "A converted basement used as a smuggler staging area. Crates in rows, a raised crossbow platform, a walled-off office, and iron cages along the western wall.",
        combatMapSpecId: "smuggler-warehouse",
        isHidden: true,
        actNumbers: [1],
        locationTags: ["warehouse", "smuggler warehouse", "undercity warehouse", "market district"],
      },
      {
        id: "poi_hospital",
        number: 5,
        name: "brother caelum's hospital",
        description: "A modest two-story charitable hospital. Main ward with cots, reception area, Caelum's private quarters, and a concealed basement with arcane circles and alchemical equipment.",
        combatMapSpecId: "caelum-hospital",
        isHidden: false,
        actNumbers: [2],
        locationTags: ["hospital", "caelum's hospital", "brother caelum", "charitable hospital"],
      },
      {
        id: "poi_estate",
        number: 6,
        name: "blackwood estate",
        description: "A lavish noble estate with grand ballroom, formal dining, private study, and garden terrace. Site of the masquerade ball.",
        combatMapSpecId: "blackwood-estate",
        isHidden: false,
        actNumbers: [2],
        locationTags: ["blackwood estate", "blackwood's estate", "masquerade ball", "grand ballroom"],
      },
      {
        id: "poi_narrows",
        number: 7,
        name: "the narrows",
        description: "A twisting narrow alley between upper and middle quarters. Only 5-10 ft wide, with overhanging balconies and a dry well courtyard in the center.",
        combatMapSpecId: "the-narrows",
        isHidden: true,
        actNumbers: [2],
        locationTags: ["the narrows", "narrow alley", "alley", "between upper and middle quarters"],
      },
      {
        id: "poi_temple",
        number: 8,
        name: "ancient temple",
        description: "A vast underground temple predating the city. Crumbling pillars, trapped corridors, a chasm bridge, preparation chamber with captives, and a grand ritual chamber.",
        combatMapSpecId: "ancient-temple",
        isHidden: true,
        actNumbers: [3],
        locationTags: ["ancient temple", "temple complex", "ritual chamber", "underground temple", "temple beneath"],
      },
    ],
  },
];

export const theCrimsonAccord: CampaignData = {
  campaign: {
    slug: SLUG,
    title: "The Crimson Accord",
    playerTeaser:
      "The free city of Valdris thrives on trade and ambition — but something rots beneath its gilded surface. People are vanishing from the lower quarters, and the city watch is stretched too thin to investigate. A powerful councilor has taken notice and seeks capable adventurers to root out the truth. But in a city where every smile hides a dagger, trust is the most dangerous currency of all.",
    theme: "political intrigue",
    suggestedLevel: { min: 1, max: 5 },
    estimatedDurationHours: 9,
    hooks: [
      "a city councilor posts a public bounty for information on the disappearances in the lower quarters",
      "the party encounters a distraught family member searching for a missing loved one near the docks",
      "captain aldric vane approaches the party in a tavern, desperate for outside help the watch can't officially sanction",
      "a street urchin delivers a sealed letter from councilor lysara thorne, offering gold and patronage",
    ],
    actSlugs: [
      `${SLUG}_act-1`,
      `${SLUG}_act-2`,
      `${SLUG}_act-3`,
    ],
    npcs: [
      // ── Lysara Thorne — Patron → Villain ──────────────────────────────
      {
        id: "lysara-thorne",
        name: "Lysara Thorne",
        srdMonsterSlug: "mage",
        role: "villain",
        appearance:
          "A striking woman in her early forties with silver-streaked auburn hair swept into an elegant updo. She favors deep crimson robes trimmed with gold thread and carries herself with the practiced grace of someone born to power. Her green eyes are sharp and assessing, though her smile is warm enough to disarm even the most suspicious visitor.",
        personality: {
          traits: [
            "charming and generous with compliments",
            "speaks with deliberate precision, never wasting a word",
            "remembers every name and personal detail — uses them to make people feel valued",
          ],
          ideals: [
            "order and control above all — the city needs a firm hand, not a squabbling council",
            "power is not evil; it is the only reliable tool for lasting change",
          ],
          bonds: [
            "the crimson accord is her life's work — decades of research and sacrifice",
            "she genuinely believes valdris will be better under her sole rule",
          ],
          flaws: [
            "underestimates those she considers beneath her station",
            "cannot conceive that her plan might be morally wrong",
            "her need for control makes her micromanage, leaving evidence trails",
          ],
        },
        motivations: [
          "complete the crimson accord ritual to gain immortality and dominion over valdris",
          "eliminate political rivals and consolidate the council under her authority",
          "genuinely believes she is the only one competent enough to rule",
        ],
        secrets: [
          "orchestrated every kidnapping through intermediaries",
          "funded brother caelum's hospital as a front for arcane experiments on the kidnapped",
          "murdered her own mentor to obtain the crimson accord scrolls twenty years ago",
          "has been slowly poisoning lord blackwood's wine for months to weaken him",
        ],
        betrayalTrigger:
          "When the party gets too close to connecting the hospital to the kidnappings, Lysara frames Lord Blackwood and escalates the ritual timeline. If directly confronted with evidence, she drops the patron facade and attempts to eliminate witnesses.",
        relationshipArc: {
          act1: "Trusted patron — generous, warm, and seemingly invested in the party's success. Provides gold, information, and political access freely.",
          act2: "Still supportive but subtly deflects certain questions. Redirects investigation toward Blackwood. Becomes harder to reach as 'council duties' intensify.",
          act3: "Revealed as the mastermind. Alternates between cold calculation and genuine disappointment that the party couldn't see her vision. Fights to complete the ritual.",
        },
        combatStats: {
          ac: 15,
          hp: 85,
          attackBonus: 7,
          damageDice: "2d10",
          damageBonus: 4,
          xpValue: 2300,
          specialAbilities:
            "Crimson Accord Empowerment: At half HP, gains +2 AC and deals an extra 1d6 necrotic damage on spell attacks. Can cast Shield as a reaction (3/day). Legendary Action (1/round): cast a cantrip.",
        },
        dmNotes:
          "Lysara is the campaign's central antagonist, but she should feel like a genuine ally for most of Act 1 and Act 2. Play her as intelligent, generous, and politically savvy. She asks the party thoughtful questions about their backgrounds and remembers details — this makes the betrayal sting. Never have her act suspicious early; her confidence is her armor. In Act 3, she should be a tragic villain who genuinely believes she's saving the city. Give players a chance to talk her down (very hard DC 25 Persuasion) for an alternative ending.",
        voiceNotes:
          "Speaks with calm authority, never raises her voice. Uses 'my dear' and 'my friend' frequently. When lying, she maintains perfect eye contact and speaks slightly slower. In Act 3, her composure cracks — voice trembles with conviction, not fear.",
      },

      // ── Captain Aldric Vane — Ally → Victim → Ally ────────────────────
      {
        id: "captain-aldric-vane",
        name: "Captain Aldric Vane",
        srdMonsterSlug: "veteran",
        role: "ally",
        appearance:
          "A weathered man in his late fifties with close-cropped grey hair and a jagged scar running from his left temple to his jaw. He wears well-maintained city watch armor that's seen better days. His brown eyes carry the weight of too many unsolved cases, but his handshake is firm and his word is iron.",
        personality: {
          traits: [
            "blunt and direct — has no patience for political games",
            "protective of his watchmen and the common folk of valdris",
            "drinks too much ale in the evenings but never lets it affect his duty",
          ],
          ideals: [
            "justice should apply equally to lords and laborers",
            "a good captain leads from the front",
          ],
          bonds: [
            "lost his partner to an 'unsolved' murder ten years ago — suspects political cover-up",
            "the watch is his family; he'd die for any of them",
          ],
          flaws: [
            "too trusting of authority figures — doesn't suspect lysara until it's almost too late",
            "stubborn pride prevents him from asking for help until desperate",
          ],
        },
        motivations: [
          "solve the disappearances and bring the perpetrators to justice",
          "protect the common people the council has abandoned",
          "find out who really killed his partner a decade ago",
        ],
        secrets: [
          "his partner's murder was ordered by lysara to silence an earlier investigation",
          "he found a crimson accord symbol at his partner's murder scene but never understood what it meant",
          "he's been keeping unofficial case files hidden in his home",
        ],
        relationshipArc: {
          act1: "Cautious ally — respects the party's willingness to help but tests their commitment. Shares information gradually as trust builds.",
          act2: "Warns the party they're being watched. Shares his partner's cold case files. Poisoned by Lysara's agents midway through the act — becomes a victim the party must save.",
          act3: "If saved from poisoning, provides crucial evidence from his partner's old case files. Fights alongside the party in the final confrontation if able.",
        },
        dmNotes:
          "Aldric is the party's moral compass and primary ally. He's the honest cop in a corrupt system. Use him to deliver exposition naturally through case briefings. His poisoning in Act 2 should be a gut-punch that raises personal stakes. If the party saves him, he becomes a valuable combat ally in Act 3. If they don't prioritize his cure, he dies — which should haunt them and motivate the finale.",
        voiceNotes:
          "Gruff baritone, speaks in short declarative sentences. Punctuates points by tapping the table. Calls everyone by their surname until he respects them, then switches to first names — this transition should feel earned.",
      },

      // ── Mira Vex — Informant → Double Agent → Redeemed ────────────────
      {
        id: "mira-vex",
        name: "Mira Vex",
        srdMonsterSlug: "spy",
        role: "betrayer",
        appearance:
          "A lithe halfling woman in her mid-twenties with sharp features, dark eyes that miss nothing, and ink-black hair cut short and practical. She dresses in muted browns and greys that let her blend into any crowd. A faint scar on her right hand marks where she once caught a thrown knife.",
        personality: {
          traits: [
            "quick-witted with a dark sense of humor",
            "fidgets constantly — spinning a coin, tapping fingers, shifting weight",
            "speaks in street slang but slips into educated vocabulary when she forgets herself",
          ],
          ideals: [
            "survival comes first — loyalty is a luxury for those who can afford it",
            "information is the only currency that never devalues",
          ],
          bonds: [
            "grew up orphaned in the lower quarters — the streets raised her",
            "secretly reports to lysara out of fear, not loyalty",
          ],
          flaws: [
            "trusts no one fully, which makes genuine connection difficult",
            "her survival instinct sometimes overrides her conscience",
          ],
        },
        motivations: [
          "stay alive — lysara's reach is long and her patience is short",
          "earn enough gold to leave valdris and start over somewhere safe",
          "deep down, wants to do the right thing but is terrified of the consequences",
        ],
        secrets: [
          "has been reporting the party's movements to lysara since act 1",
          "knows the location of lysara's ritual chamber but is too afraid to reveal it",
          "her educated speech comes from two years at the valdris academy before she was expelled for theft",
        ],
        betrayalTrigger:
          "Mira's betrayal is revealed in Act 2 when the party discovers she's been feeding information to Lysara. However, she can be redeemed in Act 3 if the party appeals to her conscience — she turns against Lysara out of guilt when she learns the full scope of the kidnappings.",
        relationshipArc: {
          act1: "Helpful informant — provides underworld contacts and smuggler intelligence. Seems genuinely invested in helping, which she partially is.",
          act2: "Revealed as Lysara's informant. Can flee or be captured. If the party shows mercy, she becomes wracked with guilt.",
          act3: "If given a chance at redemption, provides the location of Lysara's ritual chamber and fights alongside the party. Her knowledge of the temple layout is invaluable.",
        },
        dmNotes:
          "Mira is the morally grey NPC who tests the party's capacity for mercy. Her betrayal should feel like a genuine sting, but her redemption arc should feel earned, not automatic. Make the party work for it — she won't just flip sides because they ask nicely. She needs to see proof that Lysara's plan will destroy the lower quarters she grew up in. If the party kills her or refuses to offer redemption, they lose a valuable ally for Act 3 and must find the ritual chamber through harder means.",
        voiceNotes:
          "Speaks quickly in clipped sentences. Uses 'yeah?' as a verbal tic at the end of statements. When nervous, her street accent thickens. When being honest for the first time, she speaks slowly and deliberately — the contrast should be noticeable.",
      },

      // ── Zephyr — Guide with personal stakes ───────────────────────────
      {
        id: "zephyr",
        name: "Zephyr",
        srdMonsterSlug: "commoner",
        role: "ally",
        appearance:
          "A wiry teenage tiefling with lavender skin, small curved horns, and anxious golden eyes. They wear a patchwork cloak over threadbare clothes and carry a worn leather satchel stuffed with hand-drawn maps of the undercity. Their tail wraps around their leg when they're nervous, which is often.",
        personality: {
          traits: [
            "earnest and determined despite obvious fear",
            "has an encyclopedic knowledge of valdris's tunnel systems and shortcuts",
            "talks too fast when excited or scared",
          ],
          ideals: [
            "family is everything — blood or chosen",
            "even the smallest person can change the course of events",
          ],
          bonds: [
            "their older sibling sera was among the first kidnapped — finding her is their only goal",
            "owes a debt to captain aldric, who once saved them from a gang",
          ],
          flaws: [
            "reckless when sera's safety is at stake — will charge into danger without thinking",
            "too young to fully grasp the political complexity of what they've stumbled into",
          ],
        },
        motivations: [
          "find their missing sibling sera at any cost",
          "help the party because they're the first adults who actually listened",
          "prove they're not just a helpless kid",
        ],
        secrets: [
          "witnessed a kidnapping from a rooftop and can identify one of lysara's agents",
          "their sibling sera was specifically targeted because she's a latent sorcerer — useful for the ritual",
          "has been living in the undercity tunnels since sera disappeared, mapping possible hiding spots",
        ],
        relationshipArc: {
          act1: "Desperate guide — approaches the party for help finding their sibling. Provides invaluable knowledge of the undercity and lower quarters.",
          act2: "Grows more confident with the party's support. Discovers that sera is being held at the hospital. Becomes emotionally volatile as they get closer to the truth.",
          act3: "Reveals sera was among the kidnapped. Their personal stakes raise the emotional tension of the finale. If sera is saved, Zephyr's gratitude is boundless.",
        },
        dmNotes:
          "Zephyr is the emotional heart of the campaign — a scared kid trying to save their family. They should make the kidnappings feel personal, not abstract. Use Zephyr to guide the party through the undercity (literal guide role) and to remind them why the investigation matters when political complexity threatens to overshadow human cost. Zephyr is NOT a combat asset — keep them out of fights and make protecting them a consideration.",
        voiceNotes:
          "Speaks rapidly with a slight stammer when nervous. Uses 'I mean' and 'like' as filler words. When talking about sera, their voice drops to barely a whisper. Calls the party members by nicknames they invent (the tall one, the magic one, etc.) until corrected.",
      },

      // ── Brother Caelum — Neutral → Villain's pawn ─────────────────────
      {
        id: "brother-caelum",
        name: "Brother Caelum",
        srdMonsterSlug: "priest",
        role: "neutral",
        appearance:
          "A gaunt human man in his sixties with hollow cheeks, thinning white hair, and watery blue eyes that look perpetually tired. He wears simple grey robes with a silver sun pendant and moves with a slight limp. His hands shake when he's not clasping them together in prayer.",
        personality: {
          traits: [
            "speaks softly and chooses words with care",
            "genuinely compassionate toward the sick and poor",
            "avoids direct questions with gentle deflections and scripture quotes",
          ],
          ideals: [
            "healing is sacred — all who suffer deserve care regardless of circumstance",
            "faith provides answers that reason cannot",
          ],
          bonds: [
            "the hospital is his life's work — he built it from nothing over thirty years",
            "lysara funded the hospital's expansion and he feels deeply indebted to her",
          ],
          flaws: [
            "willful blindness — suspects something is wrong in the basement but refuses to look",
            "his gratitude to lysara overrides his moral compass",
            "too old and tired to fight, so he rationalizes compliance as pragmatism",
          ],
        },
        motivations: [
          "maintain his hospital and continue helping the poor",
          "avoid confronting the truth about what lysara is doing in the lower levels",
          "find peace with his conscience, which grows heavier by the day",
        ],
        secrets: [
          "gave lysara access to the hospital basement for her 'charitable research'",
          "has heard screaming from below but convinced himself it's the ravings of fever patients",
          "keeps a journal documenting his doubts — a key piece of evidence if found",
        ],
        relationshipArc: {
          act1: "Peripheral figure — the party may hear about the hospital but won't interact with Caelum directly.",
          act2: "Central figure — the party investigates his hospital and must determine if he's complicit or a dupe. He cooperates nervously but deflects questions about the basement.",
          act3: "If confronted with evidence, breaks down and confesses everything he knows. Can provide detailed layout of the basement and Lysara's schedule. May sacrifice himself to help the party if given the chance for redemption.",
        },
        dmNotes:
          "Caelum is the 'banality of evil' NPC — a good man who chose not to see. He's not a villain, but his cowardice enabled villainy. Play him as genuinely kind on the surface with visible cracks of guilt underneath. His journal is a key evidence piece in Act 2. If the party treats him with compassion, he opens up faster. If they threaten him, he clams up and becomes useless. He should make the party uncomfortable — punishing him feels wrong, but so does letting him off the hook.",
        voiceNotes:
          "Soft, reedy voice that trembles when he's lying. Quotes scripture when deflecting (make up appropriate-sounding blessings). Wrings his hands constantly. When he finally tells the truth, he speaks with sudden clarity and strength — as if a weight has been lifted.",
      },

      // ── Lord Harren Blackwood — Rival → Victim ────────────────────────
      {
        id: "lord-harren-blackwood",
        name: "Lord Harren Blackwood",
        srdMonsterSlug: "noble",
        role: "rival",
        appearance:
          "A portly man in his fifties with an impressive handlebar mustache, ruddy complexion, and calculating brown eyes. He dresses in expensive but slightly outdated fashion — fur-trimmed cloaks and jeweled rings on every finger. His laugh is loud and his temper louder.",
        personality: {
          traits: [
            "loud, opinionated, and convinced he's the smartest person in any room",
            "surprisingly shrewd beneath the blustering exterior",
            "generous with his wealth when it serves his reputation",
          ],
          ideals: [
            "commerce is the lifeblood of civilization — protect trade above all",
            "a man's reputation is his most valuable asset",
          ],
          bonds: [
            "his merchant empire is his legacy — he built it from a single trading post",
            "despises lysara for her growing political influence",
          ],
          flaws: [
            "his ego blinds him to genuine threats — dismisses lysara as 'that ambitious woman'",
            "drinks heavily at social events and says things he shouldn't",
          ],
        },
        motivations: [
          "maintain his position on the council and counter lysara's growing influence",
          "protect his trade routes from whatever is disrupting the lower quarters",
          "secure his legacy and family name",
        ],
        secrets: [
          "has evidence that lysara's charity hospital receives suspiciously large funding",
          "hired private investigators who disappeared — same kidnapping ring",
          "his own shipping manifests show discrepancies he hasn't examined closely — some of his ships were used without his knowledge",
        ],
        relationshipArc: {
          act1: "Background figure — mentioned in political context as Lysara's chief rival on the council.",
          act2: "Active rival — hosts the masquerade ball where key evidence surfaces. Lysara frames him as the mastermind. Found dead (apparent suicide) at act's end.",
          act3: "His death galvanizes the investigation. Evidence from his private study (if the party searched it) helps build the case against Lysara.",
        },
        dmNotes:
          "Blackwood is a red herring and a victim. He's loud, abrasive, and politically motivated — easy to suspect. Lysara deliberately points the party toward him. His murder should shock the party and raise the stakes dramatically. If the party investigated Blackwood's claims about the hospital funding before his death, they'll have crucial evidence. If they dismissed him as a blowhard, they'll regret it. His death is the turning point from 'political mystery' to 'deadly conspiracy.'",
        voiceNotes:
          "Booming voice, speaks with dramatic hand gestures. Laughs from the belly. Uses 'by the gods' as an exclamation. When serious, drops the volume to a near-whisper and leans in conspiratorially — these moments should feel genuinely threatening and intimate.",
      },
    ],
    explorationMapSpecs: CRIMSON_ACCORD_EXPLORATION_MAP_SPECS,
    combatMapSpecs: CRIMSON_ACCORD_COMBAT_MAP_SPECS,
    dmSummary:
      "Political intrigue in the free city of Valdris. Dark fantasy tone with themes of trust, power, and corruption beneath gilded surfaces. A trade hub governed by a council of merchant lords where people are vanishing from the lower quarters. The campaign rewards careful investigation, relationship-building, and paying attention to NPC motivations over brute force.",
  },

  acts: [
    // ═══════════════════════════════════════════════════════════════════════
    // ACT 1: Shadows in the Market
    // ═══════════════════════════════════════════════════════════════════════
    {
      campaignSlug: SLUG,
      actNumber: 1,
      title: "Shadows in the Market",
      explorationMapSpecId: "valdris-city",
      summary:
        "Strange disappearances plague the lower quarters of Valdris. A powerful councilor hires the party to investigate, leading them into the city's criminal underbelly where smugglers, street urchins, and corrupt officials all have pieces of a larger puzzle.",
      suggestedLevel: { min: 1, max: 2 },
      setting:
        "The lower quarters of Valdris — a maze of narrow alleys, bustling market squares, crumbling tenements, and underground tunnels. The docks district reeks of fish and tar. The undercity beneath is a network of old sewer tunnels and forgotten basements used by smugglers.",
      plotPoints: [
        "the party is hired by councilor lysara thorne to investigate disappearances in the lower quarters",
        "investigation reveals a smuggling ring operating from the docks district",
        "the smugglers are transporting kidnapped people to an unknown buyer, not selling goods",
        "strange arcane symbols found at kidnapping sites hint at a larger conspiracy",
        "the trail leads to a warehouse in the undercity serving as a staging area",
        "raid on the warehouse reveals victims are being moved to the old temple district",
      ],
      mysteries: [
        "what do the arcane symbols at kidnapping sites mean? (answer: components of the crimson accord ritual)",
        "who is buying the kidnapped people and why? (answer: lysara, for the ritual)",
        "why are victims chosen seemingly at random? (answer: they're not — each has a trace of magical aptitude needed for the ritual)",
        "who tipped off the smugglers about the watch investigation? (answer: mira vex, via lysara)",
      ],
      keyEvents: [
        "lysara thorne summons the party to her council chambers and offers a generous contract",
        "meeting captain aldric vane at the watch house — he's been investigating alone",
        "first encounter with mira vex in a lower quarter tavern — she offers to sell information",
        "zephyr approaches the party desperately seeking help finding their missing sibling",
        "discovery of arcane symbols carved into the walls of a kidnapping victim's home",
        "raid on the smuggler warehouse reveals cages, shipping manifests, and a tunnel to the temple district",
      ],
      encounters: [
        {
          name: "Dockside Smuggler Ambush",
          description:
            "While investigating the docks at night, the party is ambushed by smugglers who think they're rival thieves. The fight takes place on rain-slicked wooden piers between moored cargo ships.",
          type: "combat",
          difficulty: "easy",
          enemies: [
            { srdMonsterSlug: "bandit", count: 3, notes: "armed with crossbows, one flees at half hp to warn the warehouse" },
            { srdMonsterSlug: "thug", count: 1, notes: "the smuggler leader, carries a manifest listing delivery locations" },
          ],
          location: "valdris docks, pier 7",
          mapSpecId: "valdris-docks",
          rewards: { xp: 175, gold: 25, items: ["smuggler's manifest", "dockside warehouse key"] },
          dmGuidance:
            "This is likely the party's first combat. Keep it simple and let them feel competent. The fleeing bandit creates urgency for the warehouse raid. The manifest is the key clue — it lists deliveries to 'the temple basement, care of Brother C.' which connects to Act 2.",
        },
        {
          name: "Council Reception",
          description:
            "Lysara invites the party to a council reception to introduce them to Valdris's political players. A social encounter where the party can gather information, make allies, and observe the dynamics between council members.",
          type: "social",
          difficulty: "medium",
          npcInvolvement: ["lysara-thorne", "lord-harren-blackwood"],
          location: "valdris council hall, grand reception room",
          mapSpecId: "council-hall",
          rewards: { xp: 100 },
          dmGuidance:
            "Use this to establish the political landscape. Lysara is warm and attentive. Blackwood is loud and dismissive of the kidnapping investigation ('lower quarter riffraff'). Let the party overhear gossip about Lysara's charity hospital. A successful DC 14 Insight check on Lysara reveals nothing — she's that good. A DC 12 Insight check on Blackwood reveals genuine concern beneath his bluster about 'trade disruptions.'",
        },
        {
          name: "Undercity Exploration",
          description:
            "Guided by Zephyr's hand-drawn maps, the party navigates the tunnels beneath the lower quarters searching for the smugglers' staging area. Collapsed passages, flooded corridors, and territorial rats present obstacles.",
          type: "exploration",
          difficulty: "medium",
          npcInvolvement: ["zephyr"],
          enemies: [
            { srdMonsterSlug: "giant-rat", count: 4, notes: "nest in a collapsed side tunnel, attack if disturbed" },
          ],
          location: "valdris undercity tunnels",
          mapSpecId: "undercity-tunnels",
          rewards: { xp: 100, items: ["zephyr's annotated undercity map"] },
          dmGuidance:
            "This is about atmosphere and relationship-building with Zephyr. Describe the tunnels as claustrophobic and unsettling. Zephyr knows every shortcut but is visibly terrified — they've never gone this deep. The giant rats are a minor obstacle. The real prize is finding fresh bootprints and drag marks leading to the warehouse.",
        },
        {
          name: "Smuggler Warehouse Raid",
          description:
            "The party assaults the smugglers' undercity warehouse — a converted basement with iron cages, crates of supplies, and a locked tunnel leading toward the temple district. The smugglers are expecting a delivery, not an attack.",
          type: "combat",
          difficulty: "hard",
          enemies: [
            { srdMonsterSlug: "bandit", count: 4, notes: "scattered among crates, two have crossbows on a raised platform" },
            { srdMonsterSlug: "bandit-captain", count: 1, notes: "in the back office, tries to burn documents before fighting" },
          ],
          location: "undercity warehouse beneath the market district",
          mapSpecId: "smuggler-warehouse",
          rewards: { xp: 450, gold: 50, items: ["partially burned shipping records", "temple district tunnel key", "crimson accord symbol rubbing"] },
          dmGuidance:
            "This is the act's climax. The warehouse has environmental elements: crates for cover, a raised platform with crossbow bandits, hanging lanterns that can be knocked down to create fire. The bandit captain tries to burn evidence first — if the party is fast (initiative), they can save the documents which directly name 'Brother Caelum's hospital' as the delivery destination. The cages are empty but recently used — scratches on the walls and personal belongings left behind make the kidnappings visceral.",
        },
      ],
      relevantNPCIds: [
        "lysara-thorne",
        "captain-aldric-vane",
        "mira-vex",
        "zephyr",
      ],
      transitionToNextAct:
        "The warehouse raid reveals that kidnapped victims are being transported through underground tunnels to the old temple district, specifically to a location connected to Brother Caelum's charitable hospital. The partially burned records mention 'the accord preparations' and reference Councilor Thorne's funding. As the party reports their findings to Lysara, she expresses shock and urges them to investigate the hospital — setting the stage for Act 2's deeper conspiracy.",
      dmBriefing:
        "Act 1 establishes the mystery and introduces the key players. Lysara should feel like a trustworthy patron — generous, attentive, and genuinely concerned. Aldric is the gruff ally who tests the party's resolve before opening up. Mira appears helpful but is secretly reporting to Lysara — drop no hints of this yet. Zephyr provides emotional stakes and practical guidance through the undercity. The arc moves from 'missing persons case' to 'organized smuggling ring' to 'something much bigger.' Key evidence trail: docks → smuggler manifest → undercity tunnels → warehouse → temple district connection. Pace the investigation with social scenes between action beats. Let the party feel like they're making progress while building dread about what they'll find. The arcane symbols should be noted but not yet understood — seed the mystery for Act 2. End the act on the revelation that the kidnapped are being taken to the hospital, creating urgency for Act 2.",
    },

    // ═══════════════════════════════════════════════════════════════════════
    // ACT 2: The Gilded Cage
    // ═══════════════════════════════════════════════════════════════════════
    {
      campaignSlug: SLUG,
      actNumber: 2,
      title: "The Gilded Cage",
      explorationMapSpecId: "valdris-city",
      summary:
        "The investigation leads to a charitable hospital hiding dark secrets, a masquerade ball where alliances shift, and a devastating betrayal. As the party peels back layers of conspiracy, they discover the disappearances are connected to an ancient and terrible ritual.",
      suggestedLevel: { min: 2, max: 3 },
      setting:
        "Upper and middle quarters of Valdris — elegant townhouses, the grand hospital of Brother Caelum, Lord Blackwood's lavish estate, and the political corridors of the council district. The contrast between gilded surfaces and rotten foundations becomes the act's visual motif.",
      plotPoints: [
        "investigation of brother caelum's hospital reveals a hidden basement with arcane equipment",
        "captain aldric warns the party they're being watched and shares his partner's cold case files",
        "lysara provides forged evidence pointing to lord blackwood as the kidnapping mastermind",
        "masquerade ball at blackwood's estate reveals council corruption and conflicting evidence",
        "mira vex is exposed as lysara's informant — the party's movements have been tracked from the start",
        "captain aldric is poisoned by lysara's agents — a race against time to find an antidote",
        "the arcane symbols are identified as components of the crimson accord — an ancient blood pact",
        "lord blackwood is found dead in his study, staged to look like suicide, framed with planted evidence",
      ],
      mysteries: [
        "what is happening in the hospital basement? (answer: arcane experiments to prepare victims for the ritual)",
        "who is watching the party? (answer: mira vex, reporting to lysara)",
        "is blackwood really the mastermind? (answer: no — lysara framed him)",
        "what is the crimson accord? (answer: an ancient blood magic ritual that grants immortality and domination at the cost of sacrificed lives)",
        "who poisoned captain aldric? (answer: lysara's agents, to silence his investigation)",
      ],
      keyEvents: [
        "the party infiltrates the hospital and discovers the hidden basement laboratory",
        "aldric shares his partner's old case files — the same crimson symbols appeared at a murder scene ten years ago",
        "lysara summons the party and presents 'evidence' that blackwood is funding the kidnappings",
        "the masquerade ball at blackwood's estate — social maneuvering, eavesdropping, and a confrontation",
        "mira is caught sending a message to lysara's agents — her betrayal is revealed",
        "aldric collapses from slow-acting poison — the party must find rare reagents for an antidote",
        "a scholar identifies the arcane symbols as the crimson accord — an ancient and forbidden ritual",
        "blackwood's body is discovered in his locked study with a forged suicide note confessing to everything",
      ],
      encounters: [
        {
          name: "Hospital Basement Investigation",
          description:
            "The party infiltrates Brother Caelum's hospital after hours and discovers a hidden basement. Arcane circles, alchemical equipment, and personal effects of the missing are found. Caelum may catch them and must be confronted or evaded.",
          type: "exploration",
          difficulty: "medium",
          npcInvolvement: ["brother-caelum"],
          location: "brother caelum's hospital, hidden basement level",
          mapSpecId: "caelum-hospital",
          rewards: { xp: 150, items: ["caelum's journal", "arcane circle rubbing", "list of 'patients' matching missing persons"] },
          dmGuidance:
            "This is a tense infiltration, not a combat encounter. The hospital is locked after dark — the party needs to pick locks (DC 12), find an alternate entrance, or convince the night nurse. The basement is behind a concealed door in the supply closet. If Caelum catches them, he's terrified, not hostile. He'll plead ignorance but his journal (found in his quarters) tells a different story. The basement should feel clinical and horrifying — bloodstained arcane circles, restraints, and personal effects create a visceral horror.",
        },
        {
          name: "Blackwood's Masquerade Ball",
          description:
            "A lavish masked ball at Lord Blackwood's estate. The party must navigate social intrigue, eavesdrop on council members, and potentially confront Blackwood with evidence — all while maintaining their cover among Valdris's elite.",
          type: "social",
          difficulty: "hard",
          npcInvolvement: ["lysara-thorne", "lord-harren-blackwood", "mira-vex"],
          location: "blackwood estate, grand ballroom and private study",
          mapSpecId: "blackwood-estate",
          rewards: { xp: 200, items: ["blackwood's private ledger", "overheard conversation notes"] },
          dmGuidance:
            "The masquerade is the act's centerpiece social encounter. Multiple objectives: (1) Eavesdrop on council members discussing the kidnappings (DC 13 Stealth/Perception), (2) Search Blackwood's private study for evidence (DC 15 Investigation), (3) Observe Lysara's interactions (DC 16 Insight — she's lobbying other council members against Blackwood), (4) Confront Blackwood privately (Persuasion/Intimidation DC 14 to get him talking). Mira is here too — a sharp-eyed party member (DC 15 Perception) might spot her passing a note to one of Lysara's guards. This plants the seed for her betrayal reveal.",
        },
        {
          name: "Ambush in the Narrows",
          description:
            "After the masquerade, the party is ambushed in a narrow alley by Lysara's hired thugs. The attackers wear no identifying marks and fight to kill — someone wants the investigation stopped permanently.",
          type: "combat",
          difficulty: "hard",
          enemies: [
            { srdMonsterSlug: "thug", count: 3, notes: "block both ends of the alley, coordinate attacks" },
            { srdMonsterSlug: "spy", count: 1, notes: "assassin with poisoned blade, targets the most investigative party member" },
          ],
          location: "the narrows, a twisting alley between the upper and middle quarters",
          mapSpecId: "the-narrows",
          rewards: { xp: 450, gold: 30, items: ["assassin's poisoned dagger", "unsigned payment voucher from a council account"] },
          dmGuidance:
            "This ambush should feel dangerous and personal — someone powerful wants the party dead. The narrow alley limits movement (5 ft. wide, 60 ft. long). Thugs block both ends while the spy targets the party's lead investigator. The payment voucher is traceable to a council discretionary fund but not to a specific member — it's a thread for Act 3. If the party captures the spy alive, they'll admit to being hired through intermediaries but can describe the voice of their employer (matches Lysara under DC 18 Insight).",
        },
        {
          name: "Race for the Antidote",
          description:
            "Captain Aldric has been poisoned with a slow-acting arcane toxin. The party must locate rare reagents — moonpetal flowers from the temple gardens and purified silver dust from an alchemist's shop — and brew the antidote before time runs out.",
          type: "puzzle",
          difficulty: "medium",
          npcInvolvement: ["captain-aldric-vane"],
          location: "various — temple gardens, alchemist quarter, aldric's home",
          rewards: { xp: 200 },
          dmGuidance:
            "This is a timed skill challenge with 3 phases: (1) Identify the poison (DC 14 Medicine or Arcana), (2) Gather moonpetal from the temple gardens at night (DC 12 Nature to find, DC 13 Stealth to avoid temple guards), (3) Brew the antidote (DC 14 Medicine or Alchemist's tools). Allow creative solutions. The party has about 8 in-game hours before Aldric dies. Success: Aldric recovers and provides crucial evidence in Act 3. Failure: Aldric dies — this should be devastating and fuel the party's motivation for Act 3.",
        },
      ],
      relevantNPCIds: [
        "lysara-thorne",
        "captain-aldric-vane",
        "mira-vex",
        "zephyr",
        "brother-caelum",
        "lord-harren-blackwood",
      ],
      transitionToNextAct:
        "Blackwood's death and the revelation of the Crimson Accord's true nature transform the investigation from political intrigue into an existential threat. Lysara moves to consolidate power on the council, positioning herself as Blackwood's successor. With Aldric poisoned (or dead), Mira exposed, and Blackwood framed, the party must piece together the evidence: Lysara is the mastermind, the hospital is the preparation site, and an ancient temple beneath the city is where the ritual will be completed. The clock is ticking — Lysara needs only a few more days to gather the final components.",
      dmBriefing:
        "Act 2 is the conspiracy unraveling. The tone shifts from investigation to paranoia — the party should feel that no one can be fully trusted. Lysara continues to be helpful while subtly steering the party toward Blackwood. The hospital infiltration is the first major revelation — make the basement genuinely disturbing. The masquerade ball is the social centerpiece where all NPCs converge and evidence threads intersect. Mira's betrayal should be discovered through investigation, not just revealed — let the party connect the dots. Aldric's poisoning raises personal stakes and creates urgency. Blackwood's death is the act's climax — it should feel like a genuine shock that recontextualizes everything. End the act with the party understanding the full scope of Lysara's plan but not yet having the power or evidence to stop her publicly. Key pacing: investigation → social intrigue → betrayal → crisis → revelation. Each session should end on a cliffhanger.",
    },

    // ═══════════════════════════════════════════════════════════════════════
    // ACT 3: The Accord Unveiled
    // ═══════════════════════════════════════════════════════════════════════
    {
      campaignSlug: SLUG,
      actNumber: 3,
      title: "The Accord Unveiled",
      explorationMapSpecId: "valdris-city",
      summary:
        "The truth stands revealed: Councilor Lysara Thorne has orchestrated everything — the kidnappings, the experiments, the political machinations. As she races to complete the ancient Crimson Accord ritual in a temple beneath the city, the party must rally their allies, gather final evidence, and confront her before Valdris falls under her eternal dominion.",
      suggestedLevel: { min: 4, max: 5 },
      setting:
        "The depths of Valdris — ancient tunnels beneath the temple district lead to a forgotten pre-city temple where the Crimson Accord ritual is being prepared. Above ground, political chaos as Lysara consolidates power. The contrast between the crumbling ancient temple and the modern city above reflects how old evils persist beneath civilized surfaces.",
      plotPoints: [
        "lysara consolidates political power with blackwood gone — pushes for emergency council authority",
        "the party gathers final evidence connecting lysara to the kidnappings, hospital, and blackwood's murder",
        "captain aldric (if saved) reveals evidence from his partner's old case that directly implicates lysara",
        "mira vex (if offered redemption) turns against lysara and reveals the ritual chamber location",
        "zephyr reveals their sibling sera was among the kidnapped — deeply personal stakes",
        "the party must choose: expose lysara politically (slow, safe) or assault the ritual directly (dangerous, decisive)",
        "descent into the ancient temple beneath the city where lysara prepares the crimson accord",
        "final confrontation with lysara as she attempts to complete the ritual",
        "resolution: save the kidnapped, decide lysara's fate, determine the future of valdris's council",
      ],
      mysteries: [
        "can lysara actually complete the ritual? (answer: yes, she has everything she needs — the party must stop her, not just gather evidence)",
        "what happens if the ritual succeeds? (answer: lysara gains immortality and psychic domination over everyone in valdris — effectively ending free will in the city)",
        "can lysara be reasoned with? (answer: extremely difficult DC 25 persuasion, but possible — she genuinely believes she's saving the city from incompetent leadership)",
      ],
      keyEvents: [
        "lysara addresses the council, positioning herself as the savior of valdris after blackwood's 'suicide'",
        "the party obtains definitive proof of lysara's involvement (from aldric's files, caelum's confession, or mira's testimony)",
        "a war council: the party and their allies plan the assault on the ritual chamber",
        "mira vex (if redeemed) provides detailed maps of the temple and lysara's guard rotation",
        "descent through the ancient tunnels — traps, guardians, and remnants of the civilization that created the accord",
        "discovery of the kidnapped victims — alive but weakened, bound in arcane circles feeding the ritual",
        "confrontation with lysara at the ritual's apex — she offers the party a place in her new order",
        "final battle: lysara empowered by partial ritual completion, her bound thralls, and personal guard",
        "aftermath: freeing the victims, political resolution, and determining lysara's fate",
      ],
      encounters: [
        {
          name: "Council Confrontation",
          description:
            "The party presents evidence of Lysara's crimes to the remaining council members. A tense social encounter where political maneuvering, evidence presentation, and personal credibility determine whether the council authorizes action against Lysara.",
          type: "social",
          difficulty: "hard",
          npcInvolvement: ["lysara-thorne"],
          location: "valdris council chambers",
          mapSpecId: "council-hall",
          rewards: { xp: 250 },
          dmGuidance:
            "This encounter's outcome depends on how much evidence the party gathered in Acts 1-2. With strong evidence (3+ pieces: hospital records, Caelum's journal, Aldric's files, Mira's testimony, payment vouchers), the council votes to arrest Lysara (DC 12 Persuasion). With weak evidence (1-2 pieces), the DC is 18 and Lysara can counter-argue effectively. If the party fails, Lysara flees to the temple and the party must assault without official sanction. If successful, the party gets city watch backup for the temple assault. Either way, Lysara escapes to complete the ritual — the confrontation is about allies and legitimacy, not capture.",
        },
        {
          name: "Temple Descent",
          description:
            "The party descends through ancient tunnels beneath the temple district into a pre-Valdris temple complex. Arcane traps, magical guardians, and the oppressive atmosphere of old blood magic test the party's resolve.",
          type: "exploration",
          difficulty: "hard",
          enemies: [
            { srdMonsterSlug: "animated-armor", count: 2, notes: "ancient temple guardians, activate when intruders enter the main hall" },
            { srdMonsterSlug: "specter", count: 2, notes: "restless spirits of previous ritual victims, haunt the preparation chambers" },
          ],
          location: "ancient temple beneath the temple district",
          mapSpecId: "ancient-temple",
          rewards: { xp: 400, items: ["ancient temple map fragment", "ward-breaking amulet"] },
          dmGuidance:
            "This is a dungeon crawl with atmosphere. The temple is OLD — predates Valdris by centuries. Describe crumbling stonework, faded murals depicting the original Crimson Accord practitioners, and an oppressive sense of malevolence. Include 2-3 traps: (1) Pressure plate triggers a falling block (DC 13 Perception to spot, DC 14 Dex save, 2d10 bludgeoning), (2) Arcane glyph ward (DC 14 Investigation to spot, DC 15 Arcana to disarm, 3d6 necrotic on trigger), (3) Collapsing bridge over a chasm (DC 12 Athletics to leap, 2d6 falling damage on failure). The animated armor and specters are thematic guards, not just random encounters.",
        },
        {
          name: "Saving the Captives",
          description:
            "The party discovers the kidnapped victims — including Zephyr's sibling Sera — bound in arcane circles that slowly drain their life force to power the ritual. Freeing them requires disrupting the circles without killing the victims.",
          type: "puzzle",
          difficulty: "medium",
          npcInvolvement: ["zephyr"],
          enemies: [
            { srdMonsterSlug: "guard", count: 3, notes: "lysara's personal guard, fight to prevent the circles from being disrupted" },
          ],
          location: "ancient temple, ritual preparation chamber",
          mapSpecId: "ancient-temple",
          rewards: { xp: 300 },
          dmGuidance:
            "This encounter combines combat and puzzle. 3 guards protect 6 arcane circles holding captives. The party must defeat or distract the guards while disrupting the circles (DC 13 Arcana check per circle, or DC 15 to disrupt multiple at once). Breaking a circle by force (attacking it) requires DC 14 Constitution save from the victim or they take 2d6 necrotic damage. Zephyr will rush to Sera's circle regardless of danger — the party may need to protect them. Each freed captive weakens Lysara's ritual by a small amount, making the boss fight incrementally easier (each freed captive reduces Lysara's bonus HP by 10).",
        },
        {
          name: "The Crimson Accord — Final Battle",
          description:
            "Lysara stands at the center of the grand ritual circle, partially empowered by the Crimson Accord. She offers the party one final chance to join her vision for Valdris. When they refuse (or accept — that's a campaign-ending twist), the final battle begins.",
          type: "boss",
          difficulty: "deadly",
          npcInvolvement: ["lysara-thorne", "mira-vex", "captain-aldric-vane"],
          enemies: [
            { srdMonsterSlug: "mage", count: 1, notes: "lysara thorne with enhanced stats — see campaign NPC combat stats" },
            { srdMonsterSlug: "thug", count: 2, notes: "lysara's loyal bodyguards, fight to the death" },
            { srdMonsterSlug: "zombie", count: 3, notes: "ritual thralls — victims partially transformed by the accord, attack mindlessly" },
          ],
          location: "ancient temple, grand ritual chamber",
          mapSpecId: "ancient-temple",
          rewards: { xp: 2300, gold: 500, items: ["lysara's crimson accord scrolls", "ring of protection +1", "staff of the crimson accord"] },
          dmGuidance:
            "This is the campaign climax. The ritual chamber is a massive underground cathedral with a 30ft diameter ritual circle at the center. Lysara uses her enhanced combat stats (AC 15, 85 HP with crimson accord empowerment). Allies present depend on earlier choices: Aldric (if saved) provides flanking and +2 to party attack rolls when adjacent. Mira (if redeemed) knows the temple layout and can disable a trap mid-fight. Phase 1: Lysara fights with spells while bodyguards and thralls engage the party. Phase 2 (at half HP): Crimson Accord empowerment activates — +2 AC, +1d6 necrotic to attacks. Lysara monologues about her vision for Valdris. Give the party a final chance to attempt Persuasion DC 25 to talk her down. If successful, she surrenders — a bittersweet ending. If not, fight to defeat. After the battle, describe the ritual energy dissipating and the captives (if freed) regaining consciousness. End with an epilogue scene: the party decides Lysara's fate (execution, imprisonment, exile) and the council asks for their recommendation on Valdris's future governance.",
        },
      ],
      relevantNPCIds: [
        "lysara-thorne",
        "captain-aldric-vane",
        "mira-vex",
        "zephyr",
        "brother-caelum",
      ],
      dmBriefing:
        "Act 3 is the payoff for everything built in Acts 1 and 2. The tone shifts from investigation to action — the party knows who the villain is and must stop her. Lysara's political maneuvering creates urgency: she's consolidating power above ground while completing the ritual below. The act rewards thorough investigation: evidence gathered in earlier acts determines council support, available allies determine combat advantages, and NPC relationships determine emotional payoffs. The temple descent should feel like entering another world — ancient, oppressive, and haunted by centuries of dark magic. The captive rescue is both a puzzle and an emotional climax (especially for Zephyr). The final battle should feel earned and climactic. Give Lysara genuine menace but also genuine conviction — she's a tragic villain, not a cackling maniac. The aftermath should let the party shape Valdris's future, giving weight to their choices throughout the campaign. Key ally availability: Aldric (if saved from poison), Mira (if redeemed after betrayal), Zephyr (always present but non-combatant), Caelum (provides information if confronted). The campaign's quality is measured by how much the players care about these NPCs by the end.",
    },
  ],
};
