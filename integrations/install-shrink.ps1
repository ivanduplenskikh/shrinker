param(
    [switch]$SkipNpmInstall,
    [switch]$SkipBuild,
    [switch]$SkipLink,
    [switch]$EnableProfileRouting,
    [switch]$SkipProfile,
    [string]$ProfilePath = $PROFILE
)

$ErrorActionPreference = "Stop"

if ($EnableProfileRouting -and $SkipProfile) {
    throw "Use either -EnableProfileRouting or -SkipProfile, not both."
}

function Test-NodeVersion {
    $versionText = & node -v 2>$null
    if (-not $versionText) {
        throw "Node.js was not found on PATH. Install Node.js 22.13+ first."
    }

    $match = [regex]::Match($versionText, "^v(\d+)\.(\d+)\.(\d+)$")
    if (-not $match.Success) {
        throw "Could not parse Node.js version: $versionText"
    }

    $major = [int]$match.Groups[1].Value
    $minor = [int]$match.Groups[2].Value
    $patch = [int]$match.Groups[3].Value

    if ($major -lt 22 -or ($major -eq 22 -and $minor -lt 13)) {
        throw "Node.js 22.13+ is required. Found $versionText"
    }

    return $versionText
}

function Add-ProfileIntegration {
    param(
        [string]$ProfileFile,
        [string]$IntegrationFile
    )

    if (-not (Test-Path $ProfileFile)) {
        New-Item -ItemType File -Path $ProfileFile -Force | Out-Null
    }

    $startMarker = "# >>> shrink integration >>>"
    $endMarker = "# <<< shrink integration <<<"

    $existing = Get-Content -Path $ProfileFile -Raw -ErrorAction SilentlyContinue
    if ($existing -and $existing.Contains($startMarker)) {
        Write-Host "Profile already contains shrink integration block: $ProfileFile"
        return
    }

    $block = @"
$startMarker
. "$IntegrationFile"
$endMarker
"@

    Add-Content -Path $ProfileFile -Value "`n$block`n"
    Write-Host "Added shrink integration block to profile: $ProfileFile"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")
$integrationPath = (Resolve-Path (Join-Path $scriptDir "shrink-profile.ps1")).Path

Write-Host "Installing shrink from: $repoRoot"
$nodeVersion = Test-NodeVersion
Write-Host "Detected Node.js: $nodeVersion"

Push-Location $repoRoot
try {
    if (-not $SkipNpmInstall) {
        Write-Host "Running npm install..."
        & npm install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE"
        }
    }

    if (-not $SkipBuild) {
        Write-Host "Running npm run build..."
        & npm run build --silent
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build failed with exit code $LASTEXITCODE"
        }
    }

    if (-not $SkipLink) {
        Write-Host "Running npm link..."
        & npm link
        if ($LASTEXITCODE -ne 0) {
            throw "npm link failed with exit code $LASTEXITCODE"
        }
    }
}
finally {
    Pop-Location
}

if (-not $SkipProfile) {
    if ($EnableProfileRouting) {
        Add-ProfileIntegration -ProfileFile $ProfilePath -IntegrationFile $integrationPath
        Write-Host "Reload your profile with: . `$PROFILE"
    }
    else {
        Write-Host "Profile routing not enabled (default). Native commands remain unchanged."
        Write-Host "To enable routing later: pwsh -ExecutionPolicy Bypass -File .\integrations\install-shrink.ps1 -SkipNpmInstall -SkipBuild -SkipLink -EnableProfileRouting"
    }
}
else {
    Write-Host "Profile routing skipped via -SkipProfile. Native commands remain unchanged."
}

Write-Host "Install complete. Try: shrink help"
