#!/usr/bin/env bash
# Synthetic only. Every download, signature check, and wait is mocked.
set -euo pipefail

if [[ "${1:-}" != --isolated ]]; then
  exec /usr/bin/env -i PATH=/usr/bin:/bin /bin/bash "$0" --isolated "$@"
fi
shift
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
library=${1:-$script_dir/lib/mac_release.sh}
test_root=$(mktemp -d /tmp/mac-release-download-test.XXXXXX)
trap 'rm -rf "$test_root"' EXIT

cat >"$test_root/runner" <<'RUNNER'
#!/bin/bash -p
set -euo pipefail
source "$LIBRARY"
curl() {
  [[ " $* " == *' --fail '* && " $* " == *' --max-time 300 '* ]]
  local dest= arg attempt
  while [[ $# -gt 0 ]]; do
    arg=$1
    shift
    if [[ "$arg" == --output ]]; then dest=$1; shift; fi
  done
  printf '%s\n' "$dest" >"$FIXTURE/download-path"
  attempt=$(cat "$FIXTURE/attempts")
  attempt=$((attempt + 1))
  printf '%s\n' "$attempt" >"$FIXTURE/attempts"
  case "$SCENARIO:$attempt" in
    delayed:1|unavailable:*) printf 404; return 22 ;;
    delayed:2) printf 503; return 22 ;;
    transport:1) printf 000; return 28 ;;
    forbidden:*) printf 403; return 22 ;;
    transport-forbidden:*) printf 403; return 56 ;;
    transport-unauthorized:*) printf 401; return 56 ;;
  esac
  printf abcdef >"$dest"
  printf 200
}
sleep() { printf '%s\n' "$1" >>"$FIXTURE/delays"; }
stat() {
  [[ "$1" == -f%z ]]
  wc -c <"$2" | tr -d ' '
}
sign_update() {
  [[ "$1" == --verify && "$(<"$2")" == abcdef && "$3" == fixture-signature ]]
  printf 'signature checked\n' >"$FIXTURE/signature"
  [[ "$SCENARIO" != bad-signature ]] || return 91
}
verify_enclosure https://example.invalid/Fixture.zip fixture-signature '' "${EXPECTED_LENGTH:-6}"
RUNNER
chmod +x "$test_root/runner"

for scenario in delayed transport unavailable forbidden transport-forbidden transport-unauthorized bad-length bad-signature; do
  fixture="$test_root/$scenario"
  mkdir "$fixture"
  printf '0\n' >"$fixture/attempts"
  expected_length=6
  [[ "$scenario" != bad-length ]] || expected_length=7
  result=0
  LIBRARY="$library" FIXTURE="$fixture" SCENARIO="$scenario" EXPECTED_LENGTH="$expected_length" \
    "$test_root/runner" >"$fixture/output" 2>&1 || result=$?
  rm -f "$(<"$fixture/download-path")"
  case "$scenario" in
    delayed)
      [[ "$result" == 0 && "$(<"$fixture/attempts")" == 3 && -f "$fixture/signature" ]]
      printf '2\n4\n' >"$fixture/expected-delays"
      cmp "$fixture/expected-delays" "$fixture/delays"
      ;;
    transport) [[ "$result" == 0 && "$(<"$fixture/attempts")" == 2 && -f "$fixture/signature" ]] ;;
    unavailable)
      [[ "$result" == 22 && "$(<"$fixture/attempts")" == 6 && ! -f "$fixture/signature" ]]
      printf '2\n4\n8\n16\n32\n' >"$fixture/expected-delays"
      cmp "$fixture/expected-delays" "$fixture/delays"
      ;;
    forbidden) [[ "$result" == 22 && "$(<"$fixture/attempts")" == 1 && ! -f "$fixture/signature" ]] ;;
    transport-forbidden|transport-unauthorized)
      [[ "$result" == 56 && "$(<"$fixture/attempts")" == 1 && ! -f "$fixture/signature" && ! -f "$fixture/delays" ]]
      ;;
    bad-length)
      [[ "$result" != 0 && "$(<"$fixture/attempts")" == 1 && ! -f "$fixture/signature" ]]
      grep -Fq 'Length mismatch' "$fixture/output"
      ;;
    bad-signature) [[ "$result" == 91 && "$(<"$fixture/attempts")" == 1 && -f "$fixture/signature" ]] ;;
  esac
done

echo 'mac release download tests passed'
