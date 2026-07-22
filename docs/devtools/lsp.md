# LSP — IDE Developer Experience

**Status:** DESIGN — not yet built  
**Package:** `galerina-devtools-lsp` (to be created)  
**KB spec:** `../ZTF-Knowledge-Bases/galerina-lsp-design.md`  
**Existing IDE tooling spec:** `../../ZTF-Knowledge-Bases/galerina-ide-tooling.md`

---

## What it is

A **Language Server Protocol server** that surfaces Galerina governance information inside VS Code, Neovim, JetBrains, Cursor, and Windsurf. The LSP server calls the same exported compiler functions as the CLI — no duplicated logic.

```
editor ↕ LSP JSON-RPC (stdio)
galerina-lsp server
       ↓ calls (in-process, worker thread)
@galerina/core-compiler (parseProgram, checkTypes, checkEffects, verifyGovernance, applyFixEdits)
```

## Features

| Feature | LSP capability |
|---|---|
| Real-time diagnostics | `textDocument/publishDiagnostics` — all FUNGI-* codes, exact source ranges |
| Code actions | `textDocument/codeAction` — FixEdit → one-click suggested fixes |
| Context completions | `textDocument/completion` — effects from `EFFECT_REGISTRY`, capabilities from `STDLIB_CAPABILITY_MAP`, contract keys, flow snippets |
| Governance-aware hover | `textDocument/hover` — flow type/effects/intent, protected value state, K3 verdict explanation |
| Go-to-definition | `textDocument/definition` — flow, type, import |
| Find references | `textDocument/references` — cross-file, workspace-indexed |
| Governed rename | `textDocument/rename` — validates governance before applying |
| Value-state inlay hints | `textDocument/inlayHint` — UNSAFE / VALIDATED / PROTECTED / REDACTED badges inline |
| Document outline | `textDocument/documentSymbol` — all flows, types, records |
| Workspace search | `workspace/symbol` — search by flow/type name |

## Key design rules

1. **No re-implemented compiler logic** — the LSP queries the same pipeline the CLI uses
2. **Worker thread mandatory** — `verifyGovernance` can take 50–200ms; the main loop must never block
3. **FixEdit already shipped** — `fix-edit.ts` is the safe-applier; code actions are a thin translation layer
4. **TextMate grammar generated from `V1_ACTIVE_KEYWORDS`** — not hand-maintained; prevents grammar/lexer drift
5. **Hover shows value-state** — PROTECTED values show their redact requirement; governance is visible without compiling

## Implementation plan

| Sprint | Work |
|---|---|
| L-1 | `pipeline.ts` + `diagnostics.ts` — diagnostic publishing |
| L-2 | `server.ts` + `document-store.ts` — LSP main loop, debounced diagnostics |
| L-3 | `completions.ts` + `hover.ts` — registry-backed completions, governance hover |
| L-4 | `code-actions.ts` — FixEdit → CodeAction |
| L-5 | `inlay-hints.ts` — value-state badges, effect annotations |
| L-6 | `references.ts` + `workspace-index.ts` — go-to-def, find-refs, rename |
| L-7 | `galerina-vscode` extension — grammar, manifest, LSP startup wiring |

Gate: **Core v1.0.** LSP is devtools — does not block Core release but should land before or alongside the first public release.
