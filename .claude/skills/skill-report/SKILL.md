---
name: skill-report
description: Documents and formats the "Skill report" footer that gets appended to the end of every response in this project, showing which Skills, subagents, and web tools (WebSearch/WebFetch) were actually used to answer - even when the answer is "none". Consult this whenever the user asks what skills/tools were used this turn, asks how the skill-report mechanism works, wants the report format changed, or wants to debug why a report is missing or wrong. Always applicable, every turn - a companion Stop hook enforces the report automatically, but proactively appending it yourself in the exact format below (when you're confident which Skill/Agent/WebSearch/WebFetch calls you actually made) saves an extra round-trip.
---

# Skill Report

A one-line transparency footer, appended to the end of every response in this project, listing which Skills, subagents, and web tools were actually invoked to produce that response.

## Host support

| Host | Footer | Enforcement |
|---|---|---|
| Claude Code | guaranteed | `Stop` hook reads the transcript and forces a continuation if the marker is missing |
| GitHub Copilot | best-effort | none available — Copilot has no post-turn hook; use a standing line in `.github/copilot-instructions.md` |

Under Copilot the contents come from the model's own recollection rather than
from the transcript, which is precisely what the hook exists to avoid — so the
footer is a habit there, not an audit trail. Setup, the exact instruction block
to paste, and why no Copilot equivalent can exist: `references/github-copilot.md`.

## Why this needs a hook, not just a skill

Skills normally trigger at Claude's discretion, matched against their description - there's no way for a SKILL.md alone to guarantee it fires on literally every turn, especially simple ones. To make the report unconditional, this skill is paired with a Stop hook (`scripts/report_hook.py`, registered in `.claude/settings.json`) that runs after every response and checks the transcript for the exact marker text below. If it's missing, the hook forces one more continuation asking you to append it - so the report is guaranteed even if this skill never gets consulted on its own.

The hook computes the skill/subagent/tool list from the transcript itself (ground truth), not from asking you to recall what you did - so if you want to append the report proactively yourself (skipping the hook's extra round-trip), only report tools you can actually confirm you called this turn. If you're not sure, it's fine to leave it out and let the hook fill it in.

## Format

Always the same shape, always present, one line, at the very end of your message:

```
---
**Skill report:** Skills: <name, name> | Subagents: <type, type> | Web: <tool, tool>
```

Use `none` for any category with nothing to report - including all three, e.g. on a turn where you just answered a question directly:

```
---
**Skill report:** Skills: none | Subagents: none | Web: none
```

- **Skills** - names passed to the `Skill` tool this turn (e.g. `dataviz`, `skill-creator`).
- **Subagents** - `subagent_type` values passed to the `Agent` tool this turn (e.g. `Explore`, `general-purpose`).
- **Web** - `WebSearch` and/or `WebFetch` if called this turn.

Routine tools (Read, Edit, Bash, Grep, Glob, TodoWrite, etc.) are deliberately left out - they're used on nearly every turn and would make the report noise instead of signal. The point is surfacing *delegated* capabilities: skills, subagents, and outside-the-sandbox web access.

## Scope

The report covers the current turn only - everything since the last message the person actually typed. Tool results, skill bodies loaded into context, and system-reminders are not new turns, even though they're technically recorded with a "user" role in the transcript; only what the human actually sent counts as a new turn boundary.
