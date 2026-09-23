# Galerina Compiler TODO

Current sequencing and classification: [pre-.fungi work register](../../docs/PRE-FUNGI-WORK-REGISTER-2026-09-22.md),
W04-W07/W13. Existing bounded results below do not close residual inference,
schema or lowering semantics, or authorize .fungi changes.

## Security continuation — 2026-09-22

- [x] CapabilityHost intersects `declaredEffects` with optional host
      `grantedEffects` (`src/runtime/capabilityHost.ts`, `src/runtime.ts`).
- [x] Production `run` requires host `grantedEffects` whenever the flow declares
      any effect (`FUNGI-RUNTIME-GRANT-REQUIRED`). Dev remains declared-only.
      Tests in `tests/capability-host.test.mjs`. Independent audit pending.
- [!] APPROVED_DEFERRED_SCOPE: JSON fractions/Decimal remain refused (RD-1289).
- [x] Option.zip named pair `ZipPair<T,U>` with `first`/`second` is a built-in
      generic (arity 2). Exact `Option<ZipPair<Int, String>>` return and
      `Option<ZipPair<Int, Int>>` mismatch tests in
      `tests/type-checker-expression-kind-matrix.test.mjs` **6/6**.
      Not general tuple, schema-export, or WAT-lowering clearance.
- [x] Q1 G5c capture-then-wipe for primitive early returns
      (`rewriteG5cCaptureThenWipe`). Mixed-body fall-through also uses
      on-exit zeroing. Nested secret calls wipe only `[owner_base, heap)`.
      Host cleanup calls guest `__fungi_wipe_owned`. Production
      `createLowLevelWasmExecutor` copies layout-sized heap words then wipes.
      Recursive `Node { child: Node, n: Int }` closed flatten copies
      `[0, 1, 7]` (not lossy `[0, 7]` or 8-hop pad). Q1 **27/27**.
      Independent scoped PASS `2026-09-22-closed-recursive-flatten-hold.md`.
      Residual: deeper than one recursive expansion still drops grandchild
      secrets. Not clean-HEAD admission.
- [x] `executeWASMFlow` work metering: loop-fuel ticks + worker
      instantiate/call with terminate-on-deadline (`src/wat-assembler.ts`,
      `src/wasm-flow-worker.mjs`). Tests
      `tests/wat-execution-meter.test.mjs` plus Phase 27 and isolation.
      Scan `csf_0a079c981e51180496dc447a` PARTIAL_THIS_TREE. Independent
      scoped PASS `2026-09-22-wat-execution-meter-hold.md` (`01a0cb36`).
      Recursion without `loop` relies on trap or deadline.
- [x] `withRetry` attempt/delay ceilings (`MAX_RETRY_ATTEMPTS` 8,
      `MAX_RETRY_DELAY_MS`). Tests `retry-policy-bounds.test.mjs` **4/4**.
      Scan `csf_77b916a8ab8239a016c1794f` PARTIAL_THIS_TREE.
      Independent scoped PASS `2026-09-22-retry-policy-bounds-hold.md`.
- [x] Unary-prefix `FUNGI-PARSE-DEPTH-001` + `readBoundedSource` 10 MiB
      ceiling. Tests `parse-depth-and-source-bounds.test.mjs` **3/3**.
      Scans `csf_bec723cd02be20807a46da3c`, `csf_4b117d1baa93121b41b11e87`.
      Independent scoped PASS `2026-09-22-parse-depth-source-bounds-hold.md`.
- [x] FUNGI-LEX-005 on EOF and block-comment newlines (`emitLineTooLong`).
      Tests `lexer-line-bounds.test.mjs` **4/4**. Scan
      `csf_554dd888b982b37741c01b17` PARTIAL_THIS_TREE. Independent scoped
      PASS `2026-09-22-lexer-line-bounds-hold.md` (`01a0cbf0`). Residual:
      LEX-005 remains a warning; oversized tokens are still emitted;
      typed content-block internal lines still skip the check.
- [x] `filesystemAsync` refuses dangling/present symlinks via `readlinkSync`
      before write. Tests `fs-root-symlink-refuse.test.mjs` **2/2**.
      Scan `csf_87352346f8708fa965b75642`. Independent scoped PASS
      `2026-09-22-fs-root-dangling-symlink-hold.md`. Residual: TOCTOU
      between readlink and writeFile.
- [x] BCrypt host adapter: rounds 10..12, async hash/compare. Tests
      `bcrypt-rounds-bound.test.mjs` **3/3**. Scan `csf_7a6508dbb21c910a7648d293`.
      Independent scoped PASS `2026-09-22-bcrypt-rounds-hold.md`.

## Graph integration follow-up — 2026-09-22

- [x] Admitted `@galerina/data-json` on the boundary because `src/stdlib.ts`
      already loads it. Live `--check` PASS. Hostile undeclared specifiers still
      fail. See [C22](../../docs/BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c22).

This file tracks open work for the compiler package. Reconciled 2026-09-22
against the working tree; implemented does not mean committed or admitted.
Items marked `[x]` describe bounded slices, subject to explicit residuals.

[x] C12 `fungi.compiler.build-evidence.v1` (`RD-1283`, live `RD-1293`) in
    `scripts/write-build-evidence.mjs`. Length-prefixed input/output digests;
    tsconfig include, toolchain pins, and consumed `dist/index.js` plus
    `dist/governance-mode.js`. Legacy v1 refused. Untracked src/tests still
    refuse. Committed producer at `705c80369`; fidelity consumer at
    `61c6d6628`. Live `fungi.compiler.build-evidence.v1` covers **867**
    inputs. Consumed outputs remain `dist/index.js` and
    `dist/governance-mode.js` only. Independent audit pending.
[x] C14 typed-content type environment (`RD-1284`) in
    `src/typed-content-block.ts`, wired from `checkTypes`. `FUNGI-BLOCK-004`
    refuses protected/Secret interpolations by type, not by name. Stage 2
    HTML/JS/CSS Stage-2 is a closed injection list (`FUNGI-BLOCK-006`):
    html/dom refuse `<script`, `javascript:`, `onerror|load|click|mouseover=`;
    script refuses `eval(`, `Function(`, `document.write(`; css refuses
    `expression(` and `javascript:`. Not an HTML/JS/CSS parser. Tests in
    `typed-content-validation.test.mjs`.
[x] C17 contract schema export (`RD-1287`) in
    `src/contract-schema-export.ts`. `record` declarations emit
    `galerina.contract-types.v1`. Same-source nested records and Array<T>
    are implemented; Option/Result/Decimal still refuse.
[x] C17 own-key preservation (`RD-1287`): `src/contract-schema-export.ts`
    stores field and record names with `defineOwn` / Object.defineProperty
    on ordinary dictionaries. `__proto__` names remain own enumerable
    keys through `JSON.stringify`. Docs OpenAPI still refuses those names
    as reserved components (closed, not silent drop). Option/Result/Decimal
    refusals unchanged.
[x] C19-A Stage-B type-code identity (`RD-1288`) in
    `src/stage-b-parity.ts`. Schema `fungi.compiler.stage-b-parity.v1`.
    Unique host vs `type-checker.fungi` codes for
    `FUNGI-TYPE-001`/`004`/`008`. Bag digest stays multiplicity-sensitive.
    Effect/governance codes and WASM byte-parity remain outside.
[x] C19-B governed JsonValue (`RD-1289`) in `@galerina/data-json`
    `src/json-value.ts`. Schema `fungi.json.value.v1`. `Json.parse` never
    returns `any`. Compiler `json.decode`/`Json.parse` consume it.
    Float/Decimal/protected encode refuse. Streaming json_lines remains
    the archive contract.
[x] C19-C injected CryptoProvider (`RD-1290`) in
    `@galerina/core-security` `src/crypto-provider.ts`. Schema
    `fungi.security.crypto-provider.v1`. Compiler stdlib does not load
    native KDF bindings. Absent/throwing providers refuse closed.
[x] C20 compile-time PatternCapability (`RD-1292`) in
    `src/pattern-capability.ts`. Schema `fungi.pattern.capability.v1`.
    WAT `matchesPattern` traps; word boundaries and captures remain
    refused. Not SLIDE/VOK admission.

## Shipped (Stage A — complete)

```text
[x] Create /packages-ts/galerina-core-compiler
[x] Add README.md, TODO.md, package metadata
[x] Define compiler input contract
[x] Lexer (FUNGI-LEX-001..006) — fully implemented, 400+ tests
[x] Parser — AST: flow/contract/match/record/for/import/enum/type-alias
[x] Symbol resolver — FUNGI-NAME-001..003
[x] Type checker — FUNGI-TYPE-001..023 (partial; see Open below)
[x] Value-state checker — FUNGI-VALUESTATE-001..008 + FUNGI-SECRET-001..003 + FUNGI-TAINT-001..005
[x] Effect checker — FUNGI-EFFECT-001..006 + canonical effects registry
[x] Governance verifier — FUNGI-GOV-001..024 + FUNGI-INV-001..004 + FUNGI-CONTEXT-001
[x] GIR emitter (Governed Intermediate Representation)
[x] WAT emitter (~89% lowered; unreachable trap for unlowered stubs)
[x] Runtime interpreter (Stage-A tree-walker, diagnostic tier)
[x] Bytecode VM (fast path for hot pure flows)
[x] WASM assembler (wabt integration)
[x] Manifest generator (.lmanifest CBOR + .lmanifest.json)
[x] Taint checker — FUNGI-TAINT-001..005 (OWASP-aligned, SSRF, injection sinks)
[x] Proof graph and attestation
[x] Security gate (single production gate, all checkers, every signing path)
[x] Hybrid Ed25519 + ML-DSA-65 signing (NIST FIPS 204)
[x] Contract-driven test generation (0016) — 5 vector dimensions
[x] Resilience inference (fault handlers, FUNGI-FAULT-001/003)
[x] Hardening / residency ceiling (RD-0358, FUNGI-HARDEN-001..008)
[x] print() / println() — stdlib + interpreter + registry (2026-07)
```

## Open — genuine remaining work

```text
[ ] FUNGI-TYPE-002  TypeMismatch — assignment compatibility checking
    Bounded coverage is implemented for literals, known expressions, record adoption,
    numeric widening, recursive generic arguments, Option<T>.unwrapOr(), and the
    declared-record result of a single-spread record update. The remaining gap is
    full expression-level inference for unsupported or unknown forms. Current
    blocker boundary:
    `src/type-checker.ts:1054-1556` (`TypeChecker.inferType`), with the
    assignment relation at `:472-541`, record-update admission at `:1179-1188`,
    return consumer at `:1746-1828`, call consumer at `:1874-1954`, and
    binding consumer at `:2064-2297`.
    The record-update slice is intentionally refused when the update has zero or
    multiple `#spread` children, when the spread base cannot be inferred, or when
    the inferred base is not a declared record schema; those cases return unknown
    and do not invent assignment compatibility. Evidence:
    `tests/type-checker-record-update.test.mjs:11-51` (incompatible and compatible
    declared bases plus unknown-base refusal), `npm run typecheck` (exit 0), and
    `node --test tests/type-checker-record-update.test.mjs` (3/3 pass). The package
    build's evidence writer refused the untracked test input; no build-evidence
    policy or generated artifact was changed.
    Regressions:
    tests/type-checker.test.mjs, tests/type-checker-phase11-wave2.test.mjs,
    tests/type-checker-record-adoption.test.mjs, and
    tests/type-checker-generic-assignment.test.mjs,
    tests/type-checker-option-unwrap.test.mjs.

[x] Bounded match-expression inference slice
    `match` is admitted in expression position, one-line expression-arm blocks
    retain their inner type, and numerically compatible arm results join through
    the existing assignment relation (`Int`/`Float` → `Float`). Incompatible
    results remain fail-closed and reach the enclosing mismatch diagnostic.
    Source: `src/parser.ts:2772-2778` and `src/type-checker.ts:1500-1551`.
    Focused evidence: `tests/type-checker-phase11-wave2.test.mjs:197-263`
    plus parser/domain/interpreter regressions; the combined bounded compiler
    route is **104/104**, parser/domain route **138/138**, and
    interpreter/match route **61/61**. Full unsupported expression inference
    remains open under FUNGI-TYPE-002/005..007.

[x] Bounded inferred-`Auto` generic call compatibility
    `isAssignmentCompatible` now treats inferred `Auto` as a deferred payload,
    including nested `Array<Auto>`, at `src/type-checker.ts:472-483`.
    This closes the false `FUNGI-TYPE-005` diagnostics in the SLIDE G4 adapter
    (`src/self-hosted/slide-gfrontend-fixture-adapter.fungi:93-156`) without
    weakening concrete-vs-concrete generic mismatches. Regression coverage is
    `tests/type-checker-generic-assignment.test.mjs:71-85`; the focused route
    is **40/40**. Broader unsupported expression inference remains open.

[x] Bounded algebraic-constructor payload inference
    Implementation commit: `b7e93978377240fd2e697224019fb67dad7a17ed`.
    `Some`, `Ok`, and `Err` now retain an inferable payload at
    `src/type-checker.ts:1156-1168` as `Option<T>`, `Result<T, Auto>`, or
    `Result<Auto, E>`. Named aliases are resolved at `:680-697`, flow-call
    results at `:1197`, and `?` propagation at `:1417-1435`; constructor return
    checking and record-payload adoption are at `:1746-1768,1787-1806`. Positive and
    negative coverage is at
    `tests/type-checker-generic-assignment.test.mjs:90-165`; the focused route
    is **32/32**. Unknown constructor payloads still defer conservatively.

[x] Bounded Array list-method return inference
    `first`/`last` now retain `Option<T>`, while `append` retains the receiver
    `Array<T>` at `src/type-checker.ts:1310-1316`. Positive and
    negative assignment coverage is
    `tests/type-checker-generic-assignment.test.mjs:168-198` (11/11 in the
    file); the focused combined route is **34/34**. The last full package run
    before the Set slice was **6,784/6,784** at
    `e67db0ce0`; `map`/`reduce`/`filter` remain deferred:
    callback/closure typing is not admitted by this bounded inference lane.
    Unknown receiver or element types remain conservative rather than being
    invented.

[x] Bounded Map method return inference
    `Map.empty()` returns a bare `Map`, `keys()` returns `Array<K>`,
    `values()` returns `Array<V>`, and persistent `set`/`delete`/`remove`/
    `merge` retain `Map<K,V>` at `src/type-checker.ts:1204-1207,1327-1347`.
    Positive and negative coverage is
    `tests/type-checker-generic-assignment.test.mjs:200-232` (13/13 in the
    file); the focused combined route is **36/36**. The interpreter-backed
    collection route is **115/115**. `entries()` remains `Array<Auto>` because
    its anonymous `{key,value}` record has no admitted named schema here.

[x] Bounded Set method return inference
    `Set.empty()`/`Set.from()` retain a bare `Set`, type-preserving
    `add`/`remove`/`union`/`intersection`/`difference` retain `Set<T>`, and
    `toList`/`toArray` return `Array<T>` at
    `src/type-checker.ts:1209-1211,1349-1361`. Positive and negative coverage
    is `tests/type-checker-generic-assignment.test.mjs:234-266` (**15/15** in
    file); the combined bounded collection route is **132/132**. Callback
    transforms `map`/`filter` remain deferred because their element type is not
    admitted by this lane. The last full package run before this slice was
    **6,784/6,784** at `e67db0ce0`; final assurance remains deferred.

[x] Bounded Array static constructor return inference
    `Array.empty()` retains a bare `Array`, homogeneous `Array.of(...)` retains
    `Array<T>`, and `Array.range(...)` returns `Array<Int>` at
    `src/type-checker.ts:1212-1224`. Positive and negative coverage is
    `tests/type-checker-generic-assignment.test.mjs:268-295` (**17/17** in
    file); the combined bounded collection route is **132/132**. Mixed or
    unknown `Array.of` element types remain `Array<Auto>` and therefore defer.
    The last full package run before this slice was **6,784/6,784** at
    `e67db0ce0`; final assurance remains deferred.

[x] Bounded Option/Result sequence-constructor return inference
    `Option.sequence(Array<Option<T>>)` retains `Option<Array<T>>`, and
    `Result.sequence(Array<Result<T,E>>)` retains `Result<Array<T>,E>` at
    `src/type-checker.ts:1226-1246`, matching the typed runtime combinators at
    `src/stdlib.ts:2567-2601`. Positive and negative coverage is
    `tests/type-checker-generic-assignment.test.mjs:297-327`; the combined
    bounded route is **134/134** and the focused type-checker file is **19/19**.
    Malformed or untyped inputs remain bare `Option`/`Result` and defer rather
    than inventing payloads. Full package and corpus assurance remain deferred.

[x] Bounded Option/Result from-nullable constructor return inference
    `Option.fromNullable(T)` retains `Option<T>`, and
    `Result.fromNullable(T,E)` retains `Result<T,E>` at
    `src/type-checker.ts:1248-1266`, matching the runtime combinators at
    `src/stdlib.ts:314-367,2581-2589,2595-2611`. Positive and negative coverage is
    `tests/type-checker-generic-assignment.test.mjs:329-355`; the combined
    bounded route is **136/136** and the focused type-checker file is **21/21**.
    Unknown value/error types remain bare `Option`/`Result` and defer. Full
    package and corpus assurance remain deferred.

[x] Bounded Result alias and unwrap return inference
    `Result.all(Array<Result<T,E>>)` retains `Result<Array<T>,E>` and
    `Result<T,E>.unwrapOr(...)` retains `T` at `src/type-checker.ts:1231-1246,1385-1391`,
    matching the runtime alias/method contracts at `src/stdlib.ts:342-367,2568-2590`.
    Positive and negative coverage is
    `tests/type-checker-generic-assignment.test.mjs:357-387`; the combined
    bounded route is **138/138** and the focused type-checker file is **23/23**.
    Callback transforms remain deferred; unknown payloads are not invented.
    `Option.zip` infers `Option<ZipPair<T,U>>` (`zipPairRecordType`) matching
    stdlib `{first, second}`. Assigning the Option to a user `Pair` record is
    FUNGI-TYPE-002. Method catalog includes `zip` on Option. Evidence:
    `tests/type-checker-expression-kind-matrix.test.mjs` **6/6**.

[x] Bounded FUNGI-TYPE expression-kind matrix (`tests/type-checker-expression-kind-matrix.test.mjs`, **6/6**):
    admitted literals/idents/arithmetic/match/`unwrapOr`; TYPE-002 known mismatch;
    TYPE-004 Int+String; TYPE-007 arity; unknown spread-update stays deferred.
    Option.zip is typed (see previous item). Remaining: full unsupported-form inference
    still returns unknown at `inferType` default (`type-checker.ts:1870`).
[ ] FUNGI-TYPE-005..007 — operator, call-site, and return-type mismatch checking
    FUNGI-TYPE-005 is implemented for inferrable call arguments and FUNGI-TYPE-007
    is implemented for argument count. Remaining work is complete operator and
    return-type coverage across unsupported expression forms; it still depends on
    the unresolved inference cases above. Source:
    `src/type-checker.ts:1746-1828` (return consumer) and
    `:1874-1954` (call consumer), with `:1054-1556` as the inference boundary.
    Unsupported expression forms remain
    unknown and are intentionally refused/deferred. Clearance requires the
    expression-kind matrix plus positive and negative tests at one exact head.
    Regressions: tests/type-checker-phase11-wave2.test.mjs and
    tests/type-checker-generic-assignment.test.mjs.

[x] FUNGI-VALUESTATE-008 / FUNGI-TIER-001 — warn in dev/check mode
    Implemented and focused-tested: boundary-input violations and under-declared
    flow tiers are warnings in development/check mode and errors in production.
    Source: src/value-state-checker.ts:2181-2193 and 2613-2617;
    tier implementation: src/effect-checker.ts:1384-1404; tests:
    tests/rd-0120-governed-flow-valuestate.test.mjs and
    tests/tier-floor-fungi-tier-001.test.mjs.

[x] WAT emitter — C02 Decimal host ABI and capture-free map/filter (RD-1276)
    Decimal is an i32 host handle (`__decimal_*`), never f64.
    Named unary `map`/`filter` emit `$fungi_array_*` helpers. `reduce` and
    Decimal division remain `(unreachable)`. Evidence:
    `tests/wat-c02-decimal-hof.test.mjs` and `tests/wat-decimal-decline.test.mjs`.

[x] C19-A Stage-B type-code identity (`RD-1288`)
    Owner: `galerina-core-compiler`.
    Contract: `fungi.compiler.stage-b-parity.v1` length-prefixed SHA-256 of
    sorted `{stage,code}` atoms. `uniqueStageBAtoms` is host vs
    `src/self-hosted/type-checker.fungi` `checkFlows` identity for
    `FUNGI-TYPE-001`/`004`/`008`. Parse/lex codes are not type-stage.
    Bag digest remains host-deterministic and multiplicity-sensitive.
    This is not WASM byte-parity.
    Evidence: `tests/stage-b-parity.test.mjs` **11/11**.
    Residual: effect/governance code identity, remaining type codes, and
    parser→GIR→WAT→WASM byte-parity.

[x] C19-B stdlib JSON governed codec (`RD-1289`)
    Owner: `galerina-data-json` with compiler integration in this package.
    Contract: `Json.parse()` returns closed `fungi.json.value.v1`
    (`null|bool|string|int|array|object`), never `any`. Duplicate keys,
    IEEE numbers, `-0`, and unbounded memory refuse. Taint is preserved
    on the value; encode of protected/redacted/secure/float/Decimal
    refuses. Compiler `json.decode` / `Json.parse` / `json.encode` consume
    the codec.
    Evidence: `packages-ts/galerina-data-json/tests/json-contracts.test.mjs`
    **33/33**; `tests/json-c19b-codec.test.mjs` **8/8**.
    Residual: JSON fractions are not Decimal; compiler JSON null still
    maps to `FUNGI_NONE`.

[x] C19-C injected crypto-provider boundary (`RD-1290`)
    Owner: `galerina-core-security`; compiler owns `StdlibContext.cryptoProvider`.
    Contract: Password/BCrypt/Argon2 call `invokeCryptoProvider`. Absent,
    throwing, malformed, and wrong-schema providers refuse closed.
    `stdlib.ts` does not import `bcryptjs` or `argon2`.
    Evidence: core-security **19/19**; `tests/crypto-c19c-provider.test.mjs`
    **4/4**. Residual: node adapter lazy-loads KDF only when invoked.
```

## Post-v1 (owner-gated)

```text
[ ] DSS.wasm real supervisor (#102–106) — kernel-bypass / in-WASM isolation
[ ] Stage-B self-hosting — bootstrap fixpoint (parser→GIR→WAT→WASM round-trip)
[ ] LSP (Language Server Protocol) — diagnostics on save
[ ] Int64 / UInt64 full compiler gate lift (currently owner-gated, one line)
```
