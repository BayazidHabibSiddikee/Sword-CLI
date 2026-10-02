#!/bin/bash
set -euo pipefail

usage() {
  printf 'usage: %s /path/to/Xcode.app [/path/to/rollback.app]\n' "${0##*/}" >&2
  exit 2
}
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }
[[ $# -ge 1 && $# -le 2 ]] || usage
app=$1
rollback=${2-}
[[ $app == /* && ! -L $app && -d $app/Contents/Developer ]] || usage
app=$(cd "$app" && pwd -P)
if [[ -n $rollback ]]; then
  [[ $rollback == /* && ! -L $rollback && -d $rollback/Contents/Developer ]] || usage
  rollback=$(cd "$rollback" && pwd -P)
  case "$rollback/" in "$app/"*) fail 'rollback must be separate from the installed app' ;; esac
  case "$app/" in "$rollback/"*) fail 'installed app must be separate from the rollback' ;; esac
fi
timeout_bin=$(command -v timeout || command -v gtimeout || true)
[[ -n $timeout_bin ]] || fail 'GNU timeout is required; retain the rollback copy and install coreutils before retrying'

# Ignore the caller's per-process workaround when reading the persistent selection.
if ! selected_developer=$("$timeout_bin" -s KILL 5 env -u DEVELOPER_DIR xcode-select -p); then
  fail 'cannot determine xcode-select target; retain both bundles and inspect selection before proceeding'
fi
if [[ -d $selected_developer ]]; then
  selected_developer=$(cd "$selected_developer" && pwd -P)
fi
selected=no
[[ $selected_developer != "$app/Contents/Developer" ]] || selected=yes
printf 'app\t%s\nselected\t%s\n' "$app" "$selected"

# One deadline covers all probes, including a hung dyld startup.
if "$timeout_bin" -s KILL 20 /bin/bash -c '
  app=$1
  selected=$2
  export DEVELOPER_DIR="$app/Contents/Developer"
  failed=0
  probe() {
    printf "probe\t%s\n" "$1"
    if "$@"; then return; fi
    printf "ERROR: probe failed: %s\n" "$1" >&2
    failed=1
  }
  probe "$DEVELOPER_DIR/usr/bin/git" --version
  probe "$DEVELOPER_DIR/usr/bin/python3" -V
  if [[ $selected == yes ]]; then
    probe xcrun --find git
  fi
  exit "$failed"
' xcode-smoke "$app" "$selected"; then
  printf 'smoke_status\tpassed\n'
  exit 0
else
  probe_exit=$?
fi

printf 'ERROR: Xcode CLI smoke check failed (exit %s; 20-second deadline): %s\n' "$probe_exit" "$app" >&2
printf 'Workaround: export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer\n' >&2
if [[ $selected == no ]]; then
  printf 'smoke_status\tfailed-kept\nrollback\t%s\n' "$rollback"
  printf 'ERROR: unselected app retained; record this failure and do not select it.\n' >&2
  exit 1
fi
if [[ -z $rollback ]]; then
  printf 'smoke_status\tfailed-no-rollback\n'
  printf 'ERROR: SELECTED Xcode failed and no rollback copy was supplied; immediate operator recovery required.\n' >&2
  exit 1
fi

# Moves preserve the failed bundle for diagnosis without duplicating a large app.
failed_dir=$(mktemp -d "${app}.failed-smoke.XXXXXX")
mv "$app" "$failed_dir/bundle.app"
if mv "$rollback" "$app"; then
  printf 'smoke_status\tfailed-restored\nfailed_bundle\t%s/bundle.app\n' "$failed_dir"
  printf 'ERROR: SELECTED Xcode failed; restored rollback to %s without changing xcode-select.\n' "$app" >&2
else
  if [[ ! -e $app ]]; then
    mv "$failed_dir/bundle.app" "$app" || true
  fi
  fail "rollback restore failed; inspect $app, $rollback and $failed_dir immediately"
fi
exit 1
