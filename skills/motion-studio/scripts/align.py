#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["faster-whisper>=1.1", "numpy"]
# ///
"""Aligns an already generated narration WAV to the script and writes <out>.words.json with real timings.

Works for any voice that does not return per-word timings: a local model outside tts.py
(Chatterbox, F5-TTS, Qwen3-TTS, Piper...), OpenAI, Azure or a human-recorded voice.

  uv run scripts/align.py public/audio/narration.wav roteiro.txt
  uv run scripts/align.py voz.wav roteiro.txt -o public/audio/narration --lang he --model small
  uv run scripts/align.py voz.wav roteiro.txt --against public/audio/narration.words.json   # measures the error
  uv run scripts/align.py filmagem.mp4 --transcribe -o public/audio/fala     # no script: writes what was said

With --transcribe there is no script: outputs what Whisper heard, with timings, to caption speech in footage.
Read and fix the spelling in <out>.txt and rerun with it as the script: the corrected text gets the same timings.

The script owns the text (what appears on screen); Whisper only lends the timings. `mismatch` counts
words heard differently from the script (mispronunciation, changed text, spelled-out numbers) and
`interpolated` those not heard that got time split between their neighbors.
"""
from __future__ import annotations

import argparse
import difflib
import json
import pathlib
import re
import subprocess
import sys
import unicodedata

import numpy as np


def norm(w: str) -> str:
    w = unicodedata.normalize("NFKD", w.lower())
    return re.sub(r"[^a-z0-9\u05D0-\u05EA]", "", "".join(c for c in w if not unicodedata.combining(c)))


def decode(path: str) -> np.ndarray:
    # ffmpeg instead of faster-whisper's PyAV: avoids PyAV version incompatibilities.
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, np.float32)


MODELS = {
    # ivrit.ai fine-tune of Whisper large-v3-turbo for Hebrew (CTranslate2 format, ~1.6 GB once). Far fewer spelling errors.
    "ivrit": "ivrit-ai/whisper-large-v3-turbo-ct2",
    "turbo": "large-v3-turbo",  # faster-whisper >= 1.1 built-in alias
}


def transcribe(audio: np.ndarray, lang: str, model: str) -> list[dict]:
    from faster_whisper import WhisperModel

    model = MODELS.get(model, model)
    try:  # NVIDIA GPU when available (much faster for the large Hebrew model), else CPU int8
        m = WhisperModel(model, device="cuda", compute_type="float16")
    except Exception:  # noqa: BLE001 - no CUDA/cuDNN: fall back quietly
        m = WhisperModel(model, device="cpu", compute_type="int8")
    segs, _ = m.transcribe(audio, language=lang, word_timestamps=True, vad_filter=False)
    return [{"word": w.word.strip(), "start": w.start, "end": w.end} for s in segs for w in s.words if w.word.strip()]


def align(script_words: list[str], heard: list[dict], duration: float) -> tuple[list[dict], int, int]:
    """Returns (timed words, how many were interpolated, how many Whisper heard differently from the script)."""
    a, b = [norm(w) for w in script_words], [norm(h["word"]) for h in heard]
    times: list[tuple[float, float] | None] = [None] * len(a)
    exact = 0
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == "equal":
            exact += i2 - i1
            for k in range(i2 - i1):
                times[i1 + k] = (heard[j1 + k]["start"], heard[j1 + k]["end"])
        elif tag == "replace" and j2 > j1:
            # Span heard differently from the text (spelled-out number, acronym): split the interval by length.
            t0, t1 = heard[j1]["start"], heard[j2 - 1]["end"]
            w = np.array([max(len(x), 1) for x in a[i1:i2]], float)
            edges = t0 + np.concatenate([[0], np.cumsum(w)]) / w.sum() * (t1 - t0)
            for k in range(i2 - i1):
                times[i1 + k] = (float(edges[k]), float(edges[k + 1]))
    missing = sum(t is None for t in times)
    i = 0
    while i < len(times):
        if times[i] is not None:
            i += 1
            continue
        j = i
        while j < len(times) and times[j] is None:
            j += 1
        t0 = times[i - 1][1] if i else 0.0
        t1 = times[j][0] if j < len(times) else duration
        step = (t1 - t0) / (j - i)
        for k in range(i, j):
            times[k] = (t0 + (k - i) * step, t0 + (k - i + 1) * step)
        i = j
    words = [{"word": w, "spoken": w, "start": round(t[0], 3), "end": round(t[1], 3)} for w, t in zip(script_words, times)]
    return words, missing, len(a) - exact


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("wav")
    ap.add_argument("script", nargs="?", help="script .txt with the displayed text")
    ap.add_argument("--transcribe", action="store_true", help="no script: use what was heard")
    ap.add_argument("-o", "--out", default=None, help="output prefix (default: the wav's)")
    ap.add_argument("--lang", default="en", help="en | he")
    ap.add_argument("--model", default=None, help="tiny, base, small, medium, turbo, ivrit (any faster-whisper id). "
                    "Default: ivrit for Hebrew (ivrit-ai Hebrew fine-tune), small for English")
    ap.add_argument("--against", default=None, help="reference words.json: prints the mean word-start error")
    a = ap.parse_args()

    if not a.script and not a.transcribe:
        ap.error("provide the script or --transcribe")
    a.model = a.model or ("ivrit" if a.lang.startswith("he") else "small")
    audio = decode(a.wav)
    duration = len(audio) / 16000
    heard = transcribe(audio, a.lang, a.model)
    if a.transcribe:
        out = pathlib.Path(a.out) if a.out else pathlib.Path(a.wav).with_suffix("")
        out.parent.mkdir(parents=True, exist_ok=True)
        words = [{"word": h["word"], "spoken": h["word"], "start": round(h["start"], 3), "end": round(h["end"], 3)} for h in heard]
        text = " ".join(w["word"] for w in words)
        meta = {"text": text, "provider": "transcribe", "voice": None, "duration": round(duration, 3), "wpm": round(len(words) / max(duration, 0.1) * 60), "approx": False, "words": words}
        pathlib.Path(str(out) + ".words.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        pathlib.Path(str(out) + ".txt").write_text(text + "\n", encoding="utf-8")
        print(json.dumps({"out": str(out) + ".words.json", "text": str(out) + ".txt", "words": len(words), "duration": round(duration, 2)}, ensure_ascii=False))
        print(text, file=sys.stderr)
        return
    script_words = [w for w in pathlib.Path(a.script).read_text(encoding="utf-8").split() if re.search(r"\w", w)]
    words, missing, differ = align(script_words, heard, duration)
    wpm = len(words) / max(duration, 0.1) * 60
    out = pathlib.Path(a.out) if a.out else pathlib.Path(a.wav).with_suffix("")
    meta = {
        "text": " ".join(script_words), "provider": "align", "voice": None, "duration": round(duration, 3),
        "wpm": round(wpm), "approx": max(missing, differ) > len(words) * 0.2, "interpolated": missing, "mismatch": differ, "words": words,
    }
    report = {"words": len(words), "heard": len(heard), "interpolated": missing, "mismatch": differ, "wpm": round(wpm), "approx": meta["approx"]}
    if a.against:
        ref = json.load(open(a.against, encoding="utf-8"))["words"]
        if len(ref) == len(words):
            err = [abs(r["start"] - w["start"]) for r, w in zip(ref, words)]
            report["start_error_ms"] = {"mean": round(float(np.mean(err)) * 1000), "max": round(float(np.max(err)) * 1000)}
        else:
            report["start_error_ms"] = f"reference has {len(ref)} words, script has {len(words)}"
    else:
        pathlib.Path(str(out) + ".words.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        report["out"] = str(out) + ".words.json"
    print(json.dumps(report, ensure_ascii=False))
    if differ > len(words) * 0.2:
        print(f"warning: {differ} of {len(words)} words were heard differently from the script: check pronunciation, text and language (numbers and acronyms count)", file=sys.stderr)


if __name__ == "__main__":
    main()
