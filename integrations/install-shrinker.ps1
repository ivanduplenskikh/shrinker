param(
    [switch]$SkipNpmInstall,
    [switch]$SkipBuild,
    [switch]$SkipLink,
    [switch]$EnableProfileRouting,
    [switch]$SkipProfile,
    [switch]$SkipAgentRules,
    [switch]$CopilotOnly,
    [switch]$ClaudeOnly,
    [string]$ProfilePath = $PROFILE
)

$ErrorActionPreference = "Stop"

if ($EnableProfileRouting -and $SkipProfile) {
    throw "Use either -EnableProfileRouting or -SkipProfile, not both."
}
if ($CopilotOnly -and $ClaudeOnly) {
    throw "Use either -CopilotOnly or -ClaudeOnly, not both."
}

$blockStart = "<!-- shrinker agent rules start -->"
$blockEnd = "<!-- shrinker agent rules end -->"

function Set-AgentRules {
    param(
        [string]$RepoRoot,
        [string]$Body
    )

    $targets = @()
    if (-not $ClaudeOnly) { $targets += (Join-Path $RepoRoot ".copilot-instructions.md") }
    if (-not $CopilotOnly) { $targets += (Join-Path $RepoRoot "CLAUDE.md") }

    foreach ($target in $targets) {
        $content = if (Test-Path $target) { Get-Content -Path $target -Raw } else { "" }
        $newBlock = "$blockStart`n$Body`n$blockEnd"
        if ($content -and $content.Contains($blockStart) -and $content.Contains($blockEnd)) {
            $pattern = [regex]::Escape($blockStart) + ".*?" + [regex]::Escape($blockEnd)
            $content = [regex]::Replace($content, $pattern, $newBlock, [System.Text.RegularExpressions.RegexOptions]::Singleline)
            Set-Content -Path $target -Value $content
        } elseif ($content) {
            Add-Content -Path $target -Value "`n$newBlock`n"
        } else {
            Set-Content -Path $target -Value "$newBlock`n"
        }
        Write-Host "Installed managed rules in: $target"
    }
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

    $startMarker = "# >>> shrinker integration >>>"
    $endMarker = "# <<< shrinker integration <<<"

    $existing = Get-Content -Path $ProfileFile -Raw -ErrorAction SilentlyContinue
    if ($existing -and $existing.Contains($startMarker)) {
        Write-Host "Profile already contains shrinker integration block: $ProfileFile"
        return
    }

    $block = @"
$startMarker
. "$IntegrationFile"
$endMarker
"@

    Add-Content -Path $ProfileFile -Value "`n$block`n"
    Write-Host "Added shrinker integration block to profile: $ProfileFile"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$templatePath = Join-Path $scriptDir "..\templates\agent-rules.md"
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")
$integrationPath = (Resolve-Path (Join-Path $scriptDir "shrinker-profile.ps1")).Path

if (-not $SkipAgentRules) {
    if (-not (Test-Path $templatePath)) {
        throw "Agent rules template not found: $templatePath"
    }
    $rulesBody = Get-Content -Path $templatePath -Raw
}

Write-Host "Installing shrinker from: $repoRoot"
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
        Write-Host "To enable routing later: pwsh -ExecutionPolicy Bypass -File .\integrations\install-shrinker.ps1 -SkipNpmInstall -SkipBuild -SkipLink -EnableProfileRouting"
    }
}
else {
    Write-Host "Profile routing skipped via -SkipProfile. Native commands remain unchanged."
}

if (-not $SkipAgentRules) {
    Set-AgentRules -RepoRoot (Get-Location).Path -Body $rulesBody
}

Write-Host "Install complete. Try: shrinker help"
