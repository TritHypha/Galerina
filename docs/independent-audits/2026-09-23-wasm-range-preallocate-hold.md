# Independent audit — WASM `__range` meter-before-allocate HOLD

**Verdict: PASS** (named meter-before-allocate slice). Finding
`csf_e3409dfe75ff7adda18f556a` stays **PARTIAL_THIS_TREE**. Do **not**
promote **PATCHED**. This is **not** an RD-1296 close. Not production
admission.

Dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty).
Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree. **Not clean-HEAD evidence.** Production
sources and tests were not edited by this reviewer. Nothing was committed,
merged, pushed, or signed. `.fungi` was not touched.

Reviewer: Grok independent auditor `01a0e2ba-599c` (did not author these
changes). Not Astra.

Named claim: `__range` checks intern store, cardinality, guest words, and
fuel before allocating the JS items array; fuel is deducted only after
`internArrayItems` succeeds; full store then `__range(0,5)` throws
`Array store exceeds the host bound`; 1e5 and a second 10k still refuse.

Platform: win32 Node v24.18.0.

## Requirement-to-evidence

| Claim | Status |
|---|---|
| Store / cardinality / guest / fuel before JS allocate | **CONFIRMED** |
| Fuel debit only after intern succeeds | **CONFIRMED** |
| Full store `__range(0,5)` throws store bound | **CONFIRMED** |
| 1e5 guest-memory refuse; second 10k fuel refuse | **CONFIRMED** |
| Exclusive `(2,7)` still `[2,3,4,5,6]` | **CONFIRMED** |
| Dist matches src | **CONFIRMED** |
| Finding PATCHED / RD-1296 close / production admission | **NOT VERIFIABLE** |

## Locators

- `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` `__range`
  735–766 (allocate 761–762, intern 763, debit 764).
- Tests: `tests/wasm-runtime.test.mjs` 53–91.

## RED / GREEN actually run

Runtime `tsc -p tsconfig.json` → exit 0.

`node --test tests/wasm-runtime.test.mjs` → **45/45**, 0 skip.

Independent probe: store-full exact store-bound message, zero numeric
pushes; intern-fail does not debit remaining 6384 words; 1e5 guest
memory; exclusive `[2,3,4,5,6]`.

## Author hashes (MATCH)

| path | bytes | sha256 |
|---|---|---|
| `src/wasm-runtime.ts` | 64160 | `cbdc522d5d2487083554dbe43b2599114bb938824532eaba13d3c4beee7a524f` |
| `dist/wasm-runtime.js` | 53876 | `dde41576454870c795d1251f8a79db7cc1bc757a7ae494ccca94e95b01b4e503` |
| `tests/wasm-runtime.test.mjs` | 17578 | `b02c72314c3030c0f66790130f3521d80c338b4cb28b46dfc04fd0a33d67b2ee` |

## Remaining risk

Admitted ranges still live in host JS `arrays[]`, not guest linear
memory. `bindMemory` still resets `rangeFuel`. Empty ranges intern `[]`
without the `__range`-level store pre-check. Unbound guestWords remains
16384. Inventory `start_line` 570 is stale vs current 735. Finding stays
PARTIAL. Not an RD-1296 close.
