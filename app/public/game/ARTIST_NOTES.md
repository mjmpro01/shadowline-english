# Echo Farm – Chapter 1 pixel asset pack

All assets are RGBA PNGs with true transparency, hard pixel edges and native pixel dimensions. The game can enlarge them with nearest-neighbor filtering (×3).

## Character sheet layout
`characters/player.png`: 64×544 px = 4 columns × 17 rows, 16×32 frame.
Rows 0–3 idle, 4–7 walking, 8–11 hoe/sow, 12–15 harvest, 16 sleeping. Within each four-row group: down, up, left, right. Use the first 2/4/3/3 frames respectively; unused grid cells are transparent.
`characters/{sir_shadow,mira,bram}.png`: 64×256 px = 4 columns × 8 rows, first four idle and next four walk.
`portraits/*.png`: 256×64 px, four 64×64 emotions: neutral, happy, thinking, worried.
`crops/*.png`: 80×32 px, five 16×32 stages left to right.
`objects/mailbox.png`: 32×32 px, 2 states 16×32 side by side.
`objects/tree.png`: 96×48 px, 3 tree types 32×48 side by side.
`ui/button_action.png`: 64×32 px, 2 button states 32×32.
`tiles/farm.png`: 256×64 px, 16×16 cells; `tiles/farm_atlas.json` maps tile names to atlas positions.
`ui/dialog_box.png` and `ui/panel.png`: 48×48 px, 3×3 tiles of 16×16.

Audio assets are not included (audio directory is a placeholder).
These are manually generated starter assets, not exact copies of the concept reference; artwork is intentionally compact for editing in Aseprite/LibreSprite.
