---
summary: "npm publishing: hand off to the canonical npm and 1Password skills"
read_when:
  - "Need npm publish without copy/paste secrets."
  - "Need npm OTP/TOTP from 1Password."
---

# npm publishing with 1Password

This document is a routing guide, not a standalone auth or publishing recipe.
Load `one-password` first (`$one-password`, owned by
`~/Projects/manager/skills/one-password/SKILL.md`), then
[npm](../skills/npm/SKILL.md) (`$npm`). Those skills own the current commands,
credential selection, consent rules, retries, verification, and cleanup. If a
skill is unavailable, stop rather than reconstructing its workflow here.
Publishing still requires an explicit release/publish request.

## Auth and session boundaries

- **Service account first.** Follow `one-password` for `OP_SERVICE_ACCOUNT_TOKEN`
  access to `Molty`, with both `OP_LOAD_DESKTOP_APP_SETTINGS=false` and
  `OP_BIOMETRIC_UNLOCK_ENABLED=false`. No desktop unlock or sign-in is required
  on this path. Do not add `--account` or run `op signin` on the service-account
  path. Missing or expired access means stop and ask, not silent desktop fallback.
- **Desktop access requires consent.** Follow the owning skills' explicit
  desktop-consent rules, including the npm skill's release/publish consent rule.
  An unlocked desktop app is not a prerequisite for the default workflow.
- **One shared session, one task window.** Use the `one-password` bootstrap for
  `clawdbot-op.sock` / `op-work`. Open exactly one window for the npm task,
  target it by window ID, and reuse it for retries and follow-ups. Never create
  an npm-specific socket, server, or session, send work to the permanent `shell`
  keeper window, or interfere with another task's window. Never run `op`
  directly in the normal shell tool.

## Use the npm helpers

Inside that same task window, follow the npm skill to choose the entrypoint:

- Local package publishing: `skills/npm/scripts/publish-package.sh`, from the
  package root.
- Ad-hoc authenticated registry commands: `skills/npm/scripts/npm-service.sh`
  with `-- <npm args...>`.
- Package reservation: `skills/npm/scripts/reserve-packages.sh`.

These paths are relative to the agent-scripts checkout; use the invocation paths
in the npm skill. The shared auth helper owns credential extraction, stored
registry-session reuse, login/OTP fallback, cache writes, and temporary npmrc
cleanup. Do not copy legacy `Private/Npmjs` field reads, buffer-based login,
manual JSON extraction, or an OTP-only publish shortcut into a separate recipe.
Keep secret values out of logs, chat, and pane output.

Use the owning skill's identity and registry checks. If credentials are missing
or ambiguous, auth fails, package access is denied, or the package/version does
not match the release target, stop and ask; do not probe other items or open a
second auth window.

## Cleanup

On success or failure, ensure the helper's temporary auth files are cleaned up,
then close only this task's window using the window ID and cleanup procedure
from `one-password`. Leave `op-work`, its `shell` keeper, the shared socket, and
all other task windows intact. Never kill the shared session/server or remove
its socket as npm-task cleanup.
