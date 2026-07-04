# 02 — The clause block

Between the signature line and `FLOW:` sits the **declarative clause block**. These clauses are the
gate's *contract*: they say what it means, what side effects it may perform, what sensitive data must
not leak, and whether it is audited. They map 1:1 onto the shipped `.fungi` `contract { }`.

Order and presence:

```ebnf
gate = "GATE" … ":" newline , intent , effects , [ privacy ] , [ audit ] , flow , "END" newline ;
```
- **`INTENT`** — mandatory.
- **`EFFECTS { }`** — mandatory (may be empty only if the flow performs zero effects).
- **`PRIVACY`** — optional.
- **`AUDIT`** — optional.

*Source: `SPEC-gate-language.md` §1; mandatory-ness enforced by `gate-check.mjs` `sections_present` (M2).*

Indentation is insignificant to the parser, but the corpus indents clauses by two spaces for
readability. (Source: `SPEC-gate-language.md` §1 "indentation insignificant".)

---

## 1. `INTENT` — the audit string (mandatory)

A single human-readable string describing the operation's purpose. It is **mandatory** (M2): a gate
without `INTENT` is rejected.

```gate
  INTENT  "Return a patient record to an authorised caller; PatientId and SSN are redacted before egress."
```
*Source: `examples/flow01.gate:3`.*

- It is a governance/audit string, not executable — but do not write one that contradicts the map.
  (The **edges are the truth**; comments and prose carry no authority — see page
  [03](03-flow-graph-syntax.md) on `m2`.)
- Keep it accurate: `INTENT` is exactly the kind of free-text that a zero-trust reviewer will
  cross-check against the drawn flow.

### Mistake to avoid

Omitting it entirely:

```gate
GATE t(x: T) -> R:
  EFFECTS { }                            # ← WRONG: no INTENT above ⇒ rejected (M2 mandatory)
  FLOW:
```
Rejected: *"missing INTENT (M2 — mandatory)"*.

---

## 2. `EFFECTS { }` — the effect whitelist (mandatory)

A brace-delimited, comma-separated set of the side effects this gate is allowed to perform. It is
**mandatory** (M2). Every `@effect` annotation drawn on an edge in the `FLOW` **must** appear here —
this is the whitelist.

```gate
  EFFECTS { database.read, database.write, ledger.mutate, audit.write }
```
*Source: `examples/flow02.gate:4`.*

Rules the checker enforces:

- **Canonical vocabulary, live from the compiler.** Effect names are validated against the shipped
  compiler's registry (`effect-checker.ts` `CANONICAL_EFFECTS`), not a list frozen in the grammar.
  An **unknown** effect is rejected; a **broad alias** (e.g. `secret.access` → `secret.read`) warns
  but resolves (mirrors `FUNGI-EFFECT-005`); a **non-broad alias** (e.g. `db.read`, `http.get`) is
  **rejected** exactly as a production compile would (`FUNGI-EFFECT-004`). (Source: `gate-check.mjs`
  `effects_canonical`; self-test `db.read REJECTED`, `secret.access WARNS`.)
- **Whitelist domination.** If an edge performs `@database.read`, then `database.read` must be in
  `EFFECTS { }`. An undeclared edge effect is rejected ("edge effects not in EFFECTS{}"). (Source:
  `gate-check.mjs` `effects_declared`.)
- **Empty is legal only when truly effect-free.** `EFFECTS { }` is fine **iff** no `@effect` edges
  exist. If the flow draws `@database.read` but `EFFECTS { }` is empty, it is rejected. (Source:
  `sections_present`; self-test `empty EFFECTS with zero effect edges ACCEPTED`.)
- **Exactly once.** A second `EFFECTS` block is rejected — a duplicate would silently widen the
  reviewer-visible whitelist. (Source: `gate-check.mjs` "ROUND-9" duplicate-EFFECTS guard.)

Common canonical effects seen across the corpus: `database.read`, `database.write`, `storage.write`,
`ledger.mutate`, `secret.read`, `audit.write`, `network.outbound`, `network.inbound`, `ai.inference`.
(Source: `examples/flow01`–`flow20`.)

### Mistake to avoid

```gate
  EFFECTS { db.read, audit.write }       # ← WRONG: db.read is not canonical (use database.read)
```
Rejected: *"non-canonical/rejected effects: db.read (unknown … did you mean "database.read"?)"*.
The `did you mean?` hint is advisory only — the unknown name still fails closed.

---

## 3. `PRIVACY` — deny rules (optional but load-bearing)

Zero or more **deny rules**, each of the form `deny <class> <field> -> <sink>`. A rule declares:
*data of sensitivity `<class>`, in field `<field>`, must never reach `<sink>`.* Multiple rules
stack; continuation rules are written under the `PRIVACY` keyword.

```gate
  PRIVACY deny protected PatientId -> response.body
          deny protected SSN       -> response.body
```
*Source: `examples/flow01.gate:5-6`. Single-rule form: `examples/flow02.gate:5`
(`deny protected accountPAN -> audit.log`).*

Grammar of one rule:

```ebnf
priv_rule = "deny" , ws , sens_class , ws , qname , ws , "->" , ws , qname ;
```

### 3a. The sensitivity class (`<class>`)

The class is **machine-validated live against production**, with **no enum in the grammar and no
hand-aliases**. A class is valid only if it is either:

- a **type qualifier** from `type-registry.ts` `TYPE_QUALIFIERS`:
  `protected`, `redacted`, `unsafe`, `safe`, `secret`; **or**
- a **domain class** `PII` / `PHI` / `PCI` — valid **iff** its effect family is live in the compiler
  (`pii.*` / `phi.*` / `payment.*` respectively).

Anything else — including the dead hand-aliases `confidential` and `sensitive` — is **rejected**.
(Source: `SPEC-gate-language.md` §1 B6/ZT-1, §3; `gate-check.mjs` `sens_class`, `loadSensVocab`;
self-test `[ZT-1]` cases.)

Real usages across the corpus: `protected` (`flow01`, `flow02`, `flow05`, `flow07`, `flow12`),
`secret` (`flow03`, `flow04`, `flow10`), `PII` (`demo-getCustomerById`, `flow09`, `flow11`),
`PHI` (`flow20`), `PCI` (`flow06`).

### 3b. The field (`<field>`) and sink (`<sink>`)

Both must **resolve in the flow** (M1) — a rule about a field the flow never handles, or a sink that
appears nowhere, is **vacuous** and rejected. The checker locates the field via node/op/effect names
or a sensitive-read edge, and the sink via a node/op/effect name or a recognised egress family
(`response`, `audit`, `storage`, `network`, `tenant`, `ai`, `process`, `worker`, `email`). (Source:
`gate-check.mjs` `privacy_cut` M1a/M1b; self-test `[M1] … vacuous privacy REJECTED`.)

### 3c. What a PRIVACY rule *obligates*

Declaring `deny protected PatientId -> response.body` is not just documentation — it makes the
checker **prove** that no sensitive-read path reaches that sink without passing an **explicit `:cut`
node** that *dominates* the sink. If the raw field can reach the sink uncut, the file is rejected.
This is why real examples route reads through a `[view:cut fu redactPHI]` node before `[+]`. The
mechanics are on page [05](05-fungi-delegation.md); the tri-logic is on page
[04](04-nodes-verdicts-drains.md).

> **Honest limit (posture B).** A sensitive read reaching an **un-named** egress, or a **derived**
> value (e.g. `@ai.inference` output) reaching egress, is a case the topological pre-filter cannot
> decide. The checker emits a **loud INTERIM warning** (never a silent pass) and defers the sound
> verdict to compile-time `FUNGI-PRIVACY-002`. A file can therefore *pass* while carrying such a
> warning. Do not read a warned pass as "safe". (Source: `SPEC-gate-language.md` privacy-posture
> note; `gate-check.mjs` `privacy_cut` posture-B backstop; observed on `flow11`/`flow12`/`flow13`/`flow18`.)

### Mistake to avoid

```gate
  PRIVACY deny confidential Ssn -> response.body    # ← WRONG on two counts
```
1. `confidential` is a dead alias — rejected ("unknown sens_class … hand aliases are dead in v0.4").
2. Even with a valid class, if `Ssn`/`response.body` don't resolve in the flow it is vacuous.
Correct form (class `protected`, field + sink both present in the flow):

```gate
  PRIVACY deny protected SSN -> response.body
```

Also note: `deny` is a **PRIVACY-only** keyword. A `deny …` line inside `FLOW` (or anywhere outside
`PRIVACY`) is rejected (M3) — in the flow, denial is drawn with the `-` glyph, not the word `deny`.
(Source: `gate-check.mjs` M3; self-test `[M3]`.)

---

## 4. `AUDIT` — on / off (optional)

Whether the operation is audited. Value is `on`, `off`, or a string.

```gate
  AUDIT   on
```
*Source: `examples/flow01.gate:7`. `off` form: `examples/flow13.gate:5`.*

- `AUDIT on` is the norm for anything touching data or effects.
- `AUDIT off` appears for a pure-ingest telemetry flow (`flow13`).
- Note this is **separate** from the `audit.write` *effect*: if your flow draws an `@audit.write`
  edge, you still declare `audit.write` in `EFFECTS { }`. `AUDIT on` is the contract-level flag;
  `@audit.write` is the drawn effect. (Source: `examples/flow01.gate` uses both.)

---

## Full clause block (verified, real file)

```gate
#gate 0.3
GATE getCustomerById(caller: CallerId, customerId: CustomerRef) -> CustomerView:
  INTENT  "Return one customer record for an authorised caller; PII is redacted before egress."
  EFFECTS { database.read, audit.write }
  PRIVACY deny PII CustomerEmail -> response.body
          deny protected CustomerId -> response.body
  AUDIT   on
  FLOW:
    ...
END
```
*Source: `examples/demo-getCustomerById.gate:1-10` (passes `gate-check.mjs`).*

---

### Next

→ [03 — The `FLOW:` graph](03-flow-graph-syntax.md): nodes, arrows, guards, and edge annotations.
