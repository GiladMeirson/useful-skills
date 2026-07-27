"""Stop hook for the skill-report skill.

Reads the current turn's transcript, finds which Skill/Agent/WebSearch/WebFetch
tool calls the main assistant made since the last real user message, and forces
Claude to append a one-line "Skill report" footer if it isn't there yet.

Ground truth comes from the transcript, not from asking Claude to remember what
it did - that avoids hallucinated or stale skill names in the report.
"""
import sys
import json

MARKER = "**Skill report:**"


def load_entries(path):
    entries = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            for raw in f:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    entries.append(json.loads(raw))
                except json.JSONDecodeError:
                    continue
    except OSError:
        pass
    return entries


def is_user_turn_boundary(entry):
    """A genuine typed-by-the-human prompt.

    Claude Code also injects synthetic "user"-role messages for tool_result
    relays, skill bodies loaded via the Skill tool, and system-reminders -
    all marked isMeta:true or carrying a toolUseResult, never issued by the
    person. Those must not reset the turn boundary.
    """
    if entry.get("type") != "user":
        return False
    if entry.get("isMeta"):
        return False
    if "toolUseResult" in entry:
        return False
    content = entry.get("message", {}).get("content")
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "tool_result":
                return False
    return True


def fmt(names):
    return ", ".join(sorted(names)) if names else "none"


def allow():
    print(json.dumps({}))


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        allow()
        return

    transcript_path = payload.get("transcript_path")
    stop_hook_active = bool(payload.get("stop_hook_active"))

    if not transcript_path:
        allow()
        return

    entries = load_entries(transcript_path)
    if not entries:
        allow()
        return

    boundary = 0
    for i in range(len(entries) - 1, -1, -1):
        if is_user_turn_boundary(entries[i]):
            boundary = i
            break

    turn = entries[boundary + 1:]

    skills, subagents, web = set(), set(), set()
    has_reply = False

    for entry in turn:
        # Only the main thread's own tool calls count - not a subagent's internal steps.
        if entry.get("type") != "assistant" or entry.get("isSidechain"):
            continue
        content = entry.get("message", {}).get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if not isinstance(block, dict):
                continue
            btype = block.get("type")
            if btype == "text":
                text = block.get("text", "")
                if text.strip():
                    has_reply = True
                if MARKER in text:
                    # Already reported (Claude added it voluntarily) - nothing to force.
                    allow()
                    return
            elif btype == "tool_use":
                name = block.get("name")
                tool_input = block.get("input") or {}
                if name == "Skill":
                    skill_name = tool_input.get("skill")
                    if skill_name:
                        skills.add(skill_name)
                elif name == "Agent":
                    subagents.add(tool_input.get("subagent_type") or "general-purpose")
                elif name in ("WebSearch", "WebFetch"):
                    web.add(name)

    if not has_reply:
        # Nothing user-visible happened this turn (e.g. a Stop fired outside a
        # real reply, such as during compact/clear) - don't force a report onto it.
        allow()
        return

    if stop_hook_active:
        # We already forced one continuation for this turn; don't loop forever
        # if Claude didn't append the marker for some reason.
        allow()
        return

    report = f"{MARKER} Skills: {fmt(skills)} | Subagents: {fmt(subagents)} | Web: {fmt(web)}"
    reason = (
        "Append the following line to the very end of your last message, "
        "verbatim and with nothing else added, then stop:\n\n---\n" + report
    )
    print(json.dumps({"decision": "block", "reason": reason}))


if __name__ == "__main__":
    main()
