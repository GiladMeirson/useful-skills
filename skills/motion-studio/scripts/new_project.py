#!/usr/bin/env python3
"""Creates a new video project from the template, ready for score.py. Cross-platform, standard library only.

  python <skill>/scripts/new_project.py videos/dreamolizer-reel --lang he --format reels
  python <skill>/scripts/new_project.py launch-film --lang en --format youtube --voice elevenlabs --no-install

What it does:
  copies assets/template (gitignore -> .gitignore), writes public/brand.json (my-style.json when present, plus lang),
  writes a starter roteiro.json for the language/format/voice, PROGRESS.md, and runs npm install.
src/scenes/Showcase.tsx becomes a minimal starter (narration word by word, renders right away); the worked example
moves to reference/Showcase.example.tsx. Example audio, timeline and cues are removed: run score.py to make yours.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import shutil
import subprocess
import sys

SKILL = pathlib.Path(__file__).resolve().parent.parent
VOICES = {
    ("edge", "he"): {"provider": "edge", "lang": "he", "voice": "he-IL-HilaNeural"},
    ("edge", "en"): {"provider": "edge", "lang": "en", "voice": "en-US-AndrewMultilingualNeural"},
    ("kokoro", "en"): {"provider": "kokoro", "lang": "en", "voice": "af_heart", "speed": 0.95},
    ("elevenlabs", "he"): {"provider": "elevenlabs", "lang": "he", "model": "eleven_v4", "voice": "<voice_id from eleven.py voices --lang he>"},
    ("elevenlabs", "en"): {"provider": "elevenlabs", "lang": "en", "model": "eleven_multilingual_v2", "voice": "<voice_id from eleven.py voices>"},
    ("none", "he"): {"provider": "none"},
    ("none", "en"): {"provider": "none"},
}
SAMPLE = {
    "he": [{"id": "hook", "say": [{"text": "משפט פתיחה שעוצר את הגלילה."}]},
           {"id": "close", "say": [{"text": "סיום עם קריאה לפעולה.", "closed": True}], "hold": 1.0}],
    "en": [{"id": "hook", "say": [{"text": "A first line that stops the scroll."}]},
           {"id": "close", "say": [{"text": "A closing line with the call to action.", "closed": True}], "hold": 1.0}],
}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder")
    ap.add_argument("--lang", default="en", choices=["en", "he"])
    ap.add_argument("--format", default="reels", choices=["reels", "tiktok", "square", "youtube", "linkedin"])
    ap.add_argument("--voice", default="edge", choices=["edge", "kokoro", "elevenlabs", "none"])
    ap.add_argument("--name", default=None, help="brand/video name (default: folder name)")
    ap.add_argument("--no-install", action="store_true")
    ap.add_argument("--force", action="store_true", help="allow a non-empty folder")
    a = ap.parse_args()
    if a.voice == "kokoro" and a.lang == "he":
        sys.exit("kokoro has no Hebrew voice: use --voice edge or elevenlabs")
    dst = pathlib.Path(a.folder).resolve()
    if dst.exists() and any(dst.iterdir()) and not a.force:
        sys.exit(f"{dst} is not empty (use --force to copy into it)")
    shutil.copytree(SKILL / "assets" / "template", dst, dirs_exist_ok=True, ignore=shutil.ignore_patterns("node_modules", "out", "seg"))
    if (dst / "gitignore").exists():
        (dst / "gitignore").replace(dst / ".gitignore")
    # the worked example moves out of src (kept as reference); a minimal starter takes its place
    (dst / "reference").mkdir(exist_ok=True)
    (dst / "src" / "scenes" / "Showcase.tsx").replace(dst / "reference" / "Showcase.example.tsx")
    shutil.copy(SKILL / "assets" / "starter" / "Showcase.tsx", dst / "src" / "scenes" / "Showcase.tsx")
    for f in ("public/timeline.json", "public/cues.json"):  # example score belongs to the example
        (dst / f).unlink(missing_ok=True)
    for f in (dst / "public" / "audio").glob("*"):
        if f.is_file():
            f.unlink()
    (dst / "direction.json").write_text(json.dumps({
        "concept": "", "law": "", "motif": "", "options": [], "chosen": "", "approved_by": "",
        "scenes": [{"id": s["id"], "layout": "", "entrance": "", "hero": ""} for s in SAMPLE[a.lang]]}, ensure_ascii=False, indent=1),
        encoding="utf-8")

    user_style = pathlib.Path.home() / ".config" / "motion-studio" / "my-style.json"
    brand_src = user_style if user_style.exists() else SKILL / "assets" / "my-style.json"
    brand = json.loads((brand_src if brand_src.exists() else dst / "public" / "brand.json").read_text(encoding="utf-8"))
    brand["name"] = a.name or dst.name
    brand["lang"] = a.lang
    if a.lang == "he" and brand.get("fonts", {}).get("display") in (None, "Inter", "Archivo", "Instrument Sans", "Geist Sans"):
        brand.setdefault("fonts", {})["display"] = "Heebo"
        brand["fonts"]["body"] = "Heebo"
    brand["source"] = "my-style.json" if brand_src.exists() else "template default: replace with brand.py output or the user's colors"
    (dst / "public" / "brand.json").write_text(json.dumps(brand, ensure_ascii=False, indent=1), encoding="utf-8")

    rot = json.loads((dst / "roteiro.json").read_text(encoding="utf-8"))
    rot.update({"format": a.format, "voice": VOICES[(a.voice, a.lang)], "scenes": SAMPLE[a.lang]})
    rot["music"] = {"file": "audio/music.wav", "gain_db": -15, "duck_db": -9, "fade_in": 0.2, "fade_out": 1.2}
    (dst / "roteiro.json").write_text(json.dumps(rot, ensure_ascii=False, indent=1), encoding="utf-8")

    today = dt.date.today().isoformat()
    (dst / "PROGRESS.md").write_text(
        f"# {brand['name']} — progress\n\nLanguage: {a.lang} · format: {a.format} · voice: {a.voice}\n\n"
        f"- [{today}] step 4 project created from template (new_project.py). Next: direction (step 5), then roteiro.json.\n",
        encoding="utf-8")

    installed = False
    if not a.no_install:
        npm = shutil.which("npm") or shutil.which("npm.cmd")
        if npm:
            r = subprocess.run([npm, "install", "--no-audit", "--no-fund"], cwd=dst)
            installed = r.returncode == 0
        else:
            print("npm not found: install Node 18+ (python <skill>/scripts/doctor.py)", file=sys.stderr)
    print(json.dumps({"project": str(dst), "lang": a.lang, "format": a.format, "voice": a.voice, "npm_installed": installed,
                      "next": "write direction.json and roteiro.json, then score.py --dry"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
