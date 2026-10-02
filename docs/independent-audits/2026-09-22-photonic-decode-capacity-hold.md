# Independent audit — PhotonicEmulatorBridge.decodePackedTrits capacity / overflow refuse

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed. This receipt is not the
author’s packet and is not GPT-6 Astra.

Named claim: `PhotonicEmulatorBridge.decodePackedTrits` refuses packed
trit count above `1_048_576`, packed buffers shorter than needed words,
and `offset+count` that overflow `MAX_SAFE_INTEGER`. Missing packed
words are not silently zero-filled for those cases.

Hostile acceptance (named): count `1048577` throws admitted bound;
17 trits vs 1 word throws capacity; offset `MAX_SAFE_INTEGER-5` with
count `10` throws overflow.

This is emulator software, not photonic hardware. This is **not**
124-scan closure. Production admission was not requested and is not
granted.

Node v24.18.0. Tests import `../dist/index.js` (gitignored dist), which
re-exports `PhotonicEmulatorBridge` from `./photonic-bridge.js`.
`dist/photonic-bridge.js` mtime (`2026-09-23T00:39:37.000Z`) is newer
than dirty `src/photonic-bridge.ts` (`2026-09-23T00:39:27.000Z`) and
contains the same `MAX_COUNT = 1_048_576`, overflow
`offset > Number.MAX_SAFE_INTEGER - (count - 1)` refuse, and
`neededWords > packed.length` capacity refuse. This reviewer did not
rebuild.

Dirty slice for this claim vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-ext-photonic-emulator/src/photonic-bridge.ts`
(+3 lines: overflow check only) and `M`
`packages-ts/galerina-ext-photonic-emulator/tests/photonic-bridge.test.mjs`
(+3 hostile tests). Count ceiling and short-buffer capacity refuse were
already on HEAD; overflow refuse is the dirty addition. Passing tests
here are **not** production admission.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-ext-photonic-emulator/src/photonic-bridge.ts` | `753cf654fa4bf7f9c99944d5b3db9744c38929ff4c0e87421978acd17e2cb0b6` |
| `packages-ts/galerina-ext-photonic-emulator/dist/photonic-bridge.js` | `ee895bc729341e4e19dd0d399ad8313a7cdd9a3ba7c8b4d4476b53763e338428` |
| `packages-ts/galerina-ext-photonic-emulator/tests/photonic-bridge.test.mjs` | `b4ddb1668b7b61e688af866b3a16338d7427812dc3509550d7c8329ffdcb19c8` |
| `packages-ts/galerina-ext-photonic-emulator/dist/index.js` | `ba40a2f3a287bdd50be106f6ea3aee7bb681b712a3837b366cf10043cf1661e4` |

HEAD `src/photonic-bridge.ts` (pre-overflow dirty slice) sha256
`116fb449e1be550daa73735d929b3a6038438ebd83668530d0e0e6bb98812179`.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| count not a non-negative safe integer, or `count > 1_048_576` → admitted-bound refuse | source `photonic-bridge.ts` `decodePackedTrits` 134–138; dist `photonic-bridge.js` 106–110 |
| count `1048577` throws admitted bound | executed named hostile; independent probe exact message `[PHOTONIC_EMULATOR]: packed trit count 1048577 is outside the admitted bound` |
| packed buffer shorter than needed I2_S words → capacity refuse | source 145–149; dist 117–121; 16 trits/word: `neededWords = ((lastIndex / 16) \| 0) + 1` |
| 17 trits vs 1 word throws capacity | executed named hostile; independent probe exact message `packed weights lack capacity for count 17 at offset 0` |
| 16 trits vs 1 word is the packing-density ALLOW (discriminating) | independent probe `threw: false` (analog value; not a named test) |
| `offset+count` last index would exceed `MAX_SAFE_INTEGER` → overflow refuse | source 142–144 (dirty vs HEAD); dist 114–116 |
| offset `MAX_SAFE_INTEGER-5`, count `10` throws overflow | executed named hostile; independent probe exact message `packed trit offset+count overflows the safe integer range` |
| missing packed words not silently zero-filled **for those three cases** | all three throw before the `packed[i] ?? 0` loop; 17-vs-1 and overflow do not return a value |
| public path is `execute` / `executeExact` → `trits()` → private `decodePackedTrits` | source 168–176, 180–199; tests cannot call the private method directly |
| `?? 0` after a wrapped `| 0` word index | **residual**; independent `offset=2**35` / `offset=MAX_SAFE_INTEGER` ALLOW analog (not the named three cases) |
| photonic hardware / 124-scan closure | **not this claim** |

## Command receipts

1. `node --test --test-timeout=30000 packages-ts/galerina-ext-photonic-emulator/tests/photonic-bridge.test.mjs`
   → **15/15 pass**, 0 fail, `duration_ms 154.2847`.
   - `hostile: packed trit count above the admitted ceiling is refused` — **red detector** (0.1755ms)
   - `hostile: packed weights shorter than needed words are refused` — **red detector** (0.2527ms)
   - `hostile: offset+count overflow is refused` — **red detector** (0.1852ms)
   Remaining 12 tests green (honest emulation flags, manifest pin, executeExact
   digital T-MAC, corrupt 0b11 trit, native-handle refuse, vote-count clamp).

Independent extra probes (`%TEMP%\galerina-photonic-decode-capacity-probe.mjs`;
not production; imports this tree’s `dist/index.js`):

- count `1048577` → admitted bound (exact message)
- count `1048576` with 1-word buffer → capacity refuse (ceiling is exclusive `>`; short buffer still capacity, not bound)
- 17 trits / 1 word → capacity refuse
- 16 trits / 1 word → ALLOW (discriminating packing density)
- offset `MAX_SAFE_INTEGER-5`, count `10` → overflow refuse (exact overflow string, not `lack capacity` / generic `offset`)
- offset `16`, count `1`, 1-word buffer → capacity refuse
- offset `15`, count `1`, 1-word buffer → ALLOW
- negative / `NaN` / `Infinity` count → admitted bound
- packed `[1,-1,0,1]` `executeExact` → `-1` (known-answer digital T-MAC)
- offset `2**35`, count `1`, 1-word buffer → **ALLOW** analog (`neededWords` ToInt32-wraps to `-2147483647`)
- offset `2**35-1`, count `1` → capacity refuse (`neededWords = 2147483648`)
- offset `Number.MAX_SAFE_INTEGER`, count `1` → **ALLOW** analog (`neededWords` wraps to `0`)

Without the dirty overflow check, the named overflow triple
(`offset=MAX_SAFE_INTEGER-5`, `count=10`, 1-word buffer) computes
`neededWords === 1` after precision loss and would **not** throw
capacity; the overflow throw is what turns that case red.

## Challenge 1 — count 1048577 still ALLOW / zero-fill?

**No. CONFIRMED refused** as admitted bound before any packed-word
read. Locator: `decodePackedTrits` 135–138. Named hostile and
independent probe both threw. Detector can go red.

## Challenge 2 — 17 trits vs 1 packed word still zero-fill?

**No. CONFIRMED refused** as lack of capacity (`neededWords === 2`,
`packed.length === 1`). Locator: 145–149. Named hostile and independent
probe both threw. Discriminating 16-trit / 1-word path ALLOWs.

## Challenge 3 — offset `MAX_SAFE_INTEGER-5` with count 10 still ALLOW?

**No. CONFIRMED refused** as safe-integer overflow. Locator: 142–144
(dirty vs HEAD). Independent probe message is the overflow-specific
string. Named test regex `/overflow|lack capacity|offset/` is looser
than that string; the executed throw still matches `overflow`.

## Residuals (not findings against the named three hostiles)

- This is a Rung-2 **emulator** (`nativeAvailable === false`,
  `executedNatively === false`, `deterministic === false`). It is not
  photonic hardware and does not attest a PIC.
- `neededWords` and the loop index use `(lastIndex / 16) | 0` /
  `(idx / 16) | 0` (ToInt32). Offsets at or above `2**35` wrap;
  `neededWords` can go negative or `0`, skipping the capacity check.
  Independent probe: `offset=2**35` and `offset=MAX_SAFE_INTEGER` with
  count `1` and a 1-word buffer ALLOW an analog result. The loop’s
  `packed[i] ?? 0` then treats the missing word as encoding `0b00`
  (trit `-1`), which is silent packed-word zero-fill on **that** axis.
  Named suite does not cover large-but-safe offsets. Not claimed closed.
- Named overflow test alternation `/overflow|lack capacity|offset/`
  would also accept a generic offset or capacity throw. Independent
  probe is what binds the overflow-specific message.
- Scan programme / 124 IDs unchanged. Not 124-scan closure. Inventory
  `findings.json` sha256
  `07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`
  was not modified by this review.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named count-ceiling / 17-vs-1-word /
`MAX_SAFE_INTEGER` overflow claim. Detector is not invalid: the three
hostile tests `assert.throws`. Evidence is sufficient for those three
refuses plus the discriminating 16-trit ALLOW; insufficient for
large-offset `| 0` wrap refuse, photonic hardware, scan closure, and
production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
