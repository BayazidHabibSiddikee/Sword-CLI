#!/usr/bin/env bash
# Install the in-tree SwordCLI background services (systemd --user).
#
# Provides the project's own API background, replacing the freellmapi/GET_API
# stack: swordcli-api (API on :3001), swordcli-web (UI on :3002) and
# sword-server (minimal API on :3101). The legacy freellmapi units are stopped
# and disabled so nothing keeps :3001/:3002 bound to another project.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UNITS="$ROOT/scripts/systemd"
TARGET="$HOME/.config/systemd/user"

# One-time dependency install for the swordcli workspace (better-sqlite3 needs
# its native binding, which npm only builds when the allowScripts entry exists).
if [ ! -x "$ROOT/swordcli/node_modules/.bin/tsx" ] || [ ! -f "$ROOT/swordcli/node_modules/better-sqlite3/build/Release/better_sqlite3.node" ]; then
  echo "[systemd] installing the swordcli workspace (npm install --prefix swordcli)"
  npm install --prefix "$ROOT/swordcli"
  npm rebuild better-sqlite3 --prefix "$ROOT/swordcli" || true
fi

mkdir -p "$TARGET" "$ROOT/.sword"
# Retire the freellmapi-backed units so this project owns the ports.
for old in sword-legacy.service sword-web.service freellmapi.service; do
  if systemctl --user list-unit-files "$old" >/dev/null 2>&1; then
    systemctl --user disable --now "$old" 2>/dev/null || true
    echo "[systemd] disabled legacy unit $old"
  fi
done

for unit in swordcli-api.service swordcli-web.service; do
  install -m 644 "$UNITS/$unit" "$TARGET/$unit"
  systemctl --user daemon-reload
  systemctl --user enable --now "$unit"
  echo "[systemd] enabled $unit"
done

# The minimal API needs no install step, so keep it as a background too.
if [ -f "$TARGET/sword-server.service" ]; then
  systemctl --user enable --now sword-server.service 2>/dev/null || true
  echo "[systemd] enabled sword-server.service"
fi

systemctl --user --no-pager --lines=0 status swordcli-api.service swordcli-web.service || true
echo
echo "[systemd] API  :3001  ·  web :3002  ·  minimal API :3101"
echo "[systemd] check with: ./sword.mjs status   (stop with ./sword.mjs down)"
