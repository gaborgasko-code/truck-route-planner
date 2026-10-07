#!/usr/bin/env bash
#
# Truck Route Planner - set up iOS code signing from Windows.
#
#   .\tools\ios-signing.ps1 csr | secrets | appstore     (PowerShell)
#   bash tools/ios-signing.sh csr | secrets | appstore   (Git Bash)
#
# Signing normally starts in Keychain Access on a Mac. This does the same job
# with OpenSSL, which Git Bash already ships, so no Mac is needed at any point.
#
# The private key never leaves this machine and is never printed. Run this
# yourself: nothing here should be pasted into a chat window, and the .p12 and
# its password are the credential that proves an app came from you.
#
# Every answer can come from the environment instead of a prompt, and that is
# how the PowerShell wrapper drives this script. A Git Bash prompt started
# from PowerShell does not reliably receive keystrokes - it just sits there -
# so the wrapper asks the questions itself and hands the answers over:
#
#   TRP_EMAIL              csr       email written into the signing request
#   TRP_P12_PASS           secrets   password for the .p12
#   TRP_TEAM               secrets   team id, if the profile cannot be read
#   TRP_ALLOW_OTHER_TEAM   secrets   1 to accept a team other than Aissa's
#   TRP_ISSUER_ID          appstore  App Store Connect issuer id
#   TRP_KEY_ID             appstore  key id (else read from AuthKey_<id>.p8)
#   TRP_NO_PROMPT          all       1 to stop with an error, never prompt
#   TRP_CHECKED            secrets   1 if the checks were just shown already
#
# created by Gabor Gasko

set -euo pipefail

# Under the PowerShell wrapper, errors go out on the same stream as everything
# else. PowerShell reads the two separately and would otherwise show an error
# above the lines that explain it.
[ -z "${TRP_NO_PROMPT:-}" ] || exec 2>&1

# Git Bash rewrites any argument that looks like a Unix path, which turns
# OpenSSL's "/CN=..." subject into "C:/Program Files/Git/CN=..." and makes the
# request fail with a confusing message about the name format.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

# With path conversion off (above), a /c/Users/... path would reach OpenSSL -
# a Windows program - unconverted, and it cannot open it. `pwd -W` gives the
# C:/Users/... form, which both OpenSSL and Git Bash's own tools understand.
# Elsewhere -W does not exist and plain pwd is right anyway.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && { pwd -W 2>/dev/null || pwd; })"
DIR="$ROOT/.signing"
# The app is built and signed in Aissa's private repository, next to her
# Apple account - not in the public website repository the code also lives in.
REPO="aissab-code/planificador"
OWNER="${REPO%%/*}"

# The app is published from Aissa's Apple developer team. A certificate or
# profile made while the browser was signed into a different Apple ID lands on
# that other team, and nothing complains until the signed build fails in CI -
# so the team id in the profile is checked against this before uploading.
# Override with EXPECTED_TEAM=XXXXXXXXXX if the app ever moves.
EXPECTED_TEAM="${EXPECTED_TEAM:-3Q72J6XQYL}"
PUBLISHER="Aissa (aissa.b.code@gmail.com)"

# The bundle id is read from capacitor.config.json rather than written here,
# so the id registered at Apple and the id the app is built with cannot drift
# apart. A profile made for any other id makes the signed build fail in CI.
CONFIG="$ROOT/capacitor.config.json"
BUNDLE_ID="$(grep -o '"appId"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG" 2>/dev/null \
  | sed 's/.*"\([^"]*\)"$/\1/' || true)"

KEY="$DIR/ios_distribution.key"
CSR="$DIR/ios_distribution.certSigningRequest"
CER="$DIR/ios_distribution.cer"
P12="$DIR/ios_distribution.p12"
PROFILE="$DIR/profile.mobileprovision"
PEM="$DIR/cert.pem"

# The same places as Windows writes them, for messages: that is the path a
# browser's save dialog and Explorer understand, not /c/Users/...
win() { cygpath -w "$1" 2>/dev/null || printf '%s' "$1"; }
WDIR="$(win "$DIR")"
WCER="$(win "$CER")"
WPROFILE="$(win "$PROFILE")"
WP12="$(win "$P12")"

# The decoded certificate and the base64 copies of credentials are working
# files only. Remove them however the script ends, including on an error.
trap 'rm -f "$PEM" "$DIR/.p12.b64" "$DIR/.profile.b64" "$DIR/.p8.b64"' EXIT

die() { printf '\nerror: %s\n' "$1" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# ask VAR "Question: " [secret] "what to do instead"
# Prompts on the terminal - unless prompting is off, in which case the missing
# answer is an error that says how to supply it.
ask() {
  [ -z "${TRP_NO_PROMPT:-}" ] || die "$4"
  if [ "$3" = "secret" ]; then
    read -r -s -p "$2" "$1"; printf '\n'
  else
    read -r -p "$2" "$1"
  fi
}

# Check GitHub access before asking for anything. gh may hold several accounts
# and the active one need not be the repository owner - setting a secret then
# fails with a 403 as the very last step, after all the Apple work is done.
# The owner's token is used for these commands only, through GH_TOKEN, so the
# globally active account is left exactly as it was.
github_access() {
  have gh || die "the GitHub CLI is not on PATH"
  printf 'Checking GitHub access to %s\n' "$REPO"
  GHTOKEN="$(gh auth token --user "$OWNER" 2>/dev/null || true)"
  [ -n "$GHTOKEN" ] || die "gh is not signed in as $OWNER. Run: gh auth login   (and choose $OWNER)"
  ADMIN="$(GH_TOKEN="$GHTOKEN" gh api "repos/$REPO" --jq '.permissions.admin' 2>/dev/null || true)"
  [ "$ADMIN" = "true" ] || die "$OWNER cannot manage secrets on $REPO"
  printf '  ok - using %s for this step; your active gh account is unchanged\n\n' "$OWNER"
}

# ------------------------------------------------------------------- step 1

step_csr() {
  have openssl || die "openssl not found (it ships with Git Bash)"
  [ -n "$BUNDLE_ID" ] || die "could not read appId from $CONFIG"
  mkdir -p "$DIR"

  # Apple writes its own name and team into the certificate it issues, so
  # the address in the request is a formality and needs no question.
  EMAIL="${TRP_EMAIL:-aissa.b.code@gmail.com}"
  case "$EMAIL" in
    */*|*' '*|*@*@*) die "'$EMAIL' is not an email address" ;;
    ?*@?*.?*) ;;
    *) die "'$EMAIL' is not an email address" ;;
  esac

  if [ -f "$KEY" ]; then
    # Running this again is harmless. The key is never replaced: a
    # certificate Apple issued for it would not work with a new one.
    printf 'Step 1 was already done - your private key is kept as it is.\n'
    if [ ! -f "$CSR" ]; then
      openssl req -new -key "$KEY" -out "$CSR" \
        -subj "/emailAddress=$EMAIL/CN=Truck Route Planner Distribution/C=ES" \
        || die "OpenSSL could not create the signing request"
      printf 'The signing request was missing, so it was made again from that key.\n'
    fi
  else
    printf 'Creating a private key and a certificate signing request\n'
    printf 'for %s, team %s.\n' "$PUBLISHER" "$EXPECTED_TEAM"

    openssl genrsa -out "$KEY" 2048 2>/dev/null \
      || die "OpenSSL could not create the key in $WDIR"
    openssl req -new -key "$KEY" -out "$CSR" \
      -subj "/emailAddress=$EMAIL/CN=Truck Route Planner Distribution/C=ES" \
      || { rm -f "$KEY"; die "OpenSSL could not create the signing request"; }

    chmod 600 "$KEY" 2>/dev/null || true
  fi

  cat <<EOF

Done. Two files in $WDIR

  ios_distribution.key   your private key - keep it, never share it
  ios_distribution.certSigningRequest

Next, in a browser - and FIRST check you are signed in as the right account:

  developer.apple.com must show team $EXPECTED_TEAM in the top-right corner.
  If the browser remembers a different Apple ID, everything below is created
  on that other team and the signed build fails much later. Sign out and back
  in as $EMAIL, or use a private window.

  1. https://developer.apple.com/account/resources/certificates/add
  2. Choose "Apple Distribution", upload the .certSigningRequest above.
  3. Download the .cer and save it as:
       $WCER

  4. https://developer.apple.com/account/resources/identifiers/add/bundleId
     Register an App ID, explicit, with bundle id exactly:
       $BUNDLE_ID
     Leave the capabilities as they are: the break reminders are local
     notifications, which need no Push Notifications capability.

  5. https://developer.apple.com/account/resources/profiles/add
     Choose "App Store Connect" distribution, pick the App ID above and the
     certificate from step 2. Download it and save it as:
       $WPROFILE

Then run:  .\tools\ios-signing.ps1 secrets      (PowerShell)
           bash tools/ios-signing.sh secrets  (Git Bash)
EOF
}

# ------------------------------------------------------------------- step 3

# Everything that can be checked without the password is checked first, so a
# wrong download is reported before anything is asked or built. Each of these
# mistakes would otherwise surface only in CI, after the secrets were set.
check_secrets() {
  have openssl || die "openssl not found"
  [ -n "$BUNDLE_ID" ] || die "could not read appId from $CONFIG"

  [ -f "$KEY" ] || die "no private key - run the csr step first (PowerShell: .\tools\ios-signing.ps1 csr)"
  [ -f "$CER" ] || die "missing $WCER - download it from the Apple developer portal"
  [ -f "$PROFILE" ] || die "missing $WPROFILE - download it from the Apple developer portal"

  github_access

  printf 'Checking the certificate.\n'
  # Apple hands out a DER .cer; accept a PEM one too.
  openssl x509 -inform DER -in "$CER" -out "$PEM" 2>/dev/null \
    || openssl x509 -inform PEM -in "$CER" -out "$PEM" 2>/dev/null \
    || die "$WCER is not a certificate - download the .cer again"

  SUBJECT="$(openssl x509 -in "$PEM" -noout -subject -nameopt RFC2253)"
  CERT_NAME="$(printf '%s' "$SUBJECT" | sed -n 's/.*CN=\([^,]*\).*/\1/p')"
  CERT_TEAM="$(printf '%s' "$SUBJECT" | sed -n 's/.*OU=\([A-Z0-9]\{10\}\).*/\1/p')"
  printf '  certificate:     %s\n' "${CERT_NAME:-$SUBJECT}"

  case "$SUBJECT" in
    *Distribution*) ;;
    *) die "this is not a distribution certificate. Create an \"Apple Distribution\" one." ;;
  esac
  openssl x509 -in "$PEM" -noout -checkend 0 >/dev/null \
    || die "this certificate has expired - create a new one"

  # A certificate made from a different request belongs to a different key,
  # and the .p12 would be useless. Compare the public halves only.
  [ "$(openssl x509 -in "$PEM" -noout -pubkey)" = "$(openssl pkey -in "$KEY" -pubout)" ] \
    || die "this certificate was not issued for ios_distribution.key.
       Upload ios_distribution.certSigningRequest from $WDIR
       when creating the certificate, and download that one."
  printf '  matches your private key\n'

  printf 'Checking the provisioning profile.\n'
  # A .mobileprovision is CMS-signed binary with an XML plist inside, so pull
  # the plist out first rather than grepping the wrapper.
  TEAM=""
  PLIST=$(openssl smime -inform DER -verify -noverify -in "$PROFILE" 2>/dev/null || true)
  if [ -n "$PLIST" ]; then
    TEAM=$(printf '%s' "$PLIST" \
      | grep -A2 '<key>TeamIdentifier</key>' \
      | grep -oE '[A-Z0-9]{10}' | head -1 || true)
  fi

  if [ -z "$TEAM" ]; then
    TEAM="${TRP_TEAM:-}"
    if [ -z "$TEAM" ]; then
      printf '  could not read the team id automatically.\n'
      ask TEAM "  Your ten-character Team ID: " "" \
        "could not read the team id from the profile - run again with -TeamId XXXXXXXXXX"
    fi
  else
    printf '  team id:         %s\n' "$TEAM"
  fi
  case "$TEAM" in
    [A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]) ;;
    *) die "a team id is ten characters, got '$TEAM'" ;;
  esac

  # The profile names exactly one App ID, as TEAMID.bundle.id. If it is not
  # ours, Xcode refuses to sign - but only in CI, after the secrets are set.
  APP_ID=""
  if [ -n "$PLIST" ]; then
    APP_ID=$(printf '%s' "$PLIST" \
      | grep -A1 '<key>application-identifier</key>' \
      | grep -oE '<string>[^<]+</string>' | head -1 \
      | sed 's/<string>//; s/<\/string>//' || true)
  fi
  if [ -n "$APP_ID" ]; then
    printf '  profile is for:  %s\n' "$APP_ID"
    case "$APP_ID" in
      *".$BUNDLE_ID") ;;
      *) die "this profile is for '$APP_ID', but the app is built as '$BUNDLE_ID'.
       Create the profile for the App ID $BUNDLE_ID and download it again." ;;
    esac
  else
    printf '  could not read the App ID from the profile - check it is for %s\n' "$BUNDLE_ID"
  fi

  if [ -n "$CERT_TEAM" ] && [ "$CERT_TEAM" != "$TEAM" ]; then
    die "the certificate is from team $CERT_TEAM but the profile from team $TEAM.
       Both have to be made on the same team - $EXPECTED_TEAM."
  fi

  if [ "$TEAM" != "$EXPECTED_TEAM" ]; then
    printf '\n  WARNING: this profile belongs to team %s, not %s (%s).\n' \
      "$TEAM" "$EXPECTED_TEAM" "$PUBLISHER"
    printf '  The usual cause is a browser still signed into another Apple ID when\n'
    printf '  the certificate or profile was made. Signing would then fail in CI.\n\n'
    if [ "${TRP_ALLOW_OTHER_TEAM:-}" != "1" ]; then
      GO=""
      ask GO "  Continue with team $TEAM anyway? [y/N] " "" \
        "stopped - re-create the certificate and profile on team $EXPECTED_TEAM
       (or, if team $TEAM is really intended, run again with -AllowOtherTeam)"
      case "$GO" in y|Y|yes|YES) ;; *) die "stopped - re-create the profile on team $EXPECTED_TEAM" ;; esac
    fi
  fi
  printf '  ok\n'
}

step_secrets() {
  # Run the checks again even when the wrapper has just run them - only their
  # report is skipped the second time. Errors still show, on stderr.
  if [ "${TRP_CHECKED:-}" = "1" ]; then
    check_secrets >/dev/null
  else
    check_secrets
  fi

  printf '\nBuilding the .p12 bundle.\n'
  if [ -z "${TRP_P12_PASS:-}" ]; then
    printf 'Choose a password for it. You will not see it as you type.\n\n'
    P12PASS="" P12PASS2=""
    ask P12PASS "Password for the .p12: " secret "no .p12 password given"
    ask P12PASS2 "Repeat it: " secret "no .p12 password given"
    [ "$P12PASS" = "$P12PASS2" ] || die "the two passwords differ"
    TRP_P12_PASS="$P12PASS"
    unset P12PASS P12PASS2
  fi
  [ -n "$TRP_P12_PASS" ] || die "an empty password will not work in CI"

  # OpenSSL reads the password from the environment rather than from its
  # command line, where other processes on the machine could see it.
  export TRP_P12_PASS

  # The keychain on the CI Mac imports the older SHA1/3DES encoding reliably.
  # Both algorithms are still in OpenSSL 3's default provider, so this does
  # not depend on the optional legacy module being present.
  openssl pkcs12 -export \
    -inkey "$KEY" -in "$PEM" -name "Apple Distribution" \
    -certpbe PBE-SHA1-3DES -keypbe PBE-SHA1-3DES -macalg sha1 \
    -out "$P12" -passout env:TRP_P12_PASS

  openssl pkcs12 -in "$P12" -passin env:TRP_P12_PASS -noout 2>/dev/null \
    || die "the .p12 that was just built does not open with its password"
  printf '  %s\n' "$WP12"

  printf '\nPushing four secrets to %s\n' "$REPO"

  base64 -w0 "$P12" 2>/dev/null > "$DIR/.p12.b64" || base64 -i "$P12" > "$DIR/.p12.b64"
  base64 -w0 "$PROFILE" 2>/dev/null > "$DIR/.profile.b64" || base64 -i "$PROFILE" > "$DIR/.profile.b64"

  GH_TOKEN="$GHTOKEN" gh secret set APPLE_CERTIFICATE_P12      --repo "$REPO" < "$DIR/.p12.b64"
  GH_TOKEN="$GHTOKEN" gh secret set APPLE_PROVISIONING_PROFILE --repo "$REPO" < "$DIR/.profile.b64"
  printf '%s' "$TRP_P12_PASS" | GH_TOKEN="$GHTOKEN" gh secret set APPLE_CERTIFICATE_PASSWORD --repo "$REPO"
  printf '%s' "$TEAM"         | GH_TOKEN="$GHTOKEN" gh secret set APPLE_TEAM_ID              --repo "$REPO"
  unset GHTOKEN TRP_P12_PASS

  # The base64 copies are the credential in plain text; do not leave them lying about.
  rm -f "$DIR/.p12.b64" "$DIR/.profile.b64"

  cat <<EOF

All four secrets are set on $REPO, for team $TEAM.

Next: .\tools\ios-signing.ps1 appstore   - the key that lets CI upload to TestFlight.
(This step used $OWNER's GitHub token; your active gh account was not changed.)

$WDIR is gitignored. Keep ios_distribution.key and the .p12 somewhere safe -
losing the key means revoking the certificate and starting this again.
EOF
}

# ------------------------------------------------------------------- step 4

appstore_intro() {
  cat <<EOF
The App Store Connect API key lets CI upload the build to TestFlight.
Signed in as $PUBLISHER, in a browser:

  1. https://appstoreconnect.apple.com/access/integrations/api
     Generate a Team key with the "App Manager" role.
  2. Download the .p8 straight away - Apple offers it only once - and save
     it in $WDIR
     keeping Apple's file name, AuthKey_<KeyID>.p8.
  3. Copy the Issuer ID, shown above the list of keys.

EOF
}

# The key file, by the id given or - when there is only one - by itself.
# Apple names the download AuthKey_<KEYID>.p8, so the file name is the id.
find_p8() {
  KEYID="$(printf '%s' "${TRP_KEY_ID:-}" | tr -d '[:space:]')"
  if [ -z "$KEYID" ]; then
    set -- "$DIR"/AuthKey_*.p8
    if [ ! -f "$1" ]; then
      die "no AuthKey_<KeyID>.p8 in $WDIR yet - download it (step 2 above), then run this again"
    elif [ "$#" -eq 1 ]; then
      KEYID="$(basename "$1" .p8)"
      KEYID="${KEYID#AuthKey_}"
    else
      ask KEYID "Key ID: " "" "there are $# AuthKey files in $WDIR - run again with -KeyId XXXXXXXXXX"
      KEYID="$(printf '%s' "$KEYID" | tr -d '[:space:]')"
    fi
  fi
  printf '%s' "$KEYID" | grep -qE '^[A-Z0-9]{10}$' \
    || die "a Key ID is ten characters, got '$KEYID'"

  P8="$DIR/AuthKey_$KEYID.p8"
  [ -f "$P8" ] || die "no AuthKey_$KEYID.p8 in $DIR - download it from App Store Connect"
  grep -q 'BEGIN PRIVATE KEY' "$P8" || die "$P8 does not look like an App Store Connect key"
  printf 'Key file:  AuthKey_%s.p8   (Key ID %s)\n' "$KEYID" "$KEYID"
}

preflight_appstore() {
  github_access
  appstore_intro
  find_p8
}

step_appstore() {
  github_access

  ISSUER="${TRP_ISSUER_ID:-}"
  [ -n "$ISSUER" ] || appstore_intro
  find_p8

  if [ -z "$ISSUER" ]; then
    ask ISSUER "Issuer ID: " "" "no Issuer ID given - run again with -IssuerId <the id>"
  fi
  ISSUER="$(printf '%s' "$ISSUER" | tr -d '[:space:]')"
  printf '%s' "$ISSUER" | grep -qE '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' \
    || die "an Issuer ID looks like 69a6de70-...-....-............, got '$ISSUER'"

  printf '\nPushing three secrets to %s\n' "$REPO"
  base64 -w0 "$P8" 2>/dev/null > "$DIR/.p8.b64" || base64 -i "$P8" > "$DIR/.p8.b64"
  GH_TOKEN="$GHTOKEN" gh secret set APPSTORE_PRIVATE_KEY --repo "$REPO" < "$DIR/.p8.b64"
  printf '%s' "$ISSUER" | GH_TOKEN="$GHTOKEN" gh secret set APPSTORE_ISSUER_ID --repo "$REPO"
  printf '%s' "$KEYID"  | GH_TOKEN="$GHTOKEN" gh secret set APPSTORE_KEY_ID    --repo "$REPO"
  rm -f "$DIR/.p8.b64"
  unset GHTOKEN

  cat <<EOF

The TestFlight upload secrets are set. Tell Claude, and the signed build will
be started and uploaded.

Before the first upload, the app record has to exist in App Store Connect
(My Apps -> + -> New App) with bundle id $BUNDLE_ID, or the upload is refused
with "no suitable application records were found".
EOF
}

# --------------------------------------------------------------------------

usage() {
  cat <<EOF
Truck Route Planner - iOS signing setup

  .\tools\ios-signing.ps1 csr        create a key and signing request
  .\tools\ios-signing.ps1 secrets    build the .p12 and set the GitHub secrets
  .\tools\ios-signing.ps1 appstore   set the App Store Connect key for TestFlight

(Git Bash: bash tools/ios-signing.sh csr | secrets | appstore)

Run these yourself. The private key and its password stay on this machine.
EOF
}

case "${1:-}" in
  csr)      step_csr ;;
  secrets)  step_secrets ;;
  appstore) step_appstore ;;
  # The checks alone, with no questions and no changes: the PowerShell wrapper
  # runs these first so that nobody types a password for a step that would
  # fail anyway.
  preflight)
    case "${2:-}" in
      secrets)  check_secrets ;;
      appstore) preflight_appstore ;;
      *) die "preflight takes secrets or appstore" ;;
    esac
    ;;
  *) usage ;;
esac
