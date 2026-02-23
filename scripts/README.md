# Scripts

## Campaign Map Generation

Generates 20x20 tile grids (with regions and optional background images) from campaign map specs.

### Prerequisites

Set these in `.env.local`:

```
ANTHROPIC_API_KEY=your-key                          # Required
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service..."}  # Required (JSON string)
STABILITY_API_KEY=your-key                          # Optional: enables image generation
FIREBASE_STORAGE_BUCKET=your-bucket.firebasestorage.app  # Required when using STABILITY_API_KEY
```

### Pipelines

**Image-first** (when `STABILITY_API_KEY` is set):
1. Stability AI generates a top-down battle map PNG (~$0.03)
2. Claude Vision analyzes the image to extract tileData + regions (~$0.03)
3. Image is uploaded to Firebase Storage
4. CampaignMap saved with `tileData`, `regions`, and `backgroundImageUrl`

**Text-to-grid** (no `STABILITY_API_KEY` or `--no-images`):
1. Claude Sonnet generates tileData + regions from the text description (~$0.04)
2. CampaignMap saved with `tileData` and `regions` (no image)

If the image pipeline fails for a map, it automatically falls back to text-to-grid.

### Usage

```bash
# Preview what will be generated (no API calls, no cost)
npm run generate:maps -- --campaign the-crimson-accord --dry-run

# Generate a single map to test the pipeline
npm run generate:maps -- --campaign the-crimson-accord --map valdris-docks

# Generate all maps for a campaign
npm run generate:maps -- --campaign the-crimson-accord

# Force text-to-grid only (skip image generation)
npm run generate:maps -- --campaign the-crimson-accord --no-images
```

### Cost

| Pipeline | Per map | 8 Crimson Accord maps |
|----------|---------|----------------------|
| Image-first | ~$0.06 | ~$0.48 |
| Text-to-grid | ~$0.04 | ~$0.32 |

### Output

Maps are stored in Firestore at `campaignMaps/{campaignSlug}_{mapSpecId}` and instantiated into session-scoped `maps/` documents when a campaign starts.

Images are stored in Firebase Storage at `campaign-maps/{campaignSlug}/{mapSpecId}.png`.
