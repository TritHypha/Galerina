# Structured-Engineering Metadata — Roadmap + %-Shipped Audit (2026-06-19)

Owner vision (R&D 0045): turn passive comments into compiler-maintained architectural metadata so the
"why / how volatile / what it depends on / what breaks if deleted" is machine-kept, not a stale wiki.
This is the hub's **verify-before-build %-audit + phased roadmap**. Companion R&D: `0045` (the design +
5 open decisions), `0046` (type placement: `contract.types{}` vs TS-style, runtime-perf).

## %-Shipped audit (7-agent, source-grounded)
| # | Piece | % shipped | Cost | What already exists (verified) | Net-new |
|---|---|---:|---|---|---|
| A | **`//@` generated comment tier** | **60%** | LOW | `//`→`comment`, `///`→`docComment`, `;;`→`govComment` (manifest-wired, `manifest-generator.ts:432`); 4 distinct comment scans in `lexer.ts` | `//@` collapses into plain `//` (the `//` scanner swallows `@`). Add a `genComment` token + a `peek(2)==='@'` branch before the `//` branch (~15 ln, additive, fail-closed) |
| B | **Hardware `//@WARN` (uncertainty)** | **70%** | LOW | `HARDWARE_TRUST_PROFILES` (~40 targets, `type-registry.ts:455`) wired into the verifier | Unknown hardware target is silently `continue`d (`governance-verifier.ts:1662`) → make it a yellow `LLN-HW-004` warning (advisory, non-gating) |
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
- **1a. `//@` generated comment tier** ✅ `1804557` — `genComment` token, ordered before `//`, fail-closed.
- **1b. Hardware `//@WARN`** ✅ `5d8d611` — unknown-target → yellow `LLN-HW-004`.
- **1c. Cyclomatic-complexity metric** ✅ `45bc0a5` — `//@COMPLEXITY` (silent at 1), surfaced in `logicn deps`.

**Phase 2 — MEDIUM, read-only / parse-only — IN PROGRESS:**
- **2a. dependency report** ✅ `1a57761` — shipped as `logicn deps <file> [--flow X]`: `//@USES` (upstream) /
  `//@USEDBY` (downstream "dependants") / `//@IMPACT` (transitive blast-radius; 0 = safe-to-delete), from the
  AST call graph. (The graph-package `graph --target` variant can follow; `deps` already delivers the value.)
- **2b. `contract.architecture {}` parse-only** ✅ `<this commit>` — registered contract section + fail-closed
  `LLN-ARCH-001` volatility value check; the *authored* `depends_on`/`volatility` (vs observed `//@USES`).
- **2c. graph-depth volatility proxy** (no git) — the fail-safe first volatility number. ⏳ NEXT.

**Phase 3 — enforcement + generation (gated on R&D 0045 decisions + per-flow edges):**
- **3a. Per-flow `depends_on`/`uses` graph edges** (close the 30%→full dep data; emit the declared-but-unused `uses` edge).
- **3b. Stable-Dependencies enforcement** (`LLN-ARCH-001`, modeled on GOV-013) — **gated on decision #5** (hard error vs strict-profile).
- **3c. `analyze` / `generate-contracts` SOURCE WRITER** (overwrites only `//@` lines) — **gated on decision #3** (human-edits-a-generated-metric: fatal vs overwrite vs `// pin:`).
- **3d. git-churn volatility** — gated on history availability.

**Phase 4 — polish:** state-mutability metric (`//@Mutates`), central Governance-Registry index (decision #2), pre-commit hook.

## Gating on R&D 0045 (don't build ahead of these)
1. token choice (`//@` vs `//ln:` vs `///`) — Phase 1a built provisionally on the owner's `//@` lean (reversible).
2. registry vs distributed — Phase 4.
3. human-edits-generated behaviour — gates 3c (the writer).
4. volatility formula — gates 3d (git); 2c (depth) is unblocked.
5. Stable-Deps severity — gates 3b.
