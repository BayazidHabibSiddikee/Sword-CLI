---
name: browser-use
description: "Control the user's existing signed-in Chrome: callable Codex Chrome plugin first, then OpenClaw extension-backed mcporter, with direct DevTools attachment only as a last fallback."
---

# Browser Use

Control the user's existing real Chrome profile, especially for login-dependent work and live UI verification.

## Route

1. Use the Codex `Chrome` or `Chrome [Internal]` plugin when it is callable in
   the active session. Installed on disk is not enough.
2. Otherwise prefer the OpenClaw extension-backed mcporter route.
3. Use legacy direct DevTools attachment only as the explicit last fallback.

For mcporter, the MCP call remains the agent-facing control interface. The
OpenClaw extension is the transport underneath it, not a separate tool. Set
`chromeDevtoolsRelay: "require"` on the canonical global Chrome server definition
to enforce relay-only routing. Keep the caller policy explicit as well:

```bash
MCPORTER_CHROME_DEVTOOLS_RELAY_POLICY=require mcporter call chrome-devtools.<tool>
```

Seeing an agent request the `chrome-devtools` MCP tool is therefore expected.
A Chrome **Allow remote debugging?** prompt or a relay-policy error indicates
that the extension transport was not used. The shared daemon retains canonical
policy; a shell environment prefix alone cannot change that policy.

Never use isolated Chrome, the Codex in-app browser, Playwright, Puppeteer,
AppleScript, `osascript`, generic GUI scripting, or macOS `open` as a browser-control
substitute unless the user explicitly asks for an isolated or new browser.
Peekaboo is allowed only for Chrome or extension setup and visible prompts.
Login-heavy sites often depend on the real profile's cookies, SSO, device trust,
and extensions.

For a rendered-browser bug, prove behavior through this real profile. Treat
`curl`, source inspection, API checks, and isolated test browsers as supporting
evidence, not substitutes for live UI proof.

## Extension Relay Model

OpenClaw creates a random per-host relay key in its mode-`0600` credentials
directory. The extension and same-host clients use nonce-bound mutual HMAC
proofs. The reusable key is never sent to an unverified loopback listener,
placed in a URL, or passed to the child MCP process. Keep credentials out of
configuration, command output, chat, logs, and screenshots.

On a same-host relay, mcporter authenticates `/json/version` and upgrades the
same retained socket to `/cdp`, then gives `chrome-devtools-mcp` a protected
one-use local handoff. Agents still call the standard MCP tools; successful
relay routing is what removes direct DevTools attachment and Chrome's approval
prompt.

New pairings default to **All tabs**: every ordinary eligible tab is exposed
except tabs explicitly paused in the popup. Existing pairings keep their stored
mode. In **Selected tabs** mode, membership in the Chrome tab group titled
**OpenClaw** is the sharing boundary. Restricted/internal pages, incognito,
other profiles, and tabs without an eligible URL remain excluded in both modes.

### Topology Boundary

Direct remote Gateway pairing over `wss://` lets OpenClaw's Gateway-side
browser tool control local Chrome. It does not create a local relay for a local
mcporter process. Do not routinely copy remote secrets or build ad-hoc SSH
tunnels around this boundary.

If local mcporter cannot authenticate to a local relay, the extension-backed
mcporter route is unavailable. Report that clearly or use the labeled legacy
fallback; never represent remote Gateway control or direct attachment as local
relay success.

## Setup and Repair

- Run `openclaw browser extension install` before **Load unpacked**. It copies
  the extension to the stable OpenClaw-owned path, pre-registers that path's
  deterministic Chrome ID, and prints the path to load. The first native call
  then pairs automatically for local or browser-node topology.
- Use `openclaw browser extension status --json` to verify the installed copy,
  exact origins, and native-host registrations. Status must report no issues and
  `manualSetupRequired: false`.
- Confirm Settings reports automatic setup ready and the popup reports
  **Connected**. New installs should show **All tabs** unless the user changes
  the access mode; no copied pairing string or popup setup is part of the normal
  local flow.
- A previous native-host miss is cached for the Chrome process. If the extension
  attempted native messaging before installation, restart Chrome once after
  installing; repeated retries in the same process cannot repair that cache.
- After pairing or changing the relay route, stop the mcporter daemon before
  re-running relay-only proof. A Gateway restart can leave the Chrome DevTools
  child alive with a dead upstream socket; `mcporter daemon stop` retires it
  before the next call creates a fresh connection.
- Direct remote Gateway pairing remains an Advanced manual flow. It serves the
  Gateway browser path and does not create a local relay for local mcporter.

### Discovery Timeout and Daemon Configuration

MCPorter discovers the actual relay through
`openclaw browser extension cdp --json`. Even packaged OpenClaw can take more
than five seconds to cold-start. In mcporter 0.13.10, discovery failure falls
back to port 18799; a timeout can therefore appear as `network-error` at the
wrong endpoint, or as `browser_owner_conflict` when a later discovery returns
the real endpoint. Do not interpret that sequence as proof that another Chrome
owner or credential rotation caused the failure.

For the shared Chrome owner, use the OS account's canonical
`~/.mcporter/mcporter.json` (or `mcporter.jsonc` only when the JSON file is absent).
Merge these fields into its existing Chrome definition, preserving its command,
arguments and other settings:

```json
{
  "chromeDevtoolsRelay": "require",
  "env": {
    "MCPORTER_CHROME_DEVTOOLS_RELAY_TIMEOUT_MS": "20000"
  }
}
```

The relay timeout bounds each discovery or authentication step; it does not
extend the client's total operation deadline. Initial Chrome startup can run
several discovery checks before MCP initialization and the requested tool call.
On older installed clients, pair the canonical `20000` per-step setting with
an explicit `--timeout 300000` on the initial call or schema listing. For example:

```bash
MCPORTER_CHROME_DEVTOOLS_RELAY_POLICY=require mcporter call chrome-devtools.list_pages --timeout 300000 --output text
```

Newer Chrome-specific outer defaults require an upgraded invoking client.
Explicit `--timeout`, `MCPORTER_CALL_TIMEOUT`, and `MCPORTER_LIST_TIMEOUT`
still override those defaults; a smaller override can cut startup short.

The daemon intentionally strips inherited `MCPORTER_CHROME_DEVTOOLS_RELAY_*`
and `OPENCLAW_*` controls from the canonical Chrome environment. Shell exports
do not update an existing owner and are not a durable fix for a respawn. Put
literal values in the canonical definition's `env`; do not use placeholders
that depend on those stripped variables. If an explicit endpoint is necessary,
set `MCPORTER_CHROME_DEVTOOLS_RELAY_URL` there to the verified credential-free
HTTP loopback base URL, for example `http://127.0.0.1:28799` after verifying
that port. This override does not accept a WebSocket CDP URL such as
`ws://127.0.0.1:28799/cdp`. Prefer discovery with a sufficient timeout over a
guessed or hardcoded port, especially when several OpenClaw installations coexist.

After changing canonical settings, let active calls drain and run
`mcporter daemon stop`. If stop refuses because calls remain active, wait for
them to finish and retry stop; proceed only after it succeeds. The next call
starts a daemon with the saved settings, and subsequent respawns use the same
configuration. Verify the relay decision
with `mcporter daemon status --json` and repeat the readiness proof below.
Check the installed mcporter version before relying on newer timeout defaults
or explicit discovery-failure diagnostics; a source fix does not update an
already installed binary or running daemon.

Current `openclaw browser extension cdp --json` emits non-secret metadata by
default, but older versions and legacy-bearer options can expose credentials.
Prefer mcporter's redacted status for routine diagnostics, never request legacy
credentials, and do not dump process arguments. If credential exposure is
suspected, rotate the per-host secret and pair again.

## Fail-Closed Readiness Proof

Require every condition below before calling the extension route ready:

1. Extension status reports the stable copy and exact native registrations with
   no issues; Settings says automatic setup ready.
2. The popup says **Connected** and the intended ordinary tab is not paused.
   In Selected tabs mode, it must also belong to the **OpenClaw** group.
3. mcporter has been stopped after pairing, relay-route or canonical-config
   changes, and the next call has started a fresh daemon.
4. The canonical Chrome definition uses `chromeDevtoolsRelay: "require"`, and
   a call with `MCPORTER_CHROME_DEVTOOLS_RELAY_POLICY=require` succeeds. The
   canonical policy forbids direct DevTools fallback, so success is positive
   relay proof.
5. Selection and evaluation both succeed in a known eligible disposable tab.

```bash
MCPORTER_CHROME_DEVTOOLS_RELAY_POLICY=require mcporter call chrome-devtools.list_pages --args '{}' --output text
MCPORTER_CHROME_DEVTOOLS_RELAY_POLICY=require mcporter call chrome-devtools.select_page --args '{"pageId":9}' --output text
MCPORTER_CHROME_DEVTOOLS_RELAY_POLICY=require mcporter call chrome-devtools.evaluate_script --args '{"function":"() => ({title: document.title, href: location.href})"}' --output json
```

A relay-policy error means the extension transport is unavailable; report or
repair it instead of retrying without `require`. A blocking **Allow remote
debugging?** prompt proves legacy attachment was attempted.

## Typical Flow

List pages, select only a shared target, snapshot before acting, and use fresh
snapshot UIDs. Prefer DOM snapshots over screenshots unless layout matters.

```bash
MCPORTER_CHROME_DEVTOOLS_RELAY_POLICY=require mcporter call chrome-devtools.list_pages --args '{}' --output text
MCPORTER_CHROME_DEVTOOLS_RELAY_POLICY=require mcporter call chrome-devtools.select_page --args '{"pageId":9}' --output text
MCPORTER_CHROME_DEVTOOLS_RELAY_POLICY=require mcporter call chrome-devtools.take_snapshot --args '{}' --output text
MCPORTER_CHROME_DEVTOOLS_RELAY_POLICY=require mcporter call chrome-devtools.click --args '{"uid":"1_38","includeSnapshot":true}' --output text
MCPORTER_CHROME_DEVTOOLS_RELAY_POLICY=require mcporter call chrome-devtools.fill --args '{"uid":"1_13","value":"text","includeSnapshot":true}' --output text
MCPORTER_CHROME_DEVTOOLS_RELAY_POLICY=require mcporter call chrome-devtools.evaluate_script --args '{"function":"() => document.title"}' --output json
```

For live UI proof, capture the current page state before the action, perform
the requested interaction, then snapshot or evaluate the rendered result.
Keep secrets out of DOM, input, network, console, and screenshot output. For
credential checks, return only safe shape such as present/absent, length,
status code, or account/organization label.

If automation is unavailable, report the verification gap instead of silently switching to prohibited or isolated tooling.

## Argument and Output Mechanics

`--args` accepts inline JSON only. It does not read `@file`. Flag-style named
arguments do:

```bash
MCPORTER_CHROME_DEVTOOLS_RELAY_POLICY=require mcporter call chrome-devtools.navigate_page url=@/tmp/target-url.txt --output text
MCPORTER_CHROME_DEVTOOLS_RELAY_POLICY=require mcporter call chrome-devtools.evaluate_script function=@/tmp/probe.js --output json
```

Treat this as a safety primitive, not just ergonomics. A sign-in URL, magic
link, or callback URL is credential-equivalent: write it to a mode-0600 file and
pass it by file reference so it never reaches shell history, process arguments,
or captured tool output. The same form carries a multi-line JavaScript function
without quoting or control-character errors.

Other call mechanics worth knowing before a login flow:

- Generic client defaults are 60 seconds for calls and 30 seconds for listings,
  separate from the relay's per-step discovery/authentication timeout. Slow
  initial Chrome startup on older clients needs `--timeout 300000` as described
  above. Choose an explicit timeout for later interactive work when needed.
- `take_screenshot` with `filePath` is confined to the server's configured
  workspace roots and refuses arbitrary paths. Omit `filePath`, read the
  base64 image from `--output json`, and decode it locally.
- `new_page` can fail with a restricted/unavailable tab when the target is not
  shared. Navigate an already-shared tab instead of creating one.
- `mcporter list <server> --schema` prints the real function signatures. Use it
  rather than guessing parameter names.

## Clicks That Do Not Click

A `click` by `uid` can return success and still do nothing: some pages bind
their handlers so that a synthetic click is ignored. Silence is not proof of
action, so verify state after every activation rather than assuming it worked.

When a click no-ops, drive the control from the keyboard with `press_key`
(`Tab`, `Shift+Tab`, `Enter`) and confirm focus with a screenshot before
committing. Focus rings are the only reliable evidence of which control is
about to receive `Enter`, and consent screens routinely put the safe-looking
prominent button next to a low-emphasis link that is the one you actually want.
Blind `Enter` on such a page picks the wrong control.

Snapshot `uid` values are invalidated by any navigation or re-render. Re-run
`take_snapshot` and re-resolve the `uid` after every step; a stale `uid`
reports that the element no longer exists, which is a cue to re-snapshot rather
than to retry the same call.

## When the Relay Goes Empty Mid-Task

The relay can stop exposing tabs partway through a task because eligible tabs
were closed, the current tab became restricted or paused, Selected tabs mode
lost its group members, or the extension disconnected. The failure can be
quiet: `list_pages` may return an empty result and later calls time out.

Treat an empty page list as "the relay has no eligible tabs", not "the browser
is gone". Confirm Chrome is running, check the popup connection and current-tab
Pause/Allow state, then check the access mode. Only Selected tabs mode requires
restoring the **OpenClaw** group. Restarting mcporter cannot repair extension
disconnection, tab eligibility, or access policy.

Do not escalate to a full-profile attachment or an isolated browser to route
around it. When the task is a sign-in the user is present for, the faster and
more honest move is to hand the URL to the browser the user is already sitting
at, and if the flow's callback listens on another host, forward that port to
the user's machine first. Otherwise report the access gap.

## Legacy Fallback: Full-Profile Direct Attachment

Use this only after the callable plugin and authenticated local extension relay
are unavailable. It exposes the full real-profile tab set and can show Chrome's
blocking **Allow remote debugging?** prompt.

When a visible, unambiguous Chrome prompt asks to allow the attachment, approve
it once, then rerun `list_pages`. If the prompt is absent, ambiguous, or the
retry fails, stop and ask the user or report that Chrome DevTools MCP is
unavailable. Do not loop approvals, repeatedly restart Chrome or mcporter, or
kill browser processes.

Verify that `list_pages` shows the intended real-profile tabs before acting. Always
label this path as full-profile direct attachment, never as OpenClaw extension relay success.
