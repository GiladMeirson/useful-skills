#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["requests", "numpy"]
# ///
"""Generates the ElevenLabs sound effects and music a score asks for. Run after score.py, before mix.py.

  uv run scripts/eleven_assets.py --dry      # what would be generated (count, seconds) + credits left
  uv run scripts/eleven_assets.py --yes      # generate what's missing; prints credits actually spent

In roteiro.json:
  SFX on a cue      "sfx": [{"at": "math", "eleven": "deep cinematic boom with a metallic tail", "dur": 1.6, "gain_db": -16}]
  SFX on every cut  "cut": {"sfx": {"eleven": "fast airy whoosh, short", "dur": 0.6, "gain_db": -20, "lead": 0.3}}
  Music bed         "music": {"eleven": "minimal tech, punchy drums, warm synth bass, 118 bpm, no vocals",
                              "file": "audio/music.mp3", "gain_db": -15, "duck_db": -9}
Each prompt is generated once and cached by hash (public/audio/eleven/); changing timing costs nothing.
mix.py refuses to mix while a requested ElevenLabs asset is missing. Never spend without the user's yes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import eleven  # noqa: E402


def sfx_path(base: pathlib.Path, ev: dict) -> pathlib.Path:
    h = hashlib.sha1(json.dumps([ev["eleven"], ev.get("dur"), ev.get("loop", False), ev.get("influence", 0.4)]).encode()).hexdigest()[:10]
    return base / "audio" / "eleven" / f"sfx-{h}.mp3"


def wanted(tl_path: pathlib.Path) -> list[dict]:
    base = tl_path.parent
    tl = json.loads(tl_path.read_text(encoding="utf-8"))
    items, seen = [], set()
    for ev in tl.get("sfx", []):
        if ev.get("eleven"):
            p = sfx_path(base, ev)
            if p not in seen:
                seen.add(p)
                items.append({"kind": "sfx", "prompt": ev["eleven"], "sec": ev.get("dur"), "loop": ev.get("loop", False),
                              "influence": ev.get("influence", 0.4), "path": p})
    mus = tl.get("music") or {}
    if mus.get("eleven"):
        p = base / mus.get("file", "audio/music.mp3")
        items.append({"kind": "music", "prompt": mus["eleven"], "sec": round(tl["duration"] + 1.5 - mus.get("start", 0), 1),
                      "vocals": mus.get("vocals", False), "model": mus.get("model", "music_v2_5"), "path": p,
                      "stamp": p.with_suffix(p.suffix + ".prompt.json")})
    return items


def missing(items: list[dict]) -> list[dict]:
    out = []
    for it in items:
        if not it["path"].exists():
            out.append(it)
        elif it["kind"] == "music":  # regenerate when prompt or length changed
            st = json.loads(it["stamp"].read_text(encoding="utf-8")) if it["stamp"].exists() else {}
            if st.get("prompt") != it["prompt"] or abs(st.get("sec", 0) - it["sec"]) > 1.0:
                out.append(it)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("timeline", nargs="?", default="public/timeline.json")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--yes", action="store_true")
    a = ap.parse_args()
    tl = pathlib.Path(a.timeline)
    todo = missing(wanted(tl))
    plan = [{"kind": t["kind"], "prompt": t["prompt"][:70], "sec": t["sec"]} for t in todo]
    if not todo:
        print(json.dumps({"to_generate": 0, "note": "all ElevenLabs assets are cached"}))
        return
    try:
        before = eleven.subscription()
    except eleven.ElevenError as e:
        sys.exit(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
    if a.dry or not a.yes:
        print(json.dumps({"to_generate": plan, "credits_left": before["credits_left"], "tier": before["tier"],
                          "next": "tell the user the list and credits left; run again with --yes after they agree"}, ensure_ascii=False, indent=1))
        sys.exit(0 if a.dry else 2)
    done = []
    for t in todo:
        t["path"].parent.mkdir(parents=True, exist_ok=True)
        try:
            if t["kind"] == "sfx":
                data = eleven.sfx(t["prompt"], t["sec"], loop=t["loop"], influence=t["influence"])
            else:
                data = eleven.music(t["prompt"], t["sec"], instrumental=not t["vocals"], model=t["model"])
                t["stamp"].write_text(json.dumps({"prompt": t["prompt"], "sec": t["sec"]}, ensure_ascii=False), encoding="utf-8")
        except eleven.ElevenError as e:
            print(json.dumps({"failed": t["prompt"][:60], "error": str(e)}, ensure_ascii=False), file=sys.stderr)
            continue
        t["path"].write_bytes(data)
        done.append(str(t["path"]))
        cred = t["path"].parent.parent / "credits.json" if t["kind"] == "sfx" else t["path"].parent / "credits.json"
        items = json.loads(cred.read_text(encoding="utf-8")) if cred.exists() else []
        items = [i for i in items if i.get("file") != t["path"].name]
        items.append({"file": t["path"].name, "role": t["kind"], "title": t["prompt"][:80], "author": "ElevenLabs (generated)",
                      "license": "ElevenLabs terms of your plan", "attribution": ""})
        cred.write_text(json.dumps(items, indent=1, ensure_ascii=False), encoding="utf-8")
    after = eleven.subscription()
    print(json.dumps({"generated": done, "credits_spent": after["credits_used"] - before["credits_used"],
                      "credits_left": after["credits_left"]}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
