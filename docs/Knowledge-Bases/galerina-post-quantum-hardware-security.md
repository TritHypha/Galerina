# Galerina Post-Quantum and Hardware Security Spec

## Status

```text
Scope: compiler/runtime security contracts for attestation and hardware trust
Runtime impact: policy and verification contracts (implementation phased)
Phase: 13+ bridge policy, 16+ attestation hardening, 20+ strict enforcement
```

## Rules at a Glance

- High-trust flows must declare hardware trust expectations.
- Signature policy is algorithm-agile: compatibility mode first, ML-DSA-required mode for high-assurance profiles.
- Hardware features (CHERI, MTE, TEE) are eligibility constraints, not optimization hints.
- Bridge fallback cannot weaken trust policy.
- Trust evidence is versioned and bound into proof-chain artifacts.

---

## Purpose

Define an enforceable contract for:
1. Post-quantum attestation transition.
2. Hardware memory-safety requirements.
3. Confidential-execution requirements for sensitive flows.

---

## Threat Model Focus

Addresses: signature-forgery risk over long-lived artifacts, memory corruption in runtime/backend code paths, hostile-host risk in shared/cloud execution environments, trust downgrade via implicit fallback.

Out of scope: physical side-channel elimination, endpoint compromise outside declared trust boundary.

---

## Hardware Trust Profile

```ts
interface HardwareTrustProfile {
  readonly attestation: {
    readonly required: boolean;
    readonly acceptedAlgs: readonly ("ed25519" | "ml-dsa-44" | "ml-dsa-65" | "ml-dsa-87")[];
    readonly minEvidenceVersion: string | null;
  };
  readonly memorySafety: {
    readonly requireMTE: boolean;
    readonly requireCHERI: boolean;
  };
  readonly enclave: {
    readonly requireTEE: boolean;
    readonly acceptedTEE: readonly ("tdx" | "sev-snp" | "cca" | "sgx")[];
  };
}
```

---

## Post-Quantum Attestation Policy

Migration profile levels:
1. `compat`: accept `ed25519` or ML-DSA.
2. `hybrid`: require both classic and PQ signatures for designated flows.
3. `pq_strict`: require ML-DSA only for high-assurance flows.

Required verifier behavior: reject unsupported algorithms, reject stale evidence schema versions, bind algorithm ID and key ID into proof-chain hash inputs.

Diagnostics:
- `SPORE-HW-101` MissingRequiredAttestation
- `SPORE-HW-102` UnsupportedAttestationAlgorithm
- `SPORE-HW-103` HybridAttestationIncomplete
- `SPORE-HW-104` AttestationEvidenceStale

---

## CHERI Capability Hardware Policy

- Flows requiring capability-enforced memory isolation may only run on CHERI-class backends.
- Fallback to non-CHERI target denied unless flow policy allows downgrade.
- Audit record must include capability-mode evidence marker.

Diagnostic: `SPORE-HW-201` CapabilityHardwareRequired

---

## ARM MTE Policy

- Target metadata must include MTE support + active mode evidence.
- Deterministic profile must reject targets without tag-check guarantees when `requireMTE=true`.

Diagnostics:
- `SPORE-HW-301` MemoryTaggingRequired
- `SPORE-HW-302` MemoryTaggingEvidenceMissing

---

## TEE Policy (TDX / SEV-SNP / CCA / SGX)

- Bridge planner must select an enclave-compatible path when `requireTEE=true`.
- Verifier must validate quote/report claims against policy.
- Denial must be explicit and auditable.

Diagnostics:
- `SPORE-HW-401` TrustedExecutionRequired
- `SPORE-HW-402` TrustedExecutionTypeNotAllowed
- `SPORE-HW-403` TrustedExecutionAttestationFailed

---

## Proof Chain Binding

Include in proof chain: attestation algorithm + key ID, enclave/report measurement digest, memory-safety mode evidence (MTE/CHERI flags), target bridge hash and downgrade decision fields.

Rule: any hardware trust downgrade changes proof-chain hash and emits governance diagnostic.

---

## Implementation Sequencing

1. Phase 13-14: introduce `HardwareTrustProfile` in bridge planner and diagnostics.
2. Phase 15-16: hybrid attestation support and proof binding.
3. Phase 17+: strict profile enforcement.

---

## Test Additions

1. `pq_strict` rejects ed25519-only evidence.
2. `hybrid` profile rejects single-signature evidence.
3. `requireTEE=true` flow fails selection on non-TEE targets.
4. `requireMTE=true` flow fails on ARM target without MTE evidence.
5. `requireCHERI=true` flow fails on non-capability backend.
6. Fallback path cannot clear trust requirements.

---

## External References

- NIST FIPS 204 (ML-DSA): https://csrc.nist.gov/pubs/fips/204/final
- Arm MTE (Linux): https://www.kernel.org/doc/html/latest/arch/arm64/memory-tagging-extension.html
- CHERIoT research: https://www.microsoft.com/en-us/research/publication/cheriot-complete-memory-safety-for-embedded-devices/
- Google Confidential Computing: https://docs.cloud.google.com/confidential-computing/docs/attestation
