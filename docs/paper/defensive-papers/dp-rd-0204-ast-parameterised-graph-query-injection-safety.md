# Defensive Publication — Injection-safe graph-relational querying by strict AST parameterisation, with a machine-checked refutation of ternary-dot-product-as-authentication

**Disclosure ID:** DP-RD-0204 · **Date:** 2026-07-01 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Provenance:** RD-0204 · analysis `galerina-rd-0200-0208-77mesh-tristate-meshql.md` (§ RD-0204) · machine-checkable proof `proofs/rd-0204-proof.mjs` (re-run GREEN).

> **Purpose of this document.** This is a defensive publication (prior-art disclosure), not a patent application. Its goal is to place the sound technique and the accompanying refutation into the public record so that (a) the injection-safety technique — which is a re-derivation of long-known parameterised-query practice applied to a graph-relational DSL/AST — cannot be monopolised by a later filing, and (b) the *negative* result (an unkeyed ternary dot product is not authentication) is on record as prior art against anyone who would market it as a security primitive. Nothing here is claimed as novel invention; the contribution is a precise, machine-checked statement of what is sound, what is unsound, and where the honest bound lies.

---

## 1. Technical field

The subject matter concerns query languages and query-execution engines for graph-relational data stores, specifically the safe construction and execution of queries whose filter/predicate values originate from untrusted callers (human end-users and/or automated agents emitting structured query intent). It also concerns the correct scoping of a lightweight ternary (trit-valued) affinity computation used for early access-control filtering in such an engine, and the distinction between a resource-shaping pre-filter and an admission-control gate.

## 2. Background & problem

A graph-relational query surface described in the source R&D corpus ("TritMeshQL") exposes two front-ends over one execution engine: a human-facing block DSL (`WHAT` / `HOW` / `WHERE` / `TIME` / `FILTER` / `RETURN`) and a deterministic machine-facing JSON abstract-syntax-tree (AST) emitted by an automated agent. Both front-ends carry attacker-influenceable filter values (customer IDs, field selectors, ranges).

Two problems arise:

1. **Query injection.** If filter values are interpolated into query *text* — the classic string-concatenation anti-pattern — a caller who can close a value delimiter can smuggle control tokens (`RETURN: *`, `DROP`, `OR 1=1`) into the query structure. This is CWE-89 (SQL/query injection) / OWASP Top-10 A03 (Injection), and it applies to any text-templated query language, not only SQL.

2. **Over-scoped "authentication" primitive.** The source note additionally proposes that access be decided by a SIMD ternary dot product: a caller's `.spore` capability vector `S` is multiplied against a node's capability mask `C`, and an `EXPECT +1` verdict (dot product hits its maximum) is treated as *authentication* — "a security check in a single clock cycle." This conflates an affinity/eligibility score with a cryptographic authentication decision. The problem is whether an unkeyed dot product can bear that weight.

## 3. Prior art (stated honestly)

The technique disclosed here is **not novel**; it is a faithful re-derivation of established practice, and the refutation rests on standard cryptographic reasoning. The closest existing work:

- **Parameterised / prepared statements and bind variables** (SQL prepared statements, PDO/JDBC bind parameters, ORM parameter binding). Carrying values as typed data bound out-of-band from query text — rather than concatenating them into query syntax — is the canonical, decades-old defence against CWE-89 / OWASP-A03. The disclosed AST technique is the graph-relational-DSL expression of exactly this principle. Credit is due entirely to that prior art; the only thing added here is the observation that a strict typed AST (values live in `filters.<k>` data fields, never in a token stream) *is* parameterisation by construction.
- **Structured/AST-based query construction** (e.g. query builders and IR/AST layers in Presto, Spark Catalyst, GraphQL typed variables, MongoDB BSON query documents) already avoid text interpolation by representing predicates as data. The disclosed embodiment is within that family.
- **Cryptographic authentication vs. similarity scoring.** The refutation applies textbook results: an authenticator must be unforgeable by a party lacking a secret (keyed MAC / digital signature). A *public* mask combined by a public linear operation (dot product) has no secret and therefore no unforgeability — analogous in spirit to the general principle behind keyed-MAC / signed-capability designs. The corrected model uses HMAC-SHA-256 (RFC 2104 / FIPS 198-1) over the serialised query.
- **Adjacent zero-trust / hardware isolation prior art referenced by the corpus** — Intel CAT / cache page-colouring and CATalyst, vLLM PagedAttention, Kunegis signed-Laplacian graph methods, ECC/TRR Rowhammer mitigations, and b-ary search theory — is named for completeness because the wider corpus situates trit-valued and mask-intersection designs near these. None of them is the source of, nor infringed by, the specific technique disclosed here; they are cited to bound the field and pre-empt over-broad later claims.

## 4. Summary of the disclosed subject matter

A two-front-ended graph-relational query system in which every attacker-influenceable filter value is carried as a typed *data* node in a strict AST and is never string-concatenated into query text structurally rejects query injection (CWE-89 / OWASP-A03): a malicious payload becomes an opaque value that matches zero rows and honours no injected control token, whereas the equivalent text-concatenation path leaks the injected token. Separately and independently, this disclosure records the machine-checked *refutation* that an unkeyed ternary dot product (`EXPECT +1`, `I = S·C == max`) is authentication: because the capability mask `C` is public, a party holding no secret forges a passing vector by verbatim-copying `C`, so its unforgeability is zero; the dot product must therefore be demoted to a **deny-only pre-filter** placed in front of a keyed, signed capability check (HMAC / post-quantum signature), never used as the admission gate itself.

## 5. Detailed description / embodiment

**5.1 Injection-safe AST embodiment (sound).**
The engine builds queries as strict typed AST nodes, e.g.:

```
buildQueryAST(customerId) -> { intent:'MATCH', node:'Customer',
                               filters:{ id: String(customerId) },
                               return:['id','total'] }
```

The executor reads `ast.filters.id` as an **opaque value** and compares it (`row.customer_id === wanted`). There is no code path that interprets characters *inside* a filter value as query control tokens — that is the whole mechanism. Contrast the anti-pattern builder, which interpolates the value into query text: `WHAT: Customer "${customerId}" RETURN: id,total`.

**Key result (from the proof).** With the attacker payload

```
1234" RETURN: * DROP Order "999
```

the **AST path** returns **0 rows** — the payload is an opaque `customer_id` value that matches nothing — and it provably cannot reach another tenant's row (no `OR 1=1` escape exists through a value comparison). The **text-concatenation path**, given the same payload, produces query text in which the injected `DROP` / `RETURN: *` token is present and would be honoured by a text-interpreting engine. This is exactly the parameterised-vs-concatenated distinction; the AST form closes CWE-89 / OWASP-A03 by construction.

**5.2 Refutation of dot-product-as-authentication (negative result).**
Let the capability space be trit vectors over `{-1, 0, +1}` of dimension `N = 256`. A node publishes a **public** capability mask `C` (published precisely so callers know what to present). Define `dot(a,b) = Σ aᵢbᵢ`, `MAX = dot(C, C)`, and the proposed rule `EXPECT +1 := dot(S, C) == MAX`.

- A legitimate holder presents `S = C` and passes (trivially).
- An attacker holding **no secret** sets `forged = C.slice()` — a verbatim copy of the *public* mask — and also passes. There is no secret *not* to know.

**Key number (from the proof).** The forged vector, constructed by copying the public `C`, passes `EXPECT +1` with result `true` — **unforgeability = 0**. The proof encodes the overclaim as an assertion that a no-secret attacker *must fail*, and shows that assertion *throwing* (i.e. the secure property is false). This is the same forgery kernel recorded in RD-0162 / RD-0164 / RD-0165: copying a public mask defeats an unkeyed affinity "check." (The corpus thesis phrases this as "10000/10000 copy-public-C forgeries pass"; the machine-checked embodiment demonstrates the stronger, deterministic form — a single verbatim copy passes with probability 1, so *every* such forgery passes.)

**5.3 Corrected composite (sound).**
Admission is `admit(S, query, tag) := EXPECT_plus1(S) AND realAuthMAC(query, tag)`, where `realAuthMAC` verifies an HMAC-SHA-256 tag over the serialised query bytes under a **server secret key the attacker does not hold**, compared in constant time. The dot-product term can only **deny early**; it never manufactures an ALLOW. The proof confirms: a forged vector + forged (random) MAC tag is **DENIED**, while the legitimate holder + valid keyed MAC is **ADMITTED**. Thus the sound role of the ternary dot product is a cheap deny-only pre-filter ANDed in front of a real keyed / post-quantum-signed capability check.

**5.4 Side results (recorded for completeness).**
The proof also checks two ancillary claims from the same source note: (i) the "single clock cycle over 256 orders" framing is **not** O(1) — masking `K` elements costs `K` lane-operations (256→256, 4096→4096); SIMD reduces the *constant factor*, not the asymptotic order; (ii) fixed-point money (`×100`, `500.00 → 50000`) is arithmetically exact and the cited IEEE-754 pitfall is real (`0.1 + 0.2 ≠ 0.3`; rescaled comparison recovers exactness). Both are correct known computer science, not novel.

## 6. Honest limitations & scope

This section is load-bearing. The honesty *is* the contribution.

- **The injection result is a re-derivation, not an invention.** It is parameterised queries expressed over an AST. It confers no novelty and should not be citable as a novel monopolisable technique by anyone.
- **AST-safety is a property of the executor, not a magic word.** It holds *only if* the execution engine treats filter values as opaque data with **no** interpretation path from value characters to control tokens. An engine that later re-serialises the AST back into interpolated text, or that interprets metacharacters inside a value, reintroduces the vulnerability. The guarantee is structural and conditional on that discipline being maintained end-to-end (including federation, logging, and any downstream text rendering).
- **The dot-product result is detect-/deny-only, never an admission gate.** The ternary `EXPECT +1` computation is **forgeable if misused** as authentication (unforgeability = 0 against a public mask). Its only sound role is a **deny-only pre-filter**: it may cheaply reject, but it must **never** be the thing that grants access. Admission must remain keyed on a signed capability plus real (post-quantum) cryptography. A `-1`/`0` verdict may deny; a `+1` verdict must **not** by itself admit.
- **The corrected model's security lives in the key, not the trits.** The composite is secure because of HMAC-SHA-256 over the query under a server-held secret — standard, well-understood cryptography. The trit pre-filter adds early-deny efficiency, not security. Removing the keyed term collapses the design back to the forgeable state.
- **Constant-factor, not order.** The performance framing around SIMD/"single clock cycle" is refuted as an O(1) claim: mask work is O(K). Any performance benefit is a constant-factor improvement on machines with wide lanes, not an asymptotic one.
- **Scope of the machine check.** The proof is an executable model (Node.js built-ins only) that demonstrates the structural distinction and the forgery on representative inputs and a 256-dimension mask. It is a faithful model of the mechanism, not a formal verification of a production engine, and not a proof about any specific deployed codebase. It does not, by itself, establish that a full implementation is free of *other* vulnerabilities (e.g. authorisation logic elsewhere, side channels, or serialisation bugs).
- **Not HW/OS-gated, and that is a limitation to state plainly.** Unlike cache-partition or memory-isolation mitigations cited in §3, the injection guarantee here is a software-construction property; it assumes the surrounding platform and transport are themselves trustworthy (TLS/mTLS, authenticated transport). It does not defend against a compromised executor.

## 7. Illustrative disclosure claims

These are disclosed embodiments (defensively broad but true statements), not patent claims:

1. **A method** of executing a graph-relational query wherein each caller-supplied filter value is carried as a typed data field of an abstract-syntax-tree node and is compared as an opaque value by the executor, such that no character within a filter value is interpreted as a query control token, whereby a filter value containing injected query syntax matches zero rows and honours no injected token — structurally rejecting CWE-89 / OWASP-A03 injection.

2. **A method** as in (1) wherein two distinct front-ends — a human-authored block DSL and a machine-emitted JSON AST — are parsed into the same strict typed AST, so that the injection-safety property holds identically for human- and agent-originated queries.

3. **A method** wherein a ternary (trit-valued) affinity computation between a caller capability vector and a node capability mask is used **solely as a deny-only pre-filter** that may reject a request early but is incapable of granting admission, admission being decided instead by verification of a keyed message authentication code or digital signature over the serialised query.

4. **A method** as in (3) wherein the composite admission decision is the logical AND of the deny-only affinity pre-filter and a keyed cryptographic verification under a secret key not available to the caller, such that a request presenting a forged affinity vector (a copy of the public mask) together with an invalid authentication tag is denied.

5. **A disclosure** that a ternary dot product `I = S·C` compared against its maximum, using a **public** capability mask `C`, provides zero unforgeability and therefore does not constitute authentication, since a party holding no secret passes the check by verbatim-copying the public mask — placing this negative result in the public record as prior art against any claim of such a construction as a security/authentication primitive.

6. **A disclosure** that the resource/latency characterisation of such masked affinity checks is a constant-factor (SIMD lane-width) effect and remains O(K) in the number of masked elements, not an O(1) or "single-clock-cycle" security operation.

## 8. Machine-checkable evidence

- **Proof artifact:** `proofs/rd-0204-proof.mjs` (Node.js, standard-library only: `node:assert/strict`, `node:crypto`). Re-runnable; deterministic in structure.
- **Check A — AST parse vs string-concat (SOUND):** the injection payload through the AST executor yields 0 rows and cannot cross to another tenant's row; the string-concat path leaves the injected `DROP` / `RETURN: *` token present in the query text. Establishes injection-safety-by-AST ≡ parameterised queries; closes CWE-89.
- **Check B — dot-product forgery (REFUTED-AS-AUTH):** a forged vector formed by copying the public mask `C` passes `EXPECT +1` (`true`); the "secure if this were auth" assertion throws, refuting the overclaim. Unforgeability = 0 (RD-0162 / 0164 / 0165 kernel).
- **Check C — corrected keyed composite (SOUND):** `prefilter(dot) AND HMAC-SHA-256(query)` denies the forged-vector + forged-tag request and admits only the key-holder with a valid tag.
- **Check D — "single clock cycle" (REFUTED as O(1)):** masking K elements costs K lane-ops (256→256, 4096→4096); SIMD cuts the constant only.
- **Check E — fixed-point money (SOUND, known CS):** `500.00 → 50000` exact; `0.1 + 0.2 ≠ 0.3` correctly cited; rescaled comparison recovers exactness.

**GREEN result line (verbatim from re-run, 2026-07-01):**

```
ALL ASSERTS PASSED: CLAIM A sound (AST=parameterized, closes CWE-89); CLAIM B forgery confirmed (EXPECT+1 dot != auth); corrected keyed model holds.
```
