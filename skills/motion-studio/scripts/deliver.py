#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Delivery: ensures h264 yuv420p (TV range), AAC 48 kHz and faststart without re-encoding what is already right.

  uv run scripts/deliver.py out/render.mp4 -o out/final.mp4
Remotion renders already come out as TV-range yuv420p: in that case the video is copied losslessly.
Re-encoding only happens when the file arrives in full range (yuvj420p) or another pixel format.
Render with --color-space=bt709 (the template already sets it) so the file comes out color-tagged.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", path], capture_output=True, text=True, check=True).stdout
    streams = json.loads(out)["streams"]
    v = next((s for s in streams if s["codec_type"] == "video"), None)
    a = next((s for s in streams if s["codec_type"] == "audio"), None)
    return v, a


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src")
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--crf", type=int, default=18)
    ap.add_argument("--preset", default="medium")
    a = ap.parse_args()
    v, au = probe(a.src)
    if v is None:
        sys.exit("no video stream")
    pix, rng = v.get("pix_fmt"), v.get("color_range")
    full = pix == "yuvj420p" or rng == "pc"
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", a.src]
    if v["codec_name"] == "h264" and pix == "yuv420p" and not full:
        cmd += ["-c:v", "copy"]
        modo = "video copied without re-encode"
        if v.get("color_space") != "bt709":
            print("WARN  color not tagged BT.709: render with --color-space=bt709", file=sys.stderr)
    else:
        # Compress the range only when the source is full range: applying it to TV range washes out contrast.
        vf = "scale=in_range=pc:out_range=tv,format=yuv420p" if full else "format=yuv420p"
        cmd += [
            "-vf", vf, "-c:v", "libx264", "-preset", a.preset, "-crf", str(a.crf),
            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
        ]
        modo = f"video re-encoded ({pix}, range {'full' if full else rng or 'untagged'})"
    if au is not None and au["codec_name"] == "aac" and au.get("sample_rate") == "48000":
        cmd += ["-c:a", "copy"]
    elif au is not None:
        cmd += ["-c:a", "aac", "-b:a", "192k", "-ar", "48000"]
    cmd += ["-movflags", "+faststart", a.out]
    subprocess.run(cmd, check=True)
    print(modo, file=sys.stderr)
    print(a.out)


if __name__ == "__main__":
    main()
