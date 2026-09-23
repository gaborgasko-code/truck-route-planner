<#
    Truck Route Planner - iOS code signing, from PowerShell.

        .\tools\ios-signing.ps1 csr        # step 1: key + signing request
        .\tools\ios-signing.ps1 secrets    # step 3: build the .p12, set secrets

    The work is done by tools/ios-signing.sh, because it needs OpenSSL and that
    ships with Git rather than with Windows. This wrapper exists so there is
    one command that works in the shell you actually use: it finds Git's
    bash.exe for you instead of expecting `bash` on PATH, and runs from the
    repository root wherever you happen to be.

    Your private key and its password stay on this machine. Run this yourself;
    nothing here should be pasted into a chat window.

    created by Gabor Gasko
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('csr', 'secrets', 'help')]
    [string]$Step = 'help'
)

$ErrorActionPreference = 'Stop'

# The repository root, derived from this script rather than the current
# directory, so it does not matter where you are when you run it.
$repo = Split-Path -Parent $PSScriptRoot
$script = Join-Path $repo 'tools\ios-signing.sh'

if (-not (Test-Path $script)) {
    Write-Error "Cannot find $script - run this from inside the repository."
    exit 1
}

# Git for Windows ships both bash and the OpenSSL this needs. Look in the
# usual places, then fall back to asking Git itself where it lives.
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
    Write-Host ""
    Write-Host "Could not find Git's bash.exe." -ForegroundColor Red
    Write-Host "This needs Git for Windows, which also provides the OpenSSL used here."
    Write-Host "Install it from https://git-scm.com/download/win and try again."
    Write-Host ""
    exit 1
}

if ($Step -eq 'help') {
    Write-Host ""
    Write-Host "Truck Route Planner - iOS signing setup"
    Write-Host ""
    Write-Host "  .\tools\ios-signing.ps1 csr        create a key and signing request"
    Write-Host "  .\tools\ios-signing.ps1 secrets    build the .p12 and set the GitHub secrets"
    Write-Host ""
    Write-Host "Run these yourself. The private key and its password stay on this machine."
    Write-Host ""
    exit 0
}

# Hand bash a path it understands, and run from the repository root.
$unixScript = 'tools/ios-signing.sh'
Push-Location $repo
try {
    # Windows PowerShell turns a native command's stderr into an ErrorRecord
    # while ErrorActionPreference is 'Stop', which buries the script's own
    # messages under a NativeCommandError. The exit code is what matters here.
    $ErrorActionPreference = 'Continue'
    & $bash $unixScript $Step
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
