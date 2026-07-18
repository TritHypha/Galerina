# RD-0361 T1 tranche — R4 authority-flip evidence pack

**Assembled:** 2026-07-18 · **Tranche:** T1 (the four sentinel boundary twins) · **State:** evidence complete, **awaiting the owner's condition-form nod** (the flip is NOT done).

This pack exists to satisfy the **R4 unlock protocol** (`HANDOVER-v1-finish-line-cutover-and-gap-map`, §"R4 unlock protocol"): the owner's go takes the form *"flip T1 given evidence pack `<this file>`"*, and if any item below later proves false the flip is **void and reverted**. Nothing here flips authority — the twins remain `differential` (both the `.wasm` and the `.ts` run; any disagreement rejects). R4 is **not** P9-gated (RD-0361 §2: "verdict cutover does NOT wait for P9"; the gate is differential-verdict-parity, not P9 byte-parity — R&D `feca65e`).

## The tranche

| Twin | Package (`src/self-hosted/…`) | Surface |
|---|---|---|
| `synchronization-gate` | `galerina-core-sentinel-time` | physical↔logical clock-drift envelope (LST-DRIFT-001 / LST-SYNC-001) |
| `power-governor` | `galerina-core-sentinel-power` | thermal band + kernel up-tier gate (LSP-*) |
| `cold-boot` | `galerina-core-sentinel-state` | fail-closed snapshot restore (LSS-NOSNAP-001 / LSS-INTEGRITY-001) |
| `audit-egress` | `galerina-core-sentinel-egress` | tamper-evident audit-chain link + epoch verify (per-batch MAC) |

## The five evidence items

### (a) Execution column all-`differential` — ✅
`node scripts/audit-kernel-fungi-twins.mjs` reports every T1 sentinel twin as `differential` (built, #105-admitted, and executed against its `.ts` reference), 0 `authoritative` (none flipped). No twin is `shadow`.

### (b) Zero `.wasm`↔`.ts` verdict mismatches over the suite soak — ✅
Each twin's execution-cutover differential asserts the **WASM verdict === the real `.ts` verdict** over a fail-closed boundary corpus (below / at / above each envelope, both branches), and REJECTS on any disagreement. All four pass in the full workspace run (`94/94 packages · 7,448 tests · 0 fail`):
- `sentinel-time/tests/rd0361-execution-cutover.test.mjs`
- `sentinel-power/tests/rd0361-power-governor-execution.test.mjs`
- `sentinel-state/tests/rd0361-cold-boot-execution.test.mjs`
- `sentinel-egress/tests/rd0361-audit-egress-execution.test.mjs`

### (c) Anti-neuter — the differential is non-vacuous (mutation-kill) — ✅
`node scripts/audit-mutation.mjs` (SEC-002, group `RD0361_T1`): for each twin a deliberately-weakened fold (a planted fail-open / boundary error) is re-introduced into the `.fungi`; its execution-cutover differential rebuilds the WASM from the mutated source and **KILLS the mutant** (WASM≠`.ts` → the gate rejects). This proves item (b)'s "zero mismatches" is a real guard, not a vacuous pass. Full suite: **27/27 mutants killed, 0 survived**. The four T1 mutants:
- `rd0361-t1-sync-drift-boundary` — drift `>` → `>=`
- `rd0361-t1-power-adjustment-boundary` — up-tier `<` → `<=`
- `rd0361-t1-coldboot-integrity` — integrity `== false` → `!= false` (restore a corrupt snapshot)
- `rd0361-t1-egress-mac` — MAC `== false` → `!= false` (accept a tampered batch)

### (d) Each twin hash-pinned, signed, #105-admitted — ✅
`node scripts/gather-t1-twin-hashes.mjs` builds each twin to WASM (R0), signs it, and admits it through the attestation-first #105 gate (R1). All four R0-clean + #105-admitted. Byte counts match the RD-0361 T1 record (132 / 288 / 87 / 299). The pinned sha256 (2026-07-18, current emitter):

| Twin | bytes | sha256 |
|---|---|---|
| `synchronization-gate` | 132 | `3c697b6241fb777e652312a064c6bf6d6dd0e16794ce2ae01ea1641d0fe54eac` |
| `power-governor` | 288 | `371e2efe31c335163267f654652e259e92ef112444d51fe4c79fcb56ff051126` |
| `cold-boot` | 87 | `19632e4aaadc65a1498daaba7bc61a86959a08621c4f577651b73a10be7ad093` |
| `audit-egress` | 299 | `ccd7e7c9dd3c439f26ccc435bb6321ac8c7724b47603633901e813373deda115` |

> These hashes are the current emitter's deterministic output; a change to a twin or the emitter moves the hash. Re-run the gatherer immediately before the flip and re-pin if they have moved.

### (e) Measured perf for hot-path twins — N/A
The T1 sentinels are tiny pure verdict folds (87–299-byte modules), not a hot path. No perf waiver needed.

## What the flip does (on the owner's nod, per surface)

1. Mark the twin's WASM **authoritative** (it becomes the decider).
2. Keep the `.ts` running as a **differential shadow** — compare every verdict, alarm on divergence — for a bake window (shadow-bake; do NOT delete the `.ts` at the moment you start trusting the WASM).
3. Bake clean → delete the `.ts` decision body per surface.
4. The twin-audit execution column records `authoritative` and **fails RED on any regression** (`authoritative` → anything lesser). The flip commit cites the owner's go + this pack.

## The ask

This pack is complete for T1 (a–e). It supports the owner's condition-form nod: **"flip T1 given evidence pack `docs/security/rd0361-t1-r4-evidence-pack.md`."** Until that nod, the twins stay differential and no authority changes.
