# Friendly NPCs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add friendly NPCs that travel with the party, fight alongside them in combat (attacking hostile NPCs), appear in the UI sidebar and combat grid, and can be dismissed by the DM agent.

**Architecture:** Friendly NPCs reuse the existing NPC type and creation flow. Combat resolution is extended: friendly NPCs get turns where they attack random hostile NPCs using the same pre-roll + narration pipeline. The DM agent introduces them via `npcs_to_create` (already supported) and dismisses them via a new `npcs_to_dismiss` field. Hostile NPCs can randomly target friendly NPCs instead of always targeting the player.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Anthropic Claude SDK (Haiku for narration)

---

### Task 1: Add `npcs_to_dismiss` to StateChanges and tool schemas

**Files:**
- Modify: `src/app/lib/gameState.ts:630` (StateChanges interface)
- Modify: `src/app/agents/tools.ts:161-208` (UPDATE_GAME_STATE_TOOL schema)

**Step 1: Add `npcs_to_dismiss` to the StateChanges interface**

In `src/app/lib/gameState.ts`, after line 630 (`npcs_to_create`), add:

```typescript
  /** NPC IDs to remove from the scene (friendly/neutral NPCs departing). */
  npcs_to_dismiss?: string[];
```

**Step 2: Add `npcs_to_dismiss` to the DM tool schema**

In `src/app/agents/tools.ts`, after the `npcs_to_create` block (after line 161, before `milestone`), add:

```typescript
      npcs_to_dismiss: {
        type: "array",
        description:
          "IDs of friendly or neutral NPCs to remove from the party. Use [id=...] from the NPC list. The NPC departs the scene narratively.",
        items: { type: "string" },
      },
```

**Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 4: Commit**

```bash
git add src/app/lib/gameState.ts src/app/agents/tools.ts
git commit -m "feat: add npcs_to_dismiss to StateChanges and tool schema"
```

---

### Task 2: Add `npcs_to_dismiss` post-processing in chat route

**Files:**
- Modify: `src/app/api/chat/route.ts:401-402` (after npcs_to_create processing)
- Modify: `src/app/lib/gameState.ts:970-1064` (updateNPC — already supports remove_from_scene)

**Step 1: Add dismissal post-processing**

In `src/app/api/chat/route.ts`, after line 401 (`delete dmResult.stateChanges.npcs_to_create;`), add:

```typescript
  // Dismiss friendly/neutral NPCs the DM wants to remove from the party
  if (dmResult.stateChanges?.npcs_to_dismiss?.length) {
    const enc = getEncounter();
    if (enc) {
      for (const npcId of dmResult.stateChanges.npcs_to_dismiss) {
        const result = updateNPC({ id: npcId, remove_from_scene: true });
        console.log(`[NPC Dismiss] Removed "${result.name}" (found=${result.found}, removed=${result.removed})`);
      }
    }
    delete dmResult.stateChanges.npcs_to_dismiss;
  }
```

Ensure `updateNPC` is imported at the top of the file. Check existing imports — it's likely already imported from `../../lib/gameState`.

**Step 2: Also handle dismissal in mergeStateChanges**

In `src/app/lib/gameState.ts`, find the `mergeStateChanges` function (around line 652). Add merging logic for the new field. Follow the same pattern used for `npcs_to_create` — concatenate the arrays:

```typescript
  if (b.npcs_to_dismiss?.length) {
    merged.npcs_to_dismiss = [
      ...(merged.npcs_to_dismiss ?? []),
      ...b.npcs_to_dismiss,
    ];
  }
```

**Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 4: Commit**

```bash
git add src/app/api/chat/route.ts src/app/lib/gameState.ts
git commit -m "feat: post-process npcs_to_dismiss in chat route"
```

---

### Task 3: Add `resolveFriendlyNPCTurn` to combatResolver

**Files:**
- Modify: `src/app/lib/combatResolver.ts:69-76` (near NPCTurnResult)
- Modify: `src/app/lib/combatResolver.ts:370-392` (near resolveNPCTurn)

**Step 1: Add FriendlyNPCTurnResult type**

After the existing `NPCTurnResult` interface (line 76), add:

```typescript
export interface FriendlyNPCTurnResult extends NPCTurnResult {
  /** The hostile NPC that was targeted. */
  targetId: string;
  targetName: string;
  targetAC: number;
}
```

**Step 2: Add `resolveFriendlyNPCTurn` function**

After the existing `resolveNPCTurn` function (after line 392), add:

```typescript
/**
 * Resolve a friendly NPC's attack against a random hostile NPC.
 * Same math as resolveNPCTurn, but targets a hostile instead of the player.
 */
export function resolveFriendlyNPCTurn(
  npc: NPC,
  hostileNPCs: NPC[],
): FriendlyNPCTurnResult | null {
  const livingHostiles = hostileNPCs.filter(h => h.currentHp > 0 && h.disposition === "hostile");
  if (livingHostiles.length === 0) return null;

  // Pick a random living hostile as target
  const target = livingHostiles[Math.floor(Math.random() * livingHostiles.length)];

  const d20 = rollD20();
  const attackTotal = d20 + npc.attackBonus;
  const isNat1 = d20 === 1;
  const isNat20 = d20 === 20;
  const hit = isNat1 ? false : isNat20 ? true : attackTotal >= target.ac;

  let damage = 0;
  if (hit) {
    let diceExpr = npc.damageDice;
    if (isNat20) {
      diceExpr = doubleDice(diceExpr);
    }
    const roll = rollDice(diceExpr);
    damage = roll.total + npc.damageBonus;
    if (damage < 0) damage = 0;
  }

  return {
    npcId: npc.id,
    npcName: npc.name,
    d20,
    attackTotal,
    hit,
    damage,
    targetId: target.id,
    targetName: target.name,
    targetAC: target.ac,
  };
}
```

**Step 3: Add `resolveHostileNPCTurn` for hostile NPC targeting**

Hostile NPCs should sometimes target friendly NPCs instead of always targeting the player. Add after the friendly function:

```typescript
/**
 * Pick a target for a hostile NPC: randomly choose between the player
 * and any living friendly NPCs. Returns "player" or a friendly NPC id.
 */
export function pickHostileTarget(
  friendlyNPCs: NPC[],
): { type: "player" } | { type: "npc"; npc: NPC } {
  const livingFriendlies = friendlyNPCs.filter(
    n => n.currentHp > 0 && n.disposition === "friendly",
  );
  if (livingFriendlies.length === 0) return { type: "player" };

  // Equal chance for each possible target (player + each friendly NPC)
  const totalTargets = 1 + livingFriendlies.length;
  const roll = Math.floor(Math.random() * totalTargets);
  if (roll === 0) return { type: "player" };
  return { type: "npc", npc: livingFriendlies[roll - 1] };
}
```

**Step 4: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 5: Commit**

```bash
git add src/app/lib/combatResolver.ts
git commit -m "feat: add resolveFriendlyNPCTurn and pickHostileTarget"
```

---

### Task 4: Generalize `narrateNPCTurn` to support any target

**Files:**
- Modify: `src/app/agents/turnNarrator.ts:171-216`

**Step 1: Add a target parameter to `narrateNPCTurn`**

Change the function signature to accept a generic target instead of hardcoded player params. Add an optional `targetInfo` parameter so existing callers (hostile NPC narration targeting the player) don't break:

```typescript
interface NarrationTarget {
  name: string;
  currentHP: number;
  maxHP: number;
}

export async function narrateNPCTurn(
  npc: NPC,
  npcResult: NPCTurnResult,
  targetName: string,
  targetCurrentHP: number,
  targetMaxHP: number,
  location: string,
): Promise<TurnNarrationResult> {
```

The signature stays identical — the existing parameters (`playerName`, `playerCurrentHP`, `playerMaxHP`) already work generically. Just rename them in the body for clarity is optional, but functionally it already works because the prompt just uses string interpolation with whatever name is passed. **No code change is needed** — the function is already generic enough. When we call it for friendly NPCs, we'll pass the hostile NPC's name and HP instead of the player's.

**Step 2: Verify no change needed — confirm the function body uses the parameter names generically**

Read `turnNarrator.ts:178-190` and confirm it just interpolates `playerName`, `playerCurrentHP`, `playerMaxHP` into the prompt string. It does — so we can pass any target's name/HP as those args.

**Step 3: Commit (skip if no changes needed)**

No commit needed for this task — the function is already generic.

---

### Task 5: Integrate friendly NPC turns into the combat resolve loop

**Files:**
- Modify: `src/app/api/combat/resolve/route.ts:127-205` (NPC turn loop)
- Modify: `src/app/api/combat/resolve/route.ts:297-302` (turn order reset)
- Modify: `src/app/api/combat/resolve/route.ts:21-37` (imports)

This is the core task. The combat resolve loop currently only processes hostile NPCs. We need to:
1. Include friendly NPCs in turn order (after player, before hostiles)
2. Process friendly NPC turns (attack hostile NPCs)
3. Process hostile NPC turns with target selection (player or friendly NPC)

**Step 1: Add imports**

At the top of the file (around line 30), add to the existing import from `combatResolver`:

```typescript
import { resolveNPCTurn, resolveFriendlyNPCTurn, pickHostileTarget } from "../../../lib/combatResolver";
import type { FriendlyNPCTurnResult } from "../../../lib/combatResolver";
```

Also import `updateNPC` from gameState if not already imported:

```typescript
import { getGameState, getEncounter, getSessionId, loadGameState, updateNPC } from "../../../lib/gameState";
```

**Step 2: Update the turn order reset (line 297-302)**

Replace the existing turn order reset at round end:

```typescript
      encounter.turnOrder = [
        "player",
        ...encounter.activeNPCs
          .filter(n => n.currentHp > 0 && n.disposition === "friendly")
          .map(n => n.id),
        ...encounter.activeNPCs
          .filter(n => n.currentHp > 0 && n.disposition === "hostile")
          .map(n => n.id),
      ];
```

**Step 3: Update the NPC turn loop (lines 127-205)**

Replace the existing NPC turn loop. The new loop handles both friendly and hostile NPCs:

```typescript
    // ── NPC turns (sequential, one at a time) ───────────────────────────────

    const npcTurnIds = encounter.turnOrder.filter(id => id !== "player");
    const npcResults: { npcId: string; hit: boolean; damage: number }[] = [];

    for (let i = 0; i < npcTurnIds.length; i++) {
      const npcId = npcTurnIds[i];
      const npc = encounter.activeNPCs.find(n => n.id === npcId);

      // Skip dead or neutral NPCs
      if (!npc || npc.currentHp <= 0 || npc.disposition === "neutral") {
        encounter.currentTurnIndex = i + 2;
        continue;
      }

      encounter.currentTurnIndex = i + 1;

      if (npc.disposition === "friendly") {
        // ── Friendly NPC turn: attack a random hostile ──
        const friendlyResult = resolveFriendlyNPCTurn(npc, encounter.activeNPCs);
        if (!friendlyResult) {
          // No living hostiles — skip turn
          encounter.currentTurnIndex = i + 2;
          continue;
        }

        npcResults.push({ npcId, hit: friendlyResult.hit, damage: friendlyResult.damage });

        // Apply damage to the hostile target
        if (friendlyResult.hit && friendlyResult.damage > 0) {
          updateNPC({ id: friendlyResult.targetId, hp_delta: -friendlyResult.damage });
        }

        // Find the target NPC for narration (get updated HP after damage)
        const target = encounter.activeNPCs.find(n => n.id === friendlyResult.targetId);
        const targetCurrentHP = target?.currentHp ?? 0;
        const targetMaxHP = target?.maxHp ?? 1;

        // Narrate friendly NPC's turn
        const npcNarration = await narrateNPCTurn(
          npc,
          friendlyResult,
          friendlyResult.targetName,
          targetCurrentHP,
          targetMaxHP,
          encounter.location,
        );

        roundTokens += npcNarration.inputTokens + npcNarration.outputTokens;
        roundCost += npcNarration.costUsd;

        await addMessage(sessionId, {
          role: "assistant",
          content: npcNarration.narrative,
          timestamp: Date.now(),
        });

        encounter.lastNpcResult = { npcId, hit: friendlyResult.hit, damage: friendlyResult.damage, timestamp: Date.now() };
        await Promise.all([
          saveCharacterState(characterId, {
            player: gameState.player,
            story: gameState.story,
          }),
          saveEncounterState(encounterId, {
            activeNPCs: encounter.activeNPCs,
            positions: encounter.positions,
            round: encounter.round,
            turnOrder: encounter.turnOrder,
            currentTurnIndex: encounter.currentTurnIndex,
            combatStats: encounter.combatStats,
            lastNpcResult: encounter.lastNpcResult,
          }),
        ]);

      } else if (npc.disposition === "hostile") {
        // ── Hostile NPC turn: target player or a friendly NPC ──
        const target = pickHostileTarget(encounter.activeNPCs);

        if (target.type === "player") {
          // Existing behavior: attack the player
          const npcResult = resolveNPCTurn(npc, player.armorClass);
          npcResults.push({ npcId, hit: npcResult.hit, damage: npcResult.damage });

          if (npcResult.hit && npcResult.damage > 0) {
            player.currentHP = Math.max(0, player.currentHP - npcResult.damage);

            if (!encounter.combatStats) encounter.combatStats = {};
            if (!encounter.combatStats[characterId]) encounter.combatStats[characterId] = emptyCombatStats();
            encounter.combatStats[characterId].damageTaken += npcResult.damage;
          }

          const npcNarration = await narrateNPCTurn(
            npc,
            npcResult,
            player.name,
            player.currentHP,
            player.maxHP,
            encounter.location,
          );

          roundTokens += npcNarration.inputTokens + npcNarration.outputTokens;
          roundCost += npcNarration.costUsd;

          await addMessage(sessionId, {
            role: "assistant",
            content: npcNarration.narrative,
            timestamp: Date.now(),
          });

          encounter.lastNpcResult = { npcId, hit: npcResult.hit, damage: npcResult.damage, timestamp: Date.now() };
          await Promise.all([
            saveCharacterState(characterId, {
              player: gameState.player,
              story: gameState.story,
            }),
            saveEncounterState(encounterId, {
              activeNPCs: encounter.activeNPCs,
              positions: encounter.positions,
              round: encounter.round,
              turnOrder: encounter.turnOrder,
              currentTurnIndex: encounter.currentTurnIndex,
              combatStats: encounter.combatStats,
              lastNpcResult: encounter.lastNpcResult,
            }),
          ]);

          // Check for player death
          if (player.currentHP <= 0) {
            console.log(`[Combat Resolve] Player died during ${npc.name}'s turn`);
            return NextResponse.json({
              ok: true,
              npcResults,
              gameState: getGameState(),
              encounter,
              tokensUsed: roundTokens,
              estimatedCostUsd: roundCost,
            });
          }

        } else {
          // Hostile NPC targets a friendly NPC
          const friendlyTarget = target.npc;
          const npcResult = resolveNPCTurn(npc, friendlyTarget.ac);
          npcResults.push({ npcId, hit: npcResult.hit, damage: npcResult.damage });

          if (npcResult.hit && npcResult.damage > 0) {
            updateNPC({ id: friendlyTarget.id, hp_delta: -npcResult.damage });
          }

          const updatedFriendly = encounter.activeNPCs.find(n => n.id === friendlyTarget.id);
          const npcNarration = await narrateNPCTurn(
            npc,
            npcResult,
            friendlyTarget.name,
            updatedFriendly?.currentHp ?? 0,
            friendlyTarget.maxHp,
            encounter.location,
          );

          roundTokens += npcNarration.inputTokens + npcNarration.outputTokens;
          roundCost += npcNarration.costUsd;

          await addMessage(sessionId, {
            role: "assistant",
            content: npcNarration.narrative,
            timestamp: Date.now(),
          });

          encounter.lastNpcResult = { npcId, hit: npcResult.hit, damage: npcResult.damage, timestamp: Date.now() };
          await Promise.all([
            saveCharacterState(characterId, {
              player: gameState.player,
              story: gameState.story,
            }),
            saveEncounterState(encounterId, {
              activeNPCs: encounter.activeNPCs,
              positions: encounter.positions,
              round: encounter.round,
              turnOrder: encounter.turnOrder,
              currentTurnIndex: encounter.currentTurnIndex,
              combatStats: encounter.combatStats,
              lastNpcResult: encounter.lastNpcResult,
            }),
          ]);
        }
      }
    }
```

**Step 4: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 5: Commit**

```bash
git add src/app/api/combat/resolve/route.ts
git commit -m "feat: integrate friendly NPC turns and hostile target selection into combat loop"
```

---

### Task 6: Update turn order initialization in chat route

**Files:**
- Modify: `src/app/api/chat/route.ts:391` (turnOrder initialization)

**Step 1: Include friendly NPCs in initial turn order**

Replace line 391:

```typescript
enc.turnOrder = ["player", ...enc.activeNPCs.map((n) => n.id)];
```

With:

```typescript
enc.turnOrder = [
  "player",
  ...enc.activeNPCs
    .filter(n => n.disposition === "friendly")
    .map(n => n.id),
  ...enc.activeNPCs
    .filter(n => n.disposition === "hostile")
    .map(n => n.id),
];
```

This puts friendly NPCs after the player and before hostile NPCs.

**Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: include friendly NPCs in initial turn order"
```

---

### Task 7: Place friendly NPCs near the player on the grid

**Files:**
- Modify: `src/app/lib/encounterStore.ts:18-112` (grid placement functions)

**Step 1: Add `findBottomSlot` function**

After the existing `findEdgeSlot` (which places NPCs in rows 1-3 at the top), add a mirrored function for bottom placement. Add it after line 33:

```typescript
/** Find an unoccupied cell in rows 16-19 for friendly NPC placement (near player). */
function findBottomSlot(occupied: Set<string>): GridPosition {
  for (let row = GRID_SIZE - 4; row <= GRID_SIZE - 2; row++) {
    for (let col = 3; col < GRID_SIZE - 3; col += 2) {
      const key = `${row},${col}`;
      if (!occupied.has(key)) return { row, col };
    }
  }
  // Overflow: try any unoccupied cell in bottom 6 rows
  for (let row = GRID_SIZE - 6; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const key = `${row},${col}`;
      if (!occupied.has(key)) return { row, col };
    }
  }
  return { row: GRID_SIZE - 1, col: 0 };
}
```

**Step 2: Update `computeInitialPositions` to use disposition-based placement**

In the NPC placement loop (lines 92-109), replace the fallback logic to check disposition:

```typescript
  // Place NPCs — region-aware if a matching region exists, else disposition-based placement
  for (const npc of npcs) {
    if (positions[npc.id]) continue; // already placed from exploration

    const matchingRegion = npc.slug ? slugToRegion.get(npc.slug) : undefined;
    if (matchingRegion) {
      const regionPos = findRegionSlot(matchingRegion, occupied);
      if (regionPos) {
        positions[npc.id] = regionPos;
        occupied.add(`${regionPos.row},${regionPos.col}`);
        continue;
      }
    }

    // Disposition-based fallback: friendly near player (bottom), hostile at top (edge)
    const pos = npc.disposition === "friendly"
      ? findBottomSlot(occupied)
      : findEdgeSlot(occupied);
    positions[npc.id] = pos;
    occupied.add(`${pos.row},${pos.col}`);
  }
```

**Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 4: Commit**

```bash
git add src/app/lib/encounterStore.ts
git commit -m "feat: place friendly NPCs near the player at bottom of grid"
```

---

### Task 8: Color-code TurnOrderBar chips by disposition

**Files:**
- Modify: `src/app/components/TurnOrderBar.tsx:23-45`

**Step 1: Add disposition lookup and color logic**

Update the component to look up each NPC's disposition and color the chip accordingly:

```typescript
      {turnOrder.map((id, index) => {
        const isActive = index === currentTurnIndex;
        const npc = id !== "player" ? activeNPCs.find(n => n.id === id) : null;
        const isDead = npc != null && npc.currentHp <= 0;
        const name = id === "player" ? "Player" : npc?.name ?? id;
        const disposition = npc?.disposition ?? null;

        // Color by disposition: green for friendly, red for hostile, gold for player
        const dispositionStyles = isDead
          ? "bg-dungeon/50 border border-parchment/10 text-parchment/20 line-through"
          : isActive
            ? disposition === "friendly"
              ? "bg-emerald-900/40 border border-emerald-400 text-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.3)]"
              : disposition === "hostile"
                ? "bg-red-900/40 border border-red-400 text-red-300 shadow-[0_0_8px_rgba(248,113,113,0.3)]"
                : "bg-gold/20 border border-gold text-gold shadow-[0_0_8px_rgba(212,175,55,0.3)]"
            : disposition === "friendly"
              ? "bg-emerald-900/20 border border-emerald-600/30 text-emerald-400/60"
              : disposition === "hostile"
                ? "bg-red-900/20 border border-red-600/30 text-red-400/60"
                : "bg-dungeon-mid/50 border border-parchment/20 text-parchment/50";

        return (
          <div
            key={id}
            className={`
              px-2.5 py-1 rounded font-cinzel text-xs tracking-wide transition-all duration-300
              ${dispositionStyles}
            `}
          >
            {name}
          </div>
        );
      })}
```

**Step 2: Verify the app builds**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/app/components/TurnOrderBar.tsx
git commit -m "feat: color-code turn order chips by NPC disposition"
```

---

### Task 9: Add "Companions" section to CharacterSidebar

**Files:**
- Modify: `src/app/components/CharacterSidebar.tsx:13-17` (Props interface)
- Modify: `src/app/components/CharacterSidebar.tsx:260-261` (after Inventory section)
- Modify: `src/app/dashboard/page.tsx:652-655` (pass companions prop)

**Step 1: Add companions to Props**

In `CharacterSidebar.tsx`, update the Props interface (line 13):

```typescript
interface Props {
  player: PlayerState;
  companions: NPC[];
  onOpenFullSheet: () => void;
  onClose?: () => void;
}
```

Add the NPC import at the top:

```typescript
import {
  PlayerState,
  NPC,
  formatModifier,
  getModifier,
  getProficiencyBonus,
  formatAbilityDamage,
  toDisplayCase,
} from "../lib/gameTypes";
```

Update the destructuring in the component function:

```typescript
function CharacterSidebar({ player, companions, onOpenFullSheet, onClose }: Props) {
```

**Step 2: Add Companions section after Inventory**

After line 260 (closing `</section>` of Inventory), add:

```typescript
        {/* Companions */}
        {companions.length > 0 && (
          <section>
            <h3 className="font-cinzel text-gold-dark text-xs tracking-widest font-bold uppercase mb-1.5">
              Companions
            </h3>
            <div className="space-y-2">
              {companions.map((npc) => {
                const hpPct = npc.maxHp > 0 ? (npc.currentHp / npc.maxHp) * 100 : 0;
                const hpColor = hpPct > 50 ? "#5a9a5a" : hpPct > 25 ? "#d4a017" : "#dc4a4a";
                return (
                  <div
                    key={npc.id}
                    className="bg-dungeon-mid/50 border border-emerald-600/30 rounded-lg p-2"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-cinzel text-sm text-emerald-300 font-bold truncate">
                        {npc.name}
                      </span>
                      <span className="font-cinzel text-[11px] text-parchment/50">
                        AC {npc.ac}
                      </span>
                    </div>
                    {/* HP bar */}
                    <div className="h-1.5 bg-dungeon rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${hpPct}%`, backgroundColor: hpColor }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="font-cinzel text-[10px] text-parchment/40">
                        {npc.currentHp}/{npc.maxHp} HP
                      </span>
                      {npc.conditions.length > 0 && (
                        <span className="font-cinzel text-[10px] text-red-400/80">
                          {npc.conditions.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
```

**Step 3: Pass companions from dashboard**

In `src/app/dashboard/page.tsx`, compute the companions list and pass it. Near the existing `activeNPCs` memo (around line 151), add:

```typescript
  const companions = useMemo(
    () => activeNPCs.filter(n => n.disposition === "friendly" && n.currentHp > 0),
    [activeNPCs],
  );
```

Then update the `<CharacterSidebar>` usage (around line 652):

```typescript
            <CharacterSidebar
              player={player}
              companions={companions}
              onOpenFullSheet={handleOpenFullSheet}
              onClose={collapseSidebar}
            />
```

**Step 4: Verify the app builds**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 5: Commit**

```bash
git add src/app/components/CharacterSidebar.tsx src/app/dashboard/page.tsx
git commit -m "feat: add Companions section to CharacterSidebar"
```

---

### Task 10: Update DM agent system prompt for friendly NPC guidance

**Files:**
- Modify: `src/app/agents/dmAgent.ts:42-97` (STATIC_DM_INSTRUCTIONS)

**Step 1: Add friendly NPC instructions to the DM prompt**

After the existing NPC creation instructions (around line 53, after the COMBAT INITIATION line), add:

```
- FRIENDLY NPCs: Introduce friendly NPCs (guards, mercenaries, rescued prisoners, quest allies) when the story calls for it — use npcs_to_create with disposition "friendly" and an appropriate SRD slug. Keep allies balanced: don't introduce overpowered companions that trivialize encounters. Friendly NPCs fight alongside the player in combat automatically — you do not need to narrate their attacks.
- FRIENDLY NPC DEPARTURE: When a friendly NPC's narrative role is complete (quest finished, destination reached, story diverges), dismiss them using npcs_to_dismiss with their [id]. Narrate their departure naturally — they head home, stay behind to guard something, part ways at a crossroads, etc. Don't keep companions around indefinitely.
```

**Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/app/agents/dmAgent.ts
git commit -m "feat: add friendly NPC guidance to DM agent system prompt"
```

---

### Task 11: Build and verify

**Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Full build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address build errors from friendly NPC feature"
```
