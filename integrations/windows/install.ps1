param(
    [string]$Version
)

$ErrorActionPreference = "Stop"

$arguments = @("install")

function Enable-ShrinkerInCurrentSession {
    $binDir = Join-Path $HOME ".shrinker\bin"
    if ((Test-Path -LiteralPath $binDir) -and -not (($env:Path -split [IO.Path]::PathSeparator) -contains $binDir)) {
        $env:Path = "$binDir$([IO.Path]::PathSeparator)$env:Path"
    }
}

$asset = "shrinker-win-x64.zip"
$url = if ($Version) { $tag = if ($Version.StartsWith("v")) { $Version } else { "v$Version" }; "https://github.com/ivanduplenskikh/shrinker/releases/download/$tag/$asset" } else { "https://github.com/ivanduplenskikh/shrinker/releases/latest/download/$asset" }
$temporary = Join-Path ([IO.Path]::GetTempPath()) ("shrinker-install-" + [guid]::NewGuid().ToString("N"))
$archive = Join-Path $temporary $asset
$extract = Join-Path $temporary "package"
try {
    New-Item -ItemType Directory -Force -Path $extract | Out-Null
    Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
    Expand-Archive -LiteralPath $archive -DestinationPath $extract -Force
    $installer = Join-Path $extract "bin\installer.exe"
    if (-not (Test-Path $installer)) { throw "Release archive is missing bin\installer.exe" }
    & $installer @arguments
    if ($LASTEXITCODE -eq 0) { Enable-ShrinkerInCurrentSession }
    return $LASTEXITCODE
}
finally {
    Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
}
