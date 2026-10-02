#!/bin/bash
set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd -P)
helper="$script_dir/xcode-post-install-smoke.sh"
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/xcode-smoke-test.XXXXXX")
work_dir=$(cd "$work_dir" && pwd -P)
trap 'rm -rf "$work_dir"' EXIT
mkdir "$work_dir/bin"
export PATH="$work_dir/bin:$PATH"
export SMOKE_XCRUN_LOG="$work_dir/xcrun.log"
export SMOKE_XCRUN_EXIT=0
cat > "$work_dir/bin/xcode-select" <<'EOF'
#!/bin/bash
[[ $# == 1 && $1 == -p ]] || exit 99
printf '%s\n' "${DEVELOPER_DIR:-$SMOKE_SELECTED}"
EOF
cat > "$work_dir/bin/xcrun" <<'EOF'
#!/bin/bash
[[ $# == 2 && $1 == --find && $2 == git ]] || exit 99
printf '%s\n' "$DEVELOPER_DIR" >> "$SMOKE_XCRUN_LOG"
printf '%s/usr/bin/git\n' "$DEVELOPER_DIR"
exit "$SMOKE_XCRUN_EXIT"
EOF
chmod +x "$work_dir/bin/"*

make_app() {
  local path=$1 marker=$2
  mkdir -p "$path/Contents/Developer/usr/bin"
  printf '%s\n' "$marker" > "$path/marker"
  printf '#!/bin/sh\necho git-fixture\n' > "$path/Contents/Developer/usr/bin/git"
  printf '#!/bin/sh\necho python-fixture\n' > "$path/Contents/Developer/usr/bin/python3"
  chmod +x "$path/Contents/Developer/usr/bin/"*
}
run_check() {
  local expected=$1 actual=0
  shift
  /bin/bash "$helper" "$@" > "$work_dir/result" 2>&1 || actual=$?
  if [[ $actual != "$expected" ]]; then
    cat "$work_dir/result" >&2
    printf 'expected exit %s, got %s\n' "$expected" "$actual" >&2
    exit 1
  fi
}
assert_output() { grep -Fq "$1" "$work_dir/result"; }

app="$work_dir/Healthy Xcode.app"
make_app "$app" new
export SMOKE_SELECTED="$app/Contents/Developer"
# A stable per-process override must not hide a selected failing beta.
export DEVELOPER_DIR="$work_dir/Other Xcode.app/Contents/Developer"
run_check 0 "$app"
assert_output passed
grep -Fq "$app/Contents/Developer" "$SMOKE_XCRUN_LOG"
printf 'ok: healthy selected bundle, spaces in paths, persistent selection\n'

app="$work_dir/Selected Python Failure.app"
rollback="$work_dir/Python Rollback.app"
make_app "$app" new
make_app "$rollback" old
printf '#!/bin/sh\nexit 7\n' > "$app/Contents/Developer/usr/bin/python3"
export SMOKE_SELECTED="$app/Contents/Developer"
run_check 1 "$app" "$rollback"
assert_output failed-restored
[[ $(cat "$app/marker") == old && ! -e $rollback ]]
printf 'ok: selected Python failure restores rollback\n'

app="$work_dir/Selected Git Hang.app"
rollback="$work_dir/Git Rollback.app"
make_app "$app" new
make_app "$rollback" old
printf '#!/bin/sh\nexec sleep 60\n' > "$app/Contents/Developer/usr/bin/git"
export SMOKE_SELECTED="$app/Contents/Developer"
started=$SECONDS
run_check 1 "$app" "$rollback"
elapsed=$((SECONDS - started))
assert_output failed-restored
[[ $(cat "$app/marker") == old && $elapsed -ge 19 && $elapsed -lt 30 ]]
printf 'ok: selected Git hang restores rollback after %ss\n' "$elapsed"

app="$work_dir/Unselected Python Hang.app"
rollback="$work_dir/Unselected Rollback.app"
make_app "$app" new
make_app "$rollback" old
printf '#!/bin/sh\nexec sleep 60\n' > "$app/Contents/Developer/usr/bin/python3"
export SMOKE_SELECTED="$work_dir/Other Xcode.app/Contents/Developer"
before=$(wc -l < "$SMOKE_XCRUN_LOG")
started=$SECONDS
run_check 1 "$app" "$rollback"
elapsed=$((SECONDS - started))
assert_output failed-kept
assert_output 'DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer'
[[ $(cat "$app/marker") == new && $(cat "$rollback/marker") == old ]]
[[ $(wc -l < "$SMOKE_XCRUN_LOG") == "$before" && $elapsed -ge 19 && $elapsed -lt 30 ]]
printf 'ok: unselected Python hang retained after %ss, no xcrun probe\n' "$elapsed"

app="$work_dir/Xcrun Failure.app"
rollback="$work_dir/Xcrun Rollback.app"
make_app "$app" new
make_app "$rollback" old
export SMOKE_SELECTED="$app/Contents/Developer" SMOKE_XCRUN_EXIT=9
run_check 1 "$app" "$rollback"
assert_output failed-restored
[[ $(cat "$app/marker") == old ]]
printf 'ok: selected xcrun failure restores rollback\n'

app="$work_dir/Fresh Failure.app"
make_app "$app" new
export SMOKE_SELECTED="$app/Contents/Developer"
run_check 1 "$app"
assert_output failed-no-rollback
[[ $(cat "$app/marker") == new ]]
run_check 2 "$app" "$app"
[[ $(cat "$app/marker") == new ]]
printf 'ok: missing or overlapping rollback fails without deleting the app\n'
