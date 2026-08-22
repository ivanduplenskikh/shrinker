param(
    [string]$RepoRoot = (Get-Location).Path,
    [switch]$CopilotOnly,
    [switch]$ClaudeOnly
)

$ErrorActionPreference = "Stop"

$blockStart = "<!-- >>> shrink agent rules >>> -->"
$blockEnd = "<!-- <<< shrink agent rules <<< -->"

function Remove-ManagedBlock {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        Write-Host "File not found, skipping: $Path"
        return
    }

    $content = Get-Content -Path $Path -Raw
    if (-not $content) {
        Write-Host "File is empty, skipping: $Path"
        return
    }

    if (-not ($content.Contains($blockStart) -and $content.Contains($blockEnd))) {
        Write-Host "No managed rules block found, skipping: $Path"
        return
    }

    $pattern = [regex]::Escape($blockStart) + ".*?" + [regex]::Escape($blockEnd)
    $updated = [regex]::Replace($content, $pattern, "", [System.Text.RegularExpressions.RegexOptions]::Singleline)
    Set-Content -Path $Path -Value $updated.TrimEnd() + "`n"
    Write-Host "Removed managed rules from: $Path"
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
    Remove-ManagedBlock -Path $target
}

Write-Host "Agent rules uninstall complete."
