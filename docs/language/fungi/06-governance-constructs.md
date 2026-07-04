# 06 — Governance Constructs

> Grounded in: `parser.ts` — `parseGuardDecl` (~2932), `parseGateBlock` (~3285),
> `parseAccessBlock` (~3022), `parseContractDecl`/`conforms_to` (3959-3984), `parseTrapStmt` (1643),
> `parseGovernedFlow` (945-972), `parseBitfieldDecl` (~3204), `parseStaticDecl` (3158-3180),
> `parseImportStmt` (~5209). Real examples: `examples/foundations/guard-domain-ceiling.fungi`,
> `.../gate-access-example.fungi`, `.../hardened-border-plugin.fungi`, `.../static-bitfield-example.fungi`,
> `.../comment-styles-example.fungi`.

These are the constructs that make Galerina *governance-first*: they declare who may run code, the
maximum a piece of code may ever do, and how to prove at compile time that a flow stays within its
ceiling. They fail **closed**.

## `guard` — a domain ceiling

A `guard` declares the **maximum** set of capabilities (and resource limits) that any flow beneath it
may request. It is the outer wall: a contract can ask for *less*, never *more*
(`parser.ts:2932`). From `examples/foundations/guard-domain-ceiling.fungi:23-48`:

```fungi
guard PaymentServiceGuard {
  permitted_effects {
    database.write
    database.read
    audit.write
    network.outbound
  }
  enforced_limits {
    max_memory_ceiling: 16MB
    max_compute_budget: 1000
  }
}
```

* `permitted_effects { ... }` — the allow-list of effects. Anything not listed is permanently
  unavailable to conforming flows.
* `enforced_limits { ... }` — resource ceilings the runtime clamps to (`max_memory_ceiling`,
  `max_compute_budget`, ...). These are `key: value` pairs; there is **no `BOUND` keyword** — if you
  see `BOUND` in a doc, it isn't real.

### Inheritance: `parent_policy`

A child guard names a parent and then narrows it. The compiler enforces **child ⊆ parent** — a child
cannot re-introduce a capability the parent denies (`parser.ts:2958-2966`).

```fungi
guard InvoiceReadGuard {
  parent_policy: PaymentServiceGuard   // inherit the parent ceiling…
  permitted_effects {
    database.read                      // …then narrow to read-only (a subset)
  }
}
```

## `[conforms_to: Guard]` — Differential Proof

Bind a flow's contract to a guard with the `[conforms_to: G]` attribute on the contract header. At
**compile time** the verifier proves `contract.effects ⊆ guard.permitted_effects`; if the flow
requests an effect the ceiling doesn't grant, **the build fails** — privilege escalation is impossible
by construction (`parser.ts:3959-3984`). From `guard-domain-ceiling.fungi:53-63`:

```fungi
secure flow processPayment(amount: Int) -> Result<Bool, Error>
contract [conforms_to: PaymentServiceGuard] {
  intent "Process a payment within the payment service ceiling"
  effects { database.write, audit.write }   // proven ⊆ PaymentServiceGuard.permitted_effects ✅
  invariant { ensure amount > 0  ensure amount <= 1000000 }
}
{
  trap amount <= 0 : ERR_ZERO_AMOUNT
  trap amount > 1000000 : ERR_AMOUNT_TOO_LARGE
  return Ok(true)
}
```

Adding `shell.execute` to that `effects` block would fail the conformance proof. `[conforms_to: G]` is
an **attribute on the contract header** — not a sub-block inside `contract {}`, not a separate outer
block.

## `gate(condition) { … }` — admission perimeter

A `gate` wraps one or more flows in an **admission** check: only callers satisfying the condition
(here, holding a named guard) may reach *any* flow inside (`parser.ts:3285`). It answers "**who** gets
in at all," and maps to the topology/admission bit (`dag_edge_valid`, V_DPM bit 8). From
`examples/foundations/gate-access-example.fungi:35-50`:

```fungi
gate(AdminOperationsGuard) {
  secure flow deleteRecord(recordId: String) -> Result<Bool, Error>
  contract {
    intent "Delete a record — admin-only, audit-required"
    effects { database.write, audit.write }
    invariant { ensure recordId != "" }
  }
  {
    ;; Unreachable unless the caller cleared the gate (held AdminOperationsGuard).
    trap recordId == "" : ERR_EMPTY_RECORD_ID
    return Ok(true)
  }
}
```

> **`gate(...)` inline vs the `.gate` file format.** There is a *separate* `.gate` file parser
> (`packages-galerina/galerina-core-compiler/src/gate-parser.ts`) — an ASCII authoring surface for
> writing gate/policy files. That is a different thing. This page is about the **inline `gate(...)`
> construct inside `.fungi`**.

## `access { grant … }` — per-flow capability boundary (Default-Deny)

Where `gate` controls admission, `access` controls **what an admitted caller may bring across** into a
single flow. It sits **between** the contract and the body (never inside the contract), and it is
**Default-Deny**: you list only what is granted — everything else is refused, and you **never write
`deny`** (`parser.ts:3022`). From `gate-access-example.fungi:55-69`:

```fungi
secure flow processRequest(payload: String) -> Result<Bool, Error>
contract {
  intent "Process an incoming request"
  effects { allow database.write, allow audit.write }
}
access {
  grant database.write    ;; explicitly admitted
  grant audit.write       ;; explicitly admitted
  ;; everything else is implicitly DENIED — omission IS the denial
}
{
  trap payload == "" : ERR_EMPTY_PAYLOAD
  return Ok(true)
}
```

`access {}` also accepts `purpose "tag"`, `allow TypeName to "action"`, and `require effect.name`
clauses (for negotiating which data types cross the boundary), but `grant` is the governance-critical
form. Remember: `access` is a **filter**, not a widener — the contract's effects must already permit
what you grant.

### `gate` vs `access` vs `guard` — one sentence each

* `guard G { … }` — the *ceiling*: the most any conforming flow may ever do.
* `gate(G) { … }` — the *perimeter*: which callers may reach the flows inside at all.
* `access { grant … }` — the *doorway*: what an admitted caller may carry into this one flow.

They compose: a caller must pass the gate **and** hold the granted capabilities, and the flow's
contract must stay within the guard.

## `governed <floor> flow` — Tower floor qualifier

A flow header form that tags the flow with a "Tower floor" used by the admission/topology check
(`parser.ts:945-972`; defaults to `floor_3` if the label is omitted). From
`examples/foundations/comment-styles-example.fungi:28`:

```fungi
governed floor_3 flow validatePaymentAmount(amount: Int, currency: String) -> Bool
contract { intent "Validate payment amount in the Proof Zone"  effects { allow audit.write } }
{ ... }
```

The floor label (`floor_3`) is a plain identifier the parser records; it doesn't by itself restrict
the flow to read-only — it places the flow in a security tier.

## `trap COND : ERR_CODE` — fail-closed input rejection

`trap` fires a trap (rejects execution) **when its condition is TRUE** — it is the *inverse* of
`ensure` (which asserts a condition should hold). It carries a named error code for the audit trail
(`parser.ts:1643-1671`). It is the idiomatic input-interrogation guard at the top of a body:

```fungi
trap amount <= 0 : ERR_ZERO_AMOUNT           // fires WHEN amount is <= 0
trap currency == "" : ERR_EMPTY_CURRENCY
```

> **Common mistake:** reading `trap amount < 0` as "require amount ≥ 0." It means "**trap if** amount
> is negative" — the condition is the *failure* case, not the success case.

`ensure` (inside `invariant {}`) and `trap` (in the body) are complementary: `ensure amount > 0` and
`trap amount <= 0 : ERR_...` express the same guarantee from opposite directions.

## `static` and `bitfield` — compile-time constants and capability registers

Both are **top-level declarations** (not contract sub-blocks). From
`examples/foundations/static-bitfield-example.fungi`:

```fungi
;; static NAME = value — a compile-time constant; the compiler substitutes the value
;; at each use site (it is folded to a literal in the emitted output).
static MAX_RETRIES = 3
static MAX_PAYLOAD_SIZE_KB = 512

;; bitfield NAME { field: bit } — names the bits of a V_DPM capability register.
;; Reading NAME.field yields the bitmask (1 << bit), computed at compile time.
bitfield ServiceCapabilities {
  network_outbound:  0     ;; mask 1
  secret_access:     2     ;; mask 4
  audit_write:       3     ;; mask 8
  database_write:    4     ;; mask 16
}
```

Usage inside a flow:

```fungi
let limit: Int = MAX_PAYLOAD_SIZE_KB          // folds to 512
trap sizeKb > limit : ERR_PAYLOAD_TOO_LARGE
return ServiceCapabilities.network_outbound   // = 1  (bit 0)
```

`bitfield` diagnostics: duplicate bit position → `FUNGI-BF-001`; position > 31 → `FUNGI-BF-002`
(the register is 32-bit). `static` diagnostics: non-constant value → `FUNGI-STATIC-001`; redeclared
name → `FUNGI-STATIC-002`.

## Imports and plugins: `import plugin safe | assimilate`

A `.fungi` file can import other files and bridge plugins across a hardened boundary
(`parser.ts:~5209`). From `examples/foundations/hardened-border-plugin.fungi:25-35`:

```fungi
import plugin safe "./plugins/payment-gateway.fungi" as Pay {
  contract {
    intent "Payment gateway — Hot-Code Residency, stateless per call"
    access {
      ;; Default Deny — only these capabilities are granted to the plugin.
      grant network.outbound
      grant audit.write
    }
  }
}
```

* `import plugin safe "…" as X { … }` — a sandboxed, demand-loaded plugin; calls are mediated by the
  plugin's `access {}` boundary. Permitted in any module.
* `import plugin assimilate "…" as X { … }` — Hot-Code Residency (pre-warmed at boot). Only
  `boot.fungi` may grant it (`FUNGI-ASSIMILATE-001`) because residency reserves capability slots for
  the process lifetime.

## `step` — DWI isolate invocation (parses today; full isolation is later)

`step call(...)` invokes a function inside a shared-nothing DWI isolate (hard-erased after). From
`hardened-border-plugin.fungi:59`:

```fungi
let result = step processPaymentInner(amount)
```

The parser accepts `step`, but **full isolate semantics (fuel, memory eviction) currently land at the
WASM tier and are still being completed** — treat `step` as available syntax whose deepest runtime
guarantees are in progress.

## What PARSES but is not fully enforced / is aspirational

Be honest about maturity. These parse (so they won't be a syntax error) but their runtime enforcement
is a later phase — do not rely on them to actually gate execution today:

| Construct | Status |
|---|---|
| `emergency { on <signal> { deny <effect>  quarantine } }` (inside `policy {}`) | parses; monotonic-overlay enforcement (`FUNGI-MONO-001`) is a later DRCM phase. Only `deny`/`quarantine` are legal inside — you can never re-enable a capability |
| `assuming(flowRef, "claim") { … }` | parses and is AST-retained; the proof-borrowing verifier is a later phase |
| `secrets { credential … rotation … }` | parses and binds a signed policy; **rotation is executed by an external driver, not the core** |
| `authority { requires … }` | parses; typed-capability semantics deferred |
| `policy { … }` (inline) | **deprecated alias for `access {}`** (`FUNGI-SYNTAX-LEGACY-003` in future); the `policy` keyword is reserved for future State Mutation Governance |
| `evict`, `view(cap | cap)` | `view(...)` is a real capability-masked pointer type annotation; `evict` parses but its DWI semantics are a later phase |
| `service …` (service-level contracts) | **reserved, not implemented** (`DO_NOT_USE_YET.md` §9) |

## Verdict / tri-logic (ALLOW / HOLD / DENY) — NOT source syntax

You may see **ALLOW / HOLD / DENY** in design material. **These are the compiler/runtime's internal
governance-decision model, not keywords you write in `.fungi`.** There is no tri-state verdict literal
in the grammar. In source, capability decisions are expressed structurally and **fail closed**:

* a capability is either **granted** (listed in `access { grant … }` / within the guard) or, by
  omission, **denied** — that is the binary the language exposes;
* `trap`/`ensure`/`invariant` express boolean guards;
* the emergency overlay can only ever *tighten* (deny/quarantine), never loosen.

So: do not write `return DENY` or a `verdict` block — model the decision with `access`, `guard`,
`gate`, `trap`, and `match` on a `Result`.

## Common mistakes (governance)

| Mistake | Why wrong | Fix |
|---|---|---|
| child guard re-adds a parent-denied effect | violates child ⊆ parent | remove it; carve only subsets |
| `[conforms_to: G]` as a sub-block inside `contract {}` | it's a header attribute | `contract [conforms_to: G] { … }` |
| `access { deny X }` | Default-Deny means you never write `deny` | omit X; it is denied automatically |
| expecting `access { grant X }` to add an undeclared effect | access is a filter | declare X in `contract.effects` first |
| reading `trap cond` as "require cond" | trap fires when cond is TRUE | write the failure condition |
| writing a `verdict`/`ALLOW`/`DENY` literal | not source syntax | use `access`/`guard`/`gate`/`trap`/`Result` |
| using `policy { … }` for a domain ceiling | that's `guard`'s job | top-level `guard Name { … }` |
| relying on `emergency {}`/`assuming()` runtime behaviour today | parses, enforcement is later | fine to author; don't depend on runtime effect yet |

## Real files to open

* `examples/foundations/guard-domain-ceiling.fungi` — `guard`, `parent_policy`, `[conforms_to]`.
* `examples/foundations/gate-access-example.fungi` — `gate(...)` and `access { grant }` side by side.
* `examples/foundations/hardened-border-plugin.fungi` — `import plugin safe`, plugin `access`, `step`.
* `examples/foundations/static-bitfield-example.fungi` — `static` and `bitfield`.
* `examples/foundations/comment-styles-example.fungi` — `governed floor_3 flow` + `;;` govComments.

Next: **[07 — Control flow](07-control-flow.md)**.
