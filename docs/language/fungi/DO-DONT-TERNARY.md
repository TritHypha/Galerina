# Do / Don't — evolving from binary habits to governed (ternary) forms

A migration guide from binary/legacy programming habits to Galerina's **governed, three-valued (K3)** forms. The through-line: **the unknown is never "yes."** A governed decision is `ALLOW / DENY / INDETERMINATE`, errors are values, defaults fail closed, and untrusted data is *proven* before use.

> **Note on `tether`:** the owner's "use `tether` instead" was an *illustration of this doc's format* — `tether` is **not** a Galerina construct. Every ✅ below is a real, `galerina check`-clean construct with a verified example link.

Every ✅ example in the table is verified `galerina check`-clean (plain, and — where the example declares its own types — `--strict-types`).

| ❌ Don't (binary / legacy) | ✅ Do (tri / governed) | Why / ref |
|---|---|---|
| Collapse a governed decision to `true`/`false` | K3 verdict `ALLOW / DENY / INDETERMINATE` — the unknown is not a yes | `galerina-tower-citizen/src/three-valued-governance.ts`; ZT-09 |
| `try`/`catch` (catch-and-continue = fail-open) | `Result<T,E>` + exhaustive `match` + `trap` (errors are values) | [010-result-return](../../examples/Level-1-Basics/010-result-return/example.fungi), [012-match-result](../../examples/Level-1-Basics/012-match-result/example.fungi); RD-0341 |
| Permissive `_ => <proceed>` default on a Verdict/Decision `match` | Fail-closed default `_ => deny` / `_ => trap` (or 3 explicit trit arms) | `FUNGI-MATCH-001`; RD-0341 |
| Rely on a `Tainted<T>` type (not parser-backed) | `unsafe let` / `tainted` param + `validate.*(...)?` + `redact()` | [05-bindings-taint-privacy.md](05-bindings-taint-privacy.md); [178-governed-data-query](../../examples/Level-4-Security/178-governed-data-query/example.fungi) |
| Pass raw `request.context.*` / boundary input to a governed sink | Validate/redact it into a **bound** value first (`let x = redact(...)`) | `FUNGI-VALUESTATE-008`; [161-safe-audit-log](../../examples/Level-4-Security/161-safe-audit-log/example.fungi), [getPatient](../../../examples/healthcare/getPatient.fungi) |
| A `.gate` cut named by convention, or with no field | `[name:cut(<field>) fu op]` — declare the field it strips | RD-0340 (landed); [gate/03-phi-redaction](../../examples/gate/03-phi-redaction.gate) |
| `const` for constants (KB-rejected / lexer drift) | `static NAME = …` | [05-bindings-taint-privacy.md](05-bindings-taint-privacy.md) |
| Return a `protected`/PII value directly in the response | Gate / `redact()` / omit; `deny protected T to response.body` | `FUNGI-GOV-003`; [getPatient](../../../examples/healthcare/getPatient.fungi) `privacy {}` |
| `type X = record {…}` / `type X = enum {…}` | `record X {…}` / `enum X {…}` decl (or contract-`types { Name {…} }`) | [015-record-basic](../../examples/Level-1-Basics/015-record-basic/example.fungi), [014-enum-basic](../../examples/Level-1-Basics/014-enum-basic/example.fungi) — **F2 resolved** (below) |
| A raw `String` (or an inline `Brand<String,Tag>` re-declared at every use) for a repeated domain identity | `hallmark X of T { gate: flow f }` — mint the name once; construct it **only** through the assay gate (a gate proves *shape*, it does not sanitize *trust*) | [094-hallmark-declaration](../../examples/Level-2-Types/094-hallmark-declaration/example.fungi); `FUNGI-HALLMARK-*` / `FUNGI-TYPE-003` (RD-0353) |

## F2 resolved (compiler-verified 2026-07-11)

`type X = record {…}` / `type X = enum {…}` is **not** strict-clean: under `--strict-types` the checker reads the `record`/`enum` keyword as an *undefined type name* (`FUNGI-TYPE-001: Type 'record' is not defined`). The canonical decl forms `record X {…}` (015) and `enum X {…}` (014) pass `--strict-types` clean. This is distinct from snippet-isolation `FUNGI-TYPE-001` (an *undeclared brand tag* in an isolated snippet). **Migrate `type X = record/enum {…}` → `record X {…}` / `enum X {…}`.** (`type X = Result<…>` / `type X = Brand<…>` aliases are fine — they resolve to defined generic types.) The `getPatient` flagship was migrated as part of this pass.

## The through-line

- **Governance is three-valued.** ALLOW / DENY / **INDETERMINATE** — an empty or unknown verdict is deny-by-default, never a silent yes ([K3](../../../packages-galerina/galerina-tower-citizen/src/three-valued-governance.ts)).
- **Errors are values.** `Result<T,E>` + `?` + exhaustive `match`; `trap cond : ERR` for fail-closed refusal. No catch-and-continue.
- **Defaults fail closed.** A `_ =>` arm on a Verdict/Decision `match` must `deny`/`trap`, never proceed (RD-0341).
- **Untrusted data is proven, then used.** `unsafe let` → `validate.*(...)?` (untaint) → bound value → sink; `redact()` before any egress sink (audit *or* network), bound to a `let` so the boundary is gated too.
- **A minted type is assayed, not asserted.** A repeated domain identity is a `hallmark X of T { gate: flow f }` — the *declaration is the mint*, construction goes only through a gate that can fail, and `ops {}` is deny-by-default (an undeclared operation does not compile). Minting is **not** sanitizing: a tainted value stays tainted through the gate (`FUNGI-VALUESTATE-004`), so a hallmark proves *shape/identity*, never *trust* ([RD-0353](../../../packages-galerina/galerina-core-compiler/tests/hallmark.test.mjs); [094–098](../../examples/Level-2-Types/094-hallmark-declaration/example.fungi)).
