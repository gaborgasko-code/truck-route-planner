<#
    Truck Route Planner - iOS code signing, from PowerShell.

        .\tools\ios-signing.ps1 csr        # step 1: key + signing request
        .\tools\ios-signing.ps1 secrets    # step 3: build the .p12, set secrets
        .\tools\ios-signing.ps1 appstore   # step 4: TestFlight upload key

    The work is done by tools/ios-signing.sh, because it needs OpenSSL and that
    ships with Git rather than with Windows. This wrapper exists so there is
    one command that works in the shell you actually use: it finds Git's
    bash.exe for you instead of expecting `bash` on PATH, and runs from the
    repository root wherever you happen to be.

    It also asks every question itself. A Git Bash prompt started from
    PowerShell does not reliably receive what you type - it simply sits there
    - so the answers are collected here and handed to the script, which then
    never prompts.

    Your private key and its password stay on this machine. Run this yourself;
    nothing here should be pasted into a chat window.

    created by Gabor Gasko
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('csr', 'secrets', 'appstore', 'help')]
    [string]$Step = 'help',

    # csr: the address in the signing request (Apple does not use it).
    [string]$Email,

    # secrets: only needed if the team id cannot be read from the profile.
    [string]$TeamId,

    # secrets: accept a profile from a team other than Aissa's.
    [switch]$AllowOtherTeam,

    # appstore: asked for if not given.
    [string]$IssuerId,

    # appstore: only needed if .signing holds more than one AuthKey_*.p8.
    [string]$KeyId
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
    Write-Host "  .\tools\ios-signing.ps1 appstore   set the App Store Connect key for TestFlight"
    Write-Host ""
    Write-Host "Run these yourself. The private key and its password stay on this machine."
    Write-Host ""
    exit 0
}

function Invoke-Signing {
    # Windows PowerShell turns a native command's stderr into an ErrorRecord
    # while ErrorActionPreference is 'Stop', which buries the script's own
    # messages under a NativeCommandError. The exit code is what matters here.
    $ErrorActionPreference = 'Continue'
    # Out-Host, because whatever a function prints otherwise becomes its
    # return value - the script's messages would land in $code, unseen.
    & $bash 'tools/ios-signing.sh' @args | Out-Host
    return $LASTEXITCODE
}

function Read-Password([string]$Prompt) {
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# The answers travel to the script as environment variables of this session.
# All of them are removed again at the end, however this ends - the password
# above all.
$handover = 'TRP_NO_PROMPT', 'TRP_EMAIL', 'TRP_P12_PASS', 'TRP_TEAM',
            'TRP_ALLOW_OTHER_TEAM', 'TRP_ISSUER_ID', 'TRP_KEY_ID', 'TRP_CHECKED'

$code = 1
Push-Location $repo
try {
    $env:TRP_NO_PROMPT = '1'

    switch ($Step) {
        'csr' {
            if ($Email) { $env:TRP_EMAIL = $Email.Trim() }
            $code = Invoke-Signing csr
        }

        'secrets' {
            if ($TeamId) { $env:TRP_TEAM = $TeamId.Trim().ToUpper() }
            if ($AllowOtherTeam) { $env:TRP_ALLOW_OTHER_TEAM = '1' }

            # Check the downloads and GitHub access first, so nobody types a
            # password for a step that would fail anyway.
            $code = Invoke-Signing preflight secrets
            if ($code -ne 0) { break }

            Write-Host ""
            Write-Host "Choose a password for the .p12 bundle. You will not see it as you type."
            Write-Host "It is stored as a GitHub secret; you do not need to remember it."
            $first = Read-Password 'Password for the .p12'
            $again = Read-Password 'Repeat it'
            if (-not $first) {
                Write-Host "An empty password will not work in CI - nothing was changed." -ForegroundColor Red
                $code = 1; break
            }
            # -cne: PowerShell compares strings case-blind unless told not to.
            if ($first -cne $again) {
                Write-Host "The two passwords differ - nothing was changed." -ForegroundColor Red
                $code = 1; break
            }
            $env:TRP_P12_PASS = $first
            $first = $null; $again = $null

            # The checks run again inside the step, but quietly this time.
            $env:TRP_CHECKED = '1'

            $code = Invoke-Signing secrets
        }

        'appstore' {
            if ($KeyId) { $env:TRP_KEY_ID = $KeyId.Trim().ToUpper() }

            # Shows where the key and the Issuer ID come from, and stops if the
            # .p8 has not been downloaded yet.
            if (-not $IssuerId) {
                $code = Invoke-Signing preflight appstore
                if ($code -ne 0) { break }
                Write-Host ""
                $IssuerId = Read-Host -Prompt 'Issuer ID'
            }
            $env:TRP_ISSUER_ID = $IssuerId.Trim()

            $code = Invoke-Signing appstore
        }
    }
}
finally {
    foreach ($name in $handover) {
        Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }
    Pop-Location
}

exit $code
