# Arena art — what the game reads

Everything the Arena draws comes from this folder, and all of it is made by
`scripts/build-art.py` from the Echo Farm pack in `art/echo_farm_full/`:

```
python3 scripts/build-art.py     # from app/; needs Pillow, numpy and scipy
```

Change a drawing in the pack, run the script again, commit what it writes
here. Do not edit these files by hand: the next run overwrites them.

## How the pictures are sized

The map is laid out in 16 px tiles. The pictures are drawn at four times
that (`art.json`: `"scale": 4`), so a tile is 64 px here, and the game shrinks
them as it draws, smoothing as it goes. On a phone the canvas has two screen
pixels to each CSS pixel, so they stay sharp.

`art.json` also says how each strip of frames is cut (`frames`: width,
height and count). Without `art.json` the game treats the pictures as drawn
at the map's own size and cut as `src/game/assets.ts` lists, and a missing
picture is painted in code instead (`src/game/art/placeholder.ts`), so the
farm is playable with any subset of this folder.

## The files

| File | What it is |
|---|---|
| `characters/{player,sir_shadow,mira,bram}.png` + `.json` | One animation per row in equal cells. The `.json` gives the cell size, how tall the figure stands (`bodyHeight`, shown 28 map px tall), where its feet are (`feet`) and each animation's frames (`anims`: `idle-down`, `walk-left`, `hoe-up`, `harvest-right`, `sleep`…) |
| `tiles/farm.png` + `farm_atlas.json` | 64 px tiles, each with 2 px of its own edge repeated around it (`margin`, `spacing`), named in the atlas: grass, dirt, paths, tilled soil, framed (upgraded) soil, the locked plot, the pond's pieces, the fence, flowers and other small things |
| `objects/*.png` | The house, Mira's cart, Bram's bench, the quest board, trees (3 kinds), the bush, rocks, a stump; `mailbox.png` is two frames, empty and with a letter |
| `crops/{sprout,bloom,golden}.png` | 5 growth stages each, the last one ripe |
| `monsters/{word_slime,echo_bat}.png` | The woods' monsters on the map: 4 frames of 24×24 side by side, a bob that loops. Not in the pack yet — the game paints stand-ins |
| `monsters/{word_slime,echo_bat}_battle.png` | The same monster drawn larger for the fight panel (shown 72 px, 52 px on a phone). Not in the pack yet — an SVG stand-in until then |
| `fx/*.png` | The harvest burst, dust at the player's heels, the sparkle over a ripe crop, the "!" over what the player faces, Zs |
| `items/*.png` | 96 px icons: coin, stamina, the seeds, tea, chests, the quest book, the letter, the word scroll. A new seed or item needs one named after its id in `server/internal/game/catalog.go` |
| `portraits/*.png` | Four faces side by side: neutral, happy, thinking, worried |
| `ui/*.png` | The wooden frames of the panels (`dialog_box`, `panel`; their corner blocks are 52 px), the joystick, the action button |

## What the script does to the pack

The pack's boards are drawn freely, so the script:

- cuts each figure out even where it touches its neighbour (a hat brim, a
  raised hoe), following the gap between them, and gives loose bits (dust,
  seeds, Zs) to the figure nearest them;
- lines every frame of a character up by the top of the head and the feet, so
  it does not jump between frames;
- crops each tile inside its dark rounded rim, and blends grass, dirt and
  water so tiles laid side by side show no seam;
- draws the dirt paths from the pack's own grass and dirt, since its path
  pieces do not cover every join, and turns the pond's top pieces over for
  its bottom ones;
- sizes each object for its place on the map (the house is 88 map px wide,
  a tree 44).

Two of the pack's files were swapped as delivered: `characters/npcs.png` held
the buildings and `objects/large_objects.png` the people. In `art/echo_farm_full/`
they are `objects.png` and `npcs.png`.
