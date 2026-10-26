#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy"]
# ///
"""QA gate for the final MP4 and per-scene pacing meter. Exits with code 1 if any blocking check fails.

  uv run scripts/qa.py out/video.mp4 --profile youtube
  uv run scripts/qa.py out/loop.mp4 --loop
  uv run scripts/qa.py out/video.mp4 --words public/audio/narration.words.json --lufs -14
  uv run scripts/qa.py out/video.mp4 --timeline public/timeline.json     # per-scene pacing
  uv run scripts/qa.py out/video.mp4 --stills out/stills                 # checks contrast against the stills
Checks: codec/pixel format/fps/audio, audio vs video duration, integrated loudness and true peak,
photosensitive flashes (more than 3 per second), 1-frame pops, static stretches, black frames, loop seam,
caption reading speed (characters per second) and, with --stills, whether the MP4 keeps the stills'
contrast (catches luma range compressed by re-encoding).
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import subprocess
import sys

import numpy as np

PROFILES = {
    "youtube": {"w": 1920, "h": 1080, "lufs": -14, "tp": -1.0},
    "reels": {"w": 1080, "h": 1920, "lufs": -14, "tp": -1.0},
    "tiktok": {"w": 1080, "h": 1920, "lufs": -14, "tp": -1.0},
    "square": {"w": 1080, "h": 1080, "lufs": -14, "tp": -1.0},
    "linkedin": {"w": 1920, "h": 1080, "lufs": -14, "tp": -1.0},
    "podcast": {"w": None, "h": None, "lufs": -16, "tp": -1.0},
}


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def probe(path):
    j = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path]).stdout)
    v = next((s for s in j["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in j["streams"] if s["codec_type"] == "audio"), None)
    return j, v, a


def gray_frames(path, w=64, h=36):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"scale={w}:{h},format=gray", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.float32) / 255


def luma_image(path, frame=None, w=64, h=36):
    """BT.709 luma computed from RGB, identical for PNG and MP4. ffmpeg's format=gray uses BT.601 weights on PNG and the
    file's Y on MP4: on saturated colors (orange, lime, blue) the two diverge without the video being wrong.
    On MP4 the frame is picked by number (select), not by time: seeking may land on the neighboring frame."""
    pick = [f"select=eq(n\\,{int(frame)})"] if frame is not None else []
    vf = ",".join(pick + [f"scale={w}:{h}:flags=area"])
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", vf, "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    rgb = np.frombuffer(raw, np.uint8).reshape(h, w, 3).astype(np.float32) / 255
    return rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video")
    ap.add_argument("--profile", default="youtube", choices=list(PROFILES))
    ap.add_argument("--lufs", type=float, default=None)
    ap.add_argument("--loop", action="store_true", help="checks the seam from the last frame to the first")
    ap.add_argument("--words", default=None, help="narration words.json to measure reading speed")
    ap.add_argument("--max-cps", type=float, default=17.0)
    ap.add_argument("--timeline", default=None, help="timeline.json: measures motion pacing per scene")
    ap.add_argument("--static-sec", type=float, default=1.5, help="maximum time without motion")
    ap.add_argument("--stills", default=None, help="stills.cjs folder: compares MP4 contrast with the stills")
    a = ap.parse_args()
    prof = PROFILES[a.profile]
    lufs_target = a.lufs if a.lufs is not None else prof["lufs"]
    res = []

    def check(name, ok, detail, blocking=True):
        res.append({"check": name, "status": "PASS" if ok else ("FAIL" if blocking else "WARN"), "detail": detail})

    j, v, au = probe(a.video)
    fps = eval(v["avg_frame_rate"]) if v else 0  # noqa: S307 (ffprobe fraction, e.g. 30/1)
    vdur = float(j["format"]["duration"])
    check("video h264 yuv420p", v and v["codec_name"] == "h264" and v.get("pix_fmt") == "yuv420p", f"{v and v['codec_name']} {v and v.get('pix_fmt')}")
    if prof["w"]:
        check("profile resolution", v and (v["width"], v["height"]) == (prof["w"], prof["h"]), f"{v['width']}x{v['height']} (profile {a.profile})", blocking=False)
    check("color tagged as BT.709", v and v.get("color_space") == "bt709", f"color_space={v and v.get('color_space', 'untagged')}" + ("" if v and v.get("color_space") == "bt709" else ": render with --color-space=bt709"), blocking=False)
    check("standard fps", round(fps, 3) in (24, 25, 30, 50, 60, 23.976, 29.97, 59.94), f"{fps:.3f}", blocking=False)
    check("has audio", au is not None, au["codec_name"] if au else "no audio stream")

    if au:
        adur = float(au.get("duration", vdur))
        check("audio covers video", abs(adur - vdur) <= 0.15, f"audio {adur:.2f}s vs video {vdur:.2f}s")
        e = run(["ffmpeg", "-hide_banner", "-nostats", "-i", a.video, "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr
        summ = e[e.rfind("Summary:"):]
        I = float(re.search(r"I:\s+(-?[\d.]+) LUFS", summ).group(1))
        tp = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", summ).group(1))
        check("integrated loudness", abs(I - lufs_target) <= 1.0, f"{I:.1f} LUFS (target {lufs_target})")
        check("true peak", tp <= prof["tp"] + 0.05, f"{tp:.1f} dBTP (max {prof['tp']})")

    g = gray_frames(a.video)
    mean = g.mean((1, 2))
    # Flash: pair of opposing mean-luminance changes >= 10% (approx. WCAG 2.3.1 general).
    d = np.diff(mean)
    ev = np.where(np.abs(d) >= 0.10)[0]
    flashes, last_sign = [], 0
    for i in ev:
        s = np.sign(d[i])
        if last_sign and s != last_sign:
            flashes.append(i)
        last_sign = s
    win = int(round(fps)) or 30
    worst = max((sum(1 for f in flashes if k <= f < k + win) for k in range(0, len(mean), max(1, win // 2))), default=0)
    check("flashes per second <= 3", worst <= 3, f"worst window: {worst}")

    if a.stills:
        # The still is the color Chrome drew; the MP4 must return the same black and white.
        d = pathlib.Path(a.stills)
        idx = json.loads((d / "index.json").read_text(encoding="utf-8"))["stills"]
        picks = [it for it in idx if it["frame"] < len(g)]
        picks = picks[:: max(1, len(picks) // 6)][:6]
        if picks:
            ref = np.stack([luma_image(str(d / it["file"])) for it in picks])
            got = np.stack([luma_image(a.video, it["frame"]) for it in picks])
            lo, hi = np.percentile(got, 1) - np.percentile(ref, 1), np.percentile(got, 99) - np.percentile(ref, 99)
            err = float(np.abs(got - ref).mean())
            check("contrast matches stills", err <= 0.02 and lo <= 0.025 and hi >= -0.025, f"mean error {err * 255:.1f}/255, black {lo * 255:+.0f}, white {hi * 255:+.0f} ({len(picks)} frames)")

    motion = np.abs(np.diff(g, axis=0)).mean((1, 2))
    still = motion < 0.0015
    longest, run_len = 0, 0
    for s in still:
        run_len = run_len + 1 if s else 0
        longest = max(longest, run_len)
    check("no long static stretch", longest / fps <= a.static_sec, f"longest static stretch: {longest / fps:.2f}s", blocking=False)

    # 1-frame pop: a frame differing from both neighbors, which match each other (blinking element, wrong frame at a cut).
    if len(g) > 2:
        skip = np.abs(g[2:] - g[:-2]).mean((1, 2))
        pops = [i + 1 for i in range(len(skip)) if motion[i] > 0.02 and motion[i + 1] > 0.02 and skip[i] < 0.25 * min(motion[i], motion[i + 1])]
        check("no 1-frame pop", not pops, "none" if not pops else "frames " + ", ".join(f"{p} ({p / fps:.2f}s)" for p in pops[:6]), blocking=False)

    dark = mean < 0.02
    check("no black frames mid-video", not dark[int(fps * 0.5):-int(fps * 0.5) or None].any(), f"{int(dark.sum())} near-black frames", blocking=False)

    if a.loop:
        seam = np.abs(g[0] - g[-1]).mean()
        typical = np.median(motion) if len(motion) else 0
        check("loop seam", seam <= max(2.5 * typical, 0.004), f"seam difference {seam:.4f} vs typical step {typical:.4f}")

    if a.timeline:
        # Pacing: motion energy per scene, like a loudness meter for the picture.
        scenes = json.load(open(a.timeline, encoding="utf-8"))["scenes"]
        ref = float(np.percentile(motion, 90)) or 1e-6
        calm = motion < 0.2 * ref
        means, rows = [], []
        for s in scenes:
            i0, i1 = int(s["start"] * fps), max(int(s["end"] * fps) - 1, int(s["start"] * fps) + 1)
            seg, rest = motion[i0:i1], calm[i0:i1]
            best = cur = 0
            for c in rest:
                cur = cur + 1 if c else 0
                best = max(best, cur)
            means.append(float(seg.mean()))
            rows.append((s["id"], seg.mean() / ref, rest.mean(), best / fps, int(seg.argmax()) / max(len(seg), 1)))
            check(f"breathing room in scene {s['id']}", best / fps >= 0.25 or (s["end"] - s["start"]) < 1.5, f"longest pause {best / fps:.2f}s (minimum 0.25 s to allow reading)", blocking=False)
            check(f"motion in scene {s['id']}", rest.mean() <= 0.85, f"{rest.mean():.0%} of the scene nearly still (max 85%)", blocking=False)
        print("pacing per scene (relative energy, % at rest, longest pause, peak position):")
        for r in rows:
            print(f"      {r[0]:14s} {r[1]:5.2f}  {r[2]:4.0%}  {r[3]:4.2f}s  peak at {r[4]:.0%}")
        if len(means) > 2:
            ratio = max(means) / max(min(means), 1e-6)
            check("pacing contrast between scenes", ratio >= 1.5, f"busiest scene has {ratio:.1f}x the energy of the calmest (minimum 1.5x)", blocking=False)

    if a.words:
        words = json.load(open(a.words, encoding="utf-8"))["words"]
        sys.path.insert(0, "")
        groups, cur = [], []
        for i, w in enumerate(words):
            cur.append(w)
            nxt = words[i + 1] if i + 1 < len(words) else None
            if not nxt or re.search(r"[.,;:!?…]$", w["word"]) or len(cur) >= 6:
                groups.append(cur)
                cur = []
        worst_cps = max((sum(len(x["word"]) for x in g_) / max(g_[-1]["end"] - g_[0]["start"], 0.3) for g_ in groups), default=0)
        check("caption reading speed", worst_cps <= a.max_cps, f"worst phrase: {worst_cps:.1f} cps (max {a.max_cps})", blocking=False)

    for r in res:
        print(f"{r['status']:4s}  {r['check']}: {r['detail']}")
    failed = [r for r in res if r["status"] == "FAIL"]
    print(json.dumps({"pass": not failed, "fails": len(failed), "warns": sum(r['status'] == 'WARN' for r in res)}))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
