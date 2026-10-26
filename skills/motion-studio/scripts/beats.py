#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["librosa>=0.10", "numpy"]
# ///
"""Music track beats and onsets, for cutting and animating on the beat.

  uv run scripts/beats.py public/audio/music.mp3 --fps 30 -o public/audio/beats.json
  uv run scripts/beats.py public/audio/music.mp3 --bpm 84   (uses a known BPM, e.g. Incompetech)
Output: bpm, beats (s), estimated downbeats (every 4), onsets (s) and the same values in frames.
Calm music has no reliable grid: cut on narration phrases, not beats.
"""
from __future__ import annotations

import argparse
import json
import pathlib

import librosa
import numpy as np


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--bpm", type=float, default=None)
    ap.add_argument("-o", "--out", default=None)
    a = ap.parse_args()
    y, sr = librosa.load(a.audio, sr=22050, mono=True)
    kw = {"bpm": a.bpm} if a.bpm else {}
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time", **kw)
    onsets = librosa.onset.onset_detect(y=y, sr=sr, units="time", backtrack=True)
    bpm = float(np.atleast_1d(tempo)[0])
    beats = [round(float(b), 3) for b in beats]
    data = {
        "bpm": round(bpm, 2),
        "beats": beats,
        "downbeats": beats[::4],
        "onsets": [round(float(o), 3) for o in onsets],
        "fps": a.fps,
        "beat_frames": [round(b * a.fps) for b in beats],
        "downbeat_frames": [round(b * a.fps) for b in beats[::4]],
    }
    out = pathlib.Path(a.out or pathlib.Path(a.audio).with_suffix(".beats.json"))
    out.write_text(json.dumps(data, indent=1), encoding="utf-8")
    print(json.dumps({"out": str(out), "bpm": data["bpm"], "beats": len(beats), "onsets": len(data["onsets"])}))


if __name__ == "__main__":
    main()
