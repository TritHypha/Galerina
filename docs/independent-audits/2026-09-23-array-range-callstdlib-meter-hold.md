# Independent audit — direct callStdlib Array.range meter HOLD

**Verdict: PASS** (named unmetered-cardinality slice). Finding
`csf_03064225783c475027bf7f5b` stays **PARTIAL_THIS_TREE**. Do **not**
promote **PATCHED**.

Dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty).
Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree. **Not clean-HEAD evidence.** Production
sources and tests were not edited by this reviewer. Nothing was committed,
merged, pushed, or signed. `.fungi` was not touched.

Reviewer: Grok independent auditor `01a0d06a-3160` (did not author these
changes). Not Astra.

Named claim: direct `callStdlib("Array.range")` without `chargeSteps`
refuses cardinality above `MAX_UNMETERED_ARRAY_RANGE` (4096) before
allocate; short unmetered ranges still allocate; supplied `chargeSteps`
is called once and skips the unmetered cap; interpreter path unchanged.

Platform: win32 Node v24.18.0.

## Requirement-to-evidence

| Claim | Status |
|---|---|
| Unmetered 4097 refuses before allocate | **CONFIRMED** |
| Unmetered 5-count allocates | **CONFIRMED** |
| `chargeSteps` once with `count`; unmetered cap not applied | **CONFIRMED** |
| Dist matches src | **CONFIRMED** |
| Interpreter `chargeSteps` path unchanged this slice | **CONFIRMED** |
| Sync fast-path / WASM `__range` remain separate | **CONFIRMED** residual |
| Finding stays PARTIAL | **CONFIRMED** |

## Locators

- `packages-ts/galerina-core-compiler/src/stdlib.ts` 229–230,
  `Array.range` 2083–2105.
- Tests: `tests/interpreter-compute-step-cap.test.mjs` 122–158.

## RED / GREEN actually run

Compiler `tsc -p tsconfig.json` → exit 0.

`node --test tests/interpreter-compute-step-cap.test.mjs` → **12/12**, 0 skip.

Independent probe: unmetered 4097 throws unmetered-cardinality; 5 allocates;
`chargeSteps` count=100 once; executeFlow maxSteps=20 still budget trap.

## Author hashes (MATCH)

| path | bytes | sha256 |
|---|---|---|
| `src/stdlib.ts` | 136593 | `7e8fd7491713bd64736bcacfdb5143df6fda03d35a279dea780227470fd80786` |
| `dist/stdlib.js` | 136000 | `e993ac984b84d27fc6d16b5cd1e300c7de184f76c3720227bc55051d66f02c85` |
| `tests/interpreter-compute-step-cap.test.mjs` | 6967 | `2999bc73417afc119dad38948cd34bf7e5987072ca9b5b60fce30246e77d3472` |

## Remaining risk

Unmetered path still allocates up to 4096. A dummy `chargeSteps` disables
the 4096 cap up to `MAX_RANGE` 1e6. Sync fast-path does not call stdlib
`Array.range`. WASM `__range` is a separate producer. Not production
admission.
