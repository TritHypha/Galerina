# Pattern 9 — The .lmanifest (Compliance Evidence)

**Profile:** `drcm_core_v1` — DRCM Phase 3 (2026-08)  
**Status:** Documentation only. `.lmanifest` generation is not yet implemented in Stage A.

---

## What it is

The `.lmanifest` is emitted at compile time alongside the `.wasm` binary. It carries machine-verifiable proof of the compiled module's governance properties — data-flow constraints, proof obligations, and a post-quantum signature.

A QSA (Qualified Security Assessor) verifies this file without reading source code.

---

## Structure (target format — Phase 3)

```json
{
  "schemaVersion": "spore.manifest.v1",
  "sourceHash": "sha256:3f4a9c...",
  "derivedConstraints": [
    "CardholderData never_touches TelemetryLog",
    "PAN requires redact() before AuditLog",
    "EMAIL_API_KEY never_reaches network.outbound"
  ],
  "proofObligations": [
    {
      "flowId": "transferFunds",
      "invariant": "payload.amount > 0",
      "verified": "runtime-precheck",
      "drcmPhase": 2
    },
    {
      "flowId": "transferFunds",
      "invariant": "Ledger.getBalance(from) >= payload.amount",
      "verified": "runtime-precheck",
      "drcmPhase": 2
    }
  ],
  "governanceSignature": {
    "algorithm": "ML-DSA-65",
    "ed25519": "...",
    "mlDsa65": "..."
  },
  "generatedAt": "2026-08-01T09:00:00Z"
}
```

---

## Compliance consumers

| Consumer | Uses |
|---|---|
| PCI DSS v4.0 assessor | `derivedConstraints` — proves CardholderData cannot reach telemetry |
| SOC 2 Type II auditor | `proofObligations` — data flow evidence |
| HIPAA compliance tool | `derivedConstraints` — PHI isolation proof |
| DSS admission gate (runtime) | `sourceHash` + `governanceSignature` — verified before any DWI loads |

---

## How to produce it (Phase 3)

```
galerina build --manifest payment-service.spore
# Outputs: build/payment-service.wasm
#           build/payment-service.lmanifest
```

---

## DSS admission gate (Phase 3)

Before loading any DWI guest module, the DSS verifies:
1. `SHA-256(payment-service.wasm)` == `manifest.sourceHash`
2. ML-DSA-65 signature verifies with the compiler signing key

If either check fails: `SPORE-ID-001` — the module is rejected, never instantiated.

---

## Reference

- `galerina-governance-rules.md` — ID-001, ID-002, ID-003
- `galerina-deterministic-runtime-containment.md` — Phase 3 roadmap
- `galerina-engineering-goals.md` — Goal B (single-cycle bitmask depends on manifest)
