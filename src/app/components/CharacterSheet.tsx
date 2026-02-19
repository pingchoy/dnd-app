"use client";

import MarkdownProse from "./MarkdownProse";
import { PlayerState, getModifier, getProficiencyBonus, formatWeaponDamage } from "../lib/gameTypes";


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

function fmt(n: number) {
  return n >= 0 ? `+${n}` : `${n}`;
}

function StatBlock({ label, value }: { label: string; value: number }) {
  const mod = getModifier(value);
  return (
    <div className="flex flex-col items-center bg-dungeon-mid border border-gold/20 rounded p-2">
      <span className="font-cinzel text-[10px] tracking-widest text-gold/70 uppercase">{label}</span>
      <span className="font-cinzel text-2xl text-parchment mt-0.5">{value}</span>
      <span className={`font-cinzel text-sm font-bold ${mod >= 0 ? "text-green-400" : "text-red-400"}`}>
        {fmt(mod)}
      </span>
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
      <div className="flex-shrink-0 bg-dungeon-light border-b border-gold-dark/40 px-4 py-3">
        <h2 className="font-cinzel text-gold tracking-widest uppercase text-xs text-center">
          ✦ Character Sheet ✦
        </h2>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto scroll-pane px-4 py-4 space-y-4">
        {/* Identity */}
        <div className="text-center border-b border-gold-dark/20 pb-3">
          <div className="font-cinzel text-lg text-ink">{player.name}</div>
          <div className="font-crimson text-ink/60 italic text-sm mt-0.5">
            {player.race} • {player.characterClass} • Lv.{player.level}
          </div>
          <div className="flex justify-center gap-4 mt-2 font-cinzel text-[11px] tracking-wide flex-wrap">
            <span>
              HP{" "}
              <span className={`font-bold ${
                player.currentHP / player.maxHP > 0.5 ? "text-green-600"
                : player.currentHP / player.maxHP > 0.25 ? "text-yellow-600"
                : "text-red-600"
              }`}>
                {player.currentHP}/{player.maxHP}
              </span>
            </span>
            <span>AC <strong>{player.armorClass}</strong></span>
            <span>Prof <strong>{fmt(prof)}</strong></span>
            <span>Gold <strong>{player.gold}gp</strong></span>
          </div>
          {/* XP bar */}
          <div className="mt-3">
            <div className="flex justify-between font-cinzel text-[10px] tracking-wide mb-1">
              <span className="text-gold-dark font-bold">XP {player.xp.toLocaleString()}</span>
              <span className="text-ink/50">{player.xpToNextLevel.toLocaleString()} → Lv.{player.level + 1}</span>
            </div>
            <div className="h-2 rounded-full bg-ink/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gold/70 transition-all duration-500"
                style={{ width: `${Math.min(100, (player.xp / player.xpToNextLevel) * 100)}%` }}
              />
            </div>
          </div>
          {player.conditions.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-center gap-1">
              {player.conditions.map((c) => (
                <span key={c} className="font-cinzel text-[9px] bg-red-100 text-red-700 border border-red-300 rounded px-1.5 py-0.5 uppercase tracking-wide">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Ability scores */}
        <section>
          <h3 className="font-cinzel text-gold-dark text-[10px] tracking-widest uppercase mb-2">Ability Scores</h3>
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
          <h3 className="font-cinzel text-gold-dark text-[10px] tracking-widest uppercase mb-1.5">Saving Throws</h3>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {(["strength","dexterity","constitution","intelligence","wisdom","charisma"] as const).map((ability) => {
              const isProficient = player.savingThrowProficiencies.some(
                (s) => s.toLowerCase() === ability,
              );
              const mod = getModifier(player.stats[ability]) + (isProficient ? prof : 0);
              return (
                <div key={ability} className="flex items-center gap-1 font-crimson text-xs text-ink/80">
                  <span className={`w-2.5 h-2.5 rounded-full border flex-shrink-0 ${isProficient ? "bg-gold border-gold-dark" : "border-ink/30"}`} />
                  <span className="capitalize">{ability.slice(0, 3)}</span>
                  <span className={`ml-auto font-bold ${mod >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(mod)}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Skills */}
        <section>
          <h3 className="font-cinzel text-gold-dark text-[10px] tracking-widest uppercase mb-1.5">Skills</h3>
          <div className="space-y-0.5">
            {allSkills.map(([skill, ability]) => {
              const isProficient = player.skillProficiencies.some(
                (s) => s.toLowerCase() === skill.toLowerCase(),
              );
              const mod = getModifier(player.stats[ability]) + (isProficient ? prof : 0);
              return (
                <div key={skill} className="flex items-center gap-1 font-crimson text-xs text-ink/80">
                  <span className={`w-2.5 h-2.5 rounded-full border flex-shrink-0 ${isProficient ? "bg-gold border-gold-dark" : "border-ink/30"}`} />
                  <span className="truncate">{skill}</span>
                  <span className="text-ink/40 text-[9px] ml-0.5 flex-shrink-0">({ability.slice(0, 3).toUpperCase()})</span>
                  <span className={`ml-auto font-bold flex-shrink-0 ${mod >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(mod)}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Features */}
        <section>
          <h3 className="font-cinzel text-gold-dark text-[10px] tracking-widest uppercase mb-1.5">Features & Traits</h3>
          <div className="space-y-2">
            {player.features.map((f) => (
              <div key={f.name}>
                <div className="flex items-baseline gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${
                    f.type === "active" ? "bg-gold" : f.type === "reaction" ? "bg-amber-500" : "bg-ink/30"
                  }`} />
                  <span className="font-cinzel text-[10px] text-ink">{f.name}</span>
                  <span className="font-crimson text-[9px] text-ink/40 italic ml-auto flex-shrink-0">{f.source}</span>
                </div>
                <MarkdownProse className="font-crimson text-[10px] text-ink/60 pl-3 prose-strong:text-ink/80 prose-em:text-ink/70 prose-p:my-0.5">
                  {f.description}
                </MarkdownProse>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-2 font-cinzel text-[8px] text-ink/30 tracking-wide">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gold inline-block"/>Active</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"/>Reaction</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-ink/30 inline-block"/>Passive</span>
          </div>
        </section>

        {/* Inventory */}
        <section>
          <h3 className="font-cinzel text-gold-dark text-[10px] tracking-widest uppercase mb-1.5">Inventory</h3>
          {player.inventory.length === 0 ? (
            <p className="font-crimson italic text-ink/40 text-xs">Nothing carried.</p>
          ) : (
            <ul className="space-y-0.5">
              {player.inventory.map((item, i) => {
                const weaponStat = player.weaponDamage[item];
                const damage = weaponStat ? formatWeaponDamage(weaponStat, player.stats) : null;
                return (
                  <li key={i} className="font-crimson text-xs text-ink/80 flex items-center gap-1.5">
                    <span className="text-gold/50 flex-shrink-0">◆</span>
                    <span className="truncate">{item}</span>
                    {damage && (
                      <span className="ml-auto flex-shrink-0 font-cinzel text-[9px] text-amber-700 bg-amber-50 border border-amber-300/60 rounded px-1 py-0.5">
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
    </div>
  );
}
