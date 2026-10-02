# Independent audit — StubTernaryBridge.decodePackedTrits capacity / overflow / 2^35 wrap refuse

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed. This receipt is not the
author’s packet and is not GPT-6 Astra.

Named claim: `StubTernaryBridge.decodePackedTrits` refuses packed trit
count above `1_048_576`, packed buffers shorter than needed words,
`offset+count` overflow of `MAX_SAFE_INTEGER`, and a `2^35` offset that
would wrap via `| 0` into `packed[0]`. Missing packed words are not
silently zero-filled for those cases.

Hostile acceptance (named): count `1048577` throws admitted bound;
17 trits vs 1 word throws capacity; offset `2^35` throws
`/lack capacity|overflow|offset/`.

This is a CPU simulation stub (`nativeAvailable === false`), not native
SIMD. This is **not** 124-scan closure. Production admission was not
requested and is not granted.

Node v24.18.0. Tests import `../dist/index.js` (gitignored dist), which
re-exports `StubTernaryBridge` from `./bridge/stub-provider.js`.
`dist/bridge/stub-provider.js` mtime (`2026-09-23T01:11:48.161Z`) is
newer than dirty `src/bridge/stub-provider.ts`
(`2026-09-23T01:11:40.890Z`) and contains the same `MAX_COUNT =
1_048_576`, overflow `offset > Number.MAX_SAFE_INTEGER - (count - 1)`
refuse, `Math.floor` word index (no `(idx / 16) | 0`),
`neededWords > packed.length` capacity refuse, and no `packed[i] ?? 0`.
This reviewer did not rebuild.

Dirty slice for this claim vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-tower-citizen/src/bridge/stub-provider.ts`
(overflow check; `Math.floor` replacing `| 0`; in-loop `wordIndex`
bounds / `undefined` refuse) and `M`
`packages-ts/galerina-tower-citizen/tests/bridge.test.mjs`
(+3 hostile tests). Count ceiling and 17-vs-1 capacity refuse were
already on HEAD; overflow refuse and the `| 0` wrap fix are the dirty
additions. Passing tests here are **not** production admission.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-tower-citizen/src/bridge/stub-provider.ts` | `b4aa2622ce821420c7809dedfc4071f4a0a4c6af671afd48a191c16e41a0090a` |
| `packages-ts/galerina-tower-citizen/dist/bridge/stub-provider.js` | `db971db43493a46845ed0371fa1532138812c09fd565702b7d5af70d4c87a35d` |
| `packages-ts/galerina-tower-citizen/tests/bridge.test.mjs` | `642b80bcf472c82d5c50472c97c25afc1811ccfee33b19d642339e16af48df8c` |
| `packages-ts/galerina-tower-citizen/dist/index.js` | `a25d2ae0912dd4c68ab363f79fa37124a3c6d991c9a474f44d30259ba26c1d32` |

HEAD `src/bridge/stub-provider.ts` (pre-overflow / pre-`Math.floor`
dirty slice) sha256
`2dc76022f8f7403cda50d09e6358973cfb9a3d0edbbedfafb02821ce1efb6ea1`.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| count not a non-negative safe integer, or `count > 1_048_576` → admitted-bound refuse | source `stub-provider.ts` `decodePackedTrits` 85–88; dist `stub-provider.js` 73–76 |
| count `1048577` throws admitted bound | executed named hostile; independent probe exact message `[STUB_TERNARY]: packed trit count 1048577 is outside the admitted bound` |
| packed buffer shorter than needed I2_S words → capacity refuse | source 96–99; dist 84–87; 16 trits/word: `neededWords = Math.floor(lastIndex / 16) + 1` |
| 17 trits vs 1 word throws capacity | executed named hostile; independent probe exact message `packed weights lack capacity for count 17 at offset 0` |
| 16 trits vs 1 word is the packing-density ALLOW (discriminating) | independent probe `threw: false`, analog/digital value `-16` (zero words decode as trit `-1`) |
| `offset+count` last index would exceed `MAX_SAFE_INTEGER` → overflow refuse | source 92–94 (dirty vs HEAD); dist 80–82 |
| offset `MAX_SAFE_INTEGER-5`, count `10` throws overflow | **not in named suite**; independent probe exact message `packed trit offset+count overflows the safe integer range` |
| `2^35` offset does not wrap via `| 0` into `packed[0]` | source 96 / 103 `Math.floor`; executed named hostile; independent probe capacity refuse at offset `34359738368` |
| missing packed words not silently zero-filled **for those cases** | named three plus overflow throw before any trit is returned; dist has no `packed[i] ?? 0` |
| public path is `execute` → private `decodePackedTrits` | source 67; tests cannot call the TS-private method except as a JS own-property |
| HEAD `| 0` wrap still ALLOW | reconstructed HEAD decoder (not production): `2^35` → trit `-1` (`?? 0`); `2^36` → trit `+1` (`packed[0]`); overflow triple ALLOWs ten `-1` trits |
| photonic sibling / 124-scan closure | **not this claim** |

## Command receipts

1. `node --test --test-timeout=30000 packages-ts/galerina-tower-citizen/tests/bridge.test.mjs`
   → **10/10 pass**, 0 fail, `duration_ms 207.7447`.
   - `hostile: packed trit count above the admitted ceiling is refused` — **red detector** (0.5593ms)
   - `hostile: packed weights shorter than needed words are refused` — **red detector** (0.3719ms)
   - `hostile: a 2^35 offset does not wrap into packed[0]` — **red detector** (0.3719ms)
   Remaining 7 tests green (faithful T-MAC, simulator cross-check,
   `assertDeterminism`, stub FP4 unexecuted, registry maps).

Independent extra probes (`%TEMP%\galerina-stub-ternary-decode-probe.mjs`;
not production; imports this tree’s `dist/index.js`):

- count `1048577` → admitted bound (exact message)
- count `1048576` with 1-word buffer → capacity refuse (ceiling is exclusive `>`; short buffer still capacity, not bound)
- 17 trits / 1 word → capacity refuse
- 16 trits / 1 word → ALLOW value `-16` (discriminating packing density)
- offset `2**35`, count `1`, distinctive `packed[0]` (sixteen `+1` trits) → capacity refuse; does **not** return `packed[0]`
- offset `2**36`, count `1` → capacity refuse (HEAD `| 0` word index is `0`, the actual wrap-into-`packed[0]` case)
- offset `MAX_SAFE_INTEGER-5`, count `10` → overflow refuse (exact overflow string)
- offset `16`, count `1`, 1-word buffer → capacity refuse
- offset `15`, count `1`, 1-word buffer → ALLOW value `-1`
- negative / `NaN` count → admitted bound
- `Infinity` count with `activations.length === 1` → activations-coverage refuse **before** decode; `activations.length === Infinity` → admitted bound
- packed `[1,-1,0,1]` execute → `30` (known-answer T-MAC)
- reconstructed HEAD `| 0` + `?? 0`: offset `2**35` ALLOWs `[-1]`; offset `2**36` ALLOWs `[1]` from `packed[0]`; overflow triple ALLOWs ten `-1` trits
- word-index arithmetic: `2**35 / 16 | 0 === -2147483648`; `2**36 / 16 | 0 === 0`; `Math.floor` stays `2147483648` / `4294967296`

Without the dirty `Math.floor` change, named `offset=2**35` computes
`neededWords === -2147483647`, skips capacity, and `?? 0` zero-fills.
Without the dirty overflow check, `offset=MAX_SAFE_INTEGER-5` /
`count=10` loses precision into a 1-word `neededWords` and would **not**
throw capacity.

## Challenge 1 — count 1048577 still ALLOW / zero-fill?

**No. CONFIRMED refused** as admitted bound before any packed-word
read. Locator: `decodePackedTrits` 85–88. Named hostile and
independent probe both threw. Detector can go red.

## Challenge 2 — 17 trits vs 1 packed word still zero-fill?

**No. CONFIRMED refused** as lack of capacity (`neededWords === 2`,
`packed.length === 1`). Locator: 96–99. Named hostile and independent
probe both threw. Discriminating 16-trit / 1-word path ALLOWs `-16`.
This refuse was already on HEAD; the named test is new.

## Challenge 3 — offset `2^35` still wraps via `| 0` into `packed[0]`?

**No. CONFIRMED refused** as lack of capacity at offset `34359738368`.
Locator: 96–99 and loop 103–110 (`Math.floor`, no `?? 0`). Named
hostile throws. Independent probe with a distinctive `packed[0]`
(`+1` trits) still throws and does not return that word.

Precision on the wrap: HEAD `(2**35 / 16) | 0` is `-2147483648`, so
`packed[-2147483648] ?? 0` silent-zero-fills (trit `-1`) rather than
reading `packed[0]`. The actual ToInt32 wrap **to index 0** is
`offset=2**36`. Independent probe refuses `2**36` as well. Reconstructed
HEAD ALLOWs `2**35` as `[-1]` and `2**36` as `[1]` from `packed[0]`.

## Challenge 4 — offset `MAX_SAFE_INTEGER-5` with count 10 still ALLOW?

**No. CONFIRMED refused** as safe-integer overflow (source 92–94).
Named suite does **not** include this triple; independent probe message
is the overflow-specific string, not `lack capacity` / generic `offset`.

## Residuals (not findings against the named three hostiles)

- Same decoder family as `PhotonicEmulatorBridge.decodePackedTrits`
  (`csf_02156b5c510ca60c2a2637f7`, still `PARTIAL_THIS_TREE`). This
  review did not re-run photonic tests and does not close that sibling.
- Named overflow is **not** in `bridge.test.mjs`. The 2^35 test regex
  `/lack capacity|overflow|offset/` is looser than the capacity string
  actually thrown; independent probe binds the exact messages.
- Named suite covers `2^35` (HEAD negative-index `?? 0`), not `2^36`
  (HEAD wrap-to-`packed[0]`). Both refuse on this dirty tree.
- `Infinity` count with a short `activations` object is refused as
  activations coverage (`execute` 64–66) before `decodePackedTrits`.
  Fail-closed; not the admitted-bound detector.
- This is a simulation stub (`executedNatively === false`,
  `certificationProfile: "dev"`, `packageHash` placeholder zeros). It
  is not a certified native ternary kernel.
- Scan ID `csf_0a13165351fee2628f4fc557` stays `PARTIAL_THIS_TREE`
  (packed ternary decoding / unchecked caller count). Inventory
  `findings.json` sha256
  `07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`
  was not modified by this review. Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named count-ceiling / 17-vs-1-word /
`2^35` wrap claim. Detector is not invalid: the three hostile tests
`assert.throws`. Evidence is sufficient for those three refuses, the
discriminating 16-trit ALLOW, and independent overflow / `2^36`
refuses; insufficient for named-suite overflow coverage, photonic
sibling closure, scan closure, and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
