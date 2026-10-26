#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["kokoro-onnx>=0.4.9", "edge-tts>=7.0", "soundfile", "numpy", "num2words", "requests"]
# ///
"""Narration: script -> <out>.wav + <out>.words.json (every word with start/end in seconds).

Free providers (default):
  edge        FREE, no key, neural voices, real word timestamps. Needs internet. DEFAULT (English and Hebrew).
              Hebrew: he-IL-HilaNeural (F), he-IL-AvriNeural (M).
              English: en-US-AndrewMultilingualNeural, en-US-AvaMultilingualNeural, en-US-EmmaMultilingualNeural,
              en-US-BrianMultilingualNeural, en-GB-RyanNeural, en-GB-SoniaNeural.
              (Uses the Microsoft Edge read-aloud service: fine for personal projects, no SLA.)
  kokoro      FREE, offline, Apache-2.0, runs on CPU. English only. Automatic fallback when edge is offline.
              Timings: aligned with faster-whisper (align.py) when available, else estimated from pauses.
              Voices: af_heart (F, best), af_bella, am_michael, am_fenrir, bf_emma (UK F), bm_george (UK M).
Paid / keyed (optional):
  elevenlabs  ELEVENLABS_API_KEY in .env. Most expressive. Hebrew needs eleven_v4 (default for --lang he), v4_turbo or v3;
              English defaults to eleven_multilingual_v2. Audio tags ([whispers], [excited]) work on v3/v4.
  openai      OPENAI_API_KEY. No timestamps (estimated).
  azure       AZURE_SPEECH_KEY + AZURE_SPEECH_REGION. No timestamps via REST (estimated).

Examples:
  uv run scripts/tts.py script.txt -o public/audio/narration --lang en                     # edge Andrew (kokoro offline)
  uv run scripts/tts.py script.txt -o public/audio/narration --lang he                     # edge he-IL-HilaNeural
  uv run scripts/tts.py script.txt -o out/nar --lang he --voice he-IL-AvriNeural --speed 1.05
  uv run scripts/tts.py script.txt -o out/nar --lang en --provider kokoro --voice af_heart --speed 0.95
  uv run scripts/tts.py --normalize-only "It costs $1,234.50 at 2:30pm" --lang en
  uv run scripts/tts.py --normalize-only "עולה 49.90 ₪ ב-14:30" --lang he
Pronunciation fixes: lexicon.json in the project folder maps a displayed word to how it should be spoken
(Hebrew: write it with niqqud or phonetic spelling, e.g. {"Claude": "קְלוֹד"}). The screen keeps the original word.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.request
from xml.sax.saxutils import escape

import numpy as np
import soundfile as sf

ROOT = pathlib.Path(__file__).resolve().parent.parent
KOKORO_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
KOKORO_DIR = pathlib.Path(os.environ.get("KOKORO_DIR", pathlib.Path.home() / ".cache" / "motion-studio" / "kokoro"))
WORD = r"[\w֐-׿]"  # Hebrew letters + niqqud count as word characters

DEFAULTS = {
    "he": {"provider": "edge", "voice": "he-IL-HilaNeural"},
    "en": {"provider": "edge", "voice": "en-US-AndrewMultilingualNeural"},
}


def base_lang(lang: str) -> str:
    l = (lang or "en").lower()
    return "he" if l.startswith(("he", "iw")) else "en" if l.startswith("en") else l.split("-")[0]


# ---------- text normalization (numbers, money, time, %) ----------
def _n2w(n, lang, **kw) -> str:
    from num2words import num2words

    try:
        return num2words(n, lang=lang, **kw)
    except (NotImplementedError, OverflowError):
        return str(n)


def normalize(text: str, lang: str, lexicon: dict[str, str] | None = None) -> str:
    t = " ".join(text.split())
    for k in sorted(lexicon or {}, key=len, reverse=True):
        t = re.sub(rf"(?<!{WORD}){re.escape(k)}(?!{WORD})", lexicon[k], t)
    L = base_lang(lang)
    if L == "en":
        def money(m):
            v = float(m.group(1).replace(",", ""))
            if v == int(v):
                n = int(v)
                return f"{_n2w(n, 'en')} {'dollar' if n == 1 else 'dollars'}"
            return _n2w(v, "en", to="currency", currency="USD")

        t = re.sub(r"\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\b", money, t)
        t = re.sub(r"\b(\d{1,2}):(\d{2})\s?(am|pm)?\b", lambda m: f"{_n2w(int(m.group(1)), 'en')}"
                   + ("" if m.group(2) == "00" else f" {('oh ' if m.group(2)[0] == '0' else '')}{_n2w(int(m.group(2)), 'en')}")
                   + (f" {' '.join(m.group(3).upper())}" if m.group(3) else ""), t)
        t = re.sub(r"(\d+(?:\.\d+)?)\s?%", lambda m: f"{m.group(1)} percent", t)
        t = re.sub(r"\b(\d+)(st|nd|rd|th)\b", lambda m: _n2w(int(m.group(1)), "en", to="ordinal"), t)
        t = re.sub(r"\b(\d{1,3}(?:,\d{3})+)\b", lambda m: _n2w(int(m.group(1).replace(",", "")), "en"), t)
        t = re.sub(r"\b(\d+)\.(\d+)\b", lambda m: f"{_n2w(int(m.group(1)), 'en')} point {' '.join(_n2w(int(c), 'en') for c in m.group(2))}", t)
        t = re.sub(r"\b(19|20)(\d{2})\b", lambda m: _n2w(int(m.group(0)), "en", to="year"), t)
        t = re.sub(r"\b\d+\b", lambda m: _n2w(int(m.group(0)), "en"), t)
    elif L == "he":
        # Neural Hebrew voices read digits well; we only expand symbols they tend to skip or misread.
        t = re.sub(r"(\d+(?:\.\d+)?)\s?₪", r"\1 שקלים", t)
        t = re.sub(r"₪\s?(\d+(?:\.\d+)?)", r"\1 שקלים", t)
        t = re.sub(r"\$\s?(\d+(?:\.\d+)?)", r"\1 דולר", t)
        t = re.sub(r"(\d+(?:\.\d+)?)\s?%", r"\1 אחוז", t)
        t = re.sub(r"(?<=\s)-(?=\s)", ",", t)
    return t


def display_pairs(raw: str, lang: str, lexicon: dict[str, str], do_norm: bool) -> list[tuple[str, list[str]]]:
    """Every displayed token (what appears on screen) with the spoken words it becomes."""
    pairs = []
    for tok in " ".join(raw.split()).split(" "):
        spoken = normalize(tok, lang, lexicon).split() if do_norm else [tok]
        if any(re.search(WORD, s) for s in spoken):
            pairs.append((tok, spoken))
    return pairs


def to_display(pairs, words):
    """Fold spoken-word timings back onto the displayed tokens."""
    out, i = [], 0
    for disp, spoken in pairs:
        seg = words[i:i + len(spoken)]
        i += len(spoken)
        if seg:
            out.append({"word": disp, "spoken": " ".join(spoken), "start": seg[0]["start"], "end": seg[-1]["end"]})
    return out


def warn_unknown(text: str, lang: str) -> list[str]:
    if base_lang(lang) == "he":
        return sorted(set(re.findall(r"\b[A-Za-z][A-Za-z0-9.\-]{1,}\b", text)))  # Latin words inside Hebrew
    return sorted(set(re.findall(r"\b[A-Z]{2,6}s?\b", text)))  # acronyms


# ---------- word timings ----------
def _split_words(text: str) -> list[str]:
    return [w for w in text.split() if re.search(WORD, w)]


def approx_words(text: str, duration: float, lead: float = 0.05, tail: float = 0.1) -> list[dict]:
    words = _split_words(text)
    weights = np.array([len(re.sub(rf"[^\w֐-׿]", "", w)) + 2.5 * bool(re.search(r"[.,;:!?…]$", w)) for w in words], float)
    span = max(duration - lead - tail, 0.1)
    edges = lead + np.concatenate([[0], np.cumsum(weights)]) / weights.sum() * span
    return [{"word": w, "start": round(float(edges[i]), 3), "end": round(float(edges[i + 1]), 3)} for i, w in enumerate(words)]


def speech_segments(samples: np.ndarray, sr: int, min_gap: float = 0.12) -> list[tuple[float, float]]:
    """Voiced stretches of the audio, split on silences longer than min_gap."""
    hop = int(sr * 0.01)
    n = len(samples) // hop
    rms = np.sqrt(np.mean(samples[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)
    voiced = rms > max(rms.max() * 0.04, 1e-4)
    segs, start, gap = [], None, 0
    for i, v in enumerate(voiced):
        if v:
            if start is None:
                start = i
            gap = 0
        elif start is not None:
            gap += 1
            if gap * 0.01 >= min_gap:
                segs.append((start * 0.01, (i - gap + 1) * 0.01))
                start, gap = None, 0
    if start is not None:
        segs.append((start * 0.01, n * 0.01))
    return segs


def approx_words_audio(text: str, samples: np.ndarray, sr: int) -> list[dict]:
    """Estimated timings anchored on the pauses in the audio: each clause (ends in punctuation) gets one voiced segment."""
    words = _split_words(text)
    clauses, cur = [], []
    for w in words:
        cur.append(w)
        if re.search(r"[.,;:!?…]$", w):
            clauses.append(cur)
            cur = []
    if cur:
        clauses.append(cur)
    segs = speech_segments(samples, sr)
    # merge the shortest gaps until counts match
    while len(segs) > len(clauses):
        gaps = [segs[i + 1][0] - segs[i][1] for i in range(len(segs) - 1)]
        i = int(np.argmin(gaps))
        segs[i:i + 2] = [(segs[i][0], segs[i + 1][1])]
    if len(segs) != len(clauses):
        return approx_words(text, len(samples) / sr)
    out = []
    for cl, (s0, s1) in zip(clauses, segs):
        part = approx_words(" ".join(cl), s1 - s0 + 0.15, lead=0.0, tail=0.15)
        out += [{"word": w["word"], "start": round(s0 + w["start"], 3), "end": round(s0 + w["end"], 3)} for w in part]
    return out


def chars_to_words(chars: list[str], starts: list[float], ends: list[float]) -> list[dict]:
    out, cur, s, e = [], "", None, None
    for ch, cs, ce in zip(chars, starts, ends):
        if ch.isspace():
            if cur:
                out.append({"word": cur, "start": round(s, 3), "end": round(e, 3)})
            cur, s = "", None
            continue
        cur += ch
        s = cs if s is None else s
        e = ce
    if cur:
        out.append({"word": cur, "start": round(s, 3), "end": round(e, 3)})
    return out


def _clean(w: str) -> str:
    return re.sub(r"[^\wא-ת]", "", w).lower()


def match_boundaries(text: str, bounds: list[dict]) -> list[dict] | None:
    """Map provider word-boundary events onto the script's words (handles split/merged punctuation)."""
    words = _split_words(text)
    out, j = [], 0
    for w in words:
        target, acc, s, e = _clean(w), "", None, None
        while j < len(bounds) and len(acc) < len(target):
            b = bounds[j]
            acc += _clean(b["text"])
            s = b["start"] if s is None else s
            e = b["end"]
            j += 1
        if s is None or acc != target:
            return None
        out.append({"word": w, "start": round(s, 3), "end": round(e, 3)})
    return out


# ---------- providers ----------
def _download(url: str, dest: pathlib.Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"downloading {url}", file=sys.stderr)
    tmp = dest.with_suffix(dest.suffix + ".part")
    urllib.request.urlretrieve(url, tmp)
    tmp.rename(dest)


def _decode_mp3(data: bytes, sr: int = 24000) -> np.ndarray:
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", "pipe:0", "-f", "f32le", "-ac", "1", "-ar", str(sr), "pipe:1"],
                       input=data, capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype="<f4").copy()


def tts_edge(text, voice, speed):
    import edge_tts

    rate = f"{round((speed - 1) * 100):+d}%"

    async def run():
        audio, bounds = bytearray(), []
        com = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
        async for ch in com.stream():
            if ch["type"] == "audio":
                audio.extend(ch["data"])
            elif ch["type"] == "WordBoundary":
                st = ch["offset"] / 1e7
                bounds.append({"text": ch["text"], "start": st, "end": st + ch["duration"] / 1e7})
        return bytes(audio), bounds

    data, bounds = asyncio.run(run())
    if not data:
        raise RuntimeError("edge-tts returned no audio (offline? voice name wrong? run: edge-tts --list-voices)")
    pcm = _decode_mp3(data)
    words = match_boundaries(text, bounds)
    if words is None:
        print(f"warning: {len(bounds)} boundaries for {len(_split_words(text))} words; timings estimated", file=sys.stderr)
        return pcm, 24000, approx_words_audio(text, pcm, 24000), True
    return pcm, 24000, words, False


def tts_kokoro(text, voice, lang, speed):
    from kokoro_onnx import Kokoro

    model = KOKORO_DIR / "kokoro-v1.0.onnx"
    voices = KOKORO_DIR / "voices-v1.0.bin"
    for f in (model, voices):
        if not f.exists():
            _download(KOKORO_URL + f.name, f)
    k = Kokoro(str(model), str(voices))
    klang = "en-gb" if voice.startswith("b") else "en-us"
    samples, sr, timings = k.create_timed(text, voice=voice, speed=speed, lang=klang, sentence_pause=0.35, clause_pause=0.12)
    groups, cur = [], []
    for t in [*timings, None]:
        if t is not None and t.phoneme.strip():
            cur.append(t)
            continue
        if cur:
            groups.append((cur[0].start, cur[-1].end, "".join(x.phoneme for x in cur)))
        cur = []
    words = _split_words(text)
    if len(groups) == len(words):
        return samples, sr, [{"word": w, "start": round(g[0], 3), "end": round(g[1], 3), "ph": g[2]} for w, g in zip(words, groups)], False
    print(f"warning: {len(groups)} phoneme groups for {len(words)} words; timings estimated from pauses", file=sys.stderr)
    return samples, sr, approx_words_audio(text, samples, sr), True


def tts_elevenlabs(text, voice, model, speed, lang):
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    import eleven

    if not voice:
        raise SystemExit("elevenlabs needs --voice <voice_id> (list them: uv run scripts/eleven.py voices --lang he)")
    try:
        pcm, al, _ = eleven.tts(text, voice, lang=base_lang(lang), model=model, speed=speed, sr=24000)
    except eleven.ElevenError as e:
        raise SystemExit(str(e))
    if not al:
        return pcm, 24000, approx_words_audio(text, pcm, 24000), True
    words = chars_to_words(al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"])
    words = [w for w in words if not re.fullmatch(r"\[[^\]]*\]", w["word"])]  # drop audio tags like [whispers]
    return pcm, 24000, words, False


def tts_openai(text, voice, model, speed, instructions, lang):
    import requests

    key = os.environ["OPENAI_API_KEY"]
    default_dir = "Hebrew. Natural Israeli accent, warm, clear." if base_lang(lang) == "he" else "Warm, clear, confident. Not a radio announcer."
    body = {"model": model or "gpt-4o-mini-tts", "voice": voice or "marin", "input": text, "response_format": "pcm",
            "instructions": instructions or default_dir, "speed": speed}
    r = requests.post("https://api.openai.com/v1/audio/speech", json=body, headers={"Authorization": f"Bearer {key}"}, timeout=300)
    r.raise_for_status()
    pcm = np.frombuffer(r.content, dtype="<i2").astype(np.float32) / 32768
    return pcm, 24000, approx_words(text, len(pcm) / 24000), True


def tts_azure(text, voice, style, speed, lang):
    import requests

    key, region = os.environ["AZURE_SPEECH_KEY"], os.environ["AZURE_SPEECH_REGION"]
    rate = f"{round((speed - 1) * 100):+d}%"
    xml_lang = "he-IL" if base_lang(lang) == "he" else "en-US"
    voice = voice or ("he-IL-HilaNeural" if xml_lang == "he-IL" else "en-US-AvaMultilingualNeural")
    ssml = (
        f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="{xml_lang}">'
        f'<voice name="{voice}"><mstts:express-as style="{style}"><prosody rate="{rate}">{escape(text)}</prosody>'
        "</mstts:express-as></voice></speak>"
    )
    r = requests.post(f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1", data=ssml.encode(), timeout=300,
                      headers={"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml",
                               "X-Microsoft-OutputFormat": "raw-24khz-16bit-mono-pcm", "User-Agent": "motion-studio-skill"})
    r.raise_for_status()
    pcm = np.frombuffer(r.content, dtype="<i2").astype(np.float32) / 32768
    return pcm, 24000, approx_words(text, len(pcm) / 24000), True


def try_align(out: pathlib.Path, raw: str, lang: str, words: list[dict]):
    """Estimated timings -> try real ones with faster-whisper (align.py). Needs the model download once."""
    txt = out.with_suffix(".script.txt")
    txt.write_text(raw, encoding="utf-8")
    tmp = out.with_name(out.name + ".aligned")
    try:
        subprocess.run(["uv", "run", "-q", str(pathlib.Path(__file__).with_name("align.py")), str(out.with_suffix(".wav")), str(txt),
                        "-o", str(tmp), "--lang", lang], check=True, timeout=900, capture_output=True)
        al = json.loads(pathlib.Path(str(tmp) + ".words.json").read_text(encoding="utf-8"))
        if len(al["words"]) == len(words):
            for w, x in zip(words, al["words"]):
                w["start"], w["end"] = x["start"], x["end"]
            print("timings: aligned with faster-whisper", file=sys.stderr)
            return words, False
    except Exception as e:  # offline, no uv, model blocked...
        print(f"alignment unavailable ({type(e).__name__}); keeping estimated timings", file=sys.stderr)
    finally:
        for f in (txt, pathlib.Path(str(tmp) + ".words.json"), pathlib.Path(str(tmp) + ".txt")):
            f.unlink(missing_ok=True)
    return words, True


def load_env():
    # API keys live in the project's .env or ~/.config/motion-studio/.env, never in chat or git
    for env in (pathlib.Path(".env"), pathlib.Path.home() / ".config" / "motion-studio" / ".env"):
        if env.is_file():
            for line in env.read_text(encoding="utf-8").splitlines():
                if "=" in line and not line.lstrip().startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip().removeprefix("export ").strip(), v.strip().strip("'\""))


def load_lexicon(lang: str) -> dict[str, str]:
    lex = {}
    shipped = ROOT / "assets" / f"lexicon.{base_lang(lang)}.json"
    for f in (shipped, pathlib.Path("lexicon.json")):
        if f.is_file():
            lex |= {k: v for k, v in json.loads(f.read_text(encoding="utf-8")).items() if not k.startswith("_")}
    return lex


def synth(text, provider, voice, lang, speed, model=None, style="calm", instructions=None):
    if provider == "edge":
        return tts_edge(text, voice, speed)
    if provider == "kokoro":
        if base_lang(lang) != "en":
            raise SystemExit("kokoro here is English-only; use --provider edge for Hebrew")
        return tts_kokoro(text, voice, lang, speed)
    if provider == "elevenlabs":
        return tts_elevenlabs(text, voice, model, speed, lang)
    if provider == "openai":
        return tts_openai(text, voice, model, speed, instructions, lang)
    return tts_azure(text, voice, style, speed, lang)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("script", nargs="?", help=".txt file with the narration (or '-' for stdin)")
    ap.add_argument("-o", "--out", default="public/audio/narration", help="output prefix (no extension)")
    ap.add_argument("--lang", default="en", help="en | he")
    ap.add_argument("--provider", default=None, choices=["edge", "kokoro", "elevenlabs", "openai", "azure"],
                    help="default: edge for Hebrew, kokoro for English")
    ap.add_argument("--voice", default=None)
    ap.add_argument("--speed", type=float, default=None, help="kokoro 0.9-1.0 sounds calm; edge 1.0 is natural")
    ap.add_argument("--model", default=None)
    ap.add_argument("--style", default="calm", help="azure: calm, gentle, friendly ...")
    ap.add_argument("--instructions", default=None, help="openai: voice direction")
    ap.add_argument("--no-normalize", action="store_true")
    ap.add_argument("--no-align", action="store_true", help="skip the faster-whisper alignment when timings are estimated")
    ap.add_argument("--normalize-only", default=None, help="only print the normalized text")
    a = ap.parse_args()

    load_env()
    L = base_lang(a.lang)
    lex = load_lexicon(L)
    if a.normalize_only is not None:
        print(normalize(a.normalize_only, L, lex))
        return
    d = DEFAULTS.get(L, DEFAULTS["en"])
    provider = a.provider or d["provider"]
    voice = a.voice or (d["voice"] if provider == d["provider"] else
                        {"edge": "en-US-AndrewMultilingualNeural", "kokoro": "af_heart"}.get(provider))
    speed = a.speed or (0.95 if provider == "kokoro" else None if provider == "elevenlabs" else 1.0)

    raw = sys.stdin.read() if a.script in (None, "-") else pathlib.Path(a.script).read_text(encoding="utf-8")
    pairs = display_pairs(raw, L, lex, do_norm=not a.no_normalize)
    text = " ".join(" ".join(s) for _, s in pairs)
    unknown = warn_unknown(text, L)
    if unknown:
        print(f"check pronunciation (add to lexicon.json if wrong): {', '.join(unknown)}", file=sys.stderr)

    try:
        samples, sr, words, approx = synth(text, provider, voice, L, speed, a.model, a.style, a.instructions)
    except Exception as e:  # edge needs internet; fall back to offline Kokoro for English
        if provider != "edge" or L != "en" or a.provider:
            raise
        print(f"edge-tts failed ({type(e).__name__}: {e}); falling back to offline kokoro af_heart", file=sys.stderr)
        provider, voice, speed = "kokoro", "af_heart", a.speed or 0.95
        samples, sr, words, approx = synth(text, provider, voice, L, speed)

    out = pathlib.Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(out.with_suffix(".wav"), samples, sr)
    dur = len(samples) / sr
    if len(words) != sum(len(s) for _, s in pairs):
        approx, words = True, approx_words_audio(text, samples, sr)
    words = to_display(pairs, words)
    if approx and not a.no_align:
        words, approx = try_align(out, raw, L, words)
    wpm = len(words) / max(dur, 0.1) * 60
    meta = {"text": text, "lang": L, "provider": provider, "voice": voice, "duration": round(dur, 3), "wpm": round(wpm),
            "approx": approx, "words": words}
    pathlib.Path(str(out) + ".words.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({"wav": str(out.with_suffix(".wav")), "duration": round(dur, 2), "words": len(words), "wpm": round(wpm),
                      "approx": approx, "provider": provider, "voice": voice}, ensure_ascii=False))
    limit = 150 if L == "he" else 170  # Hebrew words are longer in syllables
    if wpm > limit:
        print(f"warning: above {limit} words per minute; cut text or lower --speed", file=sys.stderr)


if __name__ == "__main__":
    main()
