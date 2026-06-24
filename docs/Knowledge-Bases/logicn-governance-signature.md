# LogicN — GovernanceSignature

**Version: 1.0 — 2026-06-01**
**Status: Phase 39 planned — design complete**

---

## What It Is (LogicN Terminology)

A `GovernanceSignature` is an **unforgeable, long-lived certificate** attached to a
`ProofGraph` that proves:

1. This ProofGraph was issued by a trusted governance compiler
2. The governance compiler ran at a specific point in time
3. The proof has not been altered since issuance
4. The certificate will remain verifiable for the **lifetime of the governed system** —
   including after quantum computers exist

---

## The Problem It Solves

The current `ProofGraph.signatureHash` is a **SHA-256 hash** of the execution
signature fields. It proves internal consistency — the fields match the hash.
But it does not prove **who issued the proof**.

Anyone who can re-run the governance verifier on the same source produces the
same hash. A fabricated ProofGraph with matching fields is indistinguishable
from a genuine one.

For aerospace, defence, and regulated systems with 20–40 year lifetimes,
this is insufficient. The compliance certificate must be:

```
Tamper-evident:    no one can alter the proof and re-sign it
Unforgeable:       no one can produce a valid proof without the signing key
Long-lived:        valid for decades, even after quantum computers exist
Auditable:         the signer's public key is published and stable
```

---

## LogicN Type Definition (Phase 39)

```typescript
export interface GovernanceSignature {
  readonly algorithm: "lln.gov.sig.v1";  // LogicN terminology
  readonly signerKeyId: string;           // Published key ID (e.g. "lln-gov-2026-01")
  readonly signature: string;             // Base64-encoded signature bytes
  readonly signedAt: string;              // ISO-8601 timestamp
  readonly expiresAt?: string;            // Optional — for rotating governance keys
}

export interface ProofGraph {
  // ... existing fields unchanged ...
  readonly schemaVersion: "lln.proof.v1";
  readonly flowName: string;
  readonly executionSignature: ExecutionSignature;
  readonly signatureHash: string;            // SHA-256 — unchanged, still present

  // Phase 39 addition:
  readonly governanceSignature?: GovernanceSignature;  // present in production profile
}
```

The `governanceSignature` is **optional** during development. In `production`
and `deterministic` deployment profiles it is **required**.

---

## How It Works

**Signing** (governance compiler, build time):

```logicn
// LogicN terminology:
let proof = buildProofGraph(flow, governanceContext)
let signature = GovernanceAuthority.sign(proof.signatureHash, signingKey)
let signedProof = proof with { governanceSignature: signature }
```

**Verification** (deployment system, auditor, investigation):

```logicn
// Anyone with the published public key can verify — no secret needed:
let valid = GovernanceAuthority.verify(
  proof.signatureHash,
  proof.governanceSignature,
  publishedPublicKey
)
// valid === true means: this proof came from a known governance authority
//                       and has not been altered
```

---

## The Key Property

```
SHA-256 hash:         "these fields are internally consistent"
GovernanceSignature:  "the governance compiler with this key issued this proof —
                       provable without trust in the holder, valid for 30 years"
```

---

## Why Quantum-Resistant?

Classical signatures (ECDSA, RSA) are broken by Shor's algorithm on
sufficiently large quantum computers. Quantum computers are expected within
the lifetime of aerospace systems (20–40 years).

`GovernanceSignature` uses a **lattice-based** algorithm that is hard for
both classical and quantum computers. The underlying standard is:

```
NIST FIPS 204 (2024) — Module Lattice Digital Signature Algorithm (ML-DSA)
Previously known as: Dilithium (as a nickname, after the Star Trek material)
LogicN name:         GovernanceSignature (lln.gov.sig.v1)
```

The algorithm name `ML-DSA` may appear in implementation-layer code and
comments. The LogicN KB and language spec use `GovernanceSignature` throughout.

---

## Signature Sizes

| Security Level | Signature | Public Key | Signs/sec |
|---|---|---|---|
| `lln.gov.sig.v1` (standard) | 2.4KB | 1.3KB | ~90K/s |
| `lln.gov.sig.v2` (high security) | 3.3KB | 1.9KB | ~60K/s |
| ECDSA-256 (classical, insecure post-quantum) | 64 bytes | 33 bytes | ~100K/s |

Signatures are 37× larger than ECDSA but quantum-safe. For ProofGraphs
(signed once at compile time), this is acceptable. For on-chain audit
records, use `lln.gov.sig.v1`.

---

## Shipped: `lln.gov.sig.v2` Hybrid Signature (Ed25519 + ML-DSA-65)

> **Status: SHIPPED (opt-in).** The `lln.gov.sig.v2` algorithm tag is now a live,
> persisted hybrid signature — not the "high security" size variant the table
> above describes for v1. The **default** governance signing path remains Ed25519
> (`lln.gov.sig.v1`, unchanged). Hybrid is opt-in; under
> `LOGICN_MANIFEST_PROFILE=certified` it is **mandatory and fail-closed**.

The migration profile baked into `proof-graph.ts` is:

| Profile | Algorithm tag | Algorithms | Status |
|---|---|---|---|
| compat (Phase 39) | `lln.gov.sig.v1` | Ed25519 only | shipped, default |
| hybrid (Phase 55) | `lln.gov.sig.v2` | Ed25519 + ML-DSA-65 — **both required** | shipped, opt-in |
| pq_strict (future) | `lln.gov.sig.v3` | ML-DSA-65 only | reserved |

```typescript
export interface GovernanceSignature {
  readonly algorithm: "lln.gov.sig.v1" | "lln.gov.sig.v2";  // v2 = Phase 55 hybrid
  readonly signerKeyId: string;
  readonly signature: string;   // v2: "<ed25519_b64url>|<mldsa65_b64url>" — both halves
  readonly signedAt: string;
  readonly expiresAt?: string;
}
```

**Both-halves rule.** A `lln.gov.sig.v2` signature carries the two halves joined
by a `|` (base64url never contains `|`, so a classical Ed25519 value can never be
mistaken for hybrid). `verifyGovernanceSignatureHybrid` checks **both** the
Ed25519 and the ML-DSA-65 half — neither alone admits. The signer
(`signProofGraphHybrid`) falls back to Ed25519-only v1 if it does not recognise
the key as hybrid; the caller therefore **refuses to persist** a result that is
not a both-halves v2 (no silent post-quantum downgrade).

**Domain separation.** The ML-DSA-65 half is signed under the FIPS-204
domain-separation context `logicn.proofgraph.governance.v1`, distinct from the
audit-attestation and bridge-manifest contexts so one ML-DSA key cannot be
cross-protocol-confused between the three signing surfaces.

**What is signed.** As with v1, only the deterministic ProofGraph fields are
signed — `schemaVersion + flowName + signatureHash + verified + obligations`. The
mutable fields (`generatedAt`, `evidence`) are excluded, so adding new evidence
to an existing proof does not invalidate the signature. For the `.lmanifest`
signing envelope this fixed shape is produced by `makeManifestEnvelope`
(`proof-graph.ts:564`); see `logicn-signed-attestation.md` and
`logicn-cbor-manifest-spec.md`.

---

## Key Management

```
Governance signing key:  held by the LogicN governance compiler, never in source
Published public key:    published at https://keys.logicn.dev/gov/{keyId}
Key rotation:            new key per year, old keys remain valid for verification
Key ID format:           "lln-gov-YYYY-MM" (e.g. "lln-gov-2026-01")
```

---

## Phase 39 Implementation Plan

1. Add `GovernanceSignature` interface to `proof-graph.ts`
2. Add `signProofGraph(proof, signingKey)` function
3. Add `verifyGovernanceSignature(proof, publicKey)` function
4. Wire into governance verifier: production profile → sign all ProofGraphs
5. Add `lln.gov.sig.v1` diagnostic: `LLN-GOV-SIG-001` — missing signature in production
6. CLI: `logicn verify --proof proof.json --key lln-gov-2026-01` command
7. Tests: 30+ test cases for sign/verify/tamper-detection

**Underlying library**: `ml-dsa` npm package (or `pqcrypto` Rust crate for
the native accelerator path on i9 with SHA-NI extension).

---

## Example: Aerospace Audit Chain

```
2026-06-01:  updateFlightPath.lln compiled
             ProofGraph issued with GovernanceSignature (lln-gov-2026-01)
             Stored in: flight-control-v3.2.proof.json

2055-03-15:  Incident investigation begins
             Investigator: verify proof.json --key lln-gov-2026-01
             Result: VALID — governance compiler issued this on 2026-06-01
             Conclusion: flow was governance-verified at time of deployment
```

No one can forge this certificate. No one can claim the flow was verified
when it wasn't. The mathematics ensure this even if quantum computers exist.

---

## See Also

- `logicn-governance-hierarchy.md` — the full governance stack
- `proof-graph.ts` — current ProofGraph implementation
- `logicn-roadmap-phase26-41.md` — Phase 39 implementation phase
- **auth-token-verification-boundaries** — post-quantum token policy
