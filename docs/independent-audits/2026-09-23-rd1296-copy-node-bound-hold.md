# Independent audit — RD-1296 live MAX_RECORD_COPY_NODES exhaustion HOLD

**Verdict: PASS** (named node-bound slice). Full RD-1296 ABI stays
**PARTIAL / open**. This is not production admission or generation reuse.

Dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty).
Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree. **Not clean-HEAD evidence.** Production
sources and tests were not edited by this reviewer. Nothing was committed,
merged, pushed, or signed. `.fungi` was not touched.

Reviewer: Grok independent auditor `01a0d04f-f67a` (did not author these
changes). Not Astra.

Named claim: `MAX_RECORD_COPY_NODES` is exported as 4096;
`copyArrayRecordsLayout` admits exactly 4096 records; 4097 refuse
`FUNGI-WASM-HOST-001` node bound with no partial success; interned handles
survive. Generation reuse stays open.

Platform: win32 Node v24.18.0.

## Requirement-to-evidence

| Claim | Status |
|---|---|
| `MAX_RECORD_COPY_NODES` exported as 4096 | **CONFIRMED** |
| Exactly 4096 layout-copied records succeed | **CONFIRMED** |
| 4097 refuse `FUNGI-WASM-HOST-001` node bound | **CONFIRMED** |
| Interned handle list still length 4097 after refuse | **CONFIRMED** |
| Dist matches src; closed import set unchanged (78) | **CONFIRMED** |
| Generation reuse | **NOT VERIFIABLE** / open (intern/alloc monotone) |

## Locators

- `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` 253–254,
  `copyGuestRecord` 297–300, `copyArrayRecordsLayout` 953–968.
- Tests: `tests/wasm-runtime.test.mjs` 259–281.

## RED / GREEN actually run

Runtime `tsc -p tsconfig.json` → exit 0.

`node --test tests/wasm-runtime.test.mjs` → **41/41**, 0 skip.

Independent probe: 4096 succeeds; 4097 throws node bound 4096; interned
length 4097; nested 2048 outer+inner succeeds, 2049 refuses; flat
`copyArrayRecords` of 4097 still admits.

## Author hashes (MATCH)

| path | bytes | sha256 |
|---|---|---|
| `src/wasm-runtime.ts` | 63337 | `8da6368faf6b1a7d9377d5276eba09ad6a54266acfa81a75526938f5289776c3` |
| `dist/wasm-runtime.js` | 53232 | `2df6fa0e467c7eeaa5938fe2f45e5cc558b8d3cad323039375aef92b88ea6487` |
| `src/index.ts` | 1553 | `82566fd090927870a14929c91ab4941ecba849065c06c980a777398cf6ce10a9` |
| `tests/wasm-runtime.test.mjs` | 16229 | `1f991d7c8118afb8329fe984bfb5d1751cc90b3d001086507c02a38f05fb5f25` |

## Remaining risk

Dirty tree. Generation reuse stays open: intern/alloc are monotone and
do not recycle slots. Flat `copyArrayRecords` is not this node bound.
Node counter is per layout-copy call. Full RD-1296 remains PARTIAL. Not
production admission.
