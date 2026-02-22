"use client";

import { memo } from "react";
import {
  PlayerState,
  formatModifier,
  getModifier,
  getProficiencyBonus,
  formatAbilityDamage,
  toDisplayCase,
} from "../lib/gameTypes";

interface Props {
  player: PlayerState;
  onOpenFullSheet: () => void;
}

interface StatBlockProps {
  label: string;
  value: number;
}

function StatBlock({ label, value }: StatBlockProps) {
  const mod = getModifier(value);
  return (
    <div className="flex flex-col items-center bg-dungeon-mid border border-gold/20 rounded p-1.5">
      <span className="font-cinzel text-[11px] tracking-widest text-gold/70 uppercase">
        {label}
      </span>
      {/* Modifier is the hero — large and color-coded */}
      <span
        className={`font-cinzel text-2xl font-bold ${mod >= 0 ? "text-success" : "text-red-400"}`}
      >
        {formatModifier(mod)}
      </span>
      {/* Raw score is secondary */}
      <span className="font-cinzel text-xs text-parchment/40">{value}</span>
    </div>
  );
}

function CharacterSidebar({ player, onOpenFullSheet }: Props) {
  const prof = getProficiencyBonus(player.level);
  const hpPct = player.maxHP > 0 ? (player.currentHP / player.maxHP) * 100 : 0;
  const hpColor = hpPct > 50 ? "#5a9a5a" : hpPct > 25 ? "#d4a017" : "#dc4a4a";

  return (
    <div className="h-full flex flex-col card-parchment">
      {/* Header */}
      <div className="flex-shrink-0 bg-dungeon-light border-b border-gold-dark/40 px-4 py-3">
        <h2 className="font-cinzel text-gold tracking-widest uppercase text-base text-center">
          ✦ Character ✦
        </h2>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto scroll-pane px-4 py-4 space-y-4">
        {/* Identity */}
        <div className="text-center border-b border-gold-dark/20 pb-3">
          <div className="font-cinzel text-xl text-ink">{player.name}</div>
          <div className="font-crimson text-ink/60 italic text-lg mt-0.5">
            {toDisplayCase(player.race)} · {toDisplayCase(player.characterClass)} · Lv.{player.level}
          </div>
          {player.subclass && (
            <div className="font-crimson text-ink/50 italic text-base mt-0.5">
              {toDisplayCase(player.subclass)}
            </div>
          )}
        </div>

        {/* HP — prominent with color bar */}
        <section>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="font-cinzel text-sm tracking-widest text-gold-dark font-bold uppercase">
              Hit Points
            </span>
            <span
              className="font-cinzel text-xl font-bold"
              style={{ color: hpColor }}
            >
              {player.currentHP}
              <span className="text-ink/70 text-base font-normal">
                {" "}
                / {player.maxHP}
              </span>
            </span>
          </div>
          <div className="hp-bar w-full">
            <div
              className="hp-fill transition-all duration-500"
              style={{
                width: `${Math.min(100, hpPct)}%`,
                backgroundColor: hpColor,
              }}
            />
          </div>
        </section>

        {/* Combat stats row */}
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: "AC", value: String(player.armorClass) },
            { label: "Prof", value: formatModifier(prof) },
            { label: "Gold", value: `${player.gold}gp` },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="flex flex-col items-center bg-dungeon-mid border border-gold/20 rounded py-2 px-1"
            >
              <span className="font-cinzel text-xs tracking-widest text-gold/70 uppercase">
                {label}
              </span>
              <span className="font-cinzel text-lg font-bold text-parchment mt-0.5">
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Spell slots (casters only) */}
        {player.spellSlots && Object.keys(player.spellSlots).length > 0 && (
          <section>
            <h3 className="font-cinzel text-sm tracking-widest text-gold-dark font-bold uppercase mb-1.5">
              Spell Slots
            </h3>
            <div className="space-y-1">
              {Object.entries(player.spellSlots)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([lvl, total]) => {
                  const used = player.spellSlotsUsed?.[lvl] ?? 0;
                  const remaining = total - used;
                  return (
                    <div
                      key={lvl}
                      className="flex items-center justify-start gap-2"
                    >
                      <span className="font-cinzel text-xs text-gold-dark w-9">
                        Lvl {lvl}
                      </span>
                      <div className="flex gap-1">
                        {Array.from({ length: total }).map((_, i) => (
                          <span
                            key={i}
                            className={`w-3 h-3 rounded-full border ${
                              i < remaining
                                ? "bg-gold border-gold-dark"
                                : "bg-transparent border-gold/20"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        )}

        {/* XP bar */}
        <section>
          <div className="flex justify-between font-cinzel text-sm tracking-wide mb-1">
            <span className="text-gold-dark font-bold">
              XP {player.xp.toLocaleString()}
            </span>
            <span className="text-ink/60">
              {player.xpToNextLevel.toLocaleString()} → Lv.{player.level + 1}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-ink/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gold/70 transition-all duration-500"
              style={{
                width: `${Math.min(100, (player.xp / player.xpToNextLevel) * 100)}%`,
              }}
            />
          </div>
        </section>

        {/* Conditions */}
        {player.conditions.length > 0 && (
          <section>
            <h3 className="font-cinzel text-sm tracking-widest text-gold-dark font-bold uppercase mb-1.5">
              Conditions
            </h3>
            <div className="flex flex-wrap gap-1">
              {player.conditions.map((c) => (
                <span
                  key={c}
                  className="font-cinzel text-xs bg-red-100 text-red-700 border border-red-300 rounded px-1.5 py-0.5 uppercase tracking-wide"
                >
                  {toDisplayCase(c)}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Ability scores — modifier-first layout */}
        <section>
          <h3 className="font-cinzel text-gold-dark text-sm tracking-widest font-bold uppercase mb-2">
            Ability Scores
          </h3>
          <div className="grid grid-cols-3 gap-1.5">
            <StatBlock label="STR" value={player.stats.strength} />
            <StatBlock label="DEX" value={player.stats.dexterity} />
            <StatBlock label="CON" value={player.stats.constitution} />
            <StatBlock label="INT" value={player.stats.intelligence} />
            <StatBlock label="WIS" value={player.stats.wisdom} />
            <StatBlock label="CHA" value={player.stats.charisma} />
          </div>
        </section>

        {/* Inventory */}
        <section>
          <h3 className="font-cinzel text-gold-dark text-xs tracking-widest font-bold uppercase mb-1.5">
            Inventory
          </h3>
          {player.inventory.length === 0 ? (
            <p className="font-crimson italic text-ink/50 text-base">
              Nothing carried.
            </p>
          ) : (
            <ul className="space-y-1">
              {player.inventory.map((item, i) => {
                const weaponAbility = player.abilities?.find(a => a.type === "weapon" && a.name === item);
                const damage = weaponAbility
                  ? formatAbilityDamage(weaponAbility, player.stats)
                  : null;
                return (
                  <li
                    key={i}
                    className="font-crimson text-base text-ink/80 flex items-center gap-1.5"
                  >
                    <span className="text-gold/50 flex-shrink-0">◆</span>
                    <span className="truncate">{toDisplayCase(item)}</span>
                    {damage && (
                      <span className="ml-auto flex-shrink-0 font-cinzel text-[11px] text-amber-700 bg-amber-50 border border-amber-300/60 rounded px-1.5 py-0.5">
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

      {/* Sticky footer — Full Sheet button */}
      <div className="flex-shrink-0 border-t border-gold-dark/30 px-4 py-4">
        <button
          onClick={onOpenFullSheet}
          className="w-full font-cinzel text-base tracking-widest text-gold-dark uppercase
                     border-2 border-gold-dark/50 rounded-lg py-3
                     bg-gradient-to-b from-gold/10 to-gold/5
                     hover:from-gold/20 hover:to-gold/10 hover:border-gold-dark
                     shadow-sm hover:shadow-gold-glow
                     transition-all duration-200"
        >
          Full Character Sheet
        </button>
      </div>
    </div>
  );
}

export default memo(CharacterSidebar);
