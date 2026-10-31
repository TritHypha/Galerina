# MEM-R29: custodian crash-and-scan (gap 1.5)

Date: 2026-10-31. Branch `grok/mem-r29-custodian-crash-scan-20261031` from Galerina main `c420082a2`.
Scope: Rust VOK checker only (`packages-ts/galerina-core-runtime/native/vok-authority`), tests only, no
production source changed. Synthetic canaries only; no keys, no real secrets.

## What gap 1.5 asked for

"An actual crash-and-scan test (needs a core-dump-capable host)." MEM-R19 pinned the custodian's
hardening calls (`RLIMIT_CORE` 0/0 and `PR_SET_DUMPABLE` 0, read back, refuse with exit 2 otherwise)
but never crashed the process or scanned memory. The WSL host used for the block tests has
`core_pattern` = `core` (plain file in the cwd) and `ptrace_scope` = 1, so a real core is producible
there and no special host is needed.

## New suite: `tests/custodian_crash_scan.rs` (5 tests, Linux only)

Each test builds a fresh random canary `SYNTH-CANARY-<tag>-<128-bit hex>` at run time, so the needle is
never a literal in any binary, and matches it whole (a truncated copy is not a hit).

1. `the_scanner_finds_a_canary_in_its_own_memory`: the `/proc/<pid>/mem` scanner finds a canary held in
   the test's own heap (the scanner works).
2. `a_dumpable_control_is_scannable_and_its_canary_is_found`: a plain `sh` holding the canary in a shell
   variable is scanned live by the same uid and the canary is found (a refusal would come from the
   custodian, not from the host).
3. `a_live_same_uid_scan_of_the_custodian_is_refused`: after hello, PUT and GET of the canary, a same-uid
   open of the custodian's `/proc/<pid>/mem` and `/proc/<pid>/maps` is refused (root host: the scan must
   still not find the canary).
4. `a_crashing_custodian_writes_no_core_even_with_an_unlimited_start`: for SIGSEGV, SIGABRT, SIGQUIT and
   SIGBUS, a control `sh` started with `ulimit -c unlimited` dumps a core that contains its canary, while
   the custodian started the same way lowers its own limit to `0 0`, dies by the signal with no core bit,
   writes nothing to its cwd, sends no reply, and never echoes the canary on stderr.
5. `the_core_scan_helpers_match_whole_needles_only`: unit pins for the matcher and the core-file finder.

`VOK_EXPECT_ARENA=1` makes a refused arena a failure (no silent skip); `VOK_EXPECT_CORE=1` makes a host
that can't produce a control core a failure, so the no-core result can't pass vacuously.

## Finding: Rust std swallows the first asynchronous SIGSEGV/SIGBUS

Rust std installs a SIGSEGV/SIGBUS handler for stack-overflow detection. For a fault outside the guard
page it restores `SIG_DFL` and returns, so a real fault re-faults and dies. A `kill(2)`-sent signal does
not re-fire, so the custodian kept running after one SIGSEGV. The test sends the signal a second time
for 7 and 11 to model the re-fault. Not a weakness (the custodian still dies with no core on the real
re-fault), but worth knowing for any crash harness.

## Mutants (4/4 killed, source restored, sha256 unchanged `1D371C32...F70B4`)

| Mutant | Change | Killed by |
|---|---|---|
| M1 | `if !harden::apply()` to `if false` | crash test (limit not 0 0) and live scan (mem open succeeds) |
| M2 | stay dumpable (`PR_SET_DUMPABLE` 1, read-back relaxed) | live scan; crash test alone passes because the 0 core limit still blocks the dump |
| M3 | keep the core limit (no `setrlimit`, read-back relaxed) | crash test (limit row not 0 0) |
| M4 | dumpable 1 with the read-back intact | custodian refuses at open, `VOK_EXPECT_ARENA=1` fails both custodian tests |

M2 and M3 show that each of the two controls is pinned by a different test, so neither can be dropped
while the other hides it.

## Block test

All vok-authority suites green once with `VOK_EXPECT_ARENA=1 VOK_EXPECT_CORE=1` (lib 242 passed / 9
ignored, plus every integration suite including the new 5).

## Gap map

Row 1.5 moves from PARTIAL to COVERED for the custodian: crash with an unlimited inherited limit writes
no core, and a live same-uid scan is refused, both against a dumpable control that proves the scan
works. Still out of scope: a root or `CAP_SYS_PTRACE` attacker, and hosts whose `core_pattern` pipes
to a collector (systemd-coredump honours the dumpable flag too, but that is not exercised here).
