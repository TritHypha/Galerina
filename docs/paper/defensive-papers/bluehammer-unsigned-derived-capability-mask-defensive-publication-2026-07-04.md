# BlueHammer: the unsigned derived capability-mask as a fault-injection privilege-escalation target

**Disclosure ID:** DP-RD-0233 · **Date:** 2026-07-04 · **Type:** Prior-art disclosure (defensive) — NOT a patent claim · **Provenance:** source finding `ZTF-Knowledge-Bases/galerina-rd-0233-bluehammer-language-exposure-and-fix.md`; machine proof `Galerina/proofs/rd-0233-proof.mjs` (**13/13 GREEN — re-run & personally verified 2026-07-04**); landed prod fix `Galerina/packages-galerina/galerina-tower-citizen/src/hybrid-engine.ts` (line references verified by direct read 2026-07-04, read-only); builds on DP-RD-0225.

## Purpose

This is a **defensive publication**. It places an engineering composition in the public domain as timestamped prior art so it cannot later be patented against the owner or the community. **Novelty is explicitly disclaimed** over every piece of prior art named in §3. As with DP-RD-0225, **the disclosed *limitation* is as much the contribution as the mechanism**: the technique below *shrinks and detects*, it does **not prevent**, a hardware fault — and saying so precisely is the point of publishing it.

The specific subject matter: even when a capability **token** is cryptographically signed, a runtime authority gate commonly reads a **derived, unsigned, in-memory scalar** (a packed capability mask) that the token's signature does **not** cover. A single bit-flip in that live scalar — Rowhammer or any microarchitectural fault injection — silently forges authority while the signed token stays valid. The disclosed mitigation is to **re-derive the mask from the verified signed grant at the point of use**, hold it in an **engine-private (unforgeable) field**, and make any unsigned mask **deny-by-default behind an explicit opt-in**.

## 1. Technical field

Capability-based access control in a language runtime / sandboxed inference engine; software mitigation of microarchitectural DRAM fault-injection (Rowhammer-class) attacks against **derived in-memory authority state**, as distinct from against signed artifacts on disk or in transit.

## 2. Background & problem

A common and reasonable runtime pattern verifies a signed capability token once, decodes it into a compact packed bitmask, caches that scalar, and thereafter runs a fast branchless authority gate — `(REQUIRED & granted) === REQUIRED` — against the cached scalar on every operation. The signature is checked against the token bytes; the gate is checked against the **derived scalar**.

The problem: the derived scalar is a plain in-memory value that **no signature covers**. A Rowhammer-class fault that flips a single bit *setting* a required capability bit in that live scalar makes the gate ALLOW an operation it must DENY. Crucially, a defense that re-verifies the **signed token** (DP-RD-0225) is **blind** to this: the token was never touched, so its signature still verifies. The attack target is not the signed bytes — it is the *unsigned derived authority value between verify and use*.

## 3. Prior art (stated honestly — novelty disclaimed over each)

- **Rowhammer** — Kim, Daly, Kim, Fallin, Lee, Lai, Wilkerson, Lai, Mutlu, *"Flipping Bits in Memory Without Accessing Them: An Experimental Study of DRAM Disturbance Errors,"* ISCA 2014 (DOI: 10.1145/2678373.2665726). Establishes that repeated DRAM row activation flips bits in adjacent rows. **We claim no novelty in the fault primitive.** Our disclosure assumes Rowhammer as a given capability of the attacker.
- **Microarchitectural / physical fault-injection for privilege escalation** generally (the class of turning a memory bit-flip into a security-decision change). **We disclaim novelty over the general technique of attacking a security decision via a fault.** Our narrowing — *the derived, unsigned authority scalar, not the signed token, is the productive fault target* — is a specific engineering observation, disclosed as prior art, not claimed as a patentable invention.
- **ECC (error-correcting code) memory and Target-Row-Refresh (TRR)** and related in-DRAM/in-controller mitigations. **We claim no novelty over these and do not reimplement them.** We name them as the *true* prevention layer and defer prevention to them, honestly noting (per DP-RD-0225 and the source finding) that reported bypasses of such schemes show they *raise cost* rather than guarantee prevention.
- **Capability-based security** (the general model of unforgeable authority tokens gating operations). **We disclaim novelty over capability systems as such.** The signed capability token, the packed bitmask, and the branchless mask gate are all conventional.
- **DP-RD-0225** (`dp-rd-0225-rowhammer-signed-hash-detection-detect-not-prevent`) — our own prior defensive publication. It signs/hashes the **data** and re-verifies at read to **detect** a flip in a *signed* region, and explicitly leaves **unsigned regions** and the **verify-to-use TOCTOU window** open. **This disclosure claims no novelty over DP-RD-0225's detection mechanism**; it addresses precisely the gap DP-RD-0225 named as out of scope: the live authority scalar is an *unsigned, derived* region DP-RD-0225 does not cover.

**Net contribution (prior-art record, not a novelty claim):** the composition of (a) the observation that the *derived unsigned scalar*, not the signed token, is the exploitable fault target; with (b) **re-derive-the-mask-from-the-verified-signed-grant-at-use**; (c) an **engine-private, non-reassignable** field for that mask; and (d) a **deny-by-default** posture where an unsigned mask confers zero authority absent an explicit audited opt-in.

## 4. Summary of disclosed subject matter

1. **The exposure.** A runtime authority gate that reads a cached, unsigned, derived capability mask is escalation-vulnerable to a single targeted bit-flip that sets a required capability bit, while the signed token from which the mask was originally derived remains valid — so token re-verification (DP-RD-0225) does not detect it.
2. **The mitigation.** Do not trust the stored scalar. Confer authority **only** from a `signedCapabilityGrant` that cryptographically verifies at resolution time; **re-derive** the mask from that verified grant; hold the mask in a **language-private (`#`-private) field** that cannot be reassigned or read from outside the class; and make any unsigned constructor mask **deny-by-default (authority = 0)** unless a deployment sets an explicit, audited opt-in flag (and never in certified mode).
3. **The honest bound.** This shrinks the exposure window and removes the "self-grant via a plain mutable field" path; it does **not** prevent a flip that lands *during* use. Prevention remains hardware (ECC/TRR), which is itself imperfect.

## 5. Detailed description / embodiment (with the actual code, verbatim-cited)

The embodiment is landed in production at `Galerina/packages-galerina/galerina-tower-citizen/src/hybrid-engine.ts` (all line numbers below verified against the current file, read-only, 2026-07-04).

**The vulnerability, named in-code (comment, lines 332–339):** the class documents *why* the field is now `#`-private rather than `private readonly`, and why it is deny-by-default:

> `// RD-0236 #1: a real JS #private field — NOT `private readonly` (which TS erases at runtime,`
> `// leaving `engine.grantedCapabilityMask = 0xFFFF` free to FORGE authority). `#`-private cannot be`
> `// reassigned or read from outside the class, so the branchless capability gate below reads an`
> `// untamperable value. #1 follow-on (fail-secure INVERSION): it is now DENY-BY-DEFAULT (0). Real`
> `// authority is derived ONLY from a `signedCapabilityGrant` that verifies against the attestation`
> `// policy (resolveCapabilityGrant, async + cached, mirroring checkBridgeAttestation) — or, via the`
> `// `allowUnsignedCapabilityGrant` opt-in, from the trusted plain constructor mask. The field is`
> `// mutable so the async resolution can set it ONCE; still #private, so still unforgeable.` (lines 332–339)

**Engine-private field (line 340):**

```ts
#grantedCapabilityMask: number;
```

The mask is a real JS `#`-private field, not a TypeScript `private readonly` (which erases at runtime and would leave the mask reassignable from outside to forge authority).

**Deny-by-default unless an explicit unsigned opt-in (lines 417–419):**

```ts
this.#unsignedCapabilityMask = grantedCapabilityMask >>> 0;
const unsignedCapOptIn = this.governance.allowUnsignedCapabilityGrant === true && !certified;
this.#grantedCapabilityMask = unsignedCapOptIn ? this.#unsignedCapabilityMask : 0;
```

Absent the explicit `allowUnsignedCapabilityGrant` opt-in (which is **forced inert in certified mode**, `&& !certified`), the engine's live authority starts at **0** — the unsigned constructor mask is not trusted on its own.

**Re-derive the mask from the *signed* grant at resolution (line 454, inside `resolveCapabilityGrant`):**

```ts
const res = await verifyCapabilityGrant(this.#capabilityGrant, this.attestationPolicy, HYBRID_METADATA.engineId);
if (res.ok) {
  this.#grantedCapabilityMask = this.#capabilityGrant.grant.capabilityMask >>> 0;   // line 454
}
// else: authority stays 0 → the capability gate traps ERR_CAPABILITY_DENIED (audited).
```

The authority mask is derived from `#capabilityGrant.grant.capabilityMask` **only after** `verifyCapabilityGrant(...)` returns `ok` — i.e. from the **signed** grant, not from a cached unsigned scalar. A missing attestation policy or a missing/forged grant returns early (line 451) leaving authority at 0 (fail-closed).

**The gate reads the private, signed-derived value (line 669, in `infer()`):**

```ts
await this.resolveCapabilityGrant();
const capabilityHeld = (AI_INFERENCE_CAP & this.#grantedCapabilityMask) === AI_INFERENCE_CAP;
```

Resolution (which sets the mask from the verified signed grant, or leaves it 0) runs immediately before the branchless gate, and the gate reads the `#`-private field. A failure to verify leaves authority at 0 and traps `ERR_CAPABILITY_DENIED` (line 675), audited — fail-closed.

**Proof numbers (re-run & personally verified 2026-07-04 — `Galerina/proofs/rd-0233-proof.mjs`, output `== ALL GREEN: 13/13 assertions passed ==`, exit 0).** The load-bearing cases are:

- **(E)** baseline `gate(REQUIRED, 0)===false` (DENY); one flip setting the required bit ⇒ `gate===true` (ALLOW). The source characterises this as a **small but nonzero** target (the specific required bit), explicitly **not** "half of all flips."
- **(E′)** the signed cap-token still `verify()===true` while the flipped derived mask ALLOWs ⇒ **DP-RD-0225 is blind to it** (gap recorded as confirmed by the finding).
- **(F)** re-deriving the mask from the intact signed token ignores a stale/flipped scalar ⇒ DENY; flipping the **token bytes** to forge a grant fails `verify()` ⇒ fail-closed.

(The source finding also records a designed defense-in-depth complement-guard variant as an additional layer; the **landed** production mitigation is the re-derive-from-signed-grant + private-field + deny-by-default composition described above. The complement-guard variant's own count is doc-asserted and not reproduced here.)

## 6. Honest limitations & scope (first-class, not minimised)

- **Detect / reduce-window, NOT prevent.** Re-deriving the mask from the verified signed grant at resolution shrinks the exposure from "verified once, trusted for the instance lifetime" to a narrow window. **A flip that lands *during* the gate's read-to-use of the live scalar is still possible.** This mitigation does not, and cannot, prevent the physical fault. Same honest bound as DP-RD-0225.
- **Hardware is the only true prevention — and it is imperfect.** ECC and TRR are the prevention layer; the source finding and public research report bypasses of both, so the honest statement is *"software detects/narrows; hardware prevents, imperfectly."* No software posture here claims to close the physics.
- **Software mitigation only.** The disclosed subject matter is entirely a software composition. It changes *exposure* and *post-flip exploitability*, not the DRAM.
- **Overlap with DP-RD-0225 is explicit and intended.** The fail-closed-at-verify property reused here is DP-RD-0225's; this disclosure adds only its application to the *derived authority value* and the private-field/deny-by-default packaging. It claims nothing DP-RD-0225 already claimed.
- **Residual TOCTOU.** Verify-then-use always leaves a window; this narrows it, does not eliminate it.
- **Probability not claimed.** The proof establishes the *conditional* (a targeted flip of a required bit escalates), not P(an attacker lands that flip). Landing a targeted flip requires Rowhammer templating at the mask's address — demonstrated in the literature, but neither trivial nor remote. Overstating exploitability would misrepresent the finding.
- **Sibling unsigned-authority sites.** The source finding records further unsigned/derived admission values in the same class (e.g. stored verify verdicts, cached attestation flags, plan-admission booleans). Those are recorded as known and **not** claimed closed by this disclosure, whose landed scope is the capability mask.

## 7. Illustrative disclosure claims (broad-but-truthful — prior-art, not patent claims)

Disclosed publicly as prior art:

1. A method wherein a runtime authority gate, rather than reading a cached derived authority scalar, **re-derives** its authority mask from a **cryptographically verified signed capability grant at the point of use/resolution**, such that a fault-induced bit-flip in any stale/cached copy of the scalar confers no authority.
2. The method of (1) wherein the re-derived authority mask is stored in a **language-level private field that cannot be reassigned or read from outside its defining class**, removing a software self-grant path in addition to narrowing the fault window.
3. The method of (1)–(2) wherein an **unsigned** authority mask is treated as **deny-by-default (zero authority)** absent an explicit, audited opt-in, and wherein the opt-in is **unconditionally disabled in a certified/hardened mode**.
4. The methods of (1)–(3) **combined with** signed-artifact re-verification (per DP-RD-0225) so that a flip in the *signed* region is detected while a flip in the *derived authority scalar* is denied by re-derivation — the two covering disjoint fault targets.
5. The observation, disclosed as prior art, that in a signed-capability system the **derived, unsigned in-memory authority scalar — not the signed token — is the productive Rowhammer/fault-injection target**, together with the above mitigations as its software response, with prevention expressly deferred to hardware ECC/TRR.

## 8. Machine-checkable evidence

- **Prod fix (verified by direct read of source bytes, 2026-07-04, read-only):** `Galerina/packages-galerina/galerina-tower-citizen/src/hybrid-engine.ts` — vulnerability rationale comment lines **332–339**; `#grantedCapabilityMask` engine-private field line **340**; deny-by-default-unless-`allowUnsignedCapabilityGrant` lines **417–419**; mask re-derived from the verified `#capabilityGrant.grant.capabilityMask` line **454**; branchless gate reading the private field after `resolveCapabilityGrant()` line **669**; audited fail-closed trap `ERR_CAPABILITY_DENIED` line **675**. Supporting: `capability-grant.ts` `verifyCapabilityGrant` (signature check + range validation of `capabilityMask`), referenced by the above but **not independently re-read for this note** — treat that internal check as asserted by the calling code, not separately verified here. **The six hybrid-engine.ts line facts are CONFIRMED against the live tree.**
- **Named proof script:** `Galerina/proofs/rd-0233-proof.mjs` (in the **prod** repo, not the KB checkout), **13/13 GREEN — re-run and personally verified 2026-07-04**.
  **Verification (DON'T-TRUST-CHECK):** the cited path is **prod-repo-relative** — the file is `Galerina/proofs/rd-0233-proof.mjs` (it is not in the KB checkout, which is why the drafting pass could not see it). It was **located and re-run on 2026-07-04**: `node proofs/rd-0233-proof.mjs` from the `Galerina` root — output `== ALL GREEN: 13/13 assertions passed ==`, exit 0. The 13/13 count and cases (E)/(E′)/(F) are therefore **personally reproduced**, not doc-asserted. The prod-code line facts were likewise verified by direct read.
- **How to re-run:** `node proofs/rd-0233-proof.mjs` from the `Galerina` (prod) repo root — expect `== ALL GREEN: 13/13 assertions passed ==` (verified 2026-07-04). See DP-RD-0225 for the companion signed-hash proof.

## Cross-references

- `ZTF-Knowledge-Bases/galerina-rd-0233-bluehammer-language-exposure-and-fix.md` (source finding: the unsigned-authority gap, the fixes, the sibling vectors)
- `ZTF-Knowledge-Bases/defensive-publications/dp-rd-0225-rowhammer-signed-hash-detection-detect-not-prevent.md` (detect-not-prevent; the prior-art this builds on and disclaims overlap with)
- `Galerina/packages-galerina/galerina-tower-citizen/src/hybrid-engine.ts`, `.../capability-grant.ts` (landed embodiment)

## Declarations

- **Type / tier:** defensive-publication (prior-art disclosure). Not a patent claim, not a novelty claim, not a flagship result.
- **Authorship & AI assistance:** drafted with AI assistance under human direction (owner: Phillip Booth). Grounding: prod-code line references verified by direct read of the current source tree (read-only); external prior art cited by authoritative id (ISCA 2014 / DOI 10.1145/2678373.2665726); the 13/13 proof count was **re-run and personally verified 2026-07-04** from `Galerina/proofs/rd-0233-proof.mjs` (exit 0, ALL GREEN).
- **Funding:** none.
- **Competing interests:** none.
- **Data / artifact availability:** in-repo, re-runnable paths as named in §8; `Galerina/proofs/rd-0233-proof.mjs` re-run **13/13 GREEN** 2026-07-04.
- **Licence:** Apache-2.0. Owner / copyright holder: Phillip Booth (hello@consumerthoughts.co.uk).