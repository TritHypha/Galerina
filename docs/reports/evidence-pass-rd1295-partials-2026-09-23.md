# Evidence-only pass — RD-1295 loads, PARTIAL residuals, PATCHED highs, RD-0349/0361/0363/0364/0365

**Overall:** INCOMPLETE_NON_AUTHORITATIVE. Not production admission. No source edit, signing, commit, push, KB pin change, or `.fungi` corpus/build in this pass.

## Custody

| Field | Value |
|---|---|
| Worktree | `./.worktrees\rd-0873-native-fungi-bootstrap-implementation` |
| Live HEAD | `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` — **MATCH** supplied starting HEAD |
| Subject | `docs(roadmap): clarify committed checkpoint and SVG hold` |
| Branch | `main...origin/main [ahead 1]` |
| Dirty vs HEAD | 58 tracked files, +1801 / −231 (`git diff --stat HEAD`) plus untracked reports/tests |
| Inventory JSON | `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` SHA-256 `b99cfd31cf3ad19ba1b46fea9caadfa1268775b5a84189b808894cd9e32b34fb` |
| Inventory bind | `worktree_head` `91b4dec08fe4376febc9494a8023bd02912b8695`; `overall` `INCOMPLETE_NON_AUTHORITATIVE`; counts 0 OPEN / 120 PARTIAL / 4 PATCHED |

The 0/120/4 split is **not** a fresh clearance of `e8f1b682`.

---

## Packet 1 — RD-1295 production load vs package install

**Verdict: CONFIRMED** (runtime graphs of the named entries omit `hybrid-engine` and the Tower barrel). Package-split is **install-TCB**, not a demonstrated extra **runtime** module on these entries.

| Item | Locator |
|---|---|
| Claimed invariant | ESM import of core-network cert-gate / app-kernel kernel loads `@galerina/tower-citizen/governance` only (cli-check). App-kernel public `dist/index.js` also loads `/custody`. Neither graph contains `hybrid-engine.js` or `galerina-tower-citizen/dist/index.js`. The `file:` dependency still installs the whole Tower package, including `dist/hybrid-engine.js` on disk. |
| HEAD | `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` dirty |
| File:line | `packages-ts/galerina-core-network/src/cert-gate.ts:38`; `admission-feedback.ts:34`; `src/index.ts:600-626` re-exports those modules; `package.json:31` `"@galerina/tower-citizen": "file:../galerina-tower-citizen"`; `packages-ts/galerina-framework-app-kernel/src/kernel.ts:41-42`; `src/index.ts:7,24-27` re-exports kernel + registry; `package.json:80` same `file:` dep; `packages-ts/galerina-tower-citizen/package.json:51-80` exports map |
| Source SHA-256 | `cert-gate.ts` `7af3bc439f73979c1e487fbe6111138914ac13719d4eca4f79c987e3cca5d02f`; `kernel.ts` `6758394f2ce8100c05bd841463dbafb809db658214c1d6ec4a7dc4a4ff1ca492`; `hybrid-engine.js` on disk `8ae47a33425382573eb67a44307fc2828a818cddf2ddf365a23a48977f55501f` (58511 bytes) |
| Positive control | `walkLoadGraph(dist/cert-gate.js)` and `walkLoadGraph(dist/kernel.js)`: `ok:true`, `governance:true`, `hybrid:false`, `barrelIndex:false`. Tower files are the cli-check cluster (`governance.js`, `three-valued-governance.js`, `trit-gates.js`, …). |
| Hostile control | `hybrid-engine.js` exists in the installed package (stat 58511). Same walker on those entries returns `hybrid:false`. `walkLoadGraph(app-kernel dist/index.js)`: 55 files, 26 Tower-related, `custody:true`, still `hybrid:false` / `barrelIndex:false`. |
| Command | `node %TEMP%\rd1295-walk-prod.mjs` using `packages-ts/galerina-tower-citizen/dist/load-graph.js` |
| Result | certGate nFiles=10 nTower=9 hybrid=false; kernel nFiles=16 nTower=9 hybrid=false; appIndex nFiles=55 nTower=26 hybrid=false custody=true; netIndex nFiles=16 nTower=9 because `index.ts:600-626` re-exports cert-gate |
| Unproved | Node module cache / `require` of a sibling Tower file by a **different** consumer; Windows junctions; production process that imports `@galerina/tower-citizen` (barrel) rather than `/governance`. App-kernel public barrel **does** load custody + `@noble/post-quantum/ml-dsa.js`. |
| What would change the verdict | A production `walkLoadGraph` (or `import.meta.resolve` + instantiated graph) of a live entry that includes `hybrid-engine.js` or `dist/index.js` of Tower. |

Package-split premise: **install** still pulls the full package. **Runtime** of cert-gate / kernel request path does not load hybrid or the Tower barrel.

---

## Packet 2 — `walkLoadGraph` vs production execution bytes

**Verdict: CONFIRMED** that the walker is a **source-path** closed-set checker. **NOT VERIFIABLE** as attestation of bytes a production ESM loader executes. Frozen-composition **NO_DEFECT** is a **separate** claim (`product-profiles.ts`).

| Item | Locator |
|---|---|
| Claimed invariant | `walkLoadGraph` `lstat`s a path, then `readFileSync`s UTF-8 source, then parses import edges. It is not Node's instantiate/evaluate of those bytes. Production cert-gate/kernel never call it. |
| HEAD | `e8f1b682` dirty |
| File:line | `packages-ts/galerina-tower-citizen/src/load-graph.ts:139-148` `tryRealFile` (`lstatSync`, refuse symlink, size cap, `realpathSync.native`); `:301-326` `walkLoadGraph` queue + `readFileSync(file, "utf8")`; `package.json:19-23` `load-graph.ts` is an `allowOrphan` isolation checker, not a public export |
| Source SHA-256 | `load-graph.ts` `e98eaedcb44dee1f43898ca7eecff788b6c46d30025950ff3aa446e371f91bd3` |
| Callers | `walkLoadGraph` appears only in `src/load-graph.ts` and `tests/load-graph-bounds.test.mjs`, `tests/rd-1295-governance-isolation.test.mjs`, `tests/rd-1295-products.test.mjs`. No production `packages-ts` consumer. |
| Positive control | Isolation tests `walkLoadGraph(join(DIST, "governance.js"))` and `walkLoadGraph(certGate)` — source graphs, then a **separate** `import()` of fixtures in products tests. |
| Hostile control | Between `lstatSync` (`:142`) and `readFileSync` (`:320`) the path is not held as an fd. A replace of those bytes is a TOCTOU. **Live pause/swap was not run** on this Windows host (no in-walk hook). |
| Frozen composition (separate) | `product-profiles.ts` SHA-256 `024c3337b6125d3107af8d1ddc31eb91bffe05cd2422513351998e8eb1a8a3e3`. Frozen ID/cluster tables: **NO_DEFECT** for primitive string keys (prior challenge). Not re-run this packet. |
| Unproved | Inode/byte identity of `import()` after the graph; V8 module cache; whether `dist/*.js` matches the `src/*.ts` just hashed. |
| What would change the verdict | A production caller that `readFile`s, hashes, stages, and instantiates the **same** snapshot `walkLoadGraph` admitted. |

---

## Packet 3 — omitted AuditEgress **writer** key

**Verdict: CONFIRMED** residual. `verifyChain` omitted-key refuse is already in the dirty diff; this packet does **not** redo that repair. The **constructor** still defaults a missing writer key to `ZERO_KEY`.

| Item | Locator |
|---|---|
| Claimed invariant | `new AuditEgress({ dir, batchSize })` without `hmacKey` still seals with `ZERO_KEY` (`:146`). |
| File:line | `packages-ts/galerina-core-sentinel-egress/src/audit-egress.ts:10-11` `ZERO_KEY`; `:130-134` `strictKey` weak-key trap; `:146` `this.#hmacKey = opts.hmacKey ?? ZERO_KEY`; `:260-264` `verifyChain` returns false if `hmacKey === undefined` |
| SHA-256 | `89ceae6e57ec4b8e0de3c3f0b30898bf2cbf165a40a20e8fa6b93171f8447fb3` |
| Positive control | Explicit `verifyChain(batches, new Uint8Array(32))` on a ZERO_KEY-sealed ledger → **true** |
| Hostile control | Construct **without** `hmacKey`, flush two records. `verifyChain(batches)` omitted → **false** (already repaired). Writer still constructed (`constructed:true`). Empty `Uint8Array` was **not** probed here. |
| Command | `node %TEMP%\partial-probes.mjs` omitted-writer block |
| Result | `{ constructed:true, batches:1, omittedVerify:false, zeroVerify:true }` |
| Unproved | `strictKey:true` without key (expected `EGR-KEY-001`); empty `Uint8Array` vs ZERO_KEY (prior review residual). |
| What would change the verdict | Constructor throws when `hmacKey` is omitted, including `strictKey:false`. |

---

## Packet 4 — JsonLineSink line size

**Verdict: CONFIRMED**. Logger truncates `msg` at 4096; `JsonLineSink` still writes one JSON line of the whole record, including fields.

| Item | Locator |
|---|---|
| Claimed invariant | After `MAX_LOG_MESSAGE_CHARS` 4096, `JsonLineSink.write` calls `safeStringify(record)` with no line-byte cap (`logger.ts:103-116`). |
| SHA-256 | `logger.ts` `b95a38427448ecdd934af2711707d27b9946d016c1389f2a8a2d68f90acd564b` |
| Positive control | Short `"ok"` is retained in full (existing logger tests). |
| Hostile control | `createLogger` + `JsonLineSink` measuring `line.length`; `info("x"×(4096+100), { blob: "y"×2000 })`. |
| Command | `node %TEMP%\partial-probes.mjs` jsonlinesink block |
| Result | `{ MAX_LOG_MESSAGE_CHARS:4096, longest:6168 }` — line exceeds the msg cap |
| Unproved | Host `process.stdout` back-pressure; `safeStringify` of nested fields vs redaction node cap. |
| What would change the verdict | `JsonLineSink` refuses or truncates when `Buffer.byteLength(line)` exceeds a named bound. |

---

## Packet 5 — direct `callStdlib` metering

**Verdict: CONFIRMED**. `Array.range` charges only when `ctx.chargeSteps` is present (`stdlib.ts:2094`). Direct `callStdlib` with a dummy ctx allocates 100000 ints unmetered.

| Item | Locator |
|---|---|
| File:line | `stdlib.ts:225` optional `chargeSteps?`; `:1965` `callStdlib`; `:2079-2096` `Array.range` then `ctx.chargeSteps?.(count)` |
| SHA-256 | `349a7d507cef6fcee25196927b55437e7fe2748fd580a0c439257d43d065d0de` |
| Positive control | `executeFlow` with `maxSteps:20` vs `Array.range(0,100)` traps (existing `interpreter-compute-step-cap.test.mjs`; **not re-run** this packet because that path is already in the dirty diff). |
| Hostile control | `callStdlib("Array.range", undefined, [0,100000], {recordEffect, resolveIdentifier})` **without** `chargeSteps`. |
| Command | `node %TEMP%\partial-probes.mjs` callStdlib block |
| Result | `{ tag:"list", n:100000, ms:8 }` — no throw |
| Unproved | SyncInterpreter path; WASM `__range` (separate host fuel). |
| What would change the verdict | Missing `chargeSteps` refuses `Array.range`, or `callStdlib` requires a charge hook. |

This packet does **not** redo Interpreter `chargeSteps` wiring.

---

## Packet 6 — WASM `seedString` sparse holes

**Verdict: CONFIRMED**. `seedString(5,"hole")` on an empty table leaves `strings[0..4]` empty; `internString` then returns **6** (`strings.length` after sparse assign).

| Item | Locator |
|---|---|
| File:line | `wasm-runtime.ts:36` `MAX_WASM_STRINGS=4096`; `:787-798` `strings[handle]=s` after handle/length checks; `:799` `readString` |
| SHA-256 | `69644fefa329a20159d473dcc30dcda846432b643a39146c421b9c541f5e05f3` |
| Positive control | Handle `>= MAX_WASM_STRINGS` refuses (existing wasm-runtime test). |
| Hostile control | `seedString(5,"hole")`; `readString(0..6)`; then `internString("tail")`. |
| Command | `node %TEMP%\partial-probes.mjs` seedString block |
| Result | `reads: [null,null,null,null,null,"hole",null]`, `internId:6` |
| Unproved | Compiler intern-table replay that **depends** on holes; collision with interned sequential ids. |
| What would change the verdict | `seedString` admits only `handle === strings.length` or dense fill, without creating holes. |

Handle/length caps are already in the dirty diff; this packet is **holes**, not those caps.

---

## Packet 7 — package-scan read identity

**Verdict: PLAUSIBLE from source; live replace NOT VERIFIABLE** on this host without an fs hook. **SELF-REJECTED** as a live TOCTOU demonstration.

| Item | Locator |
|---|---|
| File:line | `scanner.ts:677` `listSourceFiles` uses `lstat` size into `budget.bytes`; `:680-685` later `readFileSync(abs)` then `raw.length > MAX_SCAN_FILE_BYTES` |
| SHA-256 | `9d501c13b484ba72af20b287dd9cfa2a148e3fd86cc7b658c29e692887ad0946` |
| Positive control | Existing package-graph 1 MiB file-byte hostile (in dirty tests). **Not re-run** as a size-cap redo. |
| Hostile control | Replace file bytes between list `lstat` and `readFileSync`. Not executed (no in-function pause; Windows). |
| Unproved | Whether `raw.length` (UTF-16 units) matches `lstat.size` (UTF-8 bytes) for non-ASCII. |
| What would change the verdict | Open fd at `lstat`, `fstat`, `read` from that fd, refuse if size changed. |

---

## Packet 8 — four PATCHED highs (not self-promoted)

**Verdict: PATCHED_AUDIT_PENDING remains.** Current working-tree SHA-256 **does not match** the 2026-09-23 verification table. A fresh independent exact-revision review must re-prove each invariant **at these bytes**, not at the old digests.

Prior report: `docs/reports/patched-highs-verification-2026-09-23.md` (authored at HEAD `91b4dec0`). Independent id cited there: `01a0cd1e-52dc`.

| ID | Path | Inventory start_line | Prior digest (report) | Current dirty SHA-256 | Must re-prove |
|---|---|---|---|---|---|
| `csf_7c334da06ea43bf62f7b58f9` | `scripts/lib/signed-lmanifest.mjs` | 102 | `27f08b7e…a4fa3c0` (`rebuild-fusable-packages.mjs` in the table) | `9d1ae6dc342f385208292c3bdb11f23fd2c754070373f5dd5ca76eb9db9066eb` | Spawn argv `shell:false`; dir `pkg&echo MARKER&rem` is not a command. Re-run `scripts/tests/rebuild-fusable-packages.test.mjs`. |
| `csf_2a86648bf19537088fa9b394` | `packages-ts/galerina-framework-app-kernel/src/kernel.ts` | 413 | `189a739e…8aa424f3` | `6758394f2ce8100c05bd841463dbafb809db658214c1d6ec4a7dc4a4ff1ca492` | This file **changed** in the dirty Tower-subpath retarget. 8× `/nope` then `/health` still 200; 404 does not reserve mandatory audit. Re-run `tests/audit-async.test.mjs`. |
| `csf_176f3d7332761399dac3c39d` | `…/fuse-loader.ts` | 475 | `fc23ef01…5bdc87d4` | `c528e53a872d34428b10d3c31bb1abf379c4eda381ccfc6fa1c7add26e43d3e3` | `x/../../plugin/attacker` keyId refuses; `admittedGovernanceKeyPath`. Re-run `tests/fuse-loader.test.mjs`. |
| `csf_abb8e005fb7ba36366169ba5` | `…/api-server/src/index.ts` | 546 | `009c7b0f…e9fc784` | `925ac951781461423336763af97dc9e567337d876e941b8aed5d551b2fad3584` | GET `//[` → 400 inside `onRequest` catch. Re-run `tests/api-server.test.mjs`. |

This pass **did not** re-run those four suites (evidence-only; exact-revision review must be independent). Disposition stays `PATCHED_AUDIT_PENDING`.

---

## RD-0349 / 0361 / 0363 / 0364 / 0365 — smallest missing owner artifact

No scales, signatures, weights, vault move, or TPM evidence were invented.

| RD | Smallest missing owner artifact / decision | Bounded work that can proceed without it |
|---|---|---|
| **0349** | Sourced Commodity/Crypto/Rate/Percent scale tables (ISO snapshot does not admit metal/crypto decimals) | `unit NAME { decimals: N }` declare-or-reject + reserved-name gate, after the schema is admitted |
| **0361** | R4 authority nod **and** immutable compiler/toolchain closure that reproduces `secret-gate.fungi` digest (`ce662c32…` vs derived `f0622171…`) | Per-twin caller-route evidence; do not repin solely to green; no `.ts` retirement |
| **0363** | Authorize a plan-signature verifier seam (Ed25519 / ML-DSA-65) | Bind optional admission fields into `planHash`; refuse unknown step kinds at admission |
| **0364** | BitNet weight bytes + SHA-256 pin for `getModelSpec` | Thread `identityClass` + call/token/spend caps on the **simulator** `infer` path; halt at cap |
| **0365** | Completed vault move (Track-D#2) | Keep `evaluateKeyCustody` fail-closed; hostile copied-profile cannot mint L3; L3/L4 stay post-v1 |

---

## Self-rejection log

| Packet | Status |
|---|---|
| 1 production load | Complete: identity, positive + hostile (on-disk hybrid vs graph) |
| 2 walker vs execute | Complete for source-path claim; live inode swap **not** run |
| 3 writer key | Complete |
| 4 JsonLineSink | Complete |
| 5 callStdlib | Complete |
| 6 seedString holes | Complete |
| 7 scan read identity | **SELF-REJECTED** as live TOCTOU; source two-syscall claim is PLAUSIBLE only |
| 8 PATCHED highs | Complete as **not re-proven**; no promotion |

Done: evidence-only packets at HEAD `e8f1b682`; inventory 0/120/4 not treated as clearance
Summary: runtime graphs omit hybrid; walker is source-path; writer ZERO_KEY, JsonLineSink 6168, unmetered range 1e5, seedString holes CONFIRMED; PATCHED highs digest-drifted
Key files: `docs/reports/evidence-pass-rd1295-partials-2026-09-23.md`
Owner Decisions: none from this pass
Time: about 8 minutes
