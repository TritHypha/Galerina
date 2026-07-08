# Authoring `.gate` — a guide for AI and humans

## What `.gate` is
`.gate` is Galerina's light-ASCII, **"draw-don't-code"** authoring language for app/production-level logic. Prime directive:
**"Do not code, draw. It is not logic, it is a map."** You draw a graph (a map) of a flow; the compiler lowers `.gate` (+ `.fungi`)
into one **GIR → WASM**. `.gate` adds a *surface*, not new security — every guarantee is discharged by the shipped Galerina governance
engine, and `.gate` compiles away (zero runtime footprint).

## The mental model: a map, not code
A gate is a **graph**: `[named nodes]` joined by directed `->` edges, with a few **mark glyphs** for control. You are drawing *where
data flows and where it is gated/cut* — not writing statements. Dense compute (arithmetic, string work, DB calls) is **delegated to
`.fungi` `fu` bodies** through `[name:fu op]` nodes; there is **no math and no imperative code in `.gate`.**

## Anatomy (in order)
```
@version 1.0.0                             ← version header (REQUIRED, first non-blank line; replaced `#gate` 2026-07-08)
GATE name(param: Type, ...) -> ReturnType: ← the callable signature (parens, one return type)
  INTENT  "one sentence of purpose"        ← REQUIRED
  EFFECTS { effect.name, ... }             ← REQUIRED (canonical names only)
  PRIVACY deny <class> <field> -> <sink>   ← optional (one line per rule)
  AUDIT   on                               ← optional
  FLOW:                                    ← the map (the drawing)
    [in] := IN                             ← the SOLE entry
    [a] -> [b] <tag>                        ← edges (order-free: endpoints ride on the edge)
    ...
END                                        ← REQUIRED
```

## The glyphs — the frozen eight (exact codepoints)
| Token | Means |
|---|---|
| `->` | directed flow (data / control) |
| `[name]` | a node = a sandbox boundary |
| `[name:fu op]` | node delegating dense compute to a `.fungi` `fu` body |
| `[name:cut fu op]` | an **explicit privacy cut** (redaction vertex) |
| `✓` (U+2713) | True / continue arm |
| `×` (U+00D7) | False / reject arm |
| `?` | tri-state guard (True / False / Unknown — K3) |
| `-` | deny arm / drain |
| `+` | success egress / yield |
| `!` | panic drain (fail-closed) |

The **glyph alone decides polarity** — `✓`/`+` positive, `×`/`-`/`!` negative. Never label a glyph with a word of the opposite
polarity (`[✓denied]` is rejected).

## The exact vocabulary (unknown ⇒ REJECT — do not guess)
Names are validated against the live prod registries; a plausible-but-wrong name is **rejected** (this is the #1 authoring error — a
model tends to invent `customer`/`amount`/`pii`). Use exactly these:
- **`sens_class`** (the word after `deny`) — a type qualifier **`protected` · `redacted` · `unsafe` · `safe` · `secret`**, OR a domain
  class **`PII` · `PHI` · `PCI`** (UPPER-CASE — `pii`/`phi`/`pci` REJECT). Nothing else.
- **effect names** (`EFFECTS { … }` and `@effect` edges) — canonical only, e.g. `database.read` · `database.write` · `audit.write` ·
  `network.outbound` · `network.inbound` · `secret.read` · `storage.read` · `storage.write` · `pii.read` · `phi.read` ·
  `payment.charge` · `ai.inference`. (Full set = the compiler's `CANONICAL_EFFECTS`.)
- **sinks** (the `-> <sink>` of a PRIVACY rule) — keyed by *family*: `response` · `audit` · `storage` · `network` · `log` · `email` … .
  A suffix like `response.crossTenant` is **not** honoured — only the family `response` is — so name the family you actually mean.

## The canonical patterns — compose from these, don't freehand
**1. The K3 auth-gate** (every gated flow starts here). A `?` guard is a **structural K3 branch — it is NOT the authorization** (a
passing map never authorizes; the **signed capability** at fuse does — so `? authorised` names a check, it does not *enforce* one). It
MUST have three DISTINCT arms — True (`✓`), False (`×`), and a default drain (`[-]`/`[!]`); a single `[-]` may **not** be both the False
arm and the default (K3 forbids collapsing False into Unknown):
```
[in]    -> [authz] ? authorised
[authz] -> [✓]        # allowed
[authz] -> [×]        # denied
[authz] -> [-]        # unknown -> deny drain (DISTINCT from ×)
[×]     -> [-]        # denied drains to deny
```
**2. Privacy-cut-before-egress** — a sensitive read reaches `[+]` ONLY through an explicit `:cut` that dominates it:
```
[✓]             -> [raw:fu dbRead] @database.read
[raw:fu dbRead] -> [view:cut fu redactX]              # THE cut
[view:cut fu redactX] -> [logged:fu audit] @audit.write
[logged:fu audit]     -> [+]                          # only the cut view leaves
```
> **Caveat — the checker is field-blind:** it proves a `:cut` *dominates* egress; it does **not** prove the cut strips the field your
> `PRIVACY` rule *names* (that field↔cut binding is checked at compile time by `FUNGI-PRIVACY-002`). **A green `:cut` over the wrong
> field still leaks** — name the cut for the field it strips, and keep the `PRIVACY` field and the cut in sync.

**3. Deny-drain** — a `×`/`-` arm terminates in a drain (`[-]`/`[!]`), with no `[+]` and no privileged effect (only `audit.write` is
allowed on a deny arm).

**4. Advanced shapes** (see `04`–`05`): a **bounded loop** — a back-edge carries `decreases <var>` (a numeric produced *before* the
loop) or `hops <N≥1>`, so it must terminate; a **re-authorised `×` arm** that legitimately continues (a "medium-risk → review", an
"expired but returnable") passes through a **FRESH `?` guard**; and a **panic drain `[!]`** for fail-closed aborts (cross-tenant reach,
invalid signature). A fresh `?` guard re-opens a denied path only because a **new signed capability** is checked there — the `✓` glyph
grants nothing on its own.

Worked, checker-verified: `01`–`03` (auth-gate · write · PHI cut) and `04`–`05` (tenant-isolation + loop + re-auth · secret handling +
panic + re-auth).

## DO / DON'T — the hallucination guard
An out-of-date model *invents* syntax. These are the traps (all rejected by the checker):

**DON'T**
- ❌ Invent `MATCH:` / `BODY:` / `RESPONSE:` sections — **they do not exist.** The map is the single `FLOW:`.
- ❌ Use `(parenthesised)` nodes — nodes are `[bracketed]`.
- ❌ Use `=> CONTINUE` / `_ => REJECT` arms, or a `[_]` node — arms are the glyphs `✓ × - ! +`. **`.gate`'s `_ =>` *is* the default
  drain `-> [-]` (deny) or `-> [!]` (panic)** — the same GIR node `.fungi`'s `_ => deny` / `_ => trap` lowers to. (`_` is polarity-null,
  so it is deliberately not a mark.)
- ❌ Write imperative statements (`ledger.deduct(x); return ...`) — dense compute goes in `.fungi` `fu` bodies.
- ❌ Guess or concatenate effect names — validated against the live registry; unknown ⇒ REJECT.
- ❌ Use look-alike glyphs (ballot-`✗` U+2717, fullwidth, Cyrillic) — exact codepoints only.
- ❌ Name a cut by convention (`[view:fu redact]`) — a cut is ONLY `[name:cut fu op]`.

**DO**
- ✅ `@version 1.0.0` first; exactly one `GATE` per file; end with `END`.
- ✅ INTENT + EFFECTS always.
- ✅ Give every `?` three distinct arms (✓ / × / drain).
- ✅ Route every sensitive read through a `:cut` before `[+]`.
- ✅ Use canonical effect names (`database.read`, `database.write`, `audit.write`, `network.outbound`, …).

## The verify loop — what makes this safe
Run the reference checker: `node <path>/gate-check.mjs your.gate` (with `GALERINA_ROOT` set to the Galerina repo). **Unknown ⇒
REJECT**, so a pass means it is structurally valid. Author by **composing the verified patterns above and re-checking after every
change** — that is how you write `.gate` without hallucinating. (See `RULES.md` for the full invariant list.)

## What a passing map does NOT do
A structurally-perfect, checker-green map **never authorizes.** Admission is the **signed capability** at fuse time, not the graph
shape. The signature binds the runtime **IR digest** — **sign the IR, never the `.gate` source.**
