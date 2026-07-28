#!/usr/bin/env bash
# useful-skills installer
# https://github.com/GiladMeirson/useful-skills
#
# Fetches a single skill folder straight from GitHub into .claude/skills/
# (or wherever you point it), using `npx degit` under the hood — no git
# clone, no extra dependency beyond Node/npx, which Claude Code already
# requires.
#
# Usage:
#   ./install.sh                          interactive picker
#   ./install.sh <skill-name>             install into this project
#   ./install.sh <skill-name> --global    install for every project (~/.claude/skills)
#   ./install.sh <skill-name> --dest DIR  install into a custom folder
#   ./install.sh <skill-name> --force     overwrite an existing copy
#   ./install.sh --list                   print available skills and exit
#
# Can also be run without cloning the repo first:
#   curl -fsSL https://raw.githubusercontent.com/GiladMeirson/useful-skills/main/install.sh | bash -s -- <skill-name>

set -euo pipefail

REPO="GiladMeirson/useful-skills"

# name|source-subpath-in-repo|one-line description
SKILLS="canvas-atelier|skills/canvas-atelier|Gallery-quality drawing & animation on HTML canvas
physics-2d|skills/physics-2d|A small, tested 2D rigid-body physics engine
caveman|skills/caveman|Ultra-compressed responses, ~65% fewer tokens
matrix-agents-skill|skills/matrix-agents-skill|Turns session learnings into new project skills
skill-report|.claude/skills/skill-report|Transparency footer: which skills/tools ran this turn"

bold() { printf '\033[1m%s\033[0m' "$1"; }
dim()  { printf '\033[2m%s\033[0m' "$1"; }
accent() { printf '\033[38;5;179m%s\033[0m' "$1"; }

list_skills() {
  echo "Available skills:"
  echo "$SKILLS" | while IFS='|' read -r name src desc; do
    printf "  %-22s %s\n" "$name" "$desc"
  done
}

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
}

skill_source() {
  # echoes the repo subpath for a given skill name, or nothing if unknown
  echo "$SKILLS" | while IFS='|' read -r name src desc; do
    if [ "$name" = "$1" ]; then echo "$src"; fi
  done
}

require_npx() {
  if ! command -v npx >/dev/null 2>&1; then
    echo "error: npx not found. Claude Code requires Node.js, which ships npx — install Node from https://nodejs.org and try again." >&2
    exit 1
  fi
}

install_skill() {
  local name="$1" dest="$2" force="$3"
  local src
  src="$(skill_source "$name")"
  if [ -z "$src" ]; then
    echo "error: unknown skill '$name'." >&2
    list_skills >&2
    exit 1
  fi

  require_npx

  local args=(--yes degit "$REPO/$src" "$dest")
  if [ "$force" = "1" ]; then args=(--yes degit --force "$REPO/$src" "$dest"); fi

  echo "Installing $(accent "$name") → $dest"
  npx "${args[@]}"

  echo ""
  echo "$(bold "Done.") $name is now at $dest"
  echo "Start (or restart) a Claude Code session in this project and it'll be picked up automatically."

  if [ "$name" = "skill-report" ]; then
    cat <<'EOF'

Heads up: skill-report also needs its Stop hook registered in .claude/settings.json —
copying the folder alone isn't enough. Merge this in (or add a Stop entry if you
already have hooks configured):

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
}

interactive_pick() {
  echo "$(bold "useful-skills") — pick a skill to install:"
  echo ""
  local names=() descs=()
  local i=1
  while IFS='|' read -r name src desc; do
    names+=("$name"); descs+=("$desc")
    printf "  %2d) %-22s %s\n" "$i" "$name" "$desc"
    i=$((i+1))
  done <<< "$SKILLS"
  echo ""
  printf "Enter a number (1-%d): " "${#names[@]}"
  read -r choice
  if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "${#names[@]}" ]; then
    echo "error: not a valid choice." >&2
    exit 1
  fi
  local picked="${names[$((choice-1))]}"

  printf "Install for this project only, or every project on this machine? [p]roject / [g]lobal (default: project): "
  read -r scope
  local dest=".claude/skills/$picked"
  if [ "${scope:-p}" = "g" ] || [ "${scope:-p}" = "G" ]; then
    dest="$HOME/.claude/skills/$picked"
  fi

  install_skill "$picked" "$dest" 0
}

# ---------- arg parsing ----------
if [ "${1:-}" = "--list" ] || [ "${1:-}" = "-l" ]; then
  list_skills
  exit 0
fi
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

if [ $# -eq 0 ]; then
  interactive_pick
  exit 0
fi

SKILL_NAME="$1"; shift
DEST=".claude/skills/$SKILL_NAME"
FORCE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --global) DEST="$HOME/.claude/skills/$SKILL_NAME" ;;
    --dest) shift; DEST="${1:-$DEST}" ;;
    --force) FORCE=1 ;;
    *) echo "error: unknown option '$1'" >&2; usage; exit 1 ;;
  esac
  shift
done

install_skill "$SKILL_NAME" "$DEST" "$FORCE"
