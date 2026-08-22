param(
    [string]$ArchiveUrl,
    [string]$Owner = "ivanduplenskikh",
    [string]$Repo = "shrinker",
    [string]$Ref = "main",
    [ValidateSet("branch", "tag")]
    [string]$RefType = "branch",
    [string]$SourcePath,
    [switch]$SkipNpmInstall,
    [switch]$SkipBuild,
    [switch]$SkipLink,
    [switch]$EnableProfileRouting,
    [switch]$SkipAgentRules,
    [switch]$CopilotOnly,
    [switch]$ClaudeOnly
)

$ErrorActionPreference = "Stop"

if ($CopilotOnly -and $ClaudeOnly) {
    throw "Use either -CopilotOnly or -ClaudeOnly, not both."
}

function Resolve-ArchiveUrl {
    if ($ArchiveUrl) {
        return $ArchiveUrl
    }

    if (-not $Owner -or -not $Repo) {
        throw "When -ArchiveUrl is not provided, both -Owner and -Repo are required."
    }

    $prefix = if ($RefType -eq "tag") { "tags" } else { "heads" }
    return "https://github.com/$Owner/$Repo/archive/refs/$prefix/$Ref.zip"
}

function Invoke-InstallFromRepo {
    param(
        [string]$RepoRoot
    )

    $installScript = Join-Path $RepoRoot "integrations/install-shrink.ps1"
    $agentScript = Join-Path $RepoRoot "integrations/install-agent-rules.ps1"

    if (-not (Test-Path $installScript)) {
        throw "Install script not found: $installScript"
    }

    $installArgs = @("-ExecutionPolicy", "Bypass", "-File", $installScript)
    if ($SkipNpmInstall) {
        $installArgs += "-SkipNpmInstall"
    }
    if ($SkipBuild) {
        $installArgs += "-SkipBuild"
    }
    if ($SkipLink) {
        $installArgs += "-SkipLink"
    }
    if ($EnableProfileRouting) {
        $installArgs += "-EnableProfileRouting"
    }

    & pwsh @installArgs
    if ($LASTEXITCODE -ne 0) {
        throw "install-shrink.ps1 failed with exit code $LASTEXITCODE"
    }

    if (-not $SkipAgentRules) {
        if (-not (Test-Path $agentScript)) {
            throw "Agent rules script not found: $agentScript"
        }

        $agentArgs = @("-ExecutionPolicy", "Bypass", "-File", $agentScript, "-RepoRoot", (Get-Location).Path)
        if ($CopilotOnly) { $agentArgs += "-CopilotOnly" }
        if ($ClaudeOnly) { $agentArgs += "-ClaudeOnly" }

        & pwsh @agentArgs
        if ($LASTEXITCODE -ne 0) {
            throw "install-agent-rules.ps1 failed with exit code $LASTEXITCODE"
        }
    }
}

if ($SourcePath) {
    $repoRoot = (Resolve-Path $SourcePath).Path
    Write-Host "Installing from local source path: $repoRoot"
    Invoke-InstallFromRepo -RepoRoot $repoRoot
    Write-Host "Bootstrap install complete."
    return
}

$resolvedArchiveUrl = Resolve-ArchiveUrl
$tempRoot = Join-Path $env:TEMP ("shrink-install-" + [Guid]::NewGuid().ToString("N"))
$archivePath = Join-Path $tempRoot "repo.zip"
$extractPath = Join-Path $tempRoot "repo"

New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
    Write-Host "Downloading: $resolvedArchiveUrl"
    Invoke-WebRequest -Uri $resolvedArchiveUrl -OutFile $archivePath

    Write-Host "Extracting archive..."
    Expand-Archive -Path $archivePath -DestinationPath $extractPath -Force

    $repoRoot = (Get-ChildItem -Path $extractPath -Directory | Select-Object -First 1).FullName
    if (-not $repoRoot) {
        throw "Could not locate repository root after extraction."
    }

    Write-Host "Installing from extracted source: $repoRoot"
    Invoke-InstallFromRepo -RepoRoot $repoRoot
    Write-Host "Bootstrap install complete."
}
finally {
    Remove-Item -Path $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
