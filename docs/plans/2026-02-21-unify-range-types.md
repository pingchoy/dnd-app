# Unify Range Types: Replace `weaponRange` + `srdRange` with a Single `range` Field

## Context

Currently, `Ability` has two separate range fields:
- `weaponRange?: WeaponRange` — structured range data (type/reach/shortRange/longRange), used for weapons
- `srdRange?: string` — raw SRD string ("120 feet", "Touch", "Self"), used for spells/cantrips

This means every consumer (CombatGrid, dashboard, combatEnforcement) must branch on ability type and handle two different formats. Unifying them into a single `range` field with an expanded type union eliminates this duplication.

## Design

Rename `WeaponRange` → `AbilityRange` and expand its `type` to include `"self"` and `"touch"`:

```typescript
export interface AbilityRange {
  type: "melee" | "ranged" | "both" | "self" | "touch";
  reach?: number;       // melee/touch reach in feet (default 5)
  shortRange?: number;  // normal range in feet for ranged/thrown
  longRange?: number;   // max range (disadvantage beyond short)
}
```

On `Ability`: replace `srdRange` + `weaponRange` with `range?: AbilityRange`.
On `WeaponStat`: change `range?: WeaponRange` → `range?: AbilityRange` (field name stays the same).

## Files to Modify

### 1. `src/app/lib/gameTypes.ts`
- Rename `WeaponRange` → `AbilityRange`, add `"self" | "touch"` to the type union
- On `Ability`: remove `srdRange` and `weaponRange`, add `range?: AbilityRange`
- On `WeaponStat`: change type annotation from `WeaponRange` to `AbilityRange`

### 2. `src/app/lib/combatEnforcement.ts`
- Update imports: `WeaponRange` → `AbilityRange`
- `parseWeaponRange()`: return type → `AbilityRange` (values unchanged, already returns melee/ranged/both)
- `parseSpellRange()`: change return type to `AbilityRange` (map self→`{type:"self"}`, touch→`{type:"touch",reach:5}`, ranged→`{type:"ranged",shortRange:feet}`)
- `validateAttackRange()`: param type → `AbilityRange`, add `case "self"` and `case "touch"` branches
- Remove `checkSpellRange()` — its callers will use `validateAttackRange()` instead

### 3. `src/app/hooks/useCharacterCreation.ts`
- Weapon abilities: `weaponRange: ws.range` → `range: ws.range`
- Cantrip/spell abilities: replace `srdRange: spell?.range` with `range: parseSpellRange(spell?.range)` where `parseSpellRange` returns `AbilityRange`
- Import `parseSpellRange` from combatEnforcement (or inline the conversion)

### 4. `src/app/components/CombatGrid.tsx`
- `abilityRangeTag()`: read `ability.range` instead of branching on `weaponRange` / `srdRange`
- Range overlay drawing (~line 375): read `ability.range` directly
- Targeting highlight (~line 444): read `ability.range` directly, use `validateAttackRange`

### 5. `src/app/dashboard/page.tsx`
- `handleTargetSelected()`: replace the weapon/spell branch with a single `validateAttackRange(playerPos, npcPos, selectedAbility.range)` call

### 6. `scripts/seedFirestore.ts`
- No changes needed — seed data uses `WeaponStat.range` which just changes its type annotation, and the values (`{type:"melee",reach:5}` etc.) are already valid `AbilityRange` shapes.

## Verification
- `npx tsc --noEmit` — confirm no type errors
- `npm run build` — confirm production build succeeds
- Manual: character creation, combat targeting, and range display should work unchanged
