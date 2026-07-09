# The `.gate` Language — Learning Library

`.gate` is Galerina's **light-ASCII, "draw-don't-code" authoring surface** for application logic.
You do not write statements; you **draw a map** of nodes and arrows. The prime directive is:

> *"Do not code, draw. It is not logic, it is a map."*

A `.gate` file declares **what** an app-level operation is allowed to do (its intent, effects, and
privacy rules) and then draws **how** data flows through it as an ASCII graph. The compiler reads
the drawing, proves it cannot leak or hallucinate, and lowers it to the same governed backend that
`.fungi` uses.

This library teaches you to read and write `.gate` from zero. Every construct, every rule, and
every worked example here is grounded in the three sources of truth (see
[Sources of truth & how these docs were verified](#sources-of-truth--how-these-docs-were-verified)).

---

## READ THIS FIRST — honest status of `.gate`

Before you learn the language, be clear about what it is and is **not** today. Overclaiming here
would be a security lie, so this section is blunt.

1. **`.gate` is the end-user APP-AUTHORING surface — not the runtime, not the kernel.**
   The Galerina runtime, core, and kernel are authored in **`.fungi`**, and only `.fungi`.
   `.gate` adds **new application-layer functions only**. It never builds the platform, is never
   discovered by the runtime's file walkers, and has **zero runtime footprint** — it compiles away
   ahead of time. (Source: `SPEC-gate-language.md` §0; `README.md` §3 hard-locks.)

2. **In PRODUCTION, `.gate` is currently FAIL-CLOSED OFF.**
   The production compiler's `.gate` front-end (`packages-galerina/galerina-core-compiler/src/gate-parser.ts`)
   parses and validates the declarative header, then **refuses to sign** a `.gate` artifact by
   emitting the error **`FUNGI-GATELANG-002` (`GateProductionEmitGatedOnBackstop`)**. Production
   signing is gated on a sound compile-time privacy backstop (`FUNGI-PRIVACY-002` / RD-0234c) that
   is **not yet wired**, and `parseGate` is **not wired into `cli.ts`**. So a `.gate` file **cannot
   currently build a signed, shippable app**. (Source: `gate-parser.ts:14-16,35-46`; `docs/TODO.md`
   line 84.) The R&D checker (`gate-check.mjs`) is an **authoring pre-filter / lint**, not a
   production gate.

3. **`.gate` shares the GIR → WASM backend with `.fungi`, and is proven GIR-identical.**
   Both `.fungi` and `.gate` are *source front-ends* that lower to the **one** in-memory graph
   logic IR (GIR), then to WASM. A `.gate` file and the equivalent `.fungi` file for the **same
   declared surface** (effects, capabilities, privacy) lower to the **same GIR and the same WASM** —
   proven by a swap-test (`proofs/rd-gate-model-proof.mjs`). `.gate` therefore adds a **surface, not
   new security**: every guarantee is discharged by the already-shipped Galerina governance engine.
   (Source: `SPEC-gate-language.md` §0, §2, §3.)

4. **The signature binds the IR digest, NEVER the `.gate` source.** Admission at runtime is the
   **signed capability**, not the drawn topology. A structurally perfect, exhaustive,
   hallucination-free map with **no signed capability ⇒ DENY at runtime**. The map never authorizes.
   (Source: `SPEC-gate-language.md` §0, §3 "Deny-only invariant".)

5. **The R&D checker is *necessary, not sufficient*.** It is an authoring pre-filter that catches
   the mechanical mistakes; it does **not** prove a program safe. Some checks (notably derived-value
   and un-named-egress privacy) are deliberately deferred to compile-time `FUNGI-PRIVACY-002` and
   surface as **loud INTERIM warnings**, never silent passes. A green from `gate-check.mjs` means
   "well-formed enough to author", not "cleared to ship". (Source: `SPEC-gate-language.md` privacy
   posture note; `gate-check.mjs` `privacy_cut`.)

**Bottom line:** treat this as a language you are learning and prototyping in, whose front-end is
built and self-consistent, but whose production emit path is intentionally switched off pending a
backstop. Do not tell anyone `.gate` is production-live. It is not.

---

## The pipeline in one picture

```
.fungi  ─┐
         ├──►  GIR (one graph logic IR, in-memory)  ──►  WASM  (runtime executes WASM)
.gate   ─┘
```

- **Two source front-ends, one IR.** `.fungi` (classic; builds the runtime *and* apps) and `.gate`
  (app-level only) both lower to the single GIR, then WASM.
- **Hybrid apps are allowed.** One app may mix `.fungi` and `.gate` files; they merge into ONE logic
  graph and one signed WASM.
- **Dense compute stays in `.fungi`.** There is no ASCII math. Arithmetic, strings, and tensors live
  in `.fungi` `fu` bodies that a `.gate` node *delegates to* (see
  [05 — `fu` delegation & `:cut`](05-fungi-delegation.md)).

(Source: `SPEC-gate-language.md` §0; workspace `README.md` §2.)

---

## Guided learning path

Read these in order. Each page explains one construct, shows correct syntax adapted from a **real**
example (cited), shows a common mistake to avoid, and names its source.

| # | Page | What you learn |
|---|------|----------------|
| 1 | [The header & signature](01-header-and-signature.md) | `@version 1.0.0` header (replaced `#gate` 2026-07-08), `GATE name(params) -> ReturnType:`, one gate per file, `END`. |
| 2 | [The clause block](02-clauses.md) | `INTENT`, `EFFECTS { }`, `PRIVACY deny …`, `AUDIT on/off` — the declarative contract. |
| 3 | [The `FLOW:` graph](03-flow-graph-syntax.md) | Nodes `[..]`, arrows `->`, entry `[x] := IN`, `? guard`, `@effect`, `decreases`/`hops`. |
| 4 | [Nodes, verdicts & drains](04-nodes-verdicts-drains.md) | The eight glyphs; `✓`/`×`/`-`/`+`/`!`/`?`; the ALLOW / HOLD / DENY tri-logic mapping. |
| 5 | [`fu` delegation & `:cut`](05-fungi-delegation.md) | `[name:fu op]` calls into `.fungi`; `[name:cut fu op]` is the explicit privacy cut. |
| 6 | [Worked examples](06-worked-examples.md) | Four full, checker-verified gates read end to end. |
| 7 | [Cheat sheet & gotchas](07-cheatsheet-and-gotchas.md) | One-page reference + the mistakes the checker rejects. |

**If you only read one page first,** read [04 — Nodes, verdicts & drains](04-nodes-verdicts-drains.md):
the glyph semantics (and the crucial distinction between the `×` reject arm and the `-` deny drain)
are the heart of the language.

---

## A complete `.gate` file at a glance

This is `demo-getCustomerById.gate` from the example corpus — a real, checker-passing file. Every
part is explained across pages 1–5.

```gate
@version 1.0.0
# Demo: request a database query for one customer record (e.g. customerID 1234).
# The literal value 1234 is DATA — it arrives through IN at call time; the map is the shape.
GATE getCustomerById(caller: CallerId, customerId: CustomerRef) -> CustomerView:
  INTENT  "Return one customer record for an authorised caller; PII is redacted before egress."
  EFFECTS { database.read, audit.write }
  PRIVACY deny PII CustomerEmail -> response.body
          deny protected CustomerId -> response.body
  AUDIT   on
  FLOW:
    [in] := IN                                                  # caller + customerId (1234) enter here
    [in]                -> [authz]              ? authorised     # K3 permission gate: True/False/Unknown
    [authz]             -> [✓]                                   # allowed -> continue track
    [authz]             -> [×]                                   # denied -> reject arm (distinct False)
    [authz]             -> [-]                                   # unknown -> deny drain (distinct default)
    [×]                 -> [-]                                   # denied caller drains to deny (deny-by-default)
    [✓]                 -> [record:fu dbQuery]  @database.read   # .fungi fu body runs: SELECT ... WHERE id = :customerId
    [record:fu dbQuery] -> [view:cut fu redactPII]              # EXPLICIT CUT (:cut) — strips CustomerId/CustomerEmail
    [view:cut fu redactPII] -> [logged:fu audit] @audit.write   # audit trail: who read customer 1234, when
    [logged:fu audit]   -> [+]                                  # egress: ONLY the redacted view can leave
END
```
*Source: `ZT-Galerina-GRAPH-ASCII-v2/examples/demo-getCustomerById.gate` (passes `gate-check.mjs`).*

Read it as a **security reviewer, not a coder**: there is **no drawn edge** from `[record:fu dbQuery]`
straight to `[+]`. The only path from the raw record to egress passes through the explicit `:cut`
node, and that node **dominates** the `[+]` egress — so by *shape*, the raw PII cannot leave.

---

## Sources of truth & how these docs were verified

Per the accuracy discipline for this library, everything here is grounded in the `.gate` design
workspace `<GitHub>\ZT-Galerina-GRAPH-ASCII-v2` (read-only; not a git repo):

1. **The spec** — `SPEC-gate-language.md` (v0.4). The normative grammar + Rosetta stone + compiler-gate spec.
2. **The checker** — `tools/gate-check.mjs` (the v0.4 reference validator). **This is what actually
   runs**, so where the spec and the checker could be read differently, these docs follow the
   checker and say so.
3. **The examples** — `examples/*.gate` (`flow01`–`flow20` + `demo-getCustomerById`). Real,
   checker-passing `.gate` source. Snippets here are copied or minimally adapted from them, and each
   is cited.

**Verification performed while writing these docs** (so the syntax here is not invented):

- `node tools/gate-check.mjs examples` → **`21/21 .gate files pass ALL checks`**.
- `node tools/gate-check.mjs --self-test` → **`136 passed, 0 failed`** (a probe for every construct
  and every audit blocker).
- Each "correct" and "wrong" snippet used in these pages was run through `gate-check.mjs` and behaved
  exactly as documented (the wrong ones fail with the cited message; the right ones pass).

**Production status cross-check** (in this repo): `gate-parser.ts` (the `FUNGI-GATELANG-002`
fail-closed gate), `docs/TODO.md` line 84, and `build/code-index/CODE_INDEX.md` (the code is
`referenced`, at `gate-parser.ts:42`).

> Naming caution: there are three different things called "gate" in this project — the in-`.fungi`
> `gate()` block, the `GATE` container keyword (used *by* this language), and the **`.gate` file**
> (this language). This library is only about the third. Also note the older
> `docs/examples/gate/` folder was renamed to `docs/examples/gir/` because it held compiled **GIR**
> examples, not `.gate` source — do not confuse them.
> (Source: `ZT-Galerina-GRAPH-ASCII-v2/README.md` §5; KB `galerina-gate-docs-examples-model-collision-2026-07-02.md`.)
