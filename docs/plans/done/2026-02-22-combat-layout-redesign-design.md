# Combat Layout Redesign

## Problem

During combat, the current layout has two issues:
1. When the chat overlay opens (from the bottom), it obscures the ability bar on the right side of the map
2. When the chat is closed, players can't see generated rolls and flavor text

## Design

Replace the "map fills everything, chat overlays from bottom" approach with dedicated fixed zones where nothing overlaps.

### Overall Layout

```
+------------------------------------------------------------+
| Header: Campaign Title, Nav, Stats                         |
+----------+-------------------------------------+-----------+
|          | Turn Order Bar                       |           |
|  Chat    |                                     | Character |
|  Panel   |       Combat Map Canvas              | Sidebar   |
|  (left,  |   (pan/zoom, tokens, range)         | (desktop  |
|  toggle) |                                     |  only)    |
|          |        +----------------+           |           |
|          |        | Last Action    |           |           |
|          |        | Toast          |           |           |
|          |        +----------------+           |           |
|          | Legend Bar                           |           |
+----------+-------------------------------------+-----------+
| [Attack] [Dagger] [Spells v] [Dodge] | chat | [input...] >|
+------------------------------------------------------------+
```

### 1. Bottom Hotbar

Fixed-height strip (~48-56px) at the very bottom, always visible during combat. Full width beneath everything.

**Layout (left to right):**
- **Ability buttons** — horizontal row, scrollable on overflow. Same buttons as current vertical bar. Spell submenu pops **upward**.
- **Chat toggle** — icon button that opens/closes the left chat panel. Shows dot indicator for unread messages.
- **Input field** — always present, takes remaining space. Send button on right.

**Targeting mode:** When a targeted ability is selected, input area shows "Select a target on the map..." as disabled placeholder. Esc/right-click cancels.

**Spell submenu:** Pops up from the hotbar (absolutely positioned above the Spells button). Same content as current spell panel.

### 2. Left Chat Panel

Slides in from the left side of the combat area when toggled.

- **Width:** `w-80` (320px) desktop, `w-64` (256px) tablet
- **Map resizes:** Canvas shrinks horizontally (no overlap). ResizeObserver handles this naturally.
- **Content:** Reuses `CompactChatPanel` (last ~6 messages, dice rolls, markdown)
- **Animation:** CSS transition (`transition-all duration-300`), map smoothly shrinks
- **Header:** "Combat Log" title + close button
- **No input field** — input stays in the hotbar. Panel is read-only history.
- **Auto-open:** Opens when a new DM message arrives (if closed), auto-closes after 5 seconds of no new messages.

### 3. Last Action Toast

Compact toast floating on the map canvas when the chat panel is closed.

**Position:** Bottom-left of canvas, above legend bar. `absolute bottom-10 left-4`.

**Content variants:**
1. **Roll result:** Dice result + hit/miss + ability name + damage (e.g., "d20 17 -> HIT! Shortsword -- 8 damage")
2. **Narrative snippet:** First 1-2 sentences of last DM message, truncated with ellipsis

**Behavior:**
- Fade-in on new action, stays 6 seconds, then fades out
- Replaced immediately when new action arrives
- Hidden when chat panel is open
- Click to open chat panel
- `pointer-events-none` except on click handler (doesn't block map interaction)
- Max width ~320px

**Data source:** Derived from last message in `messages` array. Roll variant if `rollResult` exists, narrative snippet otherwise.

### 4. Component Changes

**CombatGrid.tsx:**
- Remove the ability bar and spell panel from this component (moves to hotbar)
- Remove `abilities`, `selectedAbility`, `onSelectAbility`, `abilityBarDisabled` props
- Keep `targetingAbility`, `onTargetSelected`, `onCancel` for grid targeting behavior

**Dashboard page.tsx:**
- Remove the combat chat overlay and "Show Chat" floating button
- Add new `CombatHotbar` component at the bottom (full width, outside the flex body)
- Add new `CombatChatPanel` component as left panel inside the combat area
- Add new `LastActionToast` component floating on the map canvas
- Wire chat toggle state, auto-open/close logic, unread indicator

**New components:**
- `CombatHotbar.tsx` — horizontal ability buttons + chat toggle + input
- `LastActionToast.tsx` — floating toast with roll/narrative display
- `CombatChatPanel.tsx` — left slide panel wrapping CompactChatPanel (or inline the logic if simple enough)

### 5. Responsive Behavior

| Breakpoint | Chat Panel | Character Sidebar | Hotbar |
|-----------|-----------|------------------|--------|
| Desktop (lg+) | w-80, map shrinks | Visible (w-80) | Full width |
| Tablet (md-lg) | w-64, map shrinks | Hidden | Full width |
| Mobile (<md) | w-64, map shrinks | Hidden (modal) | Full width, abilities scroll |
