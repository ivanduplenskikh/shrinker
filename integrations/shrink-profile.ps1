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

function Get-ShrinkSubcommand {
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

function Use-ShrinkRouting {
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

function Invoke-ShrinkOrNative {
    param(
        [string]$CommandName,
        [object[]]$Arguments
    )

    $routeToShrink = Use-ShrinkRouting -CommandName $CommandName -Arguments $Arguments
    $shrinkCommand = Get-Command shrink -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1

    if ($routeToShrink -and $shrinkCommand) {
        & $shrinkCommand.Source $CommandName @Arguments
        return
    }

    $nativePath = $global:ShrinkNativePaths[$CommandName]
    if ($nativePath) {
        & $nativePath @Arguments
        return
    }

    switch ($CommandName) {
        "cat" { Microsoft.PowerShell.Management\Get-Content @Arguments; return }
        "ls" { Microsoft.PowerShell.Management\Get-ChildItem @Arguments; return }
        "dir" { Microsoft.PowerShell.Management\Get-ChildItem @Arguments; return }
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
