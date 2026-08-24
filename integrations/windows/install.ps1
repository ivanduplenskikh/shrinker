param(
    [switch]$Local,
    [string]$PackageName = "shrinker-ai",
    [string]$Registry = "https://registry.npmjs.org",
    [string]$Version,
    [switch]$SkipNpmInstall,
    [switch]$SkipBuild,
    [switch]$SkipLink,
    [switch]$EnableProfileRouting,
    [switch]$SkipProfile,
    [switch]$SkipAgentRules,
    [switch]$CopilotOnly,
    [switch]$ClaudeOnly,
    [switch]$EnableUncoveredTracking,
    [switch]$DisableUncoveredTracking,
    [string]$ProfilePath = $PROFILE,
    [string]$ConfigPath = $(if ($env:SHRINKER_CONFIG_PATH) { $env:SHRINKER_CONFIG_PATH } else { Join-Path $HOME ".shrinker/config" }),
    [int]$StepOffset = 0
)

$ErrorActionPreference = "Stop"
$InstallStep = $StepOffset

function Write-InstallStep {
    param([string]$Emoji, [string]$Message)
    $script:InstallStep++
    Write-Host "$($script:InstallStep). $Emoji $Message"
}

if ($EnableProfileRouting -and $SkipProfile) { throw "Use either -EnableProfileRouting or -SkipProfile, not both." }
if ($CopilotOnly -and $ClaudeOnly) { throw "Use either -CopilotOnly or -ClaudeOnly, not both." }
if ($EnableUncoveredTracking -and $DisableUncoveredTracking) { throw "Use either -EnableUncoveredTracking or -DisableUncoveredTracking, not both." }

# Prompt only on a real console; non-interactive installs keep tracking on and leave the profile alone.
$IsInteractive = -not [System.Console]::IsInputRedirected -and $Host.UI.RawUI -ne $null

function Read-YesNo {
    param([string]$Question, [bool]$Default)
    $hint = if ($Default) { "[Y/n]" } else { "[y/N]" }
    $reply = (Read-Host "   $Question $hint").Trim().ToLowerInvariant()
    switch ($reply) {
        { $_ -in @("y", "yes") } { return $true }
        { $_ -in @("n", "no") } { return $false }
        default { return $Default }
    }
}

if ($EnableUncoveredTracking) { $TrackUncovered = $true }
elseif ($DisableUncoveredTracking) { $TrackUncovered = $false }
elseif ($IsInteractive) {
    Write-InstallStep "❓" "Track uncovered commands? Records which unfiltered commands cost the most tokens."
    $TrackUncovered = Read-YesNo "Enable uncovered-command tracking?" $true
}
else { $TrackUncovered = $true }

if ($IsInteractive -and -not $SkipProfile -and -not $EnableProfileRouting) {
    Write-InstallStep "❓" "Route wrapped commands through shrinker automatically? Adds a line to $ProfilePath."
    $EnableProfileRouting = Read-YesNo "Enable automatic shell routing?" $false
}

function Set-ConfigValue {
    param([string]$Key, [string]$Value)
    $directory = Split-Path -Parent $ConfigPath
    if ($directory -and -not (Test-Path -LiteralPath $directory)) { New-Item -ItemType Directory -Force -Path $directory | Out-Null }
    $lines = @()
    if (Test-Path -LiteralPath $ConfigPath) {
        $lines = @(Get-Content -LiteralPath $ConfigPath | Where-Object { $_ -notmatch "^\s*$Key\s*=" })
    }
    $lines += "$Key=$Value"
    Set-Content -LiteralPath $ConfigPath -Value $lines -Encoding utf8
    Write-InstallStep "⚙️" "Set $Key=$Value in: $ConfigPath"
}

function Set-AgentRules {
    param([string]$Body)
    $start = "<!-- shrinker agent rules start -->"
    $end = "<!-- shrinker agent rules end -->"
    foreach ($target in @((Join-Path $HOME ".copilot\copilot-instructions.md"), (Join-Path $HOME ".claude\CLAUDE.md"))) {
        if ($ClaudeOnly -and $target.EndsWith(".copilot-instructions.md")) { continue }
        if ($CopilotOnly -and $target.EndsWith("CLAUDE.md")) { continue }
        New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
        $content = if (Test-Path $target) { Get-Content $target -Raw } else { "" }
        $block = "$start`n$Body`n$end"
        if ($null -ne $content -and $content.Contains($start) -and $content.Contains($end)) {
            $content = [regex]::Replace($content, [regex]::Escape($start) + ".*?" + [regex]::Escape($end), $block, 'Singleline')
            Set-Content $target $content
        } elseif ($content) { Add-Content $target "`n$block`n" }
        else { Set-Content $target "$block`n" }
        Write-InstallStep "📄" "Installed managed rules in: $target"
    }
}

function Add-ProfileIntegration {
    param([string]$ProfileFile, [string]$IntegrationFile)
    if (-not (Test-Path $ProfileFile)) { New-Item -ItemType File -Path $ProfileFile -Force | Out-Null }
    $start = "# >>> shrinker integration >>>"
    if ((Get-Content $ProfileFile -Raw).Contains($start)) { return }
    Add-Content $ProfileFile "`n$start`n. `"$IntegrationFile`"`n# <<< shrinker integration <<<`n"
    Write-InstallStep "🔧" "Added shrinker integration block to profile: $ProfileFile"
}

if (-not $Local) {
    $packageSpec = if ($Version) { "$PackageName@$Version" } else { $PackageName }
    Write-InstallStep "📦" "Installing $packageSpec from $Registry..."
    & npm install --silent --global $packageSpec "--registry=$Registry"
    if ($LASTEXITCODE -ne 0) { throw "npm package installation failed." }
    Write-InstallStep "🔎" "Locating the installed package..."
    $globalRoot = (& npm root --global).Trim()
    if (-not $globalRoot) { throw "Could not determine the global npm package directory." }
    $packageRoot = Join-Path $globalRoot ($PackageName -replace '/', '\')
    $entrypoint = Join-Path $packageRoot "integrations\windows\install.ps1"
    if (-not (Test-Path $entrypoint)) { throw "Installed package installer not found: $entrypoint" }
    Write-InstallStep "⚙️" "Configuring the installed package..."
    & pwsh -ExecutionPolicy Bypass -File $entrypoint -Local -SkipNpmInstall -SkipBuild -SkipLink -EnableProfileRouting:$EnableProfileRouting -SkipProfile:$SkipProfile -SkipAgentRules:$SkipAgentRules -CopilotOnly:$CopilotOnly -ClaudeOnly:$ClaudeOnly -EnableUncoveredTracking:$TrackUncovered -DisableUncoveredTracking:(-not $TrackUncovered) -ProfilePath $ProfilePath -ConfigPath $ConfigPath -StepOffset $InstallStep
    if ($LASTEXITCODE -ne 0) { throw "Repository installer failed with exit code $LASTEXITCODE" }
    return
}

$scriptDir = $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$templatePath = Join-Path $repoRoot "templates\agent-rules.md"
$integrationPath = (Resolve-Path (Join-Path $scriptDir "shrinker-profile.ps1")).Path
if (-not $SkipAgentRules) {
    if (-not (Test-Path $templatePath)) { throw "Agent rules template not found: $templatePath" }
    $rulesBody = Get-Content $templatePath -Raw
}

$versionText = & node -v 2>$null
if (-not $versionText) { throw "Node.js was not found on PATH. Install Node.js 22.13+ first." }
$version = [version]($versionText.TrimStart('v'))
if ($version -lt [version]'22.13.0') { throw "Node.js 22.13+ is required. Found $versionText" }

Push-Location $repoRoot
try {
    Write-InstallStep "📦" "Installing shrinker from: $repoRoot"
    if (-not $SkipNpmInstall) {
        Write-InstallStep "📥" "Installing dependencies..."
        & npm install --silent
        if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
    }
    if (-not $SkipBuild) {
        Write-InstallStep "🏗️" "Building shrinker..."
        & npm run build --silent
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed." }
    }
    if (-not $SkipLink) {
        Write-InstallStep "🔗" "Linking shrinker globally..."
        & npm link --silent
        if ($LASTEXITCODE -ne 0) { throw "npm link failed." }
    }
} finally { Pop-Location }

Set-ConfigValue "SHRINKER_TRACK_UNCOVERED" $(if ($TrackUncovered) { "1" } else { "0" })
if (-not $SkipProfile -and $EnableProfileRouting) { Add-ProfileIntegration $ProfilePath $integrationPath }
if (-not $SkipAgentRules) { Set-AgentRules $rulesBody }
Write-InstallStep "✅" "Install complete."
Write-Host " "
Write-Host "💡 Try: shrinker help"
