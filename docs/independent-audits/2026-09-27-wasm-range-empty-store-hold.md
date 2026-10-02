# Independent audit — WASM `__range` empty-store pre-check HOLD

**Verdict: PASS** (named empty `__range` store pre-check slice). Finding
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

Reviewer: Grok independent auditor `01a0e2ce-444e` (did not author these
changes). Not Astra.

Named claim: `__range` checks `arrays.length >= MAX_WASM_ARRAYS` before
both the empty (`to <= from`) intern of `[]` and the non-empty allocate
path. Full store then `range(7,7)` and `range(3,1)` throw `Array store
exceeds the host bound`. Empty `range(5,5)` still interns `[]` when a
slot is free.

Platform: win32 Node v24.18.0.

## Requirement-to-evidence

| Claim | Status |
|---|---|
| Store check before empty intern of `[]` | **CONFIRMED** |
| Same check before non-empty allocate | **CONFIRMED** |
| Full store `range(7,7)` / `range(3,1)` throw store bound | **CONFIRMED** |
| Free slot `range(5,5)` yields `[]` | **CONFIRMED** |
| Dist matches src | **CONFIRMED** |
| Finding PATCHED / RD-1296 close / production admission | **NOT VERIFIABLE** |

## Locators

- `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` `__range`
  735–766: store pre-check 741–743, empty intern 744–746.
- Tests: `tests/wasm-runtime.test.mjs` 81–99.

## RED / GREEN actually run

Runtime `tsc -p tsconfig.json` → exit 0.

`node --test tests/wasm-runtime.test.mjs` → **47/47**, 0 skip.

Independent probe: full store `range(7,7)` / `range(3,1)` / `range(0,5)`
same store-bound message; free `range(5,5)` → `[]`.

## Author hashes (MATCH)

| path | bytes | sha256 |
|---|---|---|
| `src/wasm-runtime.ts` | 64160 | `140a3968655485e94a39c0a9b3a8f6b611d37c33e26ca6ee72b313107c01552f` |
| `dist/wasm-runtime.js` | 53876 | `66b0c39ca91c98f2e92aac78b68f667094ac60b906c70ff14904aef8ce2f41ec` |
| `tests/wasm-runtime.test.mjs` | 18143 | `8fbb8bdc5cab141ba0b791e581c3850489c01f00e89b76f970113ef8d981b283` |

## Remaining risk

Admitted ranges, including empty `[]`, still live in host JS `arrays[]`.
Empty success still consumes one intern slot. `bindMemory` still resets
`rangeFuel`. Finding stays PARTIAL. Not an RD-1296 close.
