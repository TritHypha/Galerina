# Changelog

All notable changes to Galerina are documented here (format: [Keep a Changelog](https://keepachangelog.com)).

## [Unreleased]

### Changed
- **Source-file rename `.spore` → `.fungi` and diagnostic codes `SPORE-` → `FUNGI-` completed and
  verified.** The extension/code sweep was finished and audited end-to-end (full suite 60/60 · 5,903
  tests · 0 fail; graph, security audit `0 critical/0 high`, benchmarks all green).
- **Knowledge Base relocated out of the repo** to the sibling `../ZTF-Knowledge-Bases` (pre-release IP
  protection). Tooling that reads the KB (`galerina-devtools-kb-graph`, the compiler
  diagnostic-namespace conformance test) now resolves it via the **`GALERINA_KB_DIR`** environment
  variable (default order: env → in-repo `docs/Knowledge-Bases/` if restored → sibling KB).

### Fixed
- **Residual `LogicN` → `Galerina` stragglers** the earlier brand sweep missed — 91 occurrences across
  self-hosted `.fungi` sources, benchmark/example flows, and `devtools-project-graph` package metadata
  (including the stale `@logicn/…` package identity in its lockfile). Fixed via an auditable codemod.
- **Lexer generated-comment marker `//spore:` → `//fungi:`** — it was a char-by-char `peek()` check
  invisible to a text find-replace.
- **`app-kernel` `LogicnKernelRequest/Response` → `GalerinaKernelRequest/Response`** — the file carried a
  legitimate NUL delimiter byte, so the codemod had skipped it as "binary".
- **Restored the root-signed `greeting.lmanifest.json`** fixture whose signature the migration had
  invalidated (the offline `ab46f4c7` re-sign to make it fungi-consistent is still owed).

### Added
- **`scripts/brand-audit.mjs`** — a binary-safe residual-brand + `@`-scope auditor. It reads every file
  as raw bytes (so NUL-containing files that `grep`/`ripgrep` skip as "binary" are still scanned) and
  substring-matches every form (`@spore`, `/spore`, `sporeX`, case variants), enumerating every
  `@`-scope so a broken/renamed import scope cannot hide. CI-usable (exit 1 on any straggler).
- **`scripts/fix-logicn-brand.mjs`** — the paired auditable codemod (dry-run by default).

## [1.0.0-beta.2] - 2026-06-24

This beta packages the Stage-A production-hardened compiler/runtime, the governed admission
border, and the post-quantum signing surfaces for full testing. Scope is stated honestly in
[KNOWN-ISSUES.md](KNOWN-ISSUES.md): what is production-grade (compiler, governance verifier,
admission gate) vs simulated/aspirational (DSS.wasm isolation, photonic Tower, Stage-B
self-hosting beyond `tokenize`). 60/60 packages · 6,064 tests · 0 fail.

### Added (this beta)
- **Opt-in hybrid Ed25519+ML-DSA-65 `.lmanifest` signing (#34).** `galerina build`/`verify`/`run`
  sign + verify the admission manifest with a post-quantum hybrid signature when a `keygen --hybrid`
  key is present; `GALERINA_MANIFEST_PROFILE=certified` mandates it (fail-secure, no PQ downgrade).
  Default Ed25519 path unchanged.
- **`@galerina/ext-secrets-tmf` — env.tmf sealed secrets.** Optional, encrypted-at-rest replacement
  for plaintext `.env`, edited through a governed in-memory-only CLI (never argv, no temp file,
  no `$EDITOR`, in-arena zero-wipe). Thin orchestration over `@galerina/ext-tmf`; not auto-loaded.
- **`FUNGI-TIER-001` flow-kind tier floor (production-gated).** A `flow`/`guarded` flow that touches a
  secure-tier effect (egress, secret/crypto material, high-consequence sink) is floored to `secure`
  in `build-production`/`build-deterministic`, closing the under-declared-tier fail-open.
- **`scripts/component-health.mjs`** — per-component v1.0 readiness matrix (test/build/orphan gaps).

### Security — Phase 1 Audit (2026-06-16): 8/8 criticals + highs cleared
Adversarial Gate-6 audit (37 raised · 32 confirmed). **All Critical and High findings are patched and
verified**; the codebase is in a fail-closed, deterministic state — 48/48 packages · 4,481 tests · 0 fail at that snapshot.

- **VSC-001 (critical)** — closed a taint-escape: `isGovernedSink` is now a strict superset of the
  authoritative `SINK_REQUIREMENTS`, so unsafe/tainted values no longer reach `response.body` /
  `ai.remoteInference` / `network.outbound` / `log.write` / bare `database.write` unchecked.
- **VSC-002 (high)** — `trap` is no longer a taint declassifier; declassification requires an explicit
  `validate.*` / `sanitize.*` / `redact()` gate.
- **VSC-003 (high)** — member-expression receivers (`client.http.post`, `ctx.secrets.get`, …) no longer
  bypass the secret/egress recognizers.
- **GOV-001 (high)** — ratified `permitted_effects` K3 semantics (omitted = neutral · empty `{}` = deny-all
  · populated = allow-listed) and strict `conforms_to` resolution (fatal in production/deterministic).
- **GOV-003 (high)** — denied response fields can no longer leak via member/positional returns.
- **CRYPTO-001 (high)** — certified mode mandates the ML-DSA public key (no silent post-quantum downgrade).
- **CRYPTO-002 (medium)** — the Tier-3 ffsim admission gate requires hybrid attestation by default.
- **CRYPTO-003 (high)** — the governance signature now binds the tamper-evidence fields (`hardwareSeal`,
  `epilogueReceipt`, `liabilityProfile`, `physicalHardeningTier`).

### Added
- **`galerina deps --write` source-writer (R&D 0045 — Phase 3c; owner: silently overwrite).** `rewriteGeneratedComments(source, genByFlow)`
  injects/refreshes each flow's `//fungi:` block **in the source file**, directly above its declaration —
  **silently overwriting** the old contiguous `//fungi:` block (the generated tier is machine-owned). It
  touches **only `//fungi:` lines** — never a human `//` line, a `contract`, or any code (a human line that
  merely contains "USEDBY" is left alone); idempotent; preserves indentation; fail-closed (refuses a file
  with parse errors). So `galerina deps app.fungi --write` graphs the app and writes the `//fungi: USES`/`USEDBY`/
  `IMPACT`/`COMPLEXITY` comments back automatically. The rewrite logic is a unit-tested pure function. +6 tests.
- **Stable-Dependencies enforcement — `FUNGI-ARCH-002` (R&D 0045 — Phase 3b; owner: always a hard error).** A
  cross-flow governance pass: a **more-stable** flow (lower `contract.architecture` volatility) may **not**
  depend on a **more-volatile** one (the Stable Dependencies Principle). E.g. a `volatility: LOW` flow that
  calls a `volatility: HIGH` flow → **`FUNGI-ARCH-002` error in every profile**. Edges are the *observed*
  flow→flow call graph (you can't lie about what you call); only flows that **declare** a volatility
  participate (an undeclared flow is "unknown" → not checked → no false positives). Modeled on the existing
  `FUNGI-GOV-013` caller/callee-property twin. +5 tests; registered in `compiler-diagnostics.md`.
- **`contract.architecture { volatility, depends_on }` parse-only block (R&D 0045 — Phase 2b).** A new
  contract sub-block declaring **volatility-based decomposition** metadata: `volatility: LOW|MED|HIGH` (how
  often the flow changes) + `depends_on [FlowA, FlowB]` (the *authored* dependency intent, which the observed
  `//fungi:USES` should agree with). Parse-only — registered as a contract section so it parses clean — plus a
  **fail-closed value check** (`FUNGI-ARCH-001`): an invalid volatility token is a hard error; a missing
  volatility is allowed (treated as the most-volatile HIGH downstream). The Stable-Dependencies enforcement
  (a LOW flow may not depend on a HIGH one) is a later, gated pass. +4 tests.
- **`//fungi:USES` / `//fungi:USEDBY` / `//fungi:IMPACT` flow-dependency analysis + `galerina deps` (R&D 0045 — Phase 2).**
  `analyzeFlowDependencies(ast)` computes the observed flow→flow call graph per flow: **USES** (upstream
  callees), **USEDBY** (direct callers / "dependants"), and **IMPACT** (transitive downstream blast-radius;
  `0` ⟹ *safe to delete*). `renderDependencyComments()` emits the canonical generated-tier lines
  (`//fungi:USES: (2) …`, `//fungi:USEDBY: (1) …`, `//fungi:IMPACT: (0) — safe to delete`). New read-only CLI:
  `galerina deps <file.fungi> [--flow <name>]` graphs the app and prints the `//fungi:` comments (no source mutation
  yet — the source-writer is a later phase, gated on the human-edit decision). Naming standardised on the
  clean antonym pair **USES** (what I call) / **USEDBY** (who calls me); recursion/self-calls and
  stdlib/method calls are excluded. +8 tests.
- **`//fungi:COMPLEXITY` cyclomatic complexity metric (R&D 0045 — Phase 1c).** `cyclomaticComplexity(node)` =
  `1 + decision points` (if / while / for-each / match arm / `&&` / `||`). `renderComplexityComment()` emits
  `//fungi:COMPLEXITY: N` and stays **silent at complexity 1** (the owner's low-noise rule). Surfaced per flow in
  `galerina deps`. +6 tests.
- **`FUNGI-HW-004` UnknownHardwareTarget — yellow hardware uncertainty (R&D 0045 — Phase 1b).** A `contract.hardware`
  target that is not in `HARDWARE_TRUST_PROFILES` was previously a **silent `continue`** (the uncertainty was
  invisible). It now emits a **yellow `FUNGI-HW-004` warning** (K3 INDETERMINATE — *not* a red error): the build
  proceeds, and the warning clears automatically once the target becomes registered (a driver/profile update
  collapses the uncertainty into verification). Advisory only — a target *declaration* is not a governed sink
  (where INDETERMINATE must still fail closed). +3 tests; registered in `compiler-diagnostics.md`.
- **`//fungi:` generated-comment tier (R&D 0045, structured-engineering metadata — Phase 1a).** The lexer now
  emits a distinct **`genComment`** token for `//fungi:…` lines, scanned *before* the plain `//` branch so a
  generated line can never collapse into a human `comment` (fail-closed tier separation). This completes the
  four-tier comment model: `//` human · **`//fungi:` CLI/compiler-generated** (DependsOn/Complexity/Volatility/WARN,
  tooling-owned + overwritable) · `///` doc · `;;` system/governance (manifest-bound). The parser skips
  `genComment` (preserved in the token stream for tooling), exactly as it skips the other comment kinds.
  Purely additive tokenisation — no grammar or runtime-semantics change. +6 lexer tests. Keystone for the
  upcoming `//fungi:DependsOn`/`//fungi:Complexity` auto-generation and the `graph --target` report.
- **AOT #2 — branch-folding + dead-arm DCE (WAT emitter).** `foldToBool` folds a compile-time-constant
  `if` condition (bool literals, `!`, const-int comparisons, const `&&`/`||`) to true/false; the emitter
  then emits **only the taken arm inline** — the dead arm and its locals are never emitted. Semantics-
  preserving (the interpreter evaluates the same constant condition and takes the same branch → WASM ≡
  interpreter, 0014-safe); arms emit with explicit `(return …)` so they're valid at any position. A
  non-constant condition is unaffected. Composes on AOT #1 (a folded-constant comparison now drives the
  fold). +6 tests (drop-then / drop-else / `!`+`&&` / no-else fall-through / dynamic-unchanged / fidelity).
- **DbC output post-conditions (0040 / #70).** `invariant { ensure result … }` now expresses an OUTPUT
  post-condition over a flow's return value, enforced **fail-closed at the single flow exit**: a return
  value violating the post-condition becomes a `runtimeError` (`FUNGI-INV-002`) and never escapes — the same
  posture as the i32 trap (Fork-A) / 0038. The magic `result` symbol is recognised by the symbol resolver
  and governance verifier *only* inside an `ensure` (so `ensure result <= 100` is accepted; genuine typos
  still raise `FUNGI-NAME-001`/`FUNGI-INV-004`). Enforcement holds on **every interpreter tier**: the async
  tree-walker enforces the gate, and a post-condition flow is excluded from the bytecode VM / sync
  fast-path / ExecutionGraph fast-path / pure-flow cache (which return early and would bypass it). On the
  WASM tier, a **straight-line** post-condition flow now emits a **single-exit gate** (`$galerina_result`):
  the tail value is captured, each output post-condition is checked against it, and a violation **traps
  (`unreachable`)** — so output post-conditions are enforced on WASM too, byte-matched to the interpreter
  (WASM ≡ interp at the boundary). A flow with a **nested/early return** still declines to the governed
  interpreter (the early-return → `br $galerina_exit` rewrite is the remaining follow-up). Previously
  `ensure result …` was hard-*rejected* at compile time — a fail-safe capability gap, now a working
  fail-closed contract. +14 tests (interpreter fail-closed, three-tier fast-path fidelity, two exported-tier
  bypass fixes, and WASM single-exit enforcement). Follow-ups: early-return single-exit rewrite, Z3 discharge
  of decidable bounds (0024 track), `result.taint`/`result.cardinality` as compile-time governance metadata.
- **AOT #1 — constant-expression folding (WAT emitter).** `foldToInt` now folds `const <op> const` arithmetic
  at build time via the *checked* i32 ops → emits `(i32.const RESULT)` instead of the runtime op (also lets
  `static NAME = 60*24` resolve). Trap-safe: an overflowing/div0 constant is NOT folded (the runtime checked
  op is emitted → fails closed, Fork-A=TRAP/0038-consistent). Fidelity-safe: folding is semantics-preserving,
  so WASM ≡ interpreter (tests in `wat-const-fold.test.mjs`). The R&D-0036 #1 lever (proven 1.64× / 7.1×
  code-size); branch-folding + dead-arm DCE (#2) is the next step.
- **`for x in list where <guard> { … }` — filtered iteration.** `where` is promoted from reserved-future
  to an active keyword: the loop body runs only for items where the guard is truthy. Works in the
  interpreter and lowers to WASM as an `(if guard (then body))` inside the for-in loop (the index always
  advances), byte-identical across tiers (tests in `where-filter.test.mjs`). Guard form — no masking, so no
  K3 trit-0 aliasing concern.
- **#128(b) / GAP-4 — `forEachStmt` (for-in) WASM lowering.** A `for x in list { … }` loop now lowers to
  a real counted WASM loop over the host array bridge (`__array_length` / `__array_get`) instead of the
  fail-closed `(unreachable)` trap. Executes correctly and is byte-identical to the reference tree-walker
  (tests in `wat-forin-execution.test.mjs`).
- **Fail-closed invariant test suite** (`fail-closed-invariant.test.mjs`) — a global guard that a checked-op
  trap (overflow, div0) must fail the flow closed regardless of where its result lands (return / dead
  binding / discarded-in-loop / nested in an expression). All 6 cases pass (permanent guards) after the
  0038 fix below.

### Fixed
- **i32-overflow fail-OPEN (soundness, R&D 0038).** A checked-op trap (`IntegerOverflow` / `DivisionByZero`)
  became a `runtimeError` *value*; assigned to a never-returned binding (or nested past one, e.g.
  `(seed*K)+C`) it was silently discarded and the flow completed with a wrong result (arithmetic-threshold
  returned `63248` while the WASM tier trapped). Now a checked trap propagates out of binding/expression
  statements and through binary operands (incl. `&&`/`||`), failing the flow closed regardless of placement
  — completing Fork-A=TRAP. Narrowed to checked traps so soft runtimeErrors (e.g. a missing field) keep
  value semantics. compute-mix + arithmetic-threshold now fail closed fast (0–4 ms, clean `IntegerOverflow`).
- **Pure-flow sync fast-path infinite loop (R&D 0032 completion).** `tryPureFlowSync` had no loop cap and
  swallowed non-`SyncReturn` throws → a post-Fork-A overflow spun forever (hung the compute-mix benchmark
  ~31 min). Now bails to the bounded trapping tree-walker + caps the loop.
- **Bytecode VM** — added a loop-iteration cap (`runBytecode` back-edge counting) and re-keyed the
  compile cache from flow-name-only to per-AST (`WeakMap<AstNode,…>`), removing a wrong-result hazard.
- `crypto-ops` benchmark now measures ML-DSA-65 + hybrid Ed25519+ML-DSA-65 signatures (PQ-tax visibility).
- KB §7a — ratified domain-guard `permitted_effects` state machine.
- Roadmap #125–#128 (CLI governed-run, parser-level bitwise hint, shape-stable governance objects, GAP-4).

### Deferred to Phase 2
Semantic mediums (VSC-004/005, GOV-002/004), CRYPTO-004 (versioning), engine integration, and the safe
maintenance subset (REDUN-001, STYLE/INFO). See `docs/Knowledge-Bases/galerina-build-roadmap.md`.
