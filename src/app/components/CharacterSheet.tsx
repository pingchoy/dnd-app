"use client";

import { useState, useMemo } from "react";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import MarkdownProse from "./MarkdownProse";
import SpellTag from "./SpellTag";
import { PlayerState, formatModifier, getModifier, getProficiencyBonus, formatAbilityDamage, toDisplayCase, HIDDEN_RACIAL_TRAITS, LORE_RACIAL_TRAITS } from "../lib/gameTypes";

/** Pluralize D&D race names for display headings. */
const RACE_PLURALS: Record<string, string> = {
  elf: "elves", dwarf: "dwarves", halfling: "halflings", gnome: "gnomes",
  human: "humans", tiefling: "tieflings", dragonborn: "dragonborn",
  "half-elf": "half-elves", "half-orc": "half-orcs",
};

function pluralizeRace(race: string): string {
  return toDisplayCase(RACE_PLURALS[race.toLowerCase()] ?? race + "s");
}


const SKILL_ABILITIES: Record<string, keyof PlayerState["stats"]> = {
  Acrobatics:        "dexterity",
  "Animal Handling": "wisdom",
  Arcana:            "intelligence",
  Athletics:         "strength",
  Deception:         "charisma",
  History:           "intelligence",
  Insight:           "wisdom",
  Intimidation:      "charisma",
  Investigation:     "intelligence",
  Medicine:          "wisdom",
  Nature:            "intelligence",
  Perception:        "wisdom",
  Performance:       "charisma",
  Persuasion:        "charisma",
  Religion:          "intelligence",
  "Sleight of Hand": "dexterity",
  Stealth:           "dexterity",
  Survival:          "wisdom",
  "Thieves' Tools":  "dexterity",
};


interface SectionHeadingProps {
  children: React.ReactNode;
}

function SectionHeading({ children }: SectionHeadingProps) {
  return (
    <h3 className="font-cinzel text-gold-dark text-sm tracking-widest uppercase mb-2 border-b border-gold-dark/20 pb-1">
      {children}
    </h3>
  );
}

interface StatBlockProps {
  label: string;
  value: number;
}

function StatBlock({ label, value }: StatBlockProps) {
  const mod = getModifier(value);
  return (
    <div className="flex flex-col items-center bg-dungeon-mid border border-gold/20 rounded p-2">
      <span className="font-cinzel text-sm tracking-widest text-gold uppercase">{label}</span>
      <span className="font-cinzel text-2xl text-parchment mt-0.5">{value}</span>
      <span className={`font-cinzel text-sm font-bold ${mod >= 0 ? "text-success" : "text-red-400"}`}>
        {formatModifier(mod)}
      </span>
    </div>
  );
}

type Feature = PlayerState["features"][number];

interface FeatureListProps {
  features: Feature[];
}

function RacialTraits({ features }: FeatureListProps) {
  if (features.length === 0) return null;
  return (
    <section>
      <SectionHeading>Racial Traits</SectionHeading>
      <div className="space-y-4">
        {features.map((f) => (
          <div key={f.name}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                f.type === "active" ? "bg-gold" : f.type === "reaction" ? "bg-amber-500" : "bg-ink/40"
              }`} />
              <span className="font-cinzel text-sm text-ink font-semibold">{toDisplayCase(f.name)}</span>
            </div>
            {f.description && (
              <MarkdownProse className="font-crimson text-sm text-ink/80 prose-strong:text-ink prose-em:text-ink/90 prose-p:my-0.5 leading-snug pl-4">
                {f.description}
              </MarkdownProse>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ClassFeatures({ features }: FeatureListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (features.length === 0) return null;

  const toggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <section>
      <SectionHeading>Class Features</SectionHeading>
      <div className="space-y-1">
        {features.map((f) => {
          const isOpen = expanded.has(f.name);
          return (
            <div key={f.name} className="rounded border border-transparent hover:border-gold-dark/10 transition-colors">
              <button
                onClick={() => f.description && toggle(f.name)}
                className="flex items-center gap-2 w-full text-left rounded px-1 py-1 hover:bg-ink/5 transition-colors"
              >
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  f.type === "active" ? "bg-gold" : f.type === "reaction" ? "bg-amber-500" : "bg-ink/40"
                }`} />
                <span className="font-cinzel text-sm text-ink font-semibold">{toDisplayCase(f.name)}</span>
                {f.chosenOption && (
                  <span className="font-crimson text-sm text-gold-dark italic ml-1">— {toDisplayCase(f.chosenOption)}</span>
                )}
                {f.description && (
                  <span className={`ml-auto mr-2 text-ink/40 text-xs flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}>
                    ▶
                  </span>
                )}
              </button>
              {isOpen && f.description && (
                <div className="pl-5 pr-2 pb-2 pt-1">
                  <MarkdownProse className="font-crimson text-sm text-ink/85 prose-strong:text-ink prose-em:text-ink/90 prose-p:my-0.5 leading-snug">
                    {f.description}
                  </MarkdownProse>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-3 font-cinzel text-sm text-ink/50 tracking-wide">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gold inline-block"/>Active</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"/>Reaction</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-ink/40 inline-block"/>Passive</span>
      </div>
    </section>
  );
}

interface RightColumnTabsProps {
  player: PlayerState;
  allSkills: [string, keyof PlayerState["stats"]][];
  prof: number;
}

function RightColumnTabs({ player, allSkills, prof }: RightColumnTabsProps) {
  const isCaster = !!player.spellcastingAbility;

  const loreFeatures = useMemo(
    () => player.features.filter(
      (f) => (f.source?.toLowerCase() === player.race.toLowerCase() || f.level === 0)
        && LORE_RACIAL_TRAITS.has(f.name.toLowerCase())
        && f.description,
    ),
    [player.features, player.race],
  );

  const tabs = useMemo(() => {
    const list: { label: string; key: string }[] = [
      { label: "Stats & Traits", key: "stats" },
      { label: "Class Features", key: "class" },
    ];
    if (isCaster) list.push({ label: "Spellcasting", key: "spells" });
    if (loreFeatures.length > 0) list.push({ label: `About ${pluralizeRace(player.race)}`, key: "lore" });
    return list;
  }, [isCaster, loreFeatures.length, player.race]);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <TabGroup className="flex-1 flex flex-col overflow-hidden">
        <TabList className="flex-shrink-0 flex gap-1 border-b border-gold-dark/20 px-5 pt-3">
          {tabs.map((t) => (
            <Tab
              key={t.key}
              className="font-cinzel text-sm tracking-wide px-3 py-2 -mb-px border-b-2 outline-none transition-colors
                data-[selected]:text-gold data-[selected]:border-gold
                text-ink/50 border-transparent hover:text-ink/80 cursor-pointer"
            >
              {t.label}
            </Tab>
          ))}
        </TabList>

        <TabPanels className="flex-1 overflow-y-auto scroll-pane">
          {/* Tab 1: Stats & Traits */}
          <TabPanel className="px-5 py-4 space-y-5">
            {/* Skills */}
            <section>
              <SectionHeading>Skills</SectionHeading>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {allSkills.map(([skill, ability]) => {
                  const isProficient = player.skillProficiencies.some(
                    (s) => s.toLowerCase() === skill.toLowerCase(),
                  );
                  const mod = getModifier(player.stats[ability]) + (isProficient ? prof : 0);
                  return (
                    <div key={skill} className="flex items-center gap-1.5 font-crimson text-sm text-ink/90">
                      <span className={`w-3 h-3 rounded-full border flex-shrink-0 ${isProficient ? "bg-gold border-gold-dark" : "border-ink/40"}`} />
                      <span className="truncate">{skill}</span>
                      <span className="text-ink/50 text-sm ml-0.5 flex-shrink-0">({ability.slice(0, 3).toUpperCase()})</span>
                      <span className={`ml-auto font-bold flex-shrink-0 ${mod >= 0 ? "text-success-dark" : "text-red-700"}`}>{formatModifier(mod)}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Proficiencies */}
            <section>
              <SectionHeading>Proficiencies</SectionHeading>
              <div className="space-y-2">
                <div>
                  <span className="font-cinzel text-sm text-ink/50 tracking-wide">Weapons: </span>
                  <span className="font-crimson text-sm text-ink/90">
                    {(player.weaponProficiencies ?? []).length > 0
                      ? (player.weaponProficiencies ?? []).map(toDisplayCase).join(", ")
                      : "None"}
                  </span>
                </div>
                <div>
                  <span className="font-cinzel text-sm text-ink/50 tracking-wide">Armor: </span>
                  <span className="font-crimson text-sm text-ink/90">
                    {(player.armorProficiencies ?? []).length > 0
                      ? (player.armorProficiencies ?? []).map(toDisplayCase).join(", ")
                      : "None"}
                  </span>
                </div>
              </div>
            </section>

            <RacialTraits
              features={player.features.filter(
                (f) => (f.source?.toLowerCase() === player.race.toLowerCase() || f.level === 0)
                  && !HIDDEN_RACIAL_TRAITS.has(f.name.toLowerCase())
                  && !LORE_RACIAL_TRAITS.has(f.name.toLowerCase())
              )}
            />
          </TabPanel>

          {/* Tab 2: Class Features */}
          <TabPanel className="px-5 py-4 space-y-5">
            <ClassFeatures
              features={player.features.filter(
                (f) => f.source?.toLowerCase() !== player.race.toLowerCase() && f.level !== 0
              )}
            />
          </TabPanel>

          {/* Tab 3: Spellcasting (only rendered for casters) */}
          {isCaster && (
            <TabPanel className="px-5 py-4 space-y-5">
              <section>
                <SectionHeading>Spellcasting</SectionHeading>
                <div className="space-y-3">
                  <div className="flex gap-4 font-crimson text-sm text-ink/90">
                    <span>
                      Ability:{" "}
                      <strong className="capitalize">{toDisplayCase(player.spellcastingAbility!)}</strong>
                    </span>
                    <span>
                      Save DC:{" "}
                      <strong>
                        {8 + prof + getModifier(player.stats[player.spellcastingAbility!])}
                      </strong>
                    </span>
                    <span>
                      Spell Attack:{" "}
                      <strong>
                        {formatModifier(prof + getModifier(player.stats[player.spellcastingAbility!]))}
                      </strong>
                    </span>
                  </div>

                  {player.cantrips && player.cantrips.length > 0 && (
                    <div>
                      <div className="font-cinzel text-sm text-ink/60 tracking-wide mb-1">
                        Cantrips ({player.cantrips.length}/{player.maxCantrips ?? player.cantrips.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {player.cantrips.map((c) => (
                          <SpellTag
                            key={c}
                            name={c}
                            className="font-crimson text-sm bg-dungeon-mid text-parchment/80 border border-gold/30 rounded px-2 py-0.5"
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {player.preparedSpells && player.preparedSpells.length > 0 && (
                    <div>
                      <div className="font-cinzel text-sm text-ink/60 tracking-wide mb-1">
                        Prepared Spells ({player.preparedSpells.length}/{player.maxPreparedSpells ?? player.preparedSpells.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {player.preparedSpells.map((s) => (
                          <SpellTag
                            key={s}
                            name={s}
                            className="font-crimson text-sm bg-dungeon-mid text-gold-light border border-gold/40 rounded px-2 py-0.5 shadow-sm shadow-gold/10"
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {player.knownSpells && player.knownSpells.length > 0 && !player.preparedSpells?.length && (
                    <div>
                      <div className="font-cinzel text-sm text-ink/60 tracking-wide mb-1">
                        Spells ({player.knownSpells.length}/{player.maxKnownSpells ?? player.knownSpells.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {player.knownSpells.map((s) => (
                          <SpellTag
                            key={s}
                            name={s}
                            className="font-crimson text-sm bg-dungeon-mid text-gold-light border border-gold/40 rounded px-2 py-0.5 shadow-sm shadow-gold/10"
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {player.spellSlots && Object.keys(player.spellSlots).length > 0 && (
                    <div>
                      <div className="font-cinzel text-sm text-ink/60 tracking-wide mb-1">
                        Spell Slots
                      </div>
                      <div className="space-y-1">
                        {Object.entries(player.spellSlots)
                          .sort(([a], [b]) => Number(a) - Number(b))
                          .map(([lvl, total]) => {
                            const used = player.spellSlotsUsed?.[lvl] ?? 0;
                            const remaining = total - used;
                            return (
                              <div key={lvl} className="flex items-center gap-2">
                                <span className="font-cinzel text-sm text-ink/50 w-8">
                                  Lv{lvl}
                                </span>
                                <div className="flex gap-1">
                                  {Array.from({ length: total }).map((_, i) => (
                                    <span
                                      key={i}
                                      className={`w-4 h-4 rounded-full border-2 ${
                                        i < remaining
                                          ? "bg-gold border-gold-dark"
                                          : "bg-transparent border-ink/20"
                                      }`}
                                    />
                                  ))}
                                </div>
                                <span className="font-crimson text-sm text-ink/40 ml-1">
                                  {remaining}/{total}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </TabPanel>
          )}

          {/* Tab 4: About {Race} (only rendered when lore features exist) */}
          {loreFeatures.length > 0 && (
            <TabPanel className="px-5 py-4 space-y-5">
              <section>
                <SectionHeading>About {pluralizeRace(player.race)}</SectionHeading>
                <div className="space-y-3">
                  {loreFeatures.map((f) => (
                    <div key={f.name}>
                      <span className="font-cinzel text-xs text-ink/50 tracking-wide uppercase">
                        {toDisplayCase(f.name)}
                      </span>
                      <p className="font-crimson text-sm text-ink/70 leading-relaxed mt-0.5">
                        {f.description}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </TabPanel>
          )}
        </TabPanels>
      </TabGroup>
    </div>
  );
}

interface Props {
  player: PlayerState;
}

export default function CharacterSheet({ player }: Props) {
  const prof = getProficiencyBonus(player.level);
  const allSkills = Object.entries(SKILL_ABILITIES).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="h-full flex flex-col card-parchment">
      {/* Header */}
      <div className="flex-shrink-0 bg-dungeon-light border-b border-gold-dark/40 px-6 py-3">
        <div className="text-center">
          <div className="font-cinzel text-xl text-parchment">{player.name}</div>
          <div className="font-crimson text-parchment/70 italic text-base mt-0.5">
            {toDisplayCase(player.race)} • {toDisplayCase(player.characterClass)} • Level {player.level}
          </div>
        </div>
        <div className="flex justify-center gap-5 mt-2 font-cinzel text-sm tracking-wide text-parchment flex-wrap">
          <span>
            HP{" "}
            <span className={`font-bold ${
              player.currentHP / player.maxHP > 0.5 ? "text-success"
              : player.currentHP / player.maxHP > 0.25 ? "text-yellow-400"
              : "text-red-400"
            }`}>
              {player.currentHP}/{player.maxHP}
            </span>
          </span>
          <span>AC <strong className="text-gold-light">{player.armorClass}</strong></span>
          <span>Prof <strong className="text-gold-light">{formatModifier(prof)}</strong></span>
          <span>Gold <strong className="text-gold-light">{player.gold}gp</strong></span>
        </div>
        {/* XP bar */}
        <div className="mt-2 px-4">
          <div className="flex justify-between font-cinzel text-sm tracking-wide mb-1 text-parchment/70">
            <span className="text-gold font-bold">XP {player.xp.toLocaleString()}</span>
            <span>{player.xpToNextLevel.toLocaleString()} → Lv.{player.level + 1}</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gold/70 transition-all duration-500"
              style={{ width: `${Math.min(100, (player.xp / player.xpToNextLevel) * 100)}%` }}
            />
          </div>
        </div>
        {player.conditions.length > 0 && (
          <div className="mt-2 flex flex-wrap justify-center gap-1">
            {player.conditions.map((c) => (
              <span key={c} className="font-cinzel text-sm bg-red-100 text-red-700 border border-red-300 rounded px-2 py-0.5 uppercase tracking-wide">
                {toDisplayCase(c)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Two-column body */}
      <div className="flex-1 overflow-hidden flex">

        {/* ── Left column: compact stats ── */}
        <div className="w-72 flex-shrink-0 overflow-y-auto scroll-pane px-4 py-4 space-y-5 border-r border-gold-dark/20">

          {/* Ability scores */}
          <section>
            <SectionHeading>Ability Scores</SectionHeading>
            <div className="grid grid-cols-3 gap-1.5">
              <StatBlock label="STR" value={player.stats.strength} />
              <StatBlock label="DEX" value={player.stats.dexterity} />
              <StatBlock label="CON" value={player.stats.constitution} />
              <StatBlock label="INT" value={player.stats.intelligence} />
              <StatBlock label="WIS" value={player.stats.wisdom} />
              <StatBlock label="CHA" value={player.stats.charisma} />
            </div>
          </section>

          {/* Saving throws */}
          <section>
            <SectionHeading>Saving Throws</SectionHeading>
            <div className="space-y-1">
              {(["strength","dexterity","constitution","intelligence","wisdom","charisma"] as const).map((ability) => {
                const isProficient = player.savingThrowProficiencies.some(
                  (s) => s.toLowerCase() === ability,
                );
                const mod = getModifier(player.stats[ability]) + (isProficient ? prof : 0);
                return (
                  <div key={ability} className="flex items-center gap-2 font-crimson text-sm text-ink/90">
                    <span className={`w-3 h-3 rounded-full border flex-shrink-0 ${isProficient ? "bg-gold border-gold-dark" : "border-ink/40"}`} />
                    <span className="capitalize">{ability}</span>
                    <span className={`ml-auto font-bold ${mod >= 0 ? "text-success-dark" : "text-red-700"}`}>{formatModifier(mod)}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Inventory */}
          <section>
            <SectionHeading>Inventory</SectionHeading>
            {player.inventory.length === 0 ? (
              <p className="font-crimson italic text-ink/60 text-sm">Nothing carried.</p>
            ) : (
              <ul className="space-y-1.5">
                {player.inventory.map((item, i) => {
                  const weaponAbility = player.abilities?.find(a => a.type === "weapon" && a.name === item);
                  const damage = weaponAbility ? formatAbilityDamage(weaponAbility, player.stats) : null;
                  return (
                    <li key={i} className="font-crimson text-sm text-ink/90 flex items-center gap-1.5">
                      <span className="text-gold-dark flex-shrink-0">◆</span>
                      <span className="truncate">{toDisplayCase(item)}</span>
                      {damage && (
                        <span className="ml-auto flex-shrink-0 font-cinzel text-sm text-amber-800 bg-amber-50 border border-amber-300/60 rounded px-1.5 py-0.5">
                          {damage}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* ── Right column: tabbed sections ── */}
        <RightColumnTabs player={player} allSkills={allSkills} prof={prof} />
      </div>
    </div>
  );
}
