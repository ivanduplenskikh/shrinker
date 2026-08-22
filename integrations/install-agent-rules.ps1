param(
    [string]$RepoRoot = (Get-Location).Path,
    [switch]$CopilotOnly,
    [switch]$ClaudeOnly
)

$ErrorActionPreference = "Stop"

$blockStart = "<!-- >>> shrink agent rules >>> -->"
$blockEnd = "<!-- <<< shrink agent rules <<< -->"

$rulesBody = @'
Use `shrink` for high-volume terminal outputs to reduce tokens.

Routing policy:
- `git status|diff|log|show|reflog|branch|tag|stash` -> `shrink git ...`
- `npm test|t|install|i|ci|ls|list` -> `shrink npm ...`
- `docker ps|logs|images|compose` -> `shrink docker ...`
- `kubectl get|describe|logs` -> `shrink kubectl ...`
- `gh pr|issue|run` -> `shrink gh ...`
- `rg`, `find`, `tail`, `cat`, `ls`, `dir` -> `shrink <command> ...`

Bypass shrink when:
- command modifies remote state and output volume is already tiny
- command requires interactive stdin
- command explicitly needs raw full output (or use `shrink --raw ...`)

Examples:
- `shrink git log -n 20`
- `shrink rg "pattern" src`
- `shrink docker logs api --tail 500`
'@

function Set-ManagedBlock {
    param(
        [string]$Path,
        [string]$Body
    )

    $content = ""
    if (Test-Path $Path) {
      $content = Get-Content -Path $Path -Raw
    }

    $newBlock = "$blockStart`n$Body`n$blockEnd"

    if ($content -and $content.Contains($blockStart) -and $content.Contains($blockEnd)) {
        $pattern = [regex]::Escape($blockStart) + ".*?" + [regex]::Escape($blockEnd)
        $updated = [regex]::Replace($content, $pattern, $newBlock, [System.Text.RegularExpressions.RegexOptions]::Singleline)
        Set-Content -Path $Path -Value $updated
        Write-Host "Updated managed rules in: $Path"
        return
    }

    if (-not $content) {
        Set-Content -Path $Path -Value "$newBlock`n"
        Write-Host "Created rules file: $Path"
        return
    }

    Add-Content -Path $Path -Value "`n$newBlock`n"
    Write-Host "Appended managed rules to: $Path"
}

$targets = @()
if (-not $ClaudeOnly) {
    $targets += (Join-Path $RepoRoot ".copilot-instructions.md")
}
if (-not $CopilotOnly) {
    $targets += (Join-Path $RepoRoot "CLAUDE.md")
}

if ($targets.Count -eq 0) {
    throw "No target files selected."
}

foreach ($target in $targets) {
    Set-ManagedBlock -Path $target -Body $rulesBody
}

Write-Host "Agent rules install complete."
