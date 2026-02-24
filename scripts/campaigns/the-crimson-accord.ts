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
  {
    id: "watch-house",
    name: "Lower Quarter Watch House",
    feetPerSquare: 5,
    imagePrompt:
      "Top-down fantasy D&D battle map of a modest stone city watch station. Southern entrance with heavy oak doors opens into a duty room with a desk and notice board. Main floor has a common room with a long table, weapon rack on the west wall, and a fireplace. Eastern corridor leads to three holding cells with iron bars. Captain's office in the northwest corner — desk piled with papers, a locked cabinet, and a cot for long nights. Stairs in the northeast lead to barracks upstairs (not shown). Back exit on the north wall opens to a training yard. Interior terrain, warm lighting. Worn stone floors, guttering torches, a battered shield mounted over the fireplace. Detailed tabletop RPG battle map, painted illustration, no text, no labels.",
  },
  {
    id: "lower-quarter-streets",
    name: "Lower Quarter Streets",
    feetPerSquare: 5,
    imagePrompt:
      "Top-down fantasy D&D battle map of a cramped lower-class urban neighborhood. A main cobblestone road runs north-south with shop fronts on both sides — a blacksmith, a tannery, a pawnbroker. Narrow alleys branch east and west between buildings. A small market square in the center with a dry fountain and vendor stalls. Tenement buildings with external staircases along the east. A boarded-up storefront with strange chalk symbols on the door near the southwest. Scattered crates, rain barrels, and a pushcart provide cover. Urban terrain, dim evening lighting. Flickering lanterns, cobblestones slick with grime, laundry lines overhead. Detailed tabletop RPG battle map, painted illustration, no text, no labels.",
  },
  {
    id: "rusted-anchor-tavern",
    name: "The Rusted Anchor Tavern",
    feetPerSquare: 5,
    imagePrompt:
      "Top-down fantasy D&D battle map of a grimy dockside tavern interior. Main taproom fills the southern two-thirds with a long L-shaped bar along the west wall, scattered round tables with stools, and a stone fireplace on the east wall. A raised booth area in the southeast corner offers some privacy. Kitchen behind the bar on the west. Narrow staircase in the northeast leads upstairs to lodging rooms. Back door on the north wall opens to an alley. A trapdoor behind the bar leads to a beer cellar. Interior terrain, dim smoky lighting. Stained wooden floors, low ceiling beams, nautical decor — fishing nets, a ship's wheel, and harpoons on the walls. Detailed tabletop RPG battle map, painted illustration, no text, no labels.",
  },
  {
    id: "lysara-salon",
    name: "Lysara's Private Salon",
    feetPerSquare: 5,
    imagePrompt:
      "Top-down fantasy D&D battle map of an elegant upper-quarter townhouse salon. Southern entrance from the street opens into a marble-tiled reception hall with a coat room. Main salon occupies the center — a refined sitting room with velvet chaises, a harpsichord, bookshelves, and a tea service on a side table. Western alcove has a writing desk and personal correspondence. Eastern side has a private dining room with a small round table set for four. Northern doorway leads to a conservatory with potted ferns and stained glass windows overlooking a courtyard garden. Interior terrain, warm candlelit lighting. Crimson and gold color scheme, silk curtains, fresh flowers, faint scent of incense. Detailed tabletop RPG battle map, painted illustration, no text, no labels.",
  },
  {
    id: "hall-of-records",
    name: "Valdris Hall of Records",
    feetPerSquare: 5,
    imagePrompt:
      "Top-down fantasy D&D battle map of a municipal records building interior. Southern entrance with iron-bound doors opens into a lobby with a clerk's counter. Main archive room fills the center — floor-to-ceiling wooden shelves crammed with scrolls, ledgers, and bound folios arranged in rows. Reading alcoves with desks and candles along the east wall. Restricted records vault in the northwest corner behind a locked gate. Clerk's office in the southwest with a desk and filing cabinets. A dusty spiral staircase in the northeast leads to a basement storage level. Interior terrain, dim library lighting. Musty air, dust motes in candlelight, ink-stained wooden floors. Detailed tabletop RPG battle map, painted illustration, no text, no labels.",
  },
  {
    id: "valdris-streets",
    name: "Valdris City Streets",
    feetPerSquare: 5,
    imagePrompt:
      "Top-down fantasy D&D battle map of a wide merchant quarter boulevard in chaos. Main road runs east-west, 20 ft wide with flagstone paving. Shop fronts line both sides — a jeweler, a tailor, a spice merchant — some with awnings extended. A large ornamental fountain in a circular plaza at the center. Side streets branch north and south. Overturned cart and scattered goods block part of the western road. Rooftop access via external ladders on the southeast buildings. Urban terrain, dramatic lighting — afternoon sun with long shadows. Citizens fleeing, shuttered windows, a sense of urgency and upheaval. Detailed tabletop RPG battle map, painted illustration, no text, no labels.",
  },
  {
    id: "temple-district",
    name: "Temple District",
    feetPerSquare: 5,
    imagePrompt:
      "Top-down fantasy D&D battle map of a sacred district with old stone temples. A flagstone plaza connects three temple buildings arranged in a triangle — a domed sun temple on the west, a bell tower temple on the east, and a partially collapsed ancient shrine on the north. Central plaza has a weathered stone altar and prayer benches. Graveyard with headstones and mausoleums behind the sun temple on the southwest. Iron-gated entrance to underground catacombs in the floor of the collapsed shrine. Moss-covered statuary and overgrown hedgerows line the perimeter. Urban terrain, overcast dim lighting. Old stone, cracked flagstones, ravens perched on gargoyles, a sense of ancient power. Detailed tabletop RPG battle map, painted illustration, no text, no labels.",
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
        description:
          "A nighttime waterfront pier district. Rain-slicked wooden planks, moored cargo ships, warehouses with narrow alleys, and crates providing cover. The harbormaster's shack sits in the northwest corner.",
        combatMapSpecId: "valdris-docks",
        isHidden: false,
        actNumbers: [1],
        locationTags: [
          "valdris docks",
          "pier 7",
          "docks",
          "harbor",
          "waterfront",
        ],
      },
      {
        id: "poi_council",
        number: 2,
        name: "council hall",
        description:
          "An imposing marble government building with a grand foyer, circular council chamber, reception room, private offices, and servants' passages.",
        combatMapSpecId: "council-hall",
        isHidden: false,
        actNumbers: [1, 3],
        locationTags: [
          "council hall",
          "council chambers",
          "council reception",
          "valdris council",
        ],
      },
      {
        id: "poi_undercity",
        number: 3,
        name: "undercity tunnels",
        description:
          "A network of old sewer tunnels beneath the lower quarters. Arched brick ceilings, flooded sections, rat nests, and a junction where tunnels meet.",
        combatMapSpecId: "undercity-tunnels",
        isHidden: true,
        actNumbers: [1],
        locationTags: [
          "undercity",
          "tunnels",
          "sewers",
          "underground",
          "beneath the lower quarters",
        ],
      },
      {
        id: "poi_warehouse",
        number: 4,
        name: "smuggler warehouse",
        description:
          "A converted basement used as a smuggler staging area. Crates in rows, a raised crossbow platform, a walled-off office, and iron cages along the western wall.",
        combatMapSpecId: "smuggler-warehouse",
        isHidden: true,
        actNumbers: [1],
        locationTags: [
          "warehouse",
          "smuggler warehouse",
          "undercity warehouse",
          "market district",
        ],
      },
      {
        id: "poi_hospital",
        number: 5,
        name: "brother caelum's hospital",
        description:
          "A modest two-story charitable hospital. Main ward with cots, reception area, Caelum's private quarters, and a concealed basement with arcane circles and alchemical equipment.",
        combatMapSpecId: "caelum-hospital",
        isHidden: false,
        actNumbers: [2],
        locationTags: [
          "hospital",
          "caelum's hospital",
          "brother caelum",
          "charitable hospital",
        ],
      },
      {
        id: "poi_estate",
        number: 6,
        name: "blackwood estate",
        description:
          "A lavish noble estate with grand ballroom, formal dining, private study, and garden terrace. Site of the masquerade ball.",
        combatMapSpecId: "blackwood-estate",
        isHidden: false,
        actNumbers: [2],
        locationTags: [
          "blackwood estate",
          "blackwood's estate",
          "masquerade ball",
          "grand ballroom",
        ],
      },
      {
        id: "poi_narrows",
        number: 7,
        name: "the narrows",
        description:
          "A twisting narrow alley between upper and middle quarters. Only 5-10 ft wide, with overhanging balconies and a dry well courtyard in the center.",
        combatMapSpecId: "the-narrows",
        isHidden: true,
        actNumbers: [2],
        locationTags: [
          "the narrows",
          "narrow alley",
          "alley",
          "between upper and middle quarters",
        ],
      },
      {
        id: "poi_temple",
        number: 8,
        name: "ancient temple",
        description:
          "A vast underground temple predating the city. Crumbling pillars, trapped corridors, a chasm bridge, preparation chamber with captives, and a grand ritual chamber.",
        combatMapSpecId: "ancient-temple",
        isHidden: true,
        actNumbers: [3],
        locationTags: [
          "ancient temple",
          "temple complex",
          "ritual chamber",
          "underground temple",
          "temple beneath",
        ],
      },
      {
        id: "poi_watch_house",
        number: 9,
        name: "watch house",
        description:
          "A modest stone city watch station in the lower quarter. Duty room, common room, holding cells, and the captain's office filled with case files.",
        combatMapSpecId: "watch-house",
        isHidden: false,
        actNumbers: [1, 2, 3],
        locationTags: [
          "watch house",
          "watch barracks",
          "watch headquarters",
          "aldric's quarters",
          "city watch",
        ],
      },
      {
        id: "poi_lower_quarter",
        number: 10,
        name: "lower quarter streets",
        description:
          "Cramped cobblestone streets lined with shops, tenements, and narrow alleys. A small market square with a dry fountain sits at the center.",
        combatMapSpecId: "lower-quarter-streets",
        isHidden: false,
        actNumbers: [1],
        locationTags: [
          "lower quarter",
          "coppersmith lane",
          "lower quarters",
          "market square",
        ],
      },
      {
        id: "poi_tavern",
        number: 11,
        name: "the rusted anchor",
        description:
          "A grimy dockside tavern with a long bar, scattered tables, a raised private booth, and a trapdoor to the beer cellar.",
        combatMapSpecId: "rusted-anchor-tavern",
        isHidden: false,
        actNumbers: [1],
        locationTags: ["rusted anchor", "tavern", "dockside tavern"],
      },
      {
        id: "poi_lysara_salon",
        number: 12,
        name: "lysara's salon",
        description:
          "An elegant upper-quarter townhouse with a refined sitting room, private dining, writing desk, and a conservatory overlooking a courtyard garden.",
        combatMapSpecId: "lysara-salon",
        isHidden: false,
        actNumbers: [1, 2],
        locationTags: [
          "lysara's salon",
          "lysara's private",
          "lysara's office",
          "council chambers",
          "upper quarter",
        ],
      },
      {
        id: "poi_records",
        number: 13,
        name: "hall of records",
        description:
          "A municipal archive building crammed with scrolls, ledgers, and bound folios. A restricted vault holds the most sensitive documents.",
        combatMapSpecId: "hall-of-records",
        isHidden: true,
        actNumbers: [2],
        locationTags: [
          "hall of records",
          "records",
          "archives",
          "city records",
        ],
      },
      {
        id: "poi_streets",
        number: 14,
        name: "valdris streets",
        description:
          "The main merchant quarter boulevard — flagstone paving, shop fronts, and an ornamental fountain at the central plaza.",
        combatMapSpecId: "valdris-streets",
        isHidden: false,
        actNumbers: [3],
        locationTags: ["valdris streets", "merchant quarter", "city streets"],
      },
      {
        id: "poi_temple_district",
        number: 15,
        name: "temple district",
        description:
          "A sacred district with old stone temples, a weathered plaza, a graveyard, and the iron-gated entrance to underground catacombs.",
        combatMapSpecId: "temple-district",
        isHidden: true,
        actNumbers: [3],
        locationTags: [
          "temple district",
          "temple gardens",
          "surface level",
          "catacombs entrance",
        ],
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
    actSlugs: [`${SLUG}_act-1`, `${SLUG}_act-2`, `${SLUG}_act-3`],
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
      startingPOIId: "poi_lysara_salon",
      hooks: [
        "a city councilor posts a public bounty for information on the disappearances in the lower quarters",
        "the party encounters a distraught family member searching for a missing loved one near the docks",
        "captain aldric vane approaches the party in a tavern, desperate for outside help the watch can't officially sanction",
        "a street urchin delivers a sealed letter from councilor lysara thorne, offering gold and patronage",
      ],
      summary:
        "Strange disappearances plague the lower quarters of Valdris. A powerful councilor hires the party to investigate, leading them into the city's criminal underbelly where smugglers, street urchins, and corrupt officials all have pieces of a larger puzzle.",
      suggestedLevel: { min: 1, max: 2 },
      setting:
        "The lower quarters of Valdris — a maze of narrow alleys, bustling market squares, crumbling tenements, and underground tunnels. The docks district reeks of fish and tar. The undercity beneath is a network of old sewer tunnels and forgotten basements used by smugglers.",
      mysteries: [
        "what do the arcane symbols at kidnapping sites mean?",
        "who is buying the kidnapped people and why?",
        "why are victims chosen seemingly at random?",
        "who tipped off the smugglers about the watch investigation?",
      ],
      storyBeats: [
        {
          name: "The Patron's Summons",
          description:
            "Councilor Lysara Thorne sends a personal messenger to summon the party to the council chambers. She explains that people have been vanishing from the lower quarters — laborers, street kids, dockworkers — and the city watch is overwhelmed. She offers a generous retainer and asks the party to investigate discreetly.",
          type: "social",
          difficulty: "easy",
          npcInvolvement: ["lysara-thorne"],
          location: "valdris council chambers, lysara's private office",
          mapSpecId: "lysara-salon",
          dmGuidance:
            "Lysara is poised, warm, and genuinely concerned — or so it seems. She provides a list of the missing and a pouch of gold as a retainer. She suggests the party start with the city watch, who have a case file. Play her as the perfect patron: attentive, respectful, and trusting. A DC 14 Insight check reveals nothing — she's that good. Transition: Lysara recommends they visit Captain Aldric Vane at the lower quarter watch house for the official case files.",
        },
        {
          name: "The Watch House",
          description:
            "The party visits the lower quarter watch house to meet Captain Aldric Vane. He's a grizzled veteran who's frustrated by the lack of progress on the disappearances. He shares the case file: a map of abduction sites, witness statements, and a sketch of a strange symbol found at two of the scenes.",
          type: "social",
          difficulty: "easy",
          npcInvolvement: ["captain-aldric-vane"],
          location: "lower quarter watch house",
          mapSpecId: "watch-house",
          rewards: { xp: 50 },
          dmGuidance:
            "Aldric is exhausted and grateful for help, but skeptical of 'council-sponsored adventurers.' He's honest about what the watch knows: victims vanish at night, no bodies found, no ransom demands. The symbol is key — it's a circle with a crescent, drawn in chalk near two abduction sites. He marks the most recent disappearance site on the party's map. Transition: Aldric suggests canvassing the lower quarter near the most recent abduction site — a tenement block on Coppersmith Lane.",
        },
        {
          name: "Lower Quarter Canvassing",
          description:
            "The party investigates Coppersmith Lane and the surrounding neighborhood — talking to shopkeepers, tenement residents, and street vendors. They find another chalk symbol, hear conflicting rumors, and start to piece together a pattern: victims were last seen near the docks at night.",
          type: "exploration",
          difficulty: "easy",
          location: "lower quarter, coppersmith lane and surroundings",
          mapSpecId: "lower-quarter-streets",
          rewards: { xp: 50 },
          dmGuidance:
            "This is an open investigation beat. Let the party choose how to canvass — Persuasion, Intimidation, or Investigation checks (DC 10-12). Key information they can learn: a fishmonger saw a cart heading toward the docks late at night; a landlord noticed the chalk symbol appeared the morning after the last disappearance; a child says they saw 'men with hoods' near the piers. A DC 12 Arcana check on the chalk symbol identifies it as a warding glyph — someone is marking targets or territory. Transition: As the party wraps up their canvassing, a young tiefling (Zephyr) approaches them urgently, having heard they're investigating the disappearances.",
        },
        {
          name: "A Desperate Plea",
          description:
            "Zephyr, a young tiefling street urchin, approaches the party in a state of barely-contained panic. Their older sibling Kael disappeared three nights ago. Zephyr has been searching alone and has found things the watch missed — hand-drawn maps of the undercity tunnels, notes about smuggler activity near the docks.",
          type: "social",
          difficulty: "easy",
          npcInvolvement: ["zephyr"],
          location: "lower quarter, a quiet alley near coppersmith lane",
          mapSpecId: "lower-quarter-streets",
          dmGuidance:
            "Zephyr is scared but fierce — they won't be sent away. Play them as resourceful and street-smart but clearly out of their depth. They know the undercity tunnels better than anyone (they've been living in them) and offer to guide the party if they'll help find Kael. Zephyr's maps are crude but accurate — they show a route from the docks into the tunnels. This is the emotional heart of Act 1. Make the players care about Zephyr and Kael. Transition: Zephyr's notes and the fishmonger's testimony both point to the docks. The party should head there at night to catch the smugglers in action.",
        },
        {
          name: "Dockside Investigation",
          description:
            "The party stakes out the Valdris docks after dark, following the leads from their canvassing. The docks are eerie at night — fog rolls in off the harbor, rigging creaks, and the sound of water lapping against hulls masks other noises. They find evidence of smuggling: fresh scratches on a pier lock, a discarded hood, and more chalk symbols.",
          type: "exploration",
          difficulty: "medium",
          location: "valdris docks, pier 7",
          mapSpecId: "valdris-docks",
          dmGuidance:
            "Build tension here. The docks at night are atmospheric — dim lantern light, fog, the smell of brine and tar. Let the party use Stealth and Perception (DC 12) to scout. They can find: a hidden cargo manifest wedged between planks listing deliveries to an unnamed 'basement'; a discarded burlap sack that smells of alchemical sedatives; fresh boot tracks leading to pier 7. If they linger or make noise, they're spotted by the smugglers, triggering the next beat. Transition: Whether the party is stealthy or not, the smugglers on pier 7 notice intruders and attack — they mistake the party for a rival gang.",
        },
        {
          name: "Smuggler Ambush",
          description:
            "While investigating the docks at night, the party is ambushed by smugglers who think they're rival thieves. The fight takes place on rain-slicked wooden piers between moored cargo ships.",
          type: "combat",
          difficulty: "easy",
          enemies: [
            {
              srdMonsterSlug: "bandit",
              count: 3,
              notes:
                "armed with crossbows, one flees at half hp to warn the warehouse",
            },
            {
              srdMonsterSlug: "thug",
              count: 1,
              notes:
                "the smuggler leader, carries a manifest listing delivery locations",
            },
          ],
          location: "valdris docks, pier 7",
          mapSpecId: "valdris-docks",
          rewards: {
            xp: 175,
            gold: 25,
            items: ["smuggler's manifest", "dockside warehouse key"],
          },
          dmGuidance:
            "This is the party's first combat. Keep it simple and let them feel competent. The rain-slicked piers are difficult terrain (DC 10 Dex save or fall prone when dashing). The fleeing bandit creates urgency — if they escape, the warehouse will be on alert. The thug leader's manifest is the key clue: it lists deliveries to 'the temple basement, care of Brother C.' which connects to Act 2. The warehouse key opens the smuggler warehouse in beat 10. Transition: The captured manifest and warehouse key are solid leads, but the party needs more context about the operation. A name on the manifest — 'Vex' — suggests an information broker. Asking around the docks (or having Zephyr suggest it) points them to a tavern called The Rusted Anchor.",
        },
        {
          name: "The Informant",
          description:
            "The party tracks down Mira Vex, an information broker, at The Rusted Anchor tavern near the docks. She's cautious but mercenary — she'll sell what she knows about the smuggling ring for coin or favors. She reveals the operation is bigger than petty smuggling: people are being moved through the undercity to an unknown buyer.",
          type: "social",
          difficulty: "medium",
          npcInvolvement: ["mira-vex"],
          location: "the rusted anchor tavern, dockside",
          mapSpecId: "rusted-anchor-tavern",
          rewards: { xp: 100 },
          dmGuidance:
            "Mira is sharp, cynical, and all business. She won't talk for free — she wants 50 gold or a favor (dealing with a rival who's been muscling into her territory). Play the negotiation: Persuasion DC 13 to lower her price, Intimidation DC 15 (but she'll give bad intel if threatened). What she knows: the smugglers use undercity tunnels to move victims; the operation has been running for months; there's a warehouse beneath the market district that serves as a staging area; and someone powerful is protecting the ring from the watch. She doesn't know who the buyer is. A DC 14 Insight check reveals she's holding something back — she's afraid of whoever is running the operation. Transition: Mira's intel confirms the undercity route and the warehouse. Before the party can act on it, Lysara sends an invitation to a council reception — she wants a progress report and to introduce the party to important allies.",
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
            "Use this to establish the political landscape. Lysara is warm and attentive — she praises the party's progress and asks probing questions about what they've learned. Blackwood is loud and dismissive of the kidnapping investigation ('lower quarter riffraff') but a DC 12 Insight check reveals genuine concern beneath his bluster about 'trade disruptions.' Let the party overhear gossip about Lysara's charity hospital in the temple district. If the party mentions the manifest referencing 'Brother C.' or the temple basement, Lysara's expression flickers for just a moment (DC 16 Insight to catch it) before she smoothly suggests it must be a coincidence. Transition: With political context established and their leads confirmed, the party is ready to enter the undercity. Zephyr is eager to guide them — they've been waiting anxiously and have scouted a safe entry point near the lower quarter.",
        },
        {
          name: "Into the Undercity",
          description:
            "Guided by Zephyr's hand-drawn maps, the party navigates the tunnels beneath the lower quarters searching for the smugglers' staging area. Collapsed passages, flooded corridors, and territorial rats present obstacles.",
          type: "exploration",
          difficulty: "medium",
          npcInvolvement: ["zephyr"],
          enemies: [
            {
              srdMonsterSlug: "giant-rat",
              count: 4,
              notes: "nest in a collapsed side tunnel, attack if disturbed",
            },
          ],
          location: "valdris undercity tunnels",
          mapSpecId: "undercity-tunnels",
          rewards: { xp: 100, items: ["zephyr's annotated undercity map"] },
          dmGuidance:
            "This is about atmosphere and relationship-building with Zephyr. Describe the tunnels as claustrophobic and unsettling — dripping water, ancient brickwork, the echo of distant movement. Zephyr knows every shortcut but is visibly terrified — they've never gone this deep. The giant rats are a minor obstacle (they nest in a side tunnel and only attack if the party disturbs them). Use skill challenges: Athletics DC 12 to cross a collapsed section, Perception DC 13 to notice a tripwire alarm set by the smugglers. The real prize is finding fresh bootprints and drag marks leading toward the market district — and Zephyr finding Kael's dropped necklace, confirming their sibling came through here. Transition: The drag marks and bootprints lead directly to a heavy iron door — the entrance to the smuggler warehouse. The party can hear muffled voices inside. This is the climax of Act 1.",
        },
        {
          name: "Smuggler Warehouse Raid",
          description:
            "The party assaults the smugglers' undercity warehouse — a converted basement with iron cages, crates of supplies, and a locked tunnel leading toward the temple district. The smugglers are expecting a delivery, not an attack.",
          type: "combat",
          difficulty: "hard",
          enemies: [
            {
              srdMonsterSlug: "bandit",
              count: 4,
              notes:
                "scattered among crates, two have crossbows on a raised platform",
            },
            {
              srdMonsterSlug: "bandit-captain",
              count: 1,
              notes:
                "in the back office, tries to burn documents before fighting",
            },
          ],
          location: "undercity warehouse beneath the market district",
          mapSpecId: "smuggler-warehouse",
          rewards: {
            xp: 450,
            gold: 50,
            items: [
              "partially burned shipping records",
              "temple district tunnel key",
              "crimson accord symbol rubbing",
            ],
          },
          dmGuidance:
            "This is the act's climax. The warehouse has environmental elements: crates for cover, a raised platform with crossbow bandits, hanging lanterns that can be knocked down to create fire (1d6 fire damage, DC 12 Dex save). The bandit captain tries to burn evidence first — if the party is fast (initiative), they can save the documents which directly name 'Brother Caelum's hospital' as the delivery destination. The cages are empty but recently used — scratches on the walls and personal belongings left behind (including items Zephyr recognizes as Kael's) make the kidnappings visceral. The locked tunnel leading toward the temple district sets up Act 2. Transition: The rescued documents and the tunnel key point unmistakably toward the temple district and Brother Caelum. Zephyr is devastated that Kael isn't here but determined to press on. The party should report to Lysara and Captain Aldric before pursuing the temple lead — setting the stage for Act 2.",
        },
      ],
      relevantNPCIds: [
        "lysara-thorne",
        "captain-aldric-vane",
        "mira-vex",
        "zephyr",
      ],
      npcs: [
        {
          id: "lysara-thorne",
          name: "Lysara Thorne",
          srdMonsterSlug: "noble",
          role: "patron",
          appearance:
            "A striking woman in her early forties with silver-streaked auburn hair swept into an elegant updo. She favors deep crimson robes trimmed with gold thread and carries herself with the practiced grace of someone born to power. Her green eyes are sharp and assessing, though her smile is warm enough to disarm even the most suspicious visitor.",
          personality: {
            traits: [
              "charming and generous with compliments",
              "speaks with deliberate precision, never wasting a word",
              "remembers every name and personal detail — uses them to make people feel valued",
            ],
            ideals: [
              "the city needs a firm hand to protect its people",
              "generosity and political access are the best tools to build alliances",
            ],
            bonds: [
              "deeply invested in the safety and prosperity of valdris",
              "funds charitable work across the lower quarters, including brother caelum's hospital",
            ],
            flaws: [
              "can come across as overly polished — some find her warmth calculated",
              "expects results from those she patronises",
            ],
          },
          motivations: [
            "hire capable adventurers to investigate the disappearances the watch can't solve",
            "use political influence to support the investigation behind the scenes",
          ],
          secrets: [],
          relationshipArc: {
            act1: "Trusted patron — generous, warm, and seemingly invested in the party's success. Provides gold, information, and political access freely.",
            act2: "",
            act3: "",
          },
          dmNotes:
            "In Act 1, Lysara is a straightforward generous patron. Play her as intelligent, warm, and politically savvy. She asks the party thoughtful questions about their backgrounds and remembers details. She is genuinely helpful — provides funding, introductions, and political cover. Do not hint at any hidden agenda. She should feel like the ideal quest-giver.",
          voiceNotes:
            "Speaks with calm authority, never raises her voice. Uses 'my dear' and 'my friend' frequently. Maintains perfect eye contact when speaking.",
        },
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
              "too trusting of authority figures",
              "stubborn pride prevents him from asking for help until desperate",
            ],
          },
          motivations: [
            "solve the disappearances and bring the perpetrators to justice",
            "protect the common people the council has abandoned",
          ],
          secrets: [
            "he found a strange crimson symbol at his partner's murder scene but never understood what it meant",
            "he's been keeping unofficial case files hidden in his home",
          ],
          relationshipArc: {
            act1: "Cautious ally — respects the party's willingness to help but tests their commitment. Shares information gradually as trust builds.",
            act2: "",
            act3: "",
          },
          dmNotes:
            "Aldric is the honest cop in a corrupt system. Use him to deliver exposition through case briefings. He's suspicious of politicians in general but doesn't suspect anyone specific yet. His partner's unsolved murder is a background detail — mention it once to seed a later payoff, then move on.",
          voiceNotes:
            "Gruff baritone, speaks in short declarative sentences. Punctuates points by tapping the table. Calls everyone by their surname until he respects them, then switches to first names — this transition should feel earned.",
        },
        {
          id: "mira-vex",
          name: "Mira Vex",
          srdMonsterSlug: "spy",
          role: "informant",
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
              "knows the criminal underworld of valdris inside and out",
            ],
            flaws: [
              "trusts no one fully, which makes genuine connection difficult",
              "her survival instinct sometimes overrides her conscience",
            ],
          },
          motivations: [
            "earn gold by selling information to whoever pays",
            "stay alive in a dangerous city where knowing too much gets you killed",
          ],
          secrets: [
            "her educated speech comes from two years at the valdris academy before she was expelled for theft",
          ],
          relationshipArc: {
            act1: "Helpful informant — provides underworld contacts and smuggler intelligence. Seems genuinely invested in helping, which she partially is.",
            act2: "",
            act3: "",
          },
          dmNotes:
            "In Act 1, Mira is a likeable rogue who sells information. Play her as genuinely helpful — she wants the party to succeed because it's good for business. Her nervousness and fidgeting are character traits, not suspicious tells. Do not hint at any double-dealing.",
          voiceNotes:
            "Speaks quickly in clipped sentences. Uses 'yeah?' as a verbal tic at the end of statements. When nervous, her street accent thickens.",
        },
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
          ],
          secrets: [
            "witnessed a kidnapping from a rooftop but was too scared to intervene",
            "has been living in the undercity tunnels since sera disappeared, mapping possible hiding spots",
          ],
          relationshipArc: {
            act1: "Desperate guide — approaches the party for help finding their sibling. Provides invaluable knowledge of the undercity and lower quarters.",
            act2: "",
            act3: "",
          },
          dmNotes:
            "Zephyr is the emotional heart of the campaign — a scared kid trying to save their family. They make the kidnappings feel personal. Use them to guide the party through the undercity and to remind them why the investigation matters. Zephyr is NOT a combat asset — keep them out of fights.",
          voiceNotes:
            "Speaks rapidly with a slight stammer when nervous. Uses 'I mean' and 'like' as filler words. When talking about sera, their voice drops to barely a whisper. Calls the party members by nicknames they invent (the tall one, the magic one, etc.) until corrected.",
        },
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
          ],
          secrets: [],
          relationshipArc: {
            act1: "Background figure — mentioned in political context as Lysara's chief rival on the council.",
            act2: "",
            act3: "",
          },
          dmNotes:
            "Blackwood is a background presence in Act 1 — the party may encounter him at the council reception. He's loud, dismissive of the kidnapping investigation ('lower quarter riffraff'), but beneath the bluster he's concerned about trade disruptions. He doesn't trust Lysara but has no evidence against her. Play him as an obnoxious but ultimately harmless political figure.",
          voiceNotes:
            "Booming voice, speaks with dramatic hand gestures. Laughs from the belly. Uses 'by the gods' as an exclamation.",
        },
      ],
      transitionToNextAct:
        "The warehouse raid reveals that kidnapped victims are being transported through underground tunnels to the old temple district, specifically to a location connected to Brother Caelum's charitable hospital. The partially burned records mention 'the accord preparations' and reference Councilor Thorne's funding. As the party reports their findings to Lysara, she expresses shock and urges them to investigate the hospital — setting the stage for Act 2's deeper conspiracy.",
      dmBriefing:
        "Act 1 establishes the mystery and introduces the key players. Lysara should feel like a trustworthy patron — generous, attentive, and genuinely concerned. Aldric is the gruff ally who tests the party's resolve before opening up. Mira is a helpful informant with street connections. Zephyr provides emotional stakes and practical guidance through the undercity. The arc moves from 'missing persons case' to 'organized smuggling ring' to 'something much bigger.' Key evidence trail: docks → smuggler manifest → undercity tunnels → warehouse → temple district connection. Pace the investigation with social scenes between action beats. Let the party feel like they're making progress while building dread about what they'll find. The arcane symbols should be noted but not yet understood — seed the mystery for Act 2. End the act on the revelation that the kidnapped are being taken to the hospital, creating urgency for Act 2.",
    },

    // ═══════════════════════════════════════════════════════════════════════
    // ACT 2: The Gilded Cage
    // ═══════════════════════════════════════════════════════════════════════
    {
      campaignSlug: SLUG,
      actNumber: 2,
      title: "The Gilded Cage",
      explorationMapSpecId: "valdris-city",
      startingPOIId: "poi_hospital",
      hooks: [
        "the warehouse raid records name 'brother caelum's hospital' as a delivery destination — the party must investigate",
        "captain aldric warns the party that someone powerful is watching them and shares his partner's cold case files",
        "lysara summons the party urgently, presenting 'evidence' that lord blackwood is behind the kidnappings",
        "an invitation arrives to lord blackwood's masquerade ball — a chance to confront him or gather intelligence",
      ],
      summary:
        "The investigation leads to a charitable hospital hiding dark secrets, a masquerade ball where alliances shift, and a devastating betrayal. As the party peels back layers of conspiracy, they discover the disappearances are connected to an ancient and terrible ritual.",
      suggestedLevel: { min: 2, max: 3 },
      setting:
        "Upper and middle quarters of Valdris — elegant townhouses, the grand hospital of Brother Caelum, Lord Blackwood's lavish estate, and the political corridors of the council district. The contrast between gilded surfaces and rotten foundations becomes the act's visual motif.",
      mysteries: [
        "what is happening in the hospital basement?",
        "who is watching the party and reporting their movements?",
        "is blackwood really behind the kidnappings, or is someone framing him?",
        "what is the crimson accord — the ancient symbol appearing at kidnapping sites?",
        "who poisoned captain aldric, and why?",
      ],
      storyBeats: [
        {
          name: "The Hospital Visit",
          description:
            "The party visits Brother Caelum's hospital during the day, posing as volunteers or charitable donors. They observe the staff, the patients, and the layout of the building — noting locked doors, guarded storerooms, and Caelum's oddly private schedule.",
          type: "social",
          difficulty: "easy",
          npcInvolvement: ["brother-caelum"],
          location: "brother caelum's hospital, main ward and public areas",
          mapSpecId: "caelum-hospital",
          dmGuidance:
            "This is a low-stakes reconnaissance beat. The party should feel welcome — Caelum is publicly beloved and the hospital does genuine good work. Let the party make Perception checks (DC 10) to notice details: a locked sub-basement door, supply deliveries at odd hours, patients who seem overly sedated. Caelum is warm and gracious but deflects questions about the basement ('just storage, terribly dull'). A DC 13 Insight check reveals micro-expressions of anxiety when pressed. The goal is to establish the hospital as a real place before the night infiltration. Transition: the party leaves with enough layout knowledge to plan a return after dark, but first Aldric has something to share.",
        },
        {
          name: "Aldric's Cold Case Files",
          description:
            "Captain Aldric invites the party to his quarters and shares his former partner's unsolved case files. The crimson symbols found at recent kidnapping sites are identical to markings at his partner's murder scene years ago — the conspiracy is older than anyone realized.",
          type: "social",
          difficulty: "medium",
          npcInvolvement: ["captain-aldric-vane"],
          location: "captain aldric's quarters, valdris watch barracks",
          mapSpecId: "watch-house",
          rewards: {
            xp: 100,
            items: [
              "cold case files",
              "sketch of crimson symbols from the original murder scene",
            ],
          },
          dmGuidance:
            "This is a character-building scene for Aldric. Play him as a man carrying years of guilt over his partner's unsolved death. The case files contain: (1) a sketch of crimson symbols matching the kidnapping sites, (2) witness testimony about a 'kind healer' near the scene (matching Caelum's description), (3) a list of names — some now appear on the hospital's patient rolls. A DC 12 Investigation check connects the timelines; a DC 14 History or Arcana check identifies the symbols as related to a blood-magic tradition predating Valdris. This scene raises the stakes — the conspiracy has been running for years. Transition: armed with this evidence, the party has strong motivation to infiltrate the hospital basement that night.",
        },
        {
          name: "Night Infiltration",
          description:
            "The party infiltrates Brother Caelum's hospital after dark and discovers a hidden basement. Arcane circles, alchemical equipment, and personal effects of the missing are found. Caelum may catch them and must be confronted or evaded.",
          type: "exploration",
          difficulty: "medium",
          npcInvolvement: ["brother-caelum"],
          location: "brother caelum's hospital, hidden basement level",
          mapSpecId: "caelum-hospital",
          rewards: {
            xp: 150,
            items: [
              "caelum's journal",
              "arcane circle rubbing",
              "list of 'patients' matching missing persons",
            ],
          },
          dmGuidance:
            "This is a tense infiltration, not a combat encounter. The hospital is locked after dark — the party needs to pick locks (DC 12), find an alternate entrance, or convince the night nurse. Their daytime visit should make this easier — reward players who took notes on the layout. The basement is behind a concealed door in the supply closet. If Caelum catches them, he's terrified, not hostile. He'll plead ignorance but his journal (found in his quarters) tells a different story. The basement should feel clinical and horrifying — bloodstained arcane circles, restraints, and personal effects create a visceral horror. Transition: the journal entries reference council funding and specific payments — the party needs to trace the money, leading to the next beat.",
        },
        {
          name: "A Trail of Evidence",
          description:
            "The party follows the paper trail from Caelum's journal, cross-referencing his entries with public council funding records at the Hall of Records. The evidence points to a discretionary fund controlled by senior council members — and regular payments that coincide with disappearances.",
          type: "exploration",
          difficulty: "easy",
          npcInvolvement: ["mira-vex", "zephyr"],
          location: "valdris hall of records, various taverns and safe houses",
          mapSpecId: "hall-of-records",
          rewards: {
            xp: 100,
            items: ["annotated funding ledger showing suspicious payments"],
          },
          dmGuidance:
            "This is an investigation montage — don't let it drag. Use a few focused skill checks: DC 11 Investigation to cross-reference dates, DC 12 Persuasion to get a clerk to pull restricted records, DC 13 Insight to notice which council members' names keep appearing. Zephyr can provide underworld context ('that fund is how the council pays for things they don't want on the books'). Mira may approach the party here, offering to help interpret the records — play her as genuinely helpful but subtly steering the party toward blaming Blackwood specifically. A DC 15 Insight check catches her emphasis on Blackwood over other suspects. Transition: the evidence implicates senior council members but isn't specific enough — the party needs access to Blackwood's private records, and Lysara has a way in.",
        },
        {
          name: "The Masquerade Invitation",
          description:
            "Lysara Thorne provides the party with invitations to Lord Blackwood's upcoming masquerade ball and coaches them on the social protocols of Valdris's elite. She subtly steers them toward confronting Blackwood directly.",
          type: "social",
          difficulty: "easy",
          npcInvolvement: ["lysara-thorne"],
          location: "lysara's private salon, upper quarter",
          mapSpecId: "lysara-salon",
          rewards: {
            xp: 50,
            items: ["masquerade invitations", "borrowed formal attire"],
          },
          dmGuidance:
            "This is a prep scene that builds anticipation for the masquerade. Lysara is charming and seemingly transparent about her motives — she wants Blackwood exposed because he's her political rival. She provides: invitations, appropriate clothing, a guest list with notes on key attendees, and coaching on etiquette (DC 10 Performance to practice). She specifically suggests the party search Blackwood's private study during the ball and offers a rough layout of the estate. A DC 14 Insight check reveals she's more invested in Blackwood's downfall than in solving the kidnappings — her agenda is political, not justice. Play her as an ally with her own game. Transition: the ball is tomorrow night — this scene ends with the party planning their approach to the masquerade.",
        },
        {
          name: "Blackwood's Masquerade Ball",
          description:
            "A lavish masked ball at Lord Blackwood's estate. The party must navigate social intrigue, eavesdrop on council members, and potentially confront Blackwood with evidence — all while maintaining their cover among Valdris's elite.",
          type: "social",
          difficulty: "hard",
          npcInvolvement: [
            "lysara-thorne",
            "lord-harren-blackwood",
            "mira-vex",
          ],
          location: "blackwood estate, grand ballroom and private study",
          mapSpecId: "blackwood-estate",
          rewards: {
            xp: 200,
            items: [
              "blackwood's private ledger",
              "overheard conversation notes",
            ],
          },
          dmGuidance:
            "The masquerade is the act's centerpiece social encounter. Multiple objectives: (1) Eavesdrop on council members discussing the kidnappings (DC 13 Stealth/Perception), (2) Search Blackwood's private study for evidence (DC 15 Investigation), (3) Observe Lysara's interactions (DC 16 Insight — she's lobbying other council members against Blackwood), (4) Confront Blackwood privately (Persuasion/Intimidation DC 14 to get him talking). Mira is here too — a sharp-eyed party member (DC 15 Perception) might spot her passing a note to one of Lysara's guards. This plants the seed for her betrayal reveal. Transition: as the party leaves the ball with damning evidence, they take a shortcut through the Narrows — and walk into a trap.",
        },
        {
          name: "Ambush in the Narrows",
          description:
            "After the masquerade, the party is ambushed in a narrow alley by hired thugs. The attackers wear no identifying marks and fight to kill — someone wants the investigation stopped permanently.",
          type: "combat",
          difficulty: "hard",
          enemies: [
            {
              srdMonsterSlug: "thug",
              count: 3,
              notes: "block both ends of the alley, coordinate attacks",
            },
            {
              srdMonsterSlug: "spy",
              count: 1,
              notes:
                "assassin with poisoned blade, targets the most investigative party member",
            },
          ],
          location:
            "the narrows, a twisting alley between the upper and middle quarters",
          mapSpecId: "the-narrows",
          rewards: {
            xp: 450,
            gold: 30,
            items: [
              "assassin's poisoned dagger",
              "unsigned payment voucher from a council account",
            ],
          },
          dmGuidance:
            "This ambush should feel dangerous and personal — someone powerful wants the party dead. The narrow alley limits movement (5 ft. wide, 60 ft. long). Thugs block both ends while the spy targets the party's lead investigator. The payment voucher is traceable to a council discretionary fund but not to a specific member — it's a thread for Act 3. If the party captures the spy alive, they'll admit to being hired through intermediaries but can describe the voice of their employer (matches Lysara under DC 18 Insight). Transition: in the aftermath, the party should ask 'how did they know our route?' — only Mira and Lysara knew the party would be at the ball. The timing is suspicious.",
        },
        {
          name: "Mira's Betrayal Revealed",
          description:
            "The party pieces together that Mira's knowledge of their movements matches the ambush timing perfectly. Confronting her — or investigating her contacts — reveals she has been feeding information to Lysara's network, believing she was protecting the party from Blackwood's agents.",
          type: "social",
          difficulty: "medium",
          npcInvolvement: ["mira-vex", "zephyr"],
          location:
            "mira's lodgings or a neutral meeting place in the middle quarter",
          mapSpecId: "lower-quarter-streets",
          rewards: { xp: 150 },
          dmGuidance:
            "This is an emotionally charged confrontation. Mira genuinely believed she was helping — Lysara convinced her that sharing the party's plans would let Lysara's people provide covert protection. She didn't know about the ambush and is horrified when confronted. A DC 12 Insight check confirms her remorse is genuine. The party can: (1) forgive her and keep her as a chastened ally, (2) cut ties (she becomes a guilt-ridden neutral NPC in Act 3), or (3) use her as a double agent to feed false information to Lysara. Zephyr can corroborate Mira's story — he's seen Lysara's agents tailing the party independently. This beat reframes Lysara from helpful patron to manipulative puppeteer. Transition: before the party can act on this revelation, urgent news arrives — Captain Aldric has collapsed. He's been poisoned.",
        },
        {
          name: "The Poisoned Captain",
          description:
            "Captain Aldric is found collapsed at the watch barracks, poisoned with a slow-acting arcane toxin. The scene is tense as allies gather — Aldric is barely conscious and the watch is in disarray without its captain.",
          type: "social",
          difficulty: "medium",
          npcInvolvement: ["captain-aldric-vane", "zephyr"],
          location: "valdris watch barracks, aldric's quarters",
          mapSpecId: "watch-house",
          rewards: { xp: 100 },
          dmGuidance:
            "This is a dramatic scene, not a puzzle yet — the puzzle comes next. Play up the emotional weight: Aldric is the party's most reliable ally, and seeing him helpless should hit hard. A DC 12 Medicine check stabilizes him temporarily; a DC 14 Arcana check identifies the toxin as alchemical, not natural — someone with access to rare reagents (like a hospital) made this. Zephyr arrives with street contacts who saw a cloaked figure leaving the barracks. The watch sergeant is panicking and looks to the party for direction. Give the party a moment to process the betrayal cascade: Mira was compromised, Lysara is manipulating everyone, and now Aldric is dying. Transition: identifying the poison reveals it has an antidote, but the ingredients are rare and time is short — the party must race to save him.",
        },
        {
          name: "Race for the Antidote",
          description:
            "The party must locate rare reagents — moonpetal flowers from the temple gardens and purified silver dust from an alchemist's shop — and brew the antidote before time runs out. Aldric's life hangs in the balance.",
          type: "puzzle",
          difficulty: "medium",
          npcInvolvement: ["captain-aldric-vane"],
          location:
            "various — temple gardens, alchemist quarter, aldric's quarters",
          mapSpecId: "temple-district",
          rewards: { xp: 200 },
          dmGuidance:
            "This is a timed skill challenge with 3 phases: (1) Identify the poison (DC 14 Medicine or Arcana — may already be done in the previous beat), (2) Gather moonpetal from the temple gardens at night (DC 12 Nature to find, DC 13 Stealth to avoid temple guards), (3) Brew the antidote (DC 14 Medicine or Alchemist's tools). Allow creative solutions. The party has about 8 in-game hours before Aldric dies. Success: Aldric recovers and provides crucial evidence for Act 3 — he recognized his poisoner's ring as bearing the crimson accord symbol. Failure: Aldric dies — this should be devastating and fuel the party's motivation for Act 3. Either way, the act ends with the party knowing the conspiracy reaches the highest levels of Valdris, setting up the final confrontation.",
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
      npcs: [
        {
          id: "lysara-thorne",
          name: "Lysara Thorne",
          srdMonsterSlug: "noble",
          role: "patron",
          appearance:
            "A striking woman in her early forties with silver-streaked auburn hair swept into an elegant updo. She favors deep crimson robes trimmed with gold thread and carries herself with the practiced grace of someone born to power. Her green eyes are sharp and assessing, though her smile is warm enough to disarm even the most suspicious visitor.",
          personality: {
            traits: [
              "charming and generous with compliments",
              "speaks with deliberate precision, never wasting a word",
              "remembers every name and personal detail — uses them to make people feel valued",
            ],
            ideals: [
              "order is essential for the city's survival",
              "power wielded wisely is a force for good",
            ],
            bonds: [
              "deeply invested in the safety and prosperity of valdris",
              "funds charitable work across the lower quarters",
            ],
            flaws: [
              "becomes noticeably evasive when asked about her hospital funding or council finances",
              "subtly redirects conversations about the investigation toward lord blackwood",
            ],
          },
          motivations: [
            "continue supporting the party's investigation while steering them away from the hospital's true purpose",
            "redirect suspicion toward lord blackwood using forged evidence",
          ],
          secrets: [
            "provides the party with forged evidence pointing to blackwood as the kidnapping mastermind",
            "becomes harder to reach as 'council duties' intensify",
          ],
          relationshipArc: {
            act1: "",
            act2: "Still supportive but subtly deflects certain questions. Redirects investigation toward Blackwood. Becomes harder to reach as 'council duties' intensify.",
            act3: "",
          },
          dmNotes:
            "Lysara is still playing the patron role but cracks are forming. She subtly steers the party toward Blackwood — presents 'evidence' she 'discovered' pointing to him. She deflects questions about hospital funding with smooth political excuses. She's harder to meet (always 'in council'). A DC 16 Insight check reveals she's being evasive, but nothing more. Do NOT reveal her as the mastermind — that comes in Act 3.",
          voiceNotes:
            "Same calm authority as Act 1, but speaks slightly faster when deflecting questions. When lying, she maintains perfect eye contact and speaks slightly slower. Uses 'I'm sure you'll find the truth' as a deflection.",
        },
        {
          id: "captain-aldric-vane",
          name: "Captain Aldric Vane",
          srdMonsterSlug: "veteran",
          role: "ally",
          appearance:
            "A weathered man in his late fifties with close-cropped grey hair and a jagged scar running from his left temple to his jaw. He wears well-maintained city watch armor that's seen better days. His brown eyes carry the weight of too many unsolved cases.",
          personality: {
            traits: [
              "blunt and direct — has no patience for political games",
              "protective of his watchmen and the common folk of valdris",
              "increasingly paranoid — warns the party they're being watched",
            ],
            ideals: [
              "justice should apply equally to lords and laborers",
              "a good captain leads from the front",
            ],
            bonds: [
              "lost his partner to an 'unsolved' murder ten years ago — the crimson symbol at the scene matches the kidnapping sites",
              "the watch is his family; he'd die for any of them",
            ],
            flaws: [
              "stubborn pride prevents him from asking for help until desperate",
              "too trusting of authority figures — doesn't suspect Lysara until it's almost too late",
            ],
          },
          motivations: [
            "share his partner's cold case files with the party — the crimson symbols match",
            "warn the party that someone powerful is tracking them",
          ],
          secrets: [
            "his partner's murder featured the same crimson accord symbol found at kidnapping sites",
            "he's been keeping unofficial case files hidden in his home that connect the dots",
          ],
          relationshipArc: {
            act1: "",
            act2: "Warns the party they're being watched. Shares his partner's cold case files. Poisoned by unknown agents midway through the act — becomes a victim the party must save.",
            act3: "",
          },
          dmNotes:
            "Aldric is the party's closest ally and now a victim. His poisoning should be a gut-punch. Play his trust as earned — he shares his most guarded secret (his partner's case files) because the party proved themselves in Act 1. The poisoning happens after he shares files — someone wants to silence him. The antidote quest creates personal urgency.",
          voiceNotes:
            "Gruff baritone, speaks in short declarative sentences. Punctuates points by tapping the table. Calls the party by first names now — they've earned his respect.",
        },
        {
          id: "mira-vex",
          name: "Mira Vex",
          srdMonsterSlug: "spy",
          role: "informant",
          appearance:
            "A lithe halfling woman in her mid-twenties with sharp features, dark eyes that miss nothing, and ink-black hair cut short and practical. She dresses in muted browns and greys that let her blend into any crowd.",
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
              "reports the party's movements to a powerful patron out of fear, not loyalty",
            ],
            flaws: [
              "trusts no one fully, which makes genuine connection difficult",
              "her survival instinct sometimes overrides her conscience",
            ],
          },
          motivations: [
            "stay alive — her patron's reach is long and her patience is short",
            "earn enough gold to leave valdris and start over somewhere safe",
            "deep down, wants to do the right thing but is terrified of the consequences",
          ],
          secrets: [
            "has been reporting the party's movements to a powerful patron since they started investigating",
            "knows the location of a hidden ritual chamber but is too afraid to reveal it",
          ],
          relationshipArc: {
            act1: "",
            act2: "Revealed as a double agent when the party discovers she's been feeding information to someone powerful. Can flee or be captured. If the party shows mercy, she becomes wracked with guilt.",
            act3: "",
          },
          dmNotes:
            "Mira's betrayal is the act's emotional gut-punch. Her double-dealing should be discovered through investigation — the party spots her passing a note at the masquerade (DC 15 Perception), or connects her knowledge of their plans to ambush timing. When caught, she's terrified, not defiant. She was coerced, not willing. If the party shows mercy, she becomes wracked with guilt — seeding a potential redemption. Do NOT name who she reports to — she communicates through dead drops and doesn't know the full picture.",
          voiceNotes:
            "Speaks quickly in clipped sentences. Uses 'yeah?' as a verbal tic. When caught in her lie, her street accent thickens and she can barely speak above a whisper.",
        },
        {
          id: "zephyr",
          name: "Zephyr",
          srdMonsterSlug: "commoner",
          role: "ally",
          appearance:
            "A wiry teenage tiefling with lavender skin, small curved horns, and anxious golden eyes. They wear a patchwork cloak over threadbare clothes and carry a worn leather satchel stuffed with hand-drawn maps of the undercity.",
          personality: {
            traits: [
              "earnest and determined despite obvious fear",
              "has an encyclopedic knowledge of valdris's tunnel systems and shortcuts",
              "growing more confident with the party's support",
            ],
            ideals: [
              "family is everything — blood or chosen",
              "even the smallest person can change the course of events",
            ],
            bonds: [
              "their older sibling sera was among the first kidnapped — finding her is their only goal",
              "trusts the party completely now",
            ],
            flaws: [
              "reckless when sera's safety is at stake — will charge into danger without thinking",
              "becomes emotionally volatile as they get closer to the truth",
            ],
          },
          motivations: [
            "find sera — they've learned she may be held at the hospital",
            "help the party however they can",
          ],
          secrets: [
            "discovered that sera was specifically targeted, not randomly kidnapped",
          ],
          relationshipArc: {
            act1: "",
            act2: "Grows more confident with the party's support. Discovers that sera is being held at the hospital. Becomes emotionally volatile as they get closer to the truth.",
            act3: "",
          },
          dmNotes:
            "Zephyr is more confident but more desperate. They've heard rumours about sera being at the hospital and will push the party to investigate. Their emotional reactions to the hospital basement discoveries should amplify the horror. Keep Zephyr out of combat and make protecting them a consideration.",
          voiceNotes:
            "Still speaks rapidly but with more conviction. When talking about sera, their voice cracks with emotion. Starting to use party members' real names instead of nicknames — a sign of deepening trust.",
        },
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
              "a powerful benefactor funded the hospital's expansion and he feels deeply indebted",
            ],
            flaws: [
              "willful blindness — suspects something is wrong in the basement but refuses to look",
              "his gratitude to his benefactor overrides his moral compass",
            ],
          },
          motivations: [
            "maintain his hospital and continue helping the poor",
            "avoid confronting the truth about what happens in the lower levels",
          ],
          secrets: [
            "gave his benefactor access to the hospital basement for 'charitable research'",
            "has heard screaming from below but convinced himself it's the ravings of fever patients",
            "keeps a journal documenting his doubts — a key piece of evidence if found",
          ],
          relationshipArc: {
            act1: "",
            act2: "Central figure — the party investigates his hospital and must determine if he's complicit or a dupe. He cooperates nervously but deflects questions about the basement.",
            act3: "",
          },
          dmNotes:
            "Caelum is a good man who chose not to see. He's not a villain, but his cowardice enabled villainy. Play him as genuinely kind on the surface with visible cracks of guilt. His journal is a key evidence piece. If the party treats him with compassion, he opens up faster. If they threaten him, he clams up. He should make the party uncomfortable. Do NOT have him name his benefactor directly — he refers to them only as 'my patron' or 'the councilor who helped us.'",
          voiceNotes:
            "Soft, reedy voice that trembles when he's lying. Quotes scripture when deflecting. Wrings his hands constantly. When he finally tells the truth, he speaks with sudden clarity and strength.",
        },
        {
          id: "lord-harren-blackwood",
          name: "Lord Harren Blackwood",
          srdMonsterSlug: "noble",
          role: "rival",
          appearance:
            "A portly man in his fifties with an impressive handlebar mustache, ruddy complexion, and calculating brown eyes. He dresses in expensive but slightly outdated fashion — fur-trimmed cloaks and jeweled rings on every finger.",
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
              "his merchant empire is his legacy",
              "deeply concerned about the kidnappings disrupting trade",
            ],
            flaws: [
              "his ego blinds him to genuine threats",
              "drinks heavily at social events and says things he shouldn't",
            ],
          },
          motivations: [
            "counter lysara's growing political influence",
            "prove he's not behind the kidnappings — someone is framing him",
            "protect his trade routes and reputation",
          ],
          secrets: [
            "has evidence that the hospital receives suspiciously large anonymous funding",
            "hired private investigators who then disappeared — same kidnapping ring",
            "his own shipping manifests show discrepancies — some of his ships were used without his knowledge",
          ],
          relationshipArc: {
            act1: "",
            act2: "Active rival — hosts the masquerade ball where key evidence surfaces. Someone is framing him as the mastermind. Found dead in apparent suicide at the act's end — a shock that changes everything.",
            act3: "",
          },
          dmNotes:
            "Blackwood is a red herring and a victim. He's loud, abrasive, and politically motivated — easy to suspect. Someone deliberately points the party toward him. His murder should shock the party and raise the stakes. If the party investigated his claims about the hospital funding before his death, they'll have crucial evidence. His death is the turning point from 'political mystery' to 'deadly conspiracy.'",
          voiceNotes:
            "Booming voice, dramatic hand gestures. Laughs from the belly. Uses 'by the gods' as an exclamation. When serious, drops to a near-whisper and leans in conspiratorially.",
        },
      ],
      transitionToNextAct:
        "Blackwood's death and the revelation of the Crimson Accord's true nature transform the investigation from political intrigue into an existential threat. The true mastermind moves to consolidate power on the council. With Aldric poisoned (or dead), Mira exposed, and Blackwood framed, the party must piece together the evidence to identify who is really behind everything. The hospital is the preparation site, and an ancient temple beneath the city is where the ritual will be completed.",
      dmBriefing:
        "Act 2 is the conspiracy unraveling. The tone shifts from investigation to paranoia — the party should feel that no one can be fully trusted. Lysara continues to be helpful while subtly steering the party toward Blackwood. The hospital infiltration is the first major revelation — make the basement genuinely disturbing. The masquerade ball is the social centerpiece where all NPCs converge and evidence threads intersect. Mira's betrayal should be discovered through investigation, not just revealed — let the party connect the dots. Aldric's poisoning raises personal stakes and creates urgency. Blackwood's death is the act's climax — it should feel like a genuine shock that recontextualizes everything. End the act with the party understanding the full scope of the conspiracy but not yet knowing who is behind it. Key pacing: investigation → social intrigue → betrayal → crisis → revelation.",
    },

    // ═══════════════════════════════════════════════════════════════════════
    // ACT 3: The Accord Unveiled
    // ═══════════════════════════════════════════════════════════════════════
    {
      campaignSlug: SLUG,
      actNumber: 3,
      title: "The Accord Unveiled",
      explorationMapSpecId: "valdris-city",
      startingPOIId: "poi_watch_house",
      hooks: [
        "blackwood's death and the crimson accord revelation transform the mystery into an existential threat — lysara must be stopped",
        "aldric (if saved) provides his partner's old case files that directly implicate lysara",
        "mira (if shown mercy) offers to reveal the location of the ritual chamber in exchange for protection",
        "zephyr discovers that sera is among the captives — personal stakes demand immediate action",
      ],
      summary:
        "The truth stands revealed: Councilor Lysara Thorne has orchestrated everything — the kidnappings, the experiments, the political machinations. As she races to complete the ancient Crimson Accord ritual in a temple beneath the city, the party must rally their allies, gather final evidence, and confront her before Valdris falls under her eternal dominion.",
      suggestedLevel: { min: 4, max: 5 },
      setting:
        "The depths of Valdris — ancient tunnels beneath the temple district lead to a forgotten pre-city temple where the Crimson Accord ritual is being prepared. Above ground, political chaos as Lysara consolidates power. The contrast between the crumbling ancient temple and the modern city above reflects how old evils persist beneath civilized surfaces.",
      mysteries: [
        "can lysara actually complete the ritual, or can the party still stop her?",
        "what happens if the ritual succeeds?",
        "can lysara be reasoned with, or is she beyond redemption?",
      ],
      storyBeats: [
        {
          name: "Gathering the Evidence",
          description:
            "The party assembles everything they've uncovered across Acts 1 and 2 — hospital records, payment vouchers, Aldric's partner's case files, and Caelum's journal. A visit to Brother Caelum's cell yields a tearful confession that ties Lysara directly to the kidnappings and the ancient ritual.",
          type: "exploration",
          difficulty: "medium",
          npcInvolvement: ["brother-caelum", "captain-aldric-vane"],
          location: "valdris city watch headquarters and jail",
          mapSpecId: "watch-house",
          rewards: { xp: 150 },
          dmGuidance:
            "This is a decompression beat after the intensity of Act 2. Let the party take stock. Caelum is broken — he cooperated with Lysara out of genuine belief in her charitable mission, then discovered the truth too late. A DC 10 Persuasion check gets him talking; DC 14 gets the full confession including the temple location. If Aldric survived Act 2, his partner's old case files contain a map of the tunnel network beneath the temple district. If Aldric died, the party must find this information another way (DC 15 Investigation at the watch archives). Transition: once the party has assembled their evidence, they realize they need political backing to move against a sitting council member — this leads directly to rallying allies.",
        },
        {
          name: "Rallying Allies",
          description:
            "Before confronting Lysara publicly, the party reaches out to their allies across Valdris. Each ally offers something different depending on how the party treated them: Aldric provides city watch support, Mira offers insider knowledge of Lysara's defenses, and Zephyr has located the tunnels beneath the temple district.",
          type: "social",
          difficulty: "medium",
          npcInvolvement: ["captain-aldric-vane", "mira-vex", "zephyr"],
          location: "various locations across valdris",
          mapSpecId: "lower-quarter-streets",
          dmGuidance:
            "This is a branching social beat — what's available depends entirely on earlier choices. Aldric (if alive and loyal): offers a squad of 4 city watch guards for the temple assault and will personally testify before the council. If Aldric is dead, the party can recruit his lieutenant (less effective, no personal testimony). Mira (if shown mercy and redeemed): reveals Lysara's personal guard rotation and a secret entrance to the temple. If Mira was killed or imprisoned, this intel is unavailable. Zephyr (always available): has scouted the temple district and found a collapsed tunnel entrance — Sera is down there, so Zephyr is coming regardless. Track how many allies the party secures — this affects the council confrontation DCs and the final battle difficulty. Transition: with allies rallied (or not), the party heads to the council chambers to make their case against Lysara.",
        },
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
            "This encounter's outcome depends on how much evidence the party gathered in Acts 1-2 and how many allies they rallied. With strong evidence (3+ pieces: hospital records, Caelum's confession, Aldric's files, Mira's testimony, payment vouchers), the council votes to arrest Lysara (DC 12 Persuasion). With weak evidence (1-2 pieces), the DC is 18 and Lysara can counter-argue effectively. Each ally who testifies (Aldric, Mira) lowers the DC by 2. If the party succeeds, the council authorizes the arrest and the party gets city watch backup. If the party fails, they must pursue Lysara without official sanction. Either way, Lysara does not submit — she triggers the next beat. Transition: regardless of the vote's outcome, Lysara reveals she anticipated this moment. She activates a prepared smoke bomb laced with a minor enchantment (DC 13 Wisdom save or stunned for 1 round), and flees the council chamber toward the temple district.",
        },
        {
          name: "Lysara's Flight",
          description:
            "Lysara escapes the council session in a flash of arcane smoke. Political chaos erupts as council members shout accusations at each other. The party must act quickly — tracking Lysara through the panicked streets of Valdris before she reaches the temple and seals herself inside.",
          type: "exploration",
          difficulty: "medium",
          npcInvolvement: ["lysara-thorne", "zephyr"],
          location: "valdris streets, merchant quarter to temple district",
          mapSpecId: "valdris-streets",
          dmGuidance:
            "This is a chase/tracking beat. Lysara has a head start but is slowed by her robes and the need to activate wards along her escape route. The party can track her via: (1) DC 12 Survival to follow her footprints through the rain-slick streets, (2) DC 13 Perception to spot the faint crimson glow of her ward activations, or (3) DC 11 Investigation to ask panicked bystanders which way the running councilor went. Each failed check costs time — after 3 failures, Lysara reaches the temple and activates the outer wards, making the temple district entrance harder to breach (increases DCs in the next beat by 2). If Zephyr is with the party, they know a shortcut through the rooftops that grants advantage on one tracking check. Describe the streets in chaos — city watch mobilizing, merchants shuttering shops, rumors flying. Transition: the trail leads to the temple district, where ancient stone buildings and narrow alleys give way to the entrance of something much older.",
        },
        {
          name: "The Temple District",
          description:
            "The party reaches the temple district — a cluster of ancient stone shrines and crumbling chapels above ground. Lysara has activated arcane wards on the streets, and her remaining agents patrol the area. The entrance to the tunnels below lies hidden beneath the oldest chapel.",
          type: "exploration",
          difficulty: "medium",
          npcInvolvement: ["mira-vex"],
          location: "valdris temple district, surface level",
          mapSpecId: "temple-district",
          enemies: [
            {
              srdMonsterSlug: "guard",
              count: 2,
              notes: "lysara's agents patrolling the temple district perimeter",
            },
          ],
          rewards: { xp: 200 },
          dmGuidance:
            "This beat bridges the above-ground pursuit and the underground dungeon. The temple district is eerie — normally bustling with worshippers, it's now deserted. Lysara's wards crackle with faint crimson energy across doorways and alleys. The party can bypass wards with DC 13 Arcana checks or brute force them (each ward has AC 12, 15 HP, and explodes for 1d6 necrotic when destroyed). Two of Lysara's guards patrol the perimeter — they can be fought, snuck past (DC 14 Stealth), or talked down (DC 16 Intimidation, they're scared). If Mira is with the party, she knows exactly which chapel hides the tunnel entrance and can disarm one ward automatically. The tunnel entrance is a concealed trapdoor beneath the altar of the oldest chapel — DC 14 Investigation to find without help. Transition: the trapdoor opens onto a narrow stone staircase descending into darkness. The air shifts from cool night breeze to stale, ancient must. The party begins the temple descent.",
        },
        {
          name: "Temple Descent",
          description:
            "The party descends through ancient tunnels beneath the temple district into a pre-Valdris temple complex. Arcane traps, magical darkness, and the oppressive atmosphere of old blood magic test the party's resolve as they navigate toward the ritual chambers below.",
          type: "exploration",
          difficulty: "hard",
          location: "ancient temple beneath the temple district",
          mapSpecId: "ancient-temple",
          rewards: {
            xp: 250,
            items: ["ancient temple map fragment", "ward-breaking amulet"],
          },
          dmGuidance:
            "This is a dungeon crawl focused on atmosphere and traps — no combat here (that comes in the next beat). The temple is OLD — predates Valdris by centuries. Describe crumbling stonework, faded murals depicting the original Crimson Accord practitioners performing blood sacrifices, and an oppressive sense of malevolence that grows stronger as they descend. Include 2-3 traps: (1) Pressure plate triggers a falling block (DC 13 Perception to spot, DC 14 Dex save, 2d10 bludgeoning), (2) Arcane glyph ward (DC 14 Investigation to spot, DC 15 Arcana to disarm, 3d6 necrotic on trigger), (3) Collapsing bridge over a chasm (DC 12 Athletics to leap, 2d6 falling damage on failure). The ward-breaking amulet found here will be useful for disrupting the ritual circles later. The ancient temple map fragment reveals the layout of the deeper chambers. Transition: beyond the trapped corridors, the tunnels open into a vast pillared hall — and the party is not alone. Ancient guardians stir to life.",
        },
        {
          name: "The Guardians' Hall",
          description:
            "A massive pillared hall deep within the ancient temple, lined with alcoves containing suits of archaic armor and flickering spectral lights. As the party enters, the guardians awaken — animated armor steps from its alcoves and specters materialize from the walls, bound to defend this place for eternity.",
          type: "combat",
          difficulty: "hard",
          enemies: [
            {
              srdMonsterSlug: "animated-armor",
              count: 2,
              notes:
                "ancient temple guardians, activate when intruders enter the main hall",
            },
            {
              srdMonsterSlug: "specter",
              count: 2,
              notes:
                "restless spirits of previous ritual victims, haunt the preparation chambers",
            },
          ],
          location: "ancient temple, guardians' hall",
          mapSpecId: "ancient-temple",
          rewards: { xp: 400 },
          dmGuidance:
            "This is a set-piece combat in a dramatic location. The hall is 60ft long, 40ft wide, with stone pillars every 10ft providing half cover. The animated armor activates in pairs — the first two when the party reaches the hall's midpoint, providing a dramatic moment of realization. The specters phase through walls to flank. Tactical notes: the armor is slow but hits hard; the specters are fast and drain life. If the party is struggling, a successful DC 14 Arcana check reveals that the guardians are bound to specific alcoves — luring them 30ft from their alcove causes them to deactivate for 1 round as the binding magic strains. The specters are the spirits of previous ritual victims and can be turned by a cleric. Transition: with the guardians defeated, the hall's far door opens into a corridor sloping downward. The faint sound of chanting and the acrid smell of incense signal that the ritual chambers are close — and the captives are just ahead.",
        },
        {
          name: "Saving the Captives",
          description:
            "The party discovers the kidnapped victims — including Zephyr's sibling Sera — bound in arcane circles that slowly drain their life force to power the ritual. Freeing them requires disrupting the circles without killing the victims.",
          type: "puzzle",
          difficulty: "medium",
          npcInvolvement: ["zephyr"],
          enemies: [
            {
              srdMonsterSlug: "guard",
              count: 3,
              notes:
                "lysara's personal guard, fight to prevent the circles from being disrupted",
            },
          ],
          location: "ancient temple, ritual preparation chamber",
          mapSpecId: "ancient-temple",
          rewards: { xp: 300 },
          dmGuidance:
            "This encounter combines combat and puzzle. 3 guards protect 6 arcane circles holding captives. The party must defeat or distract the guards while disrupting the circles (DC 13 Arcana check per circle, or DC 15 to disrupt multiple at once). The ward-breaking amulet from the Temple Descent grants advantage on these Arcana checks. Breaking a circle by force (attacking it) requires DC 14 Constitution save from the victim or they take 2d6 necrotic damage. Zephyr will rush to Sera's circle regardless of danger — the party may need to protect them. Each freed captive weakens Lysara's ritual by a small amount, making the boss fight incrementally easier (each freed captive reduces Lysara's bonus HP by 10). Transition: with the captives freed (or as many as the party could save), the path leads deeper still — into the grand ritual chamber. The chanting grows louder, and crimson light pulses from beyond the final door. Lysara is waiting.",
        },
        {
          name: "Lysara's Ultimatum",
          description:
            "The party enters the grand ritual chamber to find Lysara standing at the center of a massive glowing ritual circle, partially empowered by the Crimson Accord. She turns to face them — not with rage, but with disappointment. She offers them a choice: join her new order for Valdris, or oppose her and be destroyed.",
          type: "social",
          difficulty: "hard",
          npcInvolvement: ["lysara-thorne", "captain-aldric-vane", "mira-vex"],
          location: "ancient temple, grand ritual chamber",
          mapSpecId: "ancient-temple",
          dmGuidance:
            "This is the dramatic pause before the storm — a tense dialogue scene that gives weight to the final battle. Lysara is calm and articulate. She lays out her vision: Valdris is corrupt, the council is incompetent, and only she has the will to impose real order. She offers the party positions of power in her new regime. This is a genuine roleplay moment — let the players respond, argue, and make their case. If a player attempts Persuasion DC 25, Lysara hesitates — she won't surrender, but she'll reveal a moment of doubt that humanizes her. If any player seriously considers her offer, explore that dramatically — what would it mean to side with the villain? Allies present react: Aldric (if present) is disgusted and urges the party to fight. Mira (if present) is visibly conflicted — she understands Lysara's frustration with the system even if she rejects the method. When the party refuses (or if they accept — that's a dramatic campaign-ending twist the DM should improvise), Lysara's expression hardens and she begins channeling the ritual's power. Transition: Lysara's ultimatum ends. She raises her hands and crimson energy surges through the chamber. Roll initiative.",
        },
        {
          name: "The Crimson Accord — Final Battle",
          description:
            "Lysara channels the full power of the Crimson Accord, the ancient ritual circle blazing with crimson energy beneath her feet. Her bodyguards and ritual thralls stand between the party and their target. The fate of Valdris hangs on this fight.",
          type: "boss",
          difficulty: "deadly",
          npcInvolvement: ["lysara-thorne", "mira-vex", "captain-aldric-vane"],
          enemies: [
            {
              srdMonsterSlug: "mage",
              count: 1,
              notes:
                "lysara thorne with enhanced stats — see campaign NPC combat stats",
            },
            {
              srdMonsterSlug: "thug",
              count: 2,
              notes: "lysara's loyal bodyguards, fight to the death",
            },
            {
              srdMonsterSlug: "zombie",
              count: 3,
              notes:
                "ritual thralls — victims partially transformed by the accord, attack mindlessly",
            },
          ],
          location: "ancient temple, grand ritual chamber",
          mapSpecId: "ancient-temple",
          rewards: {
            xp: 2300,
            gold: 500,
            items: [
              "lysara's crimson accord scrolls",
              "ring of protection +1",
              "staff of the crimson accord",
            ],
          },
          dmGuidance:
            "This is the campaign climax. The ritual chamber is a massive underground cathedral with a 30ft diameter ritual circle at the center. Lysara uses her enhanced combat stats (AC 15, 85 HP with crimson accord empowerment — reduced by 10 for each captive the party freed in the previous encounter). Allies present depend on earlier choices: Aldric (if saved) provides flanking and +2 to party attack rolls when adjacent. Mira (if redeemed) knows the temple layout and can disable a trap mid-fight. Phase 1: Lysara fights with spells while bodyguards and thralls engage the party. Phase 2 (at half HP): Crimson Accord empowerment activates — +2 AC, +1d6 necrotic to attacks. Lysara monologues about her vision for Valdris. Give the party a final chance to attempt Persuasion DC 25 to talk her down (if they didn't already try during the Ultimatum). If successful, she surrenders — a bittersweet ending. If not, fight to defeat. After the battle, describe the ritual energy dissipating and the captives (if freed) regaining consciousness. End with an epilogue scene: the party decides Lysara's fate (execution, imprisonment, exile) and the council asks for their recommendation on Valdris's future governance.",
        },
      ],
      relevantNPCIds: [
        "lysara-thorne",
        "captain-aldric-vane",
        "mira-vex",
        "zephyr",
        "brother-caelum",
      ],
      npcs: [
        {
          id: "lysara-thorne",
          name: "Lysara Thorne",
          srdMonsterSlug: "mage",
          role: "villain",
          appearance:
            "A striking woman in her early forties with silver-streaked auburn hair swept into an elegant updo. She favors deep crimson robes trimmed with gold thread and carries herself with the practiced grace of someone born to power. Her green eyes are sharp and assessing, though her smile is warm enough to disarm even the most suspicious visitor.",
          personality: {
            traits: [
              "alternates between cold calculation and genuine disappointment that the party couldn't see her vision",
              "speaks with deliberate precision, never wasting a word",
              "still remembers every name and personal detail — weaponizes this intimacy now",
            ],
            ideals: [
              "order and control above all — the city needs a firm hand, not a squabbling council",
              "power is not evil; it is the only reliable tool for lasting change",
            ],
            bonds: [
              "the crimson accord is her life's work — decades of research and sacrifice",
              "genuinely believes valdris will be better under her sole rule",
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
            "murdered lord blackwood and staged it as suicide",
          ],
          betrayalTrigger:
            "When the party gets too close to connecting the hospital to the kidnappings, Lysara frames Lord Blackwood and escalates the ritual timeline. If directly confronted with evidence, she drops the patron facade and attempts to eliminate witnesses.",
          relationshipArc: {
            act1: "",
            act2: "",
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
            "Lysara is the campaign's central antagonist, now fully revealed. She's a tragic villain who genuinely believes she's saving the city. Give players a chance to talk her down (very hard DC 25 Persuasion) for an alternative ending. In the final battle, she should be formidable but not impossible. Her composure cracks under pressure — she's angry that the party couldn't see the 'obvious truth' of her vision.",
          voiceNotes:
            "Her calm authority from Acts 1-2 cracks — voice trembles with conviction, not fear. When fighting, she's cold and methodical. When monologuing about her vision, she's passionate and almost sympathetic. Uses 'you could have been part of this' as a recurring line.",
        },
        {
          id: "captain-aldric-vane",
          name: "Captain Aldric Vane",
          srdMonsterSlug: "veteran",
          role: "ally",
          appearance:
            "A weathered man in his late fifties with close-cropped grey hair and a jagged scar. If saved from poisoning, he looks gaunt but determined. His armor is polished — he's ready for a fight.",
          personality: {
            traits: [
              "blunt and direct — has no patience for political games",
              "driven by righteous anger at the conspiracy that killed his partner",
              "protective of his watchmen and the party",
            ],
            ideals: [
              "justice should apply equally to lords and laborers",
              "a good captain leads from the front",
            ],
            bonds: [
              "his partner was murdered by lysara's agents ten years ago to silence an earlier investigation",
              "the watch is his family; he'd die for any of them",
            ],
            flaws: [
              "his anger at lysara can make him reckless",
              "stubborn pride — insists on fighting even if weakened from the poison",
            ],
          },
          motivations: [
            "bring lysara to justice for everything — his partner's murder, the kidnappings, blackwood's death",
            "protect the party in the final confrontation",
          ],
          secrets: [
            "his partner's murder was ordered by lysara to silence an earlier investigation",
            "he found a crimson accord symbol at his partner's murder scene — it all connects now",
          ],
          relationshipArc: {
            act1: "",
            act2: "",
            act3: "If saved from poisoning, provides crucial evidence from his partner's old case files. Fights alongside the party in the final confrontation if able.",
          },
          dmNotes:
            "Aldric is the party's staunchest ally in the finale. If saved from poisoning, he's weakened but determined. His evidence from his partner's murder directly implicates Lysara. In the final battle, he provides flanking (+2 to party attack rolls when adjacent). If the party didn't save him in Act 2, he's dead — reference his sacrifice to fuel the party's motivation.",
          voiceNotes:
            "Gruff baritone, but now with an edge of fury. Calls Lysara 'that monster' and 'the woman who killed my partner.' Quieter than usual — controlled rage.",
        },
        {
          id: "mira-vex",
          name: "Mira Vex",
          srdMonsterSlug: "spy",
          role: "ally",
          appearance:
            "A lithe halfling woman in her mid-twenties. If given a chance at redemption, she looks haunted but resolute. Her fidgeting has stopped — she's still for the first time.",
          personality: {
            traits: [
              "wracked with guilt over her betrayal",
              "speaks slowly and deliberately — the contrast with her Act 1 rapid-fire style is striking",
              "determined to make amends",
            ],
            ideals: [
              "some things are worth dying for — she's only just realising this",
              "information is power, and she has plenty to give",
            ],
            bonds: [
              "lysara coerced her through fear — she reported to her through dead drops",
              "the lower quarters she grew up in are in danger from the ritual",
            ],
            flaws: [
              "still struggles with trust — volunteering information feels unnatural",
              "terrified of lysara's retaliation",
            ],
          },
          motivations: [
            "atone for her betrayal by providing everything she knows about lysara's operation",
            "save the lower quarters she grew up in",
          ],
          secrets: [
            "knows the exact location of lysara's ritual chamber beneath the old temple",
            "knows lysara's guard rotation and the temple's trap layout",
          ],
          relationshipArc: {
            act1: "",
            act2: "",
            act3: "If given a chance at redemption, provides the location of Lysara's ritual chamber and fights alongside the party. Her knowledge of the temple layout is invaluable.",
          },
          dmNotes:
            "Mira is the morally grey NPC who tests the party's capacity for mercy. Her redemption should feel earned, not automatic. She won't just flip sides because they ask — she needs to see proof that the ritual will destroy the lower quarters she grew up in. If redeemed, she provides the ritual chamber location and temple layout. If the party killed her or refused redemption, they must find the chamber through harder means.",
          voiceNotes:
            "Speaks slowly and deliberately — the contrast with her earlier rapid-fire style is the sign of genuine change. When being honest, she makes eye contact for the first time.",
        },
        {
          id: "zephyr",
          name: "Zephyr",
          srdMonsterSlug: "commoner",
          role: "ally",
          appearance:
            "A wiry teenage tiefling with lavender skin, small curved horns, and golden eyes that now burn with determination instead of anxiety. They still carry their satchel of maps.",
          personality: {
            traits: [
              "earnest and determined — the fear is still there but it no longer controls them",
              "has an encyclopedic knowledge of valdris's tunnel systems",
              "fiercely protective of the party",
            ],
            ideals: [
              "family is everything — blood or chosen",
              "even the smallest person can change the course of events",
            ],
            bonds: [
              "sera is among the kidnapped — they know it now with certainty",
              "considers the party their chosen family",
            ],
            flaws: [
              "reckless when sera's safety is at stake — will charge into danger without thinking",
              "emotional volatility increases as they get closer to sera",
            ],
          },
          motivations: [
            "save sera at any cost",
            "help the party navigate the ancient tunnels to the ritual chamber",
          ],
          secrets: [
            "sera was specifically targeted because she's a latent sorcerer — useful for the ritual",
          ],
          relationshipArc: {
            act1: "",
            act2: "",
            act3: "Reveals sera is among the kidnapped. Their personal stakes raise the emotional tension of the finale. If sera is saved, Zephyr's gratitude is boundless.",
          },
          dmNotes:
            "Zephyr's personal stakes make the finale emotional, not just mechanical. Their sibling sera is among the captives in the ritual chamber. Zephyr will rush to sera's circle regardless of danger — the party may need to protect them. If sera is saved, Zephyr's gratitude is the emotional capstone. If sera dies, it should be devastating. Zephyr is NOT a combat asset — they're a non-combatant who provides emotional weight and tunnel navigation.",
          voiceNotes:
            "Speaks with conviction now — the stammer is mostly gone. Uses party members' real names. When they see sera bound in the ritual circle, they scream and the stammer comes back full force.",
        },
        {
          id: "brother-caelum",
          name: "Brother Caelum",
          srdMonsterSlug: "priest",
          role: "neutral",
          appearance:
            "A gaunt human man in his sixties. If confronted with the truth, he looks like a man whose world has collapsed. His eyes are clear for the first time — the willful blindness is gone.",
          personality: {
            traits: [
              "speaks with sudden clarity and strength — as if a weight has been lifted",
              "genuinely remorseful for his complicity",
              "willing to sacrifice himself to help if given the chance",
            ],
            ideals: [
              "healing is sacred — and he failed that ideal",
              "it's never too late to do the right thing",
            ],
            bonds: [
              "lysara funded his hospital and used it as a front for arcane experiments",
              "the hospital is his life's work — and it's been corrupted",
            ],
            flaws: [
              "decades of willful blindness weigh heavily — he's fragile",
              "may freeze under pressure from guilt",
            ],
          },
          motivations: [
            "confess everything he knows and help the party stop lysara",
            "find some measure of redemption for enabling the kidnappings",
          ],
          secrets: [
            "lysara is the powerful benefactor who funded the hospital's expansion",
            "can provide a detailed layout of the hospital basement and lysara's schedule",
            "knows lysara murdered her own mentor to obtain the crimson accord scrolls",
          ],
          relationshipArc: {
            act1: "",
            act2: "",
            act3: "If confronted with evidence, breaks down and confesses everything. Can provide detailed layout of the basement and Lysara's schedule. May sacrifice himself to help the party if given the chance for redemption.",
          },
          dmNotes:
            "Caelum's confession is a major evidence source. He names Lysara as his benefactor and provides the basement layout. His guilt is genuine — he's a broken man seeking absolution. If the party treated him with compassion in Act 2, he volunteers information freely. If they threatened him, he's harder to reach but the truth pours out anyway.",
          voiceNotes:
            "His trembling voice is replaced by quiet clarity. When confessing, he speaks in measured, precise sentences. Weeps silently when describing what he heard from the basement.",
        },
      ],
      dmBriefing:
        "Act 3 is the payoff for everything built in Acts 1 and 2. The tone shifts from investigation to action — the party knows who the villain is and must stop her. Lysara's political maneuvering creates urgency: she's consolidating power above ground while completing the ritual below. The act rewards thorough investigation: evidence gathered in earlier acts determines council support, available allies determine combat advantages, and NPC relationships determine emotional payoffs. The temple descent should feel like entering another world — ancient, oppressive, and haunted by centuries of dark magic. The captive rescue is both a puzzle and an emotional climax (especially for Zephyr). The final battle should feel earned and climactic. Give Lysara genuine menace but also genuine conviction — she's a tragic villain, not a cackling maniac. The aftermath should let the party shape Valdris's future, giving weight to their choices throughout the campaign. Key ally availability: Aldric (if saved from poison), Mira (if redeemed after betrayal), Zephyr (always present but non-combatant), Caelum (provides information if confronted). The campaign's quality is measured by how much the players care about these NPCs by the end.",
    },
  ],
};
