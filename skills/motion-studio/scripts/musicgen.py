#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "scipy", "soundfile"]
# ///
"""Procedural music bed, synthesized in code: drums, bass, pads, plucks, sidechain, reverb. No samples, no license.

  uv run scripts/musicgen.py --mood uplift --sec 30 -o public/audio/music.wav
  uv run scripts/musicgen.py --mood hype --bpm 140 --sec 20 --key F --hits 4.0,9.6,15.2 -o public/audio/music.wav
  uv run scripts/musicgen.py --mood calm --sec 45 --seed 3 -o public/audio/music.wav --stems

Moods:
  calm       lofi: soft kick, rim, swung hats, warm maj7 keys, vinyl hiss        (default 82 bpm)
  uplift     tech/pop: four-on-the-floor, claps, offbeat hats, 16th pluck arp, sidechained pads (default 118 bpm)
  corporate  clean: light kit, piano-like 8th plucks, soft pads               (default 104 bpm)
  tense      minor drone, low pulses, ticking hats, rising filter              (default 94 bpm)
  hype       trap half-time: 808 bass, hat rolls, snare on 3, dark pluck     (default 140 bpm)

--hits t1,t2,...  scene cuts (seconds): a riser leads into each and a crash/impact lands on it, in tempo with the bed.
                  Use the cut times from public/timeline.json so music, SFX and picture hit together.
Structure: 1 bar intro (no drums) -> full groove -> last bar drums out + 1.5 s tail. Output 48 kHz stereo WAV, peak -1 dBFS;
mix.py does the loudness and ducking under the voice. Writes credits.json entry ("generated").
"""
from __future__ import annotations

import argparse
import json
import pathlib

import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
NOTES = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
MOODS = {
    #            bpm  swing  progression (degree, chord intervals)                                           kit
    "calm":      (82, 0.58, [(0, [0, 4, 7, 11, 14]), (9, [0, 3, 7, 10, 14]), (2, [0, 3, 7, 10]), (7, [0, 4, 7, 10, 14])], "lofi"),
    "uplift":    (118, 0.5, [(0, [0, 4, 7]), (7, [0, 4, 7]), (9, [0, 3, 7]), (5, [0, 4, 7, 11])], "four"),
    "corporate": (104, 0.5, [(0, [0, 4, 7, 14]), (5, [0, 4, 7, 14]), (9, [0, 3, 7, 10]), (7, [0, 5, 7, 14])], "light"),
    "tense":     (94, 0.5, [(0, [0, 3, 7]), (8, [0, 4, 7]), (5, [0, 3, 7]), (7, [0, 3, 6])], "tense"),
    "hype":      (140, 0.5, [(0, [0, 3, 7]), (8, [0, 4, 7]), (3, [0, 4, 7]), (10, [0, 4, 7])], "trap"),
}


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def lp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, min(fc, SR / 2 - 200), "lowpass", fs=SR, output="sos"), x)


def hp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, "highpass", fs=SR, output="sos"), x)


def bp(x, f0, f1, order=2):
    return signal.sosfilt(signal.butter(order, [f0, f1], "bandpass", fs=SR, output="sos"), x)


def saw(f, n, phase=0.0):
    t = np.arange(n) / SR
    return 2 * ((f * t + phase) % 1.0) - 1


def adsr(n, a=0.005, d=0.1, s=0.6, r=0.1):
    e = np.full(n, float(s))
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = min(na, n)
    e[:na] = np.linspace(0, 1, na, endpoint=False)
    nd = min(nd, n - na)
    e[na:na + nd] = np.linspace(1, s, nd, endpoint=False)
    if nr and n > nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


class Bus:
    def __init__(self, n):
        self.L, self.R = np.zeros(n), np.zeros(n)

    def add(self, x, at, gain=1.0, pan=0.0):
        s = int(at * SR)
        if s >= len(self.L) or s < 0:
            return
        x = x[: len(self.L) - s]
        gl, gr = gain * np.sqrt((1 - pan) / 2), gain * np.sqrt((1 + pan) / 2)
        if x.ndim == 2:
            self.L[s:s + len(x)] += x[:, 0] * gain
            self.R[s:s + len(x)] += x[:, 1] * gain
        else:
            self.L[s:s + len(x)] += x * gl * 1.414
            self.R[s:s + len(x)] += x * gr * 1.414

    def stereo(self):
        return np.stack([self.L, self.R], axis=1)


# ---------- drums ----------
def kick(rng, punch=1.0, dur=0.45):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 45 + 110 * punch * np.exp(-t * 28)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    click = hp(rng.standard_normal(n), 2000) * np.exp(-t * 300) * 0.25
    return np.tanh(1.6 * (body + click))


def snare(rng, clap=False):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    noise = bp(rng.standard_normal(n), 900, 7000)
    if clap:  # three quick bursts
        env = sum(np.exp(-np.maximum(t - k * 0.011, 0) * 60) * (t >= k * 0.011) for k in range(3)) * 0.5 + np.exp(-t * 18) * 0.5
        return noise * env * 0.8
    body = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 30)
    return noise * np.exp(-t * 20) * 0.7 + body * 0.5


def rim(rng):
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 1700 * t) * 0.6 + bp(rng.standard_normal(n), 2000, 6000) * 0.4) * np.exp(-t * 80)


def hat(rng, open_=False):
    n = int((0.3 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7000) * np.exp(-t * (12 if open_ else 70)) * 0.5


def crash(rng):
    n = int(2.2 * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 3500) * np.exp(-t * 2.2) * 0.45


def riser(rng, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out, blk = np.zeros(n), 512
    for i, fc in enumerate(np.geomspace(400, 9000, max(1, n // blk + 1))):
        seg = noise[i * blk:(i + 1) * blk]
        if len(seg):
            out[i * blk:i * blk + len(seg)] = bp(seg, fc * 0.7, min(fc * 1.4, SR / 2 - 500), 1)
    return out * (t / dur) ** 2.2 * 0.6


# ---------- tonal ----------
def pad(freqs, dur, cutoff=1800, detune=0.006):
    n = int(dur * SR)
    L, R = np.zeros(n), np.zeros(n)
    for f in freqs:
        for k, d in enumerate((-detune, 0, detune)):
            ph = (k * 0.31) % 1
            L += saw(f * (1 + d), n, ph) * (0.6 if k != 1 else 1)
            R += saw(f * (1 - d * 0.9), n, ph + 0.17) * (0.6 if k != 1 else 1)
    env = adsr(n, a=min(0.35, dur / 3), d=0.3, s=0.85, r=min(0.4, dur / 3))
    k = 1 / (len(freqs) * 2.2)
    return np.stack([lp(L, cutoff) * env * k, lp(R, cutoff) * env * k], axis=1)


def pluck(f, dur=0.5, bright=4000, decay=7.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = saw(f, n) * 0.6 + saw(f * 2.003, n) * 0.25
    # moving low-pass: bright attack that closes
    out = np.zeros(n)
    blk = 256
    for i in range(0, n, blk):
        fc = 300 + bright * np.exp(-(i / SR) * 14)
        out[i:i + blk] = lp(x[i:i + blk], fc, 1)
    return out * np.exp(-t * decay) * adsr(n, 0.002, 0.05, 1, 0.02)


def keys(f, dur=0.9):  # electric-piano-ish: FM sine
    n = int(dur * SR)
    t = np.arange(n) / SR
    mod = np.sin(2 * np.pi * f * 2 * t) * 1.2 * np.exp(-t * 6)
    return np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 2.5) * adsr(n, 0.004, 0.1, 1, 0.08)


def bass(f, dur, kind="saw", slide_from=None):
    n = int(dur * SR)
    t = np.arange(n) / SR
    if kind == "808":
        fr = np.full(n, f) if slide_from is None else f + (slide_from - f) * np.exp(-t * 25)
        x = np.sin(2 * np.pi * np.cumsum(fr) / SR)
        return np.tanh(2.2 * x) * 0.55 * np.exp(-t * 1.6) * adsr(n, 0.003, 0.05, 1, 0.05)
    x = saw(f, n) * 0.7 + np.sin(2 * np.pi * f / 2 * t) * 0.5
    return lp(x, 380, 2) * adsr(n, 0.006, 0.12, 0.7, 0.05) * 0.7


def reverb(x, sec=1.8, wet=0.22, seed=11):
    rng = np.random.default_rng(seed)
    n = int(sec * SR)
    t = np.arange(n) / SR
    out = np.zeros_like(x)
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-t * 6.9 / sec)
        ir = lp(ir, 6000) * (t > 0.012)
        ir /= np.sqrt(np.sum(ir**2))
        out[:, ch] = signal.fftconvolve(hp(x[:, ch], 200), ir)[: len(x)]
    return x * (1 - wet * 0.5) + out * wet


def sidechain_env(n, kicks, depth=0.55, release=0.22):
    env = np.ones(n)
    r = int(release * SR)
    curve = 1 - depth * np.exp(-np.linspace(0, 5, r))
    for k in kicks:
        s = int(k * SR)
        if s < n:
            m = min(r, n - s)
            env[s:s + m] = np.minimum(env[s:s + m], curve[:m])
    return env


# ---------- arrangement ----------
def render(sec=30.0, bpm=None, key="C", mood="uplift", seed=7, hits=(), stems=False):
    base_bpm, swing, prog, kit = MOODS[mood]
    bpm = bpm or base_bpm
    rng = np.random.default_rng(seed)
    beat = 60 / bpm
    bar = beat * 4
    tail = 1.5
    n = int((sec + tail) * SR)
    root = 48 + NOTES[key]
    drums, music, low = Bus(n), Bus(n), Bus(n)
    bars = int(np.ceil(sec / bar))
    kicks = []
    k1, sn, rm = kick(rng, 1.0), snare(rng, clap=kit in ("four", "light")), rim(rng)
    hc, ho = hat(rng), hat(rng, True)

    def swung(b, eighth):
        off = (swing - 0.5) * beat if eighth % 2 else 0.0
        return b * bar + eighth * beat / 2 + off

    for b in range(bars):
        t0 = b * bar
        deg, chord = prog[b % len(prog)]
        groove = 1 <= b < bars - 1 or bars <= 2
        freqs = [hz(root + deg + iv + 12) for iv in chord]
        # pads / keys
        if kit == "lofi":
            for k, f in enumerate(freqs):
                music.add(keys(f, bar * 0.95), t0 + k * 0.012, 0.16, pan=(k - 2) * 0.2)
        elif kit == "tense":
            music.add(pad([hz(root + deg + 12), hz(root + deg + 19)], bar, cutoff=500 + 2500 * b / max(bars, 1)), t0, 0.9)
        else:
            music.add(pad(freqs, bar, cutoff=2200 if kit == "four" else 1500), t0, 0.75)
        # arps / plucks
        if kit in ("four", "light", "trap") and b >= (0 if kit == "light" else 1) or kit == "four" and b == 0:
            steps = 16 if kit == "four" else 8
            pattern = [0, 1, 2, 1, 3, 2, 1, 2] if kit != "trap" else [0, 2, 1, 0, 3, 1, 2, 0]
            for s in range(steps):
                tone = chord[pattern[s % 8] % len(chord)] + 24 + (12 if kit == "four" and s % 4 == 3 else 0)
                if kit == "trap" and s % 3 == 2:
                    continue
                f = hz(root + deg + tone)
                music.add(pluck(f, 0.4, bright=5000 if kit == "four" else 2600, decay=9 if kit == "four" else 6), t0 + s * bar / steps,
                          0.22 if kit == "four" else 0.28, pan=0.35 if s % 2 else -0.35)
        # bass
        if groove or kit in ("lofi", "tense"):
            fb = hz(root + deg - 12)
            if kit == "trap":
                for s, ln in ((0, 1.5), (1.75, 1.0), (3.0, 1.0)):
                    low.add(bass(fb, ln * beat, "808", slide_from=fb * 1.5 if s == 1.75 else None), t0 + s * beat, 0.9)
            elif kit == "four":
                for s in range(8):
                    low.add(bass(fb, beat / 2 * 0.9), t0 + s * beat / 2 + beat / 4, 0.55)
            elif kit == "tense":
                for s in (0, 2.5):
                    low.add(bass(fb, beat * 1.2), t0 + s * beat, 0.6)
            else:
                for s in (0, 1.5, 2, 3.5) if kit == "light" else (0, 2.5):
                    low.add(bass(fb, beat * 0.9), t0 + s * beat, 0.5 if kit == "light" else 0.4)
        if not groove:
            continue
        # drums
        if kit == "four":
            for q in range(4):
                drums.add(k1, t0 + q * beat, 0.9)
                kicks.append(t0 + q * beat)
                drums.add(hc if q % 2 == 0 else ho, t0 + q * beat + beat / 2, 0.35, pan=0.2)
            for q in (1, 3):
                drums.add(sn, t0 + q * beat, 0.55)
            for s in range(16):
                drums.add(hc, t0 + s * beat / 4, 0.12 + 0.06 * (s % 2), pan=-0.25)
        elif kit == "light":
            for q in (0, 2.5):
                drums.add(k1, t0 + q * beat, 0.65)
                kicks.append(t0 + q * beat)
            for q in (1, 3):
                drums.add(sn, t0 + q * beat, 0.35)
            for e in range(8):
                drums.add(hc, swung(b, e), 0.18, pan=0.2)
        elif kit == "lofi":
            kk = kick(rng, 0.6, 0.35)
            for q in (0, 2.5):
                drums.add(lp(kk, 1500), t0 + q * beat, 0.7)
                kicks.append(t0 + q * beat)
            for q in (1, 3):
                drums.add(rm, t0 + q * beat, 0.35)
            for e in range(8):
                drums.add(lp(hc, 9000), swung(b, e), 0.14 + 0.05 * (e % 2 == 0), pan=0.25)
        elif kit == "tense":
            for e in range(8):
                drums.add(hc, t0 + e * beat / 2, 0.16, pan=0.3)
            drums.add(kick(rng, 0.5, 0.6), t0, 0.7)
            kicks.append(t0)
        elif kit == "trap":
            drums.add(k1, t0, 0.85)
            drums.add(k1, t0 + 2.75 * beat, 0.6)
            kicks += [t0, t0 + 2.75 * beat]
            drums.add(sn, t0 + 2 * beat, 0.7)
            for s in range(16):
                drums.add(hc, t0 + s * beat / 4, 0.16 + 0.05 * (s % 4 == 0), pan=0.2)
            if b % 2 == 1:  # hat roll
                for r in range(6):
                    drums.add(hc, t0 + 3.5 * beat + r * beat / 12, 0.1 + r * 0.02, pan=0.2)

    # accents on scene cuts
    fx = Bus(n)
    for h in hits:
        if 0 < h < sec + tail:
            lead = min(bar, h)
            fx.add(riser(rng, lead), h - lead, 0.35)
            fx.add(crash(rng), h, 0.4)
            fx.add(kick(rng, 1.2, 0.8), h, 0.5)

    sc = sidechain_env(n, kicks, depth=0.5 if kit in ("four", "trap") else 0.25)[:, None]
    music_st = reverb(music.stereo(), 2.2 if kit in ("lofi", "tense") else 1.6, wet=0.28) * sc
    low_st = low.stereo() * sc
    drum_st = reverb(drums.stereo(), 0.9, wet=0.08)
    fx_st = reverb(fx.stereo(), 2.0, wet=0.3)
    if kit == "lofi":  # vinyl hiss + soft crackle
        hiss = lp(rng.standard_normal(n), 5000) * 0.006
        crackle = (rng.random(n) > 0.9997) * rng.standard_normal(n) * 0.25
        music_st += np.stack([hiss + crackle, hiss + np.roll(crackle, 97)], axis=1)
    mix = music_st + low_st + drum_st + fx_st
    # end: fade over the tail
    fade = int(tail * SR)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)  # gentle glue
    peak = np.abs(mix).max() or 1
    g = 10 ** (-1 / 20) / peak
    out = {"mix": mix * g}
    if stems:
        out |= {"drums": drum_st * g, "music": music_st * g, "bass": low_st * g, "fx": fx_st * g}
    return out, {"bpm": bpm, "beat": beat, "bars": bars, "kicks": len(kicks)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mood", default="uplift", choices=list(MOODS))
    ap.add_argument("--sec", type=float, default=30)
    ap.add_argument("--bpm", type=float, default=None)
    ap.add_argument("--key", default="C", choices=list(NOTES))
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--hits", default="", help="comma-separated seconds for risers + impacts (scene cuts)")
    ap.add_argument("--stems", action="store_true", help="also write <out>.drums.wav, .music.wav, .bass.wav, .fx.wav")
    ap.add_argument("-o", "--out", required=True)
    a = ap.parse_args()
    hits = [float(x) for x in a.hits.split(",") if x.strip()]
    out, info = render(a.sec, a.bpm, a.key, a.mood, a.seed, hits, a.stems)
    p = pathlib.Path(a.out)
    p.parent.mkdir(parents=True, exist_ok=True)
    sf.write(p, out["mix"].astype(np.float32), SR, subtype="PCM_24")
    for k, v in out.items():
        if k != "mix":
            sf.write(p.with_suffix(f".{k}.wav"), v.astype(np.float32), SR, subtype="PCM_24")
    cred = p.parent / "credits.json"
    items = json.loads(cred.read_text(encoding="utf-8")) if cred.exists() else []
    items = [i for i in items if i.get("file") != p.name]
    items.append({"file": p.name, "role": "music", "title": f"generated {a.mood} bed", "author": "musicgen.py", "license": "generated",
                  "attribution": "", "params": {"mood": a.mood, "bpm": info["bpm"], "key": a.key, "seed": a.seed, "hits": hits}})
    cred.write_text(json.dumps(items, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"file": str(p), "sec": a.sec, **info}))


if __name__ == "__main__":
    main()
