#!/usr/bin/env bash
# Synthetic only. Optional argument: library under test.
set -euo pipefail

if [[ "${1:-}" != --isolated ]]; then
  exec /usr/bin/env -i PATH=/usr/bin:/bin /bin/bash "$0" --isolated "$@"
fi
shift
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
library=${1:-$script_dir/lib/mac_release.sh}
test_root=$(mktemp -d /tmp/mac-release-assets-test.XXXXXX)
trap 'rm -rf "$test_root"' EXIT
source "$library"

ROOT=$test_root
MAC_RELEASE_REPO=fixture/release
MAC_RELEASE_APP_ZIP='Fixture-${MARKETING_VERSION}.zip'
MAC_RELEASE_DSYM_ZIP='Fixture-${MARKETING_VERSION}.dSYM.zip'
MAC_RELEASE_EXTRA_ASSET_PATTERNS='^Fixture-${MARKETING_VERSION}-arm64[.]tar[.]gz$'
MARKETING_VERSION=9.9.9

gh() {
  [[ "$*" == '--live release view v1.2.3 --repo fixture/release --json assets --jq .assets[].name' ]] || {
    echo 'unexpected GitHub call in synthetic release test' >&2
    return 94
  }
  cat "$asset_file"
}

asset_file="$test_root/assets"
printf '%s\n' 'Fixture-1.2.3.zip' 'Fixture-1.2.3.dSYM.zip' 'Fixture-1.2.3-arm64.tar.gz' >"$asset_file"
for case_name in short large; do
  if [[ "$case_name" == large ]]; then
    # Put the match before several megabytes of names so an early reader exit breaks the producer.
    awk 'BEGIN { for (i = 0; i < 131072; i++) printf "unrelated-%06d-artifact-with-a-long-filename.tar.gz\n", i }' \
      >>"$asset_file"
  fi
  if ! (check_assets v1.2.3 Fixture-) >"$test_root/$case_name.log" 2>&1; then
    cat "$test_root/$case_name.log" >&2
    echo "valid $case_name release asset list was rejected" >&2
    exit 1
  fi
done

MAC_RELEASE_EXTRA_ASSET_PATTERNS='^Fixture-${MARKETING_VERSION}-missing[.]tar[.]gz$'
if (check_assets v1.2.3 Fixture-) >"$test_root/missing.log" 2>&1; then
  echo 'release with a missing extra asset was accepted' >&2
  exit 1
fi
grep -Fq 'ERROR: extra asset missing on release v1.2.3: ^Fixture-1.2.3-missing[.]tar[.]gz$' \
  "$test_root/missing.log"
echo 'mac release asset tests passed'
