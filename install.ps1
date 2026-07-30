<#
.SYNOPSIS
  useful-skills installer for Windows PowerShell.
  https://github.com/GiladMeirson/useful-skills

.DESCRIPTION
  Fetches skill folders straight from GitHub into the right directory for the
  agent you actually use, using `npx degit` under the hood -- no git clone, no
  dependency beyond Node/npx.

  Run with no arguments and it asks three questions:

    1. which skill(s),
    2. which agent  -- Claude Code, GitHub Copilot, or both,
    3. which scope  -- this project only, or globally for your user account,

  then shows you the exact destination paths before it writes anything.

  Where skills live:

    agent           scope      destination
    --------------  ---------  ----------------------------------------
    Claude Code     project    .claude\skills\<name>
    Claude Code     global     <your user folder>\.claude\skills\<name>
    GitHub Copilot  project    .github\skills\<name>
    GitHub Copilot  global     <your user folder>\.copilot\skills\<name>

  Copilot also reads `.claude/skills`, so a project-scoped "both" install
  writes ONE copy to .claude\skills and both agents pick it up. Pass
  -Separate if you'd rather have a literal .github\skills copy as well.

.PARAMETER Skill
  Name of the skill to install (canvas-atelier, physics-2d, caveman,
  matrix-agents-skill, skill-report). Omit for an interactive picker.

.PARAMETER Agent
  claude | copilot | both. Which agent's directory layout to install into.
  Defaults to claude when a skill name is passed non-interactively.

.PARAMETER Global
  Install for your whole user account instead of just this project.

.PARAMETER Project
  Force project scope (the default) -- useful to be explicit in scripts.

.PARAMETER Separate
  With -Agent both -Project, also write a second copy to .github\skills
  instead of relying on Copilot reading .claude\skills.

.PARAMETER Dest
  Install into one explicit destination folder, ignoring -Agent and -Global.

.PARAMETER All
  Install every skill.

.PARAMETER Force
  Overwrite an existing copy at the destination.

.PARAMETER Yes
  Skip the final confirmation prompt.

.PARAMETER ListSkills
  Print the available skills and exit.

.EXAMPLE
  .\install.ps1
.EXAMPLE
  .\install.ps1 physics-2d
.EXAMPLE
  .\install.ps1 caveman -Agent copilot
.EXAMPLE
  .\install.ps1 caveman -Agent both -Global
.EXAMPLE
  .\install.ps1 -All -Agent claude -Global -Yes
.EXAMPLE
  irm https://raw.githubusercontent.com/GiladMeirson/useful-skills/main/install.ps1 -OutFile install.ps1; .\install.ps1
#>

[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$Skill,

  [ValidateSet('claude', 'copilot', 'both')]
  [string]$Agent,

  [switch]$Global,
  [switch]$Project,
  [switch]$Separate,
  [string]$Dest,
  [switch]$All,
  [switch]$Force,
  [switch]$Yes,
  [switch]$ListSkills
)

$ErrorActionPreference = 'Stop'

$Repo = 'GiladMeirson/useful-skills'

$Skills = [ordered]@{
  'canvas-atelier'      = @{ Src = 'skills/canvas-atelier';       Desc = 'Gallery-quality drawing & animation on HTML canvas'; Agents = 'both' }
  'physics-2d'          = @{ Src = 'skills/physics-2d';           Desc = 'A small, tested 2D rigid-body physics engine';        Agents = 'both' }
  'caveman'             = @{ Src = 'skills/caveman';              Desc = 'Ultra-compressed responses, ~65% fewer tokens';       Agents = 'both' }
  'matrix-agents-skill' = @{ Src = 'skills/matrix-agents-skill';  Desc = 'Turns session learnings into new project skills';     Agents = 'both' }
  'skill-report'        = @{ Src = '.claude/skills/skill-report'; Desc = 'Transparency footer: which skills/tools ran';         Agents = 'claude-best' }
}

# ---------------------------------------------------------------- helpers ----

function Write-Rule { Write-Host ('-' * 62) -ForegroundColor DarkGray }

# $ErrorActionPreference is Stop, so Write-Error throws a full exception -- fine
# for programmer errors, terrible for "you typed 9 and there are 5 options".
function Fail {
  param([string]$Message)
  Write-Host ""
  Write-Host "error: $Message" -ForegroundColor Red
  exit 1
}

function Write-Key {
  param([string]$Key, [string]$Value)
  Write-Host ("  {0,-14}" -f $Key) -ForegroundColor DarkGray -NoNewline
  Write-Host $Value
}

# On Windows $HOME is normally C:\Users\<you>, but it can be redirected (roaming
# profiles, OneDrive Known Folder Move). USERPROFILE is the value Claude Code and
# Copilot themselves resolve "~" against, so prefer it.
function Get-UserHome {
  if ($env:USERPROFILE -and (Test-Path -LiteralPath $env:USERPROFILE)) { return $env:USERPROFILE }
  if ($HOME) { return $HOME }
  return (Get-Location).Path
}

function Show-Skills {
  Write-Host "Available skills:" -ForegroundColor White
  foreach ($name in $Skills.Keys) {
    "  {0,-22} {1}" -f $name, $Skills[$name].Desc | Write-Host
  }
}

function Assert-Npx {
  if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    Fail "npx not found. Both Claude Code and GitHub Copilot CLI need Node.js, which ships npx -- install Node from https://nodejs.org and try again."
  }
}

<#
  Resolves the destination folder(s) for one skill given an agent and a scope.
  Returns an array of PSCustomObjects: @{ Agent; Path; Shared }
#>
function Resolve-Destinations {
  param(
    [string]$Name,
    [string]$ForAgent,   # claude | copilot | both
    [bool]$IsGlobal,
    [bool]$SeparateCopies
  )

  $home_ = Get-UserHome
  $out = New-Object System.Collections.Generic.List[object]

  $claudePath  = if ($IsGlobal) { Join-Path $home_ ".claude\skills\$Name" }  else { ".claude\skills\$Name" }
  $copilotPath = if ($IsGlobal) { Join-Path $home_ ".copilot\skills\$Name" } else { ".github\skills\$Name" }

  switch ($ForAgent) {
    'claude'  { $out.Add([pscustomobject]@{ Agent = 'Claude Code';    Path = $claudePath;  Shared = $false }) }
    'copilot' { $out.Add([pscustomobject]@{ Agent = 'GitHub Copilot'; Path = $copilotPath; Shared = $false }) }
    'both' {
      if (-not $IsGlobal -and -not $SeparateCopies) {
        # Copilot reads .claude/skills as a project skills directory, so one copy
        # serves both agents. Globally the two paths do not overlap.
        $out.Add([pscustomobject]@{ Agent = 'Claude Code + GitHub Copilot'; Path = $claudePath; Shared = $true })
      } else {
        $out.Add([pscustomobject]@{ Agent = 'Claude Code';    Path = $claudePath;  Shared = $false })
        $out.Add([pscustomobject]@{ Agent = 'GitHub Copilot'; Path = $copilotPath; Shared = $false })
      }
    }
  }
  return $out.ToArray()
}

function Invoke-Degit {
  param([string]$Name, [string]$Destination, [bool]$ForceCopy)

  $src = $Skills[$Name].Src
  $degitArgs = @('--yes', 'degit')
  if ($ForceCopy) { $degitArgs += '--force' }
  $degitArgs += @("$Repo/$src", $Destination)

  & npx @degitArgs
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Fail "degit failed (exit $LASTEXITCODE) for '$Name'. If the destination already exists, retry with -Force."
  }
}

function Show-PostInstallNotes {
  param([string[]]$Names, [string]$ForAgent, [bool]$IsGlobal)

  Write-Host ""
  Write-Rule
  if ($ForAgent -eq 'claude' -or $ForAgent -eq 'both') {
    Write-Host "Claude Code" -ForegroundColor Yellow -NoNewline
    Write-Host "     start (or restart) a session -- skills are read at session start."
  }
  if ($ForAgent -eq 'copilot' -or $ForAgent -eq 'both') {
    Write-Host "Copilot" -ForegroundColor Yellow -NoNewline
    Write-Host "        picked up by the coding agent, Copilot CLI, and agent mode in"
    Write-Host "               VS Code / Visual Studio / JetBrains. Commit the folder so"
    Write-Host "               your teammates and the cloud agent get it too."
  }

  if ($Names -contains 'skill-report') {
    Write-Host ""
    Write-Host "skill-report needs one extra step" -ForegroundColor Yellow
    if ($ForAgent -eq 'claude' -or $ForAgent -eq 'both') {
      Write-Host "  Claude Code: register its Stop hook in .claude/settings.json --"
      Write-Host "  copying the folder alone is not enough. Merge this in (or add a Stop"
      Write-Host "  entry if you already have hooks configured):"
      Write-Host ''
      Write-Host '  {'
      Write-Host '    "hooks": {'
      Write-Host '      "Stop": ['
      Write-Host '        { "hooks": [ { "type": "command",'
      Write-Host '          "command": "python \"$CLAUDE_PROJECT_DIR/.claude/skills/skill-report/scripts/report_hook.py\"",'
      Write-Host '          "timeout": 15 } ] }'
      Write-Host '      ]'
      Write-Host '    }'
      Write-Host '  }'
    }
    if ($ForAgent -eq 'copilot' -or $ForAgent -eq 'both') {
      Write-Host ''
      Write-Host "  GitHub Copilot has no Stop-hook equivalent, so the footer is"
      Write-Host "  best-effort there. Add the one-line reminder from the skill's"
      Write-Host "  references/github-copilot.md to .github/copilot-instructions.md."
    }
  }

  if ($Names -contains 'matrix-agents-skill' -and ($ForAgent -eq 'claude' -or $ForAgent -eq 'both')) {
    Write-Host ""
    Write-Host "matrix-agents-skill" -ForegroundColor Yellow -NoNewline
    Write-Host " works on trigger words alone, but a Stop hook makes its"
    Write-Host "  tally deterministic on Claude Code -- see the skill's own file."
  }

  Write-Host ""
  Write-Host "Read the SKILL.md before you trust it. Skills are plain text." -ForegroundColor DarkGray
}

function Install-Skills {
  param([string[]]$Names, [string]$ForAgent, [bool]$IsGlobal, [bool]$SeparateCopies, [bool]$ForceCopy, [bool]$SkipConfirm)

  Assert-Npx

  # ---- plan ----
  $plan = New-Object System.Collections.Generic.List[object]
  foreach ($n in $Names) {
    if (-not $Skills.Contains($n)) {
      Show-Skills
      Fail "unknown skill '$n'."
    }
    foreach ($d in (Resolve-Destinations -Name $n -ForAgent $ForAgent -IsGlobal $IsGlobal -SeparateCopies $SeparateCopies)) {
      $plan.Add([pscustomobject]@{ Name = $n; Agent = $d.Agent; Path = $d.Path; Shared = $d.Shared })
    }
  }

  Write-Host ""
  Write-Host "Plan" -ForegroundColor White
  Write-Rule
  foreach ($p in $plan) {
    Write-Host ("  {0,-22}" -f $p.Name) -ForegroundColor Yellow -NoNewline
    Write-Host ("-> {0}" -f $p.Path)
    Write-Host ("  {0,-22}   {1}" -f '', $p.Agent) -ForegroundColor DarkGray
  }
  if ($plan | Where-Object { $_.Shared }) {
    Write-Host ""
    Write-Host "  One copy serves both agents: Copilot reads .claude/skills as a" -ForegroundColor DarkGray
    Write-Host "  project skills directory. Use -Separate for a .github/skills copy too." -ForegroundColor DarkGray
  }
  Write-Rule

  if (-not $SkipConfirm) {
    $ok = Read-Host "Proceed? [Y/n]"
    if ($ok -and $ok -notmatch '^(y|Y)') { Write-Host "Cancelled."; exit 0 }
  }

  foreach ($p in $plan) {
    Write-Host ""
    Write-Host "Installing " -NoNewline
    Write-Host $p.Name -ForegroundColor Yellow -NoNewline
    Write-Host " -> $($p.Path)"
    Invoke-Degit -Name $p.Name -Destination $p.Path -ForceCopy $ForceCopy
  }

  Write-Host ""
  Write-Host "Done." -ForegroundColor Green -NoNewline
  Write-Host (" {0} skill folder(s) written." -f $plan.Count)
  Show-PostInstallNotes -Names $Names -ForAgent $ForAgent -IsGlobal $IsGlobal
}

# ------------------------------------------------------------ interactive ----

function Read-Choice {
  param([string]$Prompt, [string[]]$Options, [int]$DefaultIndex = 0)

  Write-Host ""
  Write-Host $Prompt -ForegroundColor White
  for ($i = 0; $i -lt $Options.Count; $i++) {
    $marker = if ($i -eq $DefaultIndex) { '*' } else { ' ' }
    "   {0} {1}) {2}" -f $marker, ($i + 1), $Options[$i] | Write-Host
  }
  $raw = Read-Host ("   choice [{0}]" -f ($DefaultIndex + 1))
  if (-not $raw) { return $DefaultIndex }
  $idx = 0
  if (-not [int]::TryParse($raw.Trim(), [ref]$idx) -or $idx -lt 1 -or $idx -gt $Options.Count) {
    Fail "'$raw' is not one of 1-$($Options.Count)."
  }
  return $idx - 1
}

function Invoke-InteractiveInstall {
  $names = @($Skills.Keys)

  Write-Host ""
  Write-Host "useful-skills" -ForegroundColor White -NoNewline
  Write-Host "  ->  agent skills for Claude Code and GitHub Copilot"
  Write-Rule
  Write-Host ""
  Write-Host "Which skill(s)?" -ForegroundColor White
  for ($i = 0; $i -lt $names.Count; $i++) {
    "   {0,2}) {1,-22} {2}" -f ($i + 1), $names[$i], $Skills[$names[$i]].Desc | Write-Host
  }
  Write-Host "   all) everything"
  $raw = Read-Host "   choice (e.g. 1  or  1,3  or  all)"
  if (-not $raw) { Write-Error "nothing selected."; exit 1 }

  $picked = New-Object System.Collections.Generic.List[string]
  if ($raw.Trim().ToLower() -eq 'all') {
    $picked.AddRange([string[]]$names)
  } else {
    foreach ($tok in ($raw -split '[,\s]+' | Where-Object { $_ })) {
      $idx = 0
      if (-not [int]::TryParse($tok, [ref]$idx) -or $idx -lt 1 -or $idx -gt $names.Count) {
        Fail "'$tok' is not one of 1-$($names.Count), or 'all'."
      }
      if (-not $picked.Contains($names[$idx - 1])) { $picked.Add($names[$idx - 1]) }
    }
  }
  if ($picked.Count -eq 0) { Write-Error "nothing selected."; exit 1 }

  # ---- agent ----
  $agentIdx = Read-Choice -Prompt "Which agent will use it?" -Options @(
    'Claude Code            (.claude/skills)',
    'GitHub Copilot         (.github/skills, ~/.copilot/skills)',
    'Both                   (one install that serves each)'
  ) -DefaultIndex 0
  $chosenAgent = @('claude', 'copilot', 'both')[$agentIdx]

  if ($picked -contains 'skill-report' -and $chosenAgent -ne 'claude') {
    Write-Host ""
    Write-Host "  note: skill-report's enforcement is a Claude Code Stop hook." -ForegroundColor DarkYellow
    Write-Host "        On Copilot the footer still works, but best-effort only." -ForegroundColor DarkYellow
  }

  # ---- scope ----
  $home_ = Get-UserHome
  $scopeIdx = Read-Choice -Prompt "Install for this project, or for your whole user account?" -Options @(
    ("This project only     ({0})" -f (Get-Location).Path),
    ("Globally, every project  ({0})" -f $home_)
  ) -DefaultIndex 0
  $isGlobal = ($scopeIdx -eq 1)

  $separate = $false
  if ($chosenAgent -eq 'both' -and -not $isGlobal) {
    $sepIdx = Read-Choice -Prompt "Project + both agents: one shared folder, or a copy per agent?" -Options @(
      'One folder  .claude/skills          (Copilot reads it too)',
      'Two copies  .claude/skills + .github/skills'
    ) -DefaultIndex 0
    $separate = ($sepIdx -eq 1)
  }

  Install-Skills -Names $picked.ToArray() -ForAgent $chosenAgent -IsGlobal $isGlobal `
                 -SeparateCopies $separate -ForceCopy $Force.IsPresent -SkipConfirm $Yes.IsPresent
}

# ----------------------------------------------------------- entry point -----

if ($ListSkills) { Show-Skills; exit 0 }

if ($Global -and $Project) {
  Write-Error "-Global and -Project are mutually exclusive."
  exit 1
}

# Explicit single destination wins over everything else.
if ($Dest) {
  if (-not $Skill) { Write-Error "-Dest needs a skill name."; exit 1 }
  if (-not $Skills.Contains($Skill)) { Write-Error "unknown skill '$Skill'."; Show-Skills; exit 1 }
  Assert-Npx
  Write-Host "Installing " -NoNewline
  Write-Host $Skill -ForegroundColor Yellow -NoNewline
  Write-Host " -> $Dest"
  Invoke-Degit -Name $Skill -Destination $Dest -ForceCopy $Force.IsPresent
  Write-Host ""
  Write-Host "Done." -ForegroundColor Green
  exit 0
}

if (-not $Skill -and -not $All) {
  Invoke-InteractiveInstall
  exit 0
}

$targets = if ($All) { @($Skills.Keys) } else { @($Skill) }
$agentChoice = if ($Agent) { $Agent } else { 'claude' }

Install-Skills -Names $targets -ForAgent $agentChoice -IsGlobal $Global.IsPresent `
               -SeparateCopies $Separate.IsPresent -ForceCopy $Force.IsPresent `
               -SkipConfirm ($Yes.IsPresent -or -not $All)
