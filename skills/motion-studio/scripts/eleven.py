#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["requests", "numpy"]
# ///
"""ElevenLabs client shared by tts.py, score.py, voice.py and eleven_assets.py. Also a small CLI.

  uv run scripts/eleven.py check                       # key valid? plan, credits left, voices in the account
  uv run scripts/eleven.py voices --lang he            # account voices + public library voices for a language
  uv run scripts/eleven.py add-voice <public_user_id> <voice_id> --name "Hebrew narrator"   # library voice -> account
  uv run scripts/eleven.py sfx "deep cinematic boom, metallic tail" --dur 1.5 -o public/audio/sfx/boom.mp3
  uv run scripts/eleven.py music "minimal tech, punchy drums, 118 bpm, no vocals" --sec 20 -o public/audio/music.mp3

The key lives in .env (ELEVENLABS_API_KEY=...) in the video folder or in the environment. Never in chat, commands or git.

Models (checked 2026-10-26, https://elevenlabs.io/docs/overview/models):
  speech  eleven_v4 (flagship, 90+ languages incl. Hebrew, 10k chars, audio tags, no style/speed sliders)
          eleven_v4_turbo (fast/cheaper, Hebrew)  ·  eleven_v3 (previous gen, Hebrew, 5k chars)
          eleven_multilingual_v2 (English etc., NO Hebrew, supports previous_text/next_text, speed/style)
          eleven_flash_v2_5 (cheap, NO Hebrew)
  sfx     eleven_text_to_sound_v2 (default) / eleven_text_to_sound_v3 · 0.5-30 s
  music   music_v2_5 (best) / music_v2 / music_v1 · 3 s-10 min · paid plans
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import pathlib
import subprocess
import sys

import numpy as np

API = os.environ.get("ELEVENLABS_API_BASE", "https://api.elevenlabs.io")
HEBREW_MODELS = ("eleven_v4", "eleven_v4_turbo", "eleven_v3", "eleven_v3_conversational")
NO_SLIDERS = ("eleven_v4", "eleven_v4_turbo", "eleven_v3")  # style/speed removed; no previous_text/next_text


class ElevenError(RuntimeError):
    pass


def load_env(path: str = ".env") -> None:
    for f in (pathlib.Path(path), pathlib.Path.home() / ".config" / "motion-studio" / ".env"):
        if f.is_file():
            for line in f.read_text(encoding="utf-8").splitlines():
                if "=" in line and not line.lstrip().startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip().removeprefix("export ").strip(), v.strip().strip("'\""))


def key() -> str:
    load_env()
    k = os.environ.get("ELEVENLABS_API_KEY")
    if not k:
        raise ElevenError("ELEVENLABS_API_KEY is not set: add ELEVENLABS_API_KEY=... to the project's .env "
                          "(or ~/.config/motion-studio/.env for all projects)")
    return k


def _req(method, path, *, json_body=None, params=None, stream=False, timeout=300):
    import requests

    try:
        r = requests.request(method, API + path, json=json_body, params=params, headers={"xi-api-key": key()}, timeout=timeout, stream=stream)
    except requests.RequestException as e:
        raise ElevenError(f"can't reach {API} ({type(e).__name__}): check the internet connection, VPN or firewall") from None
    if not r.ok:
        hint = {401: "invalid or revoked key", 403: "key lacks a permission or your plan doesn't include this",
                422: "invalid request", 429: "rate limit / out of credits"}.get(r.status_code, "API error")
        raise ElevenError(f"ElevenLabs HTTP {r.status_code} ({hint}) on {path}: {r.text[:300]}")
    return r


def default_model(lang: str) -> str:
    return "eleven_v4" if lang == "he" else "eleven_multilingual_v2"


def check_model(model: str, lang: str):
    if lang == "he" and model not in HEBREW_MODELS:
        raise ElevenError(f"{model} does not speak Hebrew. Use one of: {', '.join(HEBREW_MODELS)} (default eleven_v4)")


def decode(data: bytes, sr: int = 48000, channels: int = 1) -> np.ndarray:
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", "pipe:0", "-f", "f32le", "-ac", str(channels), "-ar", str(sr), "pipe:1"],
                       input=data, capture_output=True, check=True)
    a = np.frombuffer(p.stdout, dtype="<f4").copy()
    return a.reshape(-1, channels) if channels > 1 else a


def _pcm_or_mp3(path: str, body: dict, params: dict | None = None, sr: int = 48000) -> tuple[dict | bytes, str, object]:
    """Ask for raw PCM; plans without PCM access get MP3 instead (decoded later)."""
    params = dict(params or {})
    try:
        r = _req("POST", path, json_body=body, params={**params, "output_format": f"pcm_{sr}"})
        return r, "pcm", r
    except ElevenError as e:
        if "output_format" not in str(e) and "HTTP 403" not in str(e) and "HTTP 422" not in str(e):
            raise
        r = _req("POST", path, json_body=body, params={**params, "output_format": "mp3_44100_128"})
        return r, "mp3", r


def tts(text: str, voice_id: str, *, lang: str = "en", model: str | None = None, settings: dict | None = None,
        speed: float | None = None, seed: int | None = None, previous_text: str | None = None, next_text: str | None = None,
        sr: int = 48000) -> tuple[np.ndarray, dict | None, int]:
    """Speech -> (mono float32 at sr, character alignment or None, character cost)."""
    model = model or default_model(lang)
    check_model(model, lang)
    vs = dict(settings or {"stability": 0.5, "similarity_boost": 0.75})
    if model in NO_SLIDERS:
        vs = {k: v for k, v in vs.items() if k in ("stability", "similarity_boost", "use_speaker_boost")}
    elif speed:
        vs["speed"] = speed
    body = {"text": text, "model_id": model, "voice_settings": vs, "apply_text_normalization": "auto"}
    if lang in ("he", "en") and model in HEBREW_MODELS:
        body["language_code"] = lang
    if seed is not None:
        body["seed"] = seed
    if model not in NO_SLIDERS:
        if previous_text:
            body["previous_text"] = previous_text
        if next_text:
            body["next_text"] = next_text
    # with-timestamps returns JSON {audio_base64, alignment}; output_format applies to the base64 audio
    try:
        r, kind, _ = _pcm_or_mp3(f"/v1/text-to-speech/{voice_id}/with-timestamps", body, sr=sr)
        j = r.json()
        raw = base64.b64decode(j["audio_base64"])
        pcm = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768 if kind == "pcm" else decode(raw, sr)
        al = j.get("alignment")  # original text (what the screen shows), not the normalized one
        return pcm, al, int(r.headers.get("character-cost", 0) or 0)
    except ElevenError as e:
        if "HTTP 4" not in str(e) or "with-timestamps" not in str(e):
            raise
    # model without timestamp support: plain audio, caller aligns with align.py
    r, kind, _ = _pcm_or_mp3(f"/v1/text-to-speech/{voice_id}", body, sr=sr)
    pcm = np.frombuffer(r.content, dtype="<i2").astype(np.float32) / 32768 if kind == "pcm" else decode(r.content, sr)
    return pcm, None, int(r.headers.get("character-cost", 0) or 0)


def sfx(prompt: str, dur: float | None = None, *, loop: bool = False, influence: float = 0.4,
        model: str = "eleven_text_to_sound_v2") -> bytes:
    body = {"text": prompt, "loop": loop, "prompt_influence": influence, "model_id": model}
    if dur:
        body["duration_seconds"] = max(0.5, min(30.0, float(dur)))
    return _req("POST", "/v1/sound-generation", json_body=body, params={"output_format": "mp3_44100_128"}).content


def music(prompt: str, sec: float, *, instrumental: bool = True, model: str = "music_v2_5") -> bytes:
    body = {"prompt": prompt, "music_length_ms": int(max(3, min(600, sec)) * 1000), "model_id": model,
            "force_instrumental": instrumental}
    try:
        return _req("POST", "/v1/music", json_body=body, params={"output_format": "mp3_44100_128"}, timeout=900).content
    except ElevenError as e:
        if "HTTP 422" in str(e) and model != "music_v1":  # older accounts / model not enabled
            body["model_id"] = "music_v1"
            return _req("POST", "/v1/music", json_body=body, params={"output_format": "mp3_44100_128"}, timeout=900).content
        raise


def subscription() -> dict:
    j = _req("GET", "/v1/user/subscription", timeout=30).json()
    used, limit = j.get("character_count", 0), j.get("character_limit", 0)
    return {"tier": j.get("tier"), "credits_used": used, "credits_limit": limit, "credits_left": max(0, limit - used),
            "resets_unix": j.get("next_character_count_reset_unix")}


def account_voices() -> list[dict]:
    j = _req("GET", "/v2/voices", params={"page_size": 100}, timeout=30).json()
    return [{"id": v.get("voice_id"), "name": v.get("name"), "category": v.get("category"),
             "labels": v.get("labels"), "preview": v.get("preview_url")} for v in j.get("voices", [])]


def library_voices(lang: str, limit: int = 15, gender: str | None = None) -> list[dict]:
    params = {"page_size": limit, "language": lang, "sort": "trending"}
    if gender:
        params["gender"] = gender
    j = _req("GET", "/v1/shared-voices", params=params, timeout=30).json()
    return [{"public_user_id": v.get("public_owner_id"), "voice_id": v.get("voice_id"), "name": v.get("name"),
             "gender": v.get("gender"), "accent": v.get("accent"), "use_case": v.get("use_case"),
             "preview": v.get("preview_url")} for v in j.get("voices", [])]


def add_voice(public_user_id: str, voice_id: str, name: str) -> dict:
    return _req("POST", f"/v1/voices/add/{public_user_id}/{voice_id}", json_body={"new_name": name}, timeout=30).json()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check")
    v = sub.add_parser("voices")
    v.add_argument("--lang", default="en")
    v.add_argument("--gender", default=None)
    a_ = sub.add_parser("add-voice")
    a_.add_argument("public_user_id")
    a_.add_argument("voice_id")
    a_.add_argument("--name", required=True)
    s = sub.add_parser("sfx")
    s.add_argument("prompt")
    s.add_argument("--dur", type=float, default=None)
    s.add_argument("--loop", action="store_true")
    s.add_argument("--influence", type=float, default=0.4)
    s.add_argument("-o", "--out", required=True)
    m = sub.add_parser("music")
    m.add_argument("prompt")
    m.add_argument("--sec", type=float, required=True)
    m.add_argument("--vocals", action="store_true", help="allow vocals (default instrumental)")
    m.add_argument("--model", default="music_v2_5")
    m.add_argument("-o", "--out", required=True)
    a = ap.parse_args()
    try:
        if a.cmd == "check":
            out = {"ok": True, **subscription(), "voices": [{k: x[k] for k in ("id", "name", "category")} for x in account_voices()][:20]}
        elif a.cmd == "voices":
            out = {"account": [{k: x[k] for k in ("id", "name", "category", "preview")} for x in account_voices()],
                   "library": library_voices(a.lang, gender=a.gender),
                   "note": "Account voices work for any language on eleven_v4 (native accent). Library voices must be added "
                           "first: eleven.py add-voice <public_user_id> <voice_id> --name ..."}
        elif a.cmd == "add-voice":
            out = add_voice(a.public_user_id, a.voice_id, a.name)
        elif a.cmd == "sfx":
            pathlib.Path(a.out).parent.mkdir(parents=True, exist_ok=True)
            pathlib.Path(a.out).write_bytes(sfx(a.prompt, a.dur, loop=a.loop, influence=a.influence))
            out = {"file": a.out}
        else:
            pathlib.Path(a.out).parent.mkdir(parents=True, exist_ok=True)
            pathlib.Path(a.out).write_bytes(music(a.prompt, a.sec, instrumental=not a.vocals, model=a.model))
            out = {"file": a.out}
    except ElevenError as e:
        print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
        sys.exit(1)
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
