# Arena art — what the game reads

Everything the Arena draws comes from this folder. A file is read by its path
and cut into frames by the sizes below, so a new drawing replaces the old one
with no code change as long as the path, the size and the frame order stay.

Pixel art at native size (16 px tiles); the game enlarges it with
nearest-neighbour scaling, 2× to 6× depending on the screen. PNG with real
transparency.

A missing file is not an error: the game paints a stand-in in code
(`src/game/art/placeholder.ts`) with the same layout, so the farm is playable
with any subset of this folder. `ARTIST_NOTES.md` is the artist's own note
that came with the chapter-1 pack.

## Drawn by the game (Phaser)

| File | Size | Frames |
|---|---|---|
| `characters/player.png` | 64×544 | 16×32, 4 per row. Rows 0–3 idle (2 frames), 4–7 walk (4), 8–11 hoe (3), 12–15 harvest (3), each group down, up, left, right; row 16 sleep (2) |
| `characters/{sir_shadow,mira,bram}.png` | 64×256 | 16×32. Rows 0–3 idle, 4–7 walk, down, up, left, right |
| `tiles/farm.png` | 256×64 | 16×16 cells, named in `tiles/farm_atlas.json` |
| `crops/{sprout,bloom,golden}.png` | 80×32 | 5 stages of 16×32: planted, sprout, growing, nearly, ripe |
| `objects/farmhouse.png` | any | one image; its bottom edge stands on the house's last row |
| `objects/shop_cart.png`, `workbench.png`, `quest_board.png` | any | one image each |
| `objects/mailbox.png` | 32×32 | 2 frames of 16×32: empty, letter waiting |
| `objects/tree.png` | 96×48 | 3 kinds of tree, 32×48 each |
| `objects/rock_big.png`, `bush.png`, `stump.png` | any | one image each |
| `fx/interact.png` | 32×16 | 2 frames of 16×16: the bouncing marker over what the player faces |
| `fx/harvest_pop.png` | 96×16 | 6 frames of 16×16, played once on harvest |
| `fx/sparkle.png` | 64×16 | 4 frames of 16×16, looped over a ripe crop |

### The tileset atlas

`tiles/farm_atlas.json` names each cell:

```json
{ "atlas_columns": 16, "tiles": { "grass_1": { "atlas_x": 0, "atlas_y": 0 }, … } }
```

The map asks for tiles by name, so cells can move around the sheet freely.
Names the map uses: `grass_1`…`grass_5`, `bare_dirt`, `path_vertical`,
`path_horizontal`, `path_corner` (top-left corner; the other three are
mirrored), `path_cross`, `untilled`, `tilled_dry`, `tilled_wet`,
`soil_level_1`…`soil_level_3`, `soil_locked`, `pond_0`…`pond_15` (the 16
edge pieces of the pond, chosen by which sides touch water), and the flower
and grass decorations listed in `src/game/world/farm.ts` (`DEFAULT_TILES`).
Without the atlas, the indexes in `DEFAULT_TILES` are used.

## Drawn by the page (HUD and panels)

| File | Size | Use |
|---|---|---|
| `portraits/{sir_shadow,mira,bram}.png` | 256×64 | 4 faces of 64×64: neutral, happy, thinking, worried |
| `items/*.png` | 16×16 (any square) | icons: `coin`, `stamina`, `quest_book`, `letter`, `word_scroll`, `chest_closed`, `chest_open`, `ginger_tea`, `seed_sprout`, `seed_bloom`, `seed_golden` |
| `ui/dialog_box.png` | 48×48 | 9-slice frame of every panel (3×3 cells of 16) |
| `ui/panel.png` | 48×48 | 9-slice, spare panel frame |
| `ui/button_action.png` | 64×32 | the action button |
| `ui/joystick_base.png`, `ui/joystick_knob.png` | any | the touch joystick |

A new seed or item needs an icon here named after its id in
`server/internal/game/catalog.go`.
