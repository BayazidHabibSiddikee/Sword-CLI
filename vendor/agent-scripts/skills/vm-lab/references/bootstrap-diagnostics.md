# Bootstrap diagnostics

Keep bootstrap failures separate from product failures. Diagnose only the task-owned clone or packaging process. Keep raw logs, snapshot IDs, VM names, bundle paths, and host inventory in private task evidence; publish only sanitized conclusions. Never reset a source snapshot, operate another task's VM (including recovery VMs), access inherited credentials, or weaken startup security.

## Apple-VZ clone has an empty active raw disk

**Reported incident:** both a linked clone and a subsequent `clone --unlink` produced an active raw `.hds` with a logical size of 128 GiB, zero allocated bytes, and no GPT despite a populated immutable source snapshot. A task-owned standalone clone booted after APFS-copying the exact snapshot `.hds` into its active disk path and the matching `Snapshots/{id}.bin` into its own `aux.bin`, leaving its disk descriptor unchanged. Source snapshots and other VMs were preserved. This is the supplied incident account, not a newly reproduced Parallels defect or a vendor-supported recovery procedure.

### Check the contract before retrying

Record the installed version and help; options vary by version:

```bash
prlctl --version
```

```bash
prlctl clone --help
```

```bash
prlctl snapshot-list --help
```

Parallels CLI 27.0.1 (58670), checked 2026-09-05, documents `--linked [-i,--id]` and describes `--unlink` as **creating a clone** unlinked from its parent, not repairing the existing VM in place. It also offers `--force-deep-copy`; neither its name nor clone success proves a populated boot disk. Do not try more clone variants without checking the resulting artifact. A VZ active-VM limit, insufficient space, and a missing boot disk are different failures; never stop someone else's VM to make capacity.

For the task-owned VM, record its UUID, type, stopped state, bundle location, selected snapshot ID, and the active disk path resolved from its configuration and `DiskDescriptor.xml`. Do not select the newest/largest `.hds` by glob. Use existing read-only snapshot metadata to resolve the exact source disk and auxiliary-state pair. If ownership, format, ancestry, or pairing is ambiguous, stop rather than guessing.

On a **confirmed raw, standalone** image (not an arbitrary Parallels delta/container), compare logical size, allocation, and partition structure. Set `raw_hds` to the verified file; inspect the approved immutable source image separately for comparison:

```bash
stat -f 'logical_bytes=%z allocated_blocks=%b' "$raw_hds"
```

```bash
/usr/sbin/gpt -r show "$raw_hds"
```

`stat`'s allocated blocks are 512-byte units on macOS. `gpt -r` opens read-only; examine the partition listing, not merely its exit code. A synthetic 128 GiB all-hole file returned exit 0 with only an unpartitioned extent. Sparse allocation alone is normal for a linked child or APFS clone and does **not** establish a broken backing chain. Missing GPT in a confirmed standalone raw image, combined with zero allocation and a populated source, is the useful discriminator. Do not mount the source or attempt partition repair to investigate this symptom.

### Recovery boundary

Prefer a supported, verified clone path. The reported disk-plus-auxiliary copy is a narrowly scoped fallback, not a general `.hds` repair recipe. If a later task explicitly authorizes it:

1. Verify the destination is a stopped, task-owned **standalone** clone; resolve real paths and reject symlinks/hardlinks or backing references that could redirect writes into the source or another VM. Confirm the immutable snapshot is stable and the selected raw disk is self-contained, not one member of an unresolved delta chain. Stop if any check fails.
2. Preserve the destination's original active disk and `aux.bin` in task-owned rollback storage. Record its descriptor hash and the source snapshot/disk/auxiliary identities; provision enough free space for subsequent copy-on-write growth.
3. Stage separate APFS copies of the **exact** snapshot `.hds` and its matching `Snapshots/{id}.bin` in the destination filesystem. Verify content equality before replacing only the destination's active `.hds` and `aux.bin`. Keep `DiskDescriptor.xml` byte-identical. Do not substitute the source's current `aux.bin` or mix snapshot IDs.
4. Recheck allocation/GPT, descriptor hash, and unchanged source identities/content before starting only the task-owned clone. Verify normal boot independently; boot success does not authorize using inherited credentials. On mismatch or continued boot failure, stop and retain evidence—no source edits, snapshot switches, security bypasses, or automatic repair loop.

macOS `cp -c` requests `clonefile(2)` copy-on-write semantics, but can fall back to an ordinary copy across filesystems or on unsupported filesystems. An APFS file clone is not a Parallels linked clone: subsequent writes are private to each file. A hardlink is not a substitute. Generic manuals explain copy semantics, **not** Parallels snapshot/auxiliary pairing; that pairing must be verified for the particular task.

## Packaging stalls before its first output

**Observed evidence:** the saved macOS process sample has nested `command_substitute` frames ending in `do_redirections → heredoc_write → write` throughout all 893 samples; the original packaging log is empty. The handoff additionally reports a full 16 KiB pipe and no child process; those details are not proved by the stack alone. A second log reaches `Bundle ready`, and a task-local `bash → /bin/bash` symlink exists. The handoff attributes success to `/bin/bash` 3.2 plus that PATH shim; the logs do not preserve the exact launch command.

### Diagnose the shell, not the silent product

For the **exact task-owned stuck Bash PID**, keep a bounded sample, process/child state, and file-descriptor information in private evidence. Do not use name-wide `sample bash`, `pkill bash`, or environment/credential dumps. Set `evidence_dir` to a fresh task-owned private directory:

```bash
ps -p "$pid" -o pid=,ppid=,state=,etime=,comm=
```

```bash
pgrep -P "$pid"
```

```bash
sample "$pid" 1 1 -file "$evidence_dir/shell-sample.txt"
```

```bash
lsof -nP -p "$pid"
```

`pgrep` exit 1 means no matching children at that instant, not proof across the entire stall. Repeat observations before concluding. For pipes, `lsof` can report buffered content, not necessarily capacity; retain both endpoint/process evidence rather than calling any `16384` value a full pipe. Resolve and record the actual interpreter/version as well as the script's shebang and PATH-resolved child shells. Sanitize paths and command data before sharing diagnostics; avoid unrestricted `bash -x` around signing or credentials.

The incident packaging source performs nested command substitution with a Python heredoc before its first normal progress output. It also invokes bare `bash` and helpers with `#!/usr/bin/env bash`. Therefore a redirection stall can precede both the expected child process and visible build work, and selecting `/bin/bash` for only the outer script does not pin all descendants. Inspect the current script; do not infer the exact blocked line from the stack alone.

Bash 5.3's `here_document_to_fd` can synchronously fill a pipe via `heredoc_write` before returning its read descriptor. The pipe path has a compile-time size threshold and a runtime capacity check only when `F_GETPIPE_SZ` is available; other cases use a temporary file. This explains why a blocked heredoc write is a useful lead, **not** why this particular host blocked. No confirmed Parallels, Homebrew, Bash, or macOS vendor root cause follows from the handoff.

### Invocation-local fallback

If the current script and descendants support Bash 3.2, retry only the authorized packaging job with the same source, build/signing guards, environment, and arguments. Preserve the normal tool PATH; prepend a temporary shim so bare `bash` and `/usr/bin/env bash` select the system interpreter. Explicit absolute interpreter paths and children that replace PATH must be checked separately.

Run this compound command from the authorized build checkout, carrying over any original script arguments:

```bash
(
  shim="$(mktemp -d "${TMPDIR:-/tmp}/vm-lab-bash.XXXXXX")" || exit
  trap 'rm -f "$shim/bash"; rmdir "$shim"' EXIT
  ln -s /bin/bash "$shim/bash" || exit
  PATH="$shim:$PATH" /bin/bash ./scripts/package-mac-app.sh
)
```

This creates no persistent shell configuration and leaves Homebrew, global PATH, Codex settings, source files, and guards unchanged. Do not replace the Homebrew binary, set global `BASH_COMPAT`, or remove validation/signing steps. Validate the expected artifact and preserve the exit status/log; reaching the first message is not packaging success.

**Fresh checks, 2026-09-05:** macOS 26.6.2 (25G83), Homebrew Bash 5.3.15 and system Bash 3.2.57 both completed synthetic command-substitution heredocs of 1,024; 16,383; 16,384; 16,385; 32,768; 65,536; 131,072; and 262,144 bytes, each with a three-second timeout. The installed Homebrew binary UUID matches the saved sample. The stall did **not** reproduce in these isolated probes; this neither invalidates the saved stack nor proves production packaging healthy. Do not manufacture reproduction by exhausting host pipes/resources. No VM was booted or altered, and packaging was not rerun for this documentation check.

## Sources and evidence limits

- Installed contracts: `prlctl --version`, `prlctl clone --help`, `prlctl snapshot-list --help`; macOS `stat(1)`, `stat(2)`, `gpt(8)`, `cp(1)`, `clonefile(2)`, `sample(1)`, and `lsof(8)` manuals. Synthetic raw-file and copy-on-write checks confirmed the read-only GPT and independent-copy behavior above.
- [Parallels clone reference](https://docs.parallels.com/landing/parallels-desktop-developers-guide/command-line-interface-utility/manage-virtual-machines-from-cli/general-virtual-machine-management/clone-a-virtual-machine): linked/snapshot clone options, not a guarantee of Apple-VZ raw-disk hydration or a disk/auxiliary recovery specification. Installed help additionally documents `--unlink` and `--force-deep-copy`.
- [GNU Bash 5.3 `redir.c`](https://cgit.git.savannah.gnu.org/cgit/bash.git/plain/redir.c?h=bash-5.3): `here_document_to_fd` and `heredoc_write`; source mechanism, not proof of the installed build's pipe threshold or the incident's cause.
- [OpenClaw packaging source](https://github.com/openclaw/openclaw/blob/main/scripts/package-mac-app.sh): recheck the tested revision and child interpreters; this link tracks main, not a frozen incident reproduction.
- Private incident artifacts were inspected for the stack, empty/completed build logs, task-local symlink, and recorded Apple-VZ VM type. Original allocation/GPT and disk/auxiliary-copy proof was not located in the scoped artifacts; those recovery details remain explicitly attributed to the supplied handoff. Raw artifacts and private inventory locators are intentionally not copied here.
