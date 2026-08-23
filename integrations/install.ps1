param(
    [string]$PackageName = "shrinker",
    [string]$Registry = "https://registry.npmjs.org",
    [string]$Version,
    [switch]$EnableProfileRouting,
    [switch]$SkipAgentRules,
    [switch]$CopilotOnly,
    [switch]$ClaudeOnly
)

$ErrorActionPreference = "Stop"

if ($CopilotOnly -and $ClaudeOnly) {
    throw "Use either -CopilotOnly or -ClaudeOnly, not both."
}

$packageSpec = if ($Version) { "$PackageName@$Version" } else { $PackageName }
Write-Host "Installing $packageSpec from $Registry..."
& npm install --global $packageSpec "--registry=$Registry"
if ($LASTEXITCODE -ne 0) {
    throw "npm package installation failed with exit code $LASTEXITCODE"
}

$globalRoot = (& npm root --global).Trim()
if (-not $globalRoot) {
    throw "Could not determine the global npm package directory."
}

$packageRoot = Join-Path $globalRoot ($PackageName -replace '/', '\')
$localInstaller = Join-Path $packageRoot "integrations\install-shrinker.ps1"
if (-not (Test-Path $localInstaller)) {
    throw "Installed package integration not found: $localInstaller"
}

$localArgs = @("-ExecutionPolicy", "Bypass", "-File", $localInstaller, "-SkipNpmInstall", "-SkipBuild", "-SkipLink")
if ($EnableProfileRouting) { $localArgs += "-EnableProfileRouting" }
if ($SkipAgentRules) { $localArgs += "-SkipAgentRules" }
if ($CopilotOnly) { $localArgs += "-CopilotOnly" }
if ($ClaudeOnly) { $localArgs += "-ClaudeOnly" }

& pwsh @localArgs
if ($LASTEXITCODE -ne 0) {
    throw "Installed package integration failed with exit code $LASTEXITCODE"
}

Write-Host "Package installation complete. Try: shrinker help"
