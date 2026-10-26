#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "soundfile", "requests"]
# ///
"""Script -> voice, score and cues. One file (roteiro.json) decides the timing of everything.

  uv run scripts/score.py --dry            # shows what would be generated and how many paid characters, without spending
  uv run scripts/score.py --yes            # generates only changed phrases and writes the score and cues
  uv run scripts/score.py                  # no paid voice pending: rebuilds score and cues (pauses, cuts, SFX)
Run in the video folder. Reads roteiro.json and writes:
  public/audio/narration.wav + narration.words.json   voice assembled phrase by phrase, absolute video times
  public/timeline.json                                score: scenes, music, SFX, loudness
  public/cues.json                                    named cues, phrases, words and beats for the scenes
Each phrase is generated once and cached in public/audio/seg by a hash of the text and voice: changing pauses,
cuts or SFX costs no credits, and changing one phrase regenerates only that one. Script format in references/score.md.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import unicodedata

import numpy as np
import soundfile as sf

SKILL = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(SKILL))
SR = 48000
FORMATS = {"youtube": (1920, 1080), "linkedin": (1920, 1080), "reels": (1080, 1920), "tiktok": (1080, 1920), "square": (1080, 1080)}
CUE = re.compile(r"^(word|phrase|beat|t|cue|scene)(?::([^#+]+?))?(?:#(\d+))?(\.end)?([+-]\d*\.?\d+)?$")


def die(msg):
    sys.exit(f"script: {msg}")


def norm(w: str) -> str:
    w = unicodedata.normalize("NFKD", w.lower())
    return re.sub(r"[^a-z0-9\u05D0-\u05EA]", "", "".join(c for c in w if not unicodedata.combining(c)))


def tokens(text: str) -> list[str]:
    return [w for w in text.split() if re.search(r"\w", w)]


def load_env():
    for env in (pathlib.Path(".env"), pathlib.Path.home() / ".config" / "motion-studio" / ".env"):
        if env.is_file():
            for line in env.read_text(encoding="utf-8").splitlines():
                if "=" in line and not line.lstrip().startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip().removeprefix("export ").strip(), v.strip().strip("'\""))


# ---------- voice, phrase by phrase ----------
def phrase_key(ph: dict, voice: dict) -> str:
    blob = json.dumps([ph["text"], ph.get("speak"), {k: voice.get(k) for k in ("provider", "voice", "model", "settings", "style", "speed", "lang")}, ph.get("seed", voice.get("seed", 7))], sort_keys=True, ensure_ascii=False)
    return hashlib.sha1(blob.encode()).hexdigest()[:12]


def strip_tags(al: dict) -> dict:
    """Strips bracketed tags ([excited]) from the alignment; v3 models interpret them but do not speak them."""
    out, inside, skipped = {k: [] for k in al}, False, False
    for n, ch in enumerate(al["characters"]):
        if ch == "[":
            inside = True
        if not inside and not (skipped and ch.isspace()):
            for k in al:
                out[k].append(al[k][n])
        skipped = inside or (skipped and ch.isspace())
        if ch == "]":
            inside = False
    return out


def chars_to_words(al: dict) -> list[dict]:
    words, cur = [], None
    for ch, s, e in zip(al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]):
        if ch.isspace():
            cur = None
            continue
        if cur is None:
            cur = {"word": "", "start": s, "end": e}
            words.append(cur)
        cur["word"] += ch
        cur["end"] = e
    return [w for w in words if re.search(r"\w", w["word"])]


def gen_elevenlabs(ph, prev, nxt, voice, attempt):
    import eleven
    import tts as ttslib

    lang = voice.get("lang", "en")
    model = voice.get("model") or eleven.default_model(lang)
    v3 = model.startswith(("eleven_v3", "eleven_v4"))  # v3/v4: no neighbor context, may keep sounding after the text
    text = (voice.get("style", "") + " " + ph.get("speak", ph["text"])).strip()
    try:
        pcm, al, cost = eleven.tts(text, voice["voice"], lang=lang, model=model, settings=voice.get("settings"),
                                   speed=voice.get("speed"), seed=ph.get("seed", voice.get("seed", 7)) + attempt,
                                   previous_text=prev, next_text=None if ph.get("closed") else nxt, sr=SR)
    except eleven.ElevenError as e:
        die(str(e))
    if al:
        al = strip_tags(al)
        end = al["character_end_times_seconds"][-1]
        if v3 and len(pcm) / SR - end > 0.12:  # cut the tail after the text with a fade
            pcm = pcm[: int((end + 0.12) * SR)].copy()
            n = int(0.05 * SR)
            pcm[-n:] *= np.linspace(1, 0, n) ** 2
        words = chars_to_words(al)
    else:  # model returned no timestamps: estimate from pauses (run align.py on the mix for exact ones)
        words = ttslib.approx_words_audio(ph.get("speak", ph["text"]), pcm, SR)
    loud = np.flatnonzero(np.abs(pcm) > 10 ** (-38 / 20))
    ts = [w["start"] for w in words]
    hole = max((b - a for a, b in zip(ts, ts[1:])), default=0)
    said = [norm(w["word"]) for w in words] == [norm(t) for t in tokens(ph.get("speak", ph["text"]))]
    clean = len(loud) > 0 and loud[0] / SR < 0.2 and (v3 or (len(pcm) - loud[-1]) / SR >= 0.15)
    why = None if (said and clean and hole < float(voice.get("max_gap", 0.8))) else f"spoken={said} clean_edges={clean} gap={hole:.2f}s"
    return pcm, words, cost, why


def gen_local(ph, voice, tmp: pathlib.Path, prov: str):
    txt = tmp.with_suffix(".txt")
    txt.write_text(ph.get("speak", ph["text"]), encoding="utf-8")
    cmd = ["uv", "run", "-q", str(SKILL / "tts.py"), str(txt), "-o", str(tmp), "--lang", voice.get("lang", "en"), "--provider", prov, "--no-align"]
    if voice.get("speed"):
        cmd += ["--speed", str(voice["speed"])]
    if voice.get("voice"):
        cmd += ["--voice", voice["voice"]]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        die(f"tts.py failed: {r.stderr[-400:]}")
    pcm, sr = sf.read(tmp.with_suffix(".wav"), dtype="float32")
    if sr != SR:
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(tmp.with_suffix(".wav")), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
        pcm = np.frombuffer(raw, dtype="<f4").copy()
    words = json.loads(pathlib.Path(str(tmp) + ".words.json").read_text(encoding="utf-8"))["words"]
    for f in (txt, tmp.with_suffix(".wav"), pathlib.Path(str(tmp) + ".words.json")):
        f.unlink(missing_ok=True)
    return pcm, [{"word": w["word"], "start": w["start"], "end": w["end"], **({"ph": w["ph"]} if "ph" in w else {})} for w in words]


def voice_phrases(R: dict, pub: pathlib.Path, dry: bool, yes: bool) -> list[dict]:
    """Returns the phrases with trimmed audio and words relative to the clip start."""
    voice = R.get("voice") or {"provider": "none"}
    prov = voice.get("provider", "none")
    flat = [(s, p) for s in R["scenes"] for p in s.get("say", [])]
    if prov in ("none", "file") or not flat:
        return []
    seg = pub / "audio" / "seg"
    seg.mkdir(parents=True, exist_ok=True)
    todo = [p for _, p in flat if not (seg / f"{phrase_key(p, voice)}.wav").exists()]
    chars = sum(len((voice.get("style", "") + " " + p.get("speak", p["text"])).strip()) for p in todo)
    paid = prov == "elevenlabs"
    report = {"provider": prov, "phrases": len(flat), "to_generate": len(todo), "characters": chars if paid else 0}
    if paid:
        import eleven

        report["model"] = voice.get("model") or eleven.default_model(voice.get("lang", "en"))
        try:
            eleven.check_model(report["model"], voice.get("lang", "en"))
            report["credits_left"] = eleven.subscription()["credits_left"]
        except eleven.ElevenError as e:
            if "speak Hebrew" in str(e):
                die(str(e))
            report["credits_left"] = f"unknown ({str(e)[:80]})"
    if dry or (paid and todo and not yes):
        print(json.dumps(report, ensure_ascii=False))
        if not dry:
            die(f"{len(todo)} new phrases cost about {chars} ElevenLabs characters: tell the user the number and rerun with --yes")
        sys.exit(0)
    spent, redone = 0, []
    texts = [p.get("speak", p["text"]) for _, p in flat]
    out = []
    for i, (_, p) in enumerate(flat):
        key = phrase_key(p, voice)
        wav, meta = seg / f"{key}.wav", seg / f"{key}.json"
        if not wav.exists():
            if prov == "elevenlabs":
                for attempt in range(4):
                    pcm, words, cost, why = gen_elevenlabs(p, " ".join(texts[max(0, i - 2):i]), texts[i + 1] if i + 1 < len(texts) else None, voice, attempt)
                    spent += cost
                    if not why:
                        break
                    redone.append(i)
                    print(f"phrase {i} attempt {attempt}: {why}", file=sys.stderr)
                else:
                    die(f"phrase {i} ('{p['text'][:40]}'): four attempts and the audio still comes back clipped or different from the text")
            elif prov in ("kokoro", "edge"):
                pcm, words = gen_local(p, voice, seg / f"tmp_{key}", prov)
            else:
                die(f"provider '{prov}' is not generated here: generate the WAV, run align.py and use provider 'file'")
            sf.write(wav, pcm, SR)
            meta.write_text(json.dumps({"text": p["text"], "words": words}, ensure_ascii=False), encoding="utf-8")
        pcm, _ = sf.read(wav, dtype="float32")
        words = json.loads(meta.read_text(encoding="utf-8"))["words"]
        # Trim only edge silence, with margin and fade: no speech is cut.
        loud = np.flatnonzero(np.abs(pcm) > 10 ** (-50 / 20))
        a, b = max(0, loud[0] - int(0.03 * SR)), min(len(pcm), loud[-1] + int(0.12 * SR))
        clip = pcm[a:b].copy()
        # Equal level across phrases: expressive delivery varies in volume from phrase to phrase.
        rms = float(np.sqrt(np.mean(clip**2)))
        clip *= min(10 ** (-23 / 20) / max(rms, 1e-6), 10 ** (-1 / 20) / max(float(np.abs(clip).max()), 1e-6))
        n = int(0.012 * SR)
        clip[:n] *= np.linspace(0, 1, n)
        clip[-n:] *= np.linspace(1, 0, n)
        shown = tokens(p["text"])
        if len(shown) == len(words):  # "speak" teaches pronunciation; on screen the spelling of "text" applies
            for w, t in zip(words, shown):
                w["word"] = t
        else:
            print(f"warning: phrase {i} has {len(shown)} words on screen and {len(words)} spoken: timings follow the speech", file=sys.stderr)
        out.append({"clip": clip, "words": [{**w, "start": max(0.0, w["start"] - a / SR), "end": max(0.0, w["end"] - a / SR)} for w in words]})
    report |= {"characters_spent": spent, "phrases_redone": sorted(set(redone))}
    print(json.dumps(report, ensure_ascii=False), file=sys.stderr)
    return out


def file_phrases(R: dict, pub: pathlib.Path) -> tuple[list[dict], float]:
    """Existing voice (recorded, from another model or speech from footage): matches the phrases to words.json."""
    voice = R["voice"]
    wp = pub / voice.get("words", str(pathlib.Path(voice["file"]).with_suffix("")) + ".words.json")
    if not wp.exists():
        die(f"{wp} does not exist: run align.py on the voice file (with the script, or --transcribe to hear the speech)")
    words = json.loads(wp.read_text(encoding="utf-8"))["words"]
    off, k, out = float(voice.get("start", 0)), 0, []
    for s in R["scenes"]:
        for p in s.get("say", []):
            want = [norm(t) for t in tokens(p["text"])]
            got = words[k:k + len(want)]
            if [norm(w["word"]) for w in got] != want:
                die(f"phrase '{p['text'][:50]}' does not match the voice from word {k} ({' '.join(w['word'] for w in got)[:60]})")
            for w, t in zip(got, tokens(p["text"])):
                w["word"] = t
            out.append({"fixed": off + got[0]["start"], "len": got[-1]["end"] - got[0]["start"], "words": [{**w, "start": w["start"] - got[0]["start"], "end": w["end"] - got[0]["start"]} for w in got]})
            k += len(want)
    return out, off


# ---------- score ----------
def build(R: dict, phrases: list[dict], beats: list[float], provider: str):
    fps = int(R.get("fps", 30))
    q = lambda t: round(round(t * fps) / fps, 4)  # noqa: E731  visual event and SFX land on the same frame
    cut = R.get("cut", {})
    lead, on_beat = float(cut.get("lead", 0.2)), cut.get("on", "phrase") == "beat"
    if on_beat and not beats:
        die("cut.on is 'beat' but there are no beats: run beats.py on the music (writes <track>.beats.json)")
    beat_dur = float(np.median(np.diff(beats))) if len(beats) > 1 else 0.5
    last_beat = lambda t: max([b for b in beats if b <= t + 1e-6], default=t)  # noqa: E731
    next_beat = lambda t: min([b for b in beats if b >= t - 1e-6], default=t)  # noqa: E731

    voice_end = float(R.get("start", 0.3)) - 0.35  # the first phrase starts at "start"
    floor, k, scenes, plist, words = 0.0, 0, [], [], []
    for si, s in enumerate(R["scenes"]):
        say = s.get("say", [])
        sc = {"id": s["id"], "phrases": []}
        if say:
            for j, p in enumerate(say):
                ph = phrases[k]
                k += 1
                length = ph.get("len", len(ph.get("clip", [])) / SR)
                if "fixed" in ph:
                    t = ph["fixed"]
                elif p.get("at") is not None:
                    t = float(p["at"])
                    if t < voice_end + 0.15:
                        die(f"scene {s['id']}: phrase '{p['text'][:40]}' asks for at={t} but the previous one ends at {voice_end:.2f} s")
                else:
                    t = voice_end + float(p.get("pause", 0.35))
                    if j == 0:
                        t = max(t, floor + lead)
                if "fixed" not in ph and j == 0 and si > 0 and on_beat:
                    t = next_beat(t - lead) + lead  # the cut lands on the beat and the phrase enters `lead` later
                item = {"scene": s["id"], "i": j, "start": round(t, 3), "end": round(t + length, 3), "text": p["text"], "from": len(words)}
                words += [{**w, "start": round(t + w["start"], 3), "end": round(t + w["end"], 3)} for w in ph["words"]]
                item["to"] = len(words) - 1
                ph["t"] = t
                sc["phrases"].append(item)
                plist.append(item)
                voice_end = t + length
            first = sc["phrases"][0]["start"]
            sc["start"] = 0.0 if si == 0 else q(last_beat(first - lead) if on_beat else first - lead)
            if si and "fixed" in phrases[k - 1]:
                sc["start"] = max(sc["start"], q(floor))  # continuous recorded speech: the cut sits between the two phrases
            if si and sc["start"] < floor - 1.5 / fps:
                die(f"scene {s['id']}: speech starts at {first:.2f} s, before the previous scene ends ({floor:.2f} s)")
            if "fixed" in phrases[k - 1] and "hold" not in s:
                # The aligner stretches the last word's end up to the next speech: only the first 60% counts as speech.
                floor = words[-1]["start"] + 0.6 * (words[-1]["end"] - words[-1]["start"])
            else:
                floor = voice_end + float(s.get("hold", 0.3))
            sc["min_end"] = floor
        else:
            sc["start"] = 0.0 if si == 0 else q(floor)
            if "beats" in s:
                b0 = next_beat(sc["start"])
                idx = beats.index(b0) + int(s["beats"]) if b0 in beats else None
                end = beats[idx] if idx is not None and idx < len(beats) else sc["start"] + int(s["beats"]) * beat_dur
            elif "dur" in s:
                end = sc["start"] + float(s["dur"])
            else:
                die(f"scene {s['id']} has no speech: give 'dur' in seconds or 'beats'")
            floor = sc["min_end"] = q(end)
        scenes.append(sc)
    for a, b in zip(scenes, scenes[1:]):
        if not R["scenes"][scenes.index(b)].get("say"):
            b["start"] = q(a["min_end"])
        a["end"] = b["start"]
    total = q(max(float(R.get("duration") or 0), scenes[-1]["min_end"] + (float(R.get("tail", 1.2)) if R["scenes"][-1].get("say") else 0)))
    scenes[-1]["end"] = total

    def resolve(expr, sc, ev):
        if isinstance(expr, (int, float)):
            return sc["start"] + float(expr)
        m = CUE.match(str(expr).strip())
        if not m:
            die(f"scene {sc['id']}: cue '{expr}' is not valid (word:, phrase:, beat:, scene, t:, cue:)")
        kind, arg, nth, end, off = m.group(1), m.group(2), int(m.group(3) or 1), bool(m.group(4)), float(m.group(5) or 0)
        if kind == "scene":
            t = sc["end"] if end else sc["start"]
        elif kind == "t":
            t = float(arg)
        elif kind == "cue":
            if arg not in ev:
                die(f"scene {sc['id']}: cue '{expr}' uses '{arg}', which is not defined yet")
            t = ev[arg]
        elif kind == "phrase":
            if not 1 <= int(arg) <= len(sc["phrases"]):
                die(f"scene {sc['id']}: '{expr}' asks for phrase {arg} and the scene has {len(sc['phrases'])}")
            p = sc["phrases"][int(arg) - 1]
            t = p["end"] if end else p["start"]
        elif kind == "beat":
            after = [b for b in beats if b >= sc["start"] - 1e-6]
            if int(arg) > len(after):
                die(f"scene {sc['id']}: '{expr}' asks for beat {arg} and there are only {len(after)} after the scene start")
            t = after[int(arg) - 1]
        else:
            mine = [w for p in sc["phrases"] for w in words[p["from"]:p["to"] + 1]]
            hits = [w for w in mine if norm(w["word"]) == norm(arg)]
            if len(hits) < nth:
                die(f"scene {sc['id']}: '{expr}' did not find the word (occurrence {nth}). Scene words: {' '.join(w['word'] for w in mine)}")
            t = hits[nth - 1]["end"] if end else hits[nth - 1]["start"]
        return t + off

    ev, sfx = {}, []
    csfx = cut.get("sfx", {"type": "whoosh", "gain_db": -18, "dur": 0.5, "lead": 0.25})
    for s, sc in zip(R["scenes"], scenes):
        for name, expr in (s.get("cues") or {}).items():
            if name in ev:
                die(f"cue '{name}' defined in two scenes: names are global")
            ev[name] = q(resolve(expr, sc, ev))
            if not sc["start"] - 0.5 <= ev[name] <= sc["end"] + 0.5:
                print(f"warning: cue '{name}' lands at {ev[name]:.2f} s, outside scene {sc['id']} ({sc['start']:.2f} to {sc['end']:.2f} s)", file=sys.stderr)
        if sc is not scenes[0] and csfx and s.get("cut_sfx", True):
            sfx.append({"at": round(max(0, sc["start"] - csfx.get("lead", 0.25)), 3), **{k: v for k, v in csfx.items() if k != "lead"}})
        for e in s.get("sfx") or []:
            at = ev[e["at"]] if e["at"] in ev else q(resolve(e["at"], sc, ev))
            sfx.append({**e, "at": round(at, 3)})
    return fps, scenes, plist, words, ev, sorted(sfx, key=lambda e: e["at"]), total


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("roteiro", nargs="?", default="roteiro.json")
    ap.add_argument("--dry", action="store_true", help="only report what would be generated and the cost")
    ap.add_argument("--yes", action="store_true", help="authorize spending the characters reported by --dry")
    a = ap.parse_args()
    rp = pathlib.Path(a.roteiro)
    if not rp.exists():
        die(f"{rp} does not exist: copy roteiro.json from the template and edit it")
    R = json.loads(rp.read_text(encoding="utf-8"))
    os.chdir(rp.resolve().parent)
    load_env()
    pub = pathlib.Path("public")
    ids = [s["id"] for s in R["scenes"]]
    if len(set(ids)) != len(ids):
        die("there are scenes with the same id")
    voice = R.get("voice") or {"provider": "none"}
    prov = voice.get("provider", "none")
    if prov == "none" and any(s.get("say") for s in R["scenes"]):
        die("there are phrases in 'say' and voice.provider is 'none': choose a voice or remove the phrases")

    music = dict(R.get("music") or {})
    if music.get("eleven") and not music.get("file"):
        music["file"] = "audio/music.mp3"  # eleven_assets.py writes it
    beats = []
    if music.get("file"):
        bp = pub / (str(pathlib.Path(music["file"]).with_suffix("")) + ".beats.json")
        if bp.exists():
            off = float(music.get("start", 0)) - float(music.get("offset", 0))
            beats = [round(b + off, 3) for b in json.loads(bp.read_text(encoding="utf-8"))["beats"] if b + off >= 0]

    if prov == "file":
        phrases, _ = file_phrases(R, pub)
    else:
        phrases = voice_phrases(R, pub, a.dry, a.yes)
    fps, scenes, plist, words, ev, sfx, total = build(R, phrases, beats, prov)

    nar = None
    if prov == "file":
        nar = {"file": voice["file"], "start": float(voice.get("start", 0)), "gain_db": voice.get("gain_db", 0)}
    elif phrases:
        audio = np.zeros(int((total + 0.5) * SR), np.float32)
        for ph in phrases:
            i = int(round(ph["t"] * SR))
            audio[i:i + len(ph["clip"])] += ph["clip"][: max(0, len(audio) - i)]
        (pub / "audio").mkdir(parents=True, exist_ok=True)
        sf.write(pub / "audio" / "narration.wav", audio[: int(total * SR)], SR, subtype="PCM_16")
        spoken = sum(len(p["clip"]) for p in phrases) / SR
        meta = {"text": " ".join(p["text"] for p in plist), "provider": prov, "voice": voice.get("voice"), "model": voice.get("model"),
                "duration": round(total, 3), "wpm": round(len(words) / max(spoken, 0.1) * 60), "approx": False, "absolute": True, "words": words}
        (pub / "audio" / "narration.words.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        nar = {"file": "audio/narration.wav", "start": 0, "gain_db": voice.get("gain_db", 0)}

    if "format" in R and R["format"] not in FORMATS:
        die(f"format '{R['format']}' does not exist: use {', '.join(FORMATS)}")
    w, h = FORMATS[R["format"]] if "format" in R else (int(R.get("width", 1920)), int(R.get("height", 1080)))
    tl = {"fps": fps, "width": w, "height": h, "duration": total, "audio": R.get("audio", "audio/mix.wav")}
    if nar:
        tl["narration"] = nar
    if music.get("file"):
        tl["music"] = {"gain_db": -15, "duck_db": -9 if nar else 0, "fade_in": 0.3, "fade_out": 1.6, **music}
    tl["scenes"] = [{"id": s["id"], "start": s["start"], "end": s["end"]} for s in scenes]
    tl["sfx"] = sfx
    # AAC produces peaks up to 1.5 dB above the WAV when the voice was heavily amplified: the headroom lives in the mix.
    tl["loudness"] = R.get("loudness", {"lufs": -14, "tp": -3.0})
    if R.get("budget"):
        tl["budget"] = R["budget"]
    tl = {k: v for k, v in tl.items() if v is not None}
    (pub / "timeline.json").write_text(json.dumps(tl, ensure_ascii=False, indent=1), encoding="utf-8")
    cues = {"cuts": {s["id"]: s["start"] for s in scenes}, "ev": ev, "phrases": plist,
            "words": [{"word": x["word"], "start": x["start"], "end": x["end"], **({"ph": x["ph"]} if "ph" in x else {})} for x in words],
            "beats": [b for b in beats if b <= total]}
    (pub / "cues.json").write_text(json.dumps(cues, ensure_ascii=False, indent=1), encoding="utf-8")
    wps = [(s["id"], round(sum(p["to"] - p["from"] + 1 for p in s["phrases"]) / max(s["end"] - s["start"], 0.1), 1)) for s in scenes if s["phrases"]]
    print(json.dumps({"duration": total, "scenes": {s["id"]: [s["start"], s["end"]] for s in scenes}, "cues": len(ev), "sfx": len(sfx),
                      "words_per_second": dict(wps)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
