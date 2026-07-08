# @galerina/devtools-fungi-scan

Syntax-migration corpus scanner for the 2026-07-08 logic/syntax update
([docs/SYNTAX_UPDATE_PLAN.md](../../docs/SYNTAX_UPDATE_PLAN.md), work package W2).

Walks **every `.fungi` and `.gate` file in the repo** and reports, per file and
as a rollup:

- `@version` header — present / valid / malformed (BK-4/A4 migration gap)
- legacy forms — `&&`/`||` operators, `vAnd`/`vOr`/`vNot` identifiers
- `match` blocks without a `_` arm (RD-0240 exposure; `when`-guard matches exempt)
- **planned-keyword usage** — every word the syntax update intends to reserve
  (`check`, `fault`, `flip`, `all`, `any`, `sealed`, `schema`, `prefilter`, …,
  plus the rename aliases `modulate`/`stream`/`cast`/…). Before reservation this
  is the **collision-risk table** (identifiers that would break); after
  reservation the same counter is the adoption metric.
- `secure flow` adoption, unreadable files, lexer-error files

## Why the real lexer, not grep

Detection runs on the **compiler's own token stream** (`lex` from
`@galerina/core-compiler`). Regex/grep misses `@version` headers, no-space
operator forms (`x&&y`), and dotted/slashed names — the lexer does not.
Enforcement stays in the compiler (parser/verifier); this tool only measures,
and a file that cannot be read or lexed is a **finding, never a silent skip**.

## Usage

```
node dist/cli.js                # summary + build/fungi-scan/{FUNGI-SCAN.md,fungi-scan.json}
node dist/cli.js --json         # full JSON to stdout
node dist/cli.js --strict       # exit 1 on any RUNTIME-corpus migration finding
node dist/cli.js --root <dir>   # scan a different tree
```

`--strict` gates only the **runtime corpus**: files under `tests/`/`fixtures/`
are exempt by design (negative fixtures legitimately keep old/bad syntax to
prove detectors fire). Wire `--strict` into `run-phase-close` once W6
(migration) lands; run soft before that to watch the gap close.

`.gate` files get a header check only — `gate-parser` remains their authority,
and `.gate` is **never a runtime code file** (owner rule 2026-07-08).
