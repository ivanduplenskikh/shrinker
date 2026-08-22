$global:ShrinkPowerShellRules = @{
    git = @("status", "diff", "log")
    npm = @("test", "t")
}

$global:ShrinkNativeGitPath = (Get-Command git -CommandType Application |
    Select-Object -First 1).Source
$global:ShrinkNativeNpmPath = (Get-Command npm -CommandType Application |
    Select-Object -First 1).Source

function global:git {
    $subcommand = if ($args.Count -gt 0) { [string]$args[0] } else { "" }
    if ($global:ShrinkPowerShellRules.git -contains $subcommand) {
        & shrink git @args
    }
    else {
        & $global:ShrinkNativeGitPath @args
    }
}

function global:npm {
    $subcommand = if ($args.Count -gt 0) { [string]$args[0] } else { "" }
    if ($global:ShrinkPowerShellRules.npm -contains $subcommand) {
        & shrink npm @args
    }
    else {
        & $global:ShrinkNativeNpmPath @args
    }
}
