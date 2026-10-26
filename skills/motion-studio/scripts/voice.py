#!/usr/bin/env python3
"""Voice decision: prints the mandatory voice question, auditions voices, checks keys.

  python scripts/voice.py --lang he                    # the question to ask the user, with options
  python scripts/voice.py --lang en --json             # same, as JSON
  uv run scripts/voice.py --lang he --audition "First sentence of the script." -o out/voices
  python scripts/voice.py --check-key                  # validates ELEVENLABS_API_KEY without spending credits

Standard library only (except --audition, which shells out to tts.py through uv).
On Windows use `python` instead of `python3`.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
VOICES = json.loads((HERE.parent / "assets" / "voices.json").read_text(encoding="utf-8"))


def load_env(path: str = ".env") -> None:
    for f in (pathlib.Path(path), pathlib.Path.home() / ".config" / "motion-studio" / ".env"):
        if f.is_file():
            for line in f.read_text(encoding="utf-8").splitlines():
                if "=" in line and not line.lstrip().startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip().removeprefix("export ").strip(), v.strip().strip("'\""))


def lang_of(s: str) -> str:
    return "he" if s.lower().startswith(("he", "iw")) else "en"


def options(lang: str) -> list[dict]:
    L = VOICES[lang]
    free = ", ".join(f"{v['id']} ({v['note']})" for v in L["edge"])
    opts = [
        {"label": "No voice", "detail": "Music, SFX and on-screen type only. The video must work muted: typography carries the message."},
        {"label": "Free voice (recommended)", "detail": f"edge-tts neural voices, no key, real word timings, needs internet. Voices: {free}."},
    ]
    if L.get("kokoro"):
        opts.append({"label": "Offline voice", "detail": "Kokoro-82M on CPU, no internet after a one-time 330 MB download. "
                     + ", ".join(f"{v['id']} ({v['note']})" for v in L["kokoro"]) + "."})
    el = VOICES["elevenlabs"]
    key = "key found in .env" if os.environ.get("ELEVENLABS_API_KEY") else f"needs a key: {el['key_steps']}"
    opts.append({"label": "ElevenLabs (paid / free tier)", "detail": f"Most expressive, audio tags like [whispers] on v4. {key} {el['cost_note']} "
                 f"Pick a voice: {el['list_voices']}. ElevenLabs can also generate SFX and music (eleven_assets.py)."})
    opts.append({"label": "My own recording", "detail": "Record yourself (any WAV/MP3); align.py gives the word timings."})
    return opts


def check_key() -> dict:
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        return {"ok": False, "detail": "ELEVENLABS_API_KEY is not set (put it in the project's .env)"}
    req = urllib.request.Request(VOICES["elevenlabs"]["check_url"], headers={"xi-api-key": key})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            j = json.load(r)
    except urllib.error.HTTPError as e:
        hint = "invalid or revoked key" if e.code == 401 else "key lacks a permission" if e.code == 403 else "API error"
        return {"ok": False, "detail": f"HTTP {e.code}: {hint}"}
    except OSError as e:
        return {"ok": False, "detail": f"no network to api.elevenlabs.io: {e}"}
    voices = j.get("voices", [])
    return {"ok": True, "detail": f"valid key; {len(voices)} voices", "voices": [{"id": v.get("voice_id"), "name": v.get("name")} for v in voices[:8]]}


def audition(text: str, out_dir: str, lang: str) -> dict:
    """Same sentence in each free voice, so the user picks by ear."""
    if not shutil.which("uv"):
        return {"ok": False, "detail": "uv not found: install it (https://docs.astral.sh/uv/)"}
    out = pathlib.Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    L = VOICES[lang]
    runs = [("edge", v["id"]) for v in L["edge"]] + [("kokoro", v["id"]) for v in L.get("kokoro", [])]
    files, failed = [], []
    for prov, vid in runs:
        p = subprocess.run(["uv", "run", "-q", str(HERE / "tts.py"), "-", "-o", str(out / vid), "--lang", lang, "--provider", prov,
                            "--voice", vid, "--no-align"], input=text, capture_output=True, text=True, encoding="utf-8")
        (files if p.returncode == 0 else failed).append(str(out / f"{vid}.wav") if p.returncode == 0 else f"{vid}: {p.stderr.strip()[-160:]}")
    return {"ok": bool(files), "files": files, "failed": failed}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lang", default="en", help="en | he")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--check-key", action="store_true")
    ap.add_argument("--audition", default=None, metavar="SENTENCE")
    ap.add_argument("-o", "--out", default="out/voices")
    a = ap.parse_args()
    load_env()
    lang = lang_of(a.lang)
    if a.check_key:
        r = check_key()
        print(json.dumps(r, ensure_ascii=False, indent=1))
        sys.exit(0 if r["ok"] else 1)
    if a.audition:
        r = audition(a.audition, a.out, lang)
        print(json.dumps(r, ensure_ascii=False, indent=1))
        sys.exit(0 if r["ok"] else 1)
    q = VOICES["question"][lang]
    opts = options(lang)
    if a.json:
        print(json.dumps({"question": q, "options": opts}, ensure_ascii=False, indent=1))
        return
    print(f"Ask the user: {q}")
    for i, o in enumerate(opts, 1):
        print(f"  {i}. {o['label']}\n     {o['detail']}")
    print("\nThen offer an audition: voice.py --audition \"<first line of the script>\" so they choose by ear.")


if __name__ == "__main__":
    main()
