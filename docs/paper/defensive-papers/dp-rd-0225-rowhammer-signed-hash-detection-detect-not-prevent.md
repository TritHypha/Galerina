# Defensive Publication — Detecting DRAM Rowhammer bit-flips in a signed capability/index region by re-verification (detect-not-prevent), with honest scope

**Disclosure ID:** DP-RD-0225 · **Date:** 2026-07-01 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Provenance:** RD-0225 · analysis `galerina-rd-0218-0225-77mesh-runtime-comms-compliance.md` (§ "RD-0225 — Rowhammer threat model + defenses") · machine-checkable proof `proofs/rd-0225-proof.mjs` (re-run GREEN, 14/14).

> **Purpose of this document.** This is a *defensive publication* — a prior-art disclosure. Its goal is to place a sound but modest technique, and its honest bound, into the public record so that neither the technique nor its obvious variants can later be monopolised by a patent, and so that the honest scope is on record and cannot be quietly inflated into an overclaim. It is explicitly **not** a patent application and asserts **no** exclusive right. The load-bearing contribution here is as much the *limitation* (software detects, hardware prevents) as the mechanism.

---

## 1. Technical field

Integrity monitoring of security-critical, cryptographically signed data structures held in **volatile DRAM** at runtime, in the presence of the **Rowhammer** class of physical fault-injection attacks (repeated activation of a DRAM row inducing charge leakage and bit-flips in *physically adjacent* rows). Specifically: detecting a single-bit (or multi-bit) corruption in a signed capability token or signed index region — here a `.fungi` region in a Galerina/TritMesh runtime — by re-verifying its cryptographic signature at the point of read, and reasoning honestly about which threats this closes and which it does not.

## 2. Background & problem

Zero-trust runtimes make an admission decision by verifying a signed capability (who may do what) and, in a mesh/co-tenant deployment, may also consult a signed index. These structures live in DRAM. Rowhammer is a real, well-characterised DRAM hardware vulnerability: dense cells leak charge under repeated row activation, flipping bits in physically adjacent rows, and it has been shown to break VM/kernel isolation boundaries in co-tenant environments.

Two failure modes motivate this disclosure:

1. **Silent corruption of an admission input.** A bit-flip inside a signed capability could, if not checked, change the meaning of that capability (e.g. flip a scope bit) and be honoured as if authentic.
2. **A false sense of safety from software isolation.** WASM host-isolation (and comparable address-space/bounds sandboxing) is an *address-space* construct, not a *physical-charge* construct. An attacker who hammers only rows inside its own bounds triggers **no** bounds-check event, yet the induced charge leakage can flip a bit in a physically adjacent victim row belonging to another domain. Isolation registers nothing. This is the operational reason "WASM = memory-safe in production" is false (reinforcing the earlier RD-0154 correction).

The problem this disclosure addresses is narrow and honest: **given that software cannot stop the physics, can software at least reliably detect a Rowhammer-induced corruption of a signed region before that region is trusted for an admission decision — and exactly how far does that guarantee reach?**

## 3. Prior art (stated honestly)

The following existing work is the closest art. This disclosure does not claim novelty over any of it; it discloses a specific, modest *composition* and its honest bound.

- **Hardware Rowhammer mitigations — ECC, TRR (Target Row Refresh), increased/probabilistic refresh, in-silicon memory-controller monitoring with targeted victim-row refresh, and modern in-silicon controller defenses (e.g. an Azure Cobalt-200-class controller).** These are the *prevention* layer. This disclosure explicitly defers prevention to them and only adds a software *detection* layer on top; it does not compete with or replace them.
- **Cryptographic integrity primitives — SHA-256 and Ed25519 signature verification.** The avalanche property of SHA-256 and the unforgeability of Ed25519 are the primitives relied on. Nothing about these primitives is claimed as novel; the disclosure is their application to *runtime re-verification against a physical fault channel*, plus the honest accounting of what that does and does not cover.
- **Memory / cache isolation and page-colouring work — Intel CAT, CATalyst, page-colouring.** These reduce cross-domain interference but are isolation techniques, not integrity detectors for a signed region; they are orthogonal to what is disclosed here.
- **Paged / arena memory management — e.g. vLLM PagedAttention.** Cited as representative of address-space/bounds arena management of the kind that, like WASM host-isolation, does **not** see a physical row-adjacent flip. Named to make the isolation-≠-safety point concrete, not as something improved upon.
- **Signed graph / signed-Laplacian work (Kunegis et al.).** Representative of "sign carries trust" structures; related in spirit to keying admission on a signed object rather than on unsigned telemetry, but distinct in mechanism.
- **Injection-resistant query construction — parameterised queries.** Cited only by analogy: as parameterisation keeps untrusted data out of the trusted control path, here admission is kept keyed on the signed capability and never on flippable, unsigned telemetry (the RD-0169 trap).
- **b-ary / signed search theory.** Cited as adjacent theory to the index-region case; not relied on for the core detection result.

## 4. Summary of the disclosed subject matter

Re-verifying the cryptographic signature of a signed `.fungi` capability/index region **at the point of read** detects any Rowhammer-induced bit-flip within that signed region: by the SHA-256 avalanche property a single-bit flip changes roughly half the digest bits, so the digest no longer matches and Ed25519 `verify()` fails, causing the runtime to **fail closed** (deny/refuse-to-trust) on the corrupted region. This is a **detect-not-prevent** control: it does not and cannot stop the physical flip (prevention is hardware), it is silent for flips in *unsigned* regions, and it does not close the time-of-check-to-time-of-use (TOCTOU) window between a successful verify and the subsequent use of the data.

## 5. Detailed description / embodiment

**Embodiment.** A zero-trust runtime holds an admission-critical structure — a capability token and/or an index — in a DRAM region designated a signed `.fungi` region. The region is signed with Ed25519 over its bytes (equivalently, over its SHA-256 digest) by a key held outside the attacker's reach. At each point where the runtime is about to trust the region for an admission decision, it re-computes the digest and re-runs `verify()`. On failure it fails closed: the region is treated as untrusted, admission is denied/aborted, and (optionally) the event is emitted as attack telemetry improving posture.

**Key maths result (the load-bearing claim), with the actual numbers from the proof.**

- **Detection soundness (avalanche).** For a signed `.fungi` payload, every single-bit flip changes the SHA-256 digest — measured **0 digest-collisions ("near-misses") out of 2048 random single-bit-flip trials**, with a mean digest-bit flip fraction of ≈ 0.50 (ideal 0.5). The proof asserts this fraction lies strictly in (0.45, 0.55); observed values across runs are ≈ 0.497–0.500 (e.g. 0.4970 in the source analysis; 0.5002 on a re-run). This means a flip is never a "near-miss" that leaves the digest close to the original — it is a full avalanche.
- **End-to-end fail-closed.** Over **512 random single-bit flips of an Ed25519-signed payload, all 512 fail `verify()`** (512/512), i.e. the corrupted region fails closed. The clean signed payload verifies TRUE as a baseline.
- **Undetected-flip probability floor.** The probability that a corruption evades an *n*-bit cryptographic digest by chance is 2⁻ⁿ. For n = 256 this is **2⁻²⁵⁶ ≈ 8.6 × 10⁻⁷⁸** — astronomically small, so detection is cryptographically certain in the relevant sense.
- **Prevention is refuted as software (honest negative).** The proof models WASM host-isolation as a bounds predicate and shows an attacker hammering only its own in-bounds rows produces **no bounds-check event** (the isolation check returns "allowed" for the attacker's own rows and the attacker never *requests* the victim row), so software isolation cannot prevent the physical flip. The assertion "software prevents Rowhammer" is deliberately written to **fail**; "software detects" passes.
- **Forged-telemetry trap respected (RD-0169).** A bit-flip that forges a healthy tri-state telemetry vector `[+1,+1,+1]` must not manufacture an ALLOW. The proof shows telemetry-keyed admission *would* be fooled (that is the trap), whereas signed-capability-keyed admission **denies** the flip-tampered capability and admits only the intact secret-signed one.

All of the above are machine-checked; see § 8.

## 6. Honest limitations & scope

This section is part of the contribution. The technique is deliberately modest and must not be represented as more.

- **Detect, not prevent.** The software layer **detects** a corruption of a signed region; it **cannot prevent** the physical bit-flip. Prevention is a hardware property (ECC, TRR, refresh strategies, in-silicon controller monitoring / Cobalt-200-class defenses). The correct deployment posture is *detect in software AND run on ECC/TRR-capable hardware.*
- **Signed regions only — unsigned regions are silent.** A flip in an *unsigned* region (for example an unsigned in-`.fungi` index) is **not** detected by this mechanism, because there is no signature to fail. This must be paired with a signed-index requirement (RD-0167). Coverage equals exactly the signed byte-range and nothing outside it.
- **TOCTOU window is not closed.** Verification proves integrity *at the moment of verify*. A flip occurring **after** a successful `verify()` but **before** the verified bytes are consumed is outside this mechanism's guarantee. It is a point-of-read detector, not a continuous-in-hardware integrity monitor.
- **Post-hoc, not the escalation moment.** Detection happens when the region is read for a decision — after the flip has occurred. In a co-tenant VM the physically damaging event (the escalation) has already happened; software detection is a fail-closed reaction, not interdiction of the attack in progress.
- **Constant-factor cost, not an order-of-magnitude property.** The added work is a re-hash + signature verify per trusted read — a constant per-read cost; it changes no asymptotic complexity and confers no order-of-magnitude property. It is an added check, nothing more.
- **Deny-only / advisory, never an admission credential.** The detection signal is a fail-closed *deny* and (optionally) posture telemetry. It is never an *admission* grant: nothing here should be used to *authorise* anything. Admission remains keyed on the signed capability alone. Flippable telemetry stays advisory (T4).
- **Forgeable if misused.** The guarantee holds only while (a) the signing key is outside the attacker's reach, (b) the region actually covered by the signature is the region trusted for the decision, and (c) admission is not silently keyed on unsigned telemetry. Sign the wrong bytes, trust bytes the signature does not cover, or let telemetry decide, and the guarantee is void.
- **Reinforces "isolation ≠ memory safety."** WASM host-isolation (and similar address-space sandboxing) does not make production memory-safe against a physical fault channel; this disclosure depends on and reinforces that correction (RD-0154), it does not repair it.

## 7. Illustrative disclosure claims

These are disclosed embodiments, phrased defensively broad but kept literally true and bounded by § 6. They are published to establish prior art; **no** exclusive right is asserted.

1. **A method** wherein a security-critical data region held in volatile DRAM is cryptographically signed, and, at the point at which the runtime is about to trust that region for an authorization/admission decision, the runtime re-computes the region's cryptographic digest and re-verifies its signature, such that a Rowhammer-induced bit-flip within the signed region causes verification to fail and the runtime to **fail closed** on that region.

2. **A method** as in claim 1 wherein the digest is SHA-256 and the signature is Ed25519, and detection of a single-bit corruption follows from the digest's avalanche behaviour (a single-bit input change altering approximately half the digest bits), the chance of an undetected corruption of an n-bit digest being bounded above by 2⁻ⁿ.

3. **A method** as in claim 1 wherein the signed region is a capability token and/or an index region (a `.fungi` region) of a zero-trust mesh runtime, and the admission decision is kept keyed on the signed capability and **not** on unsigned runtime telemetry, so that a bit-flip forging a "healthy" telemetry vector cannot manufacture an ALLOW.

4. **A system** as in claim 1 characterised in that the software layer performs **detection only** and is deployed together with a hardware Rowhammer-prevention layer (ECC, TRR, refresh-based, or in-silicon controller mitigation), the software explicitly **not** preventing the physical bit-flip.

5. **A method** as in claim 1 further characterised by the explicit scope limitation that the guarantee covers only bytes within the signed range, does not extend to unsigned regions, and does not close the time-of-check-to-time-of-use window between a successful verification and subsequent use of the verified bytes — this scope being disclosed as part of the subject matter.

6. **A use** of the verification-failure event of claim 1 as **fail-closed deny and/or posture telemetry**, and expressly **not** as an admission credential, such that the detection signal can deny or inform but can never itself grant access.

## 8. Machine-checkable evidence

**Proof artifact:** `proofs/rd-0225-proof.mjs` (Node.js, built-in `crypto` only; re-runnable; self-contained). It is part of the keep-green suite.

Checks:

- **(A) Detection is sound — SHA-256 avalanche.** 2048 random single-bit flips of a signed `.fungi` payload (712 payload bits); asserts **digest-unchanged count = 0** (no near-miss) and mean digest-bit flip fraction in (0.45, 0.55), observed ≈ 0.497–0.500.
- **(A′) End-to-end fail-closed — Ed25519.** Clean signed payload verifies TRUE (baseline); **512/512** single-bit flips FAIL `verify()` ⇒ admission fails closed (integrity tenet T5).
- **(B) Prevention is hardware, not software.** Models WASM host-isolation as a bounds predicate; shows the attacker's in-bounds hammering trips no bounds event; asserts "software prevents Rowhammer" is **false** (refuted) and "WASM = memory-safe in production" is **false** (reinforces RD-0154); asserts prevention requires hardware and that the disclosed defense is DETECT-not-PREVENT.
- **(C) Forged-telemetry trap (RD-0169).** Shows telemetry-keyed admission would be fooled by a forged `[+1,+1,+1]`; asserts signed-capability admission **denies** the flip-tampered capability and admits only the intact secret-signed one.
- **(D) Undetected-flip probability floor.** Asserts P(a flip evades a 256-bit digest by chance) = 2⁻²⁵⁶ ≈ 8.6 × 10⁻⁷⁸ < 1e-70 ⇒ detection cryptographically certain.

**GREEN result line (re-run 2026-07-01):**

```
== ALL GREEN: 14/14 assertions passed ==
```

Representative measured lines from the same run:

```
(A) DETECTION — SHA-256 avalanche on single-bit .fungi flip:
    trials=2048, payloadBits=712, digest-unchanged count=0
    mean digest-bit flip fraction = 0.5002 (ideal 0.5)
(A') END-TO-END — Ed25519 signed .fungi flip => verify() fails (fail-closed):
    all 512 single-bit flips FAIL Ed25519 verify() => admission fail-CLOSED (integrity tenet T5)
(D) P(a flip evades a 256-bit digest by chance) = 2^-256 = 8.636e-78
```

The avalanche fraction is stochastic per run (e.g. 0.4970 recorded in the source analysis, 0.5002 on the re-run above); the *hard* assertions — 0 near-misses over 2048 trials, 512/512 `verify()` failures, and the 2⁻²⁵⁶ floor — are deterministic and pass on every run.

---

*This defensive publication is released to establish prior art. The disclosed technique is a detect-not-prevent, signed-region-only, deny-only integrity check whose honest limitations (§ 6) are an integral part of the disclosure.*
