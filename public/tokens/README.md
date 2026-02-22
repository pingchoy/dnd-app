# Combat Token Images

Drop portrait-style token art here for the combat grid.

## Directory Structure

```
tokens/
  monsters/   # NPC tokens, named by creature (e.g. goblin.webp)
  races/      # Player character tokens, named by race (e.g. elf.webp)
```

## Image Requirements

- **Format**: PNG or WebP (the system tries .webp first, then .png)
- **Aspect ratio**: Square (will be circle-clipped on the grid)
- **Minimum size**: 128×128px
- **Recommended size**: 256×256px (crisp at all zoom levels)
- **Style**: Front-facing portrait, centered on the subject

## File Naming

File names are derived by slugifying the creature/race name:
- Lowercase, spaces and special characters replaced with hyphens
- Examples: `dire-wolf.png`, `giant-spider.png`, `half-elf.webp`

## Expected Monster Tokens

goblin, hobgoblin, bugbear, kobold, orc, gnoll, skeleton, zombie,
ghoul, wight, wraith, specter, banshee, vampire, lich, wolf,
dire-wolf, bear, giant-spider, giant-rat, owlbear, mimic, bandit,
thug, cultist, guard, knight, mage, ogre, troll, hill-giant,
fire-giant, young-dragon, adult-dragon, ancient-dragon, beholder,
mind-flayer, gelatinous-cube, basilisk, manticore, griffon, wyvern,
imp, quasit, hell-hound, elementals

## Expected Race Tokens

human, elf, half-elf, dwarf, halfling, gnome, half-orc, tiefling,
dragonborn

## Fallback

Any creature without a matching image file will display using the
existing two-letter initials system. No tokens are required for the
grid to function.
