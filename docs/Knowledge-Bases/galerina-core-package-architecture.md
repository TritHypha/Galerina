# Galerina Core Package Architecture

**Status:** Reference diagram  
**Scope:** `galerina-core*` package family — logical dependency graph and runtime data flow  
**Note:** Workspace package links (`@galerina/*` imports across packages) are pending; packages are currently standalone with types duplicated locally. These diagrams show the intended logical relationships.

---

## 1. Package Dependency Graph

The `galerina-core*` packages form a layered dependency graph: foundation types at the base, security and config above them, execution and I/O governance above those, and the CLI as the top-level orchestrator.

```mermaid
graph TB
    subgraph Foundation["Foundation Layer"]
        core["@galerina/core\nAST node kinds · AstNodeKind\nCompilerDiagnostic · SafetyLevel\nCONTENT_BLOCK_TYPES\ncreateDiagnostic · hasErrors · filterBySeverity"]
        logic["@galerina/core-logic\nTriState (v0.2 discriminated union)\nDecision (4-state: allow/deny/review/unknown)\nBoolBoundary · OmniState (8-value)\nsub-paths: /tri /decision /bool-boundary /omni"]
    end

    subgraph SecurityLayer["Security Layer"]
        security["@galerina/core-security\nSecureStringReference · redactText\nPermissionModel · decidePermission\nCryptographicPolicy · SecurityReport\nLLN-SECURITY-001…"]
    end

    subgraph ConfigLayer["Config & Environment Layer"]
        config["@galerina/core-config\nProjectConfig · EnvironmentConfig\nRuntimeConfigHandoff · loadConfigFromObjects\nVault (SPORE-VAULT-001–005)\ndefaultEnvironmentPolicy · GALERINA_ENVIRONMENT_MODES"]
    end

    subgraph IOLayer["I/O Governance Layer"]
        network["@galerina/core-network\nNetworkPolicy · defineNetworkPolicy\nNetworkReport · selectNetworkBackend\nDEFAULT_TLS_POLICY\nWebhookVerificationConfig (specified)"]
        reports["@galerina/core-reports\nAll LoReport kinds (14 canonical)\ncreateBuildReport · createSecurityReport\ncreateProcessingReport · createFlowTraceReport\nserializeReportJson · validateLoReport"]
    end

    subgraph ExecutionLayer["Execution Layer"]
        runtime["@galerina/core-runtime\nRuntimeContext · createRuntimeContext\nRuntimeEffectPolicy · decideRuntimeEffect\nDEFAULT_RUNTIME_EFFECT_POLICY\ncreateRuntimeReport"]
        compute["@galerina/core-compute\nRuntimeTarget (11 values)\nGpuPlan · OpticalPlan · WasmTarget\nCompatibilityReport\n(stubs — Phase 3)"]
        tasks["@galerina/core-tasks\nAsync task / worker model\nStructured Await contracts\n(stubs — Phase 3)"]
    end

    subgraph CompilerLayer["Compiler Layer"]
        compiler["@galerina/core-compiler\nvalidateCoreSyntaxSafety\ncheckBindingReassignment · checkReadonlyMutation\nvalidateIntentEffects (stub)\nLLN-SYNTAX/BINDING/PIPELINE/INTENT/BLOCK/STRING/CHAR/BYTE-*"]
    end

    subgraph CLILayer["CLI Layer"]
        cli["@galerina/core-cli\ngalerina check · galerina fmt · galerina build\ngalerina verify · galerina deploy\ngalerina explain · galerina plan"]
    end

    core --> compiler
    core --> security
    core --> logic
    logic --> compiler
    logic --> runtime
    security --> config
    security --> network
    security --> runtime
    config --> runtime
    config --> compiler
    network --> runtime
    reports --> runtime
    reports --> compiler
    reports --> cli
    runtime --> compute
    runtime --> tasks
    compute --> cli
    tasks --> cli
    compiler --> cli
```

---

## 2. Runtime Data Flow

The current execution model is Node-hosted. Galerina governs execution through declared effects, capability checks, and policy enforcement — it does not bypass the host.

```mermaid
flowchart TD
    HTTP["HTTP Request\n(external — untrusted)"]
    Node["Node.js Server\n(host transport)"]
    APIServer["galerina-framework-api-server\n(route dispatch, boundary check)"]
    Config["@galerina/core-config\nRuntime Policy Config\nVault · EnvironmentConfig"]
    Security["@galerina/core-security\nPermission check\nSecret redaction"]
    Compiler["@galerina/core-compiler\nSyntax safety · Intent check\n14-pass pipeline → Governed IR"]
    Runtime["@galerina/core-runtime\nEffect gating · RuntimeContext\nCapability locking"]
    Logic["@galerina/core-logic\nTriState · Decision · BoolBoundary\nOmni conversion"]
    Network["@galerina/core-network\nOutbound policy check\nTLS/SSRF enforcement"]
    Reports["@galerina/core-reports\nAudit events · FlowTrace\nSecurityReport · RuntimeReport"]
    Response["HTTP Response\n(safe, typed, redacted)"]

    HTTP --> Node
    Node --> APIServer
    APIServer --> Config
    Config --> Security
    Security --> Runtime
    Runtime --> Compiler
    Compiler --> Logic
    Runtime --> Network
    Runtime --> Reports
    Logic --> Runtime
    Network --> Reports
    Runtime --> Response
    Reports --> Response
```

---

## 3. Compile-Time Pipeline Flow

Source `.spore` files pass through the prototype parser (Stage 1, in `@galerina/core/compiler/`) and the compiler contract layer (`@galerina/core-compiler`). The 14-pass pipeline produces Governed IR and a RuntimeManifest.

```mermaid
flowchart LR
    Source[".spore source files"]
    Lexer["Pass 1–2: Lexer / Tokeniser\n(galerina-core/compiler/galerina.js)"]
    Parser["Pass 3: Parser\n→ AST (AstNodeKind)"]
    TypeCheck["Pass 4: Type checker\nBinding safety · SPORE-SYNTAX/BINDING"]
    SafetyCheck["Pass 5–6: Safety checker\nSyntax safety · Content blocks\nvalidateCoreSyntaxSafety()"]
    IntentCheck["Pass 7–8: Intent / Effect checker\nvalidateIntentEffects() — stub\nLLN-INTENT-001–005"]
    PipelineCheck["Pass 9: Pipeline checker\ncheckMethodChain() — stub\nLLN-PIPELINE-001–005"]
    BoundaryCheck["Pass 10–11: Boundary / Effect checker\nLLN-BOUNDARY-* / SPORE-EFFECT-*\n(specified — not yet implemented)"]
    ManifestGen["Pass 12–14: Optimise · Source map · Manifest\nRuntimeManifest + ManifestIntegrity\n(specified — not yet implemented)"]
    GovernedIR["Governed IR\n+ RuntimeManifest"]
    Diagnostics["Compiler diagnostics\n(SPORE-* codes emitted per pass)"]

    Source --> Lexer --> Parser --> TypeCheck --> SafetyCheck
    SafetyCheck --> IntentCheck --> PipelineCheck --> BoundaryCheck --> ManifestGen
    ManifestGen --> GovernedIR
    TypeCheck --> Diagnostics
    SafetyCheck --> Diagnostics
    IntentCheck --> Diagnostics
    PipelineCheck --> Diagnostics
    BoundaryCheck --> Diagnostics
    ManifestGen --> Diagnostics
```

---

## 4. Diagnostic Code Namespaces

Each package owns a diagnostic namespace. The `SPORE-*` format is `SPORE-SERIES-NNN`.

| Prefix | Owner | Count | Status |
|---|---|---|---|
| `SPORE-SYNTAX-*` | `@galerina/core-compiler` | 002 | Implemented |
| `SPORE-BINDING-*` | `@galerina/core-compiler` | 004 | Implemented |
| `SPORE-PIPELINE-*` | `@galerina/core-compiler` | 005 | Constants only (stubs) |
| `SPORE-INTENT-*` | `@galerina/core-compiler` | 005 | Constants only (stubs) |
| `SPORE-BLOCK-*` | `@galerina/core-compiler` | 004 | Implemented |
| `SPORE-STRING-*` | `@galerina/core-compiler` | 004 | Constants only |
| `SPORE-CHAR-*` | `@galerina/core-compiler` | 004 | Constants only |
| `SPORE-BYTE-*` | `@galerina/core-compiler` | 005 | Constants only |
| `SPORE-EFFECT-*` | `@galerina/core-compiler` | 004 | Specified — not implemented |
| `SPORE-BOUNDARY-*` | `@galerina/core-compiler` | 004 | Specified — not implemented |
| `SPORE-TRI-*` | `@galerina/core-logic` | 005 | Implemented |
| `SPORE-DECISION-*` | `@galerina/core-logic` | 005 | Implemented |
| `SPORE-BOOL-BOUNDARY-*` | `@galerina/core-logic` | 005 | Implemented |
| `SPORE-OMNI-*` | `@galerina/core-logic` | 005 | Implemented |
| `SPORE-CONFIG-*` | `@galerina/core-config` | 027 | Partially implemented |
| `SPORE-VAULT-*` | `@galerina/core-config` | 005 | Implemented |
| `SPORE-NETWORK-*` | `@galerina/core-network` | 008 | Specified — not implemented |
| `SPORE-WASM-*` | `@galerina/core-compute` | 004 | Specified — not implemented |
| `SPORE-COMPAT-*` | `@galerina/core-compute` | 004 | Specified — not implemented |
| `SPORE-REPORT-*` | `@galerina/core-reports` | 005 | Specified — not implemented |
| `SPORE-PROOF-*` | `@galerina/core-reports` | 005 | Specified — not implemented |
| `SPORE-DENIAL-*` | `@galerina/core-reports` | 004 | Specified — not implemented |
| `SPORE-EVIDENCE-*` | `@galerina/core-reports` | 004 | Specified — not implemented |
| `Galerina_RUNTIME_*` | `@galerina/core-runtime` | (open) | Implemented |
| `Galerina_SECURITY_*` | `@galerina/core-security` | (open) | Implemented |
| `Galerina_NETWORK_*` | `@galerina/core-network` | (open) | Implemented |
| `Galerina_REPORT_*` | `@galerina/core-reports` | (open) | Implemented |
| `Galerina_COMPILER_*` | `@galerina/core-compiler` | (open) | Implemented (scanner codes) |

---

## 5. Test Coverage Summary (2026-05-26)

| Package | Tests | Status |
|---|---|---|
| `@galerina/core` | 9 | All passing |
| `@galerina/core-compiler` | 20 | All passing |
| `@galerina/core-logic` | 51 | All passing |
| `@galerina/core-config` | 17 | All passing |
| `@galerina/core-security` | 14 | All passing |
| `@galerina/core-network` | 12 | All passing |
| `@galerina/core-reports` | 15 | All passing |
| `@galerina/core-runtime` | 12 | All passing |
| `@galerina/core-compute` | 5 | All passing |
| `@galerina/core-cli` | 6 | All passing |
| **Total** | **161** | **All passing** |
