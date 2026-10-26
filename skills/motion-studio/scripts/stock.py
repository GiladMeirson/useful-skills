#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["requests"]
# ///
"""Real, free images and video with no mandatory credit, license checked file by file.

  uv run scripts/stock.py commons --q "ocean waves" --type video --list            # only lists the candidates
  uv run scripts/stock.py commons --q "ocean waves" --type video --pick 0 -o public/stock/mar.mp4
  uv run scripts/stock.py nasa --q "earth from orbit" --type video -o public/stock/terra.mp4
  uv run scripts/stock.py openverse --q "mountain lake" --orientation tall -o public/stock/lago.jpg
  uv run scripts/stock.py met --q "sunflowers" -o public/stock/girassois.jpg
  uv run scripts/stock.py pixabay --q "city night" --type video -o public/stock/cidade.mp4   # PIXABAY_API_KEY in .env
Keyless sources: commons (Wikimedia Commons, only CC0 and public domain declared on the file), nasa (NASA library,
generally not copyrighted in the US; NASA requests credit but does not require it), openverse (photos only, license=cc0,pdm)
and met (Metropolitan public-domain works). With a free key: pixabay (photo and video, no attribution).
Every downloaded file goes into credits.json with source, license, URL and the evidence read from the API, even without mandatory credit.
A free license only settles copyright. Recognizable faces, brands and recent artworks still require
permission: the script does not detect this. Look at the file before using it. Details and limits in references/stock.md.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.parse

UA = {"User-Agent": "motion-design-skill/2.0 (agent; https://github.com/dev-isaacmello/extreme-motion-design)"}
VIDEO_EXT = (".mp4", ".webm", ".ogv", ".mov")


def get(url, **kw):
    import requests

    r = requests.get(url, headers=UA, timeout=kw.pop("timeout", 60), **kw)
    if r.status_code == 429:
        sys.exit(f"{urllib.parse.urlparse(url).netloc} asked to wait (429): try again in a few minutes")
    r.raise_for_status()
    return r


def load_env():
    env = pathlib.Path(".env")
    if env.is_file():
        for line in env.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip().removeprefix("export ").strip(), v.strip().strip("'\""))


def commons(a):
    kind = "filetype:video" if a.type == "video" else "filetype:bitmap"
    out = []
    # P275=Q6938433 is "license: CC0"; P6216=Q19652 is "status: public domain". haslicense:cc0 returns nothing.
    for stmt in ("haswbstatement:P275=Q6938433", "haswbstatement:P6216=Q19652"):
        params = {"action": "query", "format": "json", "generator": "search", "gsrnamespace": 6, "gsrlimit": 20,
                  "gsrsearch": f"{kind} {stmt} {a.q}", "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata",
                  "iiextmetadatafilter": "License|LicenseShortName|LicenseUrl|AttributionRequired|Restrictions|Artist"}
        pages = get("https://commons.wikimedia.org/w/api.php", params=params).json().get("query", {}).get("pages", {})
        for p in sorted(pages.values(), key=lambda p: p.get("index", 0)):
            ii = p["imageinfo"][0]
            e = {k: v.get("value", "") for k, v in ii.get("extmetadata", {}).items()}
            ok = e.get("License", "").lower() in ("cc0", "pd") and e.get("AttributionRequired", "").lower() == "false" and not e.get("Restrictions")
            if not ok:
                continue  # only accept what the API itself marks as CC0 or public domain, with no attribution and no restrictions
            out.append({"id": p["title"], "title": p["title"].removeprefix("File:"), "url": ii["url"], "width": ii.get("width"), "height": ii.get("height"),
                        "bytes": ii.get("size"), "license": e.get("LicenseShortName") or e["License"], "license_url": e.get("LicenseUrl") or None,
                        "page": ii.get("descriptionurl"), "credit": "not required",
                        "evidence": {"License": e.get("License"), "AttributionRequired": e.get("AttributionRequired"), "Restrictions": e.get("Restrictions", "")}})
        time.sleep(3)  # in bursts the API returns non-JSON responses
    return out


def nasa(a):
    items = get("https://images-api.nasa.gov/search", params={"q": a.q, "media_type": "video" if a.type == "video" else "image", "page_size": 20}).json()["collection"]["items"]
    out = []
    for it in items:
        d = it["data"][0]
        out.append({"id": d["nasa_id"], "title": d.get("title", d["nasa_id"]), "url": None, "width": None, "height": None, "bytes": None,
                    "license": "NASA, generally not copyrighted in the US", "license_url": "https://www.nasa.gov/nasa-brand-center/images-and-media/",
                    "page": f"https://images.nasa.gov/details/{d['nasa_id']}", "credit": "requested by NASA, not required",
                    "evidence": {"center": d.get("center"), "date_created": d.get("date_created"), "secondary_creator": d.get("secondary_creator", "")}})
    return out


def nasa_resolve(c, a):
    files = [i["href"] for i in get(f"https://images-api.nasa.gov/asset/{urllib.parse.quote(c['id'])}").json()["collection"]["items"]]
    want = ["~large.mp4", "~orig.mp4", "~medium.mp4"] if a.type == "video" else ["~large.jpg", "~orig.jpg", "~medium.jpg"]
    for w in want:
        hit = next((f for f in files if f.endswith(w)), None)
        if hit:
            p = urllib.parse.urlsplit(hit.replace("http://", "https://"))
            return urllib.parse.urlunsplit(p._replace(path=urllib.parse.quote(p.path)))  # the path contains spaces
    sys.exit(f"{c['id']}: no {a.type} file found in the asset list")


def openverse(a):
    if a.type == "video":
        sys.exit("Openverse has no video: use commons, nasa or pixabay")
    params = {"q": a.q, "license": "cc0,pdm", "page_size": 20}
    if a.orientation:
        params["aspect_ratio"] = a.orientation
    res = get("https://api.openverse.org/v1/images/", params=params).json().get("results", [])
    return [{"id": r["id"], "title": r.get("title") or r["id"], "url": r["url"], "width": r.get("width"), "height": r.get("height"), "bytes": r.get("filesize"),
             "license": f"{r['license']} {r.get('license_version') or ''}".strip(), "license_url": r.get("license_url"), "page": r.get("foreign_landing_url"),
             "credit": "not required", "evidence": {"license": r["license"], "source": r.get("source"), "creator": r.get("creator")},
             "notice": "license declared by the publisher and not verified by Openverse"} for r in res if r.get("license") in ("cc0", "pdm")]


def met(a):
    if a.type == "video":
        sys.exit("The Met only has artwork images")
    ids = get("https://collectionapi.metmuseum.org/public/collection/v1.1/search", params={"hasImages": "true", "q": a.q}).json().get("objectIDs") or []
    out = []
    for oid in ids[:24]:
        o = get(f"https://collectionapi.metmuseum.org/public/collection/v1/objects/{oid}").json()
        if o.get("isPublicDomain") and o.get("primaryImage"):  # the search filter is ignored: the object field is what counts
            out.append({"id": str(oid), "title": f"{o.get('title')} ({o.get('artistDisplayName') or 'unknown artist'}, {o.get('objectDate')})", "url": o["primaryImage"],
                        "width": None, "height": None, "bytes": None, "license": "CC0 (The Met Open Access)", "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
                        "page": o.get("objectURL"), "credit": "not required", "evidence": {"isPublicDomain": True}})
        if len(out) >= 8:
            break
    return out


def pixabay(a):
    key = os.environ.get("PIXABAY_API_KEY") or sys.exit("PIXABAY_API_KEY is not in the environment or .env (free key at pixabay.com/api/docs)")
    video = a.type == "video"
    params = {"key": key, "q": a.q, "per_page": 20, "safesearch": "true"}
    if a.orientation and not video:
        params["orientation"] = {"tall": "vertical", "wide": "horizontal"}.get(a.orientation, "all")
    hits = get("https://pixabay.com/api/videos/" if video else "https://pixabay.com/api/", params=params).json().get("hits", [])
    out = []
    for h in hits:
        v = (h["videos"].get("large") or h["videos"]["medium"]) if video else None
        if video and not v.get("url"):
            v = h["videos"]["medium"]
        out.append({"id": str(h["id"]), "title": h.get("tags", str(h["id"])), "url": v["url"] if video else h["largeImageURL"], "width": (v or h).get("width") or h.get("imageWidth"),
                    "height": (v or h).get("height") or h.get("imageHeight"), "bytes": (v or {}).get("size"), "license": "Pixabay Content License",
                    "license_url": "https://pixabay.com/service/license-summary/", "page": h.get("pageURL"), "credit": "not required", "evidence": {"user": h.get("user")}})
    return out


SOURCES = {"commons": commons, "nasa": nasa, "openverse": openverse, "met": met, "pixabay": pixabay}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", choices=list(SOURCES))
    ap.add_argument("--q", required=True, help="search query; English yields more results")
    ap.add_argument("--type", default="photo", choices=["photo", "video"])
    ap.add_argument("--orientation", default=None, choices=["tall", "wide", "square"])
    ap.add_argument("--list", action="store_true", help="list candidates without downloading")
    ap.add_argument("--pick", type=int, default=0)
    ap.add_argument("--max-mb", type=float, default=120, help="reject files larger than this")
    ap.add_argument("-o", "--out", default=None)
    a = ap.parse_args()
    load_env()
    cands = SOURCES[a.source](a)
    if a.orientation and a.source in ("commons",):
        fit = {"tall": lambda c: c["height"] > c["width"], "wide": lambda c: c["width"] > c["height"], "square": lambda c: abs(c["width"] - c["height"]) < 0.1 * c["width"]}[a.orientation]
        cands = [c for c in cands if c["width"] and c["height"] and fit(c)]
    if not cands:
        sys.exit("nothing found with a free license: change the query or source")
    if a.list or not a.out:
        for i, c in enumerate(cands):
            size = f"{c['width']}x{c['height']}" if c["width"] else "?"
            mb = f"{c['bytes'] / 1e6:.0f} MB" if c["bytes"] else "?"
            print(f"{i:2d}  {size:>10s} {mb:>7s}  {c['license'][:28]:28s}  {c['title'][:70]}")
        print(json.dumps({"source": a.source, "candidates": len(cands), "next": "rerun with --pick N -o public/stock/<name>"}, ensure_ascii=False))
        return
    c = cands[a.pick % len(cands)]
    url = c["url"] or nasa_resolve(c, a)
    out = pathlib.Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    raw = out.with_suffix(out.suffix + ".part")
    with get(url, stream=True, timeout=600) as r:
        total = int(r.headers.get("content-length") or 0)
        if total > a.max_mb * 1e6:
            sys.exit(f"the file is {total / 1e6:.0f} MB, above --max-mb {a.max_mb:.0f}: pick another with --pick or raise the cap")
        with open(raw, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    src_ext = pathlib.Path(urllib.parse.urlsplit(url).path).suffix.lower()
    note = "unmodified"
    if src_ext in VIDEO_EXT and (src_ext != out.suffix.lower() or src_ext != ".mp4"):
        # Commons serves webm and ogv: Remotion reads h264 better. No audio, since the embedded track may have another owner.
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-an", "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", str(out)], check=True)
        raw.unlink()
        note = "converted to h264 with the audio track removed"
    else:
        raw.rename(out)
    path = out.parent / "credits.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    entry = {"file": out.name, "checked_at": dt.datetime.now().isoformat(timespec="seconds"), "role": a.type, "title": c["title"], "source": a.source, "url": c["page"],
             "file_url": url, "license": c["license"], "license_url": c["license_url"], "credit": c["credit"], "attribution": None, "evidence": c["evidence"], "modifications": note}
    if c.get("notice"):
        entry["notice"] = c["notice"]
    path.write_text(json.dumps([d for d in data if d.get("file") != out.name] + [entry], ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({"file": str(out), "title": c["title"], "license": c["license"], "credit": c["credit"], "credits": str(path)}, ensure_ascii=False))
    print("look at the file before using it: recognizable faces, brands and recent works are not covered by the license", file=sys.stderr)


if __name__ == "__main__":
    main()
