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
    [string]$ProfilePath = $PROFILE
)

$ErrorActionPreference = "Stop"
$InstallStep = 0

function Write-InstallStep {
    param([string]$Emoji, [string]$Message)
    $script:InstallStep++
    Write-Host "$($script:InstallStep). $Emoji $Message"
}

if ($EnableProfileRouting -and $SkipProfile) { throw "Use either -EnableProfileRouting or -SkipProfile, not both." }
if ($CopilotOnly -and $ClaudeOnly) { throw "Use either -CopilotOnly or -ClaudeOnly, not both." }

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
    $globalRoot = (& npm root --global).Trim()
    if (-not $globalRoot) { throw "Could not determine the global npm package directory." }
    $entrypoint = Join-Path $globalRoot ($PackageName -replace '/', '\')
    $entrypoint = Join-Path $entrypoint "integrations\windows\install.ps1"
    if (-not (Test-Path $entrypoint)) { throw "Installed package installer not found: $entrypoint" }
    & pwsh -ExecutionPolicy Bypass -File $entrypoint -Local -SkipNpmInstall:$SkipNpmInstall -SkipBuild:$SkipBuild -SkipLink:$SkipLink -EnableProfileRouting:$EnableProfileRouting -SkipProfile:$SkipProfile -SkipAgentRules:$SkipAgentRules -CopilotOnly:$CopilotOnly -ClaudeOnly:$ClaudeOnly -ProfilePath $ProfilePath
    if ($LASTEXITCODE -ne 0) { throw "Repository installer failed with exit code $LASTEXITCODE" }
    exit 0
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

if (-not $SkipProfile -and $EnableProfileRouting) { Add-ProfileIntegration $ProfilePath $integrationPath }
if (-not $SkipAgentRules) { Set-AgentRules $rulesBody }
Write-InstallStep "✅" "Install complete."
Write-Host " "
Write-Host "💡 Try: shrinker help"
