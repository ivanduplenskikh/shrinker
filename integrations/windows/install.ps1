param(
    [switch]$Local,
    [string]$Version,
    [string]$ReleaseRepo = "ivanduplenskikh/shrinker",
    [string]$AssetBaseUrl,
    [string]$InstallDir = (Join-Path $HOME ".shrinker"),
    [switch]$EnableProfileRouting,
    [switch]$SkipProfile,
    [switch]$SkipAgentRules,
    [switch]$CopilotOnly,
    [switch]$ClaudeOnly,
    [switch]$EnableUncoveredTracking,
    [switch]$DisableUncoveredTracking,
    [string]$ProfilePath = $PROFILE,
    [string]$ConfigPath = $(if ($env:SHRINKER_CONFIG_PATH) { $env:SHRINKER_CONFIG_PATH } else { Join-Path $HOME ".shrinker/config" })
)

$ErrorActionPreference = "Stop"
if ($EnableProfileRouting -and $SkipProfile) { throw "Use either -EnableProfileRouting or -SkipProfile, not both." }
if ($CopilotOnly -and $ClaudeOnly) { throw "Use either -CopilotOnly or -ClaudeOnly, not both." }
if ($EnableUncoveredTracking -and $DisableUncoveredTracking) { throw "Use either -EnableUncoveredTracking or -DisableUncoveredTracking, not both." }

$arguments = @("install")
if ($Local) { $arguments += "--local" }
if ($EnableProfileRouting) { $arguments += "--enable-profile-routing" }
if ($SkipProfile) { $arguments += "--skip-profile" }
if ($SkipAgentRules) { $arguments += "--skip-agent-rules" }
if ($CopilotOnly) { $arguments += "--copilot-only" }
if ($ClaudeOnly) { $arguments += "--claude-only" }
if ($EnableUncoveredTracking) { $arguments += "--track-uncovered=true" }
if ($DisableUncoveredTracking) { $arguments += "--track-uncovered=false" }
if ($Version) { $arguments += @("--version", $Version) }
$arguments += @("--install-dir", $InstallDir, "--profile-path", $ProfilePath, "--config-path", $ConfigPath)

if ($Local) {
    $repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
    Push-Location $repositoryRoot
    try {
        & go run ./cmd/installer @arguments
        return $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
}

$asset = "shrinker-win-x64.zip"
$url = if ($AssetBaseUrl) { "$($AssetBaseUrl.TrimEnd('/'))/$asset" } elseif ($Version) { $tag = if ($Version.StartsWith("v")) { $Version } else { "v$Version" }; "https://github.com/$ReleaseRepo/releases/download/$tag/$asset" } else { "https://github.com/$ReleaseRepo/releases/latest/download/$asset" }
$temporary = Join-Path ([IO.Path]::GetTempPath()) ("shrinker-install-" + [guid]::NewGuid().ToString("N"))
$archive = Join-Path $temporary $asset
$extract = Join-Path $temporary "package"
try {
    New-Item -ItemType Directory -Force -Path $extract | Out-Null
    Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
    Expand-Archive -LiteralPath $archive -DestinationPath $extract -Force
    $installer = Join-Path $extract "bin\installer.exe"
    if (-not (Test-Path $installer)) { throw "Release archive is missing bin\installer.exe" }
    $arguments += @("--archive", $archive)
    & $installer @arguments
    return $LASTEXITCODE
}
finally {
    Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
}
