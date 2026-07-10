# AGENTS.md

## Purpose

This file gives guidance to AI coding tools working on this repository.

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

> **Stage-A status (2026-07-10):** the full pipeline lexer→parser→type/effect/value-state→governance-verifier→GIR→WAT
> is shipped and green (`galerina-core-compiler` at 4,413; whole suite 68/68 · 6,315 tests · 0 fail on a clean checkout). The remaining
> frontier is **Stage-B self-hosting WASM byte-parity** (only `tokenize` reaches it today) and the **real
> `DSS.wasm`** Wasmtime runtime (#102–106, still a stub). See `docs/Knowledge-Bases/galerina-roadmap-and-percent-audit-2026-06-23.md`.

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

## Authoritative Sources for AI Tools

| What | File |
|---|---|
| Keyword table (lexer source of truth) | `docs/Knowledge-Bases/v1-reserved-keywords.md` |
| Diagnostic codes — spec catalog | `docs/Knowledge-Bases/compiler-diagnostics.md` (forward-spec; includes unbuilt codes) |
| Diagnostic codes — LIVE catalog (generated, every real code) | `build/code-registry/REGISTRY.md` (regen: `node scripts/gen-code-registry.mjs`) |
| Code INDEX — every code → def/emit/test/doc sites (query instead of grep) | `build/code-index/CODE_INDEX.md` (regen: `node scripts/code-index.mjs`) |
| Diagnostic-code CONVENTIONS (binding) | `docs/Knowledge-Bases/galerina-diagnostic-code-conventions.md` |
| Audit Coverage & R&D Standards (20, research-grounded) | `docs/Knowledge-Bases/galerina-audit-coverage-and-rd-standards.md` |
| AST contract (AstNodeKind, Token, etc.) | `packages-galerina/galerina-core/src/index.ts` |
| Phase 4 plan | `docs/Knowledge-Bases/phase-4-parser-ast-plan.md` |
| Concept model | `docs/Knowledge-Bases/galerina-concept-map.md` |
| Code examples (corrected) | `docs/Knowledge-Bases/galerina-code-examples-full-flow.md` |

## Package Map

| Package | Role |
|---|---|
| `packages-galerina/galerina-core/` | Canonical shared types: Token, AstNode, AstNodeKind, diagnostics |
| `packages-galerina/galerina-core-compiler/` | Compiler pipeline: scanner, lexer, parser, effect checker |
| `packages-galerina/galerina-core-cli/` | CLI entry point and graph commands |
| `packages-galerina/galerina-core-tasks/` | Task dependency resolution |
| `packages-galerina/galerina-devtools-graph-project/` | Workspace knowledge graph |
| `packages-galerina/galerina-framework-app-kernel/` | Secure app kernel design |
| `packages-galerina/galerina-framework-example-app/` | Example app source |

## Diagnostic Code Format

All Phase 4+ diagnostics use `FUNGI-CATEGORY-NNN` format. Key series:

```text
FUNGI-PARSE-*     parser errors (001–014 defined)
FUNGI-TYPE-*      type checker (001–008 defined)
FUNGI-NAME-*      name resolution (001–005 defined)
FUNGI-MATCH-*     exhaustive match (001–004 defined)
FUNGI-EFFECT-*    effect checker (001–004 defined)
FUNGI-SAFETY-*    safety rules (001–008 defined)
FUNGI-BINDING-*   binding mutability (001–004 defined)
FUNGI-MEMORY-*    memory model (001–008 defined)
```

See `docs/Knowledge-Bases/compiler-diagnostics.md` for the spec catalog, and `build/code-registry/REGISTRY.md`
for the LIVE generated catalog (every real code + status). **Conventions are binding**
(`galerina-diagnostic-code-conventions.md`): `name` is `UPPER_SNAKE`, `severity` is lowercase `error|warning|info`,
one-code-one-fault, one owner per code, emit via an exported constant. Enforced by the umbrella gate
`node scripts/lint-conventions.mjs` (runs the #215 conformance scanner + #218 coverage; wired into phase-close).

## Important Rules

- Do not use `safe flow`, `unsafe flow`, or `guard flow` in `.fungi` examples.
- `mut name: Type = value` — not `let mut`.
- Use `FUNGI-CATEGORY-NNN` for all new diagnostic codes; do not extend `Galerina_COMPILER_*`.
- Do not place app-specific documentation inside `packages-galerina/galerina-core/`.
- Do not place Galerina language documentation inside `docs/`.
- Finance, electrical and OT package planning is archived under
  `C:\laragon\www\Galerina_Archive\packages-galerina\` — not part of the active v1 build.
- Keep the repository root clean. Do not commit secrets.
- Do not invent Galerina syntax without documenting it in a KB doc.
- Update relevant docs when changing architecture, requirements, security, or API behaviour.

## Project Graph for AI Tools

Primary graph outputs:

```text
build/graph/galerina-devtools-graph-project.json
build/graph/Galerina_GRAPH_REPORT.md
build/graph/galerina-ai-map.md
```

Regenerate after changes to `AGENTS.md`, `galerina.workspace.json`, `docs/`, package
READMEs, or package source contracts:

```powershell
node packages-galerina\galerina-core-cli\dist\index.js graph --out build\graph
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
