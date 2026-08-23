param(
    [switch]$SkipUnlink,
    [switch]$SkipAgentRules,
    [switch]$CopilotOnly,
    [switch]$ClaudeOnly,
    [string]$ProfilePath = $PROFILE
)

$ErrorActionPreference = "Stop"
$UninstallStep = 0

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

if (-not $SkipUnlink) {
    Write-UninstallStep "🔗" "Unlinking shrinker globally..."
    & npm unlink --silent --global shrinker-ai
    if ($LASTEXITCODE -ne 0) { throw "npm unlink failed." }
}
else { Write-UninstallStep "⏭️" "Skipped global npm unlink." }
Write-UninstallStep "🔧" "Removing PowerShell profile integration..."
Remove-ProfileIntegration $ProfilePath
if (-not $SkipAgentRules) {
    if (-not $ClaudeOnly) { Remove-AgentRules (Join-Path $HOME ".copilot\copilot-instructions.md") }
    if (-not $CopilotOnly) { Remove-AgentRules (Join-Path $HOME ".claude\CLAUDE.md") }
}
else { Write-UninstallStep "⏭️" "Skipped managed agent rules." }
Write-UninstallStep "✅" "Uninstall complete."
