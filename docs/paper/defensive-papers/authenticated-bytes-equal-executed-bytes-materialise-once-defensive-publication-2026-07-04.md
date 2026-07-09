# Authenticated bytes = executed bytes: materialise-once against representation-divergence in signed-graph authorization

**Disclosure ID:** DP-RD-0247 · **Date:** 2026-07-04 · **Type:** Prior-art disclosure (defensive) — NOT a patent claim · **Provenance:** RD-0247 (lineage RD-0150 graph-as-data-io-border, RD-0167 sign-the-graph, RD-0169 topology≠authority); re-runnable proofs `Galerina-R-AND-D/tritmeshql/graph-spine.mjs` (self-test battery, 26/26) and `Galerina-R-AND-D/tritmeshql/divergence-probe.mjs` (metamorphic prober); design record `ZTF-Knowledge-Bases/tritmeshql-signed-graph-spine-rd0150-2026-07-03.md`.

**Purpose.** This is a defensive publication. It places an engineering technique in the public domain as timestamped prior art so that it cannot be patented against the owner or the wider community. **Novelty is explicitly disclaimed** (see §3): the underlying primitives — TOCTOU, canonicalization-confusion, and parser-differential attacks — are all well established. The contribution is the specific *composition and discipline* for one problem, and — as much as the mechanism — the honestly disclosed **limitation** (§6): the discipline closes the failure class only for one object shape at one {sign, verify, run} triple, and must be re-applied at every such triple. Recording the boundary of what is closed is itself the point of the disclosure.

---

## 1. Technical field

Access control and data integrity in software systems; specifically, relationship-based access control (ReBAC) / signed-graph authorization, where an authorization decision is derived from traversal of a graph whose integrity is protected by a message authentication code (MAC) or digital signature. The technique concerns the boundary between *verifying* the integrity of an in-memory authorization object and *executing* the traversal that reads it.

## 2. Background & problem

In a signed-graph authorization model (RD-0150), a tenant is defined as the connected component reachable from a caller's passport-derived root node, and "no edge = no reach" is the authorization primitive. To stop an attacker silently redirecting reads by editing the graph, the graph is signed: an integrity key covers a canonical serialization of the graph (RD-0167, "sign the graph"), and traversal refuses to run on a graph whose MAC does not verify.

This introduces a subtle failure mode. The signature is computed over **one byte-representation** of the graph — the output of a canonicalisation pass that walks the live object. The runtime traversal then reads the graph a **second time**, through a **different** access path (building an adjacency map, resolving a tenant root, checking disjointness). In JavaScript (and any language with getters, proxies, prototype chains, or non-enumerable properties), the two reads of the *same live object* can be made to return **different values**. The canonicalisation pass sees a benign graph and signs it; the traversal pass sees a malicious graph and executes it — under a single valid signature. This is a time-of-check-to-time-of-use divergence, but the divergence is not in *time* — it is in *representation*: the check and the use read different views of the same object.

The design record documents that this exact class was forged **four separate times** by four successive fresh adversaries against the reference implementation, each finding a distinct instance of the *same* underlying class before the structural fix (per `tritmeshql-signed-graph-spine-rd0150-2026-07-03.md`, §"HARDENED THROUGH FOUR RED-TEAM ROUNDS"):

- **R1 — non-injective canon.** `nodes.join('')` / space joins mapped two runtime-distinct graphs onto identical MAC input, so they shared one valid signature while diverging in reachability.
- **R2 — prototype-polluted tenants.** Canonicalisation via `Object.entries` dropped `__proto__`/prototype-chain keys, but the runtime resolved a tenant root by bracket access, which *does* see them — a polluted tenants map forged a collision and made a hidden root reachable.
- **R3 — non-enumerable tenant.** The disjointness guard used `Object.values` (skips non-enumerable keys) while canon and lookup used `Reflect.ownKeys` / bracket access — a non-enumerable cross-tenant bridge was invisible to the guard.
- **R4 — `edge.to` getter.** `canonicalEdgeArr` reads an edge as `{from, label, to}` while `adjacencyOf` reads it as `{from, to}`. A getter on `to` returned the honest value on the canon path (where `label` is read immediately before `to`) and a malicious value on the adjacency path (where no `label` read precedes `to`). Canon signed a benign self-loop; the adjacency pass routed a tenant to an ungranted node — under a valid signature.

R1–R3 were point-patches on the tenants object; R4 on the edges array demonstrated that the root cause was not any single reader but the **input shape**: multiple readers of a live mutable object that can be made to disagree.

## 3. Prior art (stated honestly — novelty disclaimed over each)

The following prior art is closely related, and **novelty is explicitly disclaimed over each**:

- **TOCTOU (time-of-check-to-time-of-use) race conditions** (CWE-367, "Time-of-check Time-of-use Race Condition"). The general pattern — a security check and the guarded operation observing different state — is decades-old prior art. The present technique is a *representation*-divergence variant (the two observations differ not because time passed but because two access paths read one object differently); it is not claimed as novel over the TOCTOU concept.
- **Serialization / canonicalization-confusion attacks**, including signature-wrapping and canonicalization mismatches in XML Signature and JSON signing. The idea that a signature over a canonical form can be bypassed when the verifier and the consumer disagree on the canonical form is established prior art; no novelty is claimed over it.
- **JSON Canonicalization Scheme, RFC 8785.** A standard scheme for producing a deterministic canonical JSON serialization for signing. The reference implementation uses an ad-hoc injective canonicalisation (`JSON.stringify` over a sorted structure with fail-closed type checks), not RFC 8785 itself; no novelty is claimed over the concept of canonicalising before signing. RFC 8785 canonicalises the *bytes*; it does not by itself guarantee that the *runtime consumer* reads those same bytes rather than re-reading the live object — which is the specific gap addressed here.
- **Parser-differential ("interoperability") attacks**, where two parsers of the same input disagree (e.g. the general class exercised in XML Signature verification and HTTP request-smuggling research). Representation-divergence within a single process is an instance of the same underlying idea; no novelty is claimed over the parser-differential concept.

**Net contribution disclaimed to the public domain:** the *specific application* of the "authenticate the executed representation" discipline to **signed-graph / ReBAC authorization objects**; the **materialise-once** structural closure (canonicalise once, MAC those exact bytes, and re-parse the same bytes into a frozen snapshot that every runtime reader consumes); and the **reusable metamorphic divergence-probe** that asserts the invariant on the real code path and proves its own non-vacuity against a deliberately broken reference. This is disclosed as prior art, not claimed as patentable.

**Explicitly distinguished from DP-RD-0204** ("AST-parameterised graph query injection safety"). That disclosure concerns query-**string** injection (an attacker-controlled *string*, via text-templated query construction, reaching a query surface — CWE-89 / OWASP A03). This disclosure concerns representation-divergence in the authorization **object** itself — a structured graph whose two in-memory reads diverge under one signature. Different surface, different mechanism, different fix.

## 4. Summary of disclosed subject matter

A signed-graph authorization component avoids representation-divergence by **verifying and materialising exactly once**:

1. A single function performs the **only** read of the live authorization object, producing a canonical byte-string (`canonicalGraph`).
2. The MAC is computed and verified over *exactly those bytes*.
3. The *same* verified bytes are parsed (`JSON.parse`) into a **frozen snapshot of plain primitives** — strings and arrays only, with no getters, no prototype chain, and no proxy.
4. **Every** downstream reader (adjacency construction, reachability BFS, tenant-disjointness check, passport-root resolution) consumes the snapshot, and the live object is never read again.

Because verification and execution share one immutable byte-string, no getter, proxy, prototype-chain key, or non-enumerable key on the live object can make the checked representation and the executed representation disagree. The disclosure also includes a reusable metamorphic red-team tool that presents adversarial inputs carrying a stolen valid signature and asserts the invariant: *any input the authority accepts must observe-equal the honest one.*

## 5. Detailed description / embodiment (with actual proof numbers, verbatim)

The reference embodiment is `graph-spine.mjs`. The single-read choke point is `verifyAndMaterialize` (verbatim, lines 106–117):

```js
function verifyAndMaterialize(signed, key, checkSig = true) {
  let canon, snap;
  try { canon = canonicalGraph(signed?.graph); snap = materialize(canon); }
  catch { return null; }                                       // malformed / prototype-polluted graph ⇒ DENY
  if (checkSig) {
    if (!signed || typeof signed.sig !== 'string') return null; // fail-closed: no sig ⇒ DENY
    const a = Buffer.from(createHmac('sha256', key).update(canon).digest('hex'), 'utf8');
    const b = Buffer.from(signed.sig, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  }
  return snap;
}
```

`materialize` re-parses the canonical bytes into a frozen snapshot of plain primitives (verbatim, lines 97–101):

```js
function materialize(canonStr) {
  const o = JSON.parse(canonStr);                              // { nodes:[str], edges:[[from,label,to]], tenants:[[k,v]] }
  const edges = o.edges.map(([from, label, to]) => Object.freeze({ from, label, to }));
  return Object.freeze({ nodes: Object.freeze(o.nodes.slice()), edges: Object.freeze(edges), tenants: new Map(o.tenants) });
}
```

`traverse` verifies-and-materialises first, then does all work over the frozen snapshot (verbatim, lines 163–173):

```js
function traverse(spine, passport, key, { checkSig = true, enforceRoot = true } = {}) {
  const snap = verifyAndMaterialize(spine, key, checkSig);
  if (snap === null)
    throw new Error('SpineError: signature verification FAILED — spine tampered or unsigned; traversal refused (fail-closed, RD-0167)');
  const adj = adjacencyOf(snap);
  if (!enforceRoot) return new Set(snap.nodes);                // (b) MUTATION: drop root ⇒ whole graph admitted
  disjointCheck(snap);                                          // A4: no cross-tenant bridge in raw reachability
  const root = passportRootOf(snap, passport);
  if (!adj.has(root)) throw new Error(`SpineError: root '${root}' absent from graph (fail-closed)`);
  return reachFrom(adj, root);                                  // ONLY the reachable component — "no edge = no reach"
}
```

`passportRootOf` resolves the root from the snapshot's `Map` (`Map.get`, not bracket access), which structurally kills `passport.tenant = "__proto__"` (verbatim, lines 156–160):

```js
function passportRootOf(snap, passport) {
  if (!passport || typeof passport.tenant !== 'string') throw new Error('AuthError: passport tenant must be a string (fail-closed)');
  if (!snap.tenants.has(passport.tenant)) throw new Error(`AuthError: no declared root for tenant '${passport.tenant}' (fail-closed)`);
  return snap.tenants.get(passport.tenant);                    // Map.get — no prototype-key reach (kills passport.tenant=__proto__)
}
```

**The class-closing test (INJ6), verbatim from the battery, lines 278–298.** An `edge.to` getter serves the honest value on the canon path (where `label` is read just before `to`) and a malicious value on the adjacency path. The comment states, verbatim: *"Non-vacuous: this FAILS against the pre-round-4 code (adjacencyOf read live)."*

```js
    const forgedEdge = { from: 'rootB',
      get label() { sawLabel = true; return 'owns'; },
      get to() { const canonPath = sawLabel; sawLabel = false; return canonPath ? 'b1' : 'secretX'; } };
    ...
    const sigMatches = verifySpine({ graph: forged, sig: honestSig }, KEY);   // canon path sees b1 ⇒ sig VALID
    let reachB; try { reachB = traverse({ graph: forged, sig: honestSig }, { tenant: 'B' }, KEY); } catch { reachB = new Set(); }
    ok('INJ6  an edge.to GETTER cannot diverge canon-vs-adjacency (materialise-once: runtime reads the SIGNED bytes)',
      sigMatches === true && !reachB.has('secretX')); }
```

**Proof result (re-executed for this disclosure; also matches the design record).** Running `node graph-spine.mjs` prints `ALL PASS — 26 passed, 0 failed.` and exits 0. The run is deterministic across invocations, and importing the module does not run the battery (clean `isMain` separation). The design record's mutation table (verbatim, §5) records three whole-file mutants run under the real filename, each flipping the suite red:

| Mutation | What was neutered | Result |
|---|---|---|
| (a) | `verifySpine` forced always-true (signature check off) | 5 FAIL (M-a + P2b/P2c/P2d/P2f), exit 1 — a tampered graph passes |
| (b) | `traverse` forced to ignore the root (whole graph returned) | 5 FAIL (M-b + P1a–P1d), exit 1 — cross-tenant node `b1` admitted |
| (c) | `capabilityGate` forced always-admit (topology-as-authority) | 3 FAIL (M-c + P3b/P3d), exit 1 — the forged edge is admitted |

The battery carries INJ1–INJ6, described in-source as the coverage that was missing across the four forgery rounds: INJ1–INJ3 canon injectivity, INJ4 prototype-polluted tenants, INJ5 non-enumerable tenant bridge, INJ6 the `edge.to` getter.

**The reusable divergence-probe (`divergence-probe.mjs`).** It asserts the invariant *"any adversarial input the authority ACCEPTS (does not fail-closed) must observe-EQUAL the honest one"* (verbatim from its header) on the real code path, over a "divergence zoo" of variants: read-count getters on `edge.to` (honest for *k* reads, then evil), the exact label-order getter mechanism from R4, an edges-array `Proxy`, and analogous getter/`Proxy` variants on the tenants object. The shipped generators yield **8 variants on the edge scenario** (2 edge indices × 3 read-counts = 6, plus 1 label-order getter, plus 1 array `Proxy`) and **4 variants on the tenant scenario** (3 read-counts, plus 1 `Proxy`) — **12 metamorphic variants total across the two real scenarios**. To prove non-vacuity, the probe also attacks a deliberately broken reference (`brokenObserve`: verify over a naive canon that uses `Object.entries`, then read the *live* object again for adjacency and root) and requires that reference to break. The probe's pass condition is: real target CLEAN on all scenarios AND broken reference BREAKS.

**Reproducibility note.** The quantitative figures in this section were confirmed by re-executing both scripts on Node.js (`node:crypto`, no third-party dependencies) for this disclosure, and are consistent with the in-repo design record. Both runs are deterministic. Because the divergence-probe computes its forgery count at runtime (`broken.reduce((n, r) => n + r.findings.length, 0)`), a reproducer should treat the printed count as authoritative over any number quoted here; the observed count on the runs performed for this note was **6** (see §8).

## 6. Honest limitations & scope (disclosed as first-class)

These limitations are part of the disclosure, not caveats to it:

1. **HMAC-SHA-256 is a stand-in.** The reference uses a keyed MAC for a deterministic, dependency-free proof. A production deployment requires an asymmetric signature (Ed25519, or ML-DSA for post-quantum posture). The materialise-once discipline is independent of the primitive, but the reference as written does not itself constitute a production-signed authority.
2. **Not wired to a running engine.** The reference is a design-and-proof artifact. It is not connected to a live query/traversal engine, and prod is read-only from the R&D repository. The proof establishes the property in the reference model; it does not establish that any deployed engine enforces it.
3. **The class is closed for this object shape only.** Materialise-once closes the divergence class for the specific graph shape `{nodes, edges, tenants}` at one {sign, verify, run} triple. The *principle* — authenticate the representation that is actually executed — must be **re-applied at every such triple**. A new object shape, a new reader introduced after the choke point, or a second place that reads the live object reopens the class. The discipline is a per-triple obligation, not a one-time global guarantee.
4. **Scope of the authorization claim.** The spine proves reachability-as-authorization, graph-signing, and topology≠authority *within the intra-tenant / deny-cross-by-default envelope*. Cross-tenant edge-key *payload* custody remains an open problem enumerated (not solved) in the design record §6. Traversal-budget (CWE-400) and transactional consistency under edge mutation are separate, unaddressed controls.
5. **Freeze depth and JSON assumptions.** The snapshot's safety relies on `JSON.parse` producing only plain primitives and on the canonical string being the sole input to both MAC and parse. This holds for the JSON-serialisable graph model here; a model that must carry non-JSON values, or a canonicalisation that does not fully determine the parsed structure, would require re-analysis.

## 7. Illustrative disclosure claims (broad-but-truthful — prior-art, not patent claims)

Disclosed to the public domain as prior art:

1. A method of authorizing access by traversing a graph, wherein the integrity code (MAC or signature) is computed over a canonical serialization produced by a **single** read of the live authorization object, and every subsequent traversal reader consumes a representation **re-derived from those same verified bytes** rather than re-reading the live object.
2. The method of claim 1, wherein the re-derived representation is an **immutable snapshot of plain primitives** (obtained by parsing the verified canonical bytes) containing no getters, prototype chain, proxy, or non-enumerable properties, such that no accessor on the original object can cause the checked and executed representations to differ.
3. The method of claim 1, wherein a **single choke-point function** performs verification and materialisation together and returns the snapshot on success or a fail-closed denial on any malformed, prototype-polluted, or mis-signed input.
4. The method of claim 1, wherein the passport-derived tenant root is resolved from a keyed map within the snapshot (not by property access on the live object), structurally preventing prototype-key resolution of a smuggled root.
5. A reusable **metamorphic testing method** for such an authority, which presents adversarial variants of an honest input (getter, proxy, prototype, non-enumerable, and read-order accessors) carrying a stolen valid signature, and asserts that any accepted variant observe-equals the honest input; and which demonstrates its own non-vacuity by requiring a deliberately divergent reference implementation to be caught.

## 8. Machine-checkable evidence

- **Script:** `Galerina-R-AND-D/tritmeshql/graph-spine.mjs`. **Re-run:** `node graph-spine.mjs` (exits non-zero on any failed self-test). **Result (re-executed for this disclosure):** final line `ALL PASS — 26 passed, 0 failed.`, **exit 0**, deterministic. The class-closing test is **INJ6** ("an edge.to GETTER cannot diverge canon-vs-adjacency"), constructed to fail against pre-round-4 code. Three whole-file mutations are recorded in the design record to flip the suite red (5/5/3 failures respectively, exit 1) per §5.
- **Script:** `Galerina-R-AND-D/tritmeshql/divergence-probe.mjs`. **Re-run:** `node divergence-probe.mjs` (exit 1 on any failure). **Result (re-executed for this disclosure):** the real graph-spine printed `PASS: real graph-spine CLEAN on all scenarios (no accepted forgery diverges).`; the deliberately broken reference printed `PASS: probe is NON-VACUOUS — the broken reference broke (6 forgeries found).`; **exit 0**. The "6" is computed at runtime; a reproducer should treat the printed count as authoritative.
- **Environment for reproduction:** Node.js with `node:crypto` (`createHmac`, `timingSafeEqual`); no third-party dependencies. Both runs are deterministic across invocations. The quantitative figures above were obtained by re-executing the two scripts for this note.

**Cross-references.** RD-0150 (`galerina-rd-0150-graph-as-data-io-border-concept.md`, graph-as-data-io-border); RD-0167 (sign-the-graph); RD-0169 (topology≠authority); RD-0246 (`hypha-check.mjs` reference checker); design record `ZTF-Knowledge-Bases/tritmeshql-signed-graph-spine-rd0150-2026-07-03.md`. Related family disclosure DP-RD-0204 (`dp-rd-0204-ast-parameterised-graph-query-injection-safety.md` — **distinct**: query-string injection vs object representation-divergence). Standing rules: fail-closed / no-50-year-mistake; DON'T-TRUST-CHECK; PROVE-OWN-MATHS.

---

### Declarations

- **Type / tier:** Defensive publication (prior-art disclosure). Not a patent claim, not a novelty claim, not a flagship result.
- **Authorship & AI assistance:** Drafted with AI assistance under human direction (owner Phillip Booth). Grounding: every technical claim is taken from the cited in-repo source bytes (`graph-spine.mjs`, `divergence-probe.mjs`) and the design record; the quantitative figures (26/26 exit 0; probe real-CLEAN, broken-BREAKS with 6 forgeries, exit 0; 8+4=12 metamorphic variants) were confirmed by re-executing the two scripts for this disclosure.
- **Funding:** None.
- **Competing interests:** None.
- **Data / artifact availability:** All artifacts are in-repo and re-runnable at the paths named in §8.
- **Licence:** Apache-2.0. Owner / copyright holder: Phillip Booth (hello@consumerthoughts.co.uk).