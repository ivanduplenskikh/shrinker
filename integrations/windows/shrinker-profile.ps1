$global:ShrinkPowerShellRules = @{
    git = @("status", "diff", "log", "show", "reflog", "branch", "tag", "stash")
    npm = @("test", "t", "install", "i", "ci", "ls", "list")
    docker = @("ps", "logs", "images", "compose")
    kubectl = @("get", "describe", "logs")
    gh = @("pr", "issue", "run")
    rg = @("*")
    find = @("*")
    tail = @("*")
    cat = @("*")
    ls = @("*")
    dir = @("*")
}

$global:ShrinkOptionValueFlags = @{
    git = @("-C", "-c", "--git-dir", "--work-tree", "--namespace")
    npm = @("--prefix", "--cache", "--registry", "--workspace", "--userconfig", "-w", "-C")
    docker = @("-H", "--host", "--context", "--config")
    kubectl = @("-n", "--namespace", "-o", "--output", "--context", "--kubeconfig", "--cluster", "--user")
    gh = @("-R", "--repo")
}

$global:ShrinkNativePaths = @{}
foreach ($name in @("git", "npm", "docker", "kubectl", "gh", "rg", "find", "tail")) {
    $command = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) {
        $global:ShrinkNativePaths[$name] = $command.Source
    }
}

function global:Get-ShrinkSubcommand {
    param(
        [string]$CommandName,
        [object[]]$Arguments
    )

    $valueFlags = @($global:ShrinkOptionValueFlags[$CommandName])
    for ($i = 0; $i -lt $Arguments.Count; $i += 1) {
        $part = [string]$Arguments[$i]
        if (-not $part) { continue }
        if ($valueFlags -contains $part) {
            $i += 1
            continue
        }
        if ($part.StartsWith("-")) { continue }
        return $part.ToLowerInvariant()
    }

    return ""
}

function global:Use-ShrinkRouting {
    param(
        [string]$CommandName,
        [object[]]$Arguments
    )

    $allowlist = @($global:ShrinkPowerShellRules[$CommandName])
    if ($allowlist.Count -eq 0) {
        return $false
    }
    if ($allowlist -contains "*") {
        return $true
    }

    $subcommand = Get-ShrinkSubcommand -CommandName $CommandName -Arguments $Arguments
    return $allowlist -contains $subcommand
}

function global:Test-ShrinkRecordsSubcommand {
    param([string]$CommandName)

    return @("git", "npm", "docker", "kubectl", "gh") -contains $CommandName
}

function global:Get-ShrinkCommandPath {
    $installed = Join-Path $HOME ".shrinker\bin\shrinker.exe"
    if (Test-Path -LiteralPath $installed) {
        return $installed
    }

    $candidates = Get-Command shrinker -All -ErrorAction SilentlyContinue
    if (-not $candidates) {
        return $null
    }

    foreach ($candidate in $candidates) {
        $source = [string]$candidate.Source
        if ($source -and $source.ToLowerInvariant().EndsWith(".exe")) {
            return $source
        }
    }
    foreach ($candidate in $candidates) {
        $source = [string]$candidate.Source
        if ($source -and $source.ToLowerInvariant().EndsWith(".cmd")) {
            return $source
        }
    }
    foreach ($candidate in $candidates) {
        $source = [string]$candidate.Source
        if ($source -and $source.ToLowerInvariant().EndsWith(".ps1")) {
            return $source
        }
    }

    return [string]($candidates | Select-Object -First 1).Source
}

# Resolved once at load so wrapped commands never pay for reading the config file.
$script:ShrinkTrackUncoveredDefault = ""
$script:ShrinkConfigPath = if ($env:SHRINKER_CONFIG_PATH) { $env:SHRINKER_CONFIG_PATH } else { Join-Path $HOME ".shrinker/config" }
if (Test-Path -LiteralPath $script:ShrinkConfigPath) {
    foreach ($line in Get-Content -LiteralPath $script:ShrinkConfigPath) {
        $stripped = ($line -split "#", 2)[0].Trim()
        if ($stripped -match '^\s*SHRINKER_TRACK_UNCOVERED\s*=\s*(.*)$') {
            $script:ShrinkTrackUncoveredDefault = $Matches[1].Trim()
        }
    }
}

$script:ShrinkInstallDir = if ($env:SHRINKER_INSTALL_DIR) { $env:SHRINKER_INSTALL_DIR } else { Join-Path $HOME ".shrinker" }
$script:ShrinkUpdateNotice = Join-Path $script:ShrinkInstallDir "update-notice"
if (Test-Path -LiteralPath $script:ShrinkUpdateNotice) {
    Get-Content -LiteralPath $script:ShrinkUpdateNotice
    Remove-Item -LiteralPath $script:ShrinkUpdateNotice -Force -ErrorAction SilentlyContinue
}
if ($env:SHRINKER_DISABLE_UPDATE_CHECK -ne "1") {
    $shrinkCommand = Get-ShrinkCommandPath
    if ($shrinkCommand) {
        Start-Process -FilePath $shrinkCommand -ArgumentList "update-check" -WindowStyle Hidden -ErrorAction SilentlyContinue | Out-Null
    }
}

function global:Test-ShrinkTrackingEnabled {
    $value = [string]$env:SHRINKER_TRACK_UNCOVERED
    if (-not $value) { $value = $script:ShrinkTrackUncoveredDefault }
    if (-not $value) { return $false }
    return @("1", "true", "yes") -contains $value.Trim().ToLowerInvariant()
}

function global:Write-ShrinkUncovered {
    param(
        [string]$CommandName,
        [object[]]$Arguments,
        [int]$Bytes,
        [int]$ExitCode
    )

    if (-not (Test-ShrinkTrackingEnabled)) { return }
    $shrinkCommand = Get-ShrinkCommandPath
    if (-not $shrinkCommand) { return }

    $trackArgs = @("track", "--executable", $CommandName, "--bytes", $Bytes, "--exit-code", $ExitCode)
    $subcommand = if (Test-ShrinkRecordsSubcommand -CommandName $CommandName) { Get-ShrinkSubcommand -CommandName $CommandName -Arguments $Arguments } else { "" }
    if ($subcommand) {
        $trackArgs += @("--subcommand", $subcommand)
    }

    try {
        Start-Process -FilePath $shrinkCommand -ArgumentList $trackArgs -WindowStyle Hidden -ErrorAction SilentlyContinue | Out-Null
    } catch {}
}

function global:Invoke-ShrinkNativeTracked {
    param(
        [scriptblock]$Invoke,
        [string]$CommandName,
        [object[]]$Arguments
    )

    if (-not (Test-ShrinkTrackingEnabled)) {
        & $Invoke
        return
    }

    # Only measure output volume when stdout is redirected (the agent case). Interactive
    # consoles stream the native output untouched so paging and colours still work.
    if (-not [Console]::IsOutputRedirected) {
        & $Invoke
        Write-ShrinkUncovered -CommandName $CommandName -Arguments $Arguments -Bytes 0 -ExitCode ([int]$LASTEXITCODE)
        return
    }

    $output = & $Invoke | Out-String -Stream
    $exitCode = [int]$LASTEXITCODE
    $text = ($output -join [Environment]::NewLine)
    $bytes = [System.Text.Encoding]::UTF8.GetByteCount($text)
    $output | ForEach-Object { $_ }
    Write-ShrinkUncovered -CommandName $CommandName -Arguments $Arguments -Bytes $bytes -ExitCode $exitCode
}

function global:Invoke-ShrinkOrNative {
    param(
        [string]$CommandName,
        [object[]]$Arguments
    )

    $routeToShrink = Use-ShrinkRouting -CommandName $CommandName -Arguments $Arguments
    $shrinkCommand = Get-ShrinkCommandPath

    if ($routeToShrink -and $shrinkCommand) {
        & $shrinkCommand $CommandName @Arguments
        return
    }

    $nativePath = $global:ShrinkNativePaths[$CommandName]
    if ($nativePath) {
        Invoke-ShrinkNativeTracked -CommandName $CommandName -Arguments $Arguments -Invoke { & $nativePath @Arguments }
        return
    }

    switch ($CommandName) {
        "cat" { Invoke-ShrinkNativeTracked -CommandName $CommandName -Arguments $Arguments -Invoke { Microsoft.PowerShell.Management\Get-Content @Arguments }; return }
        "ls" { Invoke-ShrinkNativeTracked -CommandName $CommandName -Arguments $Arguments -Invoke { Microsoft.PowerShell.Management\Get-ChildItem @Arguments }; return }
        "dir" { Invoke-ShrinkNativeTracked -CommandName $CommandName -Arguments $Arguments -Invoke { Microsoft.PowerShell.Management\Get-ChildItem @Arguments }; return }
        default { throw "No native fallback found for '$CommandName'." }
    }
}

function global:git { Invoke-ShrinkOrNative -CommandName "git" -Arguments $args }
function global:npm { Invoke-ShrinkOrNative -CommandName "npm" -Arguments $args }
function global:docker { Invoke-ShrinkOrNative -CommandName "docker" -Arguments $args }
function global:kubectl { Invoke-ShrinkOrNative -CommandName "kubectl" -Arguments $args }
function global:gh { Invoke-ShrinkOrNative -CommandName "gh" -Arguments $args }
function global:rg { Invoke-ShrinkOrNative -CommandName "rg" -Arguments $args }
function global:find { Invoke-ShrinkOrNative -CommandName "find" -Arguments $args }
function global:tail { Invoke-ShrinkOrNative -CommandName "tail" -Arguments $args }
function global:cat { Invoke-ShrinkOrNative -CommandName "cat" -Arguments $args }
function global:ls { Invoke-ShrinkOrNative -CommandName "ls" -Arguments $args }
function global:dir { Invoke-ShrinkOrNative -CommandName "dir" -Arguments $args }
