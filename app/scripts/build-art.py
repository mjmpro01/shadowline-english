#!/usr/bin/env python3
"""
Builds the Arena's pictures from the full Echo Farm pack.

The pack (art/echo_farm_full/) is drawn large and laid out as boards: a
character's frames touch and overlap, tiles are rounded squares with a dark
rim, objects sit wherever they were drawn. This cuts each thing out, sizes it
for the map and writes the files public/game/ holds, at four times the map's
resolution (a 16 px tile is 64 px here), plus art.json, which tells the game
the pictures are that size and how the sheets are cut.

  python3 scripts/build-art.py            # from app/

Needs Pillow, numpy and scipy. The pack's files, as delivered, are renamed:
characters/npcs.png held the buildings and objects/large_objects.png the
people, so here they are objects.png and npcs.png.
"""

import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "art", "echo_farm_full")
OUT = os.path.join(HERE, "..", "public", "game")

SCALE = 4  # picture pixels per map pixel
TILE = 16 * SCALE
SOLID = 60  # alpha above which a pixel counts as drawn
BODY = 28 * SCALE  # how tall a person stands, head to feet


def load(name):
    return Image.open(os.path.join(SRC, name)).convert("RGBA")


def save(img, path):
    full = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    img.save(full, optimize=True)


def trim(img):
    box = img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    return img.crop(box) if box else img


def fit(img, w=None, h=None):
    """Resized smoothly to a width or a height, keeping its shape."""
    if w is not None:
        h = max(1, round(img.height * w / img.width))
    else:
        w = max(1, round(img.width * h / img.height))
    return img.resize((w, h), Image.LANCZOS)


# --- Cutting figures out of a board -------------------------------------------


def split_block(img, box, rows, cols):
    """The rows × cols figures drawn in `box`, as a grid of trimmed images.

    Figures touch: a plume reaches the boots above it, a hoe crosses into the
    next frame, dust and seeds fly loose. So the drawing is taken apart into
    pieces; a piece far bigger than one figure is cut at its thinnest line
    (two figures touching); the rows × cols biggest pieces are the figures,
    and every speck goes to the figure nearest it. The soft edge around each
    figure comes back afterwards.
    """
    x0, y0, x1, y1 = box
    px = np.array(img.crop(box))
    alpha = px[:, :, 3]
    drawn = alpha > SOLID
    eh, ew = (y1 - y0) / rows, (x1 - x0) / cols

    lab, n = ndimage.label(drawn)
    pieces = [np.argwhere(lab == i + 1) for i in range(n)]

    def seam(weight):
        """The cheapest top-to-bottom path through `weight`, moving at most
        one column per row: where two figures touch, the line between them
        follows the gap instead of slicing a hat brim."""
        h, w = weight.shape
        cost = weight.astype(float).copy()
        for y in range(1, h):
            prev = cost[y - 1]
            best = np.minimum(prev, np.minimum(np.r_[np.inf, prev[:-1]], np.r_[prev[1:], np.inf]))
            cost[y] += best
        path = np.zeros(h, dtype=int)
        path[-1] = int(np.argmin(cost[-1]))
        for y in range(h - 2, -1, -1):
            x = path[y + 1]
            lo, hi = max(0, x - 1), min(w, x + 2)
            path[y] = lo + int(np.argmin(cost[y, lo:hi]))
        return path

    def cut(piece, axis, size):
        lo, hi = piece[:, axis].min(), piece[:, axis].max() + 1
        if hi - lo <= size * 1.45:
            return [piece]
        k = round((hi - lo) / size)
        # Work across columns; for rows, the same on the transposed piece.
        other = 1 - axis
        olo, ohi = piece[:, other].min(), piece[:, other].max() + 1
        weight = np.zeros((ohi - olo, hi - lo))
        weight[piece[:, other] - olo, piece[:, axis] - lo] = alpha[tuple(piece.T)] + 1.0
        profile = ndimage.uniform_filter1d((weight > 0).sum(axis=0).astype(float), 5)
        lines = []
        for i in range(1, k):
            mid = int((hi - lo) * i / k)
            win = int((hi - lo) / k * 0.3)
            centre = max(0, mid - win) + int(np.argmin(profile[max(0, mid - win):mid + win]))
            a, b = max(0, centre - win), min(hi - lo, centre + win)
            lines.append(a + seam(weight[:, a:b]))
        along = piece[:, other] - olo
        across = piece[:, axis] - lo
        side = np.zeros(len(piece), dtype=int)
        for line in lines:
            side += across >= line[along]
        return [piece[side == j] for j in range(k)]

    parts = []
    for p in pieces:
        for q in cut(p, 0, eh):
            parts.extend(r for r in cut(q, 1, ew) if len(r))
    parts.sort(key=len, reverse=True)
    figures, specks = parts[:rows * cols], parts[rows * cols:]
    # A small piece cut by the box's edge is the tip of a neighbour's drawing.
    h, w = drawn.shape
    big = np.mean([len(f) for f in figures]) if figures else 0
    specks = [
        s for s in specks
        if not (len(s) < big * 0.15 and (s[:, 0].min() == 0 or s[:, 0].max() == h - 1
                                          or s[:, 1].min() == 0 or s[:, 1].max() == w - 1))
    ]
    if len(figures) < rows * cols:
        raise SystemExit(f"found {len(figures)} figures in {box}, expected {rows * cols}")
    centres = [f.mean(axis=0) for f in figures]
    owner = [[f] for f in figures]
    for s in specks:
        c = s.mean(axis=0)
        i = min(range(len(centres)), key=lambda j: np.hypot(*(centres[j] - c)))
        owner[i].append(s)

    # Order the figures into rows, then left to right.
    order = sorted(range(len(figures)), key=lambda i: centres[i][0])
    grid = []
    for r in range(rows):
        row = sorted(order[r * cols:(r + 1) * cols], key=lambda i: centres[i][1])
        cells = []
        for i in row:
            keep = np.zeros(drawn.shape, dtype=bool)
            for part in owner[i]:
                keep[tuple(part.T)] = True
            soft = ndimage.binary_dilation(keep, iterations=2) & (alpha > 0) & ~drawn
            mask = keep | soft
            out = px.copy()
            out[~mask] = 0
            cells.append(trim(Image.fromarray(out)))
        grid.append(cells)
    return grid


def anchor(img):
    """Where a figure stands: the middle of the top of its head (hat, plume),
    and the soles of its feet under that (a hoe held out does not move it)."""
    solid = np.array(img)[:, :, 3] > 128
    ys = np.where(solid.any(axis=1))[0]
    top = ys[0]
    head = solid[top:top + max(8, (ys[-1] - top) // 5)]
    xs = np.where(head.any(axis=0))[0]
    cx = (xs[0] + xs[-1]) / 2
    half = max(10, (xs[-1] - xs[0]) // 3)
    core = solid[:, max(0, int(cx - half)):int(cx + half)]
    rows = np.where(core.sum(axis=1) >= 3)[0]
    return cx, top, rows[-1] + 1


def character(name, frames, anims, standing):
    """Writes characters/<name>.png and .json from frames {key: [images]}.

    Every frame is scaled alike so the figure stands BODY pixels tall, and
    lined up by the head and the feet in equal cells, one animation per row.
    """
    tops = [anchor(f) for f in frames[standing]]
    height = np.median([b - t for _, t, b in tops])
    k = BODY / height
    placed = {}
    for key, imgs in frames.items():
        out = []
        for img in imgs:
            img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
            cx, top, bottom = anchor(img)
            out.append((img, cx, bottom))
        placed[key] = out
    left = max(cx for v in placed.values() for _, cx, _ in v)
    right = max(i.width - cx for v in placed.values() for i, cx, _ in v)
    up = max(b for v in placed.values() for _, _, b in v)
    down = max(i.height - b for v in placed.values() for i, _, b in v)
    w = int(np.ceil(max(left, right))) * 2 + 4
    h = int(np.ceil(up + down)) + 4
    w += w % 2
    h += h % 2
    feet = h - 2 - int(np.ceil(down))
    cols = max(len(v) for v in placed.values())
    keys = list(placed)
    sheet = Image.new("RGBA", (w * cols, h * len(keys)))
    index = {}
    for r, key in enumerate(keys):
        index[key] = [r * cols + c for c in range(len(placed[key]))]
        for c, (img, cx, bottom) in enumerate(placed[key]):
            sheet.alpha_composite(img, (int(round(c * w + w / 2 - cx)), r * h + feet - bottom))
    save(sheet, f"characters/{name}.png")
    meta = {
        "frameWidth": w,
        "frameHeight": h,
        "bodyHeight": BODY,
        "feet": feet,
        "anims": {a: [i for k2 in parts for i in index[k2]] for a, parts in anims.items()},
    }
    with open(os.path.join(OUT, f"characters/{name}.json"), "w") as f:
        json.dump(meta, f)
    print(f"characters/{name}.png {sheet.size} cell {w}x{h}")


def mirror(imgs):
    return [i.transpose(Image.FLIP_LEFT_RIGHT) for i in imgs]


# --- People -------------------------------------------------------------------

DIRS = ["down", "up", "left", "right"]


def people():
    # The player: idle, two rows of walking, the hoe, two rows of harvest and
    # the nap, each row in four groups: down, up, left, right.
    img = load("player.png")
    groups = [(0, 290), (290, 540), (540, 815), (815, 1086)]
    rows = {  # y range, frames per group
        "idle": ((70, 260), [2, 2, 2, 2]),
        "walk1": ((270, 450), [3, 2, 3, 3]),
        "walk2": ((450, 625), [3, 2, 3, 3]),
        "hoe": ((630, 838), [2, 2, 2, 2]),
        "harvest1": ((838, 1032), [2, 2, 2, 2]),
        "harvest2": ((1032, 1220), [2, 2, 2, 2]),
    }
    frames = {}
    for key, ((y0, y1), counts) in rows.items():
        for d, (x0, x1), n in zip(DIRS, groups, counts):
            frames[f"{key}-{d}"] = split_block(img, (x0, y0, x1, y1), 1, n)[0]
    frames["sleep"] = split_block(img, (360, 1240, 720, 1430), 1, 2)[0]
    # The board's "left" groups for walking, the hoe and the harvest are not
    # left: every walking frame there faces right, one hoe frame faces the
    # viewer, and the harvest swaps sides from frame to frame. Its "right"
    # groups are right throughout, so left is right turned over. (Standing
    # still is drawn both ways, correctly, and stays as drawn.)
    for key in ("walk1", "walk2", "hoe", "harvest1", "harvest2"):
        frames[f"{key}-left"] = mirror(frames[f"{key}-right"])
    anims = {}
    for d in DIRS:
        anims[f"idle-{d}"] = [f"idle-{d}"]
        anims[f"walk-{d}"] = [f"walk1-{d}", f"walk2-{d}"]
        anims[f"hoe-{d}"] = [f"hoe-{d}"]
        anims[f"harvest-{d}"] = [f"harvest1-{d}", f"harvest2-{d}"]
    anims["sleep"] = ["sleep"]
    character("player", frames, anims, "idle-down")

    # The three people: four rows standing (2 frames) above, four rows
    # walking (4 frames) below; rows face down, left, right, up.
    img = load("npcs.png")
    facing = ["down", "left", "right", "up"]
    blocks = {
        "sir_shadow": ((150, 0, 410, 583), (25, 583, 495, 1086)),
        "mira": ((595, 0, 860, 586), (500, 583, 955, 1086)),
        "bram": ((1060, 0, 1300, 586), (960, 583, 1420, 1086)),
    }
    for name, (idle_box, walk_box) in blocks.items():
        idle = split_block(img, idle_box, 4, 2)
        walk = split_block(img, walk_box, 4, 4)
        frames = {}
        for r, d in enumerate(facing):
            frames[f"idle-{d}"] = idle[r]
            frames[f"walk-{d}"] = walk[r]
        anims = {f"{a}-{d}": [f"{a}-{d}"] for a in ("idle", "walk") for d in DIRS}
        character(name, frames, anims, "idle-down")


# --- Tiles --------------------------------------------------------------------

# The board's cells, measured: rounded squares of slightly different sizes.
TILE_COLS = [27, 141, 251, 359, 481, 586, 719, 850, 964, 1084, 1195, 1307, 1420]
TILE_ROWS = [24, 136, 254, 368, 477, 575, 684]


def cell(img, r, c, inset=12):
    """One board cell, without its dark rounded rim, as a 64 px tile."""
    box = (TILE_COLS[c] + inset, TILE_ROWS[r] + inset, TILE_COLS[c + 1] - inset, TILE_ROWS[r + 1] - inset)
    return img.crop(box).resize((TILE, TILE), Image.LANCZOS)


def seamless(tile, base=None):
    """The tile's middle, with edges taken from `base` (the tile itself by
    default) shifted half a tile, so tiles laid side by side show no line
    where they meet. Tiles made on the same base also meet each other
    cleanly: every kind of grass shares the plain grass's edges."""
    arr = np.asarray(tile).astype(float)
    edge = np.asarray(base if base is not None else tile).astype(float)
    shifted = np.roll(np.roll(edge, TILE // 2, axis=0), TILE // 2, axis=1)
    ramp = np.minimum(np.arange(TILE), np.arange(TILE)[::-1]) / (TILE / 2)
    weight = np.clip(np.minimum.outer(ramp, ramp) * 2.2, 0, 1)[:, :, None]
    return Image.fromarray((arr * weight + shifted * (1 - weight)).astype(np.uint8))


def sprite_tile(img, box, width=None):
    """A loose drawing (a flower, a post) set on a transparent 64 px tile,
    standing on its bottom edge."""
    piece = trim(img.crop(box))
    scale = min((width or TILE) / piece.width, TILE / piece.height)
    piece = piece.resize((max(1, round(piece.width * scale)), max(1, round(piece.height * scale))), Image.LANCZOS)
    out = Image.new("RGBA", (TILE, TILE))
    out.alpha_composite(piece, ((TILE - piece.width) // 2, TILE - piece.height))
    return out


def path_tile(grass, dirt, n, s, w, e):
    """A dirt path across grass, joined toward the given sides. The board's
    own path pieces do not cover every join, so they are drawn here from its
    grass and its dirt."""
    mask = Image.new("L", (TILE, TILE), 0)
    d = ImageDraw.Draw(mask)
    lo, hi = TILE * 0.22, TILE * 0.78
    d.rounded_rectangle((lo, lo, hi, hi), radius=TILE * 0.18, fill=255)
    if n:
        d.rectangle((lo, -1, hi, TILE / 2), fill=255)
    if s:
        d.rectangle((lo, TILE / 2, hi, TILE), fill=255)
    if w:
        d.rectangle((-1, lo, TILE / 2, hi), fill=255)
    if e:
        d.rectangle((TILE / 2, lo, TILE, hi), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.6))
    rim = mask.filter(ImageFilter.MaxFilter(5)).point(lambda v: 90 if v > 40 else 0)
    out = grass.copy()
    shade = Image.new("RGBA", (TILE, TILE), (92, 64, 32, 255))
    out = Image.composite(shade, out, rim)
    return Image.composite(dirt, out, mask)


def tiles():
    img = load("tiles.png")
    named = {}
    plain = cell(img, 0, 0)
    for i, (r, c) in enumerate([(0, 0), (0, 1), (0, 2), (0, 11), (0, 9)]):
        named[f"grass_{i + 1}"] = seamless(cell(img, r, c), base=plain)
    named["bare_dirt"] = seamless(cell(img, 1, 0))
    named["untilled"] = cell(img, 3, 4)
    named["tilled_dry"] = cell(img, 3, 5, inset=6)
    named["tilled_wet"] = cell(img, 3, 6, inset=6)
    named["soil_locked"] = cell(img, 3, 11, inset=6)
    # A tended plot: the board's wooden frame (from a plot with seedlings)
    # around plain tilled soil.
    framed = cell(img, 3, 7, inset=6)
    inner = cell(img, 3, 5, inset=6)
    hole = Image.new("L", (TILE, TILE), 0)
    ImageDraw.Draw(hole).rectangle((TILE * 0.2, TILE * 0.2, TILE * 0.8, TILE * 0.8), fill=255)
    framed = Image.composite(inner, framed, hole.filter(ImageFilter.GaussianBlur(1)))
    for lvl in (1, 2, 3):
        named[f"soil_level_{lvl}"] = framed
    named["stone_path"] = cell(img, 3, 3)

    grass, dirt = named["grass_1"], named["bare_dirt"]
    named["path_vertical"] = path_tile(grass, dirt, 1, 1, 0, 0)
    named["path_horizontal"] = path_tile(grass, dirt, 0, 0, 1, 1)
    named["path_corner"] = path_tile(grass, dirt, 1, 0, 0, 1)  # north and east
    named["path_cross"] = path_tile(grass, dirt, 1, 1, 1, 1)

    # The pond: middle, edges and outer corners; the missing sides are the
    # board's own pieces turned over.
    flip_v = lambda t: t.transpose(Image.FLIP_TOP_BOTTOM)
    water = seamless(cell(img, 4, 6, inset=18))
    pond = {
        0: water,
        1: cell(img, 4, 1, inset=4),
        3: cell(img, 5, 0, inset=8),
        4: cell(img, 5, 2, inset=4),
        5: cell(img, 4, 0, inset=4),
        7: cell(img, 4, 2, inset=4),
    }
    pond[2] = flip_v(pond[1])
    pond[6] = flip_v(pond[5])
    pond[8] = flip_v(pond[7])
    for i in (9, 10, 11, 12):
        pond[i] = water
    pond[13] = cell(img, 5, 1, inset=14)
    pond[14] = cell(img, 5, 6, inset=14)
    pond[15] = seamless(cell(img, 4, 9, inset=18))
    for i, t in pond.items():
        named[f"pond_{i}"] = t

    # The fence: a panel for the rails, a post for the sides and corners, and
    # the gate left open as a gap.
    panel = sprite_tile(img, (30, 690, 147, 783))
    post = sprite_tile(img, (485, 688, 522, 784), width=TILE * 0.3)
    named["fence_horizontal"] = panel
    named["fence_vertical"] = post
    for corner in ("tl", "tr", "bl", "br"):
        named[f"fence_corner_{corner}"] = post
    named["fence_post"] = post
    named["gate_open"] = Image.new("RGBA", (TILE, TILE))
    named["gate_closed"] = sprite_tile(img, (847, 692, 988, 787))

    # Small things on the grass.
    small = lambda box, wide=0.8: sprite_tile(img, box, width=TILE * wide)
    named["small_rock"] = small((230, 802, 312, 882), 0.6)
    named["weeds"] = small((1221, 800, 1286, 886), 0.6)
    named["mushroom"] = small((1100, 786, 1222, 892), 0.7)
    named["log"] = small((934, 885, 1089, 990), 1.0)
    named["flower_white"] = small((1297, 898, 1349, 1000), 0.5)
    named["flower_pink"] = small((515, 895, 608, 1000), 0.7)
    named["flower_purple"] = small((1342, 790, 1424, 899), 0.6)
    named["flower_yellow"] = small((833, 903, 918, 997), 0.6)
    named["flower_red"] = small((610, 893, 714, 997), 0.7)

    # Each tile sits in its own cell with its edge pixels repeated around it,
    # so smoothing a tile as it shrinks never reaches into its neighbour (which
    # showed as faint lines between grass tiles).
    cols, pad = 16, 2
    names = list(named)
    rows = (len(names) + cols - 1) // cols
    step = TILE + 2 * pad
    sheet = Image.new("RGBA", (cols * step, rows * step))
    atlas = {"tile_size": TILE, "margin": pad, "spacing": 2 * pad, "atlas_columns": cols, "tiles": {}}
    for i, name in enumerate(names):
        x, y = i % cols, i // cols
        t = np.asarray(named[name])
        padded = np.pad(t, ((pad, pad), (pad, pad), (0, 0)), mode="edge")
        sheet.alpha_composite(Image.fromarray(padded), (x * step, y * step))
        atlas["tiles"][name] = {"atlas_x": x, "atlas_y": y}
    save(sheet, "tiles/farm.png")
    with open(os.path.join(OUT, "tiles/farm_atlas.json"), "w") as f:
        json.dump(atlas, f, indent=1)
    print(f"tiles/farm.png {sheet.size}, {len(names)} tiles")


# --- Things standing on the map ---------------------------------------------------


def frames_sheet(imgs, path, align="bottom"):
    """Equal cells side by side, each drawing centred, standing on the cell's
    bottom (or centred both ways)."""
    w = max(i.width for i in imgs)
    h = max(i.height for i in imgs)
    sheet = Image.new("RGBA", (w * len(imgs), h))
    for k, i in enumerate(imgs):
        y = h - i.height if align == "bottom" else (h - i.height) // 2
        sheet.alpha_composite(i, (k * w + (w - i.width) // 2, y))
    save(sheet, path)
    return {"w": w, "h": h, "count": len(imgs)}


def objects(frames):
    img = load("objects.png")
    # The drawing in the box, without the edge of its neighbour.
    piece = lambda box: split_block(img, box, 1, 1)[0][0]
    # Widths in map pixels, times SCALE.
    save(fit(piece((18, 38, 627, 501)), w=88 * SCALE), "objects/farmhouse.png")
    save(fit(piece((618, 196, 1058, 530)), w=60 * SCALE), "objects/shop_cart.png")
    save(fit(piece((1071, 267, 1430, 535)), w=40 * SCALE), "objects/workbench.png")
    save(fit(piece((493, 521, 807, 782)), w=36 * SCALE), "objects/quest_board.png")
    boxes = [(105, 538, 245, 770), (298, 538, 441, 767)]
    frames["mailbox"] = frames_sheet([fit(piece(b), h=36 * SCALE) for b in boxes], "objects/mailbox.png")
    trees = split_block(img, (0, 785, 650, 1060), 1, 3)[0]
    frames["tree"] = frames_sheet([fit(t, w=44 * SCALE) for t in trees], "objects/tree.png")
    save(fit(piece((634, 883, 801, 1051)), w=22 * SCALE), "objects/bush.png")
    save(fit(piece((805, 900, 1077, 1054)), w=30 * SCALE), "objects/rock_big.png")
    stumps = split_block(img, (1078, 900, 1446, 1058), 1, 3)[0]
    save(fit(stumps[0], w=22 * SCALE), "objects/stump.png")


def crops(frames):
    img = load("crops.png")
    cols = [(200, 500), (525, 828), (845, 1145), (1158, 1462), (1478, 1808)]
    rows = {"sprout": (10, 290), "bloom": (290, 535), "golden": (535, 780)}
    for name, (y0, y1) in rows.items():
        stages = [trim(img.crop((x0, y0, x1, y1))) for x0, x1 in cols]
        stages = [fit(s, w=round(30 * SCALE * s.width / 300)) for s in stages]
        frames[f"crop-{name}"] = frames_sheet(stages, f"crops/{name}.png")


# --- Icons, faces, effects, frames -------------------------------------------------


def items():
    img = load("items.png")
    boxes = {
        "seed_sprout": (100, 72, 344, 342),
        "seed_bloom": (422, 72, 674, 342),
        "seed_golden": (746, 72, 998, 343),
        "ginger_tea": (1062, 89, 1426, 345),
        "coin": (1490, 103, 1727, 344),
        "stamina": (1830, 87, 2056, 344),
        "word_scroll": (90, 368, 407, 672),
        "chest_closed": (490, 394, 800, 661),
        "chest_open": (864, 356, 1188, 666),
        "quest_book": (1273, 368, 1623, 681),
        "letter": (1734, 384, 2076, 666),
    }
    for name, box in boxes.items():
        piece = trim(img.crop(box))
        side = 96
        k = side / max(piece.size)
        piece = piece.resize((round(piece.width * k), round(piece.height * k)), Image.LANCZOS)
        out = Image.new("RGBA", (side, side))
        out.alpha_composite(piece, ((side - piece.width) // 2, (side - piece.height) // 2))
        save(out, f"items/{name}.png")


def portraits():
    img = load("portraits.png")
    grid = split_block(img, (0, 0, 1448, 1086), 3, 4)
    side = 192
    for name, faces in zip(["sir_shadow", "mira", "bram"], grid):
        sheet = Image.new("RGBA", (side * 4, side))
        for k, face in enumerate(faces):
            s = side / max(face.size)
            face = face.resize((round(face.width * s), round(face.height * s)), Image.LANCZOS)
            sheet.alpha_composite(face, (k * side + (side - face.width) // 2, side - face.height))
        save(sheet, f"portraits/{name}.png")


def effects(frames):
    img = load("ui.png")
    row = lambda box, n: split_block(img, box, 1, n)[0]
    pop = [fit(f, h=f.height * 24 * SCALE // 150) for f in row((40, 55, 930, 230), 5)]
    frames["harvest_pop"] = frames_sheet(pop, "fx/harvest_pop.png", align="middle")
    dust = [fit(f, h=f.height * 12 * SCALE // 130) for f in row((70, 255, 880, 415), 4)]
    frames["dust"] = frames_sheet(dust, "fx/dust.png")
    sparkle = [fit(f, h=f.height * 14 * SCALE // 130) for f in row((65, 435, 725, 585), 4)]
    frames["sparkle"] = frames_sheet(sparkle, "fx/sparkle.png", align="middle")
    zs = [fit(f, h=f.height * 10 * SCALE // 130) for f in row((1080, 425, 1410, 575), 3)]
    frames["sleep_z"] = frames_sheet(zs, "fx/sleep_z.png")
    bang = fit(trim(img.crop((1030, 238, 1196, 412))), w=14 * SCALE)
    lifted = Image.new("RGBA", (bang.width, bang.height + SCALE))
    lifted.alpha_composite(bang, (0, 0))
    lowered = Image.new("RGBA", lifted.size)
    lowered.alpha_composite(bang, (0, SCALE))
    frames["interact"] = frames_sheet([lowered, lifted], "fx/interact.png")

    # Frames and controls for the page, at twice the size the page shows them.
    save(fit(trim(img.crop((50, 590, 705, 810))), w=480), "ui/dialog_box.png")
    save(fit(trim(img.crop((754, 590, 1398, 810))), w=480), "ui/panel.png")
    save(fit(trim(img.crop((160, 805, 432, 1068))), w=256), "ui/joystick_base.png")
    save(fit(trim(img.crop((532, 875, 684, 1020))), w=128), "ui/joystick_knob.png")
    buttons = [fit(trim(img.crop(b)), w=128) for b in ((840, 850, 1040, 1043), (1045, 850, 1245, 1043))]
    frames_sheet(buttons, "ui/button_action.png", align="middle")


def main():
    frames = {}
    people()
    tiles()
    objects(frames)
    crops(frames)
    items()
    portraits()
    effects(frames)
    manifest = {"scale": SCALE, "frames": frames}
    with open(os.path.join(OUT, "art.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    print("art.json", json.dumps(manifest))


if __name__ == "__main__":
    main()
