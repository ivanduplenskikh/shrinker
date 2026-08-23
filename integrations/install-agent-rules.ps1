param(
    [string]$RepoRoot = (Get-Location).Path,
    [switch]$CopilotOnly,
    [switch]$ClaudeOnly
)

$ErrorActionPreference = "Stop"

$blockStart = "<!-- shrinker agent rules start -->"
$blockEnd = "<!-- shrinker agent rules end -->"
$templatePath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "..\templates\agent-rules.md"
if (-not (Test-Path $templatePath)) {
    throw "Agent rules template not found: $templatePath"
}

$rulesBody = Get-Content -Path $templatePath -Raw

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
