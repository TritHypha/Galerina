# Defensive Publication — Schema-lock with co-located keyed contract and a deny-only prefilter: "a schema match is never an ALLOW"

**Disclosure ID:** DP-RD-0272 · **Date:** 2026-07-08 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Provenance:** RD-0266c §3 (schema-vs-contract verdict) and §5b (empty-fold pin, added 2026-07-08) · syntax security review findings A6/A7/A8 (`galerina-rd-0266-syntax-security-review-2026-07-08.md`) · beta implementation plan §2.3–2.4/§8 (`PROMPT-syntax-update-beta-shippable-2026-07-08.md`) · sibling structural prefilter DP-RD-0227.

> **Purpose.** Defensive publication; **novelty disclaimed** (§3). The recorded construction separates two layers that AI-generated designs repeatedly conflate: a **schema** (shape/type filter — can only cheaply DENY malformed input) and a **contract** (keyed authorization — the only source of ALLOW). Its four rules: (1) the contract is **co-located inside** the schema declaration so the check cannot be forgotten; (2) declaring a schema **locks it onto the flow** (`through S`): the flow admits only data that entered via S's checked path, verified as a graph dominator relation at compile time; (3) any physical/structural/optical pre-check is a **deny-only prefilter** in front of the keyed contract — a match is *never* an ALLOW; (4) verdict folds are pinned against vacuous truth: **an `all{}` over an empty admission set yields DENY, never the fold identity (+1)**.

---

## 1. Technical field

Type/schema systems co-designed with authorization in governance languages; compile-time data-path verification (dominator analysis) for input validation; the validation-vs-authorization boundary; three-valued verdict folding.

## 2. Background & problem

Two recurring failures. (a) *Forgotten check*: schema validation and authorization live in different places, so a new code path validates but never authorizes (or vice versa) — the gate exists and is uncalled (CWE-862; class FO-GATE-UNCALLED). (b) *Promotion*: a validation pass, structural parser, or physical filter is treated as the authorization decision — "it matched the schema, so it's allowed" (validated ≠ authorized; in the audited photonic notes this appeared as "the optical schema replaces the contract", i.e. physics-as-authority, DP-RD-0270 family 4). A third, subtler failure appears when verdicts are folded: the mathematical identity of a min-fold over an empty set is the top element (+1/ALLOW), so an admission check over *zero* policies silently allows (vacuous truth; the same shape as "must be able to deny under empty policy").

## 3. Prior art (stated honestly — novelty disclaimed)

- **B. Meyer, "Applying 'Design by Contract'," *IEEE Computer* 25(10):40–51, 1992.** Contracts co-located with declarations. Not claimed.
- **A. King, "Parse, don't validate," 2019 (lexi-lambda.github.io).** Shape checking at the boundary yielding a trusted type — the schema half. Not claimed.
- **OWASP guidance separating input validation from authorization (validation is not an access-control mechanism); CWE-862.** The layer separation itself is standard doctrine. Not claimed.
- **Compiler dominator analysis (standard SSA/CFG technique).** Using dominators to prove "the check runs before the sink on every path" is classical; not claimed.
- **Vacuous truth over empty ranges (fold identities)** — elementary; the *pin* (deny on empty admission fold) is a polarity decision, not mathematics.
- **Sibling disclosures:** DP-RD-0227 (deny-only *structural* prefilter for a graph-authoring syntax — this note generalises the same posture to the language's schema construct); DP-RD-0216 (ternary prefilter forgery caveat); DP-RD-0271 (the fail-closed defaults injected into these contracts); DP-RD-0270 (the fallacy class rule 3 exists to block).

**Novel only in combination:** schema-with-embedded-keyed-contract as a single declaration + compile-time dominator-checked schema-lock on the flow + the explicit deny-only status of every prefilter + the empty-fold deny pin, in one construct.

## 4. Summary of the disclosed subject matter

A language construct `sealed [auto] schema S { <shape> contract { <keyed policy> } }` wherein: the schema's shape check can only reject (DENY) or pass-through (no verdict); authorization derives exclusively from the embedded contract's keyed policy (with DP-RD-0271 fail-closed defaults injected for omitted fields); a flow declared `through S` is compile-time verified — by a dominator check on the flow graph — to receive data only via S's check-and-authorize path, any bypass edge being a compile error; any additional pre-check (structural parse, optical/physical filter, rate shape) is admitted only in the deny-only prefilter position ahead of the contract, its positive outcome carrying no authorization weight; and any fold of admission verdicts over a possibly-empty collection is compiled with an explicit empty-case yielding DENY.

## 5. Detailed description

- **5.1 Co-location (kills "forgot the check").** The contract block is syntactically *inside* the schema declaration; there is no way to instantiate S-shaped data on a governed path without the contract having been evaluated. `sealed` makes the pair immutable after declaration.
- **5.2 Schema-lock (`through S`).** Declaring `flow F(x: S) through S` binds F's input to S's checked path. The compiler verifies the S-check node **dominates** F's entry for x on every path in the flow graph; constructing an S-typed value by any other route (cast, deserialize, field-copy) is rejected. This turns "we validate somewhere upstream, probably" into a checked graph property.
- **5.3 Deny-only prefilter.** A `prefilter` block may reject early (malformed shape, wrong wavelength, rate anomaly) — useful for cost-shedding — but its pass outcome is typed as "no verdict", not ALLOW; the keyed contract still runs. This is the sanctioned position for every physical/analog signal (compose per DP-RD-0270: `min(keyed, physical)` — degrade-only).
- **5.4 Empty-fold pin.** `all{…}` (min-fold) over an empty verdict set returns the fold identity +1 in naive semantics; in any admission context the compiler substitutes the explicit empty-case DENY (or requires the author to write one). Symmetric care applies to `any{}` (identity −1 is already safe for admission).

## 6. Honest limitations & scope

- **The dominator check is intra-graph:** it proves path coverage within the compiled flow graph; data entering through FFI/host boundaries outside the graph must be wrapped at those boundaries or the lock proves nothing about them.
- **A schema cannot authorize — by design.** Nothing here makes shape checks stronger; the construction's whole point is refusing them authority. Systems wanting "schema-only" admission are the documented fail-open, not a supported mode.
- **Prefilters remain forgeable/bypassable individually** (cf. DP-RD-0216/0227); they are cost filters, not security controls, and the design must stay correct with every prefilter deleted.
- **`sealed` immutability is compile-artifact immutability** (covered by signing); it does not defend the toolchain itself (see DP-RD-0129 for integrity-vs-fidelity).
- **No new cryptography;** contract keys/registries are assumed from the surrounding system (DP-RD-0271 §6).

## 7. Illustrative disclosure claims (prior-art disclosures, not patent claims)

1. **A language construct** wherein a data schema declaration syntactically embeds the keyed authorization contract governing that data, such that no governed instantiation of the schema exists without contract evaluation.
2. **A method** as in claim 1 wherein a flow declared as receiving the schema is compile-time verified, by a dominator relation over the flow graph, to receive such data only via the schema's check-and-authorize node, any bypass construction being rejected at compile time.
3. **A method** as in claims 1–2 wherein every pre-authorization check — structural, statistical, or physical — occupies a deny-only position whose positive outcome carries no authorization weight, the authorization verdict deriving solely from the keyed contract.
4. **A method** as in claims 1–3 wherein a conjunction-fold of admission verdicts over a possibly-empty collection is compiled with an explicit empty-collection case yielding denial, the algebraic fold identity being excluded from admission semantics.

## 8. Evidence & cross-references

Two-layer verdict and adopt-list scoring: RD-0266c §3–§4. Dominator/bypass requirement and "not declared ≠ invisible": security review A6/A7/A8. Deny-only prefilter position and split-brain compiler: beta plan §2.4. Empty-fold pin: RD-0266c §5b (reduce row, 2026-07-08). The conflation this refuses: DP-RD-0270 §5 family 4 ("the optical schema replaces the contract" — refuted and conceded by its generator).

### Declarations
- **Type / tier:** defensive-pub. Not a novelty claim. · **Authorship & AI assistance:** drafted with AI assistance under human direction (owner: Phillip Booth); grounded in the cited RD/security-review documents. Prior-art triage from training knowledge, not a filed legal search. · **Funding:** none. · **Competing interests:** none. · **Artifacts:** at the stated in-repo paths. · **Licence:** Apache-2.0.
