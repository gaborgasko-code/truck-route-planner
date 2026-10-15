<#
    Truck Route Planner - create the Google Play upload key, from PowerShell.

        .\tools\android-signing.ps1

    The work is done by tools/android-signing.sh, which needs OpenSSL and
    that ships with Git. This wrapper finds Git's bash.exe and runs it from
    the repository root wherever you are. It asks nothing: the password is
    generated, saved in .signing\ and sent to GitHub as a secret.
#>

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$script = Join-Path $repo 'tools\android-signing.sh'
if (-not (Test-Path $script)) {
    Write-Error "Cannot find $script - run this from inside the repository."
    exit 1
}

$candidates = @(
    "$env:ProgramFiles\Git\bin\bash.exe",
    "${env:ProgramFiles(x86)}\Git\bin\bash.exe",
    "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe"
)
$bash = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $bash) {
    $git = Get-Command git -ErrorAction SilentlyContinue
    if ($git) {
        $guess = Join-Path (Split-Path -Parent (Split-Path -Parent $git.Source)) 'bin\bash.exe'
        if (Test-Path $guess) { $bash = $guess }
    }
}
if (-not $bash) {
    Write-Host "Could not find Git's bash.exe. Install Git for Windows and try again." -ForegroundColor Red
    exit 1
}

$code = 1
Push-Location $repo
try {
    # A native command's stderr would otherwise become a NativeCommandError.
    $ErrorActionPreference = 'Continue'
    & $bash 'tools/android-signing.sh' | Out-Host
    $code = $LASTEXITCODE
}
finally {
    Pop-Location
}
exit $code
