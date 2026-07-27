---
name: matrix-agents-skill
description: A meta-skill that turns every coding session into an opportunity to create new skills. Load this in EVERY session, regardless of language or stack (React, Angular, .NET, Java, HTML/CSS, games, scripts, SQL). It silently monitors the session for learning patterns — repeated fixes, regressions, costly exploration, architectural decisions, environment quirks — recording them in a session tally file after every completed task. When a threshold is crossed it emits a single one-line alert and keeps working. At the end of the session — or whenever the developer types any trigger word (/matrix-agents-skill, /forge, /matrix, forge, matrix, פורג', מטריקס, בדוק סקילים) — it proposes, runs a quick-or-deep interview via AskUserQuestion, and generates (or updates) a project skill via the skill-creator skill, then registers it in a skill routing map inside CLAUDE.md. ALWAYS activate on any trigger word. The machine that builds machines.
---

# Matrix Agents Skill

You are not just completing tasks in this session — you are also quietly watching for knowledge worth preserving. When a developer works with you, valuable knowledge is constantly created and lost: how a flow works, why a fix broke something else, what the project's design conventions are. Your job is to catch that knowledge at the right moment and turn it into a skill, so the next session starts smarter than this one.

This works in two phases: **silent tracking during the session** and **a single proposal at the end**. Never interrupt work mid-session to propose a skill.

## Phase 1: Silent pattern tracking (written, not mental)

Do not rely on memory — over a long session, attention decays and counts get lost. Instead, after **every completed task** in the session, silently append one line to a temporary tally file at `.claude/skills/matrix-agents-skill/session-tally.md` in the project root, matching against the pattern table below. Format:

```
- [task summary] → pattern #N (+1, total: X)
```

If no pattern matched, append nothing. Do not mention this tracking to the developer. Do not propose anything yet. Just record. Delete `session-tally.md` after the session's proposal step (Phase 2) completes, whether or not a skill was created.

| # | Pattern family | Signal | Threshold | Skill type it produces |
|---|---------------|--------|-----------|----------------------|
| 1 | **Repetition** | Same category of fix requested repeatedly (CSS tweaks, type errors, null checks) | 4+ in one session | *Capability skill*: project conventions for that category (design tokens, RTL rules, coding patterns) |
| 2 | **Repetition** | Developer corrects you on the same mistake | 2+ times | *Convention skill*: the rule you keep missing |
| 3 | **Repetition** | Developer pastes the same context/boilerplate they've clearly pasted before ("as I explained...", "again, our setup is...") | 1 clear instance | *Context skill*: that context, permanently |
| 4 | **Pain** | Regression chain: fixing A breaks B, fixing B breaks C | 2+ regressions | *Map skill*: dependency map of that file/module — what touches what, what not to touch blindly |
| 5 | **Pain** | You tried 3+ approaches before one worked | 1 instance | *Solution skill*: the working approach + why the others failed |
| 6 | **Pain** | A bug took a long time and the root cause was a recurring project quirk (timezone handling, encoding, legacy behavior) | 1 instance | *Gotcha skill*: the quirk, its symptoms, its fix |
| 7 | **Exploration** | You read 5+ files just to understand a flow before touching it | 1 instance | *Flow skill*: documentation of that flow (entry points, data path, key files) |
| 8 | **Exploration** | Developer manually explained architecture, business logic, or "why it's like this" history | 1 substantial explanation | *Knowledge skill*: that explanation, structured |
| 9 | **Decision** | An architectural or convention decision was made ("new services go in Clean Architecture", "error messages in Hebrew") | 1 decision | *Precedent skill*: the decision + rationale |
| 10 | **Decision** | A library/version/tool was chosen after comparison | 1 choice | *Rationale skill*: what was chosen and why alternatives were rejected |
| 11 | **Environment** | Context/tokens ballooned, or a tool was used suboptimally, or an environment limitation was discovered and worked around | 1 instance | *Environment skill*: the constraint and the workaround |

A pattern that crosses its threshold becomes a **candidate**. Multiple candidates can accumulate in one session.

## Mid-session alert (one line only)

The moment a pattern crosses its threshold **during** the session, emit exactly one line and immediately continue working:

> 🔨 Skill-worthy pattern detected ([pattern name]). I'll propose at session end — or type a trigger word now.

Never expand on it, never ask anything at this point, never emit it more than once per session. The developer stays in flow and decides when to engage.

## Phase 2: Proposal

**Trigger words** (all equivalent, case-insensitive): `/matrix-agents-skill` (Claude Code's native slash invocation), `/forge`, `/matrix`, `forge`, `matrix`, `פורג'`, `מטריקס`, `בדוק סקילים`. Any of these is a hard command: immediately read `.claude/skills/matrix-agents-skill/session-tally.md`, evaluate all candidates against the table, and either make a proposal or reply "no candidate crossed a threshold this session" with a one-line summary of the tally. Never ignore a trigger word.

The phase also activates **automatically** when the session's main work is complete (the developer signals wrap-up, thanks you, or the last task succeeded and nothing is pending). Recommend the developer make a trigger word a habit at the end of every session — automatic end-of-session detection is unreliable, and the manual trigger guarantees nothing valuable is lost.

When triggered, read the tally file and check your candidates.

**Restraint rules — these keep the skill from becoming annoying, which would kill it:**

- Propose **at most ONE candidate per session** — the strongest one. Strength order: Pain > Exploration > Decision > Repetition > Environment (pain-derived knowledge saves the most future time).
- Only propose if the resulting skill would save at least one full exploration or one regression next time. If in doubt, stay silent.
- Never propose a candidate whose topic appears in `.claude/skills/matrix-agents-skill/declined.md` (see below).
- If the developer says anything like "no suggestions today" / "quiet mode", stay silent for the entire session.
- If the session's work failed or was abandoned, propose nothing — unproven knowledge must not be preserved.

**The proposal format** (in the developer's language):

> "Before we wrap up: I noticed [pattern, with concrete numbers — e.g. 'we made 6 separate styling fixes' / 'fixing the sort broke the pagination, then the filter']. This suggests knowledge worth preserving as a skill so future sessions start with it. Want me to create one? (yes / update existing skill X instead / no)"

If the answer is no, append one line to `.claude/skills/matrix-agents-skill/declined.md` in the project root: `- [date] [topic] — declined`. Never propose that topic again unless the developer raises it.

## Phase 3: Interview before writing (consent gate)

The consent gate: **before** the developer says yes, you are limited to the one-line proposal above — nothing more. **After** yes, the gate opens and a real interrogation is not just allowed but required. A skill built from shallow answers will be shallow.

First, let the developer choose the depth: **Quick (4 questions)** or **Deep (full grill)**.

**Question UI**: use the `AskUserQuestion` tool for every interview question — present 2-4 predefined answer options plus the built-in free-text option. Never ask as a wall of open-ended text questions in plain chat.

**Quick interview (always asked, both modes):**

1. **Scoping**: "Is what I observed [the convention/flow/quirk] a project-wide standard, or specific to this page/module?" [Project-wide / This module only / Other]
2. **Anti-pattern check**: "Was anything we did here an exception that should NOT be learned as the rule?" [No, all standard / Yes: ___] — critical; without it you risk fossilizing a one-off hack as doctrine.
3. **Deduplication**: check the existing skills directory first; if a related skill exists: "Update skill X or create new?" [Update X / New skill]
4. **Trigger definition**: "When should a future agent activate this skill?" [When touching file/module Y / On task type Z / Other]

**Deep interview (grill mode) — add questions from this bank, choosing the ones the developer likely hasn't thought about:**

- **Failure mode**: "What's the most likely way an agent following this skill would still get it wrong?"
- **Edge cases**: "Are there cases where this rule/flow behaves differently (empty data, RTL, legacy path, permissions)?"
- **Blast radius**: "If an agent misapplies this skill, what's the worst thing that breaks?"
- **Audience**: "Will other developers/agents on the team use this, or is it personal? Does that change the wording?"
- **Verification**: "How will a future agent know it applied the skill correctly — is there a test, a visual check, a log?"
- **Expiry**: "What upcoming change (refactor, migration, new version) would make this skill wrong?"
- **Hidden dependency**: "Is there tribal knowledge this skill assumes — something obvious to you but not written anywhere?"

Ask deep questions in batches of 2-3, not all at once. Skip anything already answered by the session itself. Stop when answers start repeating — that's the signal you have enough.

## Phase 4: Generate the skill (delegate creation)

**If the `skill-creator` skill is installed** (Anthropic's reference skill from github.com/anthropics/skills), USE IT — do not hand-roll the file format. Your job is to feed it a complete, precise brief assembled from the session knowledge + interview answers: the skill's purpose, trigger conditions, the concrete knowledge (with real file/function names from this session), anti-patterns to exclude, and the metadata below. skill-creator owns the format; you own the content.

**Only if it is not installed**, write the file yourself using this structure:

```
<project>/.claude/skills/<skill-name>/SKILL.md
```

```markdown
---
name: <kebab-case-name>
description: <What it covers + when to trigger it. Be specific and slightly pushy about triggering: name the files, flows, or task types that should activate it.>
sources: <list of files/modules this knowledge was derived from>
verified: <today's date>
origin: matrix-agents-skill (session pattern: <which pattern from the table>)
---

# <Title>

<The knowledge, written for a future agent with zero context from this session:>
- For flow skills: entry points → data path → key files → side effects
- For map skills: dependency list ("X calls Y; changing Z affects W")
- For convention/capability skills: the rules, with a correct example and a violation example
- For gotcha skills: symptom → root cause → fix → how to detect it early
- For solution skills: the working approach, and a short "approaches that fail here and why" section
```

Rules for the generated skill:
- **Written for a stranger**: a future agent with no memory of this session must be able to use it. No "as we discussed".
- **Concise**: under 150 lines. Knowledge, not narrative.
- **Verifiable**: every factual claim about the code must reference a real file/function name from this session — never from your general assumptions.
- **Staleness guard**: the `sources` and `verified` fields are mandatory. Any future agent using a skill whose source files have since changed must re-verify before trusting it, and update `verified` after doing so.

After writing, show the developer the full skill for approval before considering it done. If they edit or reject parts, apply the changes.

## Phase 5: Register in the routing map (mandatory, every time)

A skill nobody routes to is a skill that doesn't exist. After **every** skill created or updated (including by other means), update the routing map — from the very first skill; never wait for some threshold.

The map lives inside the project's `CLAUDE.md` (the always-loaded memory file at the repository root; create it if missing). Maintain a clearly delimited block, one line per skill:

```markdown
<!-- SKILL ROUTING MAP — maintained by matrix-agents-skill, do not edit manually -->
## Skill routing
Before starting any task, check this map. If the task matches a trigger, load that skill first.
- Touching hotel details flow / V5 pipeline → `.claude/skills/hotel-details-flow/SKILL.md`
- Any CSS/styling work in this project → `.claude/skills/design-conventions/SKILL.md`
- Editing rides table JS (DataTables, timezones) → `.claude/skills/rides-table-map/SKILL.md`
<!-- END SKILL ROUTING MAP -->
```

Rules: one line per skill, format "trigger condition → path", touch only the delimited block, remove lines for deleted skills. The trigger condition comes from the interview's **Trigger definition** answer. This block is the router — it guarantees every future session knows what skills exist without loading any of them.

## Updating existing skills

When the interview points to updating an existing skill instead of creating one: read it fully first, merge the new knowledge into the right section, refresh `verified`, and show the developer a summary of what changed. Prefer updating over creating — a few deep skills beat many shallow ones.

## Recommended: deterministic enforcement via hooks (Claude Code advantage)

Skills are probabilistic — Claude may skip the tally or end-of-session check when deep in a task. Hooks are deterministic — they fire every time. Recommend the developer add this to `.claude/settings.json` (project) during installation; it makes Phases 1-2 guaranteed instead of best-effort:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "matrix-agents-skill check: if a task was just completed, append its pattern match (if any) to .claude/skills/matrix-agents-skill/session-tally.md per the skill's pattern table. If the developer appears to be wrapping up the session, run the skill's Phase 2 proposal now."
          }
        ]
      }
    ]
  }
}
```

With this hook installed, the trigger words become a convenience rather than a necessity — the Stop hook fires after every response, so the tally stays current and the end-of-session proposal cannot be forgotten. Without hooks, the skill still works via trigger words, exactly like the Copilot version.

## What this skill is NOT

- It does not replace the developer's judgment — the developer approves every skill created.
- It does not fire mid-task. Work first, learning capture last.
- It does not preserve failures, hacks explicitly marked as temporary, or knowledge from abandoned sessions.
- It does not create a skill when updating an existing one would do.