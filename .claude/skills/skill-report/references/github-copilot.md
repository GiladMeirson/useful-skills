# Running skill-report under GitHub Copilot

The footer itself is host-neutral — it is just a line of text at the end of a
reply. What is **not** portable is the enforcement: `scripts/report_hook.py` is a
Claude Code `Stop` hook, and Copilot has no hook system at all. Read this before
installing so the difference is a choice rather than a surprise.

## What you get on each host

| | Claude Code | GitHub Copilot |
|---|---|---|
| Footer appears | **guaranteed** — a Stop hook checks every turn and forces a continuation if missing | best-effort — the model appends it because it was told to |
| Contents derived from | the session transcript (ground truth) | the model's own recollection of the turn |
| Extra install step | register the hook in `.claude/settings.json` | add a standing line to `.github/copilot-instructions.md` |

The second row is the one that matters. On Claude Code the hook parses the real
`tool_use` blocks, so the report cannot name a skill that did not run. On Copilot
the model is reporting on itself, which is exactly the failure mode the hook was
built to avoid. Treat the Copilot footer as a useful habit, not as an audit
trail — and if a turn's report looks wrong there, believe the transcript, not the
footer.

## Install

```sh
npx degit GiladMeirson/useful-skills/.claude/skills/skill-report .github/skills/skill-report
```

`scripts/report_hook.py` comes along with the folder. It is inert under Copilot —
nothing invokes it — so you can delete it, or leave it in place for teammates who
run Claude Code against the same repository.

## The standing instruction

Copilot loads `.github/copilot-instructions.md` into every request. Add:

```markdown
## Skill report

End every reply with this line, after a `---` rule, even when all three are
`none`:

**Skill report:** Skills: <names> | Subagents: <types> | Web: <tools>

Count only skills you actually loaded, subagents you actually delegated to, and
WebSearch/WebFetch you actually called, this turn. Routine file and shell tools
are deliberately excluded. If you are unsure whether something ran, leave it out
— an under-reported footer is recoverable, an invented one is not.
```

Keep it short. A long instruction block competes for the same context as
everything else Copilot loads on every request, and the whole value of this skill
is one line.

## Why there is no Copilot hook to write

Copilot's customization surface is instructions, prompt files, chat modes, and
custom agents — all of which shape what the model is *asked* to do. None of them
run code after a response, and none can inspect the finished turn and reject it.
That is a real architectural difference, not a gap waiting on a flag: without a
post-turn interception point, "unconditional" is not achievable, only "very
likely".

If your team needs the guarantee, run the skill under Claude Code. If you want
the transparency habit across both, install it in both and accept that one is
enforced and one is asked for.
