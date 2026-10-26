# Brand: extract once, reuse in every video

`scripts/brand.py` reads the real brand from a website, a repository or images and writes `brand.json` (the format of the template's `public/brand.json`), `BRAND.md` (to read before writing the script and scenes) and `assets/` (logo, icons, og:image, screenshots).

## When to run it

- In the brief, before any scene, whenever the video is for a brand that already exists (live site, product with code, or just screens).
- Once per brand. If a `brand/` folder already exists next to the video projects, use the one that's there and don't run it again. Run it again only when the brand has changed.
- Don't run it for an unbranded piece: the template's `brand.json` is enough.

## The three modes

```bash
uv run <skill>/scripts/brand.py --url https://exemplo.com -o brand/           # live site
uv run <skill>/scripts/brand.py --repo ../meu-app/apps/web -o brand/          # local code, read-only
uv run <skill>/scripts/brand.py --screens telas/ -o brand/                    # images only
uv run <skill>/scripts/brand.py --url https://exemplo.com --repo ../meu-app/apps/web -o brand/   # evidence is combined
```

- `--url`: downloads the HTML and the stylesheets (linked and `@import`), takes 1440x900 and 390x844 screenshots and checks the CSS palette against the pixels. It's the most reliable mode, because `bg` and `ink` come from what appears on screen.
- `--repo`: reads CSS with custom properties, `tailwind.config.*`, theme objects in TS/JS, `package.json`, `next/font`, `@font-face`, Google Fonts and logos in `public/`, `static/` and `assets/`. It doesn't execute or install anything. Point it at the front-end folder (the one with `package.json` and `globals.css`), not at the monorepo root. `--repo` can be repeated. An `@import "@escopo/pacote/tokens.css"` from a package in the same workspace is followed, which reads files outside the given folder.
- `--screens`: pixels only. Delivers `bg`, `ink` and `accent`; `muted`, `line`, `second`, fonts, name and logo stay `null`.
- Run it from the video project folder (the one with `node_modules`): that's where the script looks for Remotion's Chrome and checks whether the font exists in `@remotion/google-fonts`.
- `-o` can't be inside the analyzed repository.

## Read the result before using it

- `missing` lists what wasn't found. Those fields are `null`. Don't fill them in on your own: show the list to the user and ask (it's one of the "stop and ask" cases in SKILL.md).
- `warnings` reports contrast below the minimum (ink/bg 4.5 and accent/bg 3) with the measured number, an accent that doesn't appear on screen, a font that doesn't exist in Google Fonts, and network or screenshot failures. The brand color is never altered to pass contrast: with an accent/bg warning, use the accent on a large area or on another surface.
- `evidence` says where each value came from, the light and dark themes found and which one was chosen, and the accent candidates with their scores. Open `assets/screenshot-desktop.png` and compare it with the palette before accepting.
- `BRAND.md` contains the page's title, description and first headlines, quoted as they are. Use them as a reference for tone, not as the video's text.

## Taking it into the video

1. Resolve with the user every `null` field in `colors` and `fonts`. The template reads `brand.colors` directly: `null` breaks the scene.
2. Copy `brand/brand.json` to the video project's `public/brand.json` and `brand/assets/logo.*` to `public/assets/` (the `logo` field is a path relative to `public/`; in the scene, load it with `staticFile(BRAND.logo)`).
3. Font: fonts are bundled from `@fontsource` (no network at render). If the family is already in `src/fonts.ts`, just set `brand.json` → `fonts.display`. Otherwise, if `evidence.fonts_google` marks it as a Google font, run `npm i @fontsource/<family-slug>` (Bricolage Grotesque → `@fontsource/bricolage-grotesque`) and `python <skill>/scripts/genfonts.py .` in the project, then set `fonts.display`. If it is proprietary, load the file with `@remotion/fonts` + `staticFile` when the user has the license and the file, or choose a substitute with them. The script doesn't download font files.
4. Run `lint.py`: a color outside `C.*` is still a warning.

## Where to keep it

A `brand/` folder next to the video projects, versioned with them:

```
videos/
  brand/            brand.json, BRAND.md, assets/
  lancamento-v2/    public/brand.json copied from ../brand
  tutorial-caixa/
```

With more than one brand, one subfolder per brand (`brand/arena7/`, `brand/voxy/`).

## Real limits

- **The accent is a heuristic.** The choice adds up the variable name (primary, brand, accent, cta, acento, marca, acao), use in button, link and highlight selectors, use of utility classes in the code, and presence in the pixels. In a monochrome brand, or when the site has several strong colors, it may come out `null` or the wrong color. Always check against the screenshot and the candidates in `evidence`.
- **`second` almost always comes out `null`.** It only appears with an explicitly named variable (secondary, accent-2) or strong, visible use. In 8 tested targets it came out in 1.
- **Only the first screen.** The screenshot is the initial fold, with 8 s of virtual time. A cookie banner, entrance animation and a hero with a photo or video count toward the pixels. What's below the fold isn't seen.
- **Pixels alone don't separate brand from illustration.** In `--screens` mode the accent is the most frequent saturated color: if the screen has a photo, it's the photo.
- **CSS assembled by JavaScript isn't read.** A site that injects styles at runtime (CSS-in-JS without SSR) falls back to pixels-only mode. A site that responds 403 to bots delivers nothing: the script logs the error and doesn't retry. It doesn't read `robots.txt`.
- **Theme.** It recognizes `.dark`, `.light`, `[data-*="dark"]`, `prefers-color-scheme` and the names `claro` and `escuro`. A theme with another class name isn't recognized and its values mix with the default. Without a screenshot, the default theme comes from HTML hints or from the unthemed scope.
- **Colors.** It normalizes hex, `rgb()`, `hsl()`, `oklch()`, `oklab()`, `color(srgb|display-p3)`, CSS names, chained `var()` and `color-mix()` in srgb and oklab. It doesn't resolve `calc()`, relative color (`from`), `lab()`, `lch()` or `color-mix()` in other spaces. A color outside sRGB is clipped channel by channel and becomes a warning. A color with alpha in `muted` and `line` is composited over `bg`.
- **Tailwind.** It only resolves colors the project defines (custom property, `@theme`, `colors` in the config). A default palette class (`bg-zinc-950`) in JSX isn't resolved. `tailwind.config` and TS themes only when the object is a literal: a computed, imported or function-generated value is ignored.
- **Fonts.** Name only. `next/font/local` has its name deduced from the file. A system font stack becomes `null` with a warning. The `@remotion/google-fonts` check only happens when the package is installed from the current folder.
- **Logo.** On the site: `<img>` or inline SVG in the header, JSON-LD. An SVG with `currentColor` is saved as is and renders black outside the site. A sprite logo (`<use>`) isn't captured. In the repository: files with logo, brand or marca in the name; a logo written as a JSX component isn't found. The script copies one and lists the others in `evidence.logo_alternatives`.
- **Tone.** Only title, description and `h1`/`h2`. In the repository, only literal text in the home page and landing components; a title built with a variable or component is left out.
- **Chrome.** It tries each binary with the sandbox, in the order `node_modules/.remotion`, `chromium`, `chromium-browser`, `google-chrome`. On Ubuntu 24.04 Remotion's `chrome-headless-shell` doesn't start with the sandbox (AppArmor user namespace restriction) and the script moves on to the next one. `--allow-no-sandbox` allows a second round without the sandbox and leaves a warning; this path hasn't been verified. The page is opened with Chrome's own user agent.
- **Network.** Up to 140 requests, 90 stylesheets and 4 MB per file, without retries. A site with more CSS than that is read in part.
