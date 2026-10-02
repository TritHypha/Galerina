# Independent audit — RD-1296 array-of-record copy HOLD

**Verdict: PASS** (named array-of-record copy slice). Full RD-1296 ABI stays
**PARTIAL / open**. This is not production admission, nested record-field
deep copy, generation reuse, or secret-flow reachability.

Dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty).
Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree. **Not clean-HEAD evidence.** Production
sources and tests were not edited by this reviewer. Nothing was committed,
merged, pushed, or signed. `.fungi` was not touched.

Reviewer: Grok independent auditor `01a0d034-251d` (did not author these
changes). Not Astra.

Named claim: `copyArrayRecords` snapshots interned pointers then copies
`fieldCount` i32 guest words per element; guest mutation after copy does
not change the snapshot; `readArray` remains a handle list; shared
descendants yield independently owned rows; incomplete copies refuse
`FUNGI-WASM-HOST-001` with no partial success.

Platform: win32 Node v24.18.0.

## Requirement-to-evidence

| Claim | Status |
|---|---|
| Snapshot pointers then copy guest fields | **CONFIRMED** |
| Guest mutation after copy leaves the snapshot | **CONFIRMED** |
| `readArray` remains a handle list | **CONFIRMED** |
| Shared descendants independently owned | **CONFIRMED** |
| Short memory / unaligned / fieldCount 0 refuse, no partial success | **CONFIRMED** |
| Closed WASM host import set unchanged | **CONFIRMED** |
| Nested record fields inside records / generation / secret-flow | **NOT VERIFIABLE** / open |

## Locators

- `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts`
  `copyArrayRecords` 839–873 (validate then copy).
- Tests: `tests/wasm-runtime.test.mjs` copyArrayRecords cases.

## RED / GREEN actually run

Runtime `tsc -p tsconfig.json` → exit 0.

`node --test tests/wasm-runtime.test.mjs` → **35/35**, 0 skip.

Independent probe: copy `[[7,8],[9,10]]`; post-copy guest mutation isolated;
shared `[p,p]` rows distinct frozen objects; short/unaligned/fieldCount 0
throw `FUNGI-WASM-HOST-001`; interned handles unchanged after refuse.

## Author hashes (MATCH)

| path | bytes | sha256 |
|---|---|---|
| `src/wasm-runtime.ts` | 58978 | `6e259ebfbad21671c341c0fbbe9c6a385404b6478d25b2b87faef63578d94c99` |
| `dist/wasm-runtime.js` | 49583 | `5060ef5f34eea714904f74e67563c3b00cda9728918a9527d44c5a77dd0934d4` |
| `tests/wasm-runtime.test.mjs` | 13054 | `15966097a8c3d5213fec0a3628d045889b99e3e3f5f2c5ba0767ea3318f65590` |

## Remaining risk

Dirty tree. Nested record fields inside records copy as pointer words, not
recursively owned rows. `fieldCount` is not schema-length. Generation reuse
and secret-flow reachability stay open. Full RD-1296 remains PARTIAL. Not
production admission.
