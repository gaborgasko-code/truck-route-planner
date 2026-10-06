#!/usr/bin/env bash
#
# Truck Route Planner - set up iOS code signing from Windows.
#
#   bash tools/ios-signing.sh csr        # step 1: make a signing request
#   bash tools/ios-signing.sh secrets    # step 3: push the secrets to GitHub
#
# Signing normally starts in Keychain Access on a Mac. This does the same job
# with OpenSSL, which Git Bash already ships, so no Mac is needed at any point.
#
# The private key never leaves this machine and is never printed. Run this
# yourself: nothing here should be pasted into a chat window, and the .p12 and
# its password are the credential that proves an app came from you.
#
# created by Gabor Gasko

set -euo pipefail

# Git Bash rewrites any argument that looks like a Unix path, which turns
# OpenSSL's "/CN=..." subject into "C:/Program Files/Git/CN=..." and makes the
# request fail with a confusing message about the name format.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.signing"
REPO="gaborgasko-code/truck-route-planner"
OWNER="${REPO%%/*}"

# The app is published from Aissa's Apple developer team. A certificate or
# profile made while the browser was signed into a different Apple ID lands on
# that other team, and nothing complains until the signed build fails in CI -
# so the team id in the profile is checked against this before uploading.
# Override with EXPECTED_TEAM=XXXXXXXXXX if the app ever moves.
EXPECTED_TEAM="${EXPECTED_TEAM:-3Q72J6XQYL}"
PUBLISHER="Aissa (aissa.b.code@gmail.com)"

KEY="$DIR/ios_distribution.key"
CSR="$DIR/ios_distribution.certSigningRequest"
CER="$DIR/ios_distribution.cer"
P12="$DIR/ios_distribution.p12"
PROFILE="$DIR/profile.mobileprovision"

die() { printf '\nerror: %s\n' "$1" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

step_csr() {
  have openssl || die "openssl not found (it ships with Git Bash)"
  mkdir -p "$DIR"

  if [ -f "$KEY" ]; then
    printf 'A key already exists at %s\n' "$KEY"
    printf 'Delete it only if you are sure - certificates issued against it stop working.\n'
    exit 1
  fi

  printf 'Creating a private key and a certificate signing request.\n'
  printf 'This app is published from %s, team %s.\n\n' "$PUBLISHER" "$EXPECTED_TEAM"
  read -r -p "Apple ID email of the publishing account [aissa.b.code@gmail.com]: " EMAIL
  EMAIL="${EMAIL:-aissa.b.code@gmail.com}"

  openssl genrsa -out "$KEY" 2048 2>/dev/null
  openssl req -new -key "$KEY" -out "$CSR" \
    -subj "/emailAddress=$EMAIL/CN=Truck Route Planner Distribution/C=ES"

  chmod 600 "$KEY" 2>/dev/null || true

  cat <<EOF

Done. Two files in $DIR

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
       $CER

  4. https://developer.apple.com/account/resources/profiles/add
     Choose "App Store Connect" distribution, app id online.ggabor.planificador
     (create the App ID first if it does not exist yet).
     Download and save it as:
       $PROFILE

Then run:  .\tools\ios-signing.ps1 secrets      (PowerShell)
           bash tools/ios-signing.sh secrets  (Git Bash)
EOF
}

step_secrets() {
  have openssl || die "openssl not found"
  have gh || die "the GitHub CLI is not on PATH"

  [ -f "$KEY" ] || die "no private key - run the csr step first (PowerShell: .\tools\ios-signing.ps1 csr)"
  [ -f "$CER" ] || die "missing $CER - download it from the Apple developer portal"
  [ -f "$PROFILE" ] || die "missing $PROFILE - download it from the Apple developer portal"

  # Check GitHub access now, before asking for anything. gh may hold several
  # accounts and the active one need not be the repository owner - setting a
  # secret then fails with a 403 as the very last step, after all the Apple
  # work is done. Use the owner's token for these commands only, so the
  # globally active account is left exactly as it was.
  printf 'Checking GitHub access to %s\n' "$REPO"
  GHTOKEN="$(gh auth token --user "$OWNER" 2>/dev/null || true)"
  if [ -z "$GHTOKEN" ]; then
    die "gh is not signed in as $OWNER. Run: gh auth login   (and choose $OWNER)"
  fi
  ADMIN="$(GH_TOKEN="$GHTOKEN" gh api "repos/$REPO" --jq '.permissions.admin' 2>/dev/null || true)"
  [ "$ADMIN" = "true" ] || die "$OWNER cannot manage secrets on $REPO"
  printf '  ok - using %s for this step; your active gh account is unchanged\n\n' "$OWNER"

  printf 'Building the .p12 bundle.\n'
  printf 'Choose a password for it. You will not see it as you type.\n\n'
  read -r -s -p "Password for the .p12: " P12PASS; printf '\n'
  read -r -s -p "Repeat it: " P12PASS2; printf '\n\n'
  [ "$P12PASS" = "$P12PASS2" ] || die "the two passwords differ"
  [ -n "$P12PASS" ] || die "an empty password will not work in CI"

  # Apple hands out a DER .cer; the .p12 needs the certificate and the key together.
  openssl x509 -inform DER -in "$CER" -out "$DIR/cert.pem" 2>/dev/null \
    || openssl x509 -inform PEM -in "$CER" -out "$DIR/cert.pem"

  openssl pkcs12 -export \
    -inkey "$KEY" -in "$DIR/cert.pem" \
    -out "$P12" -passout "pass:$P12PASS" \
    -legacy 2>/dev/null \
    || openssl pkcs12 -export -inkey "$KEY" -in "$DIR/cert.pem" \
         -out "$P12" -passout "pass:$P12PASS"

  rm -f "$DIR/cert.pem"

  printf 'Reading your team id from the provisioning profile.\n'
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
    printf '  could not read it automatically.\n'
    read -r -p "  Your ten-character Team ID: " TEAM
  else
    printf '  found team id: %s\n' "$TEAM"
  fi
  case "$TEAM" in
    [A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]) ;;
    *) die "a team id is ten characters, got '$TEAM'" ;;
  esac

  if [ "$TEAM" != "$EXPECTED_TEAM" ]; then
    printf '\n  WARNING: this profile belongs to team %s, not %s (%s).\n' \
      "$TEAM" "$EXPECTED_TEAM" "$PUBLISHER"
    printf '  The usual cause is a browser still signed into another Apple ID when\n'
    printf '  the certificate or profile was made. Signing would then fail in CI.\n\n'
    read -r -p "  Continue with team $TEAM anyway? [y/N] " GO
    case "$GO" in y|Y|yes|YES) ;; *) die "stopped - re-create the profile on team $EXPECTED_TEAM" ;; esac
  fi

  printf '\nPushing four secrets to %s\n' "$REPO"

  base64 -w0 "$P12" 2>/dev/null > "$DIR/.p12.b64" || base64 -i "$P12" > "$DIR/.p12.b64"
  base64 -w0 "$PROFILE" 2>/dev/null > "$DIR/.profile.b64" || base64 -i "$PROFILE" > "$DIR/.profile.b64"

  GH_TOKEN="$GHTOKEN" gh secret set APPLE_CERTIFICATE_P12      --repo "$REPO" < "$DIR/.p12.b64"
  GH_TOKEN="$GHTOKEN" gh secret set APPLE_PROVISIONING_PROFILE --repo "$REPO" < "$DIR/.profile.b64"
  printf '%s' "$P12PASS" | GH_TOKEN="$GHTOKEN" gh secret set APPLE_CERTIFICATE_PASSWORD --repo "$REPO"
  printf '%s' "$TEAM"    | GH_TOKEN="$GHTOKEN" gh secret set APPLE_TEAM_ID              --repo "$REPO"
  unset GHTOKEN

  # The base64 copies are the credential in plain text; do not leave them lying about.
  rm -f "$DIR/.p12.b64" "$DIR/.profile.b64"

  cat <<EOF

All four secrets are set on $REPO, for team $TEAM.

Tell Claude, and the signed build will be started and watched from there.
(This step used $OWNER's GitHub token; your active gh account was not changed.)

$DIR is gitignored. Keep ios_distribution.key and the .p12 somewhere safe -
losing the key means revoking the certificate and starting this again.
EOF
}

case "${1:-}" in
  csr)     step_csr ;;
  secrets) step_secrets ;;
  *)
    cat <<EOF
Truck Route Planner - iOS signing setup

  .\tools\ios-signing.ps1 csr        create a key and signing request
  .\tools\ios-signing.ps1 secrets    build the .p12 and set the GitHub secrets

(Git Bash: bash tools/ios-signing.sh csr | secrets)

Run these yourself. The private key and its password stay on this machine.
EOF
    ;;
esac
