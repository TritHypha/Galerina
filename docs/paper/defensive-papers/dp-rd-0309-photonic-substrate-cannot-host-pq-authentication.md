# DP-RD-0309 — Photonic and analog substrates cannot host post-quantum cryptographic authentication: three independent arguments

**Type:** Defensive publication (prior-art / position). **Not** measured science — no throughput benchmark is claimed.
**Tier:** a *negative* result (a refutation), established by three independent arguments that converge. **License:**
Apache-2.0 (patent-grant "keep it free" posture). **Provenance:** synthesises RD-0303 (framing maths), RD-0303a
(fibre/WDM physics), and RD-0309 (hardware-precision corroboration), which independently reached the same conclusion.
Extends the standing principle DP-RD-0270 ("light may hint, must not decide") with a concrete, multi-angle justification.

> **Scope note (harm filter):** this paper discloses a *general principle and a safe construction*, not a weakness in
> any specific system. All quantities cited are standard NIST parameters (ML-KEM-768 / ML-DSA-65), not any product's
> internals.

## Abstract

It is periodically proposed that photonic or analog-optical hardware — attractive for its parallelism and low energy
per operation — could accelerate or even *host* cryptographic authentication, including post-quantum (PQ) schemes. We
argue this is category-incorrect for the *authentication/authorization decision itself*, by three independent arguments
that converge on the same conclusion: **an analog/photonic substrate can accelerate error-tolerant bulk computation but
cannot be the substrate on which a PQ-cryptographic trust decision is made.** We then give the one sound role that
remains (bulk, plaintext-side, error-tolerant compute strictly outside the trust boundary) and a safe construction for
incorporating a physical signal into a decision without letting it authenticate (a degrade-only fold).

## 1. The claim, precisely

We distinguish two things an optical substrate might do near a crypto system:
- **(D) make a trust decision** — verify a signature, decapsulate a KEM ciphertext, decide "this key may be released",
  "this caller is authenticated";
- **(C) accelerate bulk compute** — matrix products, nearest-neighbour search, transforms over real-valued data.

Our claim is about **(D) only**: no photonic/analog substrate can soundly host (D). It says nothing against (C).

## 2. Argument I — hardware precision (exact modular arithmetic vs analog dynamic range)

PQ lattice schemes (ML-KEM, ML-DSA; NIST FIPS 203/204) operate over exact modular arithmetic in ℤ_q with q on the order
of 2^12–2^23. Correctness and security depend on **exact** coefficients: a single wrong coefficient in a decapsulated
value triggers the Fujisaki–Okamoto (FO) re-encryption mismatch and the scheme **fails closed** (rejects), by design.
Analog and photonic compute is fundamentally **approximate** — practical analog matrix units deliver on the order of
4–8 *effective* bits of precision, are noise- and drift-limited, and are engineered for workloads that *tolerate* error.
An operation whose correctness requires every one of ~256 coefficients to be bit-exact over ℤ_q is the worst possible
match for a substrate whose defining property is bounded imprecision. You cannot compute a modular reduction "mostly
correctly" and get a valid ML-KEM shared secret; the FO transform guarantees you get a rejection instead. **(D) requires
exactness that analog substrates structurally do not provide.**

## 3. Argument II — information framing (encoding is not encryption)

A separate line, requiring no hardware assumptions: even granting a perfect optical channel, **encoding is not
encryption** (Kerckhoffs's principle — security must not rest on the secrecy of the representation). The
confidentiality and authenticity of a PQ-sealed object come entirely from its ciphertext/signature, whose sizes are set
by the scheme, not the medium: an ML-KEM-768 ciphertext is ~1088–1184 bytes and an ML-DSA-65 signature ~3000+ bytes.
Any advantage a 2-D optical framing might offer over a flat byte buffer is a *framing* delta of tens of bytes — one to
two orders of magnitude smaller than the cryptographic payload it would carry. The medium cannot make the sealed bytes
"more encrypted"; the seal is identical whether transported as light, a raster, or a flat buffer. **The optical framing
is a rounding error on the wire, and contributes nothing to (D).**

## 4. Argument III — physical forgeability (a public observable cannot authenticate)

Authentication requires an **unforgeable** factor bound to a secret. The physical parameters of an optical signal — its
wavelength, spatial mode, polarization, intensity — are **public observables**: anyone on the medium can read them, and
anyone with commodity optics can reproduce them. A factor that an adversary can measure and re-emit carries zero
authentication value (it fails the most basic unforgeability requirement). "This arrived on wavelength λ" is exactly as
forgeable as "this packet had TTL 64." Optical transport is therefore **not** encryption and a physical optical property
is **not** an identity — a wavelength decides nothing, in the same way a plaintext header decides nothing. **(D)
requires an unforgeable secret-bound factor; a public physical observable is definitionally not one.**

## 5. What the three arguments share, and why convergence matters

The three arguments are independent — one from hardware physics, one from information theory, one from the definition
of authentication — and use no shared premise. That they converge on the same boundary is the point: the negative
result is not an artifact of one modelling choice. Each independently forbids (D); none forbids (C).

## 6. The sound role that remains, and a safe construction

**The remaining role for photonics is (C):** bulk, error-tolerant, real-valued compute — e.g. approximate
nearest-neighbour / vector-similarity over embeddings — performed **strictly outside the trust boundary**, on data that
has *already* been authenticated and decrypted by exact digital means, never touching key material, with results
re-checked against a signed source of truth, and adopted only on a reproducible recall/throughput benchmark on named
hardware.

**Safe construction for a physical signal near a decision (degrade-only fold).** If a physical/analog measurement is to
influence a trust decision at all, it must be able to *lower* the decision but never *raise* it. Model the decision as a
three-valued verdict v ∈ {allow(+1), indeterminate(0), deny(−1)} and fold any side-signal r by conjunction/min:
`v' = min(v, r)`. By construction `v' ≤ v`, so a physical signal can only ever push a verdict *toward deny*, never mint
an `allow` — a "no-coercion" property. This lets a physical tamper-signal *degrade* trust (its legitimate use) while
making it structurally impossible for a forgeable physical observable to *grant* it. The digital, exact, keyed gate
remains the sole source of a positive decision: **decision = min(digital_keyed_verdict, physical_signal)**.

## 7. Conclusion

Photonics belongs on the plaintext, error-tolerant, outside-the-gate side of a cryptographic system, never on the
decision. The authentication/authorization decision must remain digital, exact, and keyed; a physical signal may only
degrade it. We record this as prior art so the recurring "why not do the crypto in light?" proposal can be answered with
a settled, multi-argument refutation rather than re-litigated each time. Light may hint; it must not decide.

---

*Cite-adjacent:* DP-RD-0270 (photonic-never-auth), DP-RD-0247 (authenticated-bytes = executed-bytes). Apache-2.0.
