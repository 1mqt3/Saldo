#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 4 ]]; then
  echo 'Usage: sign-android.sh unsigned.apk signed.apk release.p12 password-file' >&2
  exit 2
fi

unsigned=$1
signed=$2
keystore=$3
password_file=$4
project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
tools="${ANDROID_HOME:-${ANDROID_SDK_ROOT:?Android SDK path is required}}/build-tools/36.0.0"
temp_dir=$(mktemp -d)
trap 'rm -rf -- "$temp_dir"' EXIT
aligned="$temp_dir/aligned.apk"

"$tools/zipalign" -f -P 16 4 "$unsigned" "$aligned"
"$tools/apksigner" sign --ks "$keystore" --ks-key-alias saldo \
  --ks-pass "file:$password_file" --v4-signing-enabled false --out "$temp_dir/signed.apk" "$aligned"
"$tools/zipalign" -c -P 16 4 "$temp_dir/signed.apk"
certificate=$("$tools/apksigner" verify --print-certs "$temp_dir/signed.apk" |
  awk -F ': ' '/^Signer #1 certificate SHA-256 digest:/ { print tolower($2) }')
expected=$(tr -d '[:space:]' < "$project_dir/android/signing-certificate.sha256")
if [[ ! "$certificate" =~ ^[[:xdigit:]]{64}$ || "$certificate" != "$expected" ]]; then
  echo 'APK signing certificate does not match the permanently pinned Saldo certificate.' >&2
  exit 1
fi
mv -- "$temp_dir/signed.apk" "$signed"
echo "Verified Saldo signing certificate: $certificate"
