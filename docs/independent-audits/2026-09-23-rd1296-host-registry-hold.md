# Independent audit — RD-1296 host-registry typed identity HOLD

**Verdict: PASS** (named typed-identity / owned-snapshot / wrap-trap-wipe
slice). Full RD-1296 ABI stays **PARTIAL / open**. This is not production
admission, array-of-record deep copy, generation reuse, or secret-flow
reachability.

Dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty).
Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree. **Not clean-HEAD evidence.** Production
sources and tests were not edited by this reviewer. Nothing was committed,
merged, pushed, or signed. `.fungi` was not touched.

Reviewer: Grok independent auditor `01a0d021-6244` (did not author these
changes). Not Astra.

Named claim: `readArray` returns a frozen snapshot; interned arrays are
`items.slice()` copies; `readResult` / `readMoney` return owned field copies;
`wrapAdmittedExports` wipes on trap then rethrows; handle 0 is not identity
across kinds or hosts; guest wipe leaves host registries intact.

Platform: win32 Node v24.18.0.

## Requirement-to-evidence

| Claim | Status |
|---|---|
| `readArray` frozen snapshot, not a live alias | **CONFIRMED** |
| interned arrays stored as `items.slice()` | **CONFIRMED** |
| `readResult` / `readMoney` owned field copies | **CONFIRMED** |
| wrap trap wipe then rethrow | **CONFIRMED** |
| handle 0 is not kind/host identity | **CONFIRMED** |
| guest wipe leaves host String/Array/Option/Decimal | **CONFIRMED** |
| Dist matches src; no new public ABI | **CONFIRMED** |
| Array-of-record deep copy / generation reuse / secret-flow | **NOT VERIFIABLE** / open |

## Locators

- `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts`:
  `internArrayItems` 306–316; `readArray` 800–802; `readResult` 804–806;
  `readMoney` 809–811; `wrapAdmittedExports` 927–951.
- Tests: `tests/wasm-runtime.test.mjs`; compiler
  `tests/rd-1296-host-registry.test.mjs`.

## RED / GREEN actually run

Runtime `tsc -p tsconfig.json` → exit 0.

`node --test tests/wasm-runtime.test.mjs` → **27/27**, 0 skip.

Compiler `node --test tests/rd-1296-host-registry.test.mjs` → **2/2**, 0 skip.

Independent probe: internArray input mutation does not change store; snapshot
then append leaves snap; two hosts’ handle 0 differ; wrap trap zeros guest
word; guest wipe leaves host values.

## Author hashes (MATCH)

| path | bytes | sha256 |
|---|---|---|
| `src/wasm-runtime.ts` | 56813 | `aaa2df53eff9ce2a6c47195fe15623602ea7a7d27a8ade40875256f7c955a994` |
| `dist/wasm-runtime.js` | 47671 | `87d4bdf4b5786ea20a9881ec1821032966dba8efd9238a713fdcf9b9bf1bb368` |
| `tests/wasm-runtime.test.mjs` | 9905 | `411d1209e4eae5307e292aeb10bccdc4418c2f4da5ceb07528dd3e2b5d8bb1eb` |
| `tests/rd-1296-host-registry.test.mjs` | 2919 | `f5b13d7d68ea6291f85a712c59d06a2e7b0cc8cc4aa40259cece45ad8aeb9249` |

## Remaining risk

Dirty tree. Array-of-record deep copy, generation reuse, and secret-flow
reachability stay open. `internResult` / `internOption` still intern the
caller object by reference; only the read path copies. Full RD-1296 remains
PARTIAL. Not production admission.
