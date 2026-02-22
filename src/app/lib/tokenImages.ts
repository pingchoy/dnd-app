/**
 * Token image resolution for the combat grid.
 *
 * Derives image paths from NPC names and player race strings.
 * Images are static assets in public/tokens/{monsters,races}/.
 * Falls back gracefully when no image exists for a given token.
 */

/** Slugify a name for file lookup: lowercase, spaces/special chars → hyphens. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SUPPORTED_EXTENSIONS = ["webp", "png"] as const;

/**
 * Get the format-agnostic cache key for a token (slug without extension).
 * Used to look up preloaded images in the cache from CombatGrid.
 */
export function getTokenImageKey(
  name: string,
  type: "monster" | "race",
): string {
  const slug = slugify(name);
  const dir = type === "monster" ? "monsters" : "races";
  return `/tokens/${dir}/${slug}`;
}

/**
 * Preload a set of token images and return a map of successfully loaded ones.
 * Tries .webp first, then .png. Images that fail to load in all formats are
 * silently excluded — the grid falls back to initials for those tokens.
 *
 * Cache is keyed by format-agnostic path (no extension) so callers don't
 * need to know which format was found.
 */
export function preloadTokenImages(
  entries: { name: string; type: "monster" | "race" }[],
): Map<string, HTMLImageElement> {
  const cache = new Map<string, HTMLImageElement>();
  const seen = new Set<string>();

  for (const entry of entries) {
    const key = getTokenImageKey(entry.name, entry.type);
    if (seen.has(key)) continue;
    seen.add(key);

    // Try each format in order; stop on first successful load.
    tryLoadImage(key, 0, cache);
  }

  return cache;
}

/** Attempt to load `key` with the format at `extIndex`, falling back to next. */
function tryLoadImage(
  key: string,
  extIndex: number,
  cache: Map<string, HTMLImageElement>,
): void {
  if (extIndex >= SUPPORTED_EXTENSIONS.length) return;

  const img = new Image();
  img.src = `${key}.${SUPPORTED_EXTENSIONS[extIndex]}`;
  (img as HTMLImageElement & { _loaded?: boolean })._loaded = false;

  img.onload = () => {
    (img as HTMLImageElement & { _loaded?: boolean })._loaded = true;
    cache.set(key, img);
  };
  img.onerror = () => {
    // Try next format
    tryLoadImage(key, extIndex + 1, cache);
  };

  // Optimistically set in cache so the key exists during the first format attempt.
  // If all formats fail, the entry stays with _loaded=false → initials fallback.
  if (!cache.has(key)) {
    cache.set(key, img);
  }
}

/** Check if a preloaded image is ready to draw. */
export function isImageReady(img: HTMLImageElement | undefined): boolean {
  if (!img) return false;
  return (img as HTMLImageElement & { _loaded?: boolean })._loaded === true;
}

/**
 * Common D&D monster names expected to have token images.
 * Use this as a reference when adding art to public/tokens/monsters/.
 */
export const MONSTER_MANIFEST = [
  "goblin",
  "hobgoblin",
  "bugbear",
  "kobold",
  "orc",
  "gnoll",
  "skeleton",
  "zombie",
  "ghoul",
  "wight",
  "wraith",
  "specter",
  "banshee",
  "vampire",
  "lich",
  "wolf",
  "dire-wolf",
  "bear",
  "giant-spider",
  "giant-rat",
  "owlbear",
  "mimic",
  "bandit",
  "thug",
  "cultist",
  "guard",
  "knight",
  "mage",
  "ogre",
  "troll",
  "hill-giant",
  "fire-giant",
  "young-dragon",
  "adult-dragon",
  "ancient-dragon",
  "beholder",
  "mind-flayer",
  "gelatinous-cube",
  "basilisk",
  "manticore",
  "griffon",
  "wyvern",
  "imp",
  "quasit",
  "hell-hound",
  "elementals",
] as const;

/**
 * Player race tokens expected in public/tokens/races/.
 */
export const RACE_MANIFEST = [
  "human",
  "elf",
  "half-elf",
  "dwarf",
  "halfling",
  "gnome",
  "half-orc",
  "tiefling",
  "dragonborn",
] as const;
