# Galerina — Runtime and Component Structure

Mermaid diagrams showing the full package layout, compiler pipeline, execution tiers, and self-hosted runtime.

---

## 1. Full Package Ecosystem

```mermaid
graph TD
    subgraph CORE["Core Language"]
        CC["galerina-core-compiler\nlexer · parser · type-checker\nvalue-state · effect · governance\nGIR emitter · WAT emitter"]
        CR["galerina-core-runtime\nexecution contracts · WASI boundaries"]
        CS["galerina-core-security\ntaint profiles · redaction · OWASP"]
        CE["galerina-core-economics\nCostGraph · ValueGraph · breach-risk"]
        CLI["galerina-core-cli\ncheck · build · diff"]
    end

    subgraph LOGIC["Logic + Compute"]
        CL["galerina-core-logic\nTri · Decision · RiskLevel"]
        CV["galerina-core-vector\nVector · Matrix · Tensor"]
        CMP["galerina-core-compute\ntarget planning · selection"]
        NET["galerina-core-network\nHTTP · sockets · SSRF guard"]
    end

    subgraph DATA["Data Packages"]
        DB["galerina-db-*\npostgres · mysql · sqlite\nfirestore · opensearch"]
        DAT["galerina-data-*\njson · query · pipeline\nmodel · search · reports"]
    end

    subgraph TARGETS["Execution Targets"]
        TC["galerina-target-cpu\nx86-64 · ARM · RISC-V"]
        TW["galerina-target-wasm\nbrowser · edge · serverless"]
        TG["galerina-target-gpu\nCUDA · ROCm (post-v1)"]
        TN["galerina-target-native\nnative binary output"]
        TP["galerina-target-photonic\noptical compute (research)"]
        TAI["galerina-target-ai-accelerator\nTPU · Gaudi · Trainium (post-v1)"]
    end

    subgraph FRAMEWORK["Framework Layer"]
        FA["galerina-framework-api-server\nHTTP transport · route manifests"]
        FK["galerina-framework-app-kernel\nauth · rate limits · jobs"]
        FW["galerina-web-*\nrouter · render · state · events"]
    end

    subgraph DEVTOOLS["DevTools"]
        DS["galerina-devtools-security\nrunSecurityAudit · PCI DSS 4.0.1"]
        DN["galerina-devtools-naming\nLLN-NAMING-001..005"]
        DC["galerina-devtools-context\ncontext receipts · --summary"]
        DI["galerina-devtools-intelligence\nBM25 hybrid search"]
        DP["galerina-devtools-provenance\ndata lineage · W3C PROV-JSON"]
        DPCI["galerina-devtools-pci\nPCI DSS 4.0.1 audit"]
        DB2["galerina-devtools-benchmarks\n23 benchmarks · compare"]
    end

    subgraph EXT["Extension Packages"]
        EV["galerina-ext-secrets-vault\nHashiCorp Vault · dual-token rotation"]
        EP["galerina-ext-proof-snarkjs\nGroth16 Phase 1 prover"]
    end

    CC --> CR
    CC --> CS
    CC --> CE
    CLI --> CC
    CMP --> TC & TW & TG & TP & TAI
    FA --> CC
    FK --> FA

    style CORE fill:#0a1a3a,color:#fff
    style LOGIC fill:#0a2a1a,color:#fff
    style DATA fill:#1a1a0a,color:#fff
    style TARGETS fill:#2a0a1a,color:#fff
    style FRAMEWORK fill:#1a2a2a,color:#fff
    style DEVTOOLS fill:#2a1a0a,color:#fff
    style EXT fill:#1a0a2a,color:#fff
```

---

## 2. Compiler Pipeline (Stage A)

```mermaid
flowchart LR
    SRC([".spore source"]) --> LEX

    subgraph STATIC["Static Analysis Pipeline"]
        LEX["Lexer\nLLN-LEX-001..006\nTokenStream"]
        PAR["Parser\nAST · FlowDecl\ncontract blocks\nfor/match/record"]
        SYM["Symbol Resolver\nLLN-NAME-001..003"]
        TYP["Type Checker\nLLN-TYPE-001..023\nAuto deferral"]
        VSC["Value-State Checker\nLLN-VALUESTATE/TAINT\nLLN-SECRET-001..003\nsource_from · list/record taint"]
        EFF["Effect Checker\nLLN-EFFECT-001..005\ndeny-by-default"]
        GOV["Governance Verifier\nLLN-GOV-001..020\nLLN-TERM-001\nProofGraph\nEpilogueReceipt\nLiabilityProfile"]
    end

    subgraph EMIT["Code Generation"]
        GIR["GIR Emitter\nGoverned IR\nfield·arrlit·reclit\nmatche·arm ops"]
        WAT["WAT Emitter\ni32 arithmetic\nif/else·while·locals\nPhase 27 complete"]
        ASM["WAT Assembler\nwabt → .wasm binary"]
    end

    subgraph RUNTIME["Tiered Runtime"]
        CACHE["① Cache tier\nLRU warm path"]
        BCODE["② Bytecode VM\nInt32Array · 14.3×"]
        SYNC["③ Sync fast-path\n14× tree-walker"]
        WASM_R["④ WASM\n4.0B/s arithmetic"]
        TREE["⑤ Tree-walker\nfull AST eval"]
    end

    LEX --> PAR --> SYM --> TYP --> VSC --> EFF --> GOV
    GOV --> GIR --> WAT --> ASM
    GIR --> CACHE & BCODE & SYNC & WASM_R & TREE

    style STATIC fill:#0a1a3a,color:#fff
    style EMIT fill:#0a2a1a,color:#fff
    style RUNTIME fill:#1a0a2a,color:#fff
```

---

## 3. Stage B — Self-Hosted Runtime (100% complete)

```mermaid
graph TD
    subgraph SELFHOSTED["Stage B — 8 self-hosted .spore modules"]
        L["lexer.spore\nTokenises .spore source\nAll keywords + literals"]
        P["parser.spore\nparseFlows · parseMatchArms\nparseForLoop · parseRecordLiteral\ncross-module import skip"]
        TC2["type-checker.spore\nFlow body type checking\nLLN-TYPE subset"]
        EC["effect-checker.spore\nEffect validation\ndeny-by-default enforcement"]
        GV["governance-verifier.spore\ncontract block validation\nProofGraph per flow"]
        GE["gir-emitter.spore\nAST → GIR ops\nfield·arrlit·reclit·matche·arm\nname2 binding for destructure"]
        RT["runtime.spore\nexecGIRBody · evalGIRExpr\nRtValue{Int·Bool·String·tag·record·list}\nRunResult{retVal·auditLog}\nAppend · count · get · length\ncontains · toStr · unwrapOr\nmatch Some(x) destructuring\nfor range + iterator loops\nobservable effects (AuditLog.write)"]
        CAP["compiler.capabilities.spore\nCapability declarations\ncompiler + user-runtime domains"]
    end

    subgraph FLOW["Self-hosted execution flow"]
        IN[".spore source string"] --> L
        L -->|"token stream"| P
        P -->|"ParseResult{flows, imports}"| TC2
        TC2 --> EC --> GV
        GV -->|"verified flows"| GE
        GE -->|"flow table (GIR)"| RT
        RT -->|"RunResult{retVal, auditLog}"| OUT["Result + audit trail"]
    end

    subgraph GATE["R6 Conformance Gate\n21 bootstrap tests — Stage A == Stage B"]
        G1["r6-001 classify → strings + Result"]
        G2["r6-002 distanceSq → records + fields"]
        G3["r6-003 listLen → arrays + .count()"]
        G4["r6-004 recordAmount → effects + AuditLog"]
        G5["r6-005 nameOf → match + Option"]
        GW["Widening tests:\nlist.append · Some(x) destructuring\nString.length · Int.toStr · unwrapOr\nfor range/iterator · cross-module imports"]
    end

    style SELFHOSTED fill:#0a2a0a,color:#fff
    style FLOW fill:#0a0a2a,color:#fff
    style GATE fill:#1a1a0a,color:#fff
```

---

## 4. Execution Tier Selection

```mermaid
flowchart TD
    INVOKE["Flow invocation\nexecuteFlow(name, args, ast)"] --> Q1{Pure flow?}

    Q1 -->|"yes"| Q2{Same args\nbefore?}
    Q1 -->|"no (effects)"| SYNC_P["Sync fast-path\nor bytecode VM"]

    Q2 -->|"yes — cache hit"| CACHE_HIT["① Cache tier\nReturn cached result\n~0 overhead"]
    Q2 -->|"no — cache miss"| Q3{WASM compiled?}

    Q3 -->|"yes"| WASM_EXEC["④ WASM tier\n4.0B/s arithmetic\n588× vs governed tree-walker\nwasmtime or WebAssembly.instantiate"]
    Q3 -->|"no"| Q4{Bytecode VM\neligible?}

    Q4 -->|"yes"| BCODE_EXEC["② Bytecode VM\nInt32Array opcodes\n14.3× vs tree-walker"]
    Q4 -->|"no"| Q5{Sync\nfast-path?}

    Q5 -->|"yes"| SYNC_EXEC["③ Sync fast-path\n14× vs tree-walker\npure flows only"]
    Q5 -->|"no"| TREE_EXEC["⑤ Tree-walker\nFull AST evaluation\ngoverned effects\nfallback path"]

    CACHE_HIT --> RES
    WASM_EXEC --> RES
    BCODE_EXEC --> RES
    SYNC_EXEC --> RES
    SYNC_P --> RES
    TREE_EXEC --> RES

    RES["RunResult{\n  retVal: RtValue\n  auditLog: AuditEntry[]\n  executionTier: tier\n  fallbackReason?: string\n}"]

    style CACHE_HIT fill:#1a4a1a,color:#fff
    style WASM_EXEC fill:#4a1a4a,color:#fff
    style BCODE_EXEC fill:#1a1a4a,color:#fff
    style SYNC_EXEC fill:#1a3a3a,color:#fff
    style TREE_EXEC fill:#3a1a1a,color:#fff
```

---

## 5. Contract Block Architecture

```mermaid
graph LR
    subgraph SYNTAX["Source syntax\ncontract {} is OUTSIDE body"]
        SIG["flow qualifier name(params) -> ReturnType"]
        CB["contract {\n  intent { } \n  effects { }\n  authority { }\n  privacy { }\n  limits { }\n  economics { }\n  secrets { }\n  epilogue { }\n  audit { }\n  types { }\n  request { }\n  response { }\n  targets { }\n  cyber_physical_hardening { }\n  liability { }\n  invariant { }\n}"]
        BODY["{ flow body }"]
    end

    subgraph AUTO["Auto-by-default blocks\n(omit = runtime handles it)"]
        A1["economics {} → ValueGraph auto-infer"]
        A2["secrets {} → .env auto-mode"]
        A3["epilogue {} → sha256_seal from ValueGraph"]
        A4["liability {} → NEVER write manually\nauto-calc from breach-risk matrix"]
        A5["cyber_physical_hardening {} → runtime selects tier\nfrom ValueGraph risk classification"]
    end

    subgraph ENFORCED["Compiler-enforced at build time"]
        E1["effects → SPORE-EFFECT-001..005\ndeny-by-default: omit = pure"]
        E2["intent → SPORE-GOV-010\nrequired for secure flows"]
        E3["secrets → SPORE-SECRET-001/002/003\nsink guards: log/serialize/network"]
        E4["invariant → SPORE-TERM-001\ndecreases annotation"]
        E5["cyber_physical_hardening → SPORE-GOV-017\nvalidates values + warns if low-risk"]
    end

    SIG --> CB --> BODY
    CB --> AUTO
    CB --> ENFORCED

    style AUTO fill:#1a2a0a,color:#fff
    style ENFORCED fill:#0a1a3a,color:#fff
```

---

## 6. Data Flow Through the Governed Pipeline

```mermaid
sequenceDiagram
    participant DEV as Developer
    participant CC as galerina-core-compiler
    participant GV as Governance Verifier
    participant PG as ProofGraph
    participant RT as Runtime
    participant AL as AuditLog

    DEV->>CC: galerina build program.spore
    CC->>CC: lex → parse → typecheck
    CC->>CC: value-state: taint + secret sink guards
    CC->>CC: effect check: deny-by-default
    CC->>GV: verifyGovernance(ast, flows, effects)
    GV->>PG: buildProofGraph per flow
    PG-->>GV: ProofGraph{obligations, EpilogueReceipt, LiabilityProfile}
    GV-->>CC: GovernanceVerifyResult{diagnostics, proofGraphs}
    CC->>CC: emitGIR → WAT → wabt → .wasm
    CC-->>DEV: build/program.wasm (+ .lmanifest planned)

    DEV->>RT: galerina run program.spore --invoke main
    RT->>RT: compile to WASM (same pipeline)
    RT->>RT: WebAssembly.instantiate
    RT->>RT: ① pre-invariant check (if declared)
    RT->>RT: execute flow body
    RT->>AL: AuditLog.write("...") → auditLog[]
    RT->>RT: ② post-invariant check (if declared)
    RT-->>DEV: RunResult{retVal: 5050, auditLog: [...]}
```

---

## 7. DevTools Ecosystem

```mermaid
graph TD
    subgraph INPUT["Input: auth-service corpus (31 .spore files)"]
        F["examples/auth-service/*.spore"]
    end

    subgraph TOOLS["DevTools packages"]
        SEC["galerina-devtools-security\nrunSecurityAudit\nLLN-TAINT/GATE/SECRET/GOV/PCI\n34 tests"]
        NAM["galerina-devtools-naming\nLLN-NAMING-001..005\nabbreviation detection\n15 tests"]
        CTX["galerina-devtools-context\nContext receipts\n51-97% token reduction\n35 tests"]
        INT["galerina-devtools-intelligence\nBM25 hybrid search\n81 flows indexed\n16 tests"]
        PRV["galerina-devtools-provenance\ndata lineage graph\nW3C PROV-JSON output\n20 tests"]
        PCI["galerina-devtools-pci\nPCI DSS 4.0.1\nLLN-PCI-001..010\n12 tests"]
        BEN["galerina-devtools-benchmarks\n23 benchmarks\ngoverned vs Rust/WASM/Node/Python"]
    end

    subgraph OUTPUT["Outputs"]
        O1["Security findings + GOV diagnostics"]
        O2["Naming violations (abbreviations)"]
        O3["Minimal AI context window (--summary)"]
        O4["Code search results (BM25 ranked)"]
        O5["Data lineage: source→gate→sink"]
        O6["PCI DSS compliance evidence"]
        O7["Benchmark comparison table\n+ Benchmark Glossary"]
    end

    F --> SEC --> O1
    F --> NAM --> O2
    F --> CTX --> O3
    F --> INT --> O4
    F --> PRV --> O5
    F --> PCI --> O6
    F --> BEN --> O7

    style INPUT fill:#1a1a2a,color:#fff
    style TOOLS fill:#0a2a1a,color:#fff
    style OUTPUT fill:#2a1a0a,color:#fff
```
