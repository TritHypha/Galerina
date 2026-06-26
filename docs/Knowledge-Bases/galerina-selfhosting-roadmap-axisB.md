# Galerina — Self-Hosting Roadmap (Axis B → 100%)

**Created 2026-06-02. Canonical roadmap for the "Runtime written in Galerina" goal.**

This roadmap tracks **Axis B only** — engine self-hosting, the actual meaning of
"100% runtime in Galerina" (see `galerina-runtime-status-SOT.md` §2 for why Axis A
service facades do NOT count toward this number). For *current* verified state,
the **SOT wins**; this doc is the plan, the SOT is the measurement. Supersedes the
single-number framing in `galerina-runtime-in-galerina-roadmap.md`,
`galerina-roadmap-phases-41-60.md`, `galerina-roadmap-next10-phases.md`.

## Ground rules (non-negotiable)

1. **Done = executing tests pass, not parse-clean.** Every milestone below has an
   exit criterion expressed as executing `.test.mjs` assertions that run the `.spore`
   through the production interpreter. Parse-clean is necessary, never sufficient.
2. **Real subset before breadth.** Each file first reaches a genuine working subset
   of common cases with regression tests, then widens. No stubbed control flow
   pretending to work.
3. **Close every phase with the cadence ritual:** run the graph + full `npm test`,
   then update the SOT, this roadmap, and the audit doc *immediately* — before the
   phase is called done. (See `feedback-phase-workflow-cadence` rule.)
4. **The external-blocked tail (§Tail) is NOT countable in-repo.** No percentage
   credit until the backend/hardware actually executes.

## Current baseline (from SOT, verified 2026-06-02)

Axis B ≈ **75–80%** (was 35–40% at the start of 2026-06-02). **M-A/M-B/M-C all reached
for the integer/Bool flow subset:** a recursive multi-flow `.spore` program now runs
**source → lex → parse → type/effect/govern → emit GIR → execute** entirely in Galerina
(`self-hosted-pipeline.test.mjs`: `fib(15)=610`, `sumTo(100)=5050`, nested cross-flow calls).
The path from here to 100% is **widening, not new stages** — see "Path to 100%" below.
**No stubs remain** — every stage runs a real subset.

| Stage | File | State | Next move |
|---|---|---|---|
| Lex | `lexer.spore` | partial (near-full, S5 ✓) | string/char literals + line/block comments done; remaining: doc-comment split, escape normalization |
| Parse | `parser.spore` | partial (M-A ✓) | **one `parseFlows` → full flow AST**: header + `returnExpr` (back-compat) + `body: Array<Stmt>` (recursive-descent exprs + statements + nested if/while). body-parser folded in 2026-06-02; remaining: `else`, more statement forms |
| Type-check | `type-checker.spore` | partial | widen: more expr kinds, Array element types, call-result types |
| Effect-check | `effect-checker.spore` | partial | widen: effect inference from real bodies (currently reads a `usedEffects` field) |
| Govern | `governance-verifier.spore` | partial | widen beyond the 3 current checks |
| Emit | `gir-emitter.spore` | partial (M-B ✓) | flat-returnExpr GIR + **`emitBodyGIR`**: full body AST → GIR (const/load/binop/call + store/ret/branch/loop/eval, recursing into if/while); remaining: lower into the existing TS GIR consumer, more constructs |
| Execute | `runtime.spore` | partial (S7 ✓ subset) | tier dispatcher + **`runGIRBody`** GIR interpreter (const/load/binop/unop + store/ret/branch/loop, env); runs real bodies. Remaining: cross-flow `call` execution (recursion) |
| Capabilities | `compiler.capabilities.spore` | functional | maintain |

## Phased plan to Axis B = 100%

Phases are **independent where possible** (each file can advance alone), but the
*integration* milestones (M-A/M-B/M-C) require multiple files. Order below is the
recommended sequence; the user steers one file at a time.

### Phase S1 — Type-checker real subset  *(stub → partial)*  ✅ DONE 2026-06-02
- **Delivered:** `type-checker.spore` validates: known return/param types (SPORE-TYPE-001),
  return-expr type == declared return type (SPORE-TYPE-002), arithmetic operands must be
  Int (SPORE-TYPE-004). Infers literal/param/compare/arith expr types via `inferExprType`.
  Codes aligned to Stage-A canonical meanings (001=UnknownType, 002=TypeMismatch,
  004=InvalidBinaryOperation).
- **Exit met:** `tests/self-hosted-type-checker.test.mjs` — 13 executing tests, all pass;
  each diagnostic class fires; clean program → 0 diagnostics; aggregate + empty-list cases.
- **Widen next:** Array element types, call-result types, more expression kinds; the 003
  (InvalidNominalConversion) class.

### Phase S2 — Effect-checker real subset  *(stub → partial)*  ✅ DONE 2026-06-02
- **Delivered:** `effect-checker.spore` reconciles a per-flow `usedEffects` array against
  declared `effects`: SPORE-EFFECT-001 (undeclared use), 004 (unknown effect, declared or
  used), 003 (pure flow using any effect) + retained 005 advisory (secure/guarded with no
  effects). New `contains` helper; codes aligned to the Stage-A effect checker.
- **Exit met:** `tests/self-hosted-effect-checker.test.mjs` — 12 executing tests, all pass.
- **Widen next:** infer `usedEffects` from real parsed bodies instead of taking it as input;
  declared-but-unused warning.

### Phase S3 — GIR emitter real subset  *(stub → partial)*  ✅ DONE 2026-06-02
- **Delivered:** `gir-emitter.spore` emits a per-flow expression GIR node (`emitExprGIR`):
  literal→`const`, param→`load`, arith→`add` (Int), compare→`cmp` (Bool), else `unknown`,
  carrying result + operand types — alongside the existing flow-decl nodes. `GIRModule`
  gained an `exprNodes` array.
- **Exit met:** `tests/self-hosted-gir-emitter.test.mjs` — 13 executing tests, all pass.
- **Widen next:** body statements (let/mut/while/if/match), nested expression trees, flow-call
  lowering — the full subset the bytecode VM consumes.
- **NOTE (interpreter bug found AND fixed 2026-06-02):** string-literal `match` patterns
  (`"literal" => ...`) didn't dispatch — `matchPattern` compared the unquoted runtime string
  against the still-quoted pattern token. Fixed in `interpreter.ts` (strip pattern quotes);
  regression test in `tests/interpreter.test.mjs`. See AI-ergonomics A2b. The gir-emitter
  keeps its chained `if` dispatch (works fine; no churn needed).

### Phase S4 — Govern widening  *(partial → fuller)*
- **Deliver:** add the next governance checks (capability declaration, profile
  conformance) beyond the current VAL-001/002 + GOV-002.
- **Exit:** extend `self-hosted-governance-verifier.test.mjs` with the new codes.

### Phase S5 — Lexer completion  *(partial → functional)*
- **Deliver:** full token stream — integer/string literals, all operators, punctuation,
  comments — not just words + keywords.
- **Exit:** `tests/self-hosted-lexer.test.mjs` tokenizes a representative `.spore` to the
  exact token sequence the TS lexer produces.

### Phase S6 — Parser bodies  *(partial → functional)*
- **Deliver:** parse flow *bodies*: statements (`let`/`mut`/assign/`while`/`if`/`match`/
  `return`) and expressions, producing the AST shape the rest of the pipeline expects.
- **Exit:** `tests/self-hosted-parser.test.mjs` — parsed AST matches the TS parser's AST
  for a representative flow body.

### Phase S7 — Runtime completion  *(partial → functional)* — **LANDED 2026-06-02**
- **Deliver:** execute the GIR/AST beyond tier *selection* — actually evaluate the
  subset end-to-end.
- **Delivered:** `runtime.spore` `runGIRBody` — a tree-walking GIR interpreter
  (const/load/binop/unop + store/ret/branch/loop, assoc-list env). Runs real arithmetic,
  branches, loops, and reads params from the env.
- **Exit met:** `tests/self-hosted-runtime.test.mjs` GIR-evaluator block (hand-built GIR)
  + `self-hosted-pipeline.test.mjs` executes source→…→run (e.g. `sum 1..5=15`).
- **Remaining:** cross-flow `call` evaluation (recursion / inter-flow), then widen.

### Integration milestones
- **M-A (≈60%):** lexer + parser self-host a real flow end-to-end (source → AST) with
  the TS stages taking over after. Exit: a `.spore` flow lexed+parsed entirely by `.spore`.
  **ACHIEVED 2026-06-02:** `body-parser.spore` folded into `parser.spore` — one `parseFlows`
  call yields a complete flow AST (header + full `body: Array<Stmt>`), proven on a real
  `fib` body via `self-hosted-parser.test.mjs` + `self-hosted-pipeline.test.mjs`. Residual
  polish: `else` branches, remaining statement forms.
- **M-B (≈80%):** type-check + effect-check + govern + emit all run on that AST in
  Galerina. Exit: a flow validated + emitted to GIR entirely by `.spore`. **Mostly landed
  2026-06-02:** `self-hosted-pipeline.test.mjs` runs `type-checker` (`checkFlowBodies`),
  `effect-checker` (`checkBodyEffects`), and `governance-verifier` (`checkBodyGovernance`)
  on the real parsed body AST, AND `gir-emitter` (`emitBodyGIR`) lowers that body to a
  GIR statement/expression tree (`self-hosted-pipeline.test.mjs` lowers a real `fib`
  body). **M-B (≈80%) reached for the supported subset** — all four validate/emit stages
  run on the parsed AST in Galerina. Residual: lower GIR into the existing TS GIR consumer.
- **M-C (100% Axis B):** runtime executes the emitted GIR — Galerina compiles and runs
  Galerina with zero TS in the pipeline for the supported subset. Exit: bootstrap test
  compiles+runs a sample `.spore` through all 8 self-hosted files, asserting output.
  **REACHED FOR THE SUBSET 2026-06-02:** `self-hosted-pipeline.test.mjs` runs source → lex →
  parse → emit GIR → `buildFlowTable` → **`runProgram`** entirely in Galerina, executing a
  recursive MULTI-FLOW program (`fib(15)=610`, `sumTo(100)=5050`, nested `inc(inc(x))`).
  Cross-flow calls + recursion work via a flow table. Remaining to *full* M-C: widen the
  runtime value model (strings/records/lists) and runtime effect handling beyond Int/Bool.

## Path to 100% (78% → 100%) — widening, not new stages

**Definition of 100% (engine self-hosting).** All 8 self-hosted files execute a `.spore`
program **source → run, entirely in Galerina**, at **feature parity with Stage A for the
governed-flow subset** (Int/Bool/String/record/list values, the statement/expression
grammar Stage A accepts, declared effects observed at runtime), proven by a **bootstrap
conformance test** that runs a representative `.spore` through all 8 files and asserts the
output equals Stage A's. *Not* in scope for "100% Axis B": full-language exotica the
Stage-A compiler itself doesn't yet support, and the external §Tail below. Each phase
exit = executing `.test.mjs` assertions (parse-clean never counts).

Phases are mostly **independent** and can run in parallel (separate files); the bootstrap
test (R6) is the final barrier. Rough % weights in brackets.

### R1 — Runtime value model: strings  *(≈78 → 84%)* — **DONE 2026-06-02**
> `runtime.spore` `RtValue` widened: String + tagged Result/Option (`Ok`/`Err`/`Some`/`None`)
> constructors; string concat/eq. Also fixed a real parser bug — `parseFlows` didn't skip
> newlines before `contract`/body, so every multi-line governed flow parsed an empty body.
> **R6-001 `classify` now passes the full-parity conformance gate** (Stage A == Stage B):
> `tests/self-hosted-bootstrap.test.mjs`.
- **Why:** the GIR interpreter's `RtValue` is Int/Bool only; string-returning flows can be
  parsed/checked/emitted but not executed.
- **Deliver:** `RtValue` gains a String case; `runtime.spore` handles `const` String,
  string `eq`/`ne`/`concat`/`length`; gir-emitter lowers string ops; `lowerExpr` carries
  string literals through.
- **Exit:** `self-hosted-pipeline.test.mjs` runs a flow that builds + returns a String
  (e.g. `"a" + "b"` → `"ab"`, `.length`), value matches Stage A.

### R2 — Runtime value model: records + lists  *(≈84 → 90%)*
- **Deliver:** `RtValue` record/list cases; record construction + field access; list
  build/`get`/`count`; the interpreter walks nested values. Self-referential values already
  proven to work in the engine.
- **Exit:** a flow constructing a record and a list, reading a field / indexing, runs e2e
  with Stage-A-matching output.

### R3 — Env scaling + perf  *(≈90 → 92%)*
- **Why:** `envLookup` is O(n) over an append-only list → O(n²) per loop (review:
  `sumTo` 1..800 ≈ 216s). Blocks realistic programs.
- **Deliver:** a scoped/map-backed environment (overwrite-in-place on reassignment;
  push/pop scope on call/block).
- **Exit:** a perf test — `sumTo(2000)` / a 10k-iteration loop completes in well under a
  second; correctness unchanged. (Folds in the perf concern raised in the benchmarks review.)

### R4 — Runtime effects  *(≈92 → 95%)*
- **Why:** declared effects are *checked* (effect-checker) but not *executed* — a `call`
  to an effectful builtin (e.g. `auditWrite`) evaluates to 0.
- **Deliver:** the interpreter records/dispatches declared effects observably (an audit
  event list, a deterministic effect log) so an effectful flow's effects are visible in the
  run; unresolved-call returns a diagnostic instead of silent 0.
- **Exit:** a flow that performs `auditWrite(...)` produces an observable effect entry; an
  unknown callee is flagged, not silently 0.

### R5 — Grammar completeness  *(≈95 → 98%)*
- **Deliver:** the remaining Stage-A flow-subset constructs the parser doesn't yet handle —
  `match` expr/stmt, `for`, member/method access (`x.f()`), and any statement form still
  missing — plus the downstream consumers (type/effect/govern/emit/run) widened to them.
- **Exit:** representative flows using each new construct parse, check, emit, and run e2e.

### R6 — Bootstrap conformance gate  *(≈98 → 100%)*
> **Corpus authored 2026-06-02** (5/5 Stage-A ACCEPT): `tests/r6-corpus/r6-001..005-*.spore`,
> spec + coverage matrix in `galerina-r6-bootstrap-corpus.md`. Gate = **full parity** (value +
> diagnostics + governance/effects) Stage A == Stage B, via `tests/self-hosted-bootstrap.test.mjs`.
> R6-001→R1, R6-002/003→R2, R6-004→R4, R6-005→R5.
- **Deliver:** one test that takes a representative governed `.spore` flow, runs it through
  **all 8 self-hosted files** (lex → parse → type/effect/govern → emit GIR → run) AND
  through Stage A, and asserts identical output + identical diagnostics.
- **Exit:** `tests/self-hosted-bootstrap.test.mjs` green over a small corpus of flows that
  exercise R1–R5. This is the **100% Axis-B marker**: Galerina compiles and runs Galerina at
  parity with the TS reference for the supported subset, with zero TS in the pipeline.

**Sequencing note:** R1→R2→R3 are the value-model spine (do in order; R3 unblocks larger
programs). R4 and R5 are independent and can parallelize. R6 is last and gates the number.
The honest in-repo ceiling is **R6 = 100% Axis B**; everything past that is the §Tail.

## §Tail — cannot be truthfully completed in-repo

These need external infra/hardware and must NOT be counted toward 100% until the
backend executes (SOT §5):
- Deno Deploy serving real production traffic
- Intel SGX/TXT hardware attestation in the ProofGraph
- Lean4 formal-verification export / DO-178C certificate
- ML-DSA-65 (FIPS 204) post-quantum signing (library-dependent)
- A production deployment with real external traffic

In-repo honest ceiling: **Axis B 100% (M-C) + Axis A broad coverage + WASM hot-path** —
all verifiable by tests here.

## Progress log

| Date | Phase | Change | Axis B |
|---|---|---|---|
| 2026-06-02 | — | governance-verifier stub→partial (3 checks, 9 tests) | 25–30% |
| 2026-06-02 | S1 | type-checker stub→partial (001/002/004, 13 tests) | 30–35% |
| 2026-06-02 | S2+S3 | effect-checker (12 tests) + gir-emitter (13 tests) stub→partial, parallel; **0 stubs remain** | 35–40% |
| 2026-06-02 | fix | interpreter: string-literal `match` arms now dispatch (was: all fell through to `_`); +3 regression tests | 35–40% |
| 2026-06-02 | S5+S6 | lexer +string/char/comments (32 tests), parser +decomposed `returnExpr` (44 tests), parallel; **M-A/M-B bridge proven** via `self-hosted-pipeline.test.mjs` (source→lexer→parser→type-checker e2e) | 40–45% |
| 2026-06-02 | fix | lexer `SPORE-LEX-001` generic-depth false positive on `a < b` fixed (reset at newline/`{`/`}`/`;`); +4 regression tests; reverted 7 operand-swap workarounds in `lexer.spore` | 40–45% |
| 2026-06-02 | M-A | `body-parser.spore`: full recursive-descent `Stmt`/`Expr` AST for flow bodies (expr precedence + statements), parallel workers merged; parses real `fib` body in Galerina; 17 tests | 45–50% |
| 2026-06-02 | M-A done + M-B | folded body-parser into `parser.spore` (one `parseFlows` → full AST); added `checkFlowBodies` to type-checker (body SPORE-TYPE-001/002); pipeline proves source→parser→body type-check e2e (parallel workers) | 48–52% |
| 2026-06-02 | M-B | effect-checker `checkBodyEffects` (derives effects from body calls → SPORE-EFFECT-001/003) + governance `checkBodyGovernance` (secure flow must audit in body → SPORE-VAL-001), parallel workers; pipeline runs type+effect+govern on the real body AST | 52–55% |
| 2026-06-02 | M-B ✓ | gir-emitter `emitBodyGIR` lowers the full body AST → GIR (expr+stmt halves, parallel workers, merged); pipeline lowers a real `fib` body. **All 4 validate/emit stages now consume the AST** — M-B ≈80% reached | 55–60% |
| 2026-06-02 | grammar | parser widened: logical `and`/`or`, unary `!`/`-`, **if/else** (`Stmt.elseBody`); 12 tests. (single pass — worktree isolation unavailable: session root ≠ git repo) | 57–62% |
| 2026-06-02 | downstream | new forms wired into all consumers (3 parallel workers): gir-emitter unary→`unop` + else lowering; type/effect/govern recurse `elseBody`; pipeline proves else-branch effect/audit handling | 60–63% |
| 2026-06-02 | S7 ✓ | `runtime.spore` GIR interpreter (`runGIRBody`): const/load/binop/unop + store/ret/branch/loop + env. **Full pipeline executes source→…→run in Galerina** (`sum 1..5=15`, etc.). Remaining: cross-flow `call` | 68–72% |
| 2026-06-02 | **M-C ✓** | cross-flow `call` execution: `runtime.spore` `runProgram` + flow table; `gir-emitter` `buildFlowTable` (parallel workers). **Recursive multi-flow Galerina runs in Galerina**: `fib(15)=610`, `sumTo(100)=5050`, `twice(40)=42` end-to-end | 75–80% |
| 2026-06-03 | **R6 ✓ 100% (subset)** | Full parity gate `self-hosted-bootstrap.test.mjs` (11 tests, all 5 corpus flows). R1–R5 widening: member access, array literals, generic type params, match/Option (`parseMatchArms` isolated flow), `None` as zero-arity constructor, records+lists+strings in runtime, epilogue guard (GOV-015/016), secret sink trilogy. Scope bug root-caused: `while COND { p=p+1 }` inside `parseStmt` silently doesn't update `p` — fixed by delegating to a standalone flow | 90% |
| 2026-06-02 | **R1 ✓** | `runtime.spore` strings + Result/Option constructors; fixed parser newline-skip (multi-line governed flows were parsing empty bodies). R6-001 `classify` passes full-parity Stage A==Stage B gate (`self-hosted-bootstrap.test.mjs`) | 80–84% |
