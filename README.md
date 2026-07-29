# useful-skills

Five install-ready [Agent Skills](https://github.com/GiladMeirson/useful-skills) for [Claude Code](https://claude.com/claude-code) — canvas rendering, 2D physics, terse replies, self-improving sessions, and a transparency footer. Each one is a self-contained `SKILL.md` (plus, for some, reference docs and helper scripts) that Claude reads automatically once it's dropped into `.claude/skills/`.

**Full docs, with live demos and copy-paste install commands for each skill:** open [`index.html`](index.html) in a browser, or see the published version linked from this repo.

## The five skills

| Skill | What it does |
|---|---|
| [`canvas-atelier`](skills/canvas-atelier) | Gallery-quality drawing & animation on HTML canvas — construction-based shapes, physically-based light/shadow, organic curves, animation-principle-driven motion. |
| [`physics-2d`](skills/physics-2d) | A small, tested 2D rigid-body physics engine — gravity, collisions, bouncing, friction, stacking, joints, raycasting, a deterministic fixed-timestep loop. |
| [`caveman`](skills/caveman) | Ultra-compressed responses — drops articles, filler, and hedging while keeping full technical accuracy. Frontmatter claims a measured ~65% token reduction. |
| [`matrix-agents-skill`](skills/matrix-agents-skill) | A meta-skill that watches a coding session for reusable knowledge (repeated fixes, regressions, long exploration, decisions) and proposes turning it into a new skill. |
| [`skill-report`](.claude/skills/skill-report) | A one-line transparency footer, enforced by a Stop hook, showing which skills/subagents/web tools ran on each turn. |

Open `index.html` for what each one is actually *for*, its key files, and a worked example prompt/result per skill.

## Install a skill

Every skill installs the same way — one line, no need to clone this whole repo. It only needs `npx`, which already ships with Node (a Claude Code prerequisite):

```sh
npx degit GiladMeirson/useful-skills/skills/<skill-name> .claude/skills/<skill-name>
```

For example:

```sh
npx degit GiladMeirson/useful-skills/skills/physics-2d .claude/skills/physics-2d
```

Run it from your project's root. To install for *every* project on your machine instead of just this one, swap the destination for `~/.claude/skills/<skill-name>` (PowerShell: `$HOME/.claude/skills/<skill-name>`).

`skill-report` is the one exception — it already lives at `.claude/skills/skill-report` in this repo, so its source path is `.claude/skills/skill-report` instead of `skills/skill-report`, and it needs its Stop hook merged into your project's `.claude/settings.json` too (see [`index.html`](index.html#skill-report) or [`.claude/settings.json`](.claude/settings.json) in this repo for the exact JSON to add).

### Guided install

Prefer a menu over remembering paths? Clone this repo once and run the installer with no arguments for an interactive picker (project-level vs. global, per-skill), or pass a skill name directly:

```sh
# macOS / Linux / WSL / Git Bash
./install.sh                 # interactive picker
./install.sh caveman         # install into this project
./install.sh caveman --global    # install for every project

# Windows PowerShell
.\install.ps1
.\install.ps1 caveman
.\install.ps1 caveman -Global
```

Both scripts wrap the same `npx degit` mechanism — no git clone under the hood, and nothing to maintain beyond Node.

## What's a skill?

A skill is a folder Claude Code reads before it works: one `SKILL.md` file describing when to use it and how, plus optional reference docs and helper scripts it opens only when needed. Drop the folder into `.claude/skills/` inside a project — or `~/.claude/skills/` to make it available everywhere — and Claude picks it up automatically next session. No build step.

## Repository layout

```
skills/                       the four portable, general-purpose skills
  canvas-atelier/
  physics-2d/
  caveman/
  matrix-agents-skill/
.claude/skills/skill-report/  a project-scoped skill, dogfooded by this repo itself

site/                         documentation site SOURCE (edit here)
  index.html
  css/       tokens · base · layout · components · demos
  js/lib/    gfx (shading) · render3d (software 3D) · engine2d (physics)
  js/demos/  hero · atelier · physics · caveman · matrix · report
build-site.mjs                inlines site/ into the single-file index.html
index.html                    GENERATED — do not edit by hand
install.sh / install.ps1      interactive installers
```

### Working on the site

Edit files under `site/`, then rebuild the single-file page:

```sh
node build-site.mjs
```

`site/index.html` is the readable source with normal `<link>` and `<script src>`
tags; the root `index.html` is a generated bundle with all CSS and JS inlined.
Both are needed: the split version is what you edit, and the bundle is what gets
published, because a single self-contained document is the only form that
survives a strict CSP with no sibling files to fetch.

The demos are not decorative. The physics sandbox runs the same engine design
the `physics-2d` skill teaches — SAT with face clipping, a block solver for
two-point manifolds, split-impulse position correction, revolute joints and
island sleeping — and it is smoke-tested under Node:

```sh
node skills/physics-2d/scripts/selftest.js
```

Skills are plain text — read one before you trust it.
