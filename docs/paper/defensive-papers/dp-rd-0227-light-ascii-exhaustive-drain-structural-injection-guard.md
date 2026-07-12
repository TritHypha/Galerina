# Defensive Publication — A light-ASCII symbolic graph-authoring syntax with a mandatory exhaustive default-drain and a structural-parse injection pre-filter

**Disclosure ID:** DP-RD-0227 · **Date:** 2026-07-01 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Provenance:** RD-0227 · analysis `galerina-rd-0226-0230-77mesh-ascii-graph-gate.md` · machine-checkable proof `proofs/rd-0227-proof.mjs` (re-run GREEN).

> **Purpose of this document.** This is a *defensive publication* — a public prior-art disclosure. Its goal is to place the sound techniques described below into the public domain so that no party can later monopolise them by patent, and to put on record an *honest bound* on what those techniques do and do not achieve. Several of the results here are deliberately negative or narrowing ("detect-not-prevent", "deny-only pre-filter", "constant-factor not order"). Recording those bounds accurately **is** the contribution; the overclaimed versions are explicitly refuted below and are not disclosed as working art.

---

## 1. Technical field

Ahead-of-time (AOT) compilation and static verification of graph-shaped control-flow / dataflow programs; author-facing domain-specific languages (DSLs) for describing governance graphs; compile-time injection resistance; exhaustiveness (total-match) checking for branching constructs; zero-trust admission architecture in which a compile gate is a *pre-filter* in front of a cryptographic capability check. The concrete embodiment is a line-oriented "light-ASCII" authoring syntax that lowers ahead-of-time to a pure runtime intermediate representation (`.fungi`), so that all governance checks are discharged at build time and the runtime carries zero additional tax.

## 2. Background & problem

Governance and dataflow policies are increasingly authored as graphs (nodes = resources/handlers, edges = permitted flows). Two recurring problems motivate this disclosure:

1. **Authoring surface.** Graphs drawn with 2D box-drawing characters (`┌─┐│└┘`) are hard for machines to diff, hard for AI systems to author reliably, and require a spatial/geometric parser to recover control-flow. A line-oriented ASCII form that parses in a single left-to-right pass would diff cleanly under Git and be writeable by an AI without inventing invalid geometry.

2. **Two distinct failure classes at the boundary.** (a) A branching node that does not handle every possible input can leave an *unmapped state* that hangs or silently falls through the runtime. (b) A malformed or injected query structure can smuggle an attack past a parser that accepts partial/loose input.

The disclosed subject matter addresses both at the *compile gate*, not at runtime, and does so without claiming to solve authentication or value-level injection — those remain the job of a signed capability and typed AST parameterisation respectively. The honest framing throughout is: **this is an AOT compile-gate technique, not a runtime security feature and not an admission gate.**

## 3. Prior art (stated honestly)

The disclosed construction is **novel only in combination**. Its constituent parts are well-established, and this section names the closest existing work so that the boundary of any genuine contribution is clear:

- **Match exhaustiveness / deny-by-default fall-through.** The mandatory default-drain rule is textbook **Rust `match` exhaustiveness** (the compiler rejects a non-exhaustive match and the wildcard `_ =>` arm covers the residual state). Equivalent totality checks exist in ML-family pattern matching and in switch-default lint rules (CWE-478, "Missing Default Case in Multiple Condition Expression"). The disclosed `[?]`-node default-drain rule is a spatial re-statement of this, not a new theorem.
- **Structural-parse injection resistance.** Rejecting malformed input at the grammar level is the same principle as **parameterised queries / prepared statements** and typed-AST parsing, the standard mitigation for OWASP A03 (Injection) / CWE-89. The structural guard here closes the *structural* half of that problem only; value binding remains the domain of typed AST parameterisation (internal RD-0204).
- **Signed / capability-based admission.** Treating a graph/topology as *deny-only* and keeping the actual admission decision on a cryptographic capability is standard capability-security practice; the failure mode of trusting an unsigned tri-state/topology vector is documented internally (RD-0162/0169, "forgeable tri-state fail-open").
- **b-ary vs binary search / branching cost.** The observation that separating three states costs more comparison work than two on binary hardware is elementary **b-ary search / decision-tree** theory; a trit does not become free by relabelling.
- **Linear-time parsing.** Single-pass O(N) lexing is standard compiler practice; a *competent* 2D-grid parser is also linear in canvas cells. The literature on parsing does not support an order-of-magnitude complexity separation between the two forms (see §6).
- **Adjacent systems literature (named for completeness, not claimed).** Cache-partitioning / page-colouring work such as **Intel CAT** and **CATalyst**, attention-memory paging such as **vLLM PagedAttention**, **Kunegis signed-Laplacian** graph models, and **ECC/TRR Rowhammer** mitigations are cited in the broader corpus as neighbouring "structural constraint as a safety property" ideas; none of them anticipates the specific *light-ASCII authoring + mandatory exhaustive drain + deny-only structural pre-filter lowering to a pure runtime IR* combination disclosed here, and none is relied on as a working part of it.

## 4. Summary of the disclosed subject matter

A line-oriented, single-pass-parseable ("light-ASCII") symbolic syntax for authoring governance/control-flow graphs — using `->` for a directed vector, `[]` for a node, and the marker set `[check]`/`[x]` (boolean split), `[?]` (tri-state), `[!]` (panic drain), `[+]` (success yield), `[-]` (resource drain), and no 2D box-drawing — in which an AOT compiler (i) **rejects any `[?]` node that lacks an exhaustive default drain** (a `[!]` or `[-]` terminal reached by an explicit catch-all track), emitting "Non-Exhaustive Spatial Match", so no unmapped state can fall through, and (ii) applies a **structural-parse injection pre-filter** that aborts any query whose ASCII shape is malformed (unbalanced `[]`, dangling `->`, embedded control characters). The syntax lowers ahead-of-time to a pure `.fungi` runtime IR, so both checks are build-time only (zero runtime tax). The structural pre-filter is **deny-only**: a well-formed but hostile query still passes it, so it complements — and never replaces — value-level typed-AST parameterisation and the signed-capability admission decision.

## 5. Detailed description / embodiment

### 5.1 Syntax and lowering
Programs are written as tracks of nodes joined by `->` vectors, one logical flow per line region, using only printable ASCII markers (`[check]`,`[x]`,`[?]`,`[!]`,`[+]`,`[-]`). Because there is no 2D geometry, a lexer reads characters strictly left-to-right / top-to-bottom, visiting each character a bounded number of times. The `.graph` source is an **AOT authoring layer**: it compiles to `.fungi` (and onward to WASM). The runtime remains pure `.fungi` — the owner lock — so the two checks below cost nothing at runtime.

### 5.2 Exhaustive default-drain (deny-by-default fall-through)
For every tri-state `[?]` node the compiler enforces that at least one outgoing track (a) terminates in a drain marker `[!]` (panic) or `[-]` (resource), **and** (b) is labelled as an explicit catch-all (`[Unhandled]`/`[Default]`/`_`/`else`/`null`). A `[?]` with only "happy path" tracks and no drain is rejected; a drain terminal on a *named* branch (which does not cover the residual/unknown state) is also rejected. This is the spatial analogue of the Rust `_ =>` wildcard arm and guarantees that no input to a `[?]` node is left unmapped — the residual state is deterministically drained rather than hanging the runtime. This is a **totality/determinism** property (see §6 for what it is *not*).

### 5.3 Structural-parse injection pre-filter (deny-only)
A pure grammar check validates bracket balance, presence of at least one `->` vector, and absence of smuggled control characters (`charCode < 32`, newline excepted). A broken shape (e.g. an unbalanced `[` introduced by a classic `' OR 1=1 --` style payload) or a control-character smuggle aborts the compile. Crucially, this check performs **no identity or authorisation** reasoning: a syntactically valid but hostile query (e.g. `[attacker] -> [database.drop_all] -> [+]`) passes it. The pre-filter therefore blocks *malformed* input only and is positioned strictly in front of typed-AST value parameterisation and the signed-capability admission decision.

### 5.4 Key quantitative result (from the proof, `proofs/rd-0227-proof.mjs`)
The proof grows equivalent N-node graphs in both representations and fits the empirical log-log growth exponent of parse-work:

- **light-ASCII lexer exponent ≈ 1.006** (linear single-pass);
- a **competent 2D-grid scanner exponent ≈ 1.003** — i.e. the **same order** (also linear in canvas cells), differing only by a **constant factor of ≈ 9.5×** at N = 512;
- an O(N²) exponent (**≈ 1.997**) appears **only** for a *strawman naive* per-node full-canvas re-scan that no competent compiler would ship.

The honest conclusion the proof pins: the widely-quoted "light-ASCII O(N) vs 2D-grid O(N²)" claim is a **constant-not-order overclaim**. The *defensible* wins of the light-ASCII form are the ~10× constant-factor parse saving, clean Git diffs, and AI-writeability — a developer-experience improvement, **not** a complexity-class change. Separately, the proof models branch cost and confirms a tri-state `[?]` split costs **2** comparisons versus **1** for a boolean on binary silicon (a trit = 2 bits), so the "zero-branching / becomes the matrix" framing is refuted; AOT pre-parsing is a one-time constant saving, not a runtime asymptotic change.

## 6. Honest limitations & scope

The following bounds are load-bearing. Disclosing them accurately is a primary purpose of this document.

- **Compile-time only; not a runtime feature.** Both checks run in the AOT `.graph → .fungi` gate. The runtime is pure `.fungi` (owner lock). Nothing here changes runtime behaviour or adds a runtime guard.
- **The structural pre-filter is DENY-ONLY and is never an admission gate.** It rejects malformed shapes. A **well-formed hostile query passes** (proof part (c)). Structural validity ≠ authenticated caller. Treating the parsed shape — or any tri-state/topology vector — as the authorisation decision is **fail-open** (internal RD-0162/0169). Admission MUST remain on the signed `.fungi` capability plus post-quantum crypto and the effects/permissions governance.
- **Structural half of injection only; value binding still required.** The guard closes the *structural* half of injection (malformed shape → abort), equivalent to the parameterised-parse principle for CWE-89 / OWASP-A03. **Value-level** injection safety still requires typed-AST parameterisation (internal RD-0204). This disclosure does not claim to bind or sanitise values.
- **Exhaustiveness guarantees determinism, not trust.** The default-drain rule ensures every input to a `[?]` node is deterministically handled/drained. It does **not** verify that the caller is authorised or that the flow is safe — an exhaustive, deterministic gate can still be fail-open if its predicate reads a forgeable value.
- **Constant-factor, not order-of-magnitude complexity.** The performance advantage over a competent 2D-grid parser is a constant (~9.5–10×), not an asymptotic class change (§5.4). The O(N²) figure is real only against a naive strawman parser.
- **No new cryptography and no authentication.** These are compiler lints, not crypto. The disclosed technique is **not** authentication, is not a transport/channel confidentiality mechanism, and adds nothing to T2 (comms) of the zero-trust tenets.
- **Forgeable-if-misused.** If an integrator wires the structural pass or a tri-state vector into the admission path, the system fails open. The correct posture is deny-only pre-filter → typed-AST value binding → signed-capability admission.
- **Re-derivation, not new theory.** The exhaustiveness rule duplicates the shipped governance tree-walker and Rust-style match totality; the structural guard duplicates the parameterised-parse principle. The novelty is the *combination* (light-ASCII authoring + mandatory spatial exhaustive drain + deny-only structural pre-filter, all lowering to a pure runtime IR at zero runtime tax), not any single underlying result.

## 7. Illustrative disclosure claims

*(Phrased as disclosed embodiments and defensively broad but true. These are prior-art statements, not patent claims.)*

1. **A method** wherein a graph-shaped control-flow or dataflow program is authored in a line-oriented printable-ASCII syntax using a directed-vector token (`->`), a node token (`[]`), and a fixed set of terminal/branch markers including a tri-state marker (`[?]`) and drain markers (`[!]`, `[-]`), *excluding* 2D box-drawing glyphs, such that the source is recovered by a single left-to-right, top-to-bottom lexing pass in time linear in source length.

2. **A method** wherein an ahead-of-time compiler rejects any tri-state (`[?]`) node that does not possess at least one outgoing track terminating in a drain marker (`[!]` or `[-]`) reached via an explicit catch-all label, emitting a "Non-Exhaustive Spatial Match" diagnostic, thereby guaranteeing that every input to the node is deterministically drained rather than left unmapped (a spatial analogue of wildcard-arm match exhaustiveness / deny-by-default fall-through).

3. **A method** wherein a structural-parse pre-filter aborts compilation of any authored query whose ASCII shape is malformed — including unbalanced node brackets, absence of a directed vector, or embedded control characters — as a *deny-only* structural injection guard, while a syntactically well-formed query is permitted to proceed *regardless of its semantic hostility*, such that the pre-filter is explicitly not an authentication or admission mechanism and is positioned in front of value-level typed-AST parameterisation and a signed-capability admission decision.

4. **A method** wherein the said light-ASCII authoring syntax lowers ahead-of-time to a distinct pure runtime intermediate representation, so that both the exhaustive-default-drain check and the structural injection pre-filter are discharged entirely at build time and impose no additional runtime cost.

5. **A system** in which the structural pre-filter of claim 3 and the exhaustiveness check of claim 2 are arranged as complementary compile-gate lints that *do not* substitute for value-level parameterisation or for a cryptographic capability check, such that the admission decision remains on a signed runtime capability and treating any parsed graph shape or tri-state vector as the admission authority is recognised as a fail-open misuse.

6. **A method** wherein the choice of the line-oriented syntax over a 2D box-drawing representation is justified by a measured *constant-factor* parse-cost reduction and improved diffability/machine-authorability, *without* asserting an asymptotic (order-of-complexity) improvement, and wherein a tri-state branch is acknowledged to cost at least as much branch work as a boolean branch on binary hardware.

## 8. Machine-checkable evidence

**Proof artifact:** `proofs/rd-0227-proof.mjs` (self-contained; Node built-ins + `assert`). Re-run to reproduce.

Checks:
- **(a) Parse order.** Grows equivalent N-node graphs; fits log-log exponents: light-ASCII ≈ **1.006**, competent 2D-grid ≈ **1.003** (same order, ~**9.5×** constant at N=512), naive per-node re-scan ≈ **1.997**. Conclusion: the "O(N) vs O(N²)" claim is a **constant-not-order overclaim**; O(N²) is real only for a strawman.
- **(b) Exhaustiveness.** A `[?]` with no default drain is **REJECTED** ("Non-Exhaustive Spatial Match"); `[?]` with an `[Unhandled] -> [!]` catch-all is **ACCEPTED**; a drain terminal on a non-catch-all branch is **REJECTED**. Exhaustiveness confirmed.
- **(c) Structural injection guard.** Broken shape and control-char smuggle are **rejected**; a well-formed **hostile** query (`[attacker] -> [database.drop_all] -> [+]`) **PASSES** → guard is **deny-only**, not authentication.
- **(d) Branch-cost / "zero-branching" refutation.** Tri-state `[?]` branch cost **2** > boolean **1** on binary silicon (trit = 2 bits); AOT pre-parse is a one-time **constant** saving, not an order change.

**GREEN result line (from the proof):**

```
=== ALL 13 assertions green ===
```

All checks re-run GREEN (13/13). Verification status in the source analysis: **HIGH, confirmed = true.**

---

*This defensive publication is released to establish prior art. It makes no patent claim. The techniques disclosed are placed in the public domain; the limitations in §6 are an intended and integral part of the disclosure.*
