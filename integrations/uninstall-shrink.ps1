param(
    [switch]$SkipUnlink,
    [string]$ProfilePath = $PROFILE
)

$ErrorActionPreference = "Stop"

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
Write-Host "Uninstall complete."
