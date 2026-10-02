# Independent audit — boundary unknown-flow / gate-injection span / wasm-ref escape

**Verdict: PASS** (scoped to the three named claims). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claims (three independent OPEN lows; this-turn PARTIAL candidates):

- **A. `csf_4ed0a2dce4f0a888cce874b7`**: Missing flow metadata must not be
  promoted to internal trust. File
  `packages-ts/galerina-devtools-graph-algorithms/src/graphs/boundary-graph.ts`.
  THIS TURN: `UNKNOWN_FLOW_QUALIFIER = "unknown"`; `qualifierToKind` maps
  unknown → `public`; missing caller/callee metadata uses that qualifier
  (trust `untrusted`). Tests `tests/boundary-graph.test.mjs` include
  hostile `secure→ghost` `crossingAllowed false`. Dist rebuilt.

- **B. `csf_f569fd828cde29e4e9f64660`**: Admission-border revocation checks
  must not pass via comments or unrelated identifiers. File
  `scripts/check-gate-injection.mjs`. THIS TURN: `classifyCaller` strips
  comments then requires `\brevocationCheck\b` in **each** admit-call
  argument span (balanced parens). File-level identifier is not enough.
  `isDirectRun` so import does not walk the repo. Tests
  `scripts/tests/check-gate-injection.test.mjs` **2/2** plus `--self-test`.

- **C. `csf_2cb1c6d5f0b7c955766a9b48`**: Manifest-declared wasm refs must
  not read outside the repository. File `scripts/verify-artifacts.mjs`.
  THIS TURN: `wasmRefEscapes` (NUL, empty, `.`, `..`, absolute, drive,
  leading `/` or `\`). `wasmCrossCheck` uses it before `join`. Tests
  `scripts/tests/verify-artifacts.test.mjs` **3/3**. Already had `isCli`.

This reviewer independently re-read production + tests + dist for the
three named bodies, hashed working-tree bytes, ran the named suites,
and executed an extra probe from `%TEMP%` (not by trusting the named
tests alone). Author-named hashes were **not** supplied in the review
packet. Independent `crypto.createHash('sha256')` and `Get-FileHash`
MATCH each other on the listed files.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not**
promote them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **32 OPEN / 88
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 32 = 0 high / 0 medium /
32 low, `PARTIAL_THIS_TREE` 88 = 68 medium / 20 low,
`PATCHED_AUDIT_PENDING` 4 high; `n` 124; disposition sum 124). The
three named IDs are among the 32 OPEN lows. Overall
`INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan closure. Not
Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64. Named graph suite imports
gitignored `dist/` (`packages-ts/.gitignore` line 5 `dist/`). Gate and
wasm suites import source `.mjs`. This reviewer did not rebuild. Dist
mtime for the graph body is newer than matching src and carries
`UNKNOWN_FLOW_QUALIFIER` / unknown → `public`.

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-devtools-graph-algorithms/src/graphs/boundary-graph.ts` | **M** HEAD blob `c24de71b12` → WT blob `833078f2e7`. HEAD `qualifierToKind` default `return "internal"`; missing caller/callee used `?? "internal"` (kind **internal**, trust **internal**; `secure→ghost` `crossingAllowed` true). THIS TURN: `UNKNOWN_FLOW_QUALIFIER = "unknown"`; unknown kind `public`; missing metadata uses that qualifier (trust `untrusted`). |
| `packages-ts/galerina-devtools-graph-algorithms/tests/boundary-graph.test.mjs` | **M** HEAD blob `2738b6cb26` → WT blob `b3626fabda`. HEAD stub test asserted `unknownCallee` kind `"internal"`. THIS TURN: stub kind/trust `public`/`untrusted`; hostile `secure→ghost` `crossingAllowed false`. Imports `../dist/graphs/boundary-graph.js`. |
| `packages-ts/galerina-devtools-graph-algorithms/dist/graphs/boundary-graph.js` | gitignored; rebuilt this turn; `UNKNOWN_FLOW_QUALIFIER` 10; `qualifierToKind` default `"public"` 25; missing caller/callee `?? exports.UNKNOWN_FLOW_QUALIFIER` 103 / 118. |
| `scripts/check-gate-injection.mjs` | **M** HEAD blob `dadd255194` → WT blob `6b3a5ec64f`. HEAD already stripped comments, then `code.includes(GATE)` at **file** level (unrelated identifier → `guarded`). HEAD had **no** `isDirectRun` (import walked the repo as CLI). THIS TURN: `sliceCallArgs` + `\brevocationCheck\b` in **each** admit-call arg span; `isDirectRun`; self-test table adds unrelated-id / comment offenders. |
| `scripts/tests/check-gate-injection.test.mjs` | **??** untracked. THIS TURN: self-test table 2/2 plus hostile comment/unrelated-id. Imports `../check-gate-injection.mjs`. |
| `scripts/verify-artifacts.mjs` | **M** HEAD blob `2df3caf554` → WT blob `c1cc97a677`. HEAD already refused NUL / `..` parts / leading `/` / drive `/^[A-Za-z]:/` then `join` + `relative` second check; exported `wasmCrossCheck` only; already had `isCli`. THIS TURN: `wasmRefEscapes` (empty, `.`, leading `\`, `isAbsolute`, empty segments) used **before** `join`; also exports `wasmRefEscapes`. |
| `scripts/tests/verify-artifacts.test.mjs` | **M** HEAD blob `383254b52b` → WT blob `2052a5e1e1`. HEAD had `..` refuse + JS syntax check. THIS TURN: absolute / drive / UNC `wasmRefEscapes` plus `wasmCrossCheck` of `C:/Windows/a.wasm`. |

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-devtools-graph-algorithms/src/graphs/boundary-graph.ts` | 7956 | `43a77c9dbc8c7fc4244c88872bcf72e87430537e7fd9d62fb75d180142bc098c` |
| `packages-ts/galerina-devtools-graph-algorithms/tests/boundary-graph.test.mjs` | 8420 | `6f04d6b085103a58ac7aaee483d9fb8f6bd73ec86110233fcd22525f5dd2d57e` |
| `packages-ts/galerina-devtools-graph-algorithms/dist/graphs/boundary-graph.js` | 7059 | `dddf02a855dc9f295682909f488921c369a56972b88514e086b35049d7ab3f46` |
| `scripts/check-gate-injection.mjs` | 6834 | `a4fc595a1f2851c231601e837252fd32c9e484b716704648d665fbf10f002e2f` |
| `scripts/tests/check-gate-injection.test.mjs` | 851 | `ac757929949ef25503be74f05db5cc041f4b47e4a37c33d7bce0914d54d20e4e` |
| `scripts/verify-artifacts.mjs` | 14999 | `5306ea7e5999339cff8d5c325c3b7d3d0a7fc54eac49d9caaa304048241e199d` |
| `scripts/tests/verify-artifacts.test.mjs` | 2268 | `5705f42b05355d55e6c221d21dcc163394194b97de131843752c3998e8bc982e` |

Independent MATCH (Get-FileHash ↔ crypto): boundary-graph src
`43a77c9d…bc098c`; boundary-graph tests `6f04d6b0…d2d57e`; dist
`dddf02a8…ab3f46`; check-gate-injection `a4fc595a…002e2f`; gate tests
`ac757929…d20e4e`; verify-artifacts `5306ea7e…1e199d`; wasm tests
`5705f42b…bc982e`; inventory `fc3ae437…407fa5`.

Dist mtimes (UTC): `boundary-graph.js` `2026-09-23T10:50:09.326Z` (src
`2026-09-23T10:48:28.257Z` / tests `2026-09-23T10:48:28.247Z`). Named
graph dist is newer than src. Gate/wasm scripts have no dist; tests
import source. Inventory file sha256
`fc3ae437250d76378b95b085f3e667939baccebbd632c73885f135f9c0407fa5`
(untracked `??` on this dirty tree). `findings_json_sha256` pin
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.

CSF rows (still `OPEN_ON_SCAN_SNAPSHOT`, low):

- `csf_4ed0a2dce4f0a888cce874b7` (`occ_784dd1f22d1d690c39e1d9f8`,
  path `packages-ts/galerina-devtools-graph-algorithms/src/graphs/boundary-graph.ts`,
  scan-era `start_line` 159, title “Missing flow metadata is promoted to
  internal trust in boundary graphs”)
- `csf_f569fd828cde29e4e9f64660` (`occ_7a67518494e76e813458672b`,
  path `scripts/check-gate-injection.mjs`,
  scan-era `start_line` 50, title “Admission-border revocation checks
  can be bypassed with comments or unrelated identifiers”)
- `csf_2cb1c6d5f0b7c955766a9b48` (`occ_848c71b8d820b60d8c11f407`,
  path `scripts/verify-artifacts.mjs`,
  scan-era `start_line` 170, title “Manifest-declared wasm references
  can make the integrity scanner read outside the repository”)

Named graph tests import gitignored dist, not src. Gate/wasm tests
import source.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| A. Missing metadata uses `UNKNOWN_FLOW_QUALIFIER` `"unknown"` | src 37–38 / 146 / 163; dist 10 / 103 / 118 |
| A. `qualifierToKind` unknown → `public` | src 48 `return "public"`; dist 25. HEAD 46 `return "internal"` |
| A. `qualifierToTrustLevel` unknown → `untrusted` | src 56 fallthrough; same on HEAD, but HEAD fed `"internal"` qualifier so trust became `internal` |
| A. Hostile `secure→ghost` `crossingAllowed false` | WT tests 62–70; extra probe `ghostKind:public` `ghostTrust:untrusted` `crossingAllowed:false` |
| A. Dist rebuilt | dist mtime 10:50:09Z > src 10:48:28Z; suite imported that dist and passed |
| A. Residual: sibling `boundary-graph.ts` copies | Independently inspected: `galerina-core-compiler/src/boundary-graph.ts` is a Phase 20 empty stub (`return { nodes: [], edges: [] }`); `galerina-devtools-project-graph/src/graphs/boundary-graph.ts` takes explicit `trustLevel` and skips missing targets. **Not confirmed** that those copies still default missing metadata to `internal`. |
| B. Comments stripped before classify | src 78 (also on HEAD 51). Extra probe block/line comment → `offender` |
| B. File-level identifier is not enough | HEAD 54 `code.includes(GATE)` would mark `fusePackage(pkg); const revocationCheck = true;` `guarded`. WT `everyAdmitCallInjectsGate` requires `\brevocationCheck\b` in each arg span. Extra probe `unrelatedId:offender` |
| B. Per-call balanced-paren arg span | src 49–74 `sliceCallArgs` + `\\b${GATE}\\b` |
| B. `isDirectRun` so import does not walk repo | src 105–109 / 153. HEAD had no guard (module-load walk). Extra probe cwd `%TEMP%`, argv1 probe path, stdout JSON only (no lint walk) |
| B. Tests **2/2** + `--self-test` | named suite 2 pass; `node scripts/check-gate-injection.mjs --self-test` PASS |
| B. Residual: paren matcher ignores strings/templates | extra probe `stringInArgs:guarded` for `fusePackage(pkg, { x: "revocationCheck" })` |
| B. Residual: prebuilt `opts` without identifier in the call fails closed | extra probe `prebuiltOpts:offender` |
| C. `wasmRefEscapes` before `join` | src 155–161 / 178–186 |
| C. NUL, empty, `.`, `..`, absolute, drive, leading `/` or `\` | src 156–160; extra probe all true except `relOk:false` |
| C. HEAD already refused NUL / `..` / leading `/` / drive, plus join-then-relative | HEAD wasmCrossCheck inline `pathRefused`; second check still present WT 188–195 |
| C. Tests **3/3** | JS syntax; `..` refuse; absolute/drive/UNC |
| C. Already had `isCli` | src 244–245 / 312; HEAD already gated CLI |
| C. Residual: JSON visit unbounded | src 173–207 `visit` recurses `Object.values` with no depth/size cap |
| C. Residual: join-then-relative remains a second check after admit | src 187–195 |
| Inventory 32/88/4 | independent recount of 124 `findings` |
| Production admission / 124-scan closure | **not these claims** |

## Command receipts

1. `git -C <worktree> rev-parse HEAD` →
   `91b4dec08fe4376febc9494a8023bd02912b8695`.
   Named-path status → `M` boundary-graph src; `M` boundary-graph tests;
   `M` check-gate-injection.mjs; `??` check-gate-injection tests; `M`
   verify-artifacts.mjs; `M` verify-artifacts tests; dist gitignored.

2. `node --test packages-ts/galerina-devtools-graph-algorithms/tests/boundary-graph.test.mjs`
   from worktree cwd → **13/13 pass**, 0 fail, 0 skip, `duration_ms 162.8916`.
   Hostile missing-callee 0.1925ms green.

3. `node --test scripts/tests/check-gate-injection.test.mjs`
   → **2/2 pass**, 0 fail, 0 skip, `duration_ms 140.692`.

4. `node scripts/check-gate-injection.mjs --self-test`
   → `[self-test] PASS — gate-injection detector classifies offender/guarded/test/skip correctly` exit 0.

5. `node --test scripts/tests/verify-artifacts.test.mjs`
   → **3/3 pass**, 0 fail, 0 skip, `duration_ms 231.6611`.

Independent extra (`%TEMP%\zt-boundary-gateinject-wasmref-probe\probe.mjs`;
cwd `%TEMP%\zt-boundary-gateinject-wasmref-probe`; `file://` import of
working-tree gate/wasm source and graph dist; no production write):

| probe | result |
|---|---|
| import `classifyCaller` from TEMP (must not lint real repo as CLI) | cwd TEMP; argv1 probe path; stdout JSON only; **no** `gate-injection lint` walk |
| comment / unrelated-id | `unrelatedId:offender`, `blockComment:offender`, `lineComment:offender`, `guarded:guarded` |
| `wasmRefEscapes("C:/Windows/a.wasm")` | **`drive:true`** (also UNC/empty/dot/dotdot/leading `/` `\` true; `ok.wasm` false) |
| missing callee public/untrusted; secure caller `crossingAllowed false` | **`ghostKind:public`**, **`ghostTrust:untrusted`**, **`crossingAllowed:false`**; `UNKNOWN_FLOW_QUALIFIER:"unknown"` |

## Challenge 1 — is missing flow metadata still promoted to internal trust?

**No on this dirty tree for the named graph-algorithms builder. CONFIRMED
closed for the named unknown→public/untrusted bullet.** HEAD defaulted
`qualifierToKind` and missing caller/callee metadata to `"internal"`
(trust `internal`; `secure→ghost` allowed). THIS TURN uses
`UNKNOWN_FLOW_QUALIFIER "unknown"` → kind `public`, trust `untrusted`,
`crossingAllowed false`. Extra probe and named hostile test are
red-capable against HEAD. Dist matches src and is newer than src.
Residual: a missing **caller** is also public, and `isCrossingAllowed`
returns true for public callers (not an internal-trust promotion).
Sibling files named `boundary-graph.ts` in core-compiler (empty stub)
and project-graph (explicit `trustLevel`) were inspected and **do not**
share this `?? "internal"` default.

Scan-era object `0f6063dd…:packages-ts/galerina-devtools-graph-algorithms/src/graphs/boundary-graph.ts`
is **not** recategorized. Inventory still lists the row OPEN.
Scan-era `start_line` 159 is the HEAD missing-callee `"internal"` default.

## Challenge 2 — can admission-border revocation checks still pass via comments or unrelated identifiers? Does import walk the repo?

**No on this dirty tree for `classifyCaller`. CONFIRMED closed for the
named per-call span + import-not-CLI bullet.** HEAD already stripped
comments, so comment-only GATE was already `offender`; HEAD then used
**file-level** `includes(GATE)`, so `fusePackage(pkg); const
revocationCheck = true;` was `guarded`. THIS TURN requires
`\brevocationCheck\b` in each admit-call argument span. Extra probe:
unrelated-id and comments `offender`; import from `%TEMP%` did not print
or walk the repo lint (HEAD had no `isDirectRun`). Named suite 2/2 and
`--self-test` green. Residual: string/template contents inside the arg
span still match (`stringInArgs:guarded`); prebuilt `opts` without the
identifier in the call is `offender` (fail closed).

Scan-era object `0f6063dd…:scripts/check-gate-injection.mjs`
is **not** recategorized.

## Challenge 3 — can manifest wasm refs still make the scanner read outside the repository?

**No on this dirty tree for the named `wasmRefEscapes` admit. CONFIRMED
closed for the named absolute/drive/UNC/`..` bullet.** HEAD already
refused NUL / `..` / leading `/` / drive letters and had a
join-then-relative second check plus `isCli`. THIS TURN extracts
`wasmRefEscapes` (adds empty, `.`, leading `\`, `isAbsolute`, empty
segments) and uses it **before** `join`. Extra probe
`wasmRefEscapes("C:/Windows/a.wasm") === true`. Named suite 3/3 green.
Residual: `visit` JSON walk is still unbounded; join-then-relative
remains a second check after admit.

Scan-era object `0f6063dd…:scripts/verify-artifacts.mjs`
is **not** recategorized.

## Residuals (not findings against the three named bullets)

- Boundary-graph: missing **caller** is public/untrusted and
  `isCrossingAllowed` is always true for public/package/internal
  callers (`missingCallerCrossingAllowed:true` in extra probe). That is
  not promotion to **internal** trust. Independently inspected sibling
  files `packages-ts/galerina-core-compiler/src/boundary-graph.ts`
  (empty stub) and
  `packages-ts/galerina-devtools-project-graph/src/graphs/boundary-graph.ts`
  (explicit `trustLevel`) do **not** share the named `?? "internal"`
  default. Author-flagged “other copies may still default to internal”
  is **not confirmed** at those two paths.
- Gate-injection: `sliceCallArgs` does not skip strings/templates
  (extra probe `stringInArgs:guarded`). Prebuilt `opts` without the
  identifier in the call remains `offender` (fail closed), as the
  author flagged.
- wasmCrossCheck: JSON `visit` is still unbounded; `join` then
  `relative` remains a second check after `wasmRefEscapes` admit.
- Named graph suite imports gitignored dist, not src. Dist was
  confirmed non-stale for that named body; this receipt did not
  rebuild. Gate/wasm tests import src.
- Inventory still lists the three IDs as `OPEN_ON_SCAN_SNAPSHOT`. This
  receipt does not reclassify them. 32 OPEN / 88 PARTIAL / 4 PATCHED
  remain. Worktree remains dirty HEAD `91b4dec0…`,
  **INCOMPLETE_NON_AUTHORITATIVE** for production admission. Not
  Astra. Not 124-scan closure.

## Classification

No `CONFIRMED_FINDING` on the three named claims. The detectors are not
invalid against scan-era internal-trust promotion, file-level GATE
identifier, or out-of-repo wasm reads; this dirty tree has the named
unknown→public/untrusted default (this-turn src/dist + hostile test),
per-call `\brevocationCheck\b` + `isDirectRun`, and `wasmRefEscapes`
before `join`, with executed red-capable evidence. Residuals above
remain outside those bullets. Evidence is sufficient for those
bullets; insufficient for scan recategorization and production
admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**

## Close

- **Verdict:** PASS scoped (three named lows). Not production admission.
- **Path:** `docs/independent-audits/2026-09-23-boundary-gateinject-wasmref-hold.md`
- **Hashes MATCH?:** yes (`Get-FileHash` ↔ `crypto.createHash('sha256')`)
- **Suite counts:** boundary-graph **13/13**; check-gate-injection **2/2**; `--self-test` PASS; verify-artifacts **3/3**
- **Extra-probe:** `%TEMP%\zt-boundary-gateinject-wasmref-probe` — import `classifyCaller` did not lint repo; comment/unrelated-id `offender`; `wasmRefEscapes("C:/Windows/a.wasm")===true`; missing callee `public`/`untrusted` and `crossingAllowed false`
- **Residuals:** sibling boundary-graph copies inspected, internal-default **not confirmed** there; paren matcher ignores strings (`stringInArgs:guarded`); prebuilt `opts` fail-closed; wasm JSON visit unbounded; join-then-relative second check
- **git status (named):** `M` boundary-graph src+tests; `M` check-gate-injection.mjs; `??` check-gate-injection tests; `M` verify-artifacts.mjs+tests; extra dirty elsewhere on this worktree; `??` this receipt; dist gitignored. HEAD `91b4dec08fe4376febc9494a8023bd02912b8695`
