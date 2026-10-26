#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "pillow"]
# ///
"""Layout QA on the stills: measures the actual text instead of trusting the eye.

  uv run scripts/layout.py out/stills                               # reads index.json, layout.json and the PNGs
  uv run scripts/layout.py out/stills --timeline public/timeline.json   # also compares scenes with each other
  uv run scripts/layout.py out/stills --json
Input: the stills.cjs folder. layout.json comes from the <Probe /> (box, size, color and visibility of each
DOM text); the background color comes from the PNG pixels. Only settled text is judged (visible, opaque, no blur):
text mid-entrance does not count. Ornamental text that bleeds off-frame on purpose carries data-decor and is ignored.
FAIL: text clipped by the edge, outside the action area, overlapping other text, below the minimum legible size
or contrast below 3:1. WARN: outside the text safe area, contrast below 4.5:1, small type and scenes with the
same composition spine. Exits with code 1 on any FAIL.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

import numpy as np
from PIL import Image

SETTLED = {"vis": 0.88, "op": 0.9, "blur": 2.0}
MIN_FONT_FAIL, MIN_FONT_WARN = 20, 28  # px on a 1080 short side: below this it is unreadable on a phone
OVERLAP = 0.15
SAME_PAIR, SAME_ALL = 0.90, 0.80  # correlation between scene thumbnails


def lum(rgb):
    c = np.asarray(rgb, float) / 255
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return float(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2])


def contrast(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def parse_color(s: str):
    m = re.findall(r"[\d.]+", s or "")
    if len(m) < 3:
        return None, 0.0
    return tuple(float(x) for x in m[:3]), (float(m[3]) if len(m) > 3 else 1.0)


def background(img: np.ndarray, fg) -> tuple[tuple, float]:
    """Background color of the text box: the dominant color other than the text's own, and how much of the box it covers."""
    px = img.reshape(-1, 3).astype(float)
    bins = (px // 24).astype(int)
    code = bins[:, 0] * 10000 + bins[:, 1] * 100 + bins[:, 2]
    keys, counts = np.unique(code, return_counts=True)
    for k in keys[np.argsort(-counts)][:4]:
        mean = px[code == k].mean(0)
        if np.linalg.norm(mean - np.asarray(fg)) > 28:  # closer than this is the glyph itself
            return tuple(mean), float((code == k).mean())
    return tuple(fg), 1.0  # the whole box has the text color: it does not separate from the background


def safe_areas(w, h):
    reels = w / h < 0.8
    text = (w * 0.1, h * 360 / 1920, w * 0.9, h * 1420 / 1920) if reels else (w * 0.1, h * 0.1, w * 0.9, h * 0.9)
    return text, (w * 0.05, h * 0.05, w * 0.95, h * 0.95)


def thumb(path: pathlib.Path) -> np.ndarray:
    im = Image.open(path).convert("L").resize((24, 24), Image.BILINEAR)
    a = np.asarray(im, float)
    return (a - a.mean()) / (a.std() + 1e-6)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("stills", nargs="?", default="out/stills")
    ap.add_argument("--timeline", default=None, help="timeline.json: compares scene compositions with each other")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    d = pathlib.Path(a.stills)
    idx = json.loads((d / "index.json").read_text(encoding="utf-8"))
    lp = d / "layout.json"
    if not lp.exists():
        sys.exit("layout.json does not exist: generate the stills with this version's stills.cjs")
    lay = json.loads(lp.read_text(encoding="utf-8"))
    W, H, scale = lay["width"], lay["height"], idx.get("scale", 0.5)
    u = min(W, H) / 1080
    text_safe, action_safe = safe_areas(W, H)
    res, seen, measured = [], set(), 0

    def add(level, t, what, msg):
        key = (level, what, msg.split(" em ")[0])
        if key in seen:  # the same text with the same defect across several stills counts once
            return
        seen.add(key)
        res.append({"level": level, "t": t, "what": what, "msg": msg})

    # The same text may look small in a still because it is growing: use the largest size it reaches.
    biggest: dict[str, float] = {}
    for fr in lay["frames"]:
        for it in fr["items"] or []:
            biggest[it["text"]] = max(biggest.get(it["text"], 0), it["font"])

    for fr in lay["frames"]:
        if fr["items"] is None:
            continue
        measured += 1
        img = np.asarray(Image.open(d / fr["file"]).convert("RGB"))
        settled = [it for it in fr["items"] if it["vis"] >= SETTLED["vis"] and it["op"] >= SETTLED["op"] and it["blur"] < SETTLED["blur"]]
        # Text entirely off-frame is not on screen: not a layout defect.
        settled = [it for it in settled if it["x"] + it["w"] > 0 and it["y"] + it["h"] > 0 and it["x"] < W and it["y"] < H]
        for it in settled:
            x0, y0, x1, y1 = it["x"], it["y"], it["x"] + it["w"], it["y"] + it["h"]
            name = f"\"{it['text']}\""
            if x0 < -2 or y0 < -2 or x1 > W + 2 or y1 > H + 2:
                add("FAIL", fr["t"], name, f"text clipped by the frame edge ({x0},{y0} to {x1},{y1} in {W}x{H})")
            elif x0 < action_safe[0] or y0 < action_safe[1] or x1 > action_safe[2] or y1 > action_safe[3]:
                add("FAIL", fr["t"], name, "text outside the action area (90% of the frame): hugs the edge")
            elif x0 < text_safe[0] - 1 or y0 < text_safe[1] - 1 or x1 > text_safe[2] + 1 or y1 > text_safe[3] + 1:
                add("WARN", fr["t"], name, f"text outside the text safe area (y {y0} to {y1}, safe {round(text_safe[1])} to {round(text_safe[3])})")
            font = biggest[it["text"]]
            if font > it["font"] * 1.15:
                continue  # mid scale-in entrance: the still where it settles is what counts
            if it["font"] < MIN_FONT_FAIL * u:
                add("FAIL", fr["t"], name, f"{it['font']:.0f} px type: minimum legible is {MIN_FONT_FAIL * u:.0f} px in this format")
            elif it["font"] < MIN_FONT_WARN * u:
                add("WARN", fr["t"], name, f"{it['font']:.0f} px type: small for phones (recommended {MIN_FONT_WARN * u:.0f} px or more)")
            fg, alpha = parse_color(it["color"])
            crop = img[max(0, int(y0 * scale)):max(1, int(y1 * scale)), max(0, int(x0 * scale)):max(1, int(x1 * scale))]
            if fg and alpha * it["op"] > 0.6 and crop.size >= 48:
                bg, cover = background(crop, fg)
                ratio = contrast(fg, bg)
                tag = f"contrast {ratio:.1f}:1 (text {'#%02x%02x%02x' % tuple(int(v) for v in fg)} on {'#%02x%02x%02x' % tuple(int(v) for v in bg)})"
                if ratio < 3 and cover >= 0.35:
                    add("FAIL", fr["t"], name, f"{tag}: minimum 3:1")
                elif ratio < 3 or (ratio < 4.5 and it["font"] < 40 * u):
                    add("WARN", fr["t"], name, f"{tag}: recommended 4.5:1" + ("" if cover >= 0.35 else " (uneven background, check the frame)"))
        for i, p in enumerate(settled):
            for q in settled[i + 1:]:
                # The DOM box has the full font height (ascender and descender): with tight leading,
                # neighboring lines touch at the box without touching at the glyph. Compare the core.
                ix = min(p["x"] + p["w"], q["x"] + q["w"]) - max(p["x"], q["x"])
                iy = min(p["y"] + p["h"] * 0.84, q["y"] + q["h"] * 0.84) - max(p["y"] + p["h"] * 0.16, q["y"] + q["h"] * 0.16)
                if ix > 0 and iy > 0 and ix * iy > OVERLAP * min(p["w"] * p["h"], q["w"] * q["h"]) * 0.68:
                    add("FAIL", fr["t"], f"\"{p['text']}\" x \"{q['text']}\"", "two overlapping texts")

    if a.timeline:
        scenes = json.loads(pathlib.Path(a.timeline).read_text(encoding="utf-8"))["scenes"]
        picks = []
        for s in scenes:
            inside = [it for it in idx["stills"] if s["start"] <= it["t"] < s["end"]]
            if inside:
                mid = min(inside, key=lambda it: abs(it["t"] - (s["start"] + s["end"]) / 2))
                picks.append((s["id"], thumb(d / mid["file"])))
        if len(picks) >= 3:
            corr = {(x[0], y[0]): float((x[1] * y[1]).mean()) for i, x in enumerate(picks) for y in picks[i + 1:]}
            for (x, y), c in zip(zip(picks, picks[1:]), [corr[(x[0], y[0])] for x, y in zip(picks, picks[1:])]):
                if c > SAME_PAIR:
                    add("WARN", None, f"{x[0]} and {y[0]}", f"neighboring scenes with the same composition (similarity {c:.2f}): change the spine, framing or scale")
            med = float(np.median(list(corr.values())))
            if med > SAME_ALL:
                add("WARN", None, "piece", f"scenes share the same composition spine (median similarity {med:.2f}): the telltale sign of a template video")
            res.append({"level": "INFO", "t": None, "what": "scene distinctness", "msg": f"median similarity {med:.2f}, max {max(corr.values()):.2f} (warns above {SAME_ALL} and {SAME_PAIR})"})

    if not measured:
        res.append({"level": "WARN", "t": None, "what": "probe", "msg": "no still was measured: add <Probe /> to the composition (see the template Showcase)"})
    fails = sum(r["level"] == "FAIL" for r in res)
    warns = sum(r["level"] == "WARN" for r in res)
    if a.json:
        print(json.dumps({"pass": not fails, "fails": fails, "warns": warns, "frames": measured, "issues": res}, ensure_ascii=False, indent=1))
    else:
        for r in res:
            when = f"{r['t']:.2f}s " if r["t"] is not None else ""
            print(f"{r['level']:4s}  {when}{r['what']}: {r['msg']}")
        print(json.dumps({"pass": not fails, "fails": fails, "warns": warns, "frames": measured}))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
