param(
    [switch]$SkipUnlink,
    [switch]$SkipAgentRules,
    [switch]$CopilotOnly,
    [switch]$ClaudeOnly,
    [string]$ProfilePath = $PROFILE
)

$ErrorActionPreference = "Stop"

if ($CopilotOnly -and $ClaudeOnly) {
    throw "Use either -CopilotOnly or -ClaudeOnly, not both."
}

$blockStart = "<!-- shrinker agent rules start -->"
$blockEnd = "<!-- shrinker agent rules end -->"

function Remove-AgentRules {
    param([string]$Path)

    if (-not (Test-Path $Path)) { return }
    $content = Get-Content -Path $Path -Raw
    if (-not ($content.Contains($blockStart) -and $content.Contains($blockEnd))) { return }
    $pattern = [regex]::Escape($blockStart) + ".*?" + [regex]::Escape($blockEnd)
    Set-Content -Path $Path -Value ([regex]::Replace($content, $pattern, "", [System.Text.RegularExpressions.RegexOptions]::Singleline).TrimEnd() + "`n")
    Write-Host "Removed managed rules from: $Path"
}

function Remove-ProfileIntegration {
    param([string]$ProfileFile)

    if (-not (Test-Path $ProfileFile)) {
        Write-Host "Profile not found: $ProfileFile"
        return
    }

    $startMarker = "# >>> shrink integration >>>"
    $endMarker = "# <<< shrink integration <<<"
    $content = Get-Content -Path $ProfileFile -Raw
    if ($null -eq $content -or $content.Length -eq 0) {
        Write-Host "Profile is empty; nothing to remove."
        return
    }

    $start = $content.IndexOf($startMarker)
    if ($start -lt 0) {
        Write-Host "No shrink integration block found in profile."
        return
    }

    $end = $content.IndexOf($endMarker, $start)
    if ($end -lt 0) {
        Write-Host "Integration block start found but end marker is missing; leaving profile unchanged."
        return
    }

    $end += $endMarker.Length
    $updated = $content.Remove($start, $end - $start)
    Set-Content -Path $ProfileFile -Value $updated
    Write-Host "Removed shrink integration block from: $ProfileFile"
}

if (-not $SkipUnlink) {
    Write-Host "Running npm unlink -g shrinker..."
    & npm unlink -g shrinker
    if ($LASTEXITCODE -ne 0) {
        throw "npm unlink failed with exit code $LASTEXITCODE"
    }
}

Remove-ProfileIntegration -ProfileFile $ProfilePath
Write-Host "If this terminal previously loaded shrink-profile.ps1, restart terminal or remove Function:git/Function:rg wrappers from current session."

if (-not $SkipAgentRules) {
    if (-not $ClaudeOnly) { Remove-AgentRules -Path (Join-Path (Get-Location).Path ".copilot-instructions.md") }
    if (-not $CopilotOnly) { Remove-AgentRules -Path (Join-Path (Get-Location).Path "CLAUDE.md") }
}

Write-Host "Uninstall complete."
