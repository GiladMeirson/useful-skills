# Real images and video: free archives, no mandatory credit

Motion design about the real world calls for real material. `scripts/stock.py` searches photos and video in freely licensed archives, checks each file's license in the API response and records the evidence in `credits.json`. Image treatment (duotone, cutout, parallax, Ken Burns, text pinned to the scene, grading) is in `design.md`, section 6.

```bash
uv run <skill>/scripts/stock.py commons --q "clouds timelapse" --type video --list
uv run <skill>/scripts/stock.py commons --q "clouds timelapse" --type video --pick 3 -o public/stock/nuvens.mp4
uv run <skill>/scripts/stock.py nasa --q "earth from orbit" --type video -o public/stock/terra.mp4
uv run <skill>/scripts/stock.py openverse --q "mountain lake" --orientation tall -o public/stock/lago.jpg
uv run <skill>/scripts/stock.py met --q "sunflowers" -o public/stock/girassois.jpg
```

Always list first (`--list`), choose by title, size and dimensions, download and LOOK at the file before using it.

## Sources

| Source | Has | Key | What the script accepts | Credit | Limit |
|---|---|---|---|---|---|
| `commons` (Wikimedia Commons) | photo and video | no | only files with `License` cc0 or pd, `AttributionRequired` false and no `Restrictions` | not required | literal search, lots of documentary and government footage; video in webm or ogv, converted to h264; the site warns it doesn't guarantee status |
| `nasa` (NASA Image and Video Library) | photo and video | no | everything in the archive | NASA asks, doesn't require | space and science topics; NASA logo and insignia are not free; astronauts and current employees can't appear in commercial promotion; don't imply endorsement |
| `openverse` | photo only | no | `license=cc0,pdm` | not required | the license is declared by the uploader and Openverse doesn't verify it; 20 requests per minute and 200 per day without registration |
| `met` (The Met Open Access) | artwork photo | no | only objects with `isPublicDomain` true | not required | artwork only; two calls per image |
| `pixabay` | photo and video | free, `PIXABAY_API_KEY` in `.env` | everything (Pixabay Content License) | not required | forbids bulk download and redistribution of the standalone file; no guarantee about people and brands |

Sources left out, with the reason checked on 2026-10-13: Pexels (the API page says new key issuance is paused), Unsplash (the API rules require hotlinking and attribution), Mixkit (the terms forbid scripts), Coverr (requires a key and the URL expires in 15 minutes), Videvo (redirects to Freepik), Prelinger on the Internet Archive (only part is public domain and its own FAQ warns about it).

## What a free license doesn't cover

CC0 and public domain settle copyright and nothing else. These still require permission:

- **Recognizable person.** None of these sources provides a model release. In commercial work, don't use a recognizable face.
- **Brand and logo** visible in the frame.
- **Recent artwork, protected architecture, product screen** in the background.

The script detects none of this. Look at the file, and when in doubt choose another. State in the delivery where each image came from; `credits.json` has the source, URL, license and the fields read from the API, even when credit isn't required.

## Limits

- The license tag comes from the archive. The script checks what the API declares, not what is true.
- Audio from downloaded video is stripped in conversion: the embedded track may have another owner.
- US government material dominates Commons video. For local or urban topics outside the US, searches yield little.
- `pixabay` was written from the official documentation and has not been run: there was no key on this machine.
