# REPL — Interactive Exploration

**Status:** DESIGN — not yet built  
**Package:** `galerina-devtools-repl` (to be created)  
**KB spec:** `../ZTF-Knowledge-Bases/galerina-repl-design.md`

---

## What it is

An **interactive governance explorer** for `.fungi` code. Wraps the existing compiler pipeline in a readline loop — no new compiler logic.

```bash
galerina repl              # start (dev profile)
galerina repl --production # strict governance profile
galerina repl <file.fungi> # load file into session context, then start
```

## How it works

Every expression is wrapped in a synthetic `pure flow __repl() -> Auto { <expr> }` and run through the full pipeline:

```
input → parseProgram → resolveSymbols → checkTypes → checkValueStates
      → checkEffects → verifyGovernance → run() [interpreter]
      → display GalerinaValue result
```

Governance violations are shown in **what/why/fix format** — same as the CLI. No new compiler code.

## Commands

| Command | Effect |
|---|---|
| `:type <expr>` | Show inferred type without running |
| `:effects <flow>` | Show effect set |
| `:explain <flow>` | Full governance summary |
| `:k3 <expr>` | Evaluate K3 trit expression |
| `:load <file>` | Load `.fungi` file into session |
| `:profile <dev\|production>` | Switch governance profile |
| `:gir <flow>` | Show GIR (debug) |
| `:reset` | Clear session |
| `:save <file>` | Save session flows to file |
| `:quit` | Exit |

## Security constraints

- Defaults to `dev` profile — warnings, not errors, on missing contracts
- No real capabilities — `database.read` returns a governed mock with a diagnostic note
- No real secrets — `secrets {}` resolves to placeholder values
- No arbitrary Node.js execution — only the Galerina interpreter runs

## Implementation plan

| Sprint | Work |
|---|---|
| R-1 | `evaluator.ts` — pipeline wrapper, expression eval, diagnostics display |
| R-2 | `session.ts` — context accumulation, `:load`, `:reset`, `:save` |
| R-3 | `commands.ts` — all `:command` handlers |
| R-4 | `repl.ts` — readline loop, multi-line input, CLI wiring |

Gate: **Core v1.0 should land first** (A18 tenant scope). The REPL uses the same profile system.
