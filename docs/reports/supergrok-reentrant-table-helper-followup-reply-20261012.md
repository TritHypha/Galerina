# SuperGrok bounded re-entry follow-up

- Conversation: `f86ab403-89ee-455c-9782-93e4aee90e12` (RD-1413 Memory Security Review)
- Reply identity: `7d50cbe2-8f7a-43a1-b410-00cc1f80c5e9`
- Model shown in the existing conversation: Heavy
- Observed: 2026-10-12; the UI did not expose a precise response timestamp.
- Follow-up prompt SHA-256: `B33471F0121487108BB91BD972319D58AC96DE8EBFAD3882C302FABF9ECA95AB`
- Candidate checkout: branch `main`, HEAD `59b23502fee2fdb4b5ae2bbdb6ac1ed4bc8b8e04`; reviewed files were dirty working-tree inputs, not committed at that HEAD.
- Runtime SHA-256: `2D56EBF4D3EBE120181A6028A60B456614001958396245B948515504F364630E`
- Test SHA-256: `0E0F80EC196F31E691D656C45248FE5100B62F82463A1BB7CB0BE692B2EE6C27`

## Exact reply text

Both questions are PARTIAL. The dirty runtime and tests were not opened: the raw path at `59b23502` returned 404. The 108/108 and 105/105 counts are supplied, not mine.

Q1. PARTIAL. The described proxy covers `get`, `set`, and `grow` on a table it wraps. `get` returning a gated callable, and `set`/`grow` refusing while active, rules out re-entry through that proxy’s own operations in the fixture. It does not rule out a function already retrieved before the proxy was installed, a second table export that is not proxied, or `WebAssembly.Table.prototype` methods used on the raw target if that target leaks. Repeated wrapping is safe only if each `get` returns a callable that still keys the same raw instance. The strongest counterexample is `table.get` captured before proxy installation, then called from the host callback. The fixture’s exported table is not the same as an arbitrary signed module whose table the runtime did not wrap. That distinction is NOT VERIFIABLE without the emitter and admission path.

Q2. PARTIAL. Wrapping the public helper for its whole call, while internal finalization uses the captured raw helper under the outer active state, closes the earlier raw `__fungi_wipe_owned` callback bypass for the wrapped export. The second fixture shows a direct idle helper call holds active state long enough to refuse a nested guest call, then a later call succeeds. It does not show a guest trap, helper trap, or wipe failure clearing the flag, or that a table-held ordinary guest function copies its result and wipes once. The strongest remaining case is a helper trap after the flag is set and before `finally`, leaving the instance stuck active. The smallest missing test is that trap, plus a table-held guest call that returns a value, wipes once, and does not wipe the outer 42. The current tests establish refusal of the described table and helper re-entry fixtures, with the outer value preserved. They do not establish every public table path, pre-wrap captured references, failure-path flag clearing, or Fungi, FFI, or host isolation. The patch is safe to retain as a narrow bootstrap fix pending source review. No RD claim follows.

## Independent source-check status

SuperGrok's reply is advisory, and its `PARTIAL` verdict reflects inability to open the supplied dirty-file snapshots. A separate Astra review of the exact hashes is pending. Initial source inspection shows both wrappers clear `callState.active` in `finally`. The import-validation path rejects non-function imports, performs synchronous export wrapping after instantiation, and returns the wrapped instance; therefore the proposed pre-wrap raw-table capture is not yet demonstrated for this route. Table-function identity/interop and whether another ordinary path exposes the raw table remain to be assessed. No code change, commit, push, merge, or CI action was made in response to this review.

## Astra independent adjudication

- Reviewer: existing Astra worker `01a12dba-335e-7191-b2cc-f2a17c55076d` (Euler)
- Relevant follow-up submissions: `01a12f8b-54ac-7563-bfb2-4b8e36e15f13` and `01a12f8d-6f1e-7ad3-b583-6462d6c16ff5`
- Review basis: exact runtime and test hashes above; source review only, no test execution.

### Exact Astra reply

**Source-based conclusion: the three re-entry paths are closed on the standard admission path.** The checkout remains at HEAD `59b23502fee2fdb4b5ae2bbdb6ac1ed4bc8b8e04`; both current working-file hashes match the supplied identities. I did not run tests.

- **Raw table exposure before wrapping — no standard path found.** Admission rejects every non-function import at [wasm-runtime.ts:1404–1425](C:/Users/phill/Documents/GitHub/Galerina/.worktrees/memory-main-baseline-20261009/packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts:1404). Instantiation completes at line 1455; startup imports are gated, then the instance is synchronously wrapped at lines 1470–1488 before it is returned. No caller-supplied table import or callback is given the raw instance/table along that successful path. Thus the concern about a host retaining a pre-wrap table reference is not supported by these source paths. This does not rule out nonstandard embedding or external runtime manipulation.

- **Imported tables — ruled out by the kind gate.** A module declaring a table import is rejected because its import kind is not `function` ([wasm-runtime.ts:1406–1414](C:/Users/phill/Documents/GitHub/Galerina/.worktrees/memory-main-baseline-20261009/packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts:1406)). An internal exported table is wrapped at lines 1682–1683.

- **Thrown/trapping paths — gate release is explicit.** Guest functions hold the gate through finalization and cleanup, then release in `finally` ([wasm-runtime.ts:1553–1574](C:/Users/phill/Documents/GitHub/Galerina/.worktrees/memory-main-baseline-20260919/packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts:1553)); helpers likewise release even if the raw helper throws ([wasm-runtime.ts:1582–1591](C:/Users/phill/Documents/GitHub/Galerina/.worktrees/memory-main-baseline-20260919/packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts:1582)). Table `get` routes ordinary and helper function references through those wrappers; `set` and `grow` refuse while active ([wasm-runtime.ts:1601–1629](C:/Users/phill/Documents/GitHub/Galerina/.worktrees/memory-main-baseline-20261009/packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts:1601)). The idle-helper import-reentry test checks refusal and subsequent call recovery ([wasm-runtime.test.mjs:1243–1280](C:/Users/phill/Documents/GitHub/Galerina/.worktrees/memory-main-baseline-20261009/packages-ts/galerina-core-runtime-wasm/tests/wasm-runtime.test.mjs:1243)). Source establishes release on thrown paths; a helper-that-traps-then-retry test would make that edge directly observable.

**Residual compatibility issue, not a demonstrated gate bypass:** each `table.get(i)` of a function creates a new JS wrapper, so repeated reads may not preserve function identity (`===`). The proxy also is not itself a branded `WebAssembly.Table`: captured methods work through its wrappers, but passing the proxy as a table import or calling the native prototype method directly on it may fail brand checks. The present tests cover table re-entry and helper references, not identity, method extraction, `set`/`grow` behavior while idle, or those brand/interop cases. The current code’s active `set`/`grow` refusal is directly visible but not covered by the cited regression. Add focused compatibility tests if these behaviors are part of the adapter’s supported API.

The supplied package and compiler test totals remain observations, not my runs. This source review supports the adapter’s guarded paths only; it does not establish `.fungi` semantics, native/FFI/host enforcement, physical wiping, or RD closure.

### Adjudication notes

Astra resolves the SuperGrok speculative pre-wrap/table-capture counterexample for the standard admission route: non-function imports are rejected, startup imports are gated, and the instance is wrapped synchronously before return. The helper and guest wrappers release the active flag in `finally`, including thrown cleanup paths. Astra independently identifies compatibility coverage still needed: stable `table.get(i)` function identity, supported method extraction/brand behavior, idle `set`/`grow`, and a helper-trap-then-retry test. These are not established security bypasses. One cited helper/guest source link in Astra’s reply points at an older `.worktrees/memory-main-baseline-20260919` path, while the returned text itself says it checked the current exact file hashes; the current checkout path is the 20261009 integration tree. Verify line references against current source before relying on them.

This adjudication remains advisory bootstrap-runtime evidence. It is not evidence of `.fungi` language-level guarantees, FFI/native/host enforcement, physical erasure, end-to-end operation success, or RD-1413/1414/1415 closure.
