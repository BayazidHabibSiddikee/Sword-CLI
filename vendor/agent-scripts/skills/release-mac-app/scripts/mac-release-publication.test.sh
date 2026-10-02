#!/usr/bin/env bash
# Synthetic only: local Git remotes and mocked GitHub, signing, and downloads.
set -euo pipefail

if [[ "${1:-}" != --isolated ]]; then
  exec /usr/bin/env -i PATH=/usr/bin:/bin /bin/bash "$0" --isolated "$@"
fi
shift
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
library=${1:-$script_dir/lib/mac_release.sh}
test_root=$(mktemp -d /tmp/mac-release-publication-test.XXXXXX)
trap 'rm -rf "$test_root"' EXIT

cat >"$test_root/runner" <<'RUNNER'
#!/bin/bash -p
set -euo pipefail
source "$LIBRARY"
cd "$FIXTURE/repo"

record() { printf '%s\n' "$*" >>"$FIXTURE/events"; }
mktemp() {
  local temp_path
  temp_path=$(command mktemp "$@")
  printf '%s\n' "$temp_path" >>"$FIXTURE/temp-files"
  printf '%s\n' "$temp_path"
}
git() {
  record "git $*"
  if [[ "$SCENARIO" == push-failure && "$*" == "push origin HEAD:$RELEASE_BRANCH" ]]; then
    return 97
  fi
  command git "$@"
}
gh() {
  case "$1 $2" in
    'api --method')
      case "$3 $4" in
        'POST repos/fixture/release/releases')
          [[ " $* " == *' -F draft=true '* ]]
          [[ " $* " == *' -f tag_name=v1.2.3 '* ]]
          [[ " $* " == *' -f name=Fixture 1.2.3 '* ]]
          for arg in "$@"; do
            if [[ "$arg" == body=@* ]]; then
              cp "${arg#body=@}" "$FIXTURE/notes"
            fi
          done
          printf 'draft\n' >"$FIXTURE/release-state"
          record draft
          printf '42\n'
          ;;
        'PATCH repos/fixture/release/releases/42')
          [[ " $* " == *' -F draft=false '* ]]
          [[ -f "$FIXTURE/uploaded" ]]
          printf 'published\n' >"$FIXTURE/release-state"
          record publish
          [[ "$SCENARIO" != publish-response-failure ]] || return 95
          ;;
        *) echo 'unexpected API call' >&2; return 94 ;;
      esac
      ;;
    'release upload')
      [[ "$(<"$FIXTURE/release-state")" == draft ]]
      [[ "$3" == v1.2.3 && "$4" == Fixture-1.2.3.zip ]]
      [[ -f "$4" ]]
      if [[ "$SCENARIO" != app-only ]]; then
        [[ "$5" == Fixture-1.2.3.dSYM.zip && -f "$5" ]]
      fi
      record upload
      [[ "$SCENARIO" != upload-failure ]] || return 93
      touch "$FIXTURE/uploaded"
      ;;
    *) echo 'unexpected GitHub call' >&2; return 94 ;;
  esac
}

mac_release_load() {
  ROOT="$FIXTURE/repo"
  MARKETING_VERSION=1.2.3 BUILD_NUMBER=123 APP_NAME=Fixture
  MAC_RELEASE_REPO=fixture/release MAC_RELEASE_BUNDLE_ID=example.fixture
  MAC_RELEASE_RELEASE_BRANCH=$RELEASE_BRANCH MAC_RELEASE_TAG_FORCE=0
  APPCAST=appcast.xml APP_ZIP=Fixture-1.2.3.zip DSYM_ZIP=Fixture-1.2.3.dSYM.zip
  [[ "$SCENARIO" != app-only ]] || DSYM_ZIP=
  FEED_URL=https://example.invalid/appcast.xml TAG=v1.2.3 ARTIFACT_PREFIX=Fixture-
  MAC_RELEASE_PACKAGE_CMD=fixture-package
}
mac_release_load_1password_env() { :; }
mac_release_key_args_and_validate() {
  printf 'synthetic signing key\n' >"$FIXTURE/signing-key"
  printf -v "$2" '%s' "$FIXTURE/signing-key"
}
mac_release_prepare_codesign_keychain() { :; }
mac_release_restore_codesign_keychains() { record keychain-cleanup; }
clear_sparkle_caches() { :; }
mac_release_run_cmd() {
  [[ "$1" == package ]] || return 0
  printf 'app archive\n' >"$APP_ZIP"
  [[ -z "$DSYM_ZIP" ]] || printf 'symbols\n' >"$DSYM_ZIP"
}
wait_for_assets() {
  [[ "$(<"$FIXTURE/release-state")" == published ]]
  record extra-assets
  [[ "$SCENARIO" != assets-failure ]] || return 96
}

case "$1" in
  release) mac_release_release ;;
  make-appcast)
    record appcast
    printf 'new appcast\n' >appcast.xml
    ;;
  verify-appcast)
    [[ "$(<"$FIXTURE/release-state")" == published ]]
    record verify
    if [[ "$SCENARIO" == verify-failure ]]; then
      printf 'concurrent change\n' >source.txt
      return_code=96
      exit "$return_code"
    fi
    ;;
  *) exit 94 ;;
esac
RUNNER
chmod +x "$test_root/runner"

for scenario in success app-only upload-failure publish-response-failure verify-failure assets-failure push-failure; do
  fixture="$test_root/$scenario"
  mkdir -p "$fixture/repo"
  branch=main
  [[ "$scenario" != app-only ]] || branch=stable
  git init -q --bare "$fixture/remote.git"
  git -C "$fixture/repo" init -q -b "$branch"
  git -C "$fixture/repo" config user.name Fixture
  git -C "$fixture/repo" config user.email fixture@example.invalid
  git -C "$fixture/repo" config commit.gpgsign false
  git -C "$fixture/repo" config tag.gpgsign false
  git -C "$fixture/repo" remote add origin "$fixture/remote.git"
  cat >"$fixture/repo/CHANGELOG.md" <<'NOTES'
# Changelog

## 1.2.3

### Highlights

- First highlight.

### Fixed

- Second item.

## 1.2.2 — 2026-01-01

- Previous release.
NOTES
  cat >"$fixture/repo/appcast.xml" <<'APPCAST'
<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><item><sparkle:shortVersionString>1.2.2</sparkle:shortVersionString><sparkle:version>122</sparkle:version></item></channel></rss>
APPCAST
  printf 'original\n' >"$fixture/repo/source.txt"
  git -C "$fixture/repo" add .
  git -C "$fixture/repo" commit -qm fixture
  git -C "$fixture/repo" push -q origin "$branch"
  initial_head=$(git -C "$fixture/repo" rev-parse HEAD)
  result=0
  LIBRARY="$library" FIXTURE="$fixture" SCENARIO="$scenario" RELEASE_BRANCH="$branch" \
    "$test_root/runner" release >"$fixture/output" 2>&1 || result=$?
  if [[ "$scenario" == success || "$scenario" == app-only ]]; then
    [[ "$result" == 0 ]] || { cat "$fixture/output" >&2; exit 1; }
  else
    [[ "$result" != 0 ]] || { echo "$scenario unexpectedly succeeded" >&2; exit 1; }
    grep -Fq 'preserving release, tags, and appcast commit' "$fixture/output" || {
      cat "$fixture/output" >&2
      echo "$scenario lost release recovery state" >&2
      exit 1
    }
  fi
  [[ ! -e "$fixture/signing-key" ]] || { echo "$scenario leaked signing key" >&2; exit 1; }
  while IFS= read -r temp_path; do
    [[ ! -e "$temp_path" ]] || { echo "$scenario leaked temporary file" >&2; exit 1; }
  done <"$fixture/temp-files"
  current_head=$(git -C "$fixture/repo" rev-parse HEAD)
  [[ "$current_head" != "$initial_head" ]]
  [[ "$(git -C "$fixture/repo" rev-parse v1.2.3^{})" == "$current_head" ]]
  [[ "$(git --git-dir="$fixture/remote.git" rev-parse v1.2.3^{})" == "$current_head" ]]
  [[ "$(<"$fixture/repo/appcast.xml")" == 'new appcast' ]]
  if [[ "$scenario" == upload-failure ]]; then
    [[ "$(<"$fixture/release-state")" == draft ]]
  else
    [[ "$(<"$fixture/release-state")" == published ]]
  fi
  if [[ "$scenario" == success || "$scenario" == app-only ]]; then
    [[ "$(git --git-dir="$fixture/remote.git" rev-parse "$branch")" == "$current_head" ]]
    grep -E '^(draft|upload|publish|verify|extra-assets|git push origin HEAD:)' "$fixture/events" \
      >"$fixture/order"
    printf '%s\n' draft upload publish verify extra-assets "git push origin HEAD:$branch" >"$fixture/expected-order"
    cmp "$fixture/expected-order" "$fixture/order"
  else
    [[ "$(git --git-dir="$fixture/remote.git" rev-parse "$branch")" == "$initial_head" ]]
  fi
  if [[ "$scenario" == verify-failure ]]; then
    [[ "$(<"$fixture/repo/source.txt")" == 'concurrent change' ]]
  fi
  if grep -E 'reset|--delete|tag -d|release delete' "$fixture/events"; then
    echo 'release recovery attempted destructive rollback' >&2
    exit 1
  fi
  cat >"$fixture/expected-notes" <<'NOTES'
### Highlights

- First highlight.

### Fixed

- Second item.
NOTES
  cmp "$fixture/expected-notes" "$fixture/notes"
done

# shellcheck disable=SC1090 # optional library under test
source "$library"
# shellcheck disable=SC2034 # globals consumed by the loaded library
mac_release_load() { APP_NAME=Fixture MAC_RELEASE_REPO=fixture/release; }
mac_release_changelog_html 1.2.3 "$test_root/success/repo/CHANGELOG.md" >"$test_root/notes.html"
grep -Fq '<h3>Highlights</h3>' "$test_root/notes.html"

echo 'mac release publication tests passed'
