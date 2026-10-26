# Template map (`assets/template/`)

```
package.json, tsconfig.json, remotion.config.ts   the config already sets colorSpace bt709
gitignore                         becomes .gitignore in the copy: ignores node_modules, out and .env
roteiro.json                      source of timing: scenes, lines, marks and SFX (scripts/score.py reads it; references/score.md)
direction.json                    direction contract: concept, visual law, motif, layout and entrance of each scene
public/brand.json                 brand: colors, fonts and logo (scripts/brand.py writes; theme.ts reads)
public/timeline.json              score written by score.py: fps, size, duration, scenes, narration, music, sfx, loudness
public/cues.json                  named marks, phrases, words and beats, in absolute time
public/audio/                     narration, music, mix and credits.json
src/index.ts, src/Root.tsx        registers the compositions from the score; the `format` prop switches the size
src/theme.ts                      C (brand colors), FONT, MONO, type (type scale), LANG, DIR, IS_RTL, textCase(), tracking()
src/fonts.ts                      bundled fonts (@fontsource, offline). Regenerate with scripts/genfonts.py after npm i @fontsource/<x>
src/lib/score.tsx                 <Scene id>, useScene(id) with at('mark'), WORDS, BEATS, cue()
src/lib/format.ts                 useFormat(): u (scale), text and action (safe areas), pick({youtube, reels, square})
src/lib/motion.ts                 tokens: ease, easeX, springs, dur; tween, keys, pop, stagger, stepped, loopPhase, loopNoise, wiggle, jitter;
                                  advanced: anticipate, lag, cascade, squash, velocity, smear, timeRemap, pingPong, ticker
src/lib/shapes.ts                 circlePath, starPath, blobPath, roundedRectPath
src/lib/rig.ts                    twoBoneIK, fabrik, forwardKinematics, visemeFor
src/blocks/                       ready-made blocks (charts, counter, device frame, caption, code, cursor...): references/blocks.md
src/components/Camera.tsx         Camera and Layer (zoom, pan, rotation, depth parallax)
src/components/KineticWords.tsx   kinetic typography synced to narration; groupPhrases
src/components/Morph.tsx          morphPath (flubber)
src/components/Fx.tsx             BoilFilter (cel), Grain (grain and vignette), Echo (trails), IrisReveal, MaskReveal, Shine, GooeyFilter
src/components/Tracking.tsx       Tracked, CornerPin, cornerPinMatrix
src/components/SpokenLine.tsx     SpokenLine: a scene's narration revealed word by word on the voice, accent on the spoken word, RTL-aware
src/components/Footage.tsx        JumpCut: plays the user's footage from scripts/footage.py edl.json (silences cut, punch-ins)
src/components/Probe.tsx          layout probe: measures the text of each still for layout.py. Stays at the end of the composition
src/scenes/Showcase.tsx           full example (9:16 reel, direction 'primitive system'): 6 scenes anchored to narration, word-by-word reveal,
                                  morph, struck-out timeline, typing code card, bar waveform, iris + captions, logo assemble
src/scenes/BlocksDemo.tsx         "Blocks" composition: all blocks in sequence, to see before using
```

## How to start a new video

Use `python <skill>/scripts/new_project.py <folder> --lang he|en --format reels|youtube|square --voice edge|kokoro|elevenlabs|none`. It does steps 1-2 below, replaces `src/scenes/Showcase.tsx` with a minimal starter (keeps the worked example in `reference/Showcase.example.tsx`), clears the example audio/score, and writes `PROGRESS.md`. Manual equivalent:

1. Copy the folder, rename `gitignore` to `.gitignore` and run `npm install`. The file ships without the dot because some install channels drop hidden files.
2. Replace `public/brand.json` with the brand's (`scripts/brand.py`, or `<skill>/assets/my-style.json`). Set `fonts.display` to a family in `src/fonts.ts` and `lang` to `he` for Hebrew.
3. Write `direction.json` and `roteiro.json`, run `score.py` and then `lint.py`.
4. Create the scenes in `src/scenes/` with `<Scene id>` and `useScene(id)`, blocks from `src/blocks/` and the primitives. Use `Showcase.tsx` as a structural reference and delete what you don't use. Keep `<Probe />` at the end of the composition.
5. Format: `"format": "reels"` in the script. To deliver more than one, write sizes with `u` and positions with `pick()` from `useFormat()` and render with `render.cjs --formats`.
6. `npx remotion studio` opens the interactive preview when there's a screen; in an agent without a screen, use `stills.cjs` and the contact sheet.
