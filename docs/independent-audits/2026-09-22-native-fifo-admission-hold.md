# Independent audit — Linux native registry FIFO nonblock admission

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed. This receipt is not the
author’s packet and is not GPT-6 Astra.

Named claim: Linux native registry publication no longer blocks forever on
a preexisting FIFO. `publish_generation_observed` opens the existing
generation with `O_NONBLOCK`, refuses `file_type().is_fifo()`, and maps
`ENXIO`/`EAGAIN` to `LINUX_FIFO_REFUSED`.

macOS/Windows native FIFO remains **NOT VERIFIABLE**. Live
`LINUX_FIFO_REFUSED` on an admitted Linux host was **not** reached on this
WSL host (`LINUX_PUBLICATION_HOST_NOT_CANDIDATE` after
`LINUX_HOST_FACTS_INCOMPLETE`). The isolated `O_NONBLOCK` open still
proves the flag. This is **not** 124-scan closure
(`csf_bae056fe7c8d64f567f4b7ec` remains `PARTIAL_THIS_TREE`).
JSON-Decimal, OAuth, durable replay, signing, and `.fungi` admission were
not started.

Windows 10 Pro, rustc/cargo 1.98.1 (`48a229cea` / `797e8a9bc`).
WSL2 Ubuntu, Linux `6.18.33.2-microsoft-standard-WSL2` x86_64 GNU,
same rustc/cargo 1.98.1. This reviewer did not rebuild production artifacts
beyond the requested `cargo test` runs.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-framework-app-kernel/native/registry-durability/src/lib.rs` | `717388c41be056351501a1459b475be19f5cb9cedbc08480923160aecaba08b9` |
| `packages-ts/galerina-framework-app-kernel/native/registry-durability/tests/linux_fifo_refusal.rs` | `6bb4224087691df39e39980c409ab45815d8f4cd33e43091dfbbdda84e4f72a3` |
| `packages-ts/galerina-framework-app-kernel/native/registry-durability/tests/linux_host_admission.rs` | `eb653a1c33ff173d539e646ac5bd2b36930cce029263b59133ba2995f1047371` |

Dirty paths for this slice: `M` `src/lib.rs`, `M`
`tests/linux_host_admission.rs`; untracked
`tests/linux_fifo_refusal.rs`. Passing tests here are **not** production
admission.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| Existing-generation open uses `O_NONBLOCK` (`0o4000`) | source `lib.rs` linux `O_NONBLOCK` 1270; `publish_generation_observed` 1646–1650; `read_exact_at` 1547–1554; public `LINUX_PUBLICATION_O_NONBLOCK` 618–619 |
| Successful FIFO open is refused (`is_fifo`) | source `file_is_fifo` 1521–1525; existing-open 1652–1654; `read_exact_at` 1555–1557 |
| `ENXIO` (6) / `EAGAIN` (11) map to `LINUX_FIFO_REFUSED` | source `fifo_open_denied` 1527–1529 / 1669–1670; public helper 622–624; Windows unit test |
| Publication does not block forever on a preexisting FIFO | WSL `linux_fifo_refusal` 2/2; independent publication probe 1 ms deny |
| Isolated `O_NONBLOCK` open returns immediately and `is_fifo` | WSL test `nonblocking_fifo_open_returns_immediately_and_is_fifo`; independent Python open 7 µs, `is_fifo=True` |
| Hostile: without `O_NONBLOCK` a FIFO read-open blocks | independent `timeout 0.4` blocking `os.open(..., O_RDONLY)` returncode **124** at 0.404 s |
| Live `LINUX_FIFO_REFUSED` on an admitted Linux host | **not reached** on this WSL host (`HOST_NOT_CANDIDATE`) |
| macOS / Windows native FIFO | **NOT VERIFIABLE** |
| 124-finding scan | **not this claim** (`csf_bae056fe7c8d64f567f4b7ec` `PARTIAL_THIS_TREE`) |

## Command receipts

1. Windows (from `native/registry-durability`):
   `cargo test --test linux_host_admission preexisting_fifo -- --nocapture`
   → **1 passed**, 0 failed, 10 filtered out, `finished in 0.00s`.
   Test: `preexisting_fifo_open_errors_are_refused_and_nonblock_is_admitted`.
   Extra (same binary, not the named filter):
   `cargo test --test linux_host_admission` → **11/11 pass**, 0 failed.
2. WSL (same crate path):
   `cargo test --test linux_fifo_refusal -- --nocapture`
   → **2 passed**, 0 failed, 0 ignored, `finished in 0.01s`.
   - `nonblocking_fifo_open_returns_immediately_and_is_fifo` — **ok**
   - `publication_of_preexisting_fifo_refuses_or_does_not_block` — **ok**
     (accepts `LINUX_FIFO_REFUSED` **or**
     `LINUX_PUBLICATION_HOST_NOT_CANDIDATE`)

Independent extra probes (temp `/tmp` crate and Python; not production):

- `os.O_NONBLOCK=0o4000` matches `LINUX_PUBLICATION_O_NONBLOCK` (2048).
- `os.open(fifo, O_RDONLY|O_NONBLOCK)`: **ok**, 0.000007 s, `is_fifo=True`.
- Blocking `os.open(fifo, O_RDONLY)` under `timeout 0.4`: returncode **124**,
  0.404 s. Without the flag the read-open hangs; the detector can go red.
- `publish_linux_generation_candidate` against a preexisting FIFO:
  - `/tmp/...` (tmpfs): `elapsed_ms=1`
    `DENY:LINUX_PUBLICATION_HOST_NOT_CANDIDATE`
  - `/var/tmp/...` (ext4 on `/dev/sdd`): `elapsed_ms=1`
    `DENY:LINUX_PUBLICATION_HOST_NOT_CANDIDATE`
- `probe_linux_host` on `/`, `/tmp`, `/home`, `/var/tmp`: all
  `LINUX_HOST_FACTS_INCOMPLETE` (WSL sysfs chain does not complete as
  DirectLocalBlock). Host admission fails before the generation FIFO open.

Pre-fix `openat` of the existing generation used
`O_NOFOLLOW | O_CLOEXEC` only (`O_RDONLY` is 0). That is a blocking FIFO
read-open. The dirty diff adds `O_NONBLOCK`, `file_is_fifo`, and the
`ENXIO`/`EAGAIN` mapping.

## Challenge 1 — does publication still block on a preexisting FIFO?

**No on this WSL host. CONFIRMED for non-blocking return.** Publication
returned in 1 ms. On this host the deny is
`LINUX_PUBLICATION_HOST_NOT_CANDIDATE`, so the production
`LINUX_FIFO_REFUSED` branch is **source-inspected, not live-executed**.
The isolated `O_NONBLOCK` open of a live FIFO returned in 7 µs with
`is_fifo=true`. Source locators: `lib.rs` 1646–1672 and 1547–1557.

## Challenge 2 — can the hang detector go red?

**Yes. CONFIRMED.** The same FIFO without `O_NONBLOCK` was still blocked
when `timeout` killed it (124). The green nonblock test is not vacuous on
this kernel.

## Challenge 3 — `ENXIO`/`EAGAIN` → `LINUX_FIFO_REFUSED`?

**CONFIRMED in source and the Windows helper unit test.** Live `ENXIO`
from `O_RDONLY|O_NONBLOCK` is not expected on Linux (that errno is the
`O_WRONLY` no-reader case). Production uses module-local `fifo_open_denied`
(`Some(6)|Some(11)`), not the public helper; both match.

## Residuals (not findings against the named claim)

- macOS `read_exact_at` still opens `O_RDWR|O_CLOEXEC|O_NOFOLLOW` with no
  `O_NONBLOCK` (`lib.rs` 2128). Windows named-pipe FIFO is untested.
  Both remain **NOT VERIFIABLE**.
- This WSL host never admits a directory (`LINUX_HOST_FACTS_INCOMPLETE`),
  so publication against a FIFO denies `HOST_NOT_CANDIDATE` before the
  FIFO open. The nonblock open test still proves the flag.
- Public `LINUX_PUBLICATION_O_NONBLOCK` / `linux_fifo_open_errno_is_refused`
  are test-facing duplicates of the linux-module locals; production does
  not call the public helper.
- `file_is_fifo` treats metadata failure as not-FIFO (`unwrap_or(false)`);
  `read_exact_at` still uses `O_NONBLOCK` and then refuses non-regular
  files. Hang is still closed; the deny code may be `COLLISION` rather
  than `LINUX_FIFO_REFUSED`.
- Scan `0f6063dd` finding `csf_bae056fe7c8d64f567f4b7ec` stays
  `PARTIAL_THIS_TREE` (Windows live FIFO NV). Inventory
  `findings.json` sha256
  `07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`
  is unchanged by this review. Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named claim. Detector is not invalid.
Evidence is sufficient for Linux `O_NONBLOCK` open + `is_fifo` refuse +
non-blocking publication return on this WSL kernel; insufficient for
admitted-host `LINUX_FIFO_REFUSED`, macOS/Windows FIFO, and scan closure.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
