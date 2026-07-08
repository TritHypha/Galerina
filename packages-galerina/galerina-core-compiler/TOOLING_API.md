# `@galerina/core-compiler` — semi-public tooling surface

Answers the RD-0280 handover (beta-prompt §10e) for the language-plugin and flowgraph
projects. Two decisions the main session owns.

---

## 1. Blessed semi-public surface (RD-0280 ask 1)

These exports are **a supported tooling/LSP surface**: stable enough to build editor tooling
and graph renderers on. "Semi-public" = they will not change shape casually, but they are not
a frozen 1.0 API — breaking changes get a note in this file + the CHANGELOG, never a silent
rename. Import from the package barrel (`@galerina/core-compiler`, i.e. `dist/index.js`);
all four are verified reachable there.

| Export | Kind | Tooling use |
|--------|------|-------------|
| `parseProgram(source, file, opts?)` | function | **Error-tolerant** parse: returns a `ParseResult` with the AST present even when diagnostics exist, flows surviving partial parse errors, cascade-stopping recovery. The LSP parse entry point. |
| `checkEffects(flows, ast, profile?, strict?)` | function | Effect/capability diagnostics (governance surface). |
| `verifyGovernance(ast, flows, effects, profile)` | function | Governance verdicts + per-flow flags/manifests. |
| `emitGIR(...)` | function | The versioned governance IR (`fungi.gir.v1`): per-flow effects / intent / proofs / capabilities + entry points. The **program-level** governance map — exactly what a flowgraph MVP should draw. Statement-level drawing uses the AST from `parseProgram`. |
| `ParseResult` | type | `{ ast, flows, diagnostics, versionHeader }`. |
| `CompilerDiagnostic` | type | `{ code, name, severity, message, location, suggestedFix? }` — `severity` ∈ {error,warning,info}; `code`/`name` are the registry keys (see `ZTF-Knowledge-Bases/compiler-diagnostics.md`); `suggestedFix` is quick-fix material. |
| `SourceLocation` | type | Carries **end positions + byte offsets** ("Used for IDE squiggles" per its own doc comment) — range mapping for editors is first-class. |

**Consumability is proven**, not aspirational: `galerina-devtools-benchmarks` and
`galerina-devtools-fungi-scan` already `import` from `dist/index.js` and run the pipeline
programmatically from plain Node.

**Non-goals / stay-out:** internal checker classes, the WAT emitter internals, and anything
under `runtime/` are NOT part of this surface — tooling must not reach past the functions
above (they encapsulate the fail-closed ordering).

---

## 2. The `.gate`-file parser slot (RD-0280 ask 2)

**Finding (RD-0280):** the `.gate` *file* format (the draw-don't-code ASCII graph — `FLOW:`
section, `[✓]`/`[×]`/`[-]` K3 three-arm routing) has complete docs (7 chapters) + 5 worked
examples, but **no production parser for the FLOW graph exists in the compiler.** The
compiler's `gate-parser.ts` handles the `.gate` header/pragma (`@version`) and the
`gate(condition){}` *block* is a separate `.fungi` construct — neither parses the renderable
`.gate` graph. The current de-facto `.gate` validator is the **reference checker**
`ZT-Galerina-GRAPH-ASCII-v2/tools/gate-check.mjs` (non-git, in-tree).

**Decision (owner, zero-trust):**
1. **No project ships its own `.gate` graph parser.** With no first parser in existence, the
   first one silently becomes the authority — the exact fail-open RD-0275 forbids. This binds
   the flowgraph project and the language-plugin equally.
2. **The canonical slot, when a parser is built, is the compiler** — a new
   `gate-file-parser.ts` beside `gate-parser.ts` — and it MUST be **co-developed with
   `gate-check.mjs`** so the two never diverge (the three-surfaces lockstep discipline: a
   `.gate` change that lands on one surface but not the others split-brains the
   0%-hallucination verify-loop). Post-beta is fine.
3. **Until then, flowgraph renders from GIR + AST** (§1), never from a bespoke `.gate` parse.
   A read-only `.gate → diagram` renderer that consumes `gate-check.mjs`'s own parse output
   (not a re-implementation) is the acceptable interim — it doubles as a graph-check tool and
   adds no new authority.

---

*Provenance: RD-0280 compiler investigation (read-only, via codebase graph) + beta-prompt
§10e; reconciled against the `galerina-gate-ecosystem-three-surfaces` discipline and RD-0275
(never-the-first-parser rule). Exports verified reachable from `dist/index.js`.*
