#!/usr/bin/env bash
set -euo pipefail

TEST_SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_ROOT="$(mktemp -d /tmp/npm-auth-test.XXXXXX)"
trap 'rm -rf "$TEST_ROOT"' EXIT

WORK="$TEST_ROOT/work"
NPMRC="$WORK/npmrc"
REGISTRY="https://registry.npmjs.org/"
mkdir -p "$WORK" "$TEST_ROOT/bin" "$TEST_ROOT/caller"
REAL_NODE="$(command -v node)"
ln -s "$(command -v jq)" "$TEST_ROOT/bin/jq"
export REAL_NODE TEST_ROOT
export EXPECTED_SCRIPT_DIR="$TEST_SCRIPT_DIR"
export PATH="$TEST_ROOT/bin:/usr/bin:/bin"
printf '%s\n' '//registry.npmjs.org/:_authToken=fresh-token' >"$NPMRC"
printf '%s\n' '//registry.npmjs.org/:_authToken=stale-token' >"$TEST_ROOT/caller/.npmrc"

cat >"$TEST_ROOT/bin/npm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
test "$PWD" = "$EXPECTED_PWD"
test "$NPM_CONFIG_USERCONFIG" = "$EXPECTED_NPMRC"
test "$NPM_CONFIG_REGISTRY" = "https://registry.npmjs.org/"
if env | grep -Fq 'npm_config_//registry.npmjs.org/:_authToken='; then
  echo "npm token leaked into environment" >&2
  exit 1
fi
test "$#" = "1"
test "$1" = "whoami"
if [ "${MOCK_STORED_SESSION_INVALID:-0}" = 1 ]; then exit 1; fi
printf 'steipete\n'
EOF
chmod +x "$TEST_ROOT/bin/npm"

cat >"$TEST_ROOT/bin/deny-external" <<'EOF'
#!/bin/bash
touch "$TEST_ROOT/unexpected-external"
echo "unexpected external auth command" >&2
exit 98
EOF
chmod +x "$TEST_ROOT/bin/deny-external"
ln -s deny-external "$TEST_ROOT/bin/op"
ln -s deny-external "$TEST_ROOT/bin/tmux"

cat >"$TEST_ROOT/bin/node" <<'EOF'
#!/bin/bash
set -euo pipefail
case "$1" in
  "$EXPECTED_SCRIPT_DIR/npm-auth-cache.mjs" | -e)
    exec "$REAL_NODE" "$@"
    ;;
  "$EXPECTED_SCRIPT_DIR/npm-auth-login.mjs")
    # Synthetic login only: never load npm-profile or contact a registry.
    test "$NPM_OTP" = 123456
    cat >/dev/null
    printf '%s\n' '//registry.npmjs.org/:_authToken=fresh-token' >"$NPMRC"
    echo "synthetic login npm_synthetic_token 123456"
    ;;
  *)
    touch "$TEST_ROOT/unexpected-external"
    echo "unexpected node helper path" >&2
    exit 98
    ;;
esac
EOF
chmod +x "$TEST_ROOT/bin/node"

ln -s "$TEST_SCRIPT_DIR" "$TEST_ROOT/installed scripts"
cd "$TEST_ROOT"
caller_pwd="$PWD"
SCRIPT_DIR="$TEST_ROOT/wrong before source"
export CDPATH="$TEST_ROOT"
# shellcheck source=npm-auth.sh
source "installed scripts/npm-auth.sh" >"$TEST_ROOT/source.stdout"
test ! -s "$TEST_ROOT/source.stdout"
test "$SCRIPT_DIR" = "$TEST_ROOT/wrong before source"
test "$PWD" = "$caller_pwd"
test "$CDPATH" = "$TEST_ROOT"
if [ "${NPM_AUTH_SCRIPT_DIR:-}" != "$TEST_SCRIPT_DIR" ]; then
  echo "sourced helper must resolve its own physical sibling directory" >&2
  exit 1
fi
SCRIPT_DIR="$TEST_ROOT/wrong after source"
echo "ok 1 - symlinked source owns physical siblings and preserves caller state"

result="$(
  cd "$TEST_ROOT/caller"
  EXPECTED_PWD="$WORK" EXPECTED_NPMRC="$NPMRC" PATH="$TEST_ROOT/bin:$PATH" npm_auth_whoami
)"
test "$result" = "steipete"
echo "ok 2 - registry command uses isolated config without token environment leaks"

ITEM_JSON='{"fields":[{"label":"username","value":"owner"},{"label":"registry_token","type":"CONCEALED","value":"stale-token"}]}'
op_item_edit_json() {
  cat >"$TEST_ROOT/updated-item.json"
}
op_item_get() {
  if [ "${1:-}" = --otp ]; then
    printf '123456\n'
  else
    cat "$TEST_ROOT/updated-item.json"
  fi
}
cache_output="$(persist_registry_token)"
test "$cache_output" = "npm auth: cached registry session in 1Password"
node -e '
const fs = require("fs");
const item = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const token = item.fields.find(field => field.label === "registry_token");
if (token?.value !== "fresh-token" || token?.type !== "CONCEALED") process.exit(1);
' "$TEST_ROOT/updated-item.json"
echo "ok 3 - cache update and verification use owned siblings and preserve token metadata"

MOCK_STORED_SESSION_INVALID=1 EXPECTED_PWD="$WORK" EXPECTED_NPMRC="$NPMRC" \
  ensure_npm_auth >"$TEST_ROOT/login.stdout"
test "$(cat "$TEST_ROOT/login.stdout")" = "synthetic login npm_REDACTED OTP_REDACTED
npm auth: cached registry session in 1Password"
test "$LOGIN_USED_OTP" = 1
test "$NPM_OTP" = 123456
test "$SCRIPT_DIR" = "$TEST_ROOT/wrong after source"
test "$PWD" = "$caller_pwd"
test ! -e "$TEST_ROOT/unexpected-external"
echo "ok 4 - synthetic login uses owned sibling and retains OTP/redaction behavior"

echo "npm auth isolation, sibling ownership and token handling: 4 checks passed"
