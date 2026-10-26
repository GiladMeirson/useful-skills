# Design: what separates a studio frame from the model's default frame

`doctrine.md` handles motion. This reference handles the still frame: composition, typography, color, texture, real imagery, film structure and sound. Read it before proposing directions (step 5 of the workflow) and choose among the six directions at the end, or derive one from the subject using the same sheet.

How to read: each rule cites its origin. `[source: URL]` was read at the source; `[practice consensus]` is current practice with no standard; `[my inference]` is the author's synthesis. Almost every numeric design threshold is practice or inference, not a standard: those in `design.py` come out as warnings. The launch-film numbers come from teardowns with no published method and from a vendor study (Advids): treat them as hypotheses. Nobody watched the cited films to write this; what there is about studios comes from text.

Where this reference and the doctrine disagree, this one wins: titles do not need weight 600 to 800 (T10) and the piece may have more than one accent, as long as each color has a role and a measured area (K2, K3).

## Contents

1. Composition (C1 to C12)
2. Typography (T1 to T14)
3. Color and texture (K1 to K10)
4. Studio language (table, E1 to E4)
5. 60 to 90 s launch film (L1 to L12)
6. Motion over real imagery (F1 to F9)
7. Sound (S1 to S9)
8. Trends and clichés of 2025 and 2026
9. Signs of generated design, with antidote
- The 15 rules that change the result most
- Six art directions

## The finding that prompted this reference

The frame the bare model delivers (giant condensed type on the left, two flat colors, mono counter in the corner) is exactly two of the five "default looks" that Anthropic's frontend-design skill lists: **"dark signal"** (near-black with one acid or vermilion accent) and **"template chrome"** (tracked uppercase label, mono in small labels, 01/02/03 markers, "A · B · C" strings, an arrow on every link), plus the "big number, small label, supporting stats" pattern. When purple and Inter are banned, the agent falls into this or into "cream + serif + terracotta". Banning does not solve it: the direction has to be derived from the subject and verified by measurement. [source: https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md and https://capitalandcompute.net/blog/fix-ai-slop-design/]

## Frame metrics (what `scripts/design.py` measures)

Used in the rules below. The definitions are ours. `design.py` currently measures those marked (measured); the others remain as criteria for reviewing the contact sheet.

- `ratio_top2` (measured): largest rendered font-size / second largest.
- `n_sizes` (measured): distinct font-sizes in the frame (4% tolerance).
- `empty_frac` (measured): fraction of pixels within ΔE_OK 0.02 of the dominant background color.
- `n_colors_2pct` (measured): clusters in OKLCH (quantized L, C, h) with 2% or more of the area.
- `chroma_frac` (measured): fraction of pixels with C above 0.10.
- `mass_offset` (measured): distance from the centroid of visual mass (weight = |pixel L minus background L|) to the frame center, divided by the half-diagonal.
- `n_left_edges`: distinct left edges of blocks (4 px tolerance) = real columns in use.
- `bleed_count`: elements that cross the frame edge.
- `depth_levels`: distinct combinations of blur and scale per layer.
- `grain_sigma`: high-frequency standard deviation in a flat area.
- `mono_frac`, `caps_frac` (measured): fraction of text blocks in mono font and in uppercase.

---

## 1. Composition for the moving frame

**C1. Grid declared in units, not "on the left".** 16:9: 12 columns, margin of 5% of the width (96 px at 1920), gutter of 1.25% (24 px). 9:16: 6 columns, margin of 6.7% (72 px at 1080). Rows: module of 1/8 of the usable height. Why: without a grid the agent aligns everything to the left margin and stops. Apply: `const col = (n) => M + n * (colW + G)`; each block declares a start column and span. Measure: `n_left_edges` between 2 and 4 per frame; 1 in every scene = a single spine. [practice consensus; numbers my inference]

**C2. The golden ratio is not a working tool.** Use simple divisions: 1/3 and 2/3, 5/7, 3/5. The Fast Company piece says many designers do not use it and there is no science behind it; the aesthetic idea comes from Pacioli, not Euclid. Apply: if you want the proportion, it goes in as a type-scale ratio (1.618), not as a spiral over the frame. [source: https://www.fastcompany.com/3044877/the-golden-ratio-designs-biggest-myth, read via search summary; https://talesoftimesforgotten.com/2019/11/08/were-the-greeks-really-obsessed-with-the-golden-ratio/]

**C3. Thirds are for the point of attention, not the text block.** The hero sits on one of the four intersections or bleeds off an edge; never at the geometric center by default and never always on the same intersection. Measure: `mass_offset` between 0.12 and 0.45 in most scenes; below 0.05 only in a scene declared symmetric (logo, close). Fail the piece if the standard deviation of `mass_offset` across scenes is below 0.05 (same composition). [practice consensus; thresholds my inference]

**C4. Dynamic symmetry as the axis of motion.** Use the frame diagonal and the perpendicular from the opposite corner (Hambidge armature) to tilt elements and trajectories: in 16:9 the diagonal is 29.4 degrees, in 9:16 it is 60.6 degrees. Tilted elements use that angle or its complement, not 15 or 45 out of habit. Measure: `rotate` angles outside {0, 90, diagonal angle, complement} become a warning. [practice consensus for the armature; application to motion is my inference]

**C5. Negative space is a number.** Brand or product frame: `empty_frac` of 55 to 80%. Data or UI frame: 30 to 50%. Below 25% only in a declared collage. Why: research by Pracejus, Olsen and O'Guinn links white space to prestige and perceived quality (no percentage published in the abstracts I read); the text on Apple's films attributes the "expensive" look to one idea per shot and emptiness. Measure: `empty_frac`. [source for the why: https://ideas.repec.org/a/oup/jconrs/v33y2006i1p82-90.html and https://youmind.com/landing/x-viral-articles/apple-product-video-design-secrets (studio owner's opinion); ranges my inference]

**C6. Emptiness is asymmetric.** The empty space is concentrated on one side (one margin 2x or more the opposite one), not distributed evenly around. Measure: ratio between the largest and smallest free margin around the content box, 2 or more. [practice consensus]

**C7. Scale contrast between levels: jump, don't step up.** Hero / secondary of 3:1 or more in a typographic frame (modular scales of 1.25 to 1.5 are for reading pages; in a video frame, skip two or three steps). Three sizes per frame, four at most. Measure: `ratio_top2` 3 or more; `n_sizes` 4 or fewer. `ratio_top2` between 1.2 and 2 is the dead zone (neither equal nor contrast). [practice consensus: modular scale; 3:1 threshold my inference]

**C8. Tension: one thing bleeds.** At least one element per scene crosses the edge or is cut by the frame mask (type, photo, shape). A frame where everything fits with room to spare reads as a slide. Measure: `bleed_count` 1 or more in at least half the scenes. [practice consensus]

**C9. Declared reading direction.** Each scene defines the eye's entry and exit (top-left to bottom-right is the Western default). The highest-contrast element is the entry; the second sits on the path. This complements the gaze rule already in the doctrine (which covers cuts, not frames). Measure: sort blocks by local contrast; the vector from the 1st to the 2nd cannot point out of the frame. [practice consensus]

**C10. 9:16 is not cropped 16:9.** Vertical: stack in 3 bands (top third for context, center for the hero, bottom third for support, all within the safe area the doctrine already defines), larger type relative to width (hero cap height of 12 to 20% of the frame width), lines of 12 to 18 characters. Horizontal: side-by-side composition, hero of 8 to 14% of the height. Measure: in vertical, height/width ratio of the content box 1.2 or more; if below 1, it is a squeezed horizontal layout. Note: Envato records that the "vertical first" rule is giving way to mixed formats. [source for the note: https://elements.envato.com/learn/motion-design-trends; numbers my inference]

**C11. Depth in three planes with roles.** Background (texture or color, no information), focal plane (information), foreground (a blurred or cropped element that passes in front, up to 15% of the area). The doctrine already gives the parallax factors; what is missing is requiring the foreground. Measure: `depth_levels` 3 or more in camera scenes; foreground with blur of 8 px or more. [practice consensus]

**C12. One idea per shot.** If the shot needs two titles, it is two shots. Measure: 1 hero-level block per frame; up to 12 words on screen in a shot of up to 3 s. [source: https://youmind.com/landing/x-viral-articles/apple-product-video-design-secrets (opinion); word limit my inference]

## 2. Typography in video

**T1. One family, or two clearly distinct ones.** Display and body do not need to be different families; the range of weights and widths of a good family is enough (that is Buck's argument for PP Formula at Comfy and Google Fonts' argument for superfamilies). Measure: distinct families in the video, 2 or fewer (mono for real code does not count). [source: https://buck.co/work/comfy-brand-refresh, https://fonts.google.com/knowledge/choosing_type/pairing_typefaces_within_a_family_superfamily, Anthropic's SKILL.md]

**T2. Pairs by structural contrast.** A pair that works has different roles and something in common (era, proportion, x-height); two similar sans at the same weight is the most common mistake. Pairs available on Google Fonts (existence checked in the Remotion package; the choice of pairs is mine):
- Instrument Serif (display) + Instrument Sans or Geist (text): editorial tech.
- Fraunces (opsz, SOFT, WONK axes) + Hanken Grotesk: warm, with character.
- Newsreader or Source Serif 4 (opsz) + Inter Tight: documentary.
- Bricolage Grotesque (opsz, wdth) alone: grotesque with personality, variable widths.
- Geist + Geist Mono: Vercel's language; mono only for real code and data.
- Archivo (wdth axis 62 to 125) alone: from condensed to expanded in the same family.
- Roboto Flex or Google Sans Flex (wdth, GRAD, opsz): for animating an axis.
- Mona Sans + Hubot Sans: GitHub's pair, variable width.
- Bodoni Moda or Playfair (opsz) + DM Sans: high stroke contrast, fashion and luxury.
- Schibsted Grotesk, Familjen Grotesk, Host Grotesk, Funnel Display: alternatives to Inter with their own design.
[source for the criterion: https://madegooddesigns.com/font-pairing-guide/ (third-party guide); list my inference]

**T3. Reference brands' fonts and substitutes.** Stripe uses Söhne (Klim, paid), display at weight 300 according to an unofficial guide; OpenAI uses OpenAI Sans (ABC Dinamo, proprietary); Figma uses Figma Sans with a condensed cut only for display; Vercel uses Geist and Geist Mono (free); Linear uses Inter Variable at weight 510 with negative tracking in display, according to unofficial guides. Free substitutes: Söhne with Hanken Grotesk or Schibsted Grotesk; OpenAI Sans with Geist or Onest. [source: https://fontalternatives.com/inspiration/stripe-sohne/, https://designcompass.org/en/2025/02/06/openai-rebranding/, https://www.figma.com/blog/how-we-shaped-the-visual-identity-for-config-2025/, https://getdesign.md/design-md/vercel/preview.html; substitutes my inference]

**T4. Tracking varies with size, continuously.** The bigger, the tighter; the smaller, the looser. Apple removed the fixed step at 20 pt in SF: tracking varies smoothly; small optical sizes have looser spacing and larger x-height. Vercel uses about -0.05 em at 48 px (unofficial guide). Starting table at 1080p: up to 32 px, 0 to +0.01 em; 32 to 80 px, -0.01 em; 80 to 160 px, -0.02 to -0.03 em; above 160 px, -0.03 to -0.05 em. Apply: `letterSpacing = lerp by fontSize`, and `fontOpticalSizing: 'auto'` (or explicit `'opsz'`) on fonts with an opsz axis. Measure: `letter-spacing` in em against `font-size`; fail display above 120 px with 0 or positive tracking in mixed case. [source for the principle: https://wwdcnotes.com/documentation/wwdc20-10175-the-details-of-ui-typography/ and https://fonts.google.com/knowledge/glossary/optical_size_axis; table my inference]

**T5. Uppercase: less than one line and with 5 to 12% more tracking.** Butterick: uppercase is acceptable for less than one line; add 5 to 12% spacing. In giant condensed display the positive tracking is smaller (0 to +2%), but never negative. Measure: an uppercase block with more than 1 line or more than 24 characters = warning; `letter-spacing` below 0 in uppercase = error. [source: https://practicaltypography.com/summary-of-key-rules.html; display adjustment my inference]

**T6. A tracked uppercase label above the title is a signature of generated design.** Same for a title word in italic, bold or color just "for emphasis", and a 01/02/03 marker outside a real sequence. Use only when it encodes information. Measure: `caps_frac` up to 20% of blocks; pattern `^\d{2}$` or `\d{2}/\d{2}` in on-screen text with no corresponding list = warning. [source: Anthropic's SKILL.md via https://capitalandcompute.net/blog/fix-ai-slop-design/]

**T7. Leading by size.** Body: 120 to 145% (Butterick). Display above 120 px: 0.90 to 1.05. Uppercase without descenders: down to 0.85, as long as diacritics do not collide (T12). Measure: `line-height / font-size` per block. [source for body: Butterick; display practice consensus]

**T8. Line length.** Page: 45 to 90 characters (Butterick), under 80 (Anthropic's skill). Video is not a page: display up to 3 lines of 8 to 20 characters; support up to 2 lines of 24 to 42 (the doctrine already sets 32 to 42 for captions). Break by meaning, never an orphan word on the last line. Measure: characters per rendered line; last line with 1 word of up to 4 letters = warning. [source: Butterick and SKILL.md; video ranges my inference]

**T9. Condensed is not body.** Condensed fonts (Anton, Bebas Neue, Big Shoulders, Barlow Condensed, League Gothic) only in display with up to 3 words per line. In support text below 48 px at 1080p, they close up the counters and vanish on a phone. Measure: condensed family (or `wdth` below 85) in a block with font-size below 48 px or with more than 20 characters = error. [practice consensus; threshold my inference]

**T10. Three-level hierarchy with ratios.** Hero : support : metadata around 9 : 2.5 : 1 (for example 216, 60 and 24 px at 1080p), with weight inverse to size: a large hero can be light (300 to 500), small metadata needs 500 to 600. The current doctrine prescribes 600 to 800 for every title; a light hero at large size is what Stripe and Apple do. Measure: `ratio_top2` and weight of the largest text; hero above 160 px with weight 800 or more in every scene = weight monotony. [partial source: Stripe at weight 300 in display, unofficial guide; ratios my inference]

**T11. Variable typography as a design move.** Animate `wdth`, `wght`, `opsz` or `GRAD` to change the word's state. `GRAD` changes weight without changing width, so it does not reflow the line. Measure: `fontVariationSettings` animated only on a variable font that has the axis. [source for the axes: https://fontsource.org/fonts/google-sans-flex; usage my inference]

**T12. Text in the video's language (English or Hebrew) keeps all its diacritics and marks.** The language's norms do not drop marks for display use (the search only returned the equivalent RAE rule for Spanish; for other languages I state it as known practice, with no URL confirmed in this research). Consequences: (1) check that the font covers every glyph and mark the language needs (accented Latin letters, Hebrew letters, niqqud if used); (2) minimum leading of 1.05 in text with marks above the line, otherwise they collide with the line above; (3) the `overflow: hidden` of a reveal mask needs `paddingTop` of 0.18 em or more, otherwise it clips the marks; (4) use `text-transform: uppercase` instead of typing in capitals where the script has case, to keep the true source text. Measure: render a sample of the language's tallest marked glyphs in the font and compare the ink box with the line box; pixel test at the top edge of the mask. [practice consensus; numbers my inference]

**T13. Tabular and lining figures in all data.** `fontVariantNumeric: 'tabular-nums lining-nums'`, thousands separator of the video's language (English or Hebrew), unit at a smaller size (50 to 60% of the number) aligned to the baseline. The doctrine already asks for `tabular-nums` on the counter; extend it to every column of numbers. Measure: block width constant throughout the counter. [practice consensus]

**T14. Mono only for what is code or machine data.** Mono on a decorative label is "template chrome". Measure: `mono_frac` up to 15%, and every mono block must be code, a path, a hash, a time or a value. [source: Anthropic's SKILL.md]

## 3. Color

**K1. Pick color in OKLCH, by lightness.** In HSL, the same L gives different perceived lightness depending on hue; in OKLCH, `oklch(0.8 0.12 225)` and `oklch(0.8 0.12 100)` have the same perceived lightness. Build the palette by fixing L and C and rotating h. Chroma in practice stays below 0.37; the maximum depends on hue and L. Apply: tokens in `oklch()`, convert to sRGB at build time (Remotion's Chrome accepts `oklch()` directly, **I did not verify** this in this version of the template). Measure: convert each dominant pixel to OKLCH. [source: https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl]

**K2. Lightness ladder before hue.** Define 4 to 6 named colors with a role: background, surface, ink, secondary ink, accent, optional second accent. L steps: background and ink differ by 0.60 or more; surface 0.04 to 0.08 from the background; secondary ink 0.25 to 0.35 from the ink. A background with L of 0.87 or more takes black text with good contrast. OKLCH alone does not measure contrast: use APCA or WCAG (the doctrine already requires AA). Measure: L histogram of the frame with 3 separate peaks. [source: Evil Martians for the 0.87 and for APCA; SKILL.md for "4 to 6 named colors"; steps my inference]

**K3. 60-30-10 measured by area.** Dominant 55 to 70%, secondary 20 to 35%, accent 3 to 10%. Accent above 15% stops being an accent. Measure: `n_colors_2pct` between 3 and 5 and the area of each cluster. Exactly 2 clusters in every scene is the "two flat colors" this reference exists to avoid. [practice consensus]

**K4. Restricted systems that work in video.**
- Two colors per piece, swapping the pair per piece: Buck limited each In Motion asset to two colors, with electric blue at the center of the system. Works if the pair changes between scenes.
- Palette per theme: Figma Config keeps one palette per track in variables and matches the speaker photo's background to it.
- Dark tones for a mood shift plus a touch of the brand color: Linetest for Home Depot.
- Black or white background with one saturated element, no saturated on saturated: a reading of Apple's films.
[source: https://type-01.com/?p=34730, https://www.figma.com/blog/how-we-shaped-the-visual-identity-for-config-2025/, https://www.stashmedia.tv/?p=82132, https://youmind.com/landing/x-viral-articles/apple-product-video-design-secrets]

**K5. Restricted triadic: three hues, only one saturated.** h separated by about 120 degrees, same L (for example 0.72), one with C 0.16 to 0.20 and the other two with C 0.04 to 0.08. Measure: 3 hue clusters, only one with C above 0.12. [my inference]

**K6. Color as meaning, with a law per scene.** The `law` in `direction.json` already exists. Add: each accent color has at most one meaning and appears in up to 40% of scenes; a color that appears in every scene is background. Measure: accent presence per scene. [my inference]

**K7. How to get out of "black + neon".** (a) Light frame: in the Advids study, light frames went from 21 of 60 (35%) in Q1 2026 to 22 of 40 (55%) from April to August, and the median average brightness rose from 117 to 154 out of 255. (b) Palette taken from the subject: receipt ink, court green, the color of the real UI. (c) Mesh gradient only in the top band, like Stripe (cream, orange, lavender, indigo, pink), not full screen. (d) Photography as a color source (OpenAI: landscape and still life with Sora patterns, a base of grays and blues with contrasting primaries). (e) Do not swap one default for another: cream near #F4F1EA with terracotta near #D97757 is also a generated cluster, as is tinted near-black (#0B0B0B, #111) in place of black. Measure: fail the pair {background L below 0.2 plus a single cluster with C above 0.2} when it does not come from `brand.json`. [source: https://advids.co/blog/ui-animation-motion-design-trends, https://fontalternatives.com/inspiration/stripe-sohne/ (unofficial), https://designcompass.org/en/2025/02/06/openai-rebranding/, Anthropic's SKILL.md]

**K8. Gradient interpolated in oklab.** `linear-gradient(in oklab, a, b)` avoids the grayish middle of sRGB. Add it to what the doctrine already says about banding: grain on top. [source: Evil Martians]

**K9. A grade (color grade) unifies what was made separately.** Apply a single transform at the end, over graphics and real imagery together: a curve with blacks lifted to L 0.04 to 0.08, highlights held at 0.96, slight temperature separation between shadow and light. `@remotion/effects` has `lut()` (already cited in `techniques-advanced.md`). Measure: minimum and maximum L of the frame; pure black 0 and pure white 1 in the same frame betray ungraded graphics over a photo. [practice consensus; values my inference]

**K10. Texture with values (adding to what already exists: grain 4 to 10%, halation, bloom).**
- Paper: texture in `multiply` at 8 to 20%, background with L 0.93 to 0.96 and C 0.01 to 0.02.
- Halftone: dot pitch of 6 to 12 px at 1080p, 45-degree angle in one color, 15 and 75 in two. SVG `<pattern>` with radius driven by lightness, or repeated `radial-gradient` plus `contrast()`.
- Dither: Figma built its own tool to dither hundreds of portraits for Config 2026. Bayer 4x4 or 8x8 at 1/3 resolution and upscaling with `image-rendering: pixelated`.
- Riso: 2 or 3 spot inks in `multiply`, misregistration of 1 to 3 px between inks, grain only inside the ink (Config 2025 used riso for its imperfection).
- Gradient noise: `feTurbulence` with `baseFrequency` 0.6 to 0.9 in `overlay` at 6 to 12%.
- Volumetric light: radial gradient in `screen` at 10 to 25% plus low-frequency noise (0.005 to 0.02) as a mask.
- Frame rate as texture: Figma dropped the Config 2025 opening film from 60 to 15 fps to look handmade. At 30 fps, `stepped(frame, 2)` on the illustrated layer.
Measure: `grain_sigma` above zero in a flat area and equal between the graphic layer and the photo. [source: Figma posts about Config 2025 and 2026; numeric values practice consensus or my inference]

## 4. Studio language

What each source actually supports. Where it says "inference", it is what I know of the work, with no text to confirm it.

| Studio or brand | Reproducible traits | Origin |
|---|---|---|
| Buck | (1) Content always inside mixed-corner containers (curved and angular) that connect, separate, expand and reorganize; imagery enters masked by the container. (2) One family with many weights and widths (PP Formula) instead of two families. (3) Two-color system per asset, with one central color. | https://buck.co/work/comfy-brand-refresh, https://type-01.com/?p=34730 |
| Ordinary Folk | (1) A single palette shared by every frame, with a color script for the whole piece. (2) Progression of visual complexity across the film, not a montage of disconnected shots. (3) Stylized 3D mixed with flat 2D. Rigid geometric grid and fine grain texture inside shapes: my inference. | https://motionographer.com/2019/09/16/join-the-movement/ |
| Gunner | (1) Cel over a 3D reference (animator draws over the 3D). (2) Motion on twos with continuous camera: my inference, compatible with the existing `stepped`. | https://motionographer.com/2016/12/12/gunner-their-new-film-mesh-and-the-importance-of-changing-things-up/ (search summary only) |
| Oddfellows | (1) Simple shapes with organic motion to warm up a digital product. (2) Cel and motion coexisting with real product footage. | https://dev.motionographer.com/2015/10/13/oddfellows-works-with-nest/, https://motionarray.com/blog/industry-spotlight-oddfellows (403, search summary only) |
| ManvsMachine | (1) Each shot is a material metaphor, classified by property (soft and cushioned, light and breathable). (2) Product 3D-scanned for fidelity. (3) Physical object built and filmed when graphics would feel cold. | https://www.stashmedia.tv/manvsmachine-nike-air-max-2017/, https://maxon.net/en/article/man-vs-machine-fusing-creativity-with-technology-with-the-help-of-cinema-4d |
| Giant Ant | (1) Brush texture and cross-hatching inside shapes. (2) Fragmented compositions. (3) 3D with a clay look (faux claymation), cinematic cuts and camera. | https://motionographer.com/?p=64478, https://motionographer.com/2016/08/26/another-great-film-for-slack-from-canadas-very-own-giant-ant/ |
| Golden Wolf | (1) Rejection of the smoothest motion: "bold and edgy". (2) Retro, grungy graphics mixing 2D and 3D. Thick stroke and smear: my inference, the source does not describe it. | https://goldenwolf.tv/culture/artist-spotlight-stephanie-mercier, https://motionographer.com/2025/05/12/studio-stories-12-years-of-golden-wolf/ |
| Linetest | (1) Hand-drawn cel in service of character. (2) Dark palette to mark a mood shift, with small touches of the brand color. | https://www.stashmedia.tv/?p=82132 |
| Hornet | (1) Stop motion, illustration, CG and compositing in the same shot. (2) Handmade props (paper, origami, fabric) and in-camera lighting. Sources from 2005 to 2020. | https://www.dragonframe.com/blog/tactile-animation-for-st-louis-childrens-hospital/ |
| Apple | (1) One idea per shot and lots of emptiness. (2) Black or white background with one strongly colored element. (3) Cuts you don't notice, rare SFX. MacBook Pro M5: 79 scenes in 100 s, no narration, people before product. | https://youmind.com/landing/x-viral-articles/apple-product-video-design-secrets (opinion), https://videngineer.com/teardowns/launch/apple-macbook-pro-m5-launch-film-teardown/ (method not stated) |
| Linear | (1) No narration; 33 s, about 20 scenes per minute, 2 music changes. (2) Vignette that darkens the periphery and isolates the central screen. (3) Static system: near-black, hierarchy by white opacity, Inter at weight 510, negative tracking in display. | https://videngineer.com/teardowns/motion-graphics/linear-introducing-linear-for-agents/, https://advids.co/blog/saas-product-launch-videos (n=7), https://getdesign.md (unofficial) |
| Stripe | (1) Reader film: 52 s, no narration, 58% of scenes in animated 3D, magenta and cyan, arc of problem, solution, customization, integration. (2) Display at light weight (300). (3) Mesh gradient restricted to the top third. | https://videngineer.com/teardowns/launch/stripe-introducing-stripe-reader/, https://fontalternatives.com/inspiration/stripe-sohne/ |
| Vercel | (1) UI at second zero (the interface is the hook). (2) Ending with a zoom out of the UI until it becomes the logo. (3) Ink #171717, not pure black; Geist with tight tracking and Geist Mono on technical labels; 1 px border made with a shadow. | https://advids.co/blog/saas-product-launch-videos (n=7), https://getdesign.md/design-md/vercel/preview.html (unofficial) |
| Figma | (1) Glyphs made of primitives with an inner and outer element that react to each other; corners alternating round and sharp. (2) Opening film at 15 fps; expressive type motion longer, functional type motion shorter. (3) Config 2026: dither, scribble, blurred gradient and oval particle in collage. Config 2025 sizzle: 81 s, 57.7 scenes per minute, 71% screen capture, 78% with overlaid text. | Figma posts; https://videngineer.com/teardowns/launch/figma-all-launches-config-2025/ |
| OpenAI | (1) "The point" (black circle, the cursor) as the basis of the grid and present in the letters. (2) Base of grays and blues with contrasting primaries. (3) Landscape and still-life photography with generated patterns. Motion with Studio Dumbar, no published detail. | https://designcompass.org/en/2025/02/06/openai-rebranding/, https://www.creativereview.co.uk/openai-brand-refresh/ |
| Arc | (1) Floating cards pulled from the browser frame. (2) Task sped up to 300%. (3) Hard cut from the success state to call-to-action text. **I found nothing** about the art direction of the films. | https://advids.co/blog/saas-product-launch-videos (n=7, no method) |

Rules that come out of the table:

**E1. Container as the unit.** Every image and every UI enters inside a shape with the brand's own geometry (`clipPath` or `mask`), and the shape takes part in the transition. Measure: an image with a rectangular bounding box equal to the frame in more than half the scenes = there is no system. [source: Buck Comfy]

**E2. One motif with an inner and outer part.** The motif in `direction.json` gets two parts that react with a delay (`lag` of 2 to 4 frames). [source: Figma Config 2025]

**E3. Declared process imperfection.** Only one per piece: 12 or 15 fps on the illustrated layer, riso misregistration, dither or cut-out edge. Measure: `stepped` present, or offset between channels. [source: Figma Config 2025 and 2026; Envato "craft as luxury"]

**E4. Color script.** A strip with the dominant color of each scene, approved before animating; the climax scene has the largest color distance from the previous one. Measure: ΔE_OK of the dominant cluster between neighboring scenes; all below 0.05 = piece with no color arc. [source: Ordinary Folk; metric my inference]

## 5. 60 to 90 s launch film (2025 and 2026)

**L1. Duration.** Median of 1:14 (Q1 2026) and 1:18 (Apr to Aug 2026) across 100 software videos; middle half from 0:50 to 1:45. Top-tier brand films are shorter: Linear 33 s, Anthropic Opus 4.6 39 s, Stripe Reader 52 s, Notion AI 57 s, Figma Motion 1:09, Cursor 2.0 1:04. [source: Advids; videngineer; https://www.moonb.io/blog/product-launch-video]

**L2. Cutting pace: two regimes.** The typical B2B video has a median of 8.4 to 8.6 scene changes per minute (about 7 s per scene). The reference films have 20 to 58 scenes per minute: Linear 20.2; Anthropic 21.3; Notion 29.7; Apple about 47 (79 in 100 s); Figma 57.7. That is, 1 to 3 s per shot. The two sources measure "scene" differently and videngineer's method is not stated. Apply: target 20 to 30 scenes per minute in a brand film, with 2 or 3 long breathing shots (4 to 6 s), which respects the doctrine's 3x rule. Measure: `timeline.json`, scenes per minute. [source: Advids and videngineer; target my inference]

**L3. No narration in the reference films.** The five previews I read (Linear, Notion, Anthropic, Apple, Figma, Stripe make six) say "no narration; the story is carried by cuts and sound". In the general set the opposite happens: the median of spoken words rose from 65 to 101. Burned-in captions grew from 2 of 60 to 7 of 40. Apply: the no-voice option should be the default for a brand film, with the on-screen text as the script (`direction.md` already covers "works without sound"). [source: videngineer, Advids]

**L4. When the UI appears.** Median of the first interface frame: 0:13 (Q1) and 0:18 (Apr to Aug). Among n=7 top brands: 5 cut to the UI before 3 s after a pain-point line, 2 open inside the UI. Median UI coverage of total time: 33 to 39%. Apply: real UI by 3 s, or a typographic hook of up to 3 s and the UI right after. [source: Advids, both texts]

**L5. Real UI, cropped.** Screen capture rose from 22 of 60 (37%) to 25 of 40 (63%); pure motion graphics fell from 68% to 48%. Among n=7, 6 show the UI "abstracted" (no native borders, only the feature panel) and 6 blur the background when a modal opens. Apply: recreate the UI in React or use a capture, crop to the panel, remove the browser frame, blur of 8 to 20 px on the rest. [source: Advids]

**L6. 3D declining in software, strong in hardware.** 3D in the build fell from 14 of 60 (23%) to 5 of 40 (13%); as the main technique, from 10 to 2. In the Stripe Reader film (hardware), 58% of scenes are 3D. Apply: 3D only when there is a physical object or a material metaphor; not as SaaS decoration. [source: Advids, videngineer]

**L7. Kinetic typography is punctuation, not the film.** Present in 53 to 63% of videos, but takes a median of 20 to 25% of the time; videos where it covers half the time fell from 7 to 1. Measure: fraction of time in text-only scenes, up to 30%. [source: Advids]

**L8. Compressed time.** 7 of 7 speed up the task; 5 of 7 use a hyper-accelerated progress indicator; Arc speeds up to 300%; Raycast cuts between keystrokes, skipping loading. Apply: `timeRemap` already exists; never show real waiting. [source: Advids n=7]

**L9. Designed success state.** Toast from the top in 4 of 7; local animation (closing circle, confetti) in 3 of 7. One per feature. [source: Advids n=7]

**L10. Close.** 5 of 7 make a fluid transition from UI to logo (Vercel: zoom out until the UI becomes the logo); 2 of 7 hard-cut to text. [source: Advids n=7]

**L11. Beats for 60 to 90 s** (my synthesis of the sources above, compatible with the table in `direction.md`):
- 0 to 3 s: hook, a pain-point line or the UI in action.
- 3 to 12 s: the whole product in a wide shot, name.
- 12 to 55 s: 3 features, each with 8 to 14 s in 4 to 6 shots (context, close-up on the panel, accelerated action, success).
- 55 to 70 s: fast montage of everything (1 s per shot).
- last 5 to 8 s: brand, one line, where to find it.
[my inference]

**L12. Macro.** Extreme close-up of material or pixel (UI text at 300 to 600% with depth of field) as a breathing shot between features; the sound follows the scale (see S5). I found no source quantifying macro in product films. [my inference]

## 6. Motion over real imagery

**F1. Ken Burns with a number.** There is no documented standard; sources only give a scale range (100 to 200%) and say duration sets speed. Recommendation: 3 to 8% scale over 4 to 6 s (1 to 2% per second), always toward the subject or away from it, never both in the same shot; motion already underway on the first frame and still underway on the last (the cut lands mid-move); linear or near-linear curve; source at least 1.2x the final resolution at the largest zoom (a 200% zoom at 1080p needs a 3840x2160 image). Measure: final/initial scale and image resolution. [source for the resolution requirement: https://www.sliderrevolution.com/documentation/pan-zoom/ and https://larryjordan.com/articles/final-cut-pro-x-create-a-ken-burns-effect/; rates my inference]

**F2. 2.5D photo parallax.** Cut out the subject (`roto.py --backend rembg` on one frame), fill the background behind it, 3 layers. Background from 1.00 to 1.03, subject from 1.00 to 1.08, foreground from 1.00 to 1.15, plus lateral shift of 1 to 2% of the frame; blur of 2 to 6 px on the background. Measure: scale ratio between layers of 1.03 or more; cut-out edge with 1 to 2 px feather. [practice consensus]

**F3. Real duotone.** Map lightness to two inks (shadow and light) instead of putting color in `multiply` over a color photo: `feColorMatrix` to gray and `feComponentTransfer` with `tableValues` of the two colors, or `grayscale(1) contrast(1.1)` with a `mix-blend-mode: lighten` layer and a `darken` one. Shadow with L 0.15 to 0.25, light with L 0.85 to 0.95, hues 60 degrees or more apart. Measure: photo pixels on the line between the two colors in OKLab. [practice consensus; values my inference]

**F4. Cut-out with intent.** A collage cut-out either has a visible edge (paper stroke of 4 to 10 px, short shadow of 2 to 6 px offset in one direction only) or is perfect; anything in between gives it away. [practice consensus; torn-paper trend in https://blog.videobolt.net/post/top-motion-graphics-trends-2026]

**F5. Video inside the letter.** Letter height of 35% of the frame or more, weight 800 or more, up to 6 characters per line, and the inner video with slow motion and high contrast, otherwise the letter disappears. `background-clip: text` or SVG `<mask>` with `<Video>` behind. Measure: text ink area of 25% of the frame or more. [my inference]

**F6. Text locked to the scene.** Matched perspective (`matrix3d` from 4 points), motion blur equal to the footage's, and the text passes behind the subject when possible. Text that floats without shaking along with the camera is the number-one defect. `techniques-3d-compositing.md` covers the how (`track.py`, `<CornerPin>`, `roto.py`). [practice consensus]

**F7. Integrating graphics and footage.**
- Graphics' black and white taken from the footage: sample the shot's black point and white point and use them as limits; never #000 and #FFF over video.
- Grain over everything, after the graphics: noise shows more in the shadows, so grain and black level are checked together.
- Matched sharpness and saturation: vector graphics get 0.3 to 0.6 px blur over 1080p footage.
- Light wrap: background blurred by 20 to 60 px applied to the element's edge in `screen`.
- Shadow in the direction of the scene's light, one direction only.
Measure: `grain_sigma` equal in both regions; the graphics' minimum L at least the footage's minimum L. [source: https://vitrina.ai/blog/advanced-compositing-techniques-seamless-vfx-integration/ and https://nofilmschool.com/2015/03/basic-tips-make-after-effects-compositing-look-better; 0.3 to 0.6 px blur my inference]

**F8. Split screen and frame.** Constant gutter (0 or 8 to 16 px, never different values in the same scene), horizon line and subject scale matched across panels, a single corner radius. Frame: the photo takes 60 to 75% of the frame, with an asymmetric margin (C6). [my inference]

**F9. Mistakes that betray an amateur.** Untreated stock photo (the doctrine already bans stock icons); stretched photo or resolution below the zoom; pure white type over a photo without a protection gradient (use a 0 to 60% black gradient only behind the text, not over the whole photo); generic drop shadow; cut-out with a halo; grain only on graphics or only on the photo; Ken Burns that stops and reverses. [practice consensus]

## 7. Sound

`audio.md` already covers licensing, levels, ducking and loudness. What studios do differently, according to Wes Slover and Trevor (Sono Sanctus):

**S1. SFX tuned to the music's key.** Pitched sounds alongside music must be in key; in a descending sweep, only the starting note needs to fit. Apply: `sfx.py` takes the track's tonic and generates pop, tick and shimmer on that note or the fifth. Measure: fundamental pitch of the SFX against the track's detected key. [source: https://www.schoolofmotion.com/blog/sono-sanctus-podcast-podcast]

**S2. A few exact sync points; the rest stays abstract under the music.** Choose 3 to 6 moments per 30 s to hit on the frame. This reinforces the existing "one SFX per meaningful event". [source: same]

**S3. Take away rather than add.** In the final mix, almost everything was turning down; sound design takes up less space when the music comes in. Measure: SFX density per 10 s drops when the track is above -18 dB. [source: same]

**S4. SFX with the same texture as the track.** Sounds made from the same timbres as the music blend in and make the music seem to respond to the picture. Library used as layered raw material, not dropped in as is. [source: same]

**S5. Sound scale equals image scale.** An extreme close-up calls for sound recorded up close and larger than life (pencil on cardboard instead of paper, for weight). Impact: big kick plus booms underneath, and a tail with delay and reverb that carries the shot away. [source: same]

**S6. Layers of a whoosh.** Broadband noise sweep (air), tonal element (body), textured recording (grain). Separate the sound of object motion from the sound of a scene change. [source: https://sonilo.com/ai-music/whoosh-sound-effect-guide, via search summary]

**S7. From real to surreal.** The sound starts realistic and becomes abstract along with the image; the music only comes in after the first realistic beat. In a launch film: dry UI foley in the first 3 s, the track comes in on the product shot. [source: Sono Sanctus; application to launches my inference]

**S8. Music changes as structure.** Linear has 2 changes in 33 s, Notion 5 in 57 s, Anthropic one continuous bed in 39 s. Apply: one track section change per act, matched to the color script (E4). [source: videngineer; application my inference]

**S9. Check on a phone speaker.** Headphones exaggerate detail and mislead on voice level; without a good speaker the tendency is to overdo the bass. Measure: energy below 120 Hz cannot carry information (the sub disappears on a phone); check the mix with a 150 Hz high-pass. [source: Sono Sanctus; 150 Hz cut my inference]

## 8. Trends of 2025 and 2026, and what became a cliché

Trends with a source (all from template or asset vendors, not independent criticism):

- Handmade and imperfect: loose stroke, irregular outline, frame by frame. [VideoBolt; Envato "craft as luxury", with Hermès as an example]
- Analog texture: grain, paper fiber, dust, VHS, tungsten light, vintage typography. [VideoBolt; Envato]
- Torn paper and collage, with reduced frame rate. [VideoBolt]
- Modular editorial layout: frames, cut-outs, blocks of type in sequence. [VideoBolt]
- Hybrid 2D and 3D; stylized 3D, "toy" mascot, diorama, cel shading. [VideoBolt; Envato 3D]
- Glass and dispersion, tied to Apple's Liquid Glass; the source itself calls it a returning language. [VideoBolt]
- Coded motion: procedural, ASCII, reactive 2D physics, particles. [Envato]
- Brand film with a story instead of fast, flashy visuals; minimalist editing, long shots. [Envato, both texts]
- End of the single-aspect-ratio rule; mixed formats. [Envato]
- Captured interface instead of drawn interface, light frame, more speech. [Advids, with counts]
- Motion as function inside the product; taste as differentiator as AI cheapens polish. [School of Motion, 2025 recap]

Clichés to avoid (what the sources say is tired, plus what the "AI slop" catalogs list):

- Ad-style "fast, flashy visuals" and dramatic transitions. [Envato]
- Smooth polish and "generative sameness". [Envato; VideoBolt]
- Rounded rectangle as the single app mold. [School of Motion]
- Indigo-to-purple gradient, frosted glass and glow with no function, three identical cards, a counter ticking up on every stat, fade-and-rise on every section. [capitalandcompute; 925studios]
- Near-black with one neon; cream with serif and terracotta; thin rule with zero corners and newspaper columns; tracked uppercase label; mono on labels. [Anthropic's SKILL.md]
- Caution: grain, VHS and torn paper are in every 2026 template pack (VideoBolt's examples are templates for sale). Analog texture applied over a generic layout is already the next cliché. [my inference]

## 9. Signs of "made by AI or template" in design, with antidote

| Sign | Antidote | Measure |
|---|---|---|
| Giant condensed type on the left in every scene | Vary the hero level: in at least 1/3 of scenes the hero is an image, UI or shape, not text (C3, T10) | fraction of scenes where the largest element is text, up to 60% |
| Two flat colors (near-black and one accent) | Palette of 4 to 6 colors with roles, taken from the subject; light frame (K2, K7) | `n_colors_2pct` of 3 to 5; fail the pair background L<0.2 plus 1 cluster C>0.2 |
| Mono counter or label in the corner | Mono only for code and machine data (T14) | `mono_frac` up to 15% |
| Tracked uppercase label above the title | Remove it, or keep only what encodes information (T6) | `caps_frac` up to 20% |
| 01/02/03 marker, "A · B · C", arrows on everything | Only in a real sequence | regex on on-screen text |
| One title word in color, italic or bold | Emphasis by scale or position, once per piece | spans of different style inside the hero |
| Big number, small label, supporting stats | Data in context (chart, receipt, real UI) | scene with 1 number of 200 px or more and 2 to 4 small aligned texts |
| Everything with the same radius and the same shadow | Radius and elevation by hierarchy; at most 2 radii | distinct `border-radius` and `box-shadow` values |
| Grid of 3 identical cards | Asymmetry: 1 large and 2 small, or a list | same-size boxes side by side, 3 or more |
| Everything centered or everything on the left margin | Alternate axis per scene (C1, C3) | standard deviation of `mass_offset` across scenes of 0.05 or more |
| Decorative gradient, glow, frosted glass | One texture with a declared process (E3) | already covered in `direction.md`, no reliable measure |
| Generic thin-line icon | Draw the icon with the motif's shape, or use the real object | no measure |
| Vague copy ("Faster. Simpler.") and invented numbers | A line only this product would say; the doctrine already bans invented data | review |
| Untreated stock photo | Duotone, cut-out or grade (F3, F4, K9) | photo pixels outside the palette |
| Texture over a generic layout | Texture only after the untextured frame passes | compare `layout.py` with and without the layer |

Origin of the signs: Anthropic's SKILL.md, capitalandcompute, 925studios, the ux-skill wiki (search summary only). The adaptation to video frames and the measures are my inference. The general rule from all three sources: swapping one default for another does not work; write the direction before the code (4 to 6 hex, 1 or 2 families, one layout concept) and put in a checker that fails.

---

## (a) The 15 rules that change the result most, in order

1. **Direction derived from the subject, with 4 to 6 named colors and 1 or 2 families**, and rejection of the five default clusters (K7, section 9).
2. **The hero is not always text**: in 1/3 of scenes or more it is an image, real UI or shape (section 9, L5).
3. **`n_colors_2pct` between 3 and 5 and 60-30-10 by area** (K3).
4. **Scale jump of 3:1 or more and at most 4 sizes per frame** (C7).
5. **Light hero at large size, small and firm metadata**; no 800 on everything (T10).
6. **`mass_offset` varying across scenes** and asymmetric emptiness (C3, C6).
7. **Negative space with a range per frame type** (C5).
8. **Container with brand geometry for every image and UI** (E1).
9. **One declared process imperfection**, after the clean frame passes (E3, K10).
10. **Palette in OKLCH with an L ladder and a color script across scenes** (K1, K2, E4).
11. **Continuous tracking by size, and uppercase only with positive tracking and less than one line** (T4, T5).
12. **Mono, tracked uppercase and numeric markers only when they encode information** (T6, T14).
13. **Real cropped UI by 3 s, compressed time, designed success state** (L4, L5, L8, L9).
14. **Brand film without narration, 20 to 30 scenes per minute with 2 or 3 long shots** (L2, L3).
15. **A single final grade and grain over graphics and photo together; black and white sampled from the image** (K9, F7).

## (b) Six art directions

The OKLCH palettes are my proposals, to adjust to the brand. None is giant condensed type in two colors.

**1. Cutting table** (editorial collage)
- Grid: 12 columns broken on purpose; cut-outs rotated 2 to 6 degrees, overlapping, 2 or 3 bleeding.
- Typography: Fraunces (high opsz) in mixed case, 120 to 200 px, with Hanken Grotesk at 28 to 36 px.
- Palette: paper `oklch(0.95 0.015 90)`, ink `oklch(0.22 0.02 260)`, three spot inks at L 0.70: `oklch(0.70 0.17 30)`, `oklch(0.70 0.12 150)`, `oklch(0.70 0.13 250)`.
- Texture: paper in multiply at 15%, 6 px cut-out edge, short shadow, tape.
- Dominant motion: `stepped(frame, 2)` on the collage layer with continuous camera; pieces enter by cut and short slide.
- Reference: Figma's Config 2026 identity. https://figma.com/blog/the-visual-identity-behind-config-2026

**2. Primitive system** (geometry that reorganizes)
- Grid: modular 8 x 8; everything is circle, square, half-moon, with corners alternating round and sharp.
- Typography: one variable-width family (Archivo or Mona Sans), weight 400 to 500, hero of 96 to 140 px. Medium type, large shape.
- Palette: 4 colors at L 0.75 and C 0.14 (h 25, 95, 160, 265) on `oklch(0.97 0 0)`, ink `oklch(0.20 0 0)`.
- Texture: none, or riso (multiply and 2 px misregistration).
- Dominant motion: shapes connect, divide, expand and become the content's mask (`interpolatePaths`, `IrisReveal`).
- Reference: Buck for Comfy; Config 2025 glyphs. https://buck.co/work/comfy-brand-refresh

**3. Product studio** (macro and material)
- Grid: one object, center shifted to a third; `empty_frac` of 70 to 80%.
- Typography: Geist or Onest at weight 300 to 400, 48 to 72 px, one line per shot, small relative to the frame.
- Palette: seamless neutral background `oklch(0.16 0.005 260)` or `oklch(0.96 0.003 90)`, one strong color only on the object.
- Texture: volumetric light, depth of field, grain at 4%.
- Dominant motion: slow orbiting or push-in camera, invisible cuts, extreme close-up of material.
- Reference: ManvsMachine for Nike Air Max 2017; Apple's product films. https://www.stashmedia.tv/manvsmachine-nike-air-max-2017/

**4. UI as landscape** (light)
- Grid: the real UI is the set; frameless cropped panels, tilted in 3D along the diagonal (C4), 3 depth planes.
- Typography: the product's own font, 500, 56 to 88 px, short caption beside the panel. Mono only in real code.
- Palette: taken from the UI via `brand.json`; light background `oklch(0.97 0.004 250)`, surfaces at 0.04 L, the product color only in the active state.
- Texture: background blur when a modal opens, long soft shadow in one direction, light vignette.
- Dominant motion: camera traveling from panel to panel, cursor in an arc, accelerated time, close with zoom out to the logo.
- Reference: Linear for Agents; Vercel. https://videngineer.com/teardowns/motion-graphics/linear-introducing-linear-for-agents/

**5. Photographic editorial**
- Grid: photo bleeding across 2/3 of the frame plus a text column in 1/3; alternates with a framed photo at 65% and asymmetric margin.
- Typography: Instrument Serif or Newsreader (opsz) at 90 to 150 px, mixed case, with Instrument Sans at 28 to 34 px.
- Palette: duotone per act (shadow `oklch(0.20 0.05 265)`, light `oklch(0.92 0.04 85)`), one brand accent up to 5% of the area.
- Texture: grain at 6% over everything, light halation, single grade.
- Dominant motion: slow Ken Burns (F1), 2.5D parallax (F2), text by line mask.
- Reference: OpenAI's 2025 brand imagery; the story-driven brand film trend. https://designcompass.org/en/2025/02/06/openai-rebranding/

**6. Halftone and code** (dither, halftone, generative)
- Grid: a fixed 8 or 16 px cell that everything respects, from image to text.
- Typography: Geist Mono or Martian Mono as the main voice (here mono is the concept, not decoration), with Bricolage Grotesque in display.
- Palette: 1 bit plus one ink: background `oklch(0.94 0.02 100)`, ink `oklch(0.25 0.03 260)`, spot `oklch(0.65 0.20 35)`.
- Texture: Bayer 8x8 at 1/3 resolution on photos and gradients, halftone at 45 degrees.
- Dominant motion: procedural field (flow field, automaton, ASCII) that resolves into a legible shape; animated dither threshold as a reveal.
- Reference: Config 2026 dithered portraits; Envato's "coded motion". https://elements.envato.com/learn/motion-design-trends

## How to use the directions

Each direction is a complete sheet: grid, typography, palette, texture and dominant motion. At step 5 of the workflow, propose 2 to 3 sheets that differ from each other (these or ones derived from the subject) and show a styleframe of each. None may be the default combination: giant condensed type on the left, near-black with one accent, mono in the corner. `design.py` warns when the whole piece falls into it.
