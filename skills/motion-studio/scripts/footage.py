#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Raw footage -> edit decision list (jump cuts without silences) + captions remapped to the edited timeline.

  uv run scripts/footage.py cut public/footage/raw.mp4 -o public/footage/edl.json
  uv run scripts/footage.py cut raw.mp4 --noise -32 --min-silence 0.35 --pad 0.08 --punch 1.12
  uv run scripts/footage.py captions public/footage/edl.json public/audio/speech.words.json -o public/footage/captions.json

Workflow (references/footage.md):
  1. align.py raw.mp4 --transcribe -o public/audio/speech --lang he   -> what was said, word timings on the RAW clip
  2. footage.py cut raw.mp4                                           -> segments to keep (silences removed)
  3. footage.py captions edl.json speech.words.json                    -> the same words, on the EDITED clock
  4. <JumpCut edl={edl} /> + <Captions words={...} /> in the scene      (src/components/Footage.tsx)

edl.json: {src, fps, duration, segments: [{in, out, at, zoom}]}; `in`/`out` on the raw clip, `at` on the edited clock.
Every other segment gets a punch-in zoom (--punch) so jump cuts read as intentional and hide the skip.
Needs ffmpeg/ffprobe on PATH.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import subprocess
import sys


def probe(src: str) -> dict:
    out = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", src],
                         capture_output=True, text=True, check=True).stdout
    j = json.loads(out)
    v = next((s for s in j["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in j["streams"] if s["codec_type"] == "audio"), None)
    fps = 30.0
    if v and v.get("avg_frame_rate", "0/0") != "0/0":
        n, d = v["avg_frame_rate"].split("/")
        fps = float(n) / float(d)
    return {"duration": float(j["format"]["duration"]), "fps": round(fps, 3), "width": v and v["width"], "height": v and v["height"],
            "has_audio": a is not None}


def silences(src: str, noise_db: float, min_sil: float) -> list[tuple[float, float]]:
    p = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", src, "-af", f"silencedetect=noise={noise_db}dB:d={min_sil}",
                        "-f", "null", "-"], capture_output=True, text=True)
    out, start = [], None
    for line in p.stderr.splitlines():
        m = re.search(r"silence_start: (-?[\d.]+)", line)
        if m:
            start = max(0.0, float(m.group(1)))
        m = re.search(r"silence_end: ([\d.]+)", line)
        if m and start is not None:
            out.append((start, float(m.group(1))))
            start = None
    return out


def cmd_cut(a):
    info = probe(a.src)
    if not info["has_audio"]:
        sys.exit("no audio track: nothing to cut on; edit by hand in edl.json")
    dur = info["duration"]
    sil = silences(a.src, a.noise, a.min_silence)
    keep, t = [], 0.0
    for s0, s1 in sil:
        if s0 - t > 0:
            keep.append((t, s0))
        t = s1
    if dur - t > 0:
        keep.append((t, dur))
    # pad around speech, merge overlaps, drop slivers
    padded = []
    for k0, k1 in keep:
        k0, k1 = max(0.0, k0 - a.pad), min(dur, k1 + a.pad)
        if padded and k0 <= padded[-1][1] + 0.02:
            padded[-1] = (padded[-1][0], max(padded[-1][1], k1))
        else:
            padded.append((k0, k1))
    padded = [(x, y) for x, y in padded if y - x >= a.min_keep]
    fps = info["fps"]
    segs, at = [], 0.0
    for i, (x, y) in enumerate(padded):
        x, y = round(round(x * fps) / fps, 4), round(round(y * fps) / fps, 4)  # frame-snap so cuts never split a frame
        segs.append({"in": x, "out": y, "at": round(at, 4), "zoom": a.punch if (a.punch and i % 2 == 1) else 1.0})
        at += y - x
    edl = {"src": a.src.replace("\\", "/"), "fps": fps, "width": info["width"], "height": info["height"], "raw_duration": round(dur, 3),
           "duration": round(at, 3), "segments": segs, "params": {"noise": a.noise, "min_silence": a.min_silence, "pad": a.pad}}
    pathlib.Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    pathlib.Path(a.out).write_text(json.dumps(edl, indent=1), encoding="utf-8")
    print(json.dumps({"edl": a.out, "cuts": len(segs) - 1, "raw": round(dur, 2), "edited": round(at, 2),
                      "removed_sec": round(dur - at, 2)}))


def cmd_captions(a):
    edl = json.loads(pathlib.Path(a.edl).read_text(encoding="utf-8"))
    words = json.loads(pathlib.Path(a.words).read_text(encoding="utf-8"))["words"]
    out, dropped = [], 0
    for w in words:
        mid = (w["start"] + w["end"]) / 2
        seg = next((s for s in edl["segments"] if s["in"] <= mid < s["out"]), None)
        if not seg:
            dropped += 1
            continue
        f = lambda t: round(seg["at"] + min(max(t, seg["in"]), seg["out"]) - seg["in"], 3)  # noqa: E731
        out.append({**w, "start": f(w["start"]), "end": f(w["end"])})
    pathlib.Path(a.out).write_text(json.dumps({"duration": edl["duration"], "words": out}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({"captions": a.out, "words": len(out), "dropped_in_cuts": dropped}))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("cut", help="remove silences -> edl.json")
    c.add_argument("src")
    c.add_argument("-o", "--out", default="public/footage/edl.json")
    c.add_argument("--noise", type=float, default=-32, help="silence threshold in dB (noisy room: -28; quiet studio: -38)")
    c.add_argument("--min-silence", type=float, default=0.35, help="shortest pause that gets cut, seconds")
    c.add_argument("--pad", type=float, default=0.08, help="breathing room kept around speech, seconds")
    c.add_argument("--min-keep", type=float, default=0.25, help="drop kept slivers shorter than this")
    c.add_argument("--punch", type=float, default=1.12, help="zoom for every other segment (1 = off)")
    k = sub.add_parser("captions", help="remap raw word timings onto the edited timeline")
    k.add_argument("edl")
    k.add_argument("words")
    k.add_argument("-o", "--out", default="public/footage/captions.json")
    a = ap.parse_args()
    {"cut": cmd_cut, "captions": cmd_captions}[a.cmd](a)


if __name__ == "__main__":
    main()
