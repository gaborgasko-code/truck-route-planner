#!/usr/bin/env bash
#
# Truck Route Planner - create the Google Play upload key and hand it to CI.
#
#   .\tools\android-signing.ps1        (PowerShell)
#   bash tools/android-signing.sh      (Git Bash)
#
# Google Play signs the app people download with its own key (Play App
# Signing). What we keep is the *upload key*: it proves an upload comes from
# us. This makes one with the JDK's keytool, with a long random password that
# nobody has to type, stores both in .signing/ (gitignored) and sets them as
# secrets on Aissa's repository, where the Android workflow signs with them.
#
# Run it once. A second run keeps the existing key and only re-sends the
# secrets: replacing the key would mean asking Google to reset it.
#
# Nothing secret is printed. Keep .signing/ backed up.

set -euo pipefail
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && { pwd -W 2>/dev/null || pwd; })"
DIR="$ROOT/.signing"
REPO="aissab-code/planificador"
OWNER="${REPO%%/*}"
ALIAS="upload"
KS="$DIR/android-upload.keystore"
PWFILE="$DIR/android-upload-password.txt"

die() { printf '\nerror: %s\n' "$1" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
win() { cygpath -w "$1" 2>/dev/null || printf '%s' "$1"; }

# keytool ships with every JDK. Look where Windows installers put them.
find_keytool() {
  if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/keytool" ]; then printf '%s' "$JAVA_HOME/bin/keytool"; return; fi
  if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/keytool.exe" ]; then printf '%s' "$JAVA_HOME/bin/keytool.exe"; return; fi
  if have keytool; then command -v keytool; return; fi
  local c
  for c in "/c/Program Files/Microsoft"/jdk*/bin/keytool.exe \
           "/c/Program Files/Eclipse Adoptium"/*/bin/keytool.exe \
           "/c/Program Files/Java"/*/bin/keytool.exe \
           "$HOME/AppData/Local/Programs/Java"/*/bin/keytool.exe \
           "/c/Program Files/Android/Android Studio/jbr/bin/keytool.exe"; do
    [ -x "$c" ] && { printf '%s' "$c"; return; }
  done
  return 1
}

github_access() {
  have gh || die "the GitHub CLI is not on PATH"
  printf 'Checking GitHub access to %s\n' "$REPO"
  GHTOKEN="$(gh auth token --user "$OWNER" 2>/dev/null || true)"
  [ -n "$GHTOKEN" ] || die "gh is not signed in as $OWNER. Run: gh auth login   (and choose $OWNER)"
  ADMIN="$(GH_TOKEN="$GHTOKEN" gh api "repos/$REPO" --jq '.permissions.admin' 2>/dev/null || true)"
  [ "$ADMIN" = "true" ] || die "$OWNER cannot manage secrets on $REPO"
  printf '  ok - using %s for this step; your active gh account is unchanged\n\n' "$OWNER"
}

KEYTOOL="$(find_keytool)" || die "no keytool found - install a JDK (for example Microsoft OpenJDK 21) and run this again"
have openssl || die "openssl not found (it ships with Git Bash)"
github_access
mkdir -p "$DIR"

if [ -f "$KS" ]; then
  [ -f "$PWFILE" ] || die "the keystore exists but $(win "$PWFILE") is missing - restore it from your backup"
  printf 'An upload key already exists; keeping it and re-sending the secrets.\n'
  ANDROID_PW="$(cat "$PWFILE")"
else
  printf 'Creating the Google Play upload key.\n'
  # 32 letters and digits from OpenSSL's random generator.
  ANDROID_PW="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32)"
  [ "${#ANDROID_PW}" -eq 32 ] || die "could not generate a password"
  export ANDROID_PW
  # The password goes to keytool through the environment, not its command line.
  "$KEYTOOL" -genkeypair -noprompt -storetype PKCS12 \
    -keystore "$KS" -alias "$ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Aissa Bamogo Redondo, O=Aissa Apps, C=ES" \
    -storepass:env ANDROID_PW -keypass:env ANDROID_PW >/dev/null 2>&1 \
    || die "keytool could not create the key"
  printf '%s' "$ANDROID_PW" > "$PWFILE"
  chmod 600 "$PWFILE" "$KS" 2>/dev/null || true
fi
export ANDROID_PW

# The public half, which Play Console shows as the upload certificate.
FINGERPRINT="$("$KEYTOOL" -list -v -keystore "$KS" -alias "$ALIAS" -storepass:env ANDROID_PW 2>/dev/null \
  | grep -i 'SHA256:' | head -1 | sed 's/^[^:]*: *//' || true)"
[ -n "$FINGERPRINT" ] || die "the keystore does not open with the saved password"

printf '\nPushing three secrets to %s\n' "$REPO"
B64="$DIR/.android-keystore.b64"
trap 'rm -f "$B64"' EXIT
base64 -w0 "$KS" 2>/dev/null > "$B64" || base64 -i "$KS" > "$B64"
GH_TOKEN="$GHTOKEN" gh secret set ANDROID_KEYSTORE_B64 --repo "$REPO" < "$B64"
printf '%s' "$ANDROID_PW" | GH_TOKEN="$GHTOKEN" gh secret set ANDROID_KEYSTORE_PASSWORD --repo "$REPO"
printf '%s' "$ALIAS" | GH_TOKEN="$GHTOKEN" gh secret set ANDROID_KEY_ALIAS --repo "$REPO"
rm -f "$B64"
unset GHTOKEN ANDROID_PW

cat <<EOF

Done. The upload key is set on $REPO.

  $(win "$KS")
  $(win "$PWFILE")

Back up both files somewhere safe (they are not in git). Losing them means
asking Google Play support to reset the upload key.

Upload certificate SHA-256 (public - Play Console shows the same one):
  $FINGERPRINT

Tell Claude, and the signed Android build will be started.
EOF
