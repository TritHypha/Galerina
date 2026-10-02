# Independent audit — RD-1296 internResult/internOption intern-by-copy HOLD

**Verdict: PASS** (named intern-by-copy slice). Full RD-1296 ABI stays
**PARTIAL / open**. This is not production admission, array-of-record deep
copy, generation reuse, or secret-flow reachability.

Dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty).
Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree. **Not clean-HEAD evidence.** Production
sources and tests were not edited by this reviewer. Nothing was committed,
merged, pushed, or signed. `.fungi` was not touched.

Reviewer: Grok independent auditor `01a0d02a-a373` (did not author these
changes). Not Astra.

Named claim: `internResult` / `internOption` store field copies, not the
caller object; mutating `readResult` / `readOption` copies and mutating an
`internArray` input after intern leave the store unchanged.

Platform: win32 Node v24.18.0.

## Requirement-to-evidence

| Claim | Status |
|---|---|
| `internResult` stores `{ tag, value }` copies | **CONFIRMED** |
| `internOption` stores `{ kind, value }` copies | **CONFIRMED** |
| Mutating `readResult` / `readOption` copies leaves the store | **CONFIRMED** |
| Mutating `internArray` input after intern leaves the store | **CONFIRMED** |
| Dist matches src; no new public intern ABI | **CONFIRMED** |
| Array-of-record deep copy / generation reuse / secret-flow | **NOT VERIFIABLE** / open |

## Locators

- `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts`:
  `internResult` 339–346; `internOption` 347–354; `readResult` 804–807;
  `readOption` 808; `internArrayItems` 306–316.
- Tests: `tests/wasm-runtime.test.mjs` intern-copy hostiles.

## RED / GREEN actually run

Runtime `tsc -p tsconfig.json` → exit 0.

`node --test tests/wasm-runtime.test.mjs` → **30/30**, 0 skip.

Independent probe: intern helpers are not `push(entry)`; internArray input
mutation isolated; mutated read copies leave `__result_value` / store
unchanged.

## Author hashes (MATCH)

| path | bytes | sha256 |
|---|---|---|
| `src/wasm-runtime.ts` | 56881 | `25a7cb627d5448409e3fca5256bfdb30d7d35bf0e501c862ca77767c9e8342a5` |
| `dist/wasm-runtime.js` | 47739 | `c917b099d563779bd8cf4251954a36ced30cf09ae4f0ecdee0ddd0c7abe4bca5` |
| `tests/wasm-runtime.test.mjs` | 10839 | `a58e432c44782e3a4aedb2c0689fa2529d74f9785292cfd49f1f5ad2dced86b9` |

## Remaining risk

Dirty tree. Array-of-record deep copy, generation reuse, and secret-flow
reachability stay open. `internResult` / `internOption` are unexported;
public intern paths construct literals internally. Full RD-1296 remains
PARTIAL. Not production admission.
