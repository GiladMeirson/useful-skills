<#
.SYNOPSIS
  useful-skills installer for Windows PowerShell.
  https://github.com/GiladMeirson/useful-skills

.DESCRIPTION
  Fetches a single skill folder straight from GitHub into .claude\skills\
  (or wherever you point it), using `npx degit` under the hood -- no git
  clone, no extra dependency beyond Node/npx, which Claude Code already
  requires.

.PARAMETER Skill
  Name of the skill to install (canvas-atelier, physics-2d, caveman,
  matrix-agents-skill, skill-report). Omit for an interactive picker.

.PARAMETER Global
  Install to $HOME\.claude\skills instead of the current project's
  .claude\skills -- makes the skill available to every project.

.PARAMETER Dest
  Install into a custom destination folder instead.

.PARAMETER Force
  Overwrite an existing copy at the destination.

.PARAMETER ListSkills
  Print the available skills and exit.

.EXAMPLE
  .\install.ps1
.EXAMPLE
  .\install.ps1 physics-2d
.EXAMPLE
  .\install.ps1 caveman -Global
.EXAMPLE
  .\install.ps1 canvas-atelier -Dest C:\some\other\folder
.EXAMPLE
  irm https://raw.githubusercontent.com/GiladMeirson/useful-skills/main/install.ps1 -OutFile install.ps1; .\install.ps1 caveman
#>

param(
  [Parameter(Position = 0)]
  [string]$Skill,

  [switch]$Global,
  [string]$Dest,
  [switch]$Force,
  [switch]$ListSkills
)

$ErrorActionPreference = 'Stop'

$Repo = 'GiladMeirson/useful-skills'

$Skills = [ordered]@{
  'canvas-atelier'       = @{ Src = 'skills/canvas-atelier';               Desc = 'Gallery-quality drawing & animation on HTML canvas' }
  'physics-2d'           = @{ Src = 'skills/physics-2d';                   Desc = 'A small, tested 2D rigid-body physics engine' }
  'caveman'              = @{ Src = 'skills/caveman';                      Desc = 'Ultra-compressed responses, ~65% fewer tokens' }
  'matrix-agents-skill'  = @{ Src = 'skills/matrix-agents-skill';          Desc = 'Turns session learnings into new project skills' }
  'skill-report'         = @{ Src = '.claude/skills/skill-report';         Desc = 'Transparency footer: which skills/tools ran this turn' }
}

function Show-Skills {
  Write-Host "Available skills:"
  foreach ($name in $Skills.Keys) {
    "  {0,-22} {1}" -f $name, $Skills[$name].Desc | Write-Host
  }
}

function Assert-Npx {
  if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    Write-Error "npx not found. Claude Code requires Node.js, which ships npx -- install Node from https://nodejs.org and try again."
    exit 1
  }
}

function Install-OneSkill {
  param([string]$Name, [string]$Destination, [bool]$ForceCopy)

  if (-not $Skills.Contains($Name)) {
    Write-Error "unknown skill '$Name'."
    Show-Skills
    exit 1
  }

  Assert-Npx

  $src = $Skills[$Name].Src
  Write-Host "Installing " -NoNewline
  Write-Host $Name -ForegroundColor Yellow -NoNewline
  Write-Host " -> $Destination"

  $degitArgs = @('--yes', 'degit', "$Repo/$src", $Destination)
  if ($ForceCopy) { $degitArgs = @('--yes', 'degit', '--force', "$Repo/$src", $Destination) }

  & npx @degitArgs
  if ($LASTEXITCODE -ne 0) {
    Write-Error "degit failed (exit $LASTEXITCODE). If the destination already exists, retry with -Force."
    exit $LASTEXITCODE
  }

  Write-Host ""
  Write-Host "Done. " -ForegroundColor Green -NoNewline
  Write-Host "$Name is now at $Destination"
  Write-Host "Start (or restart) a Claude Code session in this project and it'll be picked up automatically."

  if ($Name -eq 'skill-report') {
    Write-Host ""
    Write-Host "Heads up: skill-report also needs its Stop hook registered in .claude/settings.json -"
    Write-Host "copying the folder alone isn't enough. Merge this in (or add a Stop entry if you"
    Write-Host "already have hooks configured):"
    Write-Host ''
    Write-Host '{'
    Write-Host '  "hooks": {'
    Write-Host '    "Stop": ['
    Write-Host '      { "hooks": [ { "type": "command",'
    Write-Host '        "command": "python \"$CLAUDE_PROJECT_DIR/.claude/skills/skill-report/scripts/report_hook.py\"",'
    Write-Host '        "timeout": 15 } ] }'
    Write-Host '    ]'
    Write-Host '  }'
    Write-Host '}'
  }
}

function Invoke-InteractivePicker {
  Write-Host "useful-skills" -ForegroundColor White -NoNewline
  Write-Host " - pick a skill to install:"
  Write-Host ""
  $names = @($Skills.Keys)
  for ($i = 0; $i -lt $names.Count; $i++) {
    "  {0,2}) {1,-22} {2}" -f ($i + 1), $names[$i], $Skills[$names[$i]].Desc | Write-Host
  }
  Write-Host ""
  $choice = Read-Host "Enter a number (1-$($names.Count))"
  $idx = 0
  if (-not [int]::TryParse($choice, [ref]$idx) -or $idx -lt 1 -or $idx -gt $names.Count) {
    Write-Error "not a valid choice."
    exit 1
  }
  $picked = $names[$idx - 1]

  $scope = Read-Host "Install for this project only, or every project on this machine? [p]roject / [g]lobal (default: project)"
  if ($scope -match '^(g|G)') {
    $destination = Join-Path $HOME ".claude/skills/$picked"
  } else {
    $destination = ".claude/skills/$picked"
  }

  Install-OneSkill -Name $picked -Destination $destination -ForceCopy $false
}

# ---------- entry point ----------
if ($ListSkills) {
  Show-Skills
  exit 0
}

if (-not $Skill) {
  Invoke-InteractivePicker
  exit 0
}

if (-not $Dest) {
  if ($Global) {
    $Dest = Join-Path $HOME ".claude/skills/$Skill"
  } else {
    $Dest = ".claude/skills/$Skill"
  }
}

Install-OneSkill -Name $Skill -Destination $Dest -ForceCopy $Force.IsPresent
