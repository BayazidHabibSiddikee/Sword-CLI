---
name: xcode-sync
description: "Xcode fleet sync: signed archives, compatibility, install, selection, first launch."
---

# Xcode Sync

Synchronize exact Xcode builds across Peter's supported Macs. Use `$remote-mac` for fleet topology and SSH rules.

## Inventory

1. Read `~/Projects/manager/computers.yaml`; use live `tailscale status --json` for reachability/IPs.
2. Exclude handed-off and unknown hosts. Verify `hostname`, user, macOS, architecture, and hardware UUID before writes.
3. Deduplicate Tailscale nodes by hardware UUID; one Mac may have multiple live node records.
4. Run `scripts/xcode-host-inventory.sh` locally or remotely:

```bash
skills/xcode-sync/scripts/xcode-host-inventory.sh
ssh -o RequestTTY=no -o RemoteCommand=none HOST 'bash -s' \
  < skills/xcode-sync/scripts/xcode-host-inventory.sh
```

Treat unreachable hosts as pending, not synchronized. Try live Tailscale IP, Tailscale SSH, then mDNS/LAN only when network topology permits.

## Simulator hygiene

Every fleet Mac must pass the simulator-hygiene audit, including worker Macs where the correct result is `not-applicable` because Xcode and `simctl` are absent. Apple CoreSimulator's own classifications are authoritative: remove runtime images reported by `simctl runtime delete --outdated --dry-run` or `--unusable --dry-run`, plus simulator devices attached to unavailable runtimes. Do not classify a runtime as stale from its version number alone; stable and beta Xcodes can legitimately need different runtime generations on the same Mac.

Run the dependency-light audit locally or stream it to a remote Mac:

```bash
skills/xcode-sync/scripts/xcode-simulator-hygiene.sh
ssh -o RequestTTY=no -o RemoteCommand=none HOST 'bash -s' \
  < skills/xcode-sync/scripts/xcode-simulator-hygiene.sh
```

The audit exits `1` for drift. After verifying the host identity and current Xcode work, repair with `--repair`; the action deletes unavailable devices and Apple's outdated/unusable runtime candidates, then re-audits. It refuses repair while a simulator device is booted. Do not use age-based runtime deletion, `--notUsedSinceDays`, or `all` for routine fleet maintenance.

## Inspect source

Prefer the user's downloaded `.xip`; do not redownload it.

```bash
pkgutil --check-signature "$archive"
shasum -a 256 "$archive"
stage=$(mktemp -d /tmp/xcode.XXXXXX)
cleanup() { rm -rf "$stage"; }
trap cleanup EXIT
(cd "$stage" && xip --expand "$archive")
set -- "$stage"/Xcode*.app
[[ $# == 1 && -d "$1" ]]
app=$1
plutil -extract CFBundleShortVersionString raw -o - "$app/Contents/Info.plist"
plutil -extract ProductBuildVersion raw -o - "$app/Contents/version.plist"
plutil -extract LSMinimumSystemVersion raw -o - "$app/Contents/Info.plist"
DEVELOPER_DIR="$app/Contents/Developer" xcodebuild -version
cleanup
trap - EXIT
```

Require Apple Software signature. Compare `ProductBuildVersion`, not version label alone: two archives named Xcode 26.6 may contain different builds. Do not use `DTXcodeBuild` as the sync key; it can differ from the build reported by `xcodebuild -version`.

## Compatibility

- Require Apple silicon for an Apple-silicon-only archive.
- Require host macOS >= `LSMinimumSystemVersion`.
- Fleet rule: install Xcode 26.6 only on macOS 26 Tahoe, version 26.2 or newer. Skip macOS 27 Golden Gate even if the bundle launches.
- Apply explicit user exclusions after technical checks.

Never change a host OS to make an Xcode build eligible unless explicitly requested.

## Transfer and install

1. Transfer the signed archive, not an expanded app; preserve resumability:

```bash
rsync -a --partial --progress -e 'ssh -o RequestTTY=no -o RemoteCommand=none' \
  "$archive" HOST:Downloads/
```

2. Verify the remote SHA-256 and signature before expansion.
3. Expand on the destination. Use a single-quoted remote script or `ssh HOST 'bash -s'`; never let the local shell expand remote `$variables` or `$(commands)`.
4. Keep this app policy:
   - current stable: `/Applications/Xcode.app`
   - newest prerelease, beta or RC: `/Applications/Xcode-beta.app`
   - previous-major stable: `/Applications/Xcode-previous.app`, only for three months after a new stable major ships unless the user sets another window
5. Replace same-major point releases and same-channel prereleases; do not preserve them. An RC replaces the beta slot. Validate the staged app, move the old app to a temporary rollback path, install and verify the new app, then delete the rollback copy. Run the CLI smoke gate below before deleting any rollback copy. Restore the old app on other failures; the smoke gate retains a failing unselected app for diagnosis.
6. When stable advances to a new major, rotate transactionally: move any existing `Xcode-previous.app` to a temporary rollback path, move the former stable to `Xcode-previous.app`, install and verify the new stable, then delete the older rollback copy. Pass the former stable's new path as the smoke gate's rollback. If it restores stable, also restore the older previous-major rollback to `Xcode-previous.app`. Restore both channel paths on other failures; retain both rollback copies on an unselected smoke failure. Record the new previous-major removal date in the task report.
7. Stop on unexpected destination collisions. Never delete an app outside these known channels without explicit confirmation.
8. Preserve `xcode-select` unless the user requests a switch. Replacing the app at the already-selected path preserves selection.

Use writable `/Applications` directly. Otherwise use passwordless `sudo -n`; if admin approval is required, show a local macOS authorization prompt or report the exact pending step. Do not bypass receipts or license state.

## First launch and verification

Keep the rollback copy through first-launch setup and the CLI smoke gate. Confirm GNU `timeout` (or `gtimeout`, from coreutils) is available before replacing a bundle. For every installed app:

```bash
DEVELOPER_DIR="$app/Contents/Developer" xcodebuild -version
codesign --verify --deep --strict "$app"
DEVELOPER_DIR="$app/Contents/Developer" xcodebuild -checkFirstLaunchStatus
```

If first-launch status is nonzero:

```bash
sudo env DEVELOPER_DIR="$app/Contents/Developer" xcodebuild -license accept
sudo env DEVELOPER_DIR="$app/Contents/Developer" xcodebuild -runFirstLaunch
```

Recheck until status `0`. If sudo/admin UI is unavailable, the app is installed but not ready; report that distinction.

After **every installation or replacement**, once license/first-launch setup is complete and before rollback cleanup, run the CLI smoke gate. `xcrun` may reject a healthy bundle until its license is accepted:

```bash
skills/xcode-sync/scripts/xcode-post-install-smoke.sh "$app" "$rollback"
# For a fresh install without an old bundle, omit the rollback argument.
```

One 20-second deadline covers the installed bundle's `Contents/Developer/usr/bin/git --version` and `Contents/Developer/usr/bin/python3 -V`, plus `xcrun --find git` when the bundle is the persistent `xcode-select` target. Selection lookup ignores the caller's `DEVELOPER_DIR` workaround. On failure, the helper exits nonzero and restores the supplied rollback at a selected path; it moves the failed app aside and prints its location. An unselected failure keeps the installed app and rollback, records `failed-kept`, and prints the workaround. A selected fresh install has no rollback: treat `failed-no-rollback` as immediate operator recovery. Use the same `/Applications` write privileges as the installation, and recheck the restored bundle. Never change `xcode-select` without the user's request.

Observed failure signature: Git and Python sleep forever at dyld start (`sample` shows `_dyld_start`), near-zero CPU, no children. Diagnose with `timeout 8 /usr/bin/git --version`; when a broken Xcode-beta is selected, use `export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` in the affected session and every work order. Check the persistent target separately with `env -u DEVELOPER_DIR xcode-select -p`.

Finish with a host matrix: macOS, desired version/build, installed path, selected path, signature, CLI smoke status (including rollback/failed-bundle paths), first-launch state, simulator-hygiene state, previous-major removal date, and skip/failure reason. Keep source archives unless deletion is explicitly requested.
