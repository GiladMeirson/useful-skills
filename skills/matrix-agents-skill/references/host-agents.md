# Host adaptation — where things live, per agent

This skill writes files, reads a skills directory, and registers a routing map.
All three are host-specific. Resolve them **once, at the start of the session**,
by looking at what actually exists on disk — never assume Claude Code.

## Detection order

1. Look at the directory this `SKILL.md` was loaded from. Its parent is the
   skills directory you should write new skills into.
   - `…/.claude/skills/matrix-agents-skill/` → skills dir is `.claude/skills/`
   - `…/.github/skills/matrix-agents-skill/` → skills dir is `.github/skills/`
   - `…/.agents/skills/…`, `~/.copilot/skills/…` → likewise
2. If that's ambiguous, check which of these exist in the repository root, in
   order: `.claude/skills/`, `.github/skills/`, `.agents/skills/`.
3. Still ambiguous → check for a memory file: `CLAUDE.md` implies Claude Code,
   `.github/copilot-instructions.md` implies Copilot, `AGENTS.md` is neutral.
4. Nothing at all → ask the developer once, then proceed.

## The mapping

| Concern | Claude Code | GitHub Copilot | Neutral fallback |
|---|---|---|---|
| Project skills directory | `.claude/skills/` | `.github/skills/` | `.agents/skills/` |
| Personal skills directory | `~/.claude/skills/` | `~/.copilot/skills/` | `~/.agents/skills/` |
| Always-loaded memory file | `CLAUDE.md` | `.github/copilot-instructions.md` | `AGENTS.md` |
| Session state written by this skill | `<skills-dir>/matrix-agents-skill/session-tally.md` | same | same |
| Declined topics | `<skills-dir>/matrix-agents-skill/declined.md` | same | same |
| Structured questions | `AskUserQuestion` tool | no equivalent — ask one numbered multiple-choice question per message | numbered list |
| Slash invocation | `/matrix-agents-skill` (skills are slash-invocable) | `.github/prompts/forge.prompt.md`, then `/forge` | plain trigger words |
| Deterministic end-of-turn enforcement | `Stop` hook in `.claude/settings.json` | none — no hook system; use a standing line in `copilot-instructions.md` | none |
| Delegating skill authoring | Anthropic's `skill-creator` skill if installed | same skill works — the format is shared | write it yourself |

Both agents read the same `SKILL.md` format (YAML frontmatter with `name` and
`description`, then Markdown), so a skill written for one is loadable by the
other without translation. Copilot additionally reads `.claude/skills/`, which
is why a repo that already has Claude Code skills needs no second copy.

## What changes in practice

**On Copilot**, three things degrade and you must compensate:

1. **No hooks.** Phase 1's per-task tally and Phase 2's end-of-session proposal
   have no deterministic trigger. Lean harder on the trigger words, and say so
   explicitly the first time you propose anything: "type `/forge` at the end of
   a session — I can't reliably detect wrap-up on my own here."
2. **No `AskUserQuestion`.** The interview has to run as plain chat. Keep the
   discipline anyway: one question per message, 2–4 concrete options offered
   inline as `[a] … [b] … [c] other`, never a wall of open questions.
3. **The memory file is `.github/copilot-instructions.md`.** It is loaded into
   every Copilot request the same way `CLAUDE.md` is, so the routing map belongs
   there. If the repo has both that file and `CLAUDE.md`, write the map into
   both — teams commonly run both agents against one repository.

**On Claude Code**, everything above is available; prefer the strong version of
each (the `Stop` hook, `AskUserQuestion`, `/matrix-agents-skill`).

## Registering a Copilot prompt file (optional, once)

Copilot has no native slash command for skills. To get `/forge`, drop this at
`.github/prompts/forge.prompt.md`:

```markdown
---
description: Run matrix-agents-skill's end-of-session skill proposal.
---
Read the matrix-agents-skill SKILL.md, then run its Phase 2 proposal against
this session: evaluate the tally, rank candidates, and propose at most one.
```

Then `/forge` works in Copilot Chat exactly as it does in Claude Code.
