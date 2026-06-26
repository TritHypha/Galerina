# QRNG Entropy Capability — governed interface design (Q1 / Lane D)

**Status: 🔵 DESIGN-ONLY (roadmap Q1, "buildable-now").** Designs the *governed interface* for a quantum-RNG
entropy capability in Galerina. **No hardware in scope, no engine code yet** — this defines the boundary, the
governance semantics, and the acceptance bar so the capability can be wired when vetted hardware exists.
Source lane: `galerina-quantum-resilience-roadmap.md` §Q1 + `rd-absorbed/rd-qrng-entropy-source-for-hybrid-signing.md`
(Lane D). The web-cited standards/products grounding is R&D bridge task `0005` (feeds this design; refine on its return).

> **Crypto-on-core (`SPORE-SUBSTRATE-001`):** a QRNG is a **source of randomness, not a cryptographic primitive.**
> It sits **before** the cipher — supplying entropy to the key/nonce schedule — exactly like the OS CSPRNG it
> augments. It never computes a hash, cipher, or signature. There is **no photonic crypto** here; only photonic *entropy*.

## 1. What this buys (and what it does not)
- **Buys:** the randomness feeding every key/nonce becomes information-theoretically *unpredictable* (true quantum
  entropy), removing PRNG-seed predictability as a trust assumption. This is the cheapest, most deployable ITS
  upgrade on the roadmap (L3 entropy floor).
- **Does NOT buy:** more unforgeability or confidentiality strength. The DEM/KEM/signature math is unchanged. At
  signing, the benefit is **side-channel / fault hardening** of nonce generation, **not** a stronger algorithm.
- **Never:** raw quantum bits → key. Raw hardware output is biased; it must pass the full SP 800-90 pipeline first.

## 2. The pipeline (SP 800-90A/B/C)
```
[ENTROPY SOURCE]          quantum noise (photon path/arrival, vacuum fluctuation, …)  — hardware, out of scope to build
      │
      ▼  continuous health tests (SP 800-90B): RCT (Repetition Count) + APT (Adaptive Proportion)
[HEALTH GATE]  ── fail ──▶  capability = UNAVAILABLE  (fail-closed; see §3)
      │ pass
      ▼  conditioning + DRBG (SP 800-90A): CTR_DRBG / Hash_DRBG / HMAC_DRBG, reseeded from the conditioned source
[DRBG]
      │
      ▼  full-entropy output
[OUTPUT]  ──▶  the .tmf KEM-DEM key schedule + AEAD nonces (engine-side, deterministic core)
```
- **RBG2 vs RBG3** (target to be confirmed by task 0005): an **RBG3** construction (continuous full-entropy from a
  live validated source) is the strongest target; an **RBG2** (DRBG reseeded from a validated source) is the
  pragmatic deployable form. The design treats the QRNG as a *validated entropy source behind a DRBG* (RBG2-class),
  upgradeable to RBG3 where the hardware supports it.
- **Validation:** the source should be **NIST ESV-validated** (Entropy Source Validation); the design records the
  validation id as attestation metadata (no validation ⇒ the capability is "claimed, not vetted" ⇒ treated as absent
  for any policy that *requires* vetted entropy).

## 3. The governed capability (fail-closed)
QRNG availability is a **capability behind the Galerina governance boundary**, modelled like the Lane B/E quantum
capabilities and the substrate lanes — a three-valued, fail-closed gate:

| Element | Design |
|---|---|
| **Capability** | `entropy.qrng` — present iff a vetted source is configured **and** its current SP 800-90B health state is passing. |
| **Health → verdict** | a failed RCT/APT health test flips the capability to **unavailable** mid-run; the verdict for any QRNG-requiring policy collapses to **`unknown → deny`** (K3, `SPORE-GOV-3VL-001`). |
| **No silent downgrade** | a policy that **requires** QRNG entropy **MUST NOT** silently fall back to the OS CSPRNG when QRNG is unavailable — that defeats the assertion. It denies (or, only with explicit policy consent, degrades). Mirrors Lane E §4.2 and Lane B §8.2. |
| **Default posture** | when **no** policy requires QRNG, the engine uses the OS CSPRNG as today; a configured QRNG is then a transparent quality upgrade (still piped through the DRBG). |
| **Attestation** | the entropy source's ESV id + health-state summary are bound into the operation's audit/attestation record (the same receipt path the bridge attestation uses), so "this key was QRNG-seeded" is provable, not asserted. |

### Candidate diagnostics (proposed — not yet enforced)
- **`SPORE-ENTROPY-001`** — a policy/contract that **requires** `entropy.qrng` but the capability is unavailable (no
  vetted source, or a failed health test) → **deny** (fail-closed; audited, never silent).
- **`SPORE-ENTROPY-002`** — an attempt to consume **raw** entropy-source output as key material (bypassing the
  SP 800-90B health gate / 90A DRBG) → **error** ("never raw bits → key").

## 4. How it meets the engine
The QRNG capability is **upstream of** `galerina-ext-tmf`'s key schedule — it supplies the bytes that seed:
- the **KEM-DEM** ephemeral key material (slice 3) and the DEM key schedule, and
- the **AEAD nonces** (where a fresh random nonce is used rather than a deterministic STREAM counter).
The engine remains deterministic and bit-exact; only its *entropy input* changes source. No engine API changes are
required to *design* this — the capability is a host-provided RNG the engine already abstracts behind a `getRandomBytes`
seam; the governance layer decides **which** source satisfies a given policy.

## 5. Acceptance bar (design → build gate, from roadmap Q1)
1. a **NIST-ESV-validated QRNG** wired behind the capability boundary (today: none in scope);
2. the **SP 800-90B health → 90A DRBG** pipeline implemented with **fail-closed** behavior on a failed health test;
3. a **measured RBG2/RBG3 throughput on named hardware** (no synthesized number — crypto-on-core honesty rule);
4. the `entropy.qrng` capability + `SPORE-ENTROPY-001/002` enforced in the governance verifier.
Until 1–3 hold: **define the interface, keep it inert, default to the OS CSPRNG.** No throughput/security number is
claimed here — absent hardware, that is a **THEORETICAL GAP** (same posture as Lanes B/E).

## See also
`galerina-quantum-resilience-roadmap.md` (§Q1, the lane this implements) · `rd-absorbed/rd-qrng-entropy-source-for-hybrid-signing.md` (Lane D research) · `galerina-tmf-engine.md` (the consumer) · `galerina-three-valued-governance.md` (the K3 fail-closed gate) · `galerina-quantum-resistance-posture.md`. Grounding survey: R&D bridge task `0005`.
