# 04 — Nodes, verdicts & drains (the tri-logic)

This is the heart of `.gate`. The language has **eight frozen glyphs**, and the *glyph alone*
decides polarity — a reviewer must never read a word that contradicts the mark. Get these right and
you can read any `.gate` map as a security proof.

> **The single most common confusion:** the `×` **reject arm** and the `-` **deny drain** are
> **distinct**. A `?` tri-state test needs *both*, plus the `✓` continue arm — three separate arms.
> This page makes that mapping exact.

---

## 1. The frozen eight (exact codepoints)

The symbol set is frozen at eight tokens, each at an **exact Unicode codepoint**. Any look-alike
(ballot-X `✗` U+2717, multiplication variants, fullwidth forms, Cyrillic/Greek homoglyphs) is a
**compile error**, never silently accepted.

| Token | Codepoint | Meaning | Lowers to (GIR / `.fungi`) |
|-------|-----------|---------|-----------------------------|
| `->` | U+002D U+003E | directed vector (data/control flow) | statement sequence / value threading |
| `[name]` | `[` `]` | node = sandbox boundary (own WASM memory region) | a `let`/step binding |
| `[name:fu op]` | — | node delegating dense compute to a `.fungi` `fu` body | call into a pure `fu` function |
| `[name:cut fu op]` | — | **explicit privacy cut** (re-type/redaction vertex) | a re-type/redaction effect (`FUNGI-PRIVACY-002`) |
| `✓` | **U+2713** | boolean True / continue arm | `if` (then) arm |
| `×` | **U+00D7** | boolean False / reject arm | `else` arm |
| `?` | U+003F | tri-state test (True/False/Unknown, K3) | `match` on `Tri`, all three arms |
| `!` | U+0021 | panic drain (emergency unwind, fail-closed) | `trap` / hard reject |
| `-` | U+002D | resource drain / deny arm | governed `deny` |
| `+` | U+002B | success egress / yield | `return` |

*Source: `SPEC-gate-language.md` §1.1 (the FROZEN eight, at EXACT codepoints).*

**Polarity is decided by the glyph, not the label** (B1). `✓` and `+` are **positive**; `×`, `-`,
and `!` are **negative**; `?` is the undecided test. (Source: `SPEC-gate-language.md` §1.1.)

### Look-alikes are rejected

```gate
    [q]->[✗]        # ← WRONG: ✗ is U+2717 (ballot X), not the exact × U+00D7 — REJECTED
```
*Source: `gate-check.mjs` self-test `[B4] ballot-X ✗ (U+2717) REJECTED`.* Use `×` (U+00D7).

---

## 2. Mark labels — for identity, polarity-locked

A mark may carry an ASCII label to give it a distinct identity: `[✓ok]`, `[×denied]`, `[+done]`,
`[✓aml]`, `[×fund]`. This matters when the same glyph appears more than once.

Rules:

- **Anti-spoof (B1).** A label may **not** imply the opposite polarity of its glyph. A positive
  glyph wearing a negative word (`[✓denied]`), or a negative glyph wearing a positive word (`[-ok]`),
  is a compile error *"Label polarity spoof"*. Matched case-insensitively as a substring, so
  `nogrant`, `notok` also trip. (Source: `SPEC-gate-language.md` §1.2; self-test `[B1] [✓denied]
  REJECT`, `[-ok] REJECT`, `[✓ok] ACCEPTED`.)
- **ASCII only (B4).** `[✓café]` is rejected.
- **Label duplicated marks.** If the *same bare mark* is fed by more than one parent, you must label
  the occurrences — an unlabelled collision is *"Ambiguous mark node"*. (Source: `gate-check.mjs`
  `mark_collision` for `✓`/`×`/`?`; self-test `bare [✓] fed by two parents REJECTED`.)

Real labelled marks in the corpus: `[✓fund]`/`[×fund]`, `[✓aml]`/`[×aml]` (`flow02`),
`[✓tds]`/`[×tds]` (`flow06`), `[✓confident]`/`[×lowconf]` (`flow11`).

---

## 3. The tri-logic mapping: ALLOW / HOLD / DENY

Galerina's decisions are **three-valued** (Kleene K3 / the `+1 / 0 / -1` contract logic that `.gate`
grew from). Every `?` test resolves to one of three outcomes, and each maps to a glyph arm:

| Tri-logic | K3 | Glyph arm | What it means | Where it must go |
|-----------|----|-----------|--------------|-------------------|
| **ALLOW** | `+1` (True) | `✓` | condition holds — continue the transaction | onward to work, ultimately `[+]` |
| **DENY (False)** | `-1` (False) | `×` | condition is definitely false — reject | must drain to `[-]` (or re-auth) |
| **HOLD / Unknown** | `0` | `-` (or `!`) | condition is undecidable — fail closed | the **default drain** `[-]`/`[!]` |

The **`×` (False)** and the **`-` (Unknown/deny-drain)** arms are **different edges** and mean
different things:

- `×` = *"the test came back False"* (a definite negative verdict).
- `-` = *"the test could not be decided, or the branch is denied — drain it, fail closed."*

A single `-` may **not** serve as both the False arm and the default drain — that would collapse
False into Unknown, which K3 forbids. (Source: `SPEC-gate-language.md` §1.4 + M4; `gate-check.mjs`
`exhaustive`; self-test `[M4] tri-state with only … REJECTED`.)

### The canonical authorization pattern (real)

Almost every corpus file opens with this exact three-arm shape:

```gate
    [in]                -> [authz]              ? authorised     # K3 permission gate
    [authz]             -> [✓]                                   # ALLOW: caller holds capability -> continue
    [authz]             -> [×]                                   # DENY (False): caller lacks capability
    [authz]             -> [-]                                   # HOLD (Unknown/undecidable) -> deny drain (DISTINCT)
    [×]                 -> [-]                                   # rejected caller drains to deny (no effect, no egress)
```
*Source: `examples/flow01.gate:10-14` (and `demo-getCustomerById`, `flow02`, `flow04`–`flow12`, …).*

Note the two separate lines `[authz] -> [×]` and `[authz] -> [-]`, and then `[×] -> [-]` (the False
arm *drains into* the deny). This is the shape the checker requires.

---

## 4. Exhaustiveness — no silent fall-through

Two exhaustiveness rules (deny-by-default is un-representable-otherwise, Rust `_ =>`-style):

- **A `?` tri-state test** (whether via a `? guard` edge **or** a bare `[?]` node) needs **three
  DISTINCT out-edges**: True (`✓`), False (`×`), and a default drain (`-` or `!`). Missing or
  collapsed ⇒ *"Non-Exhaustive Spatial Match"*. (Source: `SPEC-gate-language.md` §1.4; `gate-check.mjs`
  `exhaustive`; self-test `[H3]` bare-`[?]` cases.)
- **A boolean split** (a node with a `✓` out-edge) must also carry a **reject/drain** arm
  (`×`, `-`, or `!`). A `✓`/`+` split — where *both* outcomes reach success egress — is rejected: a
  `[+]` success-egress is **not** a reject arm. (Source: `gate-check.mjs` `exhaustive` "ROUND 4 hole
  #2"; self-test `split with ONLY ✓ … REJECTED`.)

### Mistake to avoid — collapsing False into the drain

```gate
    [in]  -> [q]  ? ready
    [q]   -> [✓]
    [q]   -> [-]                          # ← WRONG: no distinct × (False) arm
    [✓]   -> [+]
```
Rejected: *"tri-state at [q] needs DISTINCT True/False/default-drain edges (K3 no-collapse, M4)"*.
(Verified while writing this page.) Correct — add the `×` arm:

```gate
    [in]  -> [q]  ? ready
    [q]   -> [✓]
    [q]   -> [×]
    [q]   -> [-]
    [✓]   -> [+]
    [×]   -> [-]
```

---

## 5. Drains and egress — `-`, `!`, and `+`

### `+` success egress (ALLOW terminus)

`[+]` is the only way data leaves the trust boundary successfully — the `return`. Reaching `[+]`
means the transaction advanced to completion.

```gate
    [logged:fu audit]   -> [+]                                  # egress: ONLY the redacted view can leave
```
*Source: `examples/demo-getCustomerById.gate:20`.*

### `-` deny drain (DENY terminus)

`[-]` is a governed `deny` — the transaction stops, fail-closed, with no egress.

**Deny-arm semantics (B3) — a `×`/`-` arm may only drain.** On every path from a `×`/`-` arm-head up
to its terminal drain, there must be **no `[+]` egress** and **no privileged `@effect`** — **unless**
re-authorised by a *fresh* `? guard`. The single documented exception: **`@audit.write` is allowed**
on a deny arm (recording the denial itself; forbidding it would make denials silent). Every other
effect is forbidden on a deny arm. (Source: `SPEC-gate-language.md` §1.5; `gate-check.mjs`
`deny_arm_semantics`, `DENY_ARM_ALLOWED_EFFECTS = {audit.write}`.)

```gate
    [×]                      -> [audit_fail:fu auditFail] @audit.write   # deny-arm audit carve-out
    [audit_fail:fu auditFail] -> [-]                                     # then drains, no session issued
```
*Source: `examples/flow03.gate:22-23`.*

### `!` panic drain (fail-closed unwind)

`[!]` is an emergency unwind. **A panic must terminate in a deny drain `[-]`, never reach `[+]`.** A
panic that reaches success egress, or one that resumes through a *non-terminal* drain, is rejected.
The **one** legitimate thing on a panic subgraph is fail-closed **compensation** (e.g. a rollback
`@database.write`) that then drains to a **terminal** `[-]`. (Source: `SPEC-gate-language.md` §1.5;
`gate-check.mjs` `panic_no_egress`; self-test `[H1]`/`[H6]`.)

The real rollback pattern (`flow17`, `provisionTenant`):

```gate
    [ok]              -> [!]                                           # provision state unknown -> panic rollback
    [×failed]         -> [!]                                           # explicit failure also drains to panic rollback
    [!]               -> [rollback:fu dbRollback]    @database.write   # fail-closed compensation: unwind the partial tenant
    [rollback:fu dbRollback] -> [-]                                    # after unwind: governed deny (no handle egress)
```
*Source: `examples/flow17.gate:17-20` (passes all checks).*

---

## 6. Re-authorising a `×`/`-` arm with a FRESH guard

A `×`/`-` branch that *legitimately* continues (a "medium-risk → manual review", an "expired but
returnable", a loop-exit that assembles a result) must pass through a **new** `? guard` that
re-establishes authority. The re-authorised subgraph then carries its **own** K3 exhaustiveness and
drains. Only the guard target's **own `✓` arm** is exempted — a privileged effect hung on a *sibling*
of the guard target is still rejected. (Source: `SPEC-gate-language.md` §1.5; `gate-check.mjs`
`deny_arm_semantics` "ROUND-9"; self-test `[B3]`/`[R9-2]`.)

Real example — the low-confidence branch is re-authorised before it may reach the review egress:

```gate
    [×lowconf]        -> [route]                    ? reviewAllowed # FRESH guard re-authorises the review egress path
    [route]           -> [✓review]                                 # human review permitted
    [route]           -> [×noreview]                               # review not permitted
    [route]           -> [-]                                       # review policy unknown -> deny drain (distinct)
    [×noreview]       -> [-]                                       # no review path -> deny (drains)
    [✓review]         -> [review:fu flagForReview]                 # low-confidence routed to human review
```
*Source: `examples/flow11.gate:20-25`.*

### Mistake to avoid — a deny arm that advances

```gate
    [q]   -> [✓]
    [q]   -> [×]
    [q]   -> [-]
    [×]   -> [bad:fu leak] @database.read     # ← WRONG: privileged effect on a deny arm (B3)
    [bad:fu leak] -> [+]                       # ← WRONG: deny arm reaches [+] with no fresh guard (B3)
    [✓]   -> [+]
```
Rejected: *"deny arm [×] performs privileged effect @database.read …"* and *"deny arm [×] reaches
egress [+] with no fresh guard"*. (Source: self-test `[B3]`.) A `×` arm must drain to `[-]` (or pass
a fresh `? guard` first).

---

## 7. Junction adjudication — what `-{or}-` means for verdicts

Fan-in already exists: two edges into one node (`[a] -> [j]`, `[b] -> [j]`) *is* the junction — **no new
syntax**. The only open question is what a junction *means* for verdicts, and K3 answers it (MIN, never MAX;
RD-0259 / RD-0287d). The adjudication is fixed:

| Junction form | K3 reading | Verdict |
|---|---|---|
| `{or}` of **deny** signals | "any reason to deny ⇒ deny" ≡ **min** on the verdict plane | **SOUND** — exactly what `×`/`-` arms draining to `[-]` already do; deny-side convergence is fail-closed by construction |
| `{or}` of **ALLOW** arms | `vOr = max` — one lane could *manufacture* ALLOW past the others | **REFUSED — "ALLOW-side wired-OR"** (the RD-0259 forgery shape; violates B1: a junction whose meaning contradicts its safest reading) |
| `{not}` on a **verdict** | polarity inversion (deny ↔ allow) | **REFUSED on the verdict plane** — an operator-level polarity spoof; negation stays in `.fungi` *data* logic, never on a verdict |

**Rule.** Deny-side convergence is free (fail-closed by construction). Two or more **positive**-polarity arms
converging and then proceeding to effects/egress *without a fresh `? guard`* is an ALLOW-side wired-OR and is
**rejected** — the `join_polarity` check (roadmap) enforces it in one linear pass, the same class as
exhaustiveness (§4). This is a written answer, not new grammar: the `.gate` v0.4 accept set is unchanged.

> **EE drafting lesson (RD-0287f).** A junction must be drawn explicitly (the dot convention — a junction is
> not a crossing), and **4-way junctions are banned**: stagger into two 3-ways. A 50-year schematic-error import.

## 8. Reading a map as a proof (summary)

Given the glyph semantics, a reviewer can read a `.gate` file as a mechanical argument:

1. **ALLOW paths** run `✓` → work → `[+]`.
2. **DENY paths** run `×` → `[-]` (with at most `@audit.write`).
3. **HOLD/Unknown paths** run `-` (or `!`) → drain, fail closed.
4. **No fall-through**: every `?` and every boolean split is exhaustive.
5. **No smuggling**: deny/panic arms carry no privileged effect and reach no `[+]` without a fresh
   guard.
6. **Deny-only**: none of this *authorizes* — admission is still the signed capability at runtime.

---

### Next

→ [05 — `fu` delegation & `:cut`](05-fungi-delegation.md): calling into `.fungi`, and the explicit
privacy cut that these deny/egress rules keep pointing at.
