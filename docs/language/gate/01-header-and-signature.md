# 01 — The header & signature

Every `.gate` file has the same skeleton: a **version pragma**, exactly one **`GATE` container**
with a typed signature, a clause block, a `FLOW:` graph, and a closing **`END`**. This page covers
the outer frame: the pragma, the signature line, the one-gate-per-file rule, and `END`. The clauses
are page [02](02-clauses.md); the graph is page [03](03-flow-graph-syntax.md).

```ebnf
file    = pragma , { comment | blank } , gate , { comment | blank } ;
gate    = "GATE" , ws , ident , sig , ws , "->" , ws , type , ":" , newline ,
          intent , effects , [ privacy ] , [ audit ] , flow ,
          "END" , newline ;
sig     = "(" , [ param , { "," , ws , param } ] , ")" ;
param   = ident , ":" , ws , type ;
```
*Source: `SPEC-gate-language.md` §1 (grammar).*

---

## 1. The `@version` header

The **first non-blank line must be** `@version 1.0.0` (Q1, owner LOCKED 2026-07-08 — this replaced the
retired `#gate <major>.<minor>` pragma, giving `.fungi` and `.gate` ONE version story).

```gate
@version 1.0.0
```
*Source: `examples/flow01.gate:1` (and every example).*

Rules the checker enforces:

- **Mandatory and first.** A missing header is rejected ("missing `@version 1.0.0` header on the first
  non-blank line"). (`gate-check.mjs` `parse` / `CHECKS.pragma`.)
- **Closed accept set, exact match.** The current set is `{1.0.0}`. There is no numeric-range
  comparison — the version either is on the list or it is not. This is the strongest fail-closed
  shape: unknown ⇒ REJECT.
- **Unknown/absent/retired ⇒ REJECT, never "best effort".** `@version 2.0.0` is rejected as
  unsupported; the `.fungi` integer form `@version 1` is rejected in a `.gate` (the dual-format
  trap fails closed); the retired `#gate` marker is rejected **with a migration pointer**
  (`scripts/migrate-fungi.mjs --gate-stamp`).
- **Pure ASCII header region.** No BOM (U+FEFF), no NBSP (U+00A0), no Unicode spaces anywhere in the
  leading region or on the `@version` line — they fail closed.

> **Version note.** The file header (`@version 1.0.0`) and the checker's internal spec-hardening axis
> (`0.4`, from the RD-0232b audit rounds) are **different axes** — the file is at a stable 1.0.0; the
> `0.4` is an implementation detail. The reference checker (`tools/gate-check.mjs`) and the Galerina
> compiler's `gate-parser.ts` enforce the same closed set, so the verify-loop and the compiler agree.
> *(Source: `SPEC-gate-language.md` §0 version-header note, §4.1.)*

### Mistake to avoid

```gate
GATE ping(caller: CallerId) -> Pong:     # ← WRONG: no @version header on the first line
  ...
```
The file is rejected before anything else is checked. Always open with `@version 1.0.0`.

---

## 2. The `GATE` signature line

Exactly one `GATE` container per file. Its signature names the callable, its typed parameters, and
its return type, ending in a colon.

```gate
GATE transferMoney(from: AccountId, to: AccountId, amount: Money<GBP>) -> TransferReceipt:
```
*Source: `examples/flow02.gate:2`.*

Anatomy:

| Part | Rule | Example |
|------|------|---------|
| `GATE` keyword | Literal, uppercase. | `GATE` |
| name | ASCII ident `[A-Za-z_][A-Za-z0-9_]*`. | `transferMoney` |
| params | `name: Type`, comma-separated; may be empty `()`. | `amount: Money<GBP>` |
| `->` | Literal return arrow (`U+002D U+003E`). | `->` |
| return type | A type name, optionally generic. | `TransferReceipt` |
| `:` | Trailing colon ends the signature line. | `:` |

Types are qualified names with optional generic arguments: `PatientView`, `Money<GBP>`,
`PCI<String>`, `Array<Email>`. `.gate` does not define new types — types come from the shared type
system. (Source: `SPEC-gate-language.md` §1 `type` production; `examples/flow02.gate`,
`examples/flow06.gate` `card: PCI<String>`.)

**Parameters are data, not the map.** A parameter like `customerId: CustomerRef` is a *slot*; the
literal value (e.g. `1234`) arrives at call time through the `[in] := IN` entry, not in the file.
(Source: `examples/demo-getCustomerById.gate:2-4,11`.)

### Mistake to avoid

```gate
GATE getCustomer(id)                     # ← WRONG: untyped param, no return type, no colon
```
Every parameter needs `: Type`, the gate needs `-> ReturnType`, and the line needs a trailing `:`.
Correct:

```gate
GATE getCustomer(caller: CallerId, id: CustomerRef) -> CustomerView:
```

---

## 3. One `GATE` per file (B5)

A `.gate` file contains **exactly one** `GATE`. A second `GATE` is rejected — historically, multiple
gates per file were silently mangled, so the language forbids it outright.

- Two `GATE` headers before any `FLOW`/`END` ⇒ rejected by the `single_gate` check.
- A second `GATE` after the first `END` ⇒ rejected by the post-`END` guard (nothing but comments and
  blank lines may follow `END`).

(Source: `SPEC-gate-language.md` §1 B5; `gate-check.mjs` `single_gate` + the post-`END` guard;
self-test `[B5]` cases.)

If you need two operations, write two `.gate` files. A hybrid app can contain many `.gate` and
`.fungi` files; they merge into one graph. (Source: workspace `README.md` §2.)

---

## 4. `END` — the terminator

The last structural line is `END` on its own line. After `END`, only comments and blank lines are
allowed; any further section (`EFFECTS`, `INTENT`, another `GATE`, …) is rejected as a smuggled
section.

```gate
    [logged:fu audit]    -> [+]
END
```
*Source: `examples/flow01.gate:18-19`.*

Why the post-`END` strictness matters: a trailing `EFFECTS { … }` after `END` would silently
*re-assign the reviewer-visible effect whitelist*, and a trailing `INTENT` would spoof the mandatory
intent check. Both are rejected. (Source: `gate-check.mjs` "ROUND-7 hole" post-`END` guard.)

### Mistake to avoid

```gate
    [logged:fu audit] -> [+]
END
  AUDIT off                              # ← WRONG: a section after END is rejected
```

---

## Putting the frame together (verified)

This minimal, **checker-passing** file shows only the frame (clauses/flow are covered next). It was
run through `gate-check.mjs` while writing this page and passes (`1/1 .gate files pass ALL checks`):

```gate
@version 1.0.0
GATE ping(caller: CallerId) -> Pong:
  INTENT  "A minimal pure gate: authorise, then return a result with no effects."
  EFFECTS { }
  FLOW:
    [in] := IN
    [in]     -> [authz]     ? authorised
    [authz]  -> [✓]                            # allowed
    [authz]  -> [×]                            # denied
    [authz]  -> [-]                            # undecidable -> deny drain (distinct)
    [×]      -> [-]                            # rejected -> deny (drains)
    [✓]      -> [pong:fu makePong]
    [pong:fu makePong] -> [+]
END
```
*Adapted from the corpus pattern (`examples/flow01.gate` header shape); verified with `gate-check.mjs`.*

---

### Next

→ [02 — The clause block](02-clauses.md): `INTENT`, `EFFECTS { }`, `PRIVACY`, `AUDIT`.
