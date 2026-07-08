# 03 — The `FLOW:` graph

`FLOW:` is where you **draw the map**. Everything above it *declares*; `FLOW:` *shows the shape*. It
is a line-oriented ASCII graph: one **entry**, then a list of **edges**. Each edge names both of its
endpoints, so **line order is free** — you can list edges in any order and the graph is the same.

```ebnf
flow  = ws , "FLOW" , ":" , newline , entry , { edge } ;
entry = ws , "[" , ident , "]" , ws , ":=" , ws , "IN" , newline ;
edge  = ws , node , ws , "->" , ws , node , [ ws , tag ] , newline ;
```
*Source: `SPEC-gate-language.md` §1 (grammar).*

This page covers the mechanics: the entry, edges, the four kinds of node body, and the three edge
tags (`? guard`, `@effect`, loop bounds). The **glyph verdicts** (`✓ × - + ! ?`) get their own page,
[04](04-nodes-verdicts-drains.md); **`fu`/`:cut` nodes** get page [05](05-fungi-delegation.md).

Design rules (all enforced): **one semantic unit per line**; **no 2D box-drawing** (`┌ ─ ┐ │ └ ┘ …`
are forbidden *everywhere, including comments*); ASCII identifiers only; single forward scan.
(Source: `SPEC-gate-language.md` §1; `gate-check.mjs` `no_box_chars`.)

---

## 1. The entry — `[x] := IN` (the sole source)

Every flow has **exactly one** source: a named node bound to `IN`.

```gate
  FLOW:
    [in] := IN
```
*Source: `examples/flow01.gate:8-9`.*

- The entry receives the gate's parameters (the caller, the ids, the data) at call time.
- **Exactly one.** A second `:= IN` is rejected (m1) — a gate has one source; a second entry would
  silently last-win. (Source: `gate-check.mjs` `single_entry`; self-test `[m1]`.)
- **Must be a named node, not a glyph.** `[×] := IN` is rejected — the entry must be a plain ident
  like `[in]`. (Source: `gate-check.mjs` "ROUND-5 hole H-B".)
- Convention: name it `[in]`.

---

## 2. Edges — `[a] -> [b]`

An edge is a directed vector from one node to another. The arrow is `->` (exact codepoints
`U+002D U+003E`). Because each edge carries both endpoints, the drawing is an adjacency list.

```gate
    [in]                -> [authz]
    [authz]             -> [✓]
    [✓]                 -> [record:fu dbQuery]
```
*Source (shape): `examples/demo-getCustomerById.gate:12-17`.*

- **Data is physically isolated unless a `->` connects it.** If two nodes aren't joined by a drawn
  arrow, their compiled memory regions are provably separate. This is the zero-trust WYSIWYG
  property: *the map is the reachability graph.* (Source: `SPEC-gate-language.md` §0/§1; DESIGN-BRIEF §4.)
- **No orphans.** Every node must be reachable from `[in]` **and** must reach a terminal (`+`/`-`/`!`).
  An orphan or a dead-end is rejected as hallucinated geometry. (Source: `gate-check.mjs` `no_orphans`;
  self-test `orphan [ghost] … REJECTED`.)
- **Alignment is cosmetic.** The corpus pads with spaces so arrows line up; the parser ignores it.

### Inline comments

A `#` starts a comment to end of line (the leading version marker is now `@version`, not `#gate`, so
`#` is always a comment). Comments **carry no
authority** (m2) — they are stripped before the verdict. A comment that narrates the opposite of the
edges is simply ignored; the edges win.

```gate
    [in]->[✓ok]  # this comment could say anything — the verdict follows the edges
```
*Source: `gate-check.mjs` `m2`; self-test `[m2] misleading comment ignored`.*

---

## 3. Node bodies — the four kinds

A node is `[` … `]`. What's inside is one of four kinds:

| Kind | Syntax | Meaning | Page |
|------|--------|---------|------|
| **named** | `[authz]`, `[funds]` | a sandbox boundary / step (own WASM memory region) | this page |
| **fu op** | `[raw:fu dbRead]` | delegate dense compute to a `.fungi` `fu` function | [05](05-fungi-delegation.md) |
| **cut** | `[view:cut fu redactPHI]` | an **explicit privacy cut** (re-type/redaction vertex) | [05](05-fungi-delegation.md) |
| **mark** | `[✓]`, `[×]`, `[-]`, `[+]`, `[!]`, `[?]` | a control glyph (verdict / drain / test) | [04](04-nodes-verdicts-drains.md) |

```ebnf
node_body = qname                       (* named node / sandbox *)
          | qname ":" op                (* node bound to a .fungi fu op *)
          | qname ":" "cut" ws op       (* explicit privacy-cut node *)
          | mark [ label ] ;            (* control mark, optionally labelled *)
op        = "fu" ws ident ;
```
*Source: `SPEC-gate-language.md` §1.*

Named nodes and their identity rules:

- **ASCII idents only.** `[аuth]` with a Cyrillic `а` is rejected (homoglyph, B4). (Source:
  `gate-check.mjs` `nodeKey`; self-test `[B4] Cyrillic-а … REJECTED`.)
- **A node name binds at most one `:op`.** Drawing `[view:fu a]` and `[view:fu b]` is a
  double-bind and is rejected (M7) — a node's identity includes its op. (Source: `gate-check.mjs`
  `double_bind`; self-test `[M7]`.)

---

## 4. Edge tags — the three annotations

An edge may carry **one** trailing tag after its target node.

```ebnf
tag   = guard | via | bound ;
guard = "?" , ws , qname ;               (* tri-state test on qname *)
via   = "@" , effect ;                   (* edge performs a declared effect *)
bound = "decreases" ws qname | "hops" integer ;   (* loop variant / hop budget *)
```
*Source: `SPEC-gate-language.md` §1. (In v0.4 the old `@redact` edge tag is **removed** — see
[05](05-fungi-delegation.md).)*

### 4a. `? guard` — a tri-state test

`? predicate` marks the edge's **target** as a tri-state (K3) decision point. The predicate is a
name (e.g. `authorised`, `sufficient`, `amlClear`). The target node must then fan out into three
distinct arms — True (`✓`), False (`×`), and a default drain (`-`/`!`). The full exhaustiveness rule
is on page [04](04-nodes-verdicts-drains.md).

```gate
    [in]                 -> [authz]              ? authorised
    [authz]              -> [✓]
    [authz]              -> [×]
    [authz]              -> [-]
```
*Source: `examples/flow01.gate:10-13`.*

The predicate name is a signed-capability guard, **not the verdict** — admission is still the signed
capability at runtime, never the drawn word. (Source: `examples/flow01.gate:10` comment; `SPEC` §0.)

### 4b. `@effect` — the edge performs a governed effect

`@name` says this edge performs the effect `name`. The effect **must** be declared in `EFFECTS { }`
(page [02](02-clauses.md)).

```gate
    [✓]                 -> [record:fu dbQuery]  @database.read
    [view:cut fu redactPII] -> [logged:fu audit] @audit.write
```
*Source: `examples/demo-getCustomerById.gate:17,19`.*

Effect placement carries governance weight: e.g. a privileged effect drawn on a **deny arm** (`×`/`-`)
is rejected — see page [04](04-nodes-verdicts-drains.md).

### 4c. `decreases <var>` / `hops <N>` — loop bounds

Loops are drawn as **cycles**: an edge whose target you've already visited. Every cycle's back-edge
**must** carry a bound, or it is rejected as an *Unbounded Cycle* (CWE-400).

- **`decreases <var>`** — a variant that the compiler proves strictly decreasing. `<var>` must
  resolve to a real value **produced before the loop** (it must dominate the loop header).
- **`hops <N>`** — a hard hop budget, `N ≥ 1` (`hops 0` is rejected).

```gate
    [✓more]                 -> [page:fu scanShard]  decreases budget   # bounded cycle: budget decreases each pass
```
*Source: `examples/flow07.gate:26` (the budget node `[budget:fu initHopBudget]` is established
pre-loop at line 20).*

Rules (order-independent, via dominators — M5/M8):

- A back-edge is defined by **dominance** (target dominates source), not DFS discovery order, so
  listing edges out of order can't hide a loop.
- `decreases undefinedVar` is rejected (unverified variant); `decreases` on a **loop-internal** node
  is rejected (must be pre-loop). (Source: `gate-check.mjs` `bounded_cycles`; self-test `[M5]`/`[M8]`.)

---

## 5. Worked FLOW fragment (real, verified)

From `flow07.gate` (`searchRecords`) — a bounded paging loop with a tenant cut. This is the real
file (passes `gate-check.mjs`); the annotations show each construct:

```gate
  FLOW:
    [in] := IN                                                        # entry (sole source)
    [in]                    -> [authz]              ? authorised       # ? guard: tri-state test
    [authz]                 -> [✓]                                     # True arm
    [authz]                 -> [×]                                     # False arm (distinct)
    [authz]                 -> [-]                                     # Unknown -> deny drain (distinct)
    [×]                     -> [-]                                     # rejected caller drains
    [✓]                     -> [scope:cut fu tenantFilter]            # :cut node (page 05)
    [scope:cut fu tenantFilter] -> [tenant]         ? tenantReachable
    [tenant]                -> [✓tenant]
    [tenant]                -> [×tenant]
    [tenant]                -> [-]
    [×tenant]               -> [!]                                     # cross-tenant -> panic drain
    [✓tenant]               -> [budget:fu initHopBudget]              # establish variant BEFORE the loop
    [budget:fu initHopBudget] -> [page:fu scanShard] @database.read    # @effect (declared in EFFECTS{})
    [page:fu scanShard]     -> [more]               ? hasNextHop
    [more]                  -> [✓more]
    [more]                  -> [×more]
    [more]                  -> [-]
    [✓more]                 -> [page:fu scanShard]  decreases budget   # bounded cycle (back-edge + bound)
    [×more]                 -> [done]               ? pageAssembled    # FRESH guard re-authorises egress
    [done]                  -> [✓done]
    [done]                  -> [×incomplete]
    [done]                  -> [-]
    [×incomplete]           -> [-]
    [✓done]                 -> [safe:cut fu redactCrossTenant]        # final cut dominates egress
    [safe:cut fu redactCrossTenant] -> [+]                            # egress
END
```
*Source: `examples/flow07.gate` (verbatim FLOW; the file passes all checks).*

---

## Mistakes to avoid on the graph

- **A dangling node.** Every node must trace from `[in]` to a terminal. `[ghost] -> [+]` with no
  path from `[in]` is rejected (orphan).
- **A loop with no bound.** `[a] -> [b]`, `[b] -> [a]` with no `decreases`/`hops` ⇒ *Unbounded Cycle*.
- **Any 2D box-drawing character** — even inside a comment (`# ┌─┐`) — is rejected. Keep it light,
  line-oriented ASCII. (Source: self-test `2D box-drawing REJECTED even in comments`.)
- **An unknown tag.** `[a] -> [b] frobnicate 7` is rejected ("unknown tag … unknown ⇒ REJECT").

---

### Next

→ [04 — Nodes, verdicts & drains](04-nodes-verdicts-drains.md): the eight glyphs and the
ALLOW / HOLD / DENY tri-logic — the most important page.
