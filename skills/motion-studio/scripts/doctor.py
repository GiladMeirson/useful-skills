#!/usr/bin/env python3
"""Checks this machine for everything the skill needs and prints how to fix what's missing.

  python <skill>/scripts/doctor.py          # human-readable
  python <skill>/scripts/doctor.py --json

Standard library only. Run it once per machine, and whenever a script fails for an environment reason.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import platform
import shutil
import socket
import subprocess
import sys

WIN = os.name == "nt"
FIX = {
    "node": ("winget install OpenJS.NodeJS.LTS" if WIN else "https://nodejs.org (18+) or: brew install node"),
    "uv": ("winget install astral-sh.uv" if WIN else "curl -LsSf https://astral.sh/uv/install.sh | sh"),
    "ffmpeg": ("winget install Gyan.FFmpeg" if WIN else "brew install ffmpeg  /  sudo apt install ffmpeg"),
}


def version(cmd: list[str]) -> str | None:
    exe = shutil.which(cmd[0]) or (shutil.which(cmd[0] + ".cmd") if WIN else None)
    if not exe:
        return None
    try:
        out = subprocess.run([exe, *cmd[1:]], capture_output=True, text=True, timeout=20)
        return (out.stdout or out.stderr).strip().splitlines()[0][:80]
    except (OSError, subprocess.SubprocessError, IndexError):
        return None


def reachable(host: str, port: int = 443) -> bool:
    try:
        with socket.create_connection((host, port), timeout=5):
            return True
    except OSError:
        return False


def env_key() -> str | None:
    if os.environ.get("ELEVENLABS_API_KEY"):
        return "environment"
    for f in (pathlib.Path(".env"), pathlib.Path.home() / ".config" / "motion-studio" / ".env"):
        if f.is_file() and "ELEVENLABS_API_KEY=" in f.read_text(encoding="utf-8", errors="ignore"):
            return str(f)
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    node = version(["node", "-v"])
    checks = [
        {"name": "python", "ok": sys.version_info >= (3, 10), "detail": platform.python_version(), "fix": "Python 3.10+"},
        {"name": "node", "ok": bool(node) and int(node.lstrip("v").split(".")[0]) >= 18, "detail": node, "fix": FIX["node"]},
        {"name": "npm", "ok": bool(version(["npm", "-v"])), "detail": version(["npm", "-v"]), "fix": FIX["node"]},
        {"name": "uv", "ok": bool(version(["uv", "--version"])), "detail": version(["uv", "--version"]), "fix": FIX["uv"]},
        {"name": "ffmpeg", "ok": bool(version(["ffmpeg", "-version"])), "detail": version(["ffmpeg", "-version"]), "fix": FIX["ffmpeg"]},
        {"name": "ffprobe", "ok": bool(version(["ffprobe", "-version"])), "detail": None, "fix": FIX["ffmpeg"]},
    ]
    optional = [
        {"name": "free voice (edge-tts)", "ok": reachable("speech.platform.bing.com"), "fix": "needs internet; offline English falls back to Kokoro"},
        {"name": "ElevenLabs key", "ok": bool(env_key()), "detail": env_key(),
         "fix": "optional: ELEVENLABS_API_KEY=... in the project's .env or ~/.config/motion-studio/.env"},
        {"name": "ElevenLabs API", "ok": reachable("api.elevenlabs.io"), "fix": "needs internet"},
        {"name": "NVIDIA GPU", "ok": bool(version(["nvidia-smi", "-L"])), "detail": version(["nvidia-smi", "-L"]),
         "fix": "optional: speeds up Hebrew alignment (ivrit-ai Whisper) and 3D renders"},
        {"name": "Hugging Face (Whisper models)", "ok": reachable("huggingface.co"), "fix": "needed once to download align.py models"},
    ]
    ok = all(c["ok"] for c in checks)
    if a.json:
        print(json.dumps({"ok": ok, "required": checks, "optional": optional, "platform": platform.platform()}, ensure_ascii=False, indent=1))
        sys.exit(0 if ok else 1)
    print(f"Platform: {platform.platform()}\n\nRequired:")
    for c in checks:
        print(f"  {'OK ' if c['ok'] else 'MISSING'}  {c['name']:<8} {c.get('detail') or ''}" + ("" if c["ok"] else f"\n           fix: {c['fix']}"))
    print("\nOptional:")
    for c in optional:
        print(f"  {'OK ' if c['ok'] else '-- '}  {c['name']:<28} {c.get('detail') or ''}" + ("" if c["ok"] else f"  ({c['fix']})"))
    print("\nAll required tools present." if ok else "\nInstall the missing tools, open a NEW terminal, and run doctor again.")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
