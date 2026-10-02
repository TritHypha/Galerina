# Independent audit — RD-1296 exact typed return copy HOLD

**Verdict: PASS** (named exact-copy / trap-wipe / padded-pack slice). Full
RD-1296 ABI stays **PARTIAL / open**. This is not production admission,
host-registry identity, all-exit cleanup, or dynamic invocation closure.

Dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty).
Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree. **Not clean-HEAD evidence.** Production
sources and tests were not edited by this reviewer. Nothing was committed,
merged, pushed, or signed. `.fungi` was not touched.

Reviewer: Grok independent auditor `01a0d019-1a67` (did not author these
changes). Not Astra.

Named claim: `finalizeSecretExportResult` refuses incomplete copies
(`taggedWords` 65 / 0 / -1 and short remaining memory throw
`FUNGI-WASM-RET-001`); `invokeAdmittedExport` wipes after a guest trap;
`flattenFromHeapRet` packs non-contiguous `srcOffsets` (flat padded
`[i32,i64,i32]`).

Platform: win32 Node v24.18.0.

## Requirement-to-evidence

| Claim | Status |
|---|---|
| 65 tagged words throw `FUNGI-WASM-RET-001` (not a 64-word success) | **CONFIRMED** |
| Exact 3-word heap copy succeeds `[7,8,9]` | **CONFIRMED** |
| Zero / negative tags refuse separately | **CONFIRMED** |
| Short remaining memory refuses truncated copy | **CONFIRMED** |
| Trap-after-write wipe via `invokeAdmittedExport` | **CONFIRMED** |
| Padded `[i32,i64,i32]` packed result includes final i32 | **CONFIRMED** |
| Dist matches src | **CONFIRMED** |
| Full RD-1296 ABI / `wrapAdmittedExports` trap wipe | **NOT VERIFIABLE** / open |

## Locators

- `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` 938–1028
  (`MAX_COPIED_RECORD_WORDS`, `FUNGI-WASM-RET-001`, trap wipe).
- `packages-ts/galerina-core-compiler/src/wat-emitter.ts` `planNeedsPack`
  490–498; `flattenFromHeapRet` uses it.
- Tests: `packages-ts/galerina-core-compiler/tests/rd-1296-return-copy.test.mjs`.

## RED / GREEN actually run

Runtime then compiler `tsc -p tsconfig.json` → exit 0.

`node --test tests/rd-1296-return-copy.test.mjs` → **7/7**, 0 skip.

Independent producer probe: packed copy `[1,2,0,3]`; final i32 `3` present.
A contiguous 4-word physical copy of the 24-byte padded record would be
`[1,0,2,0]` and drop `c`.

Optional Q1 `q1-secret-return-value.test.mjs` → **27/27**.

## Author hashes (MATCH)

| path | bytes | sha256 |
|---|---|---|
| `src/wasm-runtime.ts` | 56297 | `37acc8fff81491de26b1d785ec243ce6c7c989905cd1ddab1959cf0c6f92e1e3` |
| `dist/wasm-runtime.js` | 47065 | `a6eb79c7ef8e4b00970467f468304ce9a0ef2e3ffdc13b66089a5c436e075d33` |
| `src/wat-emitter.ts` | 293783 | `4236418c21ad45450d986129df8e4434ae3d2daddfcd7e94305887f1971d1156` |
| `dist/wat-emitter.js` | 299835 | `e7f9294699d07548d62842c312f15601281a0e69597b6ffc8f2a267afe48e49b` |
| `tests/rd-1296-return-copy.test.mjs` | 6985 | `fd5f80aa3a0f406e066b9daf71dcc8fd4960b5e852bf49d48eaf39a537c13107` |

## Remaining risk

Dirty tree. Fixtures use raw `WebAssembly.instantiate`, not
`admitAndInstantiate`. `wrapAdmittedExports` has no trap catch. Missing
`__fungi_ret_words_get` still defaults to 1. Host-registry identity and
dynamic invocation stay open. Full RD-1296 remains PARTIAL.
