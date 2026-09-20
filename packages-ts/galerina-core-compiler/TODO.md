# Galerina Compiler TODO

This file tracks open work for the compiler package. Updated 2026-07 to reflect
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
    numeric widening, recursive generic arguments, and Option<T>.unwrapOr(). The
    remaining gap is full expression-level inference for unsupported or unknown
    forms. Source: src/type-checker.ts:447-531, :1230-1241, and :1861-1919.
    Regressions:
    tests/type-checker.test.mjs, tests/type-checker-phase11-wave2.test.mjs,
    tests/type-checker-record-adoption.test.mjs, and
    tests/type-checker-generic-assignment.test.mjs.

[ ] FUNGI-TYPE-005..007 — operator, call-site, and return-type mismatch checking
    FUNGI-TYPE-005 is implemented for inferrable call arguments and FUNGI-TYPE-007
    is implemented for argument count. Remaining work is complete operator and
    return-type coverage across unsupported expression forms; it still depends on
    the unresolved inference cases above. Source: src/type-checker.ts:1667-1718
    and :1562-1618. Regressions: tests/type-checker-phase11-wave2.test.mjs and
    tests/type-checker-generic-assignment.test.mjs.

[x] FUNGI-VALUESTATE-008 / FUNGI-TIER-001 — warn in dev/check mode
    Implemented and focused-tested: boundary-input violations and under-declared
    flow tiers are warnings in development/check mode and errors in production.
    Source: src/value-state-checker.ts:2181-2193 and 2613-2617;
    tier implementation: src/effect-checker.ts:1384-1404; tests:
    tests/rd-0120-governed-flow-valuestate.test.mjs and
    tests/tier-floor-fungi-tier-001.test.mjs.

[ ] WAT emitter — remaining ~11% unlowered stdlib constructors
    Money currency constructors, Decimal bignum, collection ops (range, map, filter,
    reduce), redact. Each needs a WASM host import stub.

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
