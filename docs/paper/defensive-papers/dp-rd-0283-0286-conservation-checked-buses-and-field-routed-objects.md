# Defensive Publication — Conservation-checked data buses and field-routed objects in a drawn, signed governance graph: "nothing is silently dropped"

**Disclosure ID:** DP-RD-0283/0286 · **Date:** 2026-07-09 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Stage:** **DESIGN-STAGE DISCLOSURE** — the mechanisms below are specified (KB RD-0283 §4, RD-0286 §4) and
timestamped here as prior art; **no implementation exists yet**. Checker-rule candidates are named
(`bus_conservation`, `field_conservation`); proof-script candidates are named in the source RDs. This
document will gain a status line when either rule lands.

> **Status (2026-07-09, added when the rules landed):** BOTH named checker rules now SHIP in the
> `.gate` v0.5 **reference checker** (`ZT-Galerina-GRAPH-ASCII-v2/tools/gate-check.mjs`, self-test
> 164/164) under the owner-unlocked `@version 1.1.0` grammar — `bus N×T` bounded-lane edges
> (`bus_conservation`: no manufacture, no silent drop, plane lanes cover worst-case, re-shape
> compute-only) and `SHAPE` field-ports (`field_conservation`: **sealed-by-default per the RD-0286a
> owner answer, 2026-07-09** — undeclared port / unrouted field / nested path / vacuous shape all
> REJECT). Teaching examples: `examples/flow21.gate` (bus) + `flow22.gate` (field-ports); corpus
> 23/23. **Honest tier: the laws are enforced at the AUTHORING pre-filter only** — the production
> compiler's `gate-parser.ts` accept set deliberately stays `{1.0.0}` until bus/field LOWERING lands
> (a 1.1.0 file is compiler-rejected, fail-closed), and the dynamic drain-counter reconciliation
> remains future work with that lowering. §1's "compile gate / editor refuses export" claims stay
> design-stage until then.

## 1. What is disclosed

Two mechanical **conservation laws** for a line-oriented, drawn governance-graph language (the Galerina
`.gate` family — eight frozen glyphs, K3 tri-valued arms, audited drains, signed compilation artifacts),
plus their editor/authoring consequences:

1. **Bus conservation (elements).** A *bus* is an edge annotated with a bounded element type (`bus N×T` —
   a fixed-capacity lane bundle). Rule: at every node, **Σ elements in = Σ elements out + Σ elements
   drained**, where a drain is an *audited* sink. Statically the checker verifies capacity-consistency in
   one linear pass over the graph (same class as exhaustiveness/bounded-cycle checks); dynamically the
   already-audited drain counters reconcile the identity. An **unbounded bus is unrepresentable** (rejected
   like an unbounded cycle, CWE-400/770 class).
2. **Field conservation (objects).** An object crossing a node boundary renders as a port set (one port per
   field of its closed/fixed shape). Rule: **every inbound field must be consumed, transformed, explicitly
   cut (a redaction vertex that dominates egress), or audit-drained.** An unrouted inbound field — and,
   symmetrically, an outbound port with no source — is a compile error / the visual editor refuses export.
3. **K3 three-plane routing.** Bus/field flows carry Kleene tri-valued verdicts (+1 pass / −1 definite
   reject / 0 undecidable), each plane a distinct routed arm; verdict composition is **min-only** (a join
   can degrade toward deny, never manufacture allow).

## 2. What it prevents (the defect classes)

- **Silent element drop** — "the compiler simply ignores the malformed item" fail-open family: with a
  conservation identity, ignoring an element is unrepresentable; it must visibly drain, and drains are audited.
- **Mass assignment / auto-binding of unexpected fields** (CWE-915; OWASP API3:2023 BOPLA, the
  mass-assignment half): an attacker-supplied extra field has no routed port ⇒ the map does not compile.
- **Excessive data exposure** (the other BOPLA half): an outbound field with no deliberate source is equally
  un-drawable; sensitive egress requires an explicit, dominating cut vertex.
- **Count-mismatch bugs** in fan-out/fan-in (split/merge lanes that lose or duplicate items).

## 3. Honest scope and bounds

- The laws are **necessary-not-sufficient** authoring-time guards; runtime admission remains the signed
  capability (the drawn topology is never the authority — the language's standing deny-only lock).
- Static checking is O(edges·fields) linear; the dynamic half relies on the platform's existing audited
  drains. No performance claim is made; no cryptographic novelty is claimed.
- Conservation binds *counts and routing*, not values; value-correctness remains the flows' contracts.

## 4. Prior art acknowledged (novelty disclaimed)

Kirchhoff's current law / network flow conservation; Petri-net token conservation; linear and affine type
systems ("must-use" values); dataflow taint tracking; relevance/usage lints; schematic-capture junction
conventions. Field allowlisting (mass-assignment guards) exists in every mainstream web framework as an
**opt-in runtime convention**. The specific composition disclosed here — *conservation as a compile gate
over a drawn, signed K3 governance graph, with explicit audited drains and redaction-cut vertices, where
violation is unrepresentable rather than filtered* — is published to establish prior art; novelty is
disclaimed for every constituent.

## 5. Declarations

- **Type/tier:** defensive-pub (design-stage). Not a flagship/workshop paper; no measurements claimed.
- **Authorship & AI assistance:** drafted with AI assistance (Claude) under human direction, grounded in
  the cited KB RD documents and the `.gate` v0.4 specification.
- **Funding:** none. **Competing interests:** none declared.
- **Data / artifact availability:** design sources in-repo: KB `galerina-rd-0283-…` §4, `galerina-rd-0286-…`
  §4, `.gate` SPEC v0.4 (`ZT-Galerina-GRAPH-ASCII-v2`), RD-0275 (editor rules). No runnable artifact yet;
  candidate proofs named in the RDs.
- **Licence:** Apache-2.0.
