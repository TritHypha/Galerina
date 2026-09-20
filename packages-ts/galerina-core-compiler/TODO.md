# Galerina Compiler TODO

This file tracks open work for the compiler package. Updated 2026-09-20 to reflect
the actual shipped state. Items marked `[x]` are implemented and tested.

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

[ ] WAT emitter — remaining exact unlowered stdlib surfaces
    Money currency constructors, `print`/`println`, `redact`, and `range` are
    already lowered or host-backed at `src/wat-emitter.ts:1198-1258`, with
    host coverage at
    `tests/wat-host-stdlib-stubs-oracle.test.mjs:22-123` and completeness
    coverage at `tests/wat-host-runtime-completeness.test.mjs:27-42`.
    The live blocker is the fail-closed set at `src/wat-emitter.ts:2028-2045`:
    exact Decimal lowering needs a non-f64 representation, while
    `map`/`reduce`/`filter` need a governed closure/callback ABI. Current
    refusal evidence is `tests/wat-decimal-decline.test.mjs:21-40`; do not
    replace these `(unreachable)` refusals with lossy or silent lowering.
    Clearance requires an explicit host/closure contract, interpreter/WAT
    parity, positive and negative tests, and exact-head receipts.

[ ] Stage-B self-hosting WASM byte-parity
    Lexer tokenize + full parser ladder: proven (R3). GIR emitter: proven (R2).
    Remaining: type-checker, effect-checker, governance-verifier (same #100 erasure
    pattern, cleared the same way as the parser and gir-emitter).

[ ] stdlib.json governed codec (galerina-data-json)
    Json.parse() returning a governed JsonValue type (not plain any). Required for
    service flows to exchange JSON without bypassing taint tracking.

[ ] Move argon2 / bcryptjs out of compiler into galerina-core-security
    KDFs with native C bindings do not belong in the TCB. Move Password/BCrypt/Argon2
    stdlib calls to an injected CryptoProvider interface; ship the implementation in
    galerina-core-security.
```

## Post-v1 (owner-gated)

```text
[ ] DSS.wasm real supervisor (#102–106) — kernel-bypass / in-WASM isolation
[ ] Stage-B self-hosting — bootstrap fixpoint (parser→GIR→WAT→WASM round-trip)
[ ] LSP (Language Server Protocol) — diagnostics on save
[ ] Int64 / UInt64 full compiler gate lift (currently owner-gated, one line)
```
