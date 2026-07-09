# Defensive Publication — An AI-authored graph-topology language compiled by an AOT governance gate that proves data-flow unreachability and blocks hallucinated geometry before emitting the runtime module

**Disclosure ID:** DP-RD-0229 · **Date:** 2026-07-01 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Provenance:** RD-0229 · analysis `galerina-rd-0226-0230-77mesh-ascii-graph-gate.md` (§ RD-0229) · machine-checkable proof `proofs/rd-0229-proof.mjs` (re-run GREEN).

> **Purpose of this document.** This is a defensive publication (prior-art disclosure), not a patent application. Its goal is to place the sound technique — an AI-friendly light-ASCII graph-authoring language compiled ahead-of-time (AOT) by a governance gate that statically proves data-flow *unreachability*, validates every drawn edge against an effect whitelist, and rejects AI-hallucinated (orphaned) geometry before any runtime module is emitted — into the public record so it cannot be monopolised by a later filing, and to put the **honest bound** on record alongside it. The security-relevant machinery here is a **re-derivation** of an already-shipped governance stack (graph reachability / effect-subset proofs / privacy-egress clause); the net-new element is the *amnesia-proof AI-authoring surface* wired to compiler-proven zero-trust isolation with the runtime kept pure. Nothing here is claimed as a novel theorem. The contribution is a precise, machine-checked statement of what is sound, what is merely under-specified in the source note (and the correct form), and where admission authority does — and does not — reside.

---

## 1. Technical field

The subject matter concerns authoring languages and ahead-of-time (AOT) compilers for governed application/data-flow modules, and in particular a static "governance gate" that runs before code generation to (a) prove that a sensitive data source cannot reach an unauthorised sink along the drawn data-flow graph, (b) validate that every declared side-effect edge is within a permitted effect set, and (c) reject graph nodes/edges that a code-generating agent (an LLM) invented but that are not anchored to any declared interface. It also concerns the correct separation between a **compile-time deny-only pre-filter** and a **runtime admission gate**, and the distinction between plain node-reachability and taint (data-flow) reachability across a value-re-typing (redaction) node.

## 2. Background & problem

In the source R&D corpus, an owner directive proposes a line-oriented, light-ASCII authoring DSL (`.graph`) that a human or — critically — an automated coding agent can write, using a small symbol set (`->` edge/vector, `[]` node, `[✓] [×] [?] [!] [+] [-]` outcome nodes). The `.graph` source is compiled **ahead of time** into an intermediate `.fungi` module and then to WASM. A hard project constraint (the "owner lock") is that the **runtime stays pure `.fungi`** — `.graph` is never itself a runtime; it is only an authoring/IR layer, so it must impose **zero runtime tax**.

Three problems motivate the gate:

1. **Data-flow leakage (IDOR / egress).** A drawn graph may wire a sensitive source (e.g. `PatientId`, or a raw model that carries it) straight into a response sink (`response.body`). This is an insecure direct-object-reference / broken-object-level-authorisation and egress-of-protected-data class of defect (CWE-639 / CWE-200-family; OWASP A01). The question is whether a *static* check on the graph can guarantee the forbidden pair is unreachable before any module is emitted.

2. **AI drift / hallucinated geometry.** When an LLM authors the graph, it can emit nodes and edges that correspond to nothing declared — "orphaned geometry" — silently expanding the module's surface. The question is whether the gate can deterministically reject geometry that is not anchored to a declared interface.

3. **Topology mistaken for authority.** A tempting error is to treat "the graph passed all static checks" as an *admission* decision. It is not. A well-formed, clean topology says nothing about whether the *caller* is authenticated. Treating structural validity as admission is the corpus's recurring fail-open pattern (RD-0162 / RD-0169). The question is whether the gate stays a deny-only pre-filter in front of the signed capability, and never becomes the admission gate.

A subsidiary performance question is whether the line-oriented parse is genuinely linear (O(N)) as claimed — as opposed to a 2D-grid parse — without overclaiming it as O(1) / "zero-cycle."

## 3. Prior art (stated honestly)

The security machinery disclosed here is **not novel**; it is a faithful re-derivation of established practice and of an already-shipped governance stack. The closest existing work:

- **Static data-flow / taint analysis and reachability-based information-flow control.** Proving that a tainted source cannot reach a disallowed sink is classic taint analysis and information-flow control (in the tradition of Denning-style secure information flow, and modern static taint tools). NIST SP 800-53 AC-4 (information-flow enforcement) is the control being discharged. The disclosed unreachability check is this principle applied at an AOT authoring gate over an explicit graph. Credit is due entirely to that prior art.
- **Effect systems / capability-subset checking.** Validating that every drawn effect edge lies within a declared effect set is an effect-system / capability-attenuation check (`effects ⊆ declared`), long known in typed effect systems and object-capability designs. Within this corpus it is the shipped `effectsSubset` / `allowedEffectsMask` primitive; this disclosure re-derives it, it does not invent it.
- **Match exhaustiveness / deny-by-default fall-through.** The mandatory default-drain on a `[?]` tri-state node is Rust-style match-exhaustiveness (the `_ =>` arm) and textbook deny-by-default; it closes CWE-478 (missing default in a multi-branch decision). Known compiler practice.
- **Parameterised queries / structured parsing** (SQL prepared statements; AST/IR query layers) — the adjacent injection-safety discipline cited by the corpus (see DP-RD-0204). Named for completeness; the line-oriented structural parse shares the "structure-is-data, not text" spirit but is not the subject here.
- **Kunegis signed-graph / signed-Laplacian methods**, and the wider tri-topology / GraphBLAS substrate framing in the corpus — cited to bound the field; the disclosed gate uses ordinary directed-graph reachability, not a spectral method, so these are situated near but are not the mechanism.
- **Hardware/OS isolation prior art referenced by the corpus** — Intel CAT / cache page-colouring and CATalyst; vLLM PagedAttention; ECC/TRR Rowhammer mitigations; b-ary search theory — is named because the corpus situates isolation and tri-state designs near these. **None of them is the source of, nor infringed by, the specific technique disclosed here**; unlike those hardware/OS-gated mitigations, the guarantee here is a *software compile-time* property (see §6). They are cited to bound the field and pre-empt over-broad later claims.

## 4. Summary of the disclosed subject matter

A light-ASCII, line-oriented authoring language is compiled ahead-of-time by a governance gate that, before it emits any runtime module, (i) builds an adjacency matrix of the drawn data-flow graph and proves that each contract-forbidden source→sink pair is **unreachable** — computed not as naive node-reachability but as **taint reachability with each redaction/re-typing node treated as a cut vertex**, so a raw sensitive value that flows only into a redaction node whose output is a fresh masked node is correctly ALLOWED while a raw value wired to the sink is REJECTED; (ii) validates that every drawn edge into an effect node is within the declared effect set, halting the build on any undeclared effect; (iii) rejects any node not anchored to a declared interface (orphaned/AI-hallucinated geometry); and (iv) enforces a mandatory default-drain on every `[?]` tri-state node (exhaustiveness). The runtime stays a pure `.fungi` module (owner lock) so the authoring layer adds zero runtime tax, and the gate is a **deny-only pre-filter**: a clean topology with no valid signature is still `DENY@runtime` — admission remains keyed on the signed `.fungi` capability, never on topology.

## 5. Detailed description / embodiment

### 5.1 The unreachability proof (flagship — with the correction the note needed)

Let the drawn `.graph` be a directed edge set. `reachable(edges, A, B)` is ordinary directed reachability; `Path(A→B) = 1` iff `B` is reachable from `A`. For a contract-forbidden pair — the note's example is `PatientId → response.body` — the gate REJECTs the build iff `Path > 0`.

**(a) Violating graph (caught).** With edges `INPUT→PatientId`, `PatientId→RawPatientModel`, `RawPatientModel→response.body`, the raw model carries the patient id straight to the response:

```
Path(PatientId -> response.body) = 1  => REJECT
```

**(b) Redacted graph — and the correction.** The safe map routes `PatientId→RedactPHI→MaskedView→response.body` (the masked output is a *new* node) plus `PatientId→audit.write`. The source note's literal claim was "`Path=0`". That is **under-specified**: as a plain node graph, `MaskedView` — and hence `response.body` — is still *reachable from* `PatientId` (the graph is connected *through* the redaction node), so naive node-BFS reports `Path=1`. The **correct** check, and the one that matches the shipped finer-than-BFS taint/re-type model, is **taint reachability with the redaction node as a cut vertex**: the redaction node *re-types* the value (clears taint), so the *tainted* value does not flow past it even though the nodes are connected. The proof pins this correct form:

```
(b) redacted   Path (naive node-BFS)                              = 1   => REJECT   (under-specified)
(b) redacted   Taint(PatientId ~> response.body | cut=RedactPHI)  = 0   => ALLOW    (correct model)
```

The proof also confirms the redaction node is genuinely load-bearing: under the same taint check the *violating* graph still leaks (`taintReaches(... , cut=∅) = true`). So the ALLOW verdict is earned by the cut, not by a weaker check. This closes the IDOR/egress class (CWE-639; FUNGI-PRIVACY-002 "deny protected X → response.body") **at compile time**.

### 5.2 Effect-whitelist (adjacency) validation

Every edge whose target is an effect node must have that effect declared. With `declaredEffects = {database.read, phi.read, audit.write}`: a graph touching only declared effects passes (`undeclared = []` → ALLOW); a graph drawing an edge to `database.write` (not declared) halts the build (`undeclared = [database.write]` → REJECT). This re-derives the shipped `effectsSubset` / `allowedEffectsMask` (`effects ⊆ declared`) and discharges NIST 800-53 AC-4 at build time.

### 5.3 Hallucination / orphan-geometry block

A node is *anchored* iff reachable (by forward closure) from a declared root (here `INPUT`). Any unanchored node is orphaned geometry. Given nodes `{INPUT, PatientId, RedactPHI, MaskedView, response.body, GHOST_NODE}` and a fully connected `INPUT→…→response.body` chain that omits `GHOST_NODE`:

```
orphaned nodes = [GHOST_NODE]  => REJECT
```

An AI-invented node with no anchoring edge fails the build — the AI-drift containment property.

### 5.4 Exhaustiveness (default-drain / `_ =>`)

Every `[?]` tri-state node must route to at least one drain (`[!]`/`[-]`/`Unhandled`/`_`). A `[?]` with `is String→[+]`, `is Int→[+]`, `Unhandled→[!]` passes (ALLOW); the same without the drain arm is REJECTed. This is Rust-match exhaustiveness closing CWE-478; for K3 `{+1,0,-1}` it means handled + handled + drain.

### 5.5 Parse order — O(N), and *only* O(N)

A line-oriented lexer touches each character once. Measuring parse work for `N ∈ {1000, 2000, 4000, 8000}` lines gives doubling ratios `[2.051, 2.025, 2.012]` (O(N) ≈ 2.0; O(N²) ≈ 4.0), confirming **linear** parse. This is deliberately framed as an **order** claim about the lexer, **not** an O(1)/zero-cycle claim — SIMD/hardware cut the *constant*, never this order (binding RD-0036/0156/0166 constant-not-order posture).

### 5.6 Owner-lock — the gate is deny-only, admission stays on the signed capability

`admit({topologyOk, effectsOk, signedCapabilityValid})` returns `REJECT@compile` if the topology or effects fail (the gate can only reject early), and at runtime returns `ADMIT` only if the signed capability is valid, else `DENY@runtime`. Crucially:

```
clean topology + NO signature    => DENY@runtime     (no fail-open)
clean topology + valid signature => ADMIT
broken topology                  => REJECT@compile   (deny-only pre-filter)
```

A clean topology **never admits on its own**. This pins the design away from the RD-0162/0169 fail-open: topology ≠ authentication.

## 6. Honest limitations & scope

This section is load-bearing. The honesty *is* the contribution.

- **The security machinery is a re-derivation, not an invention.** The unreachability check (RD-0150 no-edge=no-reach), the effect-subset whitelist (shipped `effectsSubset`/`allowedEffectsMask`), the privacy-egress clause (FUNGI-PRIVACY-002), the contract shape, and the exhaustiveness rule are all already-shipped. The net-new element is the *AI-authoring surface* (amnesia-proof, hallucination-blocked) wired to those proofs at an AOT gate, plus the naive-node-vs-taint-reachability correction. No new theorem is claimed.
- **Compile-time, deny-only pre-filter — never an admission gate.** The gate can only **reject**; it can never manufacture an ALLOW/ADMIT. A clean topology with no valid signature is `DENY@runtime`. If a topology "pass" were ever treated as admission, it would be **fail-open** (RD-0162/0169). Admission must remain keyed on the signed `.fungi` capability plus real (post-quantum) cryptography. This is pinned in the proof (§5.6); the moment that pin is removed, the design collapses to the forgeable state.
- **The literal `Path=0` claim in the source note is under-specified and would be wrong if implemented as node-reachability.** A safe redacted graph is *connected* through the redaction node, so naive node-BFS reports `Path=1` and would either false-reject every redacted flow or, if inverted, false-allow. The guarantee holds **only** when implemented as **taint** reachability that treats redaction/re-typing nodes as cut vertices. That correctness is conditional on the compiler actually modelling value re-typing — a value that is merely *renamed* but still carries the taint is not cut.
- **The guarantee is a property of the graph and the executor discipline, not a magic word.** It holds only if the emitted `.fungi`/WASM module preserves the data-flow structure the gate proved — no later stage may re-introduce an edge (e.g. logging the raw value, a reflective/dynamic dispatch the graph did not model, or a redaction node that does not actually clear taint). It is a build-time property over the *declared* graph; it says nothing about effects reached through undeclared dynamic behaviour.
- **Constant-factor honesty on performance.** The parse is O(N); it is **not** O(1) or "zero-cycle." The "runtime tax = zero" claim is specifically about the owner-lock (a `.graph` *runtime* is never shipped; only the compiled `.fungi` runs), not about the compiler doing no work. Any hardware/SIMD speedup of the gate is a constant-factor effect.
- **Not HW/OS-gated — and that is a limitation to state plainly.** Unlike the cache-partition / memory-isolation / Rowhammer mitigations cited in §3, this is a software compile-time analysis. It assumes the surrounding platform and transport are trustworthy (authenticated transport, an honest compiler and toolchain, an executor that respects the compiled module). It does not defend against a compromised compiler, a compromised executor, or side channels.
- **Scope of the machine check.** The proof is an executable *model* (Node.js built-ins + `assert` only) demonstrating the mechanism on representative graphs. It is a faithful model, not a formal verification of a production compiler, and not a proof about any specific deployed codebase. It does not establish that a full implementation is free of *other* vulnerabilities (authorisation logic elsewhere, serialisation bugs, taint-tracking gaps).

## 7. Illustrative disclosure claims

These are disclosed embodiments (defensively broad but true statements), not patent claims:

1. **A method** of compiling a line-oriented graph-authoring source ahead-of-time into a runtime module, wherein, before the runtime module is emitted, a governance gate builds an adjacency representation of the drawn data-flow graph and rejects the build if any contract-forbidden source→sink pair is reachable, such that a sensitive source wired to a disallowed sink is caught at compile time (`Path>0 ⇒ REJECT`).

2. **A method** as in (1) wherein the reachability check is computed as **taint reachability that treats a redaction/value-re-typing node as a cut vertex**, whereby a sensitive value flowing only into a redaction node whose output is a distinct masked node is ALLOWED even though the underlying node graph remains connected, while a sensitive value reaching the sink without passing such a cut is REJECTED — correcting a naive node-reachability check that would otherwise misclassify a safe redacted flow.

3. **A method** wherein the same gate validates that every drawn edge whose target is an effect node lies within a declared effect set, halting the build on any undeclared effect edge (`effects ⊄ declared ⇒ REJECT`), thereby discharging information-flow effect control at build time.

4. **A method** wherein the gate rejects any graph node that is not anchored — by forward reachability from a declared interface root — to the declared interface, such that a node invented by an automated (LLM) authoring agent but connected to nothing declared fails the build, containing AI-authoring drift/hallucination.

5. **A method** as in any of (1)–(4) wherein the graph-authoring language is an authoring/intermediate layer only and no graph *runtime* is emitted — the emitted runtime being a distinct pure module — such that the authoring and governance apparatus imposes zero runtime overhead (owner-lock / zero runtime tax).

6. **A disclosure** that such a compile-time governance gate is a **deny-only pre-filter**: a graph that passes every static check confers no admission by itself, and a request bearing a clean topology but no valid signed capability is denied at runtime — admission being decided solely by verification of a signed (post-quantum) capability — placing on the public record that graph-topology validity is not authentication and must never be used as an admission gate.

## 8. Machine-checkable evidence

- **Proof artifact:** `proofs/rd-0229-proof.mjs` (Node.js, standard-library only: `node:assert/strict`). Re-runnable; deterministic.
- **Check A — unreachability proof (SOUND, with correction):** violating graph `PatientId→RawModel→response.body` gives `Path=1 ⇒ REJECT`; redacted graph gives naive `Path=1` (under-specified) but `Taint(… | cut=RedactPHI)=0 ⇒ ALLOW`; the violating graph still leaks under the taint check, proving the cut is load-bearing. Closes CWE-639 / IDOR / egress at compile time (RD-0150 / FUNGI-PRIVACY-002).
- **Check B — effect whitelist / adjacency (SOUND):** declared-only graph passes (`undeclared=[]`); an edge to `database.write` (undeclared) halts the build (`undeclared=[database.write] ⇒ REJECT`). Re-derives `effectsSubset`/`allowedEffectsMask`; NIST 800-53 AC-4.
- **Check C — hallucination / orphan block (SOUND):** an unanchored `GHOST_NODE` is detected (`orphaned=[GHOST_NODE] ⇒ REJECT`). AI-drift containment.
- **Check D — exhaustiveness / default-drain (SOUND):** a `[?]` node with a drain passes; without a drain it is REJECTed. Rust-match exhaustiveness; closes CWE-478.
- **Check E — O(N) parse order (SOUND, order-only):** doubling ratios `[2.051, 2.025, 2.012]` confirm linear parse (not O(N²)); explicitly **not** an O(1)/zero-cycle claim.
- **Check F — owner-lock / deny-only (SOUND):** clean topology + no signature ⇒ `DENY@runtime`; clean topology + valid signature ⇒ `ADMIT`; broken topology ⇒ `REJECT@compile`. Pins topology ≠ admission (no RD-0162/0169 fail-open).

**GREEN result line (verbatim from re-run, 2026-07-01):**

```
ALL GREEN ✅  (6/6 blocks; unreachability, effect-whitelist, orphan-block, exhaustiveness, O(N) parse, owner-lock)
```
