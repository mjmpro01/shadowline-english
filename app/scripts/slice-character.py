#!/usr/bin/env python3
"""
Lays a hand-drawn character sheet out on the grid the Arena reads.

An artist's sheet keeps the game's order — rows of directions, frames left to
right — but not its grid: frames sit wherever they were drawn and touch the
row above. This finds each frame, lines them all up by the top of the head and
the soles of the feet, and writes:

  OUT.png   4 columns x 17 rows of equal cells (see public/game/README.md)
  OUT.json  {"frameWidth", "frameHeight", "bodyHeight"}, which tells the game
            the cell size and how tall the figure is, so it can scale it to
            the map

Usage:  python3 scripts/slice-character.py SRC.png OUT.png

The source's rows, top to bottom (what player_start_pack's sheet holds):
  idle    down, up, left, right   2 frames
  walk    down, up, left, right   4 frames
  hoe     down, up, left, right   3 frames
  harvest down, up, left          3 frames  (right is left, mirrored)
  sleep                           2 frames

Needs Pillow and numpy.
"""

import json
import sys

import numpy as np
from PIL import Image

# (frames, target row) for each source row; then target rows made by mirroring.
SOURCE_ROWS = (
    [(2, r) for r in range(0, 4)]
    + [(4, r) for r in range(4, 8)]
    + [(3, r) for r in range(8, 12)]
    + [(3, r) for r in range(12, 15)]
    + [(2, 16)]
)
MIRRORED = {15: 14}  # harvest right = harvest left, flipped
COLS, ROWS = 4, 17
SOLID = 60  # alpha above which a pixel counts as drawn
PAD = 2


def bands(profile, expected):
    """Splits rows of drawn pixels into `expected` bands, cutting where the
    fewest pixels are when two rows touch."""
    out, start = [], None
    for i, v in enumerate(profile):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append([start, i])
            start = None
    if start is not None:
        out.append([start, len(profile)])
    while len(out) < expected:
        # The tallest band holds more than one row: cut it at its thinnest.
        k = max(range(len(out)), key=lambda j: out[j][1] - out[j][0])
        a, b = out[k]
        lo, hi = a + (b - a) // 4, b - (b - a) // 4
        cut = lo + int(np.argmin(profile[lo:hi]))
        out[k:k + 1] = [[a, cut], [cut, b]]
        out.sort()
    if len(out) != expected:
        raise SystemExit(f"found {len(out)} rows, expected {expected}")
    return out


def frames_in(mask, expected):
    """The frames along one row: runs of drawn columns, with specks (dust,
    seeds, Zs) joined to their neighbour until `expected` remain."""
    cols = mask.any(axis=0)
    segs, start = [], None
    for x, v in enumerate(cols):
        if v and start is None:
            start = x
        elif not v and start is not None:
            segs.append([start, x])
            start = None
    if start is not None:
        segs.append([start, len(cols)])
    while len(segs) > expected:
        # Join across the narrowest gap, preferring one with a speck beside it.
        def cost(i):
            gap = segs[i + 1][0] - segs[i][1]
            small = min(segs[i][1] - segs[i][0], segs[i + 1][1] - segs[i + 1][0])
            return gap + small
        i = min(range(len(segs) - 1), key=cost)
        segs[i:i + 2] = [[segs[i][0], segs[i + 1][1]]]
    if len(segs) != expected:
        raise SystemExit(f"found {len(segs)} frames in a row, expected {expected}")
    return segs


def pieces(drawn):
    """The separate pieces of a drawing: lists of (y, x), four-connected."""
    h, w = drawn.shape
    seen = np.zeros_like(drawn)
    out = []
    for sy, sx in zip(*np.nonzero(drawn)):
        if seen[sy, sx]:
            continue
        piece, stack = [], [(sy, sx)]
        seen[sy, sx] = True
        while stack:
            y, x = stack.pop()
            piece.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and drawn[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        out.append(piece)
    return out


def cut_frame(px, y0, y1, x0, x1, reach=40):
    """One frame, cut by what belongs to it rather than only by a straight
    line: a raised hoe reaches into the row above and dirt falls into the row
    below. A piece drawn near the band goes whole to the row its middle is in;
    a piece that runs on into the next figure (a hat touching the feet above
    it) is cut at the band's edge."""
    top = max(0, y0 - reach)
    area = px[top:y1 + reach, x0:x1].copy()
    h = area.shape[0]
    keep = np.zeros(area.shape[:2], dtype=bool)
    band = np.zeros_like(keep)
    band[y0 - top:y1 - top] = True
    # Pieces are found on the solid pixels, so the soft edge around them does
    # not join one figure's hoe to the next one's hat; the edge comes back
    # afterwards, from around whatever was kept.
    for piece in pieces(area[:, :, 3] > SOLID):
        ys = [y for y, _ in piece]
        spot = tuple(zip(*piece))
        if (min(ys) == 0 and top > 0) or max(ys) == h - 1:
            keep[spot] = band[spot]
        elif y0 <= top + sum(ys) / len(ys) < y1:
            keep[spot] = True
    near = keep.copy()
    for _ in range(2):
        grown = near.copy()
        grown[1:] |= near[:-1]
        grown[:-1] |= near[1:]
        grown[:, 1:] |= near[:, :-1]
        grown[:, :-1] |= near[:, 1:]
        near = grown
    keep = near & (area[:, :, 3] > 0) & (keep | (area[:, :, 3] <= SOLID))
    area[~keep] = 0
    ys = np.where(keep.any(axis=1))[0]
    return Image.fromarray(area[ys[0]:ys[-1] + 1])


def anchor(alpha):
    """Where the figure stands in a cropped frame: the middle of the hat, and
    the soles of the feet right under it (so a hoe or a turnip held out to the
    side does not move the figure)."""
    solid = alpha > 128
    ys = np.where(solid.any(axis=1))[0]
    top = ys[0]
    hat = solid[top:top + max(8, (ys[-1] - top) // 5)]
    xs = np.where(hat.any(axis=0))[0]
    cx = (xs[0] + xs[-1]) / 2
    half = max(10, (xs[-1] - xs[0]) // 4)
    core = solid[:, int(cx - half):int(cx + half)]
    rows = np.where(core.sum(axis=1) >= 3)[0]
    return cx, top, rows[-1] + 1


def main(src, out):
    img = Image.open(src).convert("RGBA")
    px = np.array(img)
    mask = px[:, :, 3] > SOLID
    rows = bands(mask.sum(axis=1), len(SOURCE_ROWS))

    frames = {}  # (target row, col) -> (image, cx, top, bottom)
    for (y0, y1), (count, target) in zip(rows, SOURCE_ROWS):
        for col, (x0, x1) in enumerate(frames_in(mask[y0:y1], count)):
            crop = cut_frame(px, y0, y1, x0, x1)
            cx, top, bottom = anchor(np.array(crop)[:, :, 3])
            frames[(target, col)] = (crop, cx, top, bottom)
    for target, source in MIRRORED.items():
        for col in range(COLS):
            if (source, col) not in frames:
                continue
            crop, cx, top, bottom = frames[(source, col)]
            frames[(target, col)] = (crop.transpose(Image.FLIP_LEFT_RIGHT), crop.width - cx, top, bottom)

    left = max(cx for _, cx, _, _ in frames.values())
    right = max(c.width - cx for c, cx, _, _ in frames.values())
    up = max(bottom for _, _, _, bottom in frames.values())
    down = max(c.height - bottom for c, _, _, bottom in frames.values())
    w = int(np.ceil(max(left, right))) * 2 + PAD * 2
    h = int(np.ceil(up + down)) + PAD * 2
    w += w % 2
    h += h % 2
    foot = h - PAD - int(np.ceil(down))

    sheet = Image.new("RGBA", (w * COLS, h * ROWS))
    for (row, col), (crop, cx, _, bottom) in frames.items():
        sheet.alpha_composite(crop, (int(round(col * w + w / 2 - cx)), row * h + foot - bottom))
    sheet.save(out, optimize=True)

    standing = [bottom - top for (row, _), (_, _, top, bottom) in frames.items() if row < 4]
    meta = {"frameWidth": w, "frameHeight": h, "bodyHeight": int(np.median(standing)), "feet": foot}
    with open(out.rsplit(".", 1)[0] + ".json", "w") as f:
        json.dump(meta, f)
    print(f"{out}: {w * COLS}x{h * ROWS}, {len(frames)} frames, {meta}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
