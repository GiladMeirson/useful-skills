#!/usr/bin/env bash
# useful-skills installer  —  https://github.com/GiladMeirson/useful-skills
#
# Fetches skill folders straight from GitHub into the right directory for the
# agent you actually use, via `npx degit` — no git clone, no dependency beyond
# Node/npx.
#
# Run with no arguments for the guided install; see --help for flags.

set -eo pipefail

REPO="GiladMeirson/useful-skills"

# name|source-subpath-in-repo|one-line description
SKILLS="canvas-atelier|skills/canvas-atelier|Gallery-quality drawing & animation on HTML canvas
physics-2d|skills/physics-2d|A small, tested 2D rigid-body physics engine
caveman|skills/caveman|Ultra-compressed responses, ~65% fewer tokens
matrix-agents-skill|skills/matrix-agents-skill|Turns session learnings into new project skills
skill-report|.claude/skills/skill-report|Transparency footer: which skills/tools ran"

usage() {
  cat <<'EOF'
useful-skills — agent skills for Claude Code and GitHub Copilot

  ./install.sh                                interactive: skill, agent, scope
  ./install.sh <skill>                        project scope, Claude Code
  ./install.sh <skill> --agent copilot        project scope, .github/skills
  ./install.sh <skill> --agent both --global  ~/.claude + ~/.copilot
  ./install.sh --all --agent both --yes       every skill, no prompts
  ./install.sh <skill> --dest DIR             one explicit folder
  ./install.sh <skill> --dry-run              print paths, write nothing
  ./install.sh --list                         available skills

Options
  --agent claude|copilot|both   which agent's layout to install into (default: claude)
  --claude | --copilot | --both shorthand for the above
  --global, -g                  install for your whole user account
  --project                     install for this project only (default)
  --separate                    with --agent both --project, also write .github/skills
  --all, -a                     every skill
  --dest DIR                    one explicit destination, ignoring agent/scope
  --force, -f                   overwrite an existing copy
  --dry-run, -n                 resolve and print paths, write nothing
  --yes, -y                     skip the confirmation prompt
  --list, -l                    print available skills and exit

Where skills live
  agent           scope     destination
  --------------  --------  -----------------------
  Claude Code     project   .claude/skills/<name>
  Claude Code     global    ~/.claude/skills/<name>
  GitHub Copilot  project   .github/skills/<name>
  GitHub Copilot  global    ~/.copilot/skills/<name>

Copilot also reads .claude/skills, so a project-scoped "both" install writes ONE
copy there and both agents pick it up. Use --separate for a .github/skills copy
as well.

Without cloning the repo first:
  curl -fsSL https://raw.githubusercontent.com/GiladMeirson/useful-skills/main/install.sh -o install.sh && bash install.sh
EOF
}

# ------------------------------------------------------------------ output ---
if [ -t 1 ]; then
  B=$'\033[1m'; D=$'\033[2m'; A=$'\033[38;5;209m'; R=$'\033[38;5;203m'; G=$'\033[38;5;114m'; X=$'\033[0m'
else
  B=""; D=""; A=""; R=""; G=""; X=""
fi
bold()   { printf '%s%s%s' "$B" "$1" "$X"; }
accent() { printf '%s%s%s' "$A" "$1" "$X"; }
rule()   { printf '%s--------------------------------------------------------------%s\n' "$D" "$X"; }
die()    { printf '\n%serror:%s %s\n' "$R" "$X" "$1" >&2; exit 1; }

# ------------------------------------------------------------------- state ---
AGENT=""          # claude | copilot | both
SCOPE="project"   # project | global
SEPARATE=0
FORCE=0
DRYRUN=0
ASSUME_YES=0
EXPLICIT_DEST=""
PICKED=()

# Git Bash / WSL under Windows: $HOME is the profile dir, which is what both
# agents resolve "~" against. USERPROFILE is the fallback if HOME is unset.
user_home() {
  if [ -n "$HOME" ]; then printf '%s' "$HOME"
  elif [ -n "$USERPROFILE" ]; then printf '%s' "$USERPROFILE"
  else printf '.'
  fi
}

list_skills() {
  echo "Available skills:"
  while IFS='|' read -r name src desc; do
    printf "  %-22s %s\n" "$name" "$desc"
  done <<< "$SKILLS"
}

skill_source() {
  while IFS='|' read -r name src desc; do
    if [ "$name" = "$1" ]; then printf '%s' "$src"; fi
  done <<< "$SKILLS"
}

skill_desc() {
  while IFS='|' read -r name src desc; do
    if [ "$name" = "$1" ]; then printf '%s' "$desc"; fi
  done <<< "$SKILLS"
}

skill_names() {
  while IFS='|' read -r name src desc; do printf '%s\n' "$name"; done <<< "$SKILLS"
}

picked_has() {
  local p
  for p in ${PICKED[@]+"${PICKED[@]}"}; do
    if [ "$p" = "$1" ]; then return 0; fi
  done
  return 1
}

# Reads one line of input. Prefers /dev/tty so `curl … | bash` still gets the
# user's keyboard rather than the remaining bytes of the script, but falls back
# to stdin where there is no controlling terminal (CI, containers, tests).
# `[ -r /dev/tty ]` is not enough — the node exists in containers where opening
# it fails with ENXIO, so probe with a real open before committing to it.
read_line() {
  local v=""
  if { : </dev/tty; } 2>/dev/null; then
    read -r v </dev/tty || v=""
  else
    read -r v || v=""
  fi
  printf '%s' "$v"
}

require_npx() {
  if ! command -v npx >/dev/null 2>&1; then
    die "npx not found. Claude Code and GitHub Copilot CLI both need Node.js, which ships npx — install Node from https://nodejs.org and try again."
  fi
}

# Emits "agent-label<TAB>path<TAB>shared" lines for one skill.
resolve_destinations() {
  local name="$1" home_dir claude_path copilot_path
  home_dir="$(user_home)"

  if [ "$SCOPE" = "global" ]; then
    claude_path="$home_dir/.claude/skills/$name"
    copilot_path="$home_dir/.copilot/skills/$name"
  else
    claude_path=".claude/skills/$name"
    copilot_path=".github/skills/$name"
  fi

  case "$AGENT" in
    claude)  printf 'Claude Code\t%s\t0\n' "$claude_path" ;;
    copilot) printf 'GitHub Copilot\t%s\t0\n' "$copilot_path" ;;
    both)
      if [ "$SCOPE" = "project" ] && [ "$SEPARATE" -eq 0 ]; then
        printf 'Claude Code + GitHub Copilot\t%s\t1\n' "$claude_path"
      else
        printf 'Claude Code\t%s\t0\n' "$claude_path"
        printf 'GitHub Copilot\t%s\t0\n' "$copilot_path"
      fi
      ;;
  esac
}

post_install_notes() {
  echo ""
  rule
  if [ "$AGENT" = "claude" ] || [ "$AGENT" = "both" ]; then
    printf '%sClaude Code%s     start (or restart) a session — skills are read at session start.\n' "$A" "$X"
  fi
  if [ "$AGENT" = "copilot" ] || [ "$AGENT" = "both" ]; then
    printf '%sCopilot%s         picked up by the coding agent, Copilot CLI, and agent mode in\n' "$A" "$X"
    echo   "                VS Code / Visual Studio / JetBrains. Commit the folder"
    echo   "                so teammates and the cloud agent get it too."
  fi

  if picked_has skill-report; then
    echo ""
    printf '%sskill-report needs one extra step%s\n' "$A" "$X"
    if [ "$AGENT" = "claude" ] || [ "$AGENT" = "both" ]; then
      cat <<'EOF'
  Claude Code: register its Stop hook in .claude/settings.json — copying the
  folder alone is not enough. Merge this in (or add a Stop entry if you already
  have hooks configured):

  {
    "hooks": {
      "Stop": [
        { "hooks": [ { "type": "command",
          "command": "python \"$CLAUDE_PROJECT_DIR/.claude/skills/skill-report/scripts/report_hook.py\"",
          "timeout": 15 } ] }
      ]
    }
  }
EOF
    fi
    if [ "$AGENT" = "copilot" ] || [ "$AGENT" = "both" ]; then
      cat <<'EOF'

  GitHub Copilot has no Stop-hook equivalent, so the footer is best-effort
  there. Add the one-line reminder from the skill's references/github-copilot.md
  to .github/copilot-instructions.md.
EOF
    fi
  fi

  if picked_has matrix-agents-skill; then
    if [ "$AGENT" = "claude" ] || [ "$AGENT" = "both" ]; then
      echo ""
      printf '%smatrix-agents-skill%s works on trigger words alone, but a Stop hook makes\n' "$A" "$X"
      echo   "  its tally deterministic on Claude Code — see the skill's own file."
    fi
  fi

  echo ""
  printf '%sRead the SKILL.md before you trust it. Skills are plain text.%s\n' "$D" "$X"
}

do_install() {
  local plan=() name line label path shared any_shared=0 ok args

  if [ "${#PICKED[@]}" -eq 0 ]; then die "nothing selected."; fi

  for name in "${PICKED[@]}"; do
    if [ -z "$(skill_source "$name")" ]; then list_skills >&2; die "unknown skill '$name'."; fi
    while IFS= read -r line; do
      plan+=("$name"$'\t'"$line")
    done < <(resolve_destinations "$name")
  done

  echo ""
  bold "Plan"; echo ""
  rule
  for line in "${plan[@]}"; do
    IFS=$'\t' read -r name label path shared <<< "$line"
    printf '  %s%-22s%s -> %s\n' "$A" "$name" "$X" "$path"
    printf '  %s%-22s    %s%s\n' "$D" "" "$label" "$X"
    if [ "$shared" = "1" ]; then any_shared=1; fi
  done
  if [ "$any_shared" -eq 1 ]; then
    echo ""
    printf '%s  One copy serves both agents: Copilot reads .claude/skills as a project%s\n' "$D" "$X"
    printf '%s  skills directory. Use --separate for a .github/skills copy too.%s\n' "$D" "$X"
  fi
  rule

  if [ "$DRYRUN" -eq 1 ]; then
    echo ""
    printf '%s--dry-run: nothing written.%s\n' "$D" "$X"
    post_install_notes
    return 0
  fi

  require_npx

  if [ "$ASSUME_YES" -eq 0 ]; then
    printf 'Proceed? [Y/n] '
    ok="$(read_line)"
    case "${ok:-y}" in
      y|Y|yes|YES) ;;
      *) echo "Cancelled."; exit 0 ;;
    esac
  fi

  for line in "${plan[@]}"; do
    IFS=$'\t' read -r name label path shared <<< "$line"
    echo ""
    printf 'Installing %s → %s\n' "$(accent "$name")" "$path"
    args=(--yes degit)
    if [ "$FORCE" -eq 1 ]; then args+=(--force); fi
    args+=("$REPO/$(skill_source "$name")" "$path")
    npx "${args[@]}" || die "degit failed for '$name'. If the destination already exists, retry with --force."
  done

  echo ""
  printf '%sDone.%s %d skill folder(s) written.\n' "$G" "$X" "${#plan[@]}"
  post_install_notes
}

# ------------------------------------------------------------- interactive ---
# Prompts on stderr, answer (1-based index) on stdout.
ask_choice() {
  local prompt="$1" default="$2"; shift 2
  local opts=("$@") i raw
  {
    echo ""
    bold "$prompt"; echo ""
    for i in "${!opts[@]}"; do
      if [ "$((i+1))" = "$default" ]; then
        printf '   * %d) %s\n' "$((i+1))" "${opts[$i]}"
      else
        printf '     %d) %s\n' "$((i+1))" "${opts[$i]}"
      fi
    done
    printf '   choice [%s]: ' "$default"
  } >&2
  raw="$(read_line)"
  raw="${raw:-$default}"
  case "$raw" in
    ''|*[!0-9]*) die "'$raw' is not one of 1-${#opts[@]}." ;;
  esac
  if [ "$raw" -lt 1 ] || [ "$raw" -gt "${#opts[@]}" ]; then
    die "'$raw' is not one of 1-${#opts[@]}."
  fi
  printf '%s' "$raw"
}

interactive() {
  local names=() i raw tok idx line

  while IFS= read -r line; do names+=("$line"); done < <(skill_names)

  echo ""
  printf '%s  ->  agent skills for Claude Code and GitHub Copilot\n' "$(bold useful-skills)"
  rule
  echo ""
  bold "Which skill(s)?"; echo ""
  for i in "${!names[@]}"; do
    printf '   %2d) %-22s %s\n' "$((i+1))" "${names[$i]}" "$(skill_desc "${names[$i]}")"
  done
  echo "  all) everything"
  printf '   choice (e.g. 1  or  1,3  or  all): '
  raw="$(read_line)"
  if [ -z "$raw" ]; then die "nothing selected."; fi

  if [ "$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')" = "all" ]; then
    PICKED=("${names[@]}")
  else
    for tok in $(printf '%s' "$raw" | tr ',' ' '); do
      case "$tok" in
        ''|*[!0-9]*) die "'$tok' is not one of 1-${#names[@]}, or 'all'." ;;
      esac
      if [ "$tok" -lt 1 ] || [ "$tok" -gt "${#names[@]}" ]; then
        die "'$tok' is not one of 1-${#names[@]}, or 'all'."
      fi
      idx=$((tok-1))
      if ! picked_has "${names[$idx]}"; then PICKED+=("${names[$idx]}"); fi
    done
  fi
  if [ "${#PICKED[@]}" -eq 0 ]; then die "nothing selected."; fi

  case "$(ask_choice "Which agent will use it?" 1 \
      'Claude Code            (.claude/skills)' \
      'GitHub Copilot         (.github/skills, ~/.copilot/skills)' \
      'Both                   (one install that serves each)')" in
    1) AGENT="claude" ;;
    2) AGENT="copilot" ;;
    3) AGENT="both" ;;
  esac

  if [ "$AGENT" != "claude" ] && picked_has skill-report; then
    echo ""
    echo "  note: skill-report's enforcement is a Claude Code Stop hook."
    echo "        On Copilot the footer still works, but best-effort only."
  fi

  case "$(ask_choice "Install for this project, or for your whole user account?" 1 \
      "This project only        ($(pwd))" \
      "Globally, every project  ($(user_home))")" in
    1) SCOPE="project" ;;
    2) SCOPE="global" ;;
  esac

  if [ "$AGENT" = "both" ] && [ "$SCOPE" = "project" ]; then
    case "$(ask_choice "Project + both agents: one shared folder, or a copy per agent?" 1 \
        'One folder  .claude/skills          (Copilot reads it too)' \
        'Two copies  .claude/skills + .github/skills')" in
      1) SEPARATE=0 ;;
      2) SEPARATE=1 ;;
    esac
  fi

  do_install
}

# ------------------------------------------------------------ arg parsing ----
case "${1:-}" in
  --list|-l) list_skills; exit 0 ;;
  --help|-h) usage; exit 0 ;;
esac

if [ $# -eq 0 ]; then
  interactive
  exit 0
fi

# A leading positional that isn't a flag is the skill name.
if [ "${1#-}" = "$1" ]; then
  PICKED=("$1"); shift
fi

while [ $# -gt 0 ]; do
  case "$1" in
    --agent)      shift; AGENT="${1:-}" ;;
    --agent=*)    AGENT="${1#*=}" ;;
    --claude)     AGENT="claude" ;;
    --copilot)    AGENT="copilot" ;;
    --both)       AGENT="both" ;;
    --global|-g)  SCOPE="global" ;;
    --project)    SCOPE="project" ;;
    --separate)   SEPARATE=1 ;;
    --all|-a)     PICKED=(); while IFS= read -r line; do PICKED+=("$line"); done < <(skill_names) ;;
    --dest)       shift; EXPLICIT_DEST="${1:-}" ;;
    --dest=*)     EXPLICIT_DEST="${1#*=}" ;;
    --force|-f)   FORCE=1 ;;
    --dry-run|-n) DRYRUN=1 ;;
    --yes|-y)     ASSUME_YES=1 ;;
    --list|-l)    list_skills; exit 0 ;;
    --help|-h)    usage; exit 0 ;;
    *)            die "unknown option '$1' — see --help." ;;
  esac
  shift
done

if [ -z "$AGENT" ]; then AGENT="claude"; fi
case "$AGENT" in
  claude|copilot|both) ;;
  *) die "--agent must be one of: claude, copilot, both (got '$AGENT')." ;;
esac

# An explicit --dest bypasses agent/scope resolution entirely.
if [ -n "$EXPLICIT_DEST" ]; then
  if [ "${#PICKED[@]}" -ne 1 ]; then die "--dest takes exactly one skill name."; fi
  if [ -z "$(skill_source "${PICKED[0]}")" ]; then list_skills >&2; die "unknown skill '${PICKED[0]}'."; fi
  if [ "$DRYRUN" -eq 1 ]; then
    printf '\n  %-22s -> %s\n\n--dry-run: nothing written.\n' "${PICKED[0]}" "$EXPLICIT_DEST"
    exit 0
  fi
  require_npx
  printf 'Installing %s → %s\n' "$(accent "${PICKED[0]}")" "$EXPLICIT_DEST"
  DEST_ARGS=(--yes degit)
  if [ "$FORCE" -eq 1 ]; then DEST_ARGS+=(--force); fi
  DEST_ARGS+=("$REPO/$(skill_source "${PICKED[0]}")" "$EXPLICIT_DEST")
  npx "${DEST_ARGS[@]}" || die "degit failed. If the destination already exists, retry with --force."
  printf '\n%sDone.%s\n' "$G" "$X"
  exit 0
fi

# Flags but no skill name (e.g. `--dry-run`, `--agent copilot`) still means
# "ask me" — the flags just pre-answer nothing, since the picker sets its own.
if [ "${#PICKED[@]}" -eq 0 ]; then
  interactive
  exit 0
fi

# A single explicitly named skill doesn't need a confirmation round-trip.
if [ "${#PICKED[@]}" -le 1 ]; then ASSUME_YES=1; fi

do_install
