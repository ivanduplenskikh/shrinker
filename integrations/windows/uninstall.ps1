param(
    [switch]$SkipUnlink,
    [switch]$SkipAgentRules,
    [switch]$CopilotOnly,
    [switch]$ClaudeOnly,
    [switch]$PurgeData,
    [int]$Port = 4317,
    [string]$InstallDir = $(Join-Path $HOME ".shrinker"),
    [string]$ProfilePath = $PROFILE,
    [string]$ConfigPath = $(if ($env:SHRINKER_CONFIG_PATH) { $env:SHRINKER_CONFIG_PATH } else { Join-Path $HOME ".shrinker/config" })
)

$ErrorActionPreference = "Stop"
$UninstallStep = 0
$DataDir = Split-Path -Parent $ConfigPath

function Write-UninstallStep {
    param([string]$Emoji, [string]$Message)
    $script:UninstallStep++
    Write-Host "$($script:UninstallStep). $Emoji $Message"
}

function Remove-AgentRules {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return }
    $content = Get-Content $Path -Raw
    $start = "<!-- shrinker agent rules start -->"
    $end = "<!-- shrinker agent rules end -->"
    if ($null -ne $content -and $content.Contains($start) -and $content.Contains($end)) {
        $pattern = [regex]::Escape($start) + ".*?" + [regex]::Escape($end)
        Set-Content $Path ([regex]::Replace($content, $pattern, "", 'Singleline').TrimEnd() + "`n")
        Write-UninstallStep "📄" "Removed managed rules from: $Path"
    }
}

function Remove-ProfileIntegration {
    param([string]$ProfileFile)
    if (-not (Test-Path $ProfileFile)) { return }
    $content = Get-Content $ProfileFile -Raw
    if ($null -eq $content) { return }
    $start = $content.IndexOf("# >>> shrinker integration >>>")
    $endMarker = "# <<< shrinker integration <<<"
    if ($start -ge 0) {
        $end = $content.IndexOf($endMarker, $start)
        if ($end -ge 0) { Set-Content $ProfileFile $content.Remove($start, $end + $endMarker.Length - $start) }
    }
}

function Remove-UserPathEntry {
    param([string]$Directory)
    $currentUserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if (-not $currentUserPath) { return }
    $entries = @($currentUserPath -split [IO.Path]::PathSeparator | Where-Object { $_ -and $_ -ne $Directory })
    $newPath = $entries -join [IO.Path]::PathSeparator
    if ($newPath -ne $currentUserPath) {
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        Write-UninstallStep "🧭" "Removed shrinker from the user PATH: $Directory"
    }
}

function Remove-ReleaseInstall {
    foreach ($name in @("bin", "integrations", "templates", "manifest.json")) {
        Remove-Item -LiteralPath (Join-Path $InstallDir $name) -Recurse -Force -ErrorAction SilentlyContinue
    }
    Remove-UserPathEntry (Join-Path $InstallDir "bin")
}

# The dashboard runs as a detached daemon, so unlinking the package never stops it.
function Stop-DashboardServer {
    param([int]$DashboardPort)
    try {
        Invoke-WebRequest -Uri "http://127.0.0.1:$DashboardPort/__shrinker_shutdown" -Method Post -TimeoutSec 3 -UseBasicParsing | Out-Null
        Start-Sleep -Seconds 1
    }
    catch { }

    try {
        $listener = Get-NetTCPConnection -LocalPort $DashboardPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($listener) { Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue }
    }
    catch { }
}

# Only drop installer-managed keys so hand-written settings survive.
function Remove-ManagedConfig {
    if (-not (Test-Path -LiteralPath $ConfigPath)) { return }
    $remaining = @(Get-Content -LiteralPath $ConfigPath | Where-Object { $_ -notmatch '^\s*SHRINKER_TRACK_UNCOVERED\s*=' })
    if ($remaining.Count -gt 0) { Set-Content -LiteralPath $ConfigPath -Value $remaining -Encoding utf8 }
    else { Remove-Item -LiteralPath $ConfigPath -Force -ErrorAction SilentlyContinue }
}

Write-UninstallStep "🛑" "Stopping the dashboard server on port $Port..."
Stop-DashboardServer $Port

if (-not $SkipUnlink) {
    Write-UninstallStep "🔗" "Removing release-installed shrinker files..."
    Remove-ReleaseInstall
}
else { Write-UninstallStep "⏭️" "Skipped removal." }
Write-UninstallStep "🔧" "Removing PowerShell profile integration..."
Remove-ProfileIntegration $ProfilePath
if (-not $SkipAgentRules) {
    if (-not $ClaudeOnly) { Remove-AgentRules (Join-Path $HOME ".copilot\copilot-instructions.md") }
    if (-not $CopilotOnly) { Remove-AgentRules (Join-Path $HOME ".claude\CLAUDE.md") }
}
else { Write-UninstallStep "⏭️" "Skipped managed agent rules." }

Write-UninstallStep "🔧" "Removing managed settings..."
Remove-ManagedConfig
Remove-Item -LiteralPath (Join-Path $DataDir "dashboard.html") -Force -ErrorAction SilentlyContinue

if ($PurgeData) {
    Remove-Item -LiteralPath $DataDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-UninstallStep "🧹" "Removed local data: $DataDir"
}
elseif (Test-Path -LiteralPath $DataDir) {
    Write-UninstallStep "💾" "Kept saved stats in $DataDir (use -PurgeData to delete)."
}

Write-UninstallStep "✅" "Uninstall complete."
