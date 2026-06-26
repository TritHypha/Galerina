# Galerina — DRCM Phase 1 Remaining Specifications

**Version:** 1.0 (2026-06-04)  
**Purpose:** Design specifications for DRCM Phase 1 tasks #32, #34, #35 that require Phase 5+ infrastructure before full implementation.  
**Status:** SPEC COMPLETE — implementation gated on DRCM Phase 5 (DSS.wasm + V_DPM register).

---

## Task #32 — CAS Atomic Monotonic State Transition

**Problem:** The V_DPM (Dynamic Posture Matrix) 32-bit register in DSS.wasm must only decrease monotonically. A TOCTOU (Time-Of-Check Time-Of-Update) race could allow two concurrent DWI isolates to simultaneously read the current V_DPM value, both decide a decrement is valid, and both apply separate decrements — potentially resulting in a non-monotonic final state.

**Why not in Stage A:** Stage A is single-threaded (Node.js async event loop). TOCTOU races are structurally impossible. This task is exclusively relevant to DRCM Phase 5 when DSS.wasm runs as a concurrent supervisor with multiple parallel DWI guest isolates.

### Specification

The V_DPM register update MUST use Compare-and-Swap (CAS) semantics:

```
procedure decrement_vdpm(new_posture: U32):
  loop:
    current = atomic_load(V_DPM)          ; read current value
    if new_posture >= current:             ; monotonicity check: new must be ≤ current
      return Error(MonotonicityViolation)
    success = atomic_compare_exchange(
      addr: V_DPM,
      expected: current,
      desired: new_posture
    )
    if success: return Ok(new_posture)     ; CAS succeeded — transition complete
    ; CAS failed (another DWI changed V_DPM concurrently) — retry
```

**Implementation target:** `DSS.spore` (DRCM Phase 5) using Wasmtime's `memory.atomic.wait` / `memory.atomic.notify` WASM atomic instructions.

**Diagnostic code:** `SPORE-MONO-001` — monotonic state transition attempted without CAS → rejected at DSS admission gate.

---

## Task #34 — Receipt Signing Key Custody Specification

**Problem:** The Epilogue Receipt is signed with ML-DSA-65 (NIST FIPS 204). The signing key used by DSS.wasm must be managed with a full custody specification: generation, storage, rotation, revocation.

**Why not in Stage A:** Epilogue Receipts don't exist yet (DRCM Phase 6, task #42). Placeholder signatures are in `.lmanifest` (task #33) but the real signing infrastructure is Phase 6+.

### Specification

**Key generation:**
- ML-DSA-65 key pair generated at DSS initialisation using Wasmtime's WASI random source
- Private key stored in DSS.wasm's sealed linear memory — never exported
- Public key published in the `.lmanifest` at compile time

**Key storage hierarchy:**
```
DSS.wasm initialisation
  ↓
Wasmtime WASI RNG (wasi:random/random)
  ↓ seed
ML-DSA-65 key derivation
  ↓
Private key: DSS linear memory [address range sealed by Wasmtime guard pages]
Public key:  exported via WASI export function → stored in .lmanifest
```

**Key rotation policy:**
- Rotatable without DSS restart via sealed key-handshake protocol
- Old key remains valid for verification of previously-signed receipts (dual-key window)
- New key activates for new receipt signing immediately
- Rotation event recorded in append-only DSS audit log

**Key revocation:**
- Revoked keys stored in `.lmanifest`'s `revokedSigners` list
- DSS admission gate rejects any receipt signed by a revoked key

**Diagnostic codes:**
- `SPORE-ID-002` — V_DPM register transition signed by revoked key
- `SPORE-ID-003` — receipt signature verification failed (tamper detection)

**Implementation target:** `dss.spore` (DRCM Phase 5+) using ML-DSA-65 from `galerina-ext-proof-snarkjs` or a dedicated `galerina-ext-crypto-pqc` package.

---

## Task #35 — Receipt Separator Injection Fix (Length-Prefix Encoding)

**Problem:** The current Epilogue Receipt format (DRCM Phase 6 design) concatenates fields using separator characters. An attacker who can control the value of any receipt field (e.g. a flow name containing `|`) could inject the separator, causing the receipt parser to misinterpret field boundaries.

**Why not in Stage A:** Epilogue Receipts don't exist yet (DRCM Phase 6, task #42). This is a design constraint for how the receipt format MUST be implemented when it ships.

### Specification

**BAD (separator-based — injectable):**
```
receipt = flowName + "|" + sourceHash + "|" + timestamp + "|" + effectsList
```
If `flowName = "processPayment|fakefield"`, the separator is injected and the parser sees a phantom field.

**CORRECT (length-prefix encoding — injection-proof):**
```
field = length_prefix(value)
  where length_prefix(s) = uint32_be(len(s)) + utf8_bytes(s)

receipt = length_prefix(flowName)
        + length_prefix(sourceHash)  
        + length_prefix(timestamp)
        + length_prefix(effectsList)
```

**Wire format (TLV — Type-Length-Value):**
```
receipt_field:
  type:   uint8   (0x01=flowName, 0x02=sourceHash, 0x03=timestamp, 0x04=effects)
  length: uint32_be
  value:  utf8 bytes (exactly `length` bytes)

receipt = [field]* + hmac_tag(32 bytes, ML-DSA-65 signature)
```

**Properties:**
- Field boundaries are determined by explicit byte counts, not separator matching
- Injected separator characters in field values are treated as data, not structure
- Field length of 0 is valid (empty field)
- Maximum field length: 65,535 bytes (uint16_be) or 4,294,967,295 bytes (uint32_be)

**Diagnostic code:** `SPORE-AU-002` — receipt with separator-based encoding detected → reject at DSS admission gate (DRCM Phase 6).

**Implementation target:** `galerina-core-compiler/src/epilogue-receipt.ts` (DRCM Phase 6, task #42).

---

## Implementation Gate

All three specifications (#32, #34, #35) are gated on DRCM Phase 5 (tasks #40-#41: `step` keyword + DSS supervisor). The design is complete and locked; the code ships when the DSS infrastructure exists.

| Task | Spec status | Implementation gate |
|---|---|---|
| #32 CAS atomic | ✅ Spec complete | DRCM Phase 5 — DSS.spore atomic ops |
| #34 Key custody | ✅ Spec complete | DRCM Phase 5/6 — DSS.spore key generation |
| #35 Length-prefix | ✅ Spec complete | DRCM Phase 6 — epilogue-receipt.ts |

---

## Cross-References

| Topic | Document |
|---|---|
| DRCM architecture | `galerina-deterministic-runtime-containment.md` |
| .lmanifest format (#33) | `packages-galerina/galerina-core-compiler/src/manifest-generator.ts` |
| Epilogue Receipt design | `galerina-design-secrets-epilogue-blocks.md` |
| DSS Phase 5 tasks | `galerina-build-roadmap.md` |
