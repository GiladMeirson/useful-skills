#!/usr/bin/env python3
"""Pre-render lint: direction contract (direction.json), score (timeline.json + words) and scene code.

  python3 scripts/lint.py                       # in the project folder: public/timeline.json, direction.json and src/
  python3 scripts/lint.py public/timeline.json --src src --words public/audio/narration.words.json
  python3 scripts/lint.py --json

Catches in seconds what a minutes-long render would only reveal later: a piece with no declared direction, scenes
with the same composition and entrance, cuts mid-phrase, scenes with too much text for their time, stacked
SFX, APIs that make the render diverge from the preview, linear or off-token curves, colors outside the theme.
Exits with code 1 on any FAIL. Standard library only.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

WORDS_PER_SEC = 2.6  # per-scene cap; the script target is 2.3
CUT_TOLERANCE = 0.25  # a cut within 0.25 s of a phrase start counts as matched
SFX_MIN_GAP = 0.12
END_HOLD = 1.0

# (regex, level, message). Apply to src/**/*.ts(x).
CODE_RULES = [
    (r"\bMath\.random\s*\(", "FAIL", "Math.random(): use random(seed) from remotion"),
    (r"\bDate\.now\s*\(|\bnew Date\s*\(\s*\)|\bperformance\.now\s*\(", "FAIL", "wall clock: derive everything from useCurrentFrame()"),
    (r"\bset(Timeout|Interval)\s*\(|\brequestAnimationFrame\s*\(", "FAIL", "browser timer: the render does not wait for it"),
    (r"\buseFrame\s*\(", "FAIL", "React Three Fiber useFrame(): animate with useCurrentFrame()"),
    (r"\btransition\s*:\s*['\"`]|\banimation\s*:\s*['\"`]|@keyframes|\banimate-[a-z]", "FAIL", "CSS animation or transition: flickers in the render"),
    (r"\bEasing\.(bounce|elastic)\b", "FAIL", "bounce and elastic are forbidden by the doctrine"),
    (r"<(video|audio|img)\b", "WARN", "HTML media tag: use OffthreadVideo, Audio or Img from remotion (they wait for loading)"),
    (r"[\U0001F300-\U0001FAFF☀-➿]", "WARN", "emoji in scene code"),
]
BEZIER = re.compile(r"\bEasing\.(bezier|in|out|inOut|poly|exp|circle|back|cubic|quad)\b")


def lint_score(tl: dict, words: list[dict] | None, absolute: bool = False) -> list[dict]:
    out = []

    def add(level, where, msg):
        out.append({"level": level, "where": where, "msg": msg})

    dur, scenes = float(tl.get("duration", 0)), tl.get("scenes", [])
    if not scenes:
        add("FAIL", "score", "no scenes")
        return out
    if abs(scenes[0]["start"]) > 0.02:
        add("FAIL", scenes[0]["id"], f"the first scene starts at {scenes[0]['start']} s, not at 0")
    if abs(scenes[-1]["end"] - dur) > 0.05:
        add("FAIL", scenes[-1]["id"], f"the last scene ends at {scenes[-1]['end']} s and the duration is {dur} s")
    for a, b in zip(scenes, scenes[1:]):
        if abs(a["end"] - b["start"]) > 0.02:
            add("FAIL", f"{a['id']} > {b['id']}", f"gap or overlap: {a['end']} s vs {b['start']} s")
    lens = [s["end"] - s["start"] for s in scenes]
    for s, n in zip(scenes, lens):
        if n < 1.0:
            add("WARN", s["id"], f"{n:.2f} s scene: too short to read anything")
    if len(lens) > 2 and max(lens) / max(min(lens), 0.01) < 1.25:
        add("WARN", "pacing", f"all scenes have nearly the same length ({min(lens):.1f} to {max(lens):.1f} s): no pacing contrast")

    sfx = sorted(tl.get("sfx", []), key=lambda e: e["at"])
    for e in sfx:
        if not 0 <= e["at"] <= dur:
            add("FAIL", f"sfx {e['type']}", f"event at {e['at']} s, outside the duration")
    for a, b in zip(sfx, sfx[1:]):
        if b["at"] - a["at"] < SFX_MIN_GAP:
            add("WARN", f"sfx {a['type']} + {b['type']}", f"two events {b['at'] - a['at']:.2f} s apart at {a['at']:.2f} s: one masks the other")

    if not words:
        if tl.get("narration"):
            add("WARN", "narration", "score has narration but words.json was not found: speech checks skipped")
        return out
    off = 0.0 if absolute else float((tl.get("narration") or {}).get("start", 0))
    t = [(w["word"], w["start"] + off, w["end"] + off) for w in words]
    if t[0][1] < 0.1:
        add("WARN", "narration", f"the voice starts at {t[0][1]:.2f} s: allow 0.1 to 0.3 s after the cut")
    if t[-1][2] > dur + 0.02:
        add("FAIL", "narration", f"the voice ends at {t[-1][2]:.2f} s and the video at {dur:.2f} s")
    elif dur - t[-1][2] < END_HOLD:
        add("WARN", "ending", f"only {dur - t[-1][2]:.2f} s after the last word: hold the final frame for 1 s or more")
    starts = [t[0][1]] + [t[i + 1][1] for i in range(len(t) - 1) if re.search(r"[.!?…:]$", t[i][0])]
    for s in scenes[1:]:
        cut = s["start"]
        near = min(starts, key=lambda x: abs(x - cut))
        # For punctuated words the TTS end includes the pause: only the first 60% counts as speech.
        mid = next((w for w in t if w[1] + 0.03 < cut < w[1] + (w[2] - w[1]) * (0.6 if re.search(r"[.,;:!?…]$", w[0]) else 1) - 0.03), None)
        if mid:
            add("FAIL", s["id"], f"the cut at {cut:.2f} s falls inside the word '{mid[0]}'")
        elif abs(near - cut) > CUT_TOLERANCE and cut < t[-1][2]:
            add("WARN", s["id"], f"the cut at {cut:.2f} s does not match a phrase start (nearest is {near:.2f} s)")
    for s, n in zip(scenes, lens):
        spoken = [w for w in t if s["start"] <= w[1] < s["end"]]
        if spoken and len(spoken) / n > WORDS_PER_SEC:
            add("WARN", s["id"], f"{len(spoken)} words in {n:.1f} s ({len(spoken) / n:.1f} per second): cut text, target 2.3")
    return out


def linear_interpolates(text: str) -> list[int]:
    """Lines with interpolate(frame, ...) without easing: Remotion's default is linear, the mark of an amateur."""
    hits = []
    for m in re.finditer(r"\binterpolate\s*\(", text):
        depth, i = 1, m.end()
        while i < len(text) and depth:
            depth += {"(": 1, ")": -1}.get(text[i], 0)
            i += 1
        call = text[m.end():i - 1]
        first = call.split(",", 1)[0].strip()
        if re.search(r"frame|^t$|time", first, re.I) and "easing" not in call:
            hits.append(text.count("\n", 0, m.start()) + 1)
    return hits


def lint_code(src: pathlib.Path) -> list[dict]:
    out, fades, moves, loose = [], 0, 0, []
    for f in sorted(src.rglob("*.ts*")):
        if "node_modules" in f.parts:
            continue
        in_tokens = f.name == "motion.ts"
        text = f.read_text(encoding="utf-8")
        if not in_tokens:
            for n in linear_interpolates(text):
                out.append({"level": "WARN", "where": f"{f.relative_to(src.parent)}:{n}", "msg": "interpolate() without easing is linear motion: use tween() or keys() with an ease.* token"})
        if f.name not in ("theme.ts", "theme.tsx"):
            loose += [(f"{f.relative_to(src.parent)}:{text.count(chr(10), 0, m.start()) + 1}", m.group(0)) for m in re.finditer(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])", "\n".join(l.split("//")[0] for l in text.splitlines()))]
        for n, line in enumerate(text.splitlines(), 1):
            code = line.split("//")[0] if "://" not in line else line
            for rx, level, msg in CODE_RULES:
                if re.search(rx, code):
                    out.append({"level": level, "where": f"{f.relative_to(src.parent)}:{n}", "msg": msg})
            if not in_tokens and BEZIER.search(code):
                out.append({"level": "WARN", "where": f"{f.relative_to(src.parent)}:{n}", "msg": "curve created in the scene: use the ease.* tokens from lib/motion.ts"})
            fades += len(re.findall(r"\bopacity\s*[:=]", code))
            moves += len(re.findall(r"\b(translate[XYZ3d]*|scale[XY]?|rotate[XYZ]?|clipPath|strokeDashoffset)\b", code))
    if loose:
        sample = ", ".join(f"{c} at {w}" for w, c in loose[:4])
        out.append({"level": "WARN", "where": "src", "msg": f"{len(loose)} colors written outside theme.ts ({sample}): the piece's palette lives in public/brand.json"})
    if fades >= 6 and fades > 2 * max(moves, 1):
        out.append({"level": "WARN", "where": "src", "msg": f"{fades} opacity uses vs {moves} transform, mask or stroke uses: everything fading in looks generated"})
    return out


DIRECTION_FIELDS = ("concept", "law", "motif", "options", "chosen", "approved_by", "scenes")


def lint_direction(root: pathlib.Path, tl: dict) -> list[dict]:
    """Direction contract: what the piece declares before any scene exists (references/direction.md)."""
    out = []

    def add(level, where, msg):
        out.append({"level": level, "where": where, "msg": msg})

    p = root / "direction.json"
    if not p.is_file():
        add("FAIL", "direction.json", "the piece has no direction contract: write direction.json before animating (references/direction.md)")
        return out
    d = json.loads(p.read_text(encoding="utf-8"))
    for k in DIRECTION_FIELDS:
        if not d.get(k):
            add("FAIL", "direction.json", f"missing '{k}'")
    if out:
        return out
    if len(d["options"]) < 2:
        add("FAIL", "direction.json", "only one direction considered: build 2 to 3 styleframes of different directions before choosing")
    if d["chosen"] not in [o.get("name") for o in d["options"]]:
        add("FAIL", "direction.json", f"'chosen' ({d['chosen']}) is not one of the options")
    if d["approved_by"] == "agent":
        add("WARN", "direction.json", "the direction was chosen by the agent without user approval: say so at delivery")
    elif d["approved_by"] != "user":
        add("FAIL", "direction.json", "'approved_by' must be 'user' (the user chose) or 'agent' (the request delegated the choice)")
    declared = {s.get("id"): s for s in d["scenes"]}
    ids = [s["id"] for s in tl.get("scenes", [])]
    for i in ids:
        s = declared.get(i)
        if not s:
            add("FAIL", i, "scene not declared in direction.json (layout, entrance, hero)")
        elif not all(s.get(k) for k in ("layout", "entrance", "hero")):
            add("FAIL", i, "the scene declaration needs layout, entrance and hero")
    seq = [declared[i] for i in ids if i in declared and declared[i].get("layout") and declared[i].get("entrance")]
    if len(seq) >= 3:
        layouts = [s["layout"] for s in seq]
        top = max(set(layouts), key=layouts.count)
        if len(set(layouts)) == 1:
            add("FAIL", "direction", f"all scenes declare the same layout ('{top}'): that is a brand slide, not a film")
        elif layouts.count(top) > len(layouts) / 2:
            add("WARN", "direction", f"{layouts.count(top)} of {len(layouts)} scenes use the layout '{top}'")
        entrances = [s["entrance"] for s in seq]
        if len(set(entrances)) == 1:
            add("FAIL", "direction", f"all scenes enter the same way ('{entrances[0]}')")
    for a, b in zip(seq, seq[1:]):
        if (a["layout"], a["entrance"]) == (b["layout"], b["entrance"]):
            add("WARN", f"{a['id']} > {b['id']}", f"neighboring scenes with the same layout and entrance ({a['layout']}, {a['entrance']})")
    return out


def lint_env(root: pathlib.Path) -> list[dict]:
    if not (root / ".env").is_file():
        return []
    gi = root / ".gitignore"
    rules = [l.strip() for l in gi.read_text(encoding="utf-8").splitlines()] if gi.is_file() else []
    if any(r in (".env", "/.env", ".env*", "*.env") for r in rules):
        return []
    return [{"level": "FAIL", "where": ".env", "msg": "there is a .env and .gitignore does not ignore it: rename the template's gitignore to .gitignore"}]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("timeline", nargs="?", default="public/timeline.json")
    ap.add_argument("--words", default=None, help="default: <narration.file without extension>.words.json next to the score")
    ap.add_argument("--src", default=None, help="default: src/ next to public/")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    tlp = pathlib.Path(a.timeline)
    tl = json.loads(tlp.read_text(encoding="utf-8"))
    wp = pathlib.Path(a.words) if a.words else None
    if wp is None and (tl.get("narration") or {}).get("file"):
        wp = tlp.parent / (str(pathlib.Path(tl["narration"]["file"]).with_suffix("")) + ".words.json")
    words = json.loads(wp.read_text(encoding="utf-8"))["words"] if wp and wp.exists() else None
    cues = tlp.parent / "cues.json"
    absolute = False
    if not a.words and cues.exists():  # score.py: words already in video time, from any voice source
        cw = json.loads(cues.read_text(encoding="utf-8")).get("words") or []
        words, absolute = (cw or words), bool(cw)
    src = pathlib.Path(a.src) if a.src else tlp.parent.parent / "src"
    root = tlp.resolve().parent.parent

    res = lint_direction(root, tl) + lint_score(tl, words, absolute) + (lint_code(src) if src.is_dir() else []) + lint_env(root)
    fails = sum(r["level"] == "FAIL" for r in res)
    if a.json:
        print(json.dumps({"pass": not fails, "fails": fails, "warns": len(res) - fails, "issues": res}, ensure_ascii=False, indent=1))
    else:
        for r in res:
            print(f"{r['level']:4s}  {r['where']}: {r['msg']}")
        print(json.dumps({"pass": not fails, "fails": fails, "warns": len(res) - fails}))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
