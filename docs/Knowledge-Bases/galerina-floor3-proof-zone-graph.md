# Galerina — Floor 3: Proof Zone Graph

**Version:** 1.0 (2026-06-04)  
**Status:** Visual specification for task #69 (floor-specific dev tools graphs).  
**Purpose:** Shows every component on Floor 3 (the Proof Zone), their relationships, and — critically — the **Invariant Proof Path** that bridges Floor 3 to Floor 2 (Containment Zone).

---

## The Invariant Bridge (Focus View)

This is the most important new path added by DRCM Phase 2. It shows how `ensure expr` travels from source code to either a static proof (zero WAT) or a hardware trap gate.

```mermaid
flowchart TD
    subgraph SOURCE["Developer / AI Author Zone (Penthouse)"]
        A["contract { invariant { ensure amount > 0; } }"]
    end

    subgraph FLOOR3["Floor 3 — Proof Zone (Compiler Pipeline)"]
        B["Parser\n• consume 'ensure'\n• emit ensureDecl AST node\n• expression as child"]
        C["Governance Verifier\n• scan invariant:block\n• build paramNames set"]

        C --> D{"Symbol\nResolution"}
        D -- "name NOT in params" --> E["SPORE-INV-004\nSymbolUnresolved\n❌ HARD ERROR"]
        D -- "name in params or builtin" --> F{"Constant-Fold\nEvaluation"}

        F -- "expr = literal false\ne.g. ensure false;\nensure 1 > 5;" --> G["SPORE-INV-001\nStatically FALSE\n❌ HARD ERROR\n(dead contract)"]
        F -- "expr = literal true\ne.g. ensure 5 > 0;\nensure true;" --> H["statically_verified\n✅ ZERO WAT OVERHEAD\nGoal A confirmed\nProofObligation Tag 403"]
        F -- "expr unknown\ne.g. ensure amount > 0;\n(runtime parameter)" --> I["runtime-precheck\n⚡ WAT GATE PENDING\nProofObligation Tag 403"]

        B --> C
    end

    subgraph FLOOR2["Floor 2 — Containment Zone (WAT Emitter + Runtime)"]
        J["WAT Emitter\nextractInvariantEnsures()\nemitWATFromFlowAST()"]
        K["Pre-condition gate\n(if (i32.eqz EXPR) (then unreachable))\nfires BEFORE body"]
        L["Flow body (single-exit)"]
        M["Post-condition gate\n(if (i32.eqz EXPR) (then unreachable))\nfires AFTER body"]
        N["Wasmtime hardware trap\nunreachable → ud2 on x86_64\natomic — no TOCTOU window"]
    end

    subgraph MANIFEST["Attestation Zone (Floor 4)"]
        O[".lmanifest\nCBOR Tag 403: ProofObligation\nstatically_verified OR runtime-precheck"]
    end

    A --> B
    H --> O
    I --> J
    J --> K --> L --> M
    K --> N
    M --> N
    H -.->|"emitter skips — no gate"|J

    style SOURCE fill:#1a3a5c,color:#fff
    style FLOOR3 fill:#1a5c3a,color:#fff
    style FLOOR2 fill:#5c2a1a,color:#fff
    style MANIFEST fill:#3a1a5c,color:#fff
    style E fill:#8b0000,color:#fff
    style G fill:#8b0000,color:#fff
    style H fill:#006400,color:#fff
    style N fill:#8b4000,color:#fff
```

---

## Complete Floor 3 Component Map

All components currently on Floor 3 (the Proof Zone), their responsibilities, and their inter-dependencies:

```mermaid
graph LR
    subgraph FLOOR3["Floor 3 — Proof Zone"]
        direction TB

        LEX["Lexer\nTokenKind enum\nSymbol/Keyword/Identifier\nOperator/Number/String"]
        PAR["Parser\nAstNode tree\nensureDecl nodes\ncontractDecl dispatch"]
        SYM["Symbol Resolver\nname → scope binding\nparamDecl extraction"]
        TYP["Type Checker\nLLN-TYPE-001..023\nAuto deferral (TYPE-023)\nGeneric type skip"]
        VST["Value-State Checker\nSecureString taint\nLLN-SECRET-001/002/003\nRedact() escape valve"]
        EFF["Effect Checker\nDeny-by-default\nLLN-EFFECT-001..005\nLLN-CAP-001 wildcard ban"]
        GOV["Governance Verifier\n37+ SPORE codes\nProofGraph\nDomain Guard Differential Proof\nInvariant static eval"]
        GIR["GIR Emitter\nGoverned IR\nreclit/matche/arm ops\nWAT module builder"]
        WAT["WAT Emitter\ninvariant gates\nSingle-exit bodies\ni32.eqz + unreachable"]

        LEX --> PAR --> SYM --> TYP --> VST --> EFF --> GOV --> GIR --> WAT
    end

    subgraph PENTHOUSE["Penthouse"]
        SRC[".spore source\ncontract {}\ninvariant {}\nensure expr"]
    end

    subgraph FLOOR4["Floor 4 Attestation"]
        MAN[".lmanifest\nProofGraph\nCBOR Tag 403"]
    end

    subgraph FLOOR2["Floor 2 Containment"]
        WASM["WASM binary\nGates injected\nWasmtime executes"]
    end

    SRC --> LEX
    GOV --> MAN
    WAT --> WASM
```

---

## Invariant Diagnostic Code Map

```
ensure expr;  in  invariant {}  inside  contract {}
        │
        ▼
Governance Verifier checks in order:
        │
        ├─ [1] invariant:block has no ensure children?
        │      → SPORE-INV-003 ⚠️ WARNING (empty block)
        │
        ├─ [2] any identifier in expr not in paramNames?
        │      → SPORE-INV-004 ❌ ERROR (symbol unresolved)
        │        prevents silent (i32.const 0) in WAT
        │
        ├─ [3] constant-fold expr = false?
        │      → SPORE-INV-001 ❌ ERROR (dead contract)
        │        binary never produced
        │
        └─ [4] constant-fold expr = true?
               → statically_verified ✅
               → ProofObligation Tag 403 in .lmanifest
               → WAT emitter emits NOTHING (Goal A)

               constant-fold result = null (unknown)?
               → runtime-precheck ⚡
               → ProofObligation Tag 403 in .lmanifest
               → WAT emitter injects:
                   (if (i32.eqz EXPR) (then unreachable))
                   at function entry (pre) and exit (post)
```

---

## Single-Exit Transformation — Performance Note

**Q: Does single-exit add overhead?**

No. Cranelift JIT eliminates the boilerplate at register allocation time:

```
Before single-exit:              After Cranelift JIT:
─────────────────────            ─────────────────────
local.set $result                (eliminated — value stays in register)
br $exit                         (eliminated — direct jump to post-gate)
...                              (identical to early-return output)
local.get $result                (eliminated — register already holds value)
```

For flows with a single return path (most pure flows), the generated x86_64 assembly from single-exit WAT is **identical** to multi-return WAT. The predictability of the guaranteed post-condition check costs zero on modern CPUs with Cranelift.

The micro-overhead only materialises for flows with 3+ early return paths in deeply nested if/else trees. Even then, it is sub-nanosecond per call — irrelevant compared to the semantic guarantee it provides.

---

## Decimal / Runtime Function Invariants (Phase 3 Strategy)

For invariants that can't be expressed in WAT integer arithmetic (e.g., `ensure decimal.credits == decimal.debits`), the Phase 3 strategy uses an imported helper per the document's "Panic Helper" suggestion:

```wat
;; WASM module import (Phase 3+)
(import "galerina" "check_invariant_fn" (func $check_fn (param i32) (result i32)))

;; Assertion gate
(if (i32.eqz (call $check_fn (local.get $context_ptr))) (then unreachable))
```

The `galerina::check_invariant_fn` host import evaluates the Decimal comparison in the host runtime (where arbitrary-precision is available), returns 1 (pass) or 0 (fail). The WAT stays simple; complexity lives in the host. This keeps the emitter dumb and matches the architecture of WASI imports.

---

## Cross-References

| Topic | Document |
|---|---|
| Full invariant {} implementation | `packages-galerina/galerina-core-compiler/src/governance-verifier.ts` |
| WAT gate injection | `packages-galerina/galerina-core-compiler/src/wat-emitter.ts` |
| DRCM Phase 2 task | `galerina-build-roadmap.md` (#36 ✅) |
| Floor-specific graph tool | Task #69 |
| Platform infographic concept | `galerina-platform-infographic-concept.md` |
| Governed Tower floor definitions | `galerina-platform-infographic-concept.md` |
