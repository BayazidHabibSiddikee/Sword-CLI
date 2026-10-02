#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != --isolated ]]; then
  exec /usr/bin/env -i PATH="$PATH" /bin/bash "$0" --isolated
fi
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
test_root=$(mktemp -d /tmp/mac-release-canary-test.XXXXXX)
trap 'rm -rf "$test_root"' EXIT

run_case() (
  case_name=$1
  case_root="$test_root/$case_name"
  mkdir -p "$case_root"
  touch "$case_root/release.keychain" "$case_root/default.keychain"
  node - "$case_root/signature" "$case_name" <<'NODE'
const fs = require('node:fs');
const [file, name] = process.argv.slice(2);
const authority = name === 'wrong-authority' ? 'Apple Development' : 'Developer ID Application';
const tail = name === 'large' ? 'x'.repeat(2 * 1024 * 1024) : 'short';
fs.writeFileSync(file, `Executable=synthetic-probe\nAuthority=${authority}: Fixture (TEAM)\nInfo=${tail}\n`);
NODE
  source "$script_dir/lib/mac_release.sh"

  # Exercise the production canary without accessing real credentials or keychains.
  security() {
    case "$1" in
      find-key) printf 'keychain: fixture\n' ;;
      unlock-keychain|set-key-partition-list|set-keychain-settings) return 0 ;;
      *) return 94 ;;
    esac
  }
  codesign() {
    case "$1" in
      --force) return 0 ;;
      --verify) [[ "$case_name" != untrusted ]] ;;
      -dvvv) cat "$case_root/signature" ;;
      *) return 94 ;;
    esac
  }
  shlock() { return 0; }
  expect() { return 94; }
  stat() {
    [[ "$1 $2 $3" == '-L -f %d:%i' ]] || return 94
    node -e 'const s=require("fs").statSync(process.argv[1]); console.log(`${s.dev}:${s.ino}`)' "$4"
  }
  mktemp() { /usr/bin/mktemp -d "$case_root/${2##*/}"; }
  mac_release_user_security() {
    case "$1" in
      default-keychain) printf '"%s"\n' "$case_root/default.keychain" ;;
      list-keychains)
        [[ "$*" == *' -s '* ]] || printf '"%s"\n' "$case_root/default.keychain"
        ;;
      *) return 94 ;;
    esac
  }
  mac_release_security_with_password() { shift; "$@"; }
  mac_release_run_with_timeout() { shift; "$@"; }
  mac_release_restore_codesign_keychains() {
    [[ -z "${MAC_RELEASE_CODESIGN_SHIM_DIR:-}" ]] || rm -rf "$MAC_RELEASE_CODESIGN_SHIM_DIR"
  }
  MAC_RELEASE_CODESIGN_KEYCHAIN="$case_root/release.keychain"
  MAC_RELEASE_CODESIGN_IDENTITY='Developer ID Application: Fixture (TEAM)'
  MAC_RELEASE_CODESIGN_KEYCHAIN_MANAGED=1
  MAC_RELEASE_CODESIGN_PASSWORDLESS=1
  mac_release_prepare_codesign_keychain
  [[ -x "$MAC_RELEASE_CODESIGN_SHIM_DIR/codesign" ]]
  mac_release_restore_codesign_keychains
)

for case_name in short large; do
  if ! run_case "$case_name" >"$test_root/$case_name.log" 2>&1; then
    cat "$test_root/$case_name.log" >&2
    echo "valid $case_name signature report was rejected" >&2
    exit 1
  fi
done
for case_name in wrong-authority untrusted; do
  if run_case "$case_name" >"$test_root/$case_name.log" 2>&1; then
    echo "invalid $case_name signing canary was accepted" >&2
    exit 1
  fi
done
grep -q 'not signed by a Developer ID Application identity' "$test_root/wrong-authority.log"
grep -q 'failed Apple trust validation' "$test_root/untrusted.log"
echo 'mac release canary tests passed'
