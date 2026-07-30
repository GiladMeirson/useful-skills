# useful-skills

Five install-ready [Agent Skills](https://github.com/GiladMeirson/useful-skills) — canvas rendering, 2D physics, terse replies, self-improving sessions, and a transparency footer. Each one is a self-contained `SKILL.md` (plus, for some, reference docs and helper scripts).

They work in **[Claude Code](https://claude.com/claude-code)** and **[GitHub Copilot](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)** — same file format, different folder. Drop one in and the agent picks it up next session.

**Full docs, with live demos and a builder that writes your exact install command:** open [`index.html`](index.html) in a browser, or see the published version linked from this repo.

## The five skills

| Skill | What it does | Claude Code | Copilot |
|---|---|:--:|:--:|
| [`canvas-atelier`](skills/canvas-atelier) | Gallery-quality drawing & animation on HTML canvas — construction-based shapes, physically-based light/shadow, organic curves, animation-principle-driven motion. | full | full |
| [`physics-2d`](skills/physics-2d) | A small, tested 2D rigid-body physics engine — gravity, collisions, bouncing, friction, stacking, joints, raycasting, a deterministic fixed-timestep loop. | full | full |
| [`caveman`](skills/caveman) | Ultra-compressed responses — drops articles, filler, and hedging while keeping full technical accuracy. Frontmatter claims a measured ~65% token reduction. | full | full |
| [`matrix-agents-skill`](skills/matrix-agents-skill) | A meta-skill that watches a coding session for reusable knowledge and proposes turning it into a new skill. | full | adapted¹ |
| [`skill-report`](.claude/skills/skill-report) | A one-line transparency footer showing which skills/subagents/web tools ran on each turn. | full | best-effort² |

¹ Detects the host's skills directory and memory file at runtime. Copilot has no `AskUserQuestion` and no hooks, so the interview runs as plain chat and the `/forge` trigger word carries the weight — see [`references/host-agents.md`](skills/matrix-agents-skill/references/host-agents.md).

² The footer is portable; the *guarantee* is not. Its Stop hook reads the Claude Code transcript, and Copilot has no post-turn interception point — see [`references/github-copilot.md`](.claude/skills/skill-report/references/github-copilot.md).

## Install

### Guided (recommended)

Clone this repo once and run the installer with no arguments. It asks which skills, which agent, and which scope, then prints every resolved destination path and waits for confirmation before writing anything.

```sh
# macOS / Linux / WSL / Git Bash
./install.sh

# Windows PowerShell
.\install.ps1
```

Non-interactively:

```sh
./install.sh caveman                              # this project, Claude Code
./install.sh caveman --agent copilot              # this project, .github/skills
./install.sh caveman --agent both --global        # ~/.claude + ~/.copilot
./install.sh --all --agent both --yes             # everything
./install.sh caveman --dry-run                    # print paths, write nothing
```

```powershell
.\install.ps1 caveman
.\install.ps1 caveman -Agent copilot
.\install.ps1 caveman -Agent both -Global
.\install.ps1 -All -Agent both -Yes
.\install.ps1 caveman -DryRun
```

Both scripts wrap `npx degit` — no git clone under the hood, and nothing to maintain beyond Node.

### One line, no clone

```sh
npx degit GiladMeirson/useful-skills/skills/<skill-name> <destination>
```

Pick the destination for your agent and scope:

| Scope | Claude Code | GitHub Copilot |
|---|---|---|
| project | `.claude/skills/<name>` | `.github/skills/<name>` |
| global | `~/.claude/skills/<name>` | `~/.copilot/skills/<name>` |

"Global" means your user folder — on Windows, `C:\Users\<you>\.claude\skills\`. In PowerShell write `$HOME` instead of `~`.

For example:

```sh
npx degit GiladMeirson/useful-skills/skills/physics-2d .claude/skills/physics-2d
npx degit GiladMeirson/useful-skills/skills/physics-2d .github/skills/physics-2d
```

**Copilot also reads `.claude/skills/`.** So a repository that already has Claude Code skills needs no second copy for Copilot's coding agent, CLI, or agent mode in VS Code / Visual Studio / JetBrains. That is why a project-scoped "both" install writes one folder rather than two; pass `--separate` / `-Separate` if your team pins to `.github/skills/` and wants a literal second copy. Globally the two paths don't overlap, so the installer writes both.

### The one exception

`skill-report` already lives at `.claude/skills/skill-report` in this repo, so its *source* path is `.claude/skills/skill-report`, not `skills/skill-report`:

```sh
npx degit GiladMeirson/useful-skills/.claude/skills/skill-report .claude/skills/skill-report
```

It also needs its Stop hook merged into your project's `.claude/settings.json` — copying the folder alone is not enough. See [`index.html`](index.html#skill-report) or [`.claude/settings.json`](.claude/settings.json) for the exact JSON. Under Copilot there is no hook to register; add the standing instruction from [`references/github-copilot.md`](.claude/skills/skill-report/references/github-copilot.md) to `.github/copilot-instructions.md` instead.

## What's a skill?

A skill is a folder the agent reads before it works: one `SKILL.md` describing when to use it and how, plus optional reference docs and helper scripts it opens only when needed. No build step, no configuration, no runtime.

The format is shared. Claude Code reads `.claude/skills/`; GitHub Copilot reads `.github/skills/`, `.claude/skills/`, and `.agents/skills/`. Same YAML frontmatter (`name`, `description`), same Markdown body.

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
install.sh / install.ps1      guided installers
```

### Working on the site

Edit files under `site/`, then rebuild the single-file page:

```sh
node build-site.mjs
```

`site/index.html` is the readable source with normal `<link>` and `<script src>` tags; the root `index.html` is a generated bundle with all CSS and JS inlined. Both are needed: the split version is what you edit, and the bundle is what gets published, because a single self-contained document is the only form that survives a strict CSP with no sibling files to fetch.

The demos are not decorative. The physics sandbox runs the same engine design the `physics-2d` skill teaches — SAT with face clipping, a block solver for two-point manifolds, split-impulse position correction, revolute joints and island sleeping — and it is smoke-tested under Node:

```sh
node skills/physics-2d/scripts/selftest.js
```

Skills are plain text — read one before you trust it.
