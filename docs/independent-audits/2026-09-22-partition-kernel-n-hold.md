# Independent audit — PartitionDecider / requiredRedundancy kernel-n bound

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed. This receipt is not the
author’s packet and is not GPT-6 Astra.

Named claim: `PartitionDecider` / `requiredRedundancy` refuse kernel `n`
outside `1..MAX_KERNEL_N` (4096) **before** allocating
`Int8Array(n)` / `Int32Array(n)`. `n=1e9` stays digital quickly.
`n=4097` stays digital. `requiredRedundancy(1e9)=Infinity`. Hostile
wall clock `<200ms`.

This is an **emulator software** control, not silicon. This is **not**
124-scan closure and **not** production admission. JSON-Decimal, OAuth,
durable replay, signing, and `.fungi` admission were not started.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). Tests
import `dist/index.js`. `dist/partition-decider.js` mtime is newer than
dirty `src/partition-decider.ts` and contains the same
`Number.isSafeInteger` / `n > MAX_KERNEL_N` return **before**
`new Int8Array(n)`. This reviewer did not rebuild.

HEAD already had the refuse-before-allocate bound (`const MAX_KERNEL_N`
unexported). Dirty delta for this slice: `export const MAX_KERNEL_N`,
re-export from `src/index.ts`, and the hostile oversized test. Passing
tests here are **not** production admission.

Unrelated dirty on the same package (`src/photonic-bridge.ts`,
`tests/photonic-bridge.test.mjs`) was not this claim.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-ext-photonic-emulator/src/partition-decider.ts` | `07eaa3eb249e09f7a429aac661ec012002d1207d98b3f98a441ff4712f4c0cbd` |
| `packages-ts/galerina-ext-photonic-emulator/src/index.ts` | `bf5715832a8e5edb3b2d6d10bdfc9117a16da60b789d769f9236d9c7a498ea36` |
| `packages-ts/galerina-ext-photonic-emulator/tests/partition-decider.test.mjs` | `86fe0ecf05ffa3838b563f6c4df3a40929a8962936be9bd3e3d2257dbabe07bf` |
| `packages-ts/galerina-ext-photonic-emulator/dist/partition-decider.js` | `ee017c7fbd2923c512559bdd80ed84251952b7bb62f78b70d5c94dc198b5aae3` |
| `packages-ts/galerina-ext-photonic-emulator/dist/index.js` | `cd96c3ac4dc38722dad1e940e3f2b894a98af5e1ba4539b639b38ac5dac121f1` |

Dirty paths for this slice: `M`
`packages-ts/galerina-ext-photonic-emulator/src/partition-decider.ts`,
`M` `packages-ts/galerina-ext-photonic-emulator/src/index.ts`, `M`
`packages-ts/galerina-ext-photonic-emulator/tests/partition-decider.test.mjs`.
`dist/` is gitignored. Passing tests here are **not** production admission.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| Refuse `n` outside `1..MAX_KERNEL_N` (4096) | source `MAX_KERNEL_N=4096` L87; `requiredRedundancy` L90; `decide` L139–141; dist L42–45 / L91–92 |
| Refuse **before** `Int8Array(n)` / `Int32Array(n)` | source L90 then L92; dist L44–47. Independent constructor intercept: hostile lengths `[]` |
| `n=1e9` stays digital quickly | suite hostile test **0.2727ms**; independent **0.1263ms**. Reason `FAIL-CLOSED: n missing/NaN/<1/oversized → digital` |
| `n=4097` (`MAX_KERNEL_N+1`) digital | suite + independent `over.target==="digital"` |
| `requiredRedundancy(1e9)=Infinity` | suite `assert.equal(inf, Infinity)`; independent `String(v)==="Infinity"` (`JSON.stringify` would print `null`) |
| Hostile wall clock `<200ms` | suite `ms < 200` (0.2727ms); independent 0.1263ms |
| `n=1e9` is a safe integer (so the ceiling, not `isSafeInteger`, is the gate) | independent `Number.isSafeInteger(1e9)===true` |
| Discriminating negative: admitted `n=4096` still allocates | independent intercept recorded `Int8Array(4096)` and `Int32Array(4096)` twice; `requiredRedundancy(4096)=1` |
| 124-finding scan / silicon | **not this claim** |

## Command receipts

1. `node --test --test-timeout=30000 packages-ts/galerina-ext-photonic-emulator/tests/partition-decider.test.mjs`
   → **7/7 pass**, `fail 0`, `cancelled 0`, `skipped 0`,
   `duration_ms 296.8721`.
   - M1 Meech ratio / crossover — **green** (0.8703ms)
   - M2 never-a-slowdown sweep `n=1..4096` — **green** (162.594ms)
   - M4 redundancy / noisy infeasible — **green** (0.2312ms)
   - M5 crypto / control-flow / lane:digital — **green** (0.1713ms)
   - A-2 declared `crypto.*` effects — **green** (0.231ms)
   - M6 NaN/negative/infeasible → digital — **green** (0.1848ms)
   - `hostile: oversized kernel n does not allocate and stays digital` — **green** (0.2727ms)

Independent extra probe (`%TEMP%\galerina-partition-kernel-n-probe.mjs`;
not production; `Int8Array`/`Int32Array` proxied after import of this
tree’s `dist/`):

- `MAX_KERNEL_N=4096`
- `decide({n:1e9})` → `digital` / `FAIL-CLOSED` oversized; `decide({n:4097})` → `digital`
- `requiredRedundancy(1e9)=Infinity`; `requiredRedundancy(4097)=Infinity`
- hostile trio wall `0.1263ms`
- constructor lengths after hostile calls: `Int8Array=[]`, `Int32Array=[]`
- extra refuse (all digital / Infinity): `n=0`, `-1`, `NaN`, `Infinity`, `4096.5`, `requiredRedundancy(0/-5/NaN/Infinity/1.5)`
- admitted `n=4096`: `requiredRedundancy=1`; `decide` photonic net-win; intercept `[4096,4096]` for both typed arrays (direct call + `decide`)

The n=4096 intercept is the discriminating red detector: the instrument
records allocations when the bound admits `n`, and records none when it
refuses.

## Challenge 1 — can `n=1e9` still allocate `Int8Array`/`Int32Array`?

**No on this src and dist. CONFIRMED.** `1_000_000_000` is a safe
integer, so `isSafeInteger` alone would not refuse. `n > MAX_KERNEL_N`
returns `Infinity` / digital **before** L92 typed-array construction.
`PartitionDecider.decide` also refuses at L139–141 before calling
`requiredRedundancy`. Independent proxy recorded zero hostile
constructs; n=4096 recorded two of each.

Locators: `partition-decider.ts` 87–92, 139–149;
`dist/partition-decider.js` 42–47, 91–100.

## Challenge 2 — is `n=4097` digital and `requiredRedundancy(1e9)` Infinity?

**Yes. CONFIRMED.** Suite and independent both digital for
`MAX_KERNEL_N+1`. Independent `requiredRedundancy(1e9)` and
`requiredRedundancy(4097)` are `Infinity` (`=== Infinity`, not JSON
`null`).

## Challenge 3 — can the detector go red?

**Yes. CONFIRMED.** The hostile test asserts digital + Infinity +
`<200ms`. Independent constructor intercept stays empty on oversized
`n` and records `4096` on the admitted bound. Without the
`n > MAX_KERNEL_N` clause, `Int8Array(1e9)` / `Int32Array(1e9)` would
be ~5 GiB and would miss the 200ms budget or OOM.

## Residuals (not findings against the named claim)

- This is **emulator software**, not a named PIC / silicon measurement.
  Cost-model numbers remain labelled aspirational envelopes.
- `PhotonicRuntime.run` still calls `backend.executeExact(op)` after a
  digital decision. Huge `op.count` (as opposed to `kernel.n`) is a
  different bound (`tmacExact` loop / bridge decode). Out of this claim.
- `analogVarianceClosedForm` loops `i < n` over caller-supplied arrays
  with no `MAX_KERNEL_N` of its own. Direct callers can still pass huge
  buffers; `requiredRedundancy` will not construct them for oversized `n`.
- M2 still allocates up to `n=4096` (intended admitted range).
- Suite uses `Date.now()` as a timing proxy; independent used
  `performance.now()` plus constructor intercept.
- Unrelated dirty `photonic-bridge.ts` (packed-trit decode) was not
  reviewed here.
- 124-finding scan remains a separate open programme. Overall
  disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for production
  admission.

## Classification

No `CONFIRMED_FINDING` on the named claim. Detector is not invalid:
oversized `n` stays digital without typed-array construction; admitted
`n=4096` still allocates. Evidence is sufficient for
`PartitionDecider.decide` and `requiredRedundancy` on this dirty tree;
insufficient for silicon, bridge `op.count` loops, scan closure, and
production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan
closure.
