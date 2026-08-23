param(
    [string]$PackageName = "shrinker",
    [string]$Registry = "https://registry.npmjs.org",
    [switch]$SkipAgentRules,
    [switch]$CopilotOnly,
    [switch]$ClaudeOnly
)

$ErrorActionPreference = "Stop"

if ($CopilotOnly -and $ClaudeOnly) {
    throw "Use either -CopilotOnly or -ClaudeOnly, not both."
}

$globalRoot = (& npm root --global).Trim()
$packageRoot = Join-Path $globalRoot ($PackageName -replace '/', '\')
$localUninstaller = Join-Path $packageRoot "integrations\uninstall-shrinker.ps1"
if (Test-Path $localUninstaller) {
    $localArgs = @("-ExecutionPolicy", "Bypass", "-File", $localUninstaller, "-SkipUnlink")
    if ($SkipAgentRules) { $localArgs += "-SkipAgentRules" }
    if ($CopilotOnly) { $localArgs += "-CopilotOnly" }
    if ($ClaudeOnly) { $localArgs += "-ClaudeOnly" }
    & pwsh @localArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Installed package integration failed with exit code $LASTEXITCODE"
    }
}

Write-Host "Removing $PackageName..."
& npm uninstall --global $PackageName "--registry=$Registry"
if ($LASTEXITCODE -ne 0) {
    throw "npm package removal failed with exit code $LASTEXITCODE"
}

Write-Host "Package uninstallation complete."
