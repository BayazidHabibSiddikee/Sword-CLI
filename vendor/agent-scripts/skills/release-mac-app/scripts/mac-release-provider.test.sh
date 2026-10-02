#!/usr/bin/env bash
# Synthetic only. Optional arguments: [--direct-refs-only] library-under-test, artifact parent directory.
set -euo pipefail

if [[ "${1:-}" != --isolated ]]; then
  exec /usr/bin/env -i PATH=/usr/bin:/bin MAC_RELEASE_TEST_NODE="$(command -v node)" \
    /bin/bash "$0" --isolated "$@"
fi
shift
direct_refs_only=0
if [[ "${1:-}" == --direct-refs-only ]]; then
  direct_refs_only=1
  shift
fi
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
library=${1:-$script_dir/lib/mac_release.sh}
test_root=$(mktemp -d "${2:-/tmp}/mac-release-provider-test.XXXXXX")
umask 077
mkdir "$test_root/bin"
export MAC_RELEASE_TEST_ROOT=$test_root

# The tmux server's PATH must not select the credential runner's shell.
cat >"$test_root/bin/bash" <<'BASH_STUB'
#!/bin/sh
echo 'unexpected PATH-selected bash in credential runner' >&2
exit 93
BASH_STUB

# Only the parser runs real Node. All credential, terminal and signing tools are stubs.
cat >"$test_root/bin/node" <<'NODE_STUB'
#!/bin/bash
set -euo pipefail
case " $* " in
  *"/${MAC_RELEASE_TEST_TARGET}.json "*)
    case "$MAC_RELEASE_TEST_FAULT" in
      parser-stderr-success|parser-stderr-failure)
        cat "$MAC_RELEASE_TEST_CASE/marker" >&2
        [[ "$MAC_RELEASE_TEST_FAULT" != parser-stderr-failure ]] || exit 70
        ;;
    esac
    ;;
esac
exec "$MAC_RELEASE_TEST_NODE" "$@"
NODE_STUB

cat >"$test_root/bin/op" <<'OP'
#!/bin/bash
set -euo pipefail
[[ "${OP_LOAD_DESKTOP_APP_SETTINGS:-}" == false ]]
[[ "${OP_BIOMETRIC_UNLOCK_ENABLED:-}" == false ]]
[[ "${OP_SERVICE_ACCOUNT_TOKEN:-}" == fixture-service-token ]]
for arg in "$@"; do [[ "$arg" != --account && "$arg" != signin ]]; done
if IFS= read -r input; then exit 91; fi
case "$*" in
  'item get primary --format json --vault Fixture') stage=primary ;;
  'item get codesign --format json --vault Fixture') stage=codesign ;;
  'read op://Fixture/env/value') stage=env ;;
  'read op://Fixture/sparkle/value') stage=sparkle ;;
  *) exit 92 ;;
esac
printf '%s\n' "$stage" >>"$MAC_RELEASE_TEST_CASE/reads"
if [[ "$stage" == "$MAC_RELEASE_TEST_TARGET" ]]; then
  case "$MAC_RELEASE_TEST_FAULT" in
    stderr-success|stderr-failure) cat "$MAC_RELEASE_TEST_CASE/marker" >&2 ;;
  esac
  [[ "$MAC_RELEASE_TEST_FAULT" != stderr-failure ]] || exit 23
fi
case "$stage" in
  primary|codesign) cat "$MAC_RELEASE_TEST_CASE/$stage.json" ;;
  *) cat "$MAC_RELEASE_TEST_CASE/$stage.value" ;;
esac
OP

cat >"$test_root/bin/tmux" <<'TMUX'
#!/bin/bash
set -euo pipefail
[[ "$1" == -S && "$2" == "$MAC_RELEASE_TEST_CASE/sockets/clawdbot-op.sock" ]]
shift 2
printf '%s\n' "$1" >>"$MAC_RELEASE_TEST_CASE/tmux-calls"
case "$1" in
  has-session) [[ "$2 $3" == '-t op-work' ]] ;;
  new-window)
    [[ "$*" == 'new-window -d -t op-work -n mac-release -P -F #{window_id} /bin/bash --noprofile --norc -p -c '* ]]
    command_text=${!#}
    runner_path=${command_text#* /bin/bash }
    runner_path=${runner_path%%;*}
    work_dir=${runner_path%/*}
    [[ -f "$runner_path" ]]
    [[ "$(stat -f '%Lp' "$work_dir")" == 700 ]]
    [[ "$(stat -f '%Lp' "$runner_path")" == 700 ]]
    [[ "$(stat -f '%Lp' "$work_dir/read-op.sh")" == 700 ]]
    [[ "$(stat -f '%Lp' "$work_dir/service-account-token")" == 600 ]]
    printf '%s\n' "$command_text" >"$MAC_RELEASE_TEST_CASE/pane-command"
    env -u OP_SERVICE_ACCOUNT_TOKEN /bin/bash --noprofile --norc -c "$command_text" \
      >"$MAC_RELEASE_TEST_CASE/pane.stdout" 2>"$MAC_RELEASE_TEST_CASE/pane.stderr"
    [[ ! -e "$work_dir/service-account-token" ]]
    cp "$work_dir/op.log" "$MAC_RELEASE_TEST_CASE/replay.log"
    cp "$work_dir/status" "$MAC_RELEASE_TEST_CASE/producer-status"
    if [[ "$(cat "$work_dir/status")" == 0 ]]; then
      [[ "$(stat -f '%Lp' "$work_dir/secrets.env")" == 600 ]]
      if [[ "$MAC_RELEASE_TEST_FAULT" == ref-* ]]; then
        syntax_rc=0
        /bin/bash -n "$work_dir/secrets.env" >/dev/null 2>&1 || syntax_rc=$?
        printf '%s\n' "$syntax_rc" >"$MAC_RELEASE_TEST_CASE/handoff-syntax-status"
      fi
    fi
    # A source sentinel proves a failed pass never consumes even a partial handoff.
    printf '%s\n' 'printf sourced >"$MAC_RELEASE_TEST_CASE/env-sourced"' >>"$work_dir/secrets.env"
    printf 'private-handoffs-ok\n' >"$MAC_RELEASE_TEST_CASE/permissions"
    printf '@7\n'
    ;;
  send-keys) exit 93 ;;
  display-message) [[ "$*" == 'display-message -p -t @7 #{pane_pid}' ]] ;;
  kill-window)
    [[ "$*" == 'kill-window -t @7' ]]
    while IFS= read -r path; do
      case "$path" in
        */mac-release-op.*|*/mac-release-sparkle-key.*) [[ -e "$path" ]] ;;
      esac
    done <"$MAC_RELEASE_TEST_CASE/temp-paths"
    printf 'producer-stopped-before-removal\n' >"$MAC_RELEASE_TEST_CASE/cleanup-order"
    ;;
  *) exit 93 ;;
esac
TMUX

# Track real, disposable filesystem fixtures, including inner JSON-directory cleanup.
cat >"$test_root/bin/mktemp" <<'MKTEMP'
#!/bin/bash
set -euo pipefail
path=$(/usr/bin/mktemp "$@")
printf '%s\n' "$path" >>"$MAC_RELEASE_TEST_CASE/temp-paths"
printf '%s\n' "$path"
MKTEMP

# Model the BSD permission query used by the macOS library on Ubuntu as well.
cat >"$test_root/bin/stat" <<'STAT'
#!/bin/bash
set -euo pipefail
[[ "$1 $2" == '-f %Lp' ]]
exec "$MAC_RELEASE_TEST_NODE" -e 'process.stdout.write((require("fs").statSync(process.argv[1]).mode & 0o777).toString(8) + "\n")' "$3"
STAT

for tool in security codesign swift sign_update curl gh; do
  cat >"$test_root/bin/$tool" <<'DENY'
#!/bin/bash
printf 'forbidden-tool\n' >>"$MAC_RELEASE_TEST_CASE/forbidden"
exit 94
DENY
done
chmod 700 "$test_root/bin/"*

cat >"$test_root/fixtures.js" <<'FIXTURES'
const fs = require("fs");
const [dir, target, fault] = process.argv.slice(2);
const marker = "SYNTHETIC_PRIVATE_DIAGNOSTIC_SENTINEL";
const value = "quoted ' value \\n literal\nreal newline $(false) `false` \\\"";
fs.writeFileSync(`${dir}/marker`, marker);
fs.writeFileSync(`${dir}/expected`, value);
for (const stage of ["primary", "codesign"]) {
  let fields = stage === "primary"
    ? [{id: "TEST_SECRET", label: "decoy", value: "wrong"}, {label: "TEST_SECRET", value}, {id: "ID_SECRET", value}]
    : [{id: "path", label: "keychain_path", value}, {id: "keychain_password", label: "decoy", value: "wrong"}, {label: "keychain_password", value}];
  let item = {fields};
  if (stage === target) {
    switch (fault) {
      case "malformed": fs.writeFileSync(`${dir}/${stage}.json`, `{"${marker}":`); continue;
      case "root-null": item = null; break;
      case "root-array": item = [marker]; break;
      case "fields-object": item.fields = {private: marker}; break;
      case "field-null": item.fields = [null]; break;
      case "label-object": item.fields[0].label = {private: marker}; break;
      case "value-object": item.fields[0].value = {private: marker}; break;
      case "missing": item.fields = [{label: "unrelated", value}]; break;
    }
  }
  fs.writeFileSync(`${dir}/${stage}.json`, JSON.stringify(item));
}
for (const stage of ["env", "sparkle"]) {
  fs.writeFileSync(`${dir}/${stage}.value`, stage === target && fault === "missing" ? "" : "reference-value");
}
if (fault.startsWith("ref-")) {
  const shell = '$(printf executed >"$MAC_RELEASE_TEST_CASE/shell-executed") ' +
    '`printf executed >"$MAC_RELEASE_TEST_CASE/shell-executed"` ; "double quotes" \\ * ? [glob] # %\t';
  // No terminal LF: these assertions cover the captured value, after command substitution.
  const refs = {
    "ref-apostrophe-single": `${marker}'value`,
    "ref-apostrophe-repeated": `${marker}''value'''end`,
    "ref-apostrophe-leading": `'${marker}`,
    "ref-apostrophe-trailing": `${marker}'`,
    "ref-literal-backslash-n": `${marker}\\n\\nend`,
    "ref-newline-embedded": `${marker}\nend`,
    "ref-newline-leading": `\n\n${marker}\nend`,
    "ref-newline-consecutive": `${marker}\n\n\nend`,
    "ref-shell-metacharacters": `${marker} ${shell}`,
    "ref-combined": `\n'${marker}'' \\n\n\n${shell} end'`,
  };
  fs.writeFileSync(`${dir}/env.value`, refs[fault]);
}
FIXTURES

cat >"$test_root/load.sh" <<'LOAD'
#!/bin/bash
set -euo pipefail
umask 022
source "$1"
export OP_SERVICE_ACCOUNT_TOKEN=fixture-service-token
export MAC_RELEASE_OP_USE_SERVICE_ACCOUNT=1 MAC_RELEASE_OP_VAULT=Fixture
export MAC_RELEASE_OP_ITEM=primary MAC_RELEASE_OP_FIELDS='TEST_SECRET ID_SECRET'
export MAC_RELEASE_CODESIGN_OP_ITEM=codesign
export MAC_RELEASE_OP_ENV_REFS='EXTRA_SECRET=op://Fixture/env/value'
export MAC_RELEASE_SPARKLE_OP_REF=op://Fixture/sparkle/value
export MAC_RELEASE_OP_WAIT_SECONDS=2
export CLAWDBOT_TMUX_SOCKET_DIR="$MAC_RELEASE_TEST_CASE/sockets"
if [[ "$MAC_RELEASE_TEST_FAULT" == missing ]]; then
  # Missing-field diagnostics must not echo a requested label either.
  case "$MAC_RELEASE_TEST_TARGET" in
    primary) MAC_RELEASE_OP_FIELDS=$(cat "$MAC_RELEASE_TEST_CASE/marker") ;;
    codesign) export MAC_RELEASE_CODESIGN_OP_PATH_FIELD=$(cat "$MAC_RELEASE_TEST_CASE/marker") ;;
  esac
fi
trap mac_release_cleanup_temp_sparkle_key EXIT
mac_release_load_1password_env
expected=$(cat "$MAC_RELEASE_TEST_CASE/expected")
[[ "$TEST_SECRET" == "$expected" && "$ID_SECRET" == "$expected" ]]
if [[ "$MAC_RELEASE_TEST_FAULT" == ref-* ]]; then
  printf '%s' "$EXTRA_SECRET" >"$MAC_RELEASE_TEST_CASE/env-parent.actual"
  /bin/bash -c 'printf %s "$EXTRA_SECRET"' >"$MAC_RELEASE_TEST_CASE/env-child.actual"
else
  [[ "$EXTRA_SECRET" == reference-value ]]
fi
[[ "$MAC_RELEASE_CODESIGN_KEYCHAIN" == "$expected" ]]
[[ "$MAC_RELEASE_CODESIGN_KEYCHAIN_PASSWORD" == "$expected" ]]
[[ "$(cat "$SPARKLE_PRIVATE_KEY_FILE")" == reference-value ]]
[[ "$(stat -f '%Lp' "$SPARKLE_PRIVATE_KEY_FILE")" == 600 ]]
[[ "$(/bin/bash -c 'printf %s "${MAC_RELEASE_CODESIGN_KEYCHAIN_PASSWORD-unset}"')" == unset ]]
printf 'values-ok\n' >"$MAC_RELEASE_TEST_CASE/values"
mac_release_cleanup_temp_sparkle_key
# A fully preloaded pass must not reach tmux or op.
unset MAC_RELEASE_SPARKLE_OP_REF
mac_release_load_1password_env
LOAD

failures=0
check() {
  local description=$1
  shift
  if ! "$@"; then
    printf 'FAIL %s/%s: %s\n' "$target" "$fault" "$description"
    failures=$((failures + 1))
  fi
}

run_case() {
  local target=$1 fault=$2 expected_rc=$3 category=${4:-} count=4 rc=0 artifact path
  local before=$failures
  local case_dir="$test_root/$target-$fault"
  mkdir "$case_dir"
  "$MAC_RELEASE_TEST_NODE" "$test_root/fixtures.js" "$case_dir" "$target" "$fault"
  env -i PATH="$test_root/bin:/usr/bin:/bin" MAC_RELEASE_TEST_NODE="$MAC_RELEASE_TEST_NODE" \
    MAC_RELEASE_TEST_ROOT="$test_root" MAC_RELEASE_TEST_CASE="$case_dir" \
    MAC_RELEASE_TEST_TARGET="$target" MAC_RELEASE_TEST_FAULT="$fault" \
    /bin/bash "$test_root/load.sh" "$library" >"$case_dir/wrapper.stdout" 2>"$case_dir/wrapper.stderr" || rc=$?
  if [[ "$expected_rc" == 0 ]]; then
    check 'wrapper success' test "$rc" = 0
    check 'exact labels and escaped values preserved' test -f "$case_dir/values"
    check 'successful handoff sourced' test -f "$case_dir/env-sourced"
  else
    check 'wrapper failed' test "$rc" != 0
    check 'failed handoff never sourced' test ! -e "$case_dir/env-sourced"
    check 'safe replay category' grep -Fqx "$category" "$case_dir/replay.log"
    check 'safe wrapper category' grep -Fqx "$category" "$case_dir/wrapper.stderr"
    case "$target" in primary) count=1 ;; codesign) count=2 ;; env) count=3 ;; esac
  fi
  check 'producer status preserved' test "$(cat "$case_dir/producer-status")" = "$expected_rc"
  check 'no retry or fallback' test "$(wc -l <"$case_dir/reads" | tr -d ' ')" = "$count"
  head -n "$count" <<< $'primary\ncodesign\nenv\nsparkle' >"$case_dir/expected-reads"
  check 'read order preserved' cmp -s "$case_dir/expected-reads" "$case_dir/reads"
  printf '%s\n' has-session new-window display-message kill-window >"$case_dir/expected-tmux"
  check 'shared session and task-window cleanup' cmp -s "$case_dir/expected-tmux" "$case_dir/tmux-calls"
  check 'producer stopped before temp-file removal' test -f "$case_dir/cleanup-order"
  check 'private handoffs' test -f "$case_dir/permissions"
  check 'no forbidden tools' test ! -e "$case_dir/forbidden"
  if [[ "$fault" == ref-* ]]; then
    check 'generated handoff has valid Bash syntax' test "$(cat "$case_dir/handoff-syntax-status")" = 0
    check 'direct reference preserved byte-for-byte in parent' cmp -s "$case_dir/env.value" "$case_dir/env-parent.actual"
    check 'direct reference exported byte-for-byte to child' cmp -s "$case_dir/env.value" "$case_dir/env-child.actual"
    check 'shell constructs not executed' test ! -e "$case_dir/shell-executed"
  fi
  for artifact in wrapper.stdout wrapper.stderr replay.log pane.stdout pane.stderr pane-command; do
    check "diagnostic artifact exists: $artifact" test -f "$case_dir/$artifact"
    if grep -Fq -f "$case_dir/marker" "$case_dir/$artifact"; then
      printf 'FAIL %s/%s: synthetic disclosure in %s\n' "$target" "$fault" "$artifact"
      failures=$((failures + 1))
    fi
  done
  while IFS= read -r path; do
    check 'temporary credential path removed' test ! -e "$path"
  done <"$case_dir/temp-paths"
  [[ "$before" != "$failures" ]] || printf 'PASS %s/%s\n' "$target" "$fault"
}

for fault in ref-apostrophe-single ref-apostrophe-repeated ref-apostrophe-leading ref-apostrophe-trailing \
  ref-literal-backslash-n ref-newline-embedded ref-newline-leading ref-newline-consecutive \
  ref-shell-metacharacters ref-combined; do
  run_case env "$fault" 0
done
if [[ "$direct_refs_only" == 1 ]]; then
  printf 'Direct-reference regression artifacts: %s\n' "$test_root"
  printf 'Failed assertions: %s\n' "$failures"
  [[ "$failures" == 0 ]]
  exit
fi

run_case primary success 0
for target in primary codesign; do
  for fault in malformed root-null root-array fields-object field-null label-object value-object; do
    run_case "$target" "$fault" 2 '1Password item JSON/schema invalid'
  done
  run_case "$target" missing 3 '1Password required field missing'
  run_case "$target" parser-stderr-success 0
  run_case "$target" parser-stderr-failure 70 '1Password item parser failed'
done
for target in primary codesign env sparkle; do
  run_case "$target" stderr-success 0
  run_case "$target" stderr-failure 23 '1Password provider read failed'
done
for target in env sparkle; do
  run_case "$target" missing 1 '1Password required field missing'
done
printf 'Provider regression artifacts: %s\n' "$test_root"
printf 'Failed assertions: %s\n' "$failures"
[[ "$failures" == 0 ]]
