# Structured-Engineering Metadata — Roadmap + %-Shipped Audit (2026-06-19)

Owner vision (R&D 0045): turn passive comments into compiler-maintained architectural metadata so the
"why / how volatile / what it depends on / what breaks if deleted" is machine-kept, not a stale wiki.
This is the hub's **verify-before-build %-audit + phased roadmap**. Companion R&D: `0045` (the design +
5 open decisions), `0046` (type placement: `contract.types{}` vs TS-style, runtime-perf).

## %-Shipped audit (7-agent, source-grounded)
| # | Piece | % shipped | Cost | What already exists (verified) | Net-new |
|---|---|---:|---|---|---|
| A | **`//lln:` generated comment tier** | **60%** | LOW | `//`→`comment`, `///`→`docComment`, `;;`→`govComment` (manifest-wired, `manifest-generator.ts:432`); 4 distinct comment scans in `lexer.ts` | `//lln:` collapses into plain `//` (the `//` scanner swallows `@`). Add a `genComment` token + a `peek(2)==='@'` branch before the `//` branch (~15 ln, additive, fail-closed) |
| B | **Hardware `//lln:WARN` (uncertainty)** | **70%** | LOW | `HARDWARE_TRUST_PROFILES` (~40 targets, `type-registry.ts:455`) wired into the verifier | Unknown hardware target is silently `continue`d (`governance-verifier.ts:1662`) → make it a yellow `LLN-HW-004` warning (advisory, non-gating) |
| C | **Cyclomatic complexity metric** | **35%** | LOW | the AST `walk` visitor pattern; effect/value-state summaries per flow | No complexity emitter → a counting visitor `1 + count(if/while/for/match/&&/‖)` |
| D | **`graph --target X` report** | **35%** | MED | `reach.ts` BFS/reachability primitives (exported, unwired); `graph` CLI + `readGeneratedGraph()` | A `--target` branch: downstream=reachable, upstream=reverse-reachable, safe-to-delete; **read-only** first |
| E | **Per-flow dependency edges** | **30%** | MED | graph node/edge schema + transport fully built; `depends_on` declared; package-level edges emitted | per-FLOW/per-symbol `uses` edges are declared-but-NEVER-emitted (header-only regex today) |
| F | **`contract.architecture{volatility,depends_on}` + Stable-Deps** | **8%** | MED | the sub-block dispatch idiom (~30 siblings, `parser.ts`); generic `parseContractSubBlock`; **`LLN-GOV-013` is the exact structural twin** of the Stable-Deps rule (caller/callee property-conflict walk, `governance-verifier.ts:1524`) | a parse stanza (fail-closed unknown volatility) + a cross-flow `verifyArchitectureStability` pass (`LLN-ARCH-001`) modeled on GOV-013 |
| G | **Volatility scoring** | **20%** | MED | `topoSort` over the dep DAG | no git-churn tooling; a graph-DEPTH proxy (longest-path) is the fail-safe first cut; git-churn gated on history availability (#149 unpushed) |

**Headline:** the foundation is further along than it looks — the `;;`/`//`/`///` comment kinds, the hardware
registry, the graph reachability primitives, and an *exact enforcement twin* (GOV-013) all exist. The work is
mostly **additive wiring**, not new subsystems.

## Phased roadmap (KB-first · fail-closed · LOW-cost-additive first · enforcement LAST)

**Phase 1 — LOW-cost, additive, fail-closed foundation — ✅ DONE (2026-06-19):**
- **1a. `//lln:` generated comment tier** ✅ `1804557` — `genComment` token, ordered before `//`, fail-closed.
- **1b. Hardware `//lln:WARN`** ✅ `5d8d611` — unknown-target → yellow `LLN-HW-004`.
- **1c. Cyclomatic-complexity metric** ✅ `45bc0a5` — `//lln:COMPLEXITY` (silent at 1), surfaced in `logicn deps`.

**Phase 2 — MEDIUM, read-only / parse-only — IN PROGRESS:**
- **2a. dependency report** ✅ `1a57761` — shipped as `logicn deps <file> [--flow X]`: `//lln:USES` (upstream) /
  `//lln:USEDBY` (downstream "dependants") / `//lln:IMPACT` (transitive blast-radius; 0 = safe-to-delete), from the
  AST call graph. (The graph-package `graph --target` variant can follow; `deps` already delivers the value.)
- **2b. `contract.architecture {}` parse-only** ✅ `<this commit>` — registered contract section + fail-closed
  `LLN-ARCH-001` volatility value check; the *authored* `depends_on`/`volatility` (vs observed `//lln:USES`).
- **2c. graph-depth volatility proxy** (no git) — the fail-safe first volatility number. ⏳ NEXT.

**Phase 3 — enforcement + generation:**
- **3a. Per-flow `depends_on`/`uses` graph edges** (close the 30%→full dep data in the project-graph). ⏳
  (NB: `logicn deps` already derives flow→flow edges directly from the AST, so the report doesn't need this.)
- **3b. Stable-Dependencies enforcement** ✅ `<this commit>` — `LLN-ARCH-002`, always a hard error (decision #5),
  on the observed call graph; only declared-volatility flows participate.
- **3c. SOURCE WRITER** ✅ — `logicn deps --write` (rewriteGeneratedComments): silently overwrites only `//lln:` lines, idempotent, fail-closed; unit-tested
  (decision #3, done).
- **3e. WHOLE-APP WRITER** ✅ `<this commit>` — `logicn deps --all [dir] [--write]` refreshes `//lln:` across EVERY `.lln`
  in the app. Uses a NEW **cross-file** analyzer `analyzeProgramFlowDependencies` (merges all files' flow nodes into one
  synthetic program AST → USES/USEDBY/IMPACT span files). This closes a fail-OPEN gap: a per-file loop would print
  `IMPACT: (0) — safe to delete` for a flow called from ANOTHER file. A duplicate flow name across files UNIONS callers
  (fail-SAFE: only over-counts USEDBY, never a false safe-to-delete). +3 cross-file tests; CLI smoke verified end-to-end.
- **3f. BUILD AUTO-REFRESH** ✅ `<this commit>` — `logicn build --package <dir>` refreshes the package's `//lln:` blocks by
  DEFAULT (owner: "it does it anyway"); `--no-refresh` opts out for reproducible CI. Scoped to the package's own `src` tree
  (`dirname(entry)`), never the wider repo; only `//lln:` lines touched. (Single-file `logicn build <file>` stays pure —
  it's used on fixtures/examples in the test suite; only `--package` refreshes.)
- **3d. git-churn volatility** — gated on history availability (decision #4 open); the graph-depth proxy (2c) is the fallback.

**Phase 4 — polish:** state-mutability metric (`//lln:Mutates`), central Governance-Registry index (decision #2),
pre-commit hook ✅ template shipped at `scripts/hooks/pre-commit` (the "keep build pure + use a hook" alternative —
runs `logicn deps --all --write` + re-stages changed `.lln`; set `LOGICN_APP_DIR` to your src root).

**STALENESS GATE — opt-in form SHIPPED** ✅ `<this commit>` — `logicn deps --all [dir] --check` re-derives every
flow's block and **exits 1** if any in-file `//lln:` differs from the freshly-computed one (CI fails when someone
forgot to refresh; never writes). No hash-stamping needed — it compares current-rendered vs in-file (don't-trust-check
applied to the tool's own output). Drop it into CI alongside the tests. **Still OPEN (stronger):** fold the same check
into `logicn check` itself so a stale block is a first-class governance diagnostic (not a separate command), per R&D
0045 forward-design #1. **Design constraint for that build:** only flag files that ALREADY carry at least one `//lln:`
line (opted-in). A file with NO `//lln:` is NOT stale — demanding metadata everywhere would fail every fixture/example
that never opted in (a fail-OPEN→breaking gate). `--check` (whole-app, explicit) is correct to flag unannotated files;
`logicn check` (runs on everything, incl. teaching examples) must not.

**CLI ergonomics** ✅ `<this commit>` — added the short bin alias **`lln`** alongside `logicn` (package.json `bin`); both
point at `logicn.mjs`. Takes effect after `npm link` / global reinstall (Windows gets an `lln.cmd` shim).

## R&D 0045 decisions (owner, 2026-06-19)
1. **Token = `//lln:`** ✅ RESOLVED (owner picked it to mirror the `.lln` prefix). Shipped + all artifacts renamed `//@`→`//lln:`.
2. registry vs distributed — still OPEN — Phase 4.
3. **Human edits a generated line → SILENTLY OVERWRITE** ✅ RESOLVED — generated `//lln:` lines are machine-owned; the writer (3c) overwrites on every run.
4. volatility formula — OPEN — gates 3d (git); 2c (graph-depth) is unblocked.
5. **Stable-Deps severity = ALWAYS A HARD ERROR** ✅ RESOLVED — every profile; a LOW flow depending on a HIGH one fails the build. Build 3b now.
