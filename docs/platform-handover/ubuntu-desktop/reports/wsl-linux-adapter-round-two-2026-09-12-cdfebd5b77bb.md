# WSL Linux adapter round-two portability report

Date: 2026-09-12`r`nGalerina head: `cdfebd5b77bbda5dc6c4290422a61c383c413298``r`nSLIDE head: `639329f7bb27d940e1e16953262009a0cb81d92b``r`nLyth/Weaver reference head: `a68eeb5ced8a522b3ab140422c1e7ce84ec887fa`

Evidence classification: **`VIRTUAL_NON_AUTHORIZING`**. This is a WSL2
portability run, not a separately booted Ubuntu Desktop run. It cannot release
production authority or close the native Linux durability gate.

## Host and custody

- Distribution: Ubuntu 26.04.1 LTS (`VERSION_ID=26.04`).
- Kernel: `6.18.33.2-microsoft-standard-WSL2`, x86-64.
- Repository filesystem: ext4 on a WSL virtual disk (`/dev/sde` observed).
- Toolchain: Node `v24.18.0`, Rust/Cargo `1.98.1`, Git `2.53.0`.
- Galerina and SLIDE were clean detached exact-head clones in the isolated WSL
  workspace. No signing key, private credential, or production authority was
  used.

## Checks completed

| Lane | Result | Evidence |
|---|---|---|
| Galerina static registry profile | **CANDIDATE**, `productionAuthorizing=false` | `wsl-linux-adapter-round-two-2026-09-12-cdfebd5b77bb.static-profile.json` |
| Galerina functional portability smoke | **PASS**, six rows, result `42`, 100 packages | `wsl-linux-adapter-round-two-2026-09-12-cdfebd5b77bb.functional.json` |
| Galerina platform-smoke contract tests | **PASS 7/7** | command output retained in the run workspace |
| Native Rust formatting, clippy, ordinary tests and release build | **PASS** | exact repaired head; release output retains one known dead-code warning, while `clippy -D warnings` is clean |
| SLIDE contract manifests and catalog | **CURRENT**, 96 contract files and 101 catalog files; authority remains false | `wsl-linux-adapter-round-two-2026-09-12-cdfebd5b77bb.slide-platform.json` plus contract output |
| SLIDE full test suite | **PASS 1060/1060**, 108 suites, no failures/cancellations/skips | command output retained in the run workspace |
| SLIDE platform observer | **MATCH**, Ubuntu profile, compatibility verdict `1`; execution evidence `UNVERIFIED` | `wsl-linux-adapter-round-two-2026-09-12-cdfebd5b77bb.slide-platform.json` |

The successful receipts are self-observation and portability evidence. Their
`authenticated`, `authorityReleased`, and `productionAuthorizing` fields stay
false.

## Native Linux-only tests and the boundary result

The ignored tests were rerun with a fresh, mode-700 evidence directory at the
exact Galerina head. They correctly stayed fail-closed under WSL:

- `linux_live_host`: 4 tests, **1 passed** (symlink/hard-link collision), **3
  failed** before candidate admission.
- `linux_fault_refusal`: 1 test, **failed** while candidate publication was
  refused.
- `linux_process_kill`: 1 test, **failed** at its required prior candidate
  publication.

The refusal is the WSL host-identity boundary (`LINUX_HOST_FACTS_INCOMPLETE`,
followed by `LINUX_PUBLICATION_HOST_NOT_CANDIDATE`), caused by the virtual
VMBUS-backed host facts. The tests must not be weakened to make WSL look like a
bare host. The raw outputs are retained beside this report as:

- `wsl-linux-adapter-round-two-2026-09-12-cdfebd5b77bb.linux-live-ignored.log`
- `wsl-linux-adapter-round-two-2026-09-12-cdfebd5b77bb.linux-fault-ignored.log`
- `wsl-linux-adapter-round-two-2026-09-12-cdfebd5b77bb.linux-kill-ignored.log`

## Transfer set

The fresh, machine-checkable set is ready at:

`docs/platform-handover/ubuntu-desktop/transfer/wsl-round2-2026-09-12-cdfebd5b77bb/`

It contains `Galerina-current.bundle`, `SLIDE-current.bundle`, and
`CURRENT-BUNDLE-MANIFEST.txt`. Both bundles pass `git bundle verify`; the
manifest records their exact heads and SHA-256 values.

## Disposition

The Linux adapter implementation is complete and the round-two WSL transfer
set is ready. WSL has supplied useful compiler, contract, functional and
fail-closed portability evidence. It has not supplied the direct Ubuntu
Desktop candidate, native live publication, process-termination, reboot or
power-loss evidence required by the Ubuntu runbook. Those remain separate
owner-controlled gates.
