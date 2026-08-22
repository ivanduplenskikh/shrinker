param(
    [string]$ArchiveUrl,
    [string]$Owner,
    [string]$Repo,
    [string]$Ref = "main",
    [ValidateSet("branch", "tag")]
    [string]$RefType = "branch",
    [string]$SourcePath,
    [switch]$SkipUnlink,
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

function Invoke-UninstallFromRepo {
    param(
        [string]$RepoRoot
    )

    $uninstallScript = Join-Path $RepoRoot "integrations/uninstall-shrink.ps1"
    $uninstallAgentScript = Join-Path $RepoRoot "integrations/uninstall-agent-rules.ps1"

    if (-not (Test-Path $uninstallScript)) {
        throw "Uninstall script not found: $uninstallScript"
    }

    $uninstallArgs = @("-ExecutionPolicy", "Bypass", "-File", $uninstallScript)
    if ($SkipUnlink) {
        $uninstallArgs += "-SkipUnlink"
    }

    & pwsh @uninstallArgs
    if ($LASTEXITCODE -ne 0) {
        throw "uninstall-shrink.ps1 failed with exit code $LASTEXITCODE"
    }

    if (-not $SkipAgentRules) {
        if (-not (Test-Path $uninstallAgentScript)) {
            throw "Agent rules uninstall script not found: $uninstallAgentScript"
        }

        $agentArgs = @("-ExecutionPolicy", "Bypass", "-File", $uninstallAgentScript, "-RepoRoot", (Get-Location).Path)
        if ($CopilotOnly) { $agentArgs += "-CopilotOnly" }
        if ($ClaudeOnly) { $agentArgs += "-ClaudeOnly" }

        & pwsh @agentArgs
        if ($LASTEXITCODE -ne 0) {
            throw "uninstall-agent-rules.ps1 failed with exit code $LASTEXITCODE"
        }
    }
}

if ($SourcePath) {
    $repoRoot = (Resolve-Path $SourcePath).Path
    Write-Host "Uninstalling from local source path: $repoRoot"
    Invoke-UninstallFromRepo -RepoRoot $repoRoot
    Write-Host "Bootstrap uninstall complete."
    return
}

$resolvedArchiveUrl = Resolve-ArchiveUrl
$tempRoot = Join-Path $env:TEMP ("shrink-uninstall-" + [Guid]::NewGuid().ToString("N"))
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

    Write-Host "Uninstalling from extracted source: $repoRoot"
    Invoke-UninstallFromRepo -RepoRoot $repoRoot
    Write-Host "Bootstrap uninstall complete."
}
finally {
    Remove-Item -Path $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
