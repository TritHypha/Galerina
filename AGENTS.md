# AGENTS.md

## Purpose

This file gives guidance to AI coding tools working on this repository.

## Discovery protocol — graph first, grep last (owner rule, 2026-07-10)

Token-cheap, reliable lookups exist for almost everything in this repo; use
them BEFORE any raw grep or file-crawl:

| Need | Use |
|---|---|
| Find a function/class/route/symbol | codebase-memory MCP `search_graph` (BM25 `query` or `name_pattern`), then `get_code_snippet` for the exact source |
| Text pattern, with code context | MCP `search_code` (graph-augmented grep: deduped into containing functions, ranked, compact mode) |
| Call chains / data flow | MCP `trace_path` |
| Architecture overview | MCP `get_architecture`; `build/graph/Galerina_GRAPH_REPORT.md` |
| A diagnostic code's def/emit/test/doc sites | `build/code-index/CODE_INDEX.md` (regen: `node scripts/code-index.mjs`) |
| Which dev tool does X | `build/dev-tool-index/INDEX.md` (61 tools, categorised) |
| Knowledge-base docs (sibling repo) | `node scripts/kb-index.mjs <terms>` (ranked query mode) |
| A package's boundary/surface facts | its `.graph/BOUNDARY.md` |

Raw `grep` is the LAST resort, for literal-string sweeps the graph does not
model (absolute-path leaks, count-claim strings). Subagent/worker prompts must
carry this protocol. If the lookup you need is missing: UPDATE or BUILD a dev
tool (house pattern, committed) instead of grepping around the gap.

### Post-commit index refresh (after adding/moving packages or landing code)

Refresh the MCP index AND verify the refresh committed — never trust
`status: "indexed"` alone on servers older than the 2026-07-10 dump-swap fix:

1. Run `index_repository` (repo_path = this repo, mode `moderate`).
2. In the response, check all three: `status` is `"indexed"`; `nodes` is close
   to `expected_nodes` (a large shortfall = files extracted but not
   committed); `indexed_head_sha` equals the commit you just made.
3. Or ask `index_status`: `indexed_head_sha` is the BUILD POINT of the graph,
   `git.head_sha` is the repo's current HEAD (always fresh, useless alone),
   and `stale: false` confirms they match. `indexed_at` timestamps the build.
4. Belt-and-braces: `search_graph` for one symbol introduced by the commit.

Multiple concurrent agent sessions are safe: when sibling server processes
hold the graph DB open, the server swaps content through SQLite/WAL instead
of replacing the file. If the response says `status: "error"`, the previous
graph is intact and no bookkeeping advanced — re-run after checking the
server log; do NOT keep working against the stale graph as if it were fresh.
Known failure mode on pre-fix servers: a reindex under concurrent sessions
reports `"indexed"` while committing nothing, then freezes the index
permanently (hash bookkeeping outruns the graph). If `search_graph` cannot
find a symbol that `git ls-files` + grep prove exists, that freeze is the
cause: upgrade the server, then reindex.

## Project Type

This is the Galerina governance-first programming language — implementation,
specification, and documentation.

Galerina source files use the `.fungi` extension. The Node.js prototype implements
the compiler pipeline in TypeScript. Each stage is covered by `node:test` tests.

Governance model:

```text
intent → governed execution plan → coordinated compute → audit proof
```

## Build Pipeline Status

| Phase | Name | Status |
|---|---|---|
| 1 | Project graph + CLI | Complete |
| 2 | Typed content blocks + string/char/byte safety | Complete |
| 3 | Scanner-level safety enforcement | Complete (28/28 tests) |
| 4 | Lexer + Parser + AST | Complete (Stage-A) |
| 5 | Type + Effect Checker | Complete (Stage-A) |
| 6 | IR (GIR) + Target Planner + WAT emitter | Complete (Stage-A) |

> **Current beta-v1 checkpoint (2026-08-09):** the full pipeline
> lexer→parser→type/effect/value-state→governance-verifier→GIR→WAT is shipped
> and green (`galerina-core-compiler` 6,319/6,319; whole suite 100/100 packages,
> 9,470 tests, zero failures at the current canonical count). All seven canonical `.fungi` compiler stages
> are authoritative specifications, with TypeScript retained as the executing
> differential/bootstrap layer. Independent SLIDE now executes a bounded
> checked-Fungi family through canonical GIR, physical `.slide`, independent
> re-admission and VOK (**866/866 across 96 suites**). Galerina Contract 85 binds
> the real `restoreVerdict` decision source to a receipt-bound 617-byte package
> candidate and mandatory reference-only consumer switch with **4/4** focused
> hybrid-authenticated typed evidence. Contract 86 retains its exhaustive
> 19,683-vector proof and adds one authenticated authorizing candidate (**5/5**),
> but production boot composition and authenticated platform evidence,
> general source families, literal `.ts` retirement and production authority
> remain later gates; see
> `docs/ROADMAP.md`.
>
> **Legacy-runtime reconciliation (2026-08-04):** do not treat the former
> production `dss-host`/Wasmtime supervisor (`#102–#106`) as one intact new
> build queue. Reuse and adapt its `.fungi` decision core, typed contracts,
> tests and optional-oracle evidence wherever they satisfy the current
> SLIDE/VOK boundary; rebuild only incompatible host-specific authority or
> isolation parts. Target-neutral containment, typed traps, admission and
> execution belong to independent SLIDE/VOK. The remaining self-hosting
> milestone is the source-to-SLIDE bootstrap fixpoint, not a rerun of completed
> stage flips. See
> `docs/reports/roadmap-legacy-runtime-reconciliation-2026-08-04.md` and
> `docs/reports/slide-vok-reuse-inventory-2026-08-04.md`.
>
> **Registry durability checkpoint (2026-07-31):** the production native
> adapter allow-list remains empty. The zero-dependency Windows candidate
> passes 7/7 focused host/barrier/publication tests and a separate 7/7
> process-termination boundary matrix on this Windows 10 NTFS host. It remains
> non-authorizing and supplies no kernel-crash, reboot or power-loss proof. Do
> not infer production durability from this evidence.
>
> **Beta-v1 release-evidence checkpoint (2026-08-02):** policy v2 verifies a
> dedicated root-signed two-role delegation plus both Ed25519 and ML-DSA-65
> components on closed durability and repository statements. It independently
> re-hashes the raw durability artefacts and never trusts an authentication or
> success Boolean. Implementation is green; the tracked policy deliberately
> remains K3 `0` until the offline delegation, operational public bundle and
> complete external evidence exist. No production private key was used.
>
> A separate non-executing artifact inspector passes 7/7 and binds one
> fixed-path, single-link PE/ELF/Mach-O candidate to its architecture and exact
> digest. App-kernel is 204/204 and its `.fungi` folds are checker-clean. This
> still does not prove N-API exports, load identity or persistence behavior;
> the production allow-list remains empty.
>
> **Loader constraint:** do not implement pre-hash + `process.dlopen(path)` +
> post-hash as production authority. Standard executable loading is path-based;
> Windows `LoadLibraryExW` requires `hFile=NULL`, so module initialization can
> precede a post-load identity check. RD-0601 resolves the choice: use a
> statically linked first profile and later replace it with the closed
> content-bound SLIDE linker.
>
> The optimized static-profile proof and independent verifier are implemented.
> They bind the exact embedded adapter source, authoritative `.fungi` contract,
> ABI, release profile and executable digest, and prove that a hostile external
> `.node` decoy cannot change the result. The receipt is non-authorizing;
> signed-host admission and the named platform evidence remain mandatory.
>
> **Linux preparation:** the platform-neutral Linux facts gate, bounded full
> `mountinfo` parser, deepest-component selector, device-number decoder,
> sysfs-classification model and pure statfs/device correlation pass 10/10 on
> Windows. A GNU Linux x86-64/AArch64 candidate now uses retained-descriptor observation
> and publication, with three live tests and a seven-boundary termination
> harness explicitly ignored until the second Ubuntu run. This is source plus
> off-platform model evidence only. The first Ubuntu return proved static-link
> portability but omitted the SLIDE JSON and ran no live adapter. Linux-only
> execution, reboot and power-loss evidence must not be inferred.
>
> The native Windows durability candidate is 7/7: on this Windows 10
> fixed-local NTFS host, the direct-directory `FlushFileBuffers` call and
> exact, no-replace publication sequence succeed; hard-linked collisions
> refuse. This is syscall-acceptance evidence only, not hostile
> parent-namespace, crash or physical durability proof.
>
> A non-default Windows fault build also passes a 7/7 process-termination
> boundary matrix: prior authority remains exact and the candidate is absent
> or exact. The worker/observer is absent from default builds, and optimized
> builds refuse the feature. Do not relabel this as kernel-crash, reboot,
> controller-cache or power-loss evidence.

## Grammar — Current v0.1 Flow Forms

```text
flow_decl =
  [flow_qualifier] "flow" identifier "(" [params] ")" "->" type_ref
  [effects_decl] block

flow_qualifier = "secure" | "pure"
```

Only these three forms are active in v0.1:

```galerina
flow add(a: Int, b: Int) -> Int { ... }

secure flow processPayment(order: Order) -> Result<PaymentReceipt, PaymentError>
effects [network.outbound, secret.read] { ... }

pure flow calculateVat(amount: Money<GBP>) -> Money<GBP> { ... }
```

`safe flow`, `unsafe flow`, and `guard flow` are **not** valid v0.1 syntax.
`safe`/`unsafe` annotate **values** inside a flow body, not the flow itself.

## Constellation Architecture (forward design — adopted 2026-07-22)

Galerina is structured as a **Core-first product constellation**. Core ships first. All other products are optional, separately released, and depend on Core — Core depends on none of them.

| What | Where |
|---|---|
| **Canonical Constellation spec** | `../ZTF-Knowledge-Bases/reference/galerina/galerina-constellation-architecture.md` |
| **In-repo architecture record** | `docs/architecture/constellation-architecture-2026-07-22.md` |
| **Gap analysis (pre-split checklist)** | `../ZTF-Knowledge-Bases/reference/language/constellation-architecture-plan-2026-07-22.md` |

**Development order:** Finish Core → TritMesh:QL → other engines.
**FUNGI-* / GALERINA-* codes:** Core only — never in optional engines.
**Product split:** happens after Core v1.0 ships and seam schemas are defined and gated. No premature split.
**No runtime/compiler changes needed:** current architecture already satisfies all Constellation Core Foundation invariants.

---

## Authoritative Sources for AI Tools

| What | File |
|---|---|
| Keyword table (lexer source of truth) | `../ZTF-Knowledge-Bases/reference/language/v1-reserved-keywords.md` |
| Diagnostic codes — spec catalog | `../ZTF-Knowledge-Bases/reference/language/compiler-diagnostics.md` (forward-spec; includes unbuilt codes) |
| Diagnostic codes — LIVE catalog (generated, every real code) | `build/code-registry/REGISTRY.md` (regen: `node scripts/gen-code-registry.mjs`) |
| Code INDEX — every code → def/emit/test/doc sites (query instead of grep) | `build/code-index/CODE_INDEX.md` (regen: `node scripts/code-index.mjs`) |
| Diagnostic-code CONVENTIONS (binding) | `../ZTF-Knowledge-Bases/reference/galerina/galerina-diagnostic-code-conventions.md` |
| Audit Coverage & R&D Standards (20, research-grounded) | `../ZTF-Knowledge-Bases/reference/galerina/galerina-audit-coverage-and-rd-standards.md` |
| Language classification (canonical) | `../ZTF-Knowledge-Bases/reference/galerina/galerina-language-classification.md` |
| AST contract (AstNodeKind, Token, etc.) | `packages-ts/galerina-core/src/index.ts` |
| Phase 4 plan | `../ZTF-Knowledge-Bases/reference/language/phase-4-parser-ast-plan.md` |
| Concept model | `../ZTF-Knowledge-Bases/reference/galerina/galerina-concept-map.md` |
| Code examples (corrected) | `../ZTF-Knowledge-Bases/reference/galerina/galerina-code-examples-full-flow.md` |
| Minimal executable construct lookup | `docs/examples/golden/README.md` (verify: `npm run audit:fungi-golden`) |

## Package Map

| Package | Role |
|---|---|
| `packages-ts/galerina-core/` | Canonical shared types: Token, AstNode, AstNodeKind, diagnostics |
| `packages-ts/galerina-core-compiler/` | Compiler pipeline: scanner, lexer, parser, effect checker |
| `packages-ts/galerina-core-cli/` | CLI entry point and graph commands |
| `packages-ts/galerina-core-tasks/` | Task dependency resolution |
| `packages-ts/galerina-devtools-graph-project/` | Workspace knowledge graph |
| `packages-ts/galerina-framework-app-kernel/` | Secure app kernel design |
| `packages-ts/galerina-framework-example-app/` | Example app source |

## Diagnostic Code Format

All Phase 4+ diagnostics use `FUNGI-CATEGORY-NNN` format. Key series:

```text
FUNGI-PARSE-*     parser errors (001–014 defined)
FUNGI-TYPE-*      type checker (001–032 defined, with gaps — see live registry)
FUNGI-NAME-*      name resolution (001–005 defined)
FUNGI-MATCH-*     exhaustive match (001–004 defined)
FUNGI-EFFECT-*    effect checker (001–004 defined)
FUNGI-SAFETY-*    safety rules (001–008 defined)
FUNGI-BINDING-*   binding mutability (001–004 defined)
FUNGI-MEMORY-*    memory model (001–008 defined)
```

See `../ZTF-Knowledge-Bases/reference/language/compiler-diagnostics.md` for the spec catalog, and `build/code-registry/REGISTRY.md`
for the LIVE generated catalog — <!-- registry:counts.live -->211 live codes of <!-- registry:counts.total -->1174 total
(auto-stamped by `gen-code-registry.mjs`; do NOT hand-edit these numbers — they regenerate from the registry). **Conventions are binding**
(`galerina-diagnostic-code-conventions.md`): `name` is `UPPER_SNAKE`, `severity` is lowercase `error|warning|info`,
one-code-one-fault, one owner per code, emit via an exported constant. Enforced by the umbrella gate
`node scripts/lint-conventions.mjs` (runs the #215 conformance scanner + #218 coverage; wired into phase-close).

## Important Rules

- A private document uses both the `-PRIVATE.md` filename marker and a primary
  heading whose final text is exactly ` - PRIVATE`, for example
  `# Registry custody record - PRIVATE`. The heading is a classification
  marker, not a custody control: private content remains outside public
  repositories, generated indexes, logs, prompts and commits.
- Do not use `safe flow`, `unsafe flow`, or `guard flow` in `.fungi` examples.
- `mut name: Type = value` — not `let mut`.
- Use `FUNGI-CATEGORY-NNN` for all new diagnostic codes; do not extend `Galerina_COMPILER_*`.
- Do not place app-specific documentation inside `packages-ts/galerina-core/`.
- Do not place Galerina language documentation inside `docs/`.
- Finance, electrical and OT package planning is archived under
  `C:\laragon\www\Galerina_Archive\packages-ts\` — not part of the active v1 build.
- Keep the repository root clean. Do not commit secrets.
- Do not invent Galerina syntax without documenting it in a KB doc.
- For a minimal construct shape, read `docs/examples/golden/` before prose and
  rerun its audit. The generated Golden Pack manifest is bounded evidence, not
  a complete language specification or production authority.
- Update relevant docs when changing architecture, requirements, security, or API behaviour.

## Project Graph for AI Tools

Primary graph outputs:

```text
build/graph/galerina-devtools-project-graph.json
build/graph/galerina-devtools-project-graph.html
build/graph/Galerina_GRAPH_REPORT.md
build/graph/galerina-ai-map.md
```

Regenerate after changes to `AGENTS.md`, `galerina.workspace.json`, `docs/`, package
READMEs, or package source contracts:

```powershell
node packages-ts\galerina-core-cli\dist\index.js graph --out build\graph
```

## Coding Rules

- Use strict TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`).
- Handle `undefined` explicitly — no implicit index access.
- Use `readonly` on all data structures that must not change after construction.
- Handle errors explicitly; prefer `Result<T, E>` patterns.
- Keep files focused; prefer small modules over large files.
- Test with `node:test` — same runner as the rest of the compiler.
- Keep compiler build output out of Git unless specifically required.

## Security Rules

- Never store real secrets in source control.
- Use `.env.example` for placeholder environment variables.
- Validate inputs. Avoid unsafe dynamic code execution.
- Keep runtime configuration separate from compiled output.
