param(
    [switch]$Local,
    [string]$Version,
    [string]$ReleaseRepo = "ivanduplenskikh/shrinker",
    [string]$AssetBaseUrl,
    [switch]$SkipAgentRules,
    [switch]$CopilotOnly,
    [switch]$ClaudeOnly
)

$ErrorActionPreference = "Stop"
if ($CopilotOnly -and $ClaudeOnly) { throw "Use either -CopilotOnly or -ClaudeOnly, not both." }

$arguments = @("install")
if ($Local) { $arguments += "--local" }
if ($SkipAgentRules) { $arguments += "--skip-agent-rules" }
if ($CopilotOnly) { $arguments += "--copilot-only" }
if ($ClaudeOnly) { $arguments += "--claude-only" }
if ($Version) { $arguments += @("--version", $Version) }

function Enable-ShrinkerInCurrentSession {
    $binDir = Join-Path $HOME ".shrinker\bin"
    if ((Test-Path -LiteralPath $binDir) -and -not (($env:Path -split [IO.Path]::PathSeparator) -contains $binDir)) {
        $env:Path = "$binDir$([IO.Path]::PathSeparator)$env:Path"
    }
}

if ($Local) {
    $repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
    Push-Location $repositoryRoot
    try {
        & go run ./cmd/installer @arguments
        if ($LASTEXITCODE -eq 0) { Enable-ShrinkerInCurrentSession }
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
    if ($LASTEXITCODE -eq 0) { Enable-ShrinkerInCurrentSession }
    return $LASTEXITCODE
}
finally {
    Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
}
