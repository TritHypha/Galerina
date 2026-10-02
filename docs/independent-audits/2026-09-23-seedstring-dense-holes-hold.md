# Independent audit — seedString dense holes HOLD

**Verdict: PASS** (named dense-hole slice). This is not production admission.
Generation reuse stays open.

Dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty).
Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree. **Not clean-HEAD evidence.** Production
sources and tests were not edited by this reviewer. Nothing was committed,
merged, pushed, or signed. `.fungi` was not touched.

Reviewer: Grok independent auditor `01a0d074-2833` (did not author these
changes). Not Astra.

Named claim: `seedString` densely fills `[0, handle)` with `""` before
writing `s`; after `seedString(5,"seeded")`, slots 0–4 are `""`, slot 5 is
`"seeded"`, `internString` returns 6; sequential seed 0,1 intern is 2;
handle `>= MAX_WASM_STRINGS` still refuses.

Platform: win32 Node v24.18.0.

## Requirement-to-evidence

| Claim | Status |
|---|---|
| Dense fill of holes with defined `""` | **CONFIRMED** |
| intern after `seedString(5)` is 6, not an undefined skip | **CONFIRMED** |
| Sequential seed 0,1 intern 2 | **CONFIRMED** |
| `>= MAX_WASM_STRINGS` still refuses | **CONFIRMED** |
| Dist matches src | **CONFIRMED** |
| Generation reuse | **NOT VERIFIABLE** / open |

## Locators

- `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` `seedString`
  873–891; `internStringValue` 403–416.
- Tests: `tests/wasm-runtime.test.mjs` 318–342.

## RED / GREEN actually run

Runtime `tsc -p tsconfig.json` → exit 0.

`node --test tests/wasm-runtime.test.mjs` → **43/43**, 0 skip.

Independent probe: holes `typeof string`; intern 6; sequential intern 2;
`seedString(4096)` refuses.

## Author hashes (MATCH)

| path | bytes | sha256 |
|---|---|---|
| `src/wasm-runtime.ts` | 63866 | `38522ebcfe9a59966f811a909c751a83336479b446ffeb2630fc3eb217bf8e20` |
| `dist/wasm-runtime.js` | 53548 | `cd25df1ad519753b66b6bd424b711d9068afb18f862662d9b22ecf5422deecbb` |
| `tests/wasm-runtime.test.mjs` | 16975 | `4b7dc11a5fb8e24c3f2593f873208709387946c196bc766189d92409dd8fefbb` |

## Remaining risk

Dirty tree. internString / internArray / `recordBump` remain monotone.
Empty intern after dense seed does not recycle `""` holes. In-place
overwrite has no generation. Not production admission.
