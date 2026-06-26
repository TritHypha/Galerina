# Galerina — ASIC Cyber-Physical Shielding Architecture

**Status: DESIGN PROPOSAL (2026-06-03)**
The `contract.target { cyber_physical_hardening { ... } }` grammar sub-block can be added to the
compiler now (same pattern as `secrets {}` — parsed and retained as a first-class `contractDecl`
child). The hardware dispatch layer requires physical ASIC co-design and belongs to the external
§Tail. This document records the intended design so the grammar and runtime stubs can be built
incrementally.

**Auto-by-default:** `cyber_physical_hardening {}` is **omitted by the vast majority of flows**.
The runtime selects the appropriate shielding tier automatically from the ValueGraph risk
classification. Only Tier 1 sovereign flows (financial settlement, defense-grade cryptography)
need to declare this block explicitly — the same pattern as `economics {}`. See
`galerina-contract-economics.md` for the canonical description of auto-by-default governance blocks.

---

## 1. The Threat Model: Why Software Isolation Is Insufficient

WASM sandbox isolation is the primary security boundary for Galerina flows running on conventional
compute targets. The sandbox prevents one flow from reading another flow's memory, enforces
capability-gated I/O (WASI), and limits the blast radius of a compromised dependency.

However, the sandbox is entirely a software construct. An adversary with **physical chip access**
can bypass it through:

- **Side-channel analysis (SCA):** differential power analysis (DPA), electromagnetic emanation
  analysis (EMA), timing attacks. The adversary learns secret key material by observing analog
  signals emitted during computation — without ever touching the software.
- **Fault injection:** voltage glitching, clock glitching, laser bit-flip. The adversary corrupts
  a single bit in a branch condition or a key register, causing the processor to take an
  incorrect path (e.g. skip a signature check, return a forged result).
- **Microprobing:** decapping the chip and attaching nano-probes to internal buses to read or
  modify signals directly.
- **Laser bit-flip (LBIF):** focused ion beam or laser pulses alter individual memory cells,
  turning a `0` to `1` in a critical flag.

Against these attacks, even a formally verified software stack provides no guarantee. The
assurance must extend to the physical substrate.

This document defines how Galerina's governed contract model extends to express physical shielding
requirements, and how the runtime maps those requirements to hardware capabilities.

---

## 2. Three Shielding Tiers

The architecture defines three hardware shielding tiers, ordered by sensitivity of the data they
protect. The tiers are nested: Tier 1 encloses Tier 2, which encloses Tier 3.

### Tier 1 — Sovereign Core

**What it protects:** cryptographic key material, ProofGraph verification roots, identity
attestation anchors — the highest-value secrets in the system. Compromise of Tier 1 is a
catastrophic system failure.

**Hardware mechanisms:**

- **Active Shielding Mesh:** a continuous wire mesh woven over the die surface and driven with
  a pseudo-random signal. Any attempt to cut or probe the mesh disrupts the signal and triggers
  immediate zeroization of all Tier 1 registers.
- **Dual-Core Lockstep:** two identical processor cores execute the same instruction stream in
  parallel. A cycle-level comparator checks that outputs match on every clock edge. Any
  divergence (as would be caused by a fault-injection bit-flip on one core) triggers lockstep
  fail detection, sets HIV Bit 3 (see §3), and initiates the Tier 3 tamper response.

**Zeroization:** on any tamper detection in Tier 1, all registers and SRAM cells in the Sovereign
Core are driven to zero within one clock cycle before the tamper response propagates to the rest
of the system.

### Tier 2 — Governed Execution Engine

**What it protects:** application flows and data pipelines executing under a Galerina contract.
The execution engine processes data that has been classified by the ValueGraph and routed here
because it exceeds the risk threshold for Tier 3.

**Hardware mechanisms:**

- **Deep Trench Isolation (DTI):** physical semiconductor trenches between the Governed Execution
  Engine and adjacent die regions. DTI raises the coupling resistance between circuit blocks,
  making electromagnetic side-channel analysis significantly harder.
- **Constant-Time Execution:** all cryptographic primitives in Tier 2 are implemented as
  constant-time circuits — execution time does not vary based on secret data values. This
  defeats timing-based SCA.
- **Dummy Power Injection:** randomized dummy operations are inserted to flatten the power
  consumption profile, defeating differential power analysis.

### Tier 3 — Memory and Interconnect Array

**What it protects:** cache lines, bus routing, and inter-tier data transfer. This tier handles
data that is in motion between Tiers 1 and 2 and between the governed execution engine and
external WASM linear memory.

**Hardware mechanisms:**

- **Bus Scrambling:** the address and data buses between memory and processor are scrambled with
  a session key that rotates on each power cycle. An adversary probing a bus sees only scrambled
  signals.
- **Memory Encryption Engine (MEE):** all data written to external DRAM is encrypted with an
  ephemeral key. The MEE is integrated into the memory controller; the key never leaves the
  Tier 1 Sovereign Core.

---

## 3. Hardware Integrity Vector (HIV)

The Hardware Integrity Vector is a **4-bit read-only status register** exposed to the Galerina
runtime via the WASI interface `wasi:hardware/integrity`. It is the bridge between the physical
shielding layer and the software governance layer.

| Bit | Name | Meaning |
|-----|------|---------|
| 0 | Mesh Tamper | Active shielding mesh disruption detected |
| 1 | Clock Anomaly | Clock glitch or frequency deviation outside envelope |
| 2 | Voltage Fault | Supply voltage outside operating range (fault injection attempt) |
| 3 | Lockstep Fail | Dual-core output divergence detected |

All four bits are **read-only from software**. They can only be set by the hardware tamper
detection circuits and cleared by a full power cycle (hardware zeroization + reset).

The HIV is read at flow entry for any flow executing under a `cyber_physical_hardening` contract,
and can be read explicitly via:

```galerina
let status: HardwareStatus = Hardware.readIntegrityVector()
contract {
  invariant { ensure status == HardwareStatus.PRISTINE }
}
```

This pattern — asserting hardware proof before processing — is the Physical Invariant Mapping
described in `galerina-cross-layer-resilience.md`.

---

## 4. The `cyber_physical_hardening {}` Contract Sub-Block

`cyber_physical_hardening {}` is a **sub-block of `target {}`**, not a separate top-level
contract block. It extends the existing `target {}` syntax and does not require any new
top-level grammar production.

### 4.1 Syntax

```galerina
contract {
  intent { "Sovereign financial settlement — Tier 1 shielding required." }
  target {
    preferred_execution hardware
    cyber_physical_hardening {
      enclosure_shielding   active_mesh
      fault_mitigation      lockstep
      side_channel_protection constant_time
      on_tamper_signal      zeroize
    }
  }
  economics {
    max_compute_cost "£0.50"
  }
}
```

### 4.2 Field Reference

| Field | Values | Default (auto) |
|-------|--------|----------------|
| `enclosure_shielding` | `active_mesh` \| `passive` \| `none` | runtime-selected from ValueGraph tier |
| `fault_mitigation` | `lockstep` \| `ecc_only` \| `none` | runtime-selected |
| `side_channel_protection` | `constant_time` \| `power_balanced` \| `none` | runtime-selected |
| `on_tamper_signal` | `zeroize` \| `suspend` \| `log_only` | `zeroize` for Tier 1, `suspend` for Tier 2 |

### 4.3 Auto-by-Default Rule

**Do not write this block unless you are authoring a Tier 1 sovereign flow.**

The runtime selects the shielding tier from the ValueGraph breach-risk / asset-weight
classification automatically. A routine API flow gets Tier 3 bus scrambling. A flow handling
cryptographic key material gets Tier 1 active-mesh + lockstep. The developer declares nothing
and receives the appropriate protection.

Declaring `cyber_physical_hardening {}` explicitly **pins** the shielding configuration
regardless of ValueGraph classification. This is correct for flows that are subject to a
regulatory framework requiring a *specific* mechanism (e.g., FIPS 140-3 Level 4, Common Criteria
EAL6+), but it is incorrect for general application flows where the ValueGraph should remain
authoritative.

---

## 5. `contract.liability {}` — Auto-Calculated Breach Exposure

`liability {}` is a companion auto-by-default block that exposes the **maximum legal and
financial liability** that would result from a breach of the flow's governed data. It is
calculated from the ValueGraph breach-risk classification and is rarely declared manually.

```galerina
// Auto-inferred — developer does not normally write this block
contract {
  liability {
    max_breach_exposure "£2,500,000"   // calculated from ValueGraph asset classification
    regulatory_framework "UK GDPR"
    on_breach_notification 72h          // GDPR Article 33 deadline
  }
}
```

When declared explicitly, `liability {}` is a commitment: the runtime records it in the audit
trail and the `epilogue {}` proof receipt includes the declared liability envelope. This makes
the governed contract a machine-readable compliance assertion, not just an advisory comment.

As with all auto-by-default blocks (`economics {}`, `secrets {}`, `epilogue {}`), omitting
`liability {}` does not remove liability awareness from the system — it delegates the
calculation to the ValueGraph runtime layer.

---

## 6. Tiered Tamper Response Strategy

When the HIV signals a tamper event, the runtime responds in proportion to the severity:

### Tier 1 Response (Low-severity: Clock Anomaly or Voltage Fault, single occurrence)

1. Log the anomaly to the immutable governance audit trail.
2. Gate any pending capability escalations — require re-authentication.
3. Normalize the supply/clock to within safe operating envelope.
4. Continue execution if HIV returns to `PRISTINE` within the cooldown window.

### Tier 2 Response (Medium-severity: repeated anomaly, or mesh breach on non-sovereign zone)

1. `demote_to_local`: withdraw all network-facing capabilities from the affected flow.
2. Suspend outbound connections.
3. Flush the Tier 3 memory encryption keys and re-derive from Tier 1.
4. Quarantine the affected flow instance pending operator review.

### Tier 3 Response (High-severity: Mesh Tamper or Lockstep Fail)

1. Initiate hardware zeroization sequence: all Tier 1 registers zeroed within one clock cycle.
2. Assert hardware reset line to all Tier 2 execution engines.
3. Set all HIV bits to `1` (latching state — cleared only by power cycle).
4. Log final tamper event to non-volatile audit record before zeroization completes.

The response tier is determined by the hardware tamper detection circuits before software is
consulted. The runtime's role is to mirror the response in the governed contract audit trail
and propagate the state change to other flows that share the Tier 1 identity root.

---

## 7. Implementation Phasing

| Phase | Work | Implementable now? |
|-------|------|--------------------|
| Grammar: `cyber_physical_hardening {}` as `target {}` sub-block | Parser + AST node, same as `secrets {}` | Yes |
| HIV read stub: `Hardware.readIntegrityVector()` returns `PRISTINE` on non-ASIC targets | WASI shim | Yes |
| ValueGraph tier classification → shielding tier mapping | Runtime inference layer | Yes |
| Actual ASIC active-mesh + lockstep hardware | Physical ASIC co-design | External §Tail |
| MEE + bus scrambling implementation | Physical ASIC co-design | External §Tail |
| `liability {}` auto-calculation from ValueGraph | Runtime inference layer | Yes (near-term) |

The grammar and runtime stubs can be built in parallel with the existing `secrets {}` /
`epilogue {}` implementation work. No ASIC hardware is required to make the contract syntax
functional and testable against the Stage-A compiler.

---

## 8. Related Documents

- `galerina-contract-economics.md` — canonical description of auto-by-default dual-mode contract
  blocks; `cyber_physical_hardening {}` follows the same pattern
- `galerina-design-secrets-epilogue-blocks.md` — `secrets {}` and `epilogue {}` implementation
  reference; grammar pattern this block mirrors
- `galerina-zk-proof-plan.md` — `epilogue { generate_proof zk_snark_receipt }` for cryptographic
  proof of governed execution, which complements physical shielding
- `galerina-cross-layer-resilience.md` — the Physical Invariant Mapping that connects HIV status
  to software flow invariants across all three resilience layers
- `galerina-cpp-bridge.md` — C++ transpilation contract synthesis for hardware-access patterns
- `security-invariants-and-policy-proof.md` — existing security invariant model this extends
- `runtime-trusted-core-design.md` — Sovereign Core software analogue in the runtime
