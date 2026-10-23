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
| `monsters/<id>.png` | A monster on the map: one strip of four rows of frames — standing, moving (the bat's and the troll's second row is an attack), hit, going down — 4 frames a row (the troll 6), cell size in `art.json`. Shown 14 map px tall for the slime, 16 the bat, 22 the mushroom, 36 the troll. Without the file the game paints 4 frames of 24×24 and uses them for every row |
| `monsters/word_slime_{blue,purple}.png` | The slime's other colours. Each spot keeps one: `slime_1` green, `slime_2` blue, `slime_3` purple, then round again |
| `monsters/<id>_battle.png`, `word_slime_{blue,purple}_battle.png` | The monster standing, 192 px tall, for the fight panel (shown 72 px, 52 px on a phone); an SVG stand-in without it |
| `fx/*.png` | The harvest burst, dust at the player's heels, the sparkle over a ripe crop, the "!" over what the player faces, Zs |
| `items/*.png` | 96 px icons: coin, stamina, the seeds, tea, chests, the quest book, the letter, the word scroll. A new seed or item needs one named after its id in `server/internal/game/catalog.go`. `bram_hammer.png` and `herb_salve.png` come from `art/echo_icons_pack/` |
| `portraits/*.png` | Four faces side by side: neutral, happy, thinking, worried |
| `ui/*.png` | The wooden frames of the panels (`dialog_box`, `panel`; their corner blocks are 52 px), the joystick, the action button |

### Echo Town (chapter 3)

From `art/echo_town/`, cut by the same script:

| File | What it is |
|---|---|
| `characters/{elsa,orin,lina,hugo,vy}.png` + `.json` | The five townsfolk, laid out like the farm's people (standing and walking, four ways). The pack draws their walking frames smaller than their standing ones; the script brings them up to the same height |
| `portraits/{elsa,orin,lina,hugo,vy}.png` | Four faces each: neutral, happy, thinking, worried |
| `objects/{town_hall,clinic,tower,library,cafe}.png` | The five houses, each on its 5×5 tiles with its door at the middle of the foot (the town hall 92 map px wide, the tower 46 and tall) |
| `objects/fountain.png` | The fountain in the middle of the square, four frames of its water playing, 40 map px wide |
| `objects/{bench,lamp,notice_board}.png` | The square's furniture |
| `tiles/farm.png` additions | `plaza` (the square's sandstone), `plaza_grey`, `plaza_brick`, and two flower beds, `flowerbed_wood` and `flowerbed_stone` |
| `items/{flowers,old_book,wool_scarf,honey_cake,coffee,soup}.png` | The gifts and Hugo's café. The pack's hammer and salve are left to the icons pack's |

### Still to draw

| File | What it is |
|---|---|
| `objects/word_hall.png` | The Word Hall north of the square, 6×5 tiles, door at the middle of the foot: closed by the Silence, grey with mist and three notes pinned to its door (until then the farmhouse, larger and greyed, with painted mist). A second, restored look will be wanted for chapter 4 |
| `items/ipa_glasses.png` | Sage Orin's glasses, which read the Lexi's notes (a 👓 stands in) |

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

The chapter 2 monsters (`art/echo_chapter2_monsters/`) are boards of four
rows on a transparent ground, two of them with a faint glow behind. The script
drops the glow (anything less than half opaque), finds the figures, sorts them
into the rows and columns, cuts two figures drawn touching in half, gives the
loose bits (a shadow, sparkles, the bat's last puff) to the frame they sit by,
and sizes every frame of a monster by the same amount so a slime going flat
gets lower rather than larger. The fight panel plays the same strips, larger:
standing, hit on a right answer, the second row for a wrong one, going down
when beaten.

The icons in `art/echo_icons_pack/items/` are one to a picture, named as drawn
(`hammer` is `bram_hammer`, `herbal_medicine` is `herb_salve`). Their figures
are a little see-through, so the script makes what is drawn solid before
sizing it like the other icons.

Two of the pack's files were swapped as delivered: `characters/npcs.png` held
the buildings and `objects/large_objects.png` the people. In `art/echo_farm_full/`
they are `objects.png` and `npcs.png`.
