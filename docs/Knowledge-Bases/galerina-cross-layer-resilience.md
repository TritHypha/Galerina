# Galerina — Cross-Layer Resilience Matrix (Physical + Mathematical + Economic)

**Status: DESIGN PROPOSAL (2026-06-03)**
The software-side grammar (contract invariants, `on_tamper_signal`, `on_fault_strategy`) is
implementable now using existing extension points. Hardware dispatch requires ASIC co-design
(external §Tail). The ValueGraph resilience tier selection is a near-term runtime inference task.

**Auto-by-default:** The runtime selects the appropriate resilience tier for every flow
automatically from the ValueGraph. A flow processing a $10 query receives Tier 3 bus-scrambling
protection. A $50,000 sovereign transaction receives Tier 1 active-mesh + Universe stratification
enforcement + liability tracking. **Developers declare nothing for standard workloads.** The same
auto-by-default dual-mode principle governs all resilience declarations — see
`galerina-contract-economics.md` for the canonical description of this pattern.

---

## 1. The Problem: Siloed Security

Conventional security stacks operate in independent layers that do not communicate with each
other:

- A hardware fault injection attack corrupts a register, but the software stack sees a normal
  value (the corruption happened below the OS abstraction boundary) and continues processing.
- A type-system paradox (Girard's Paradox via a self-referential type) proves `Void` at the
  language level, but the hardware continues executing instructions normally — it has no concept
  of logical consistency.
- A governance budget overrun (a flow exceeding its `economics {}` cap) may trigger an audit
  event, but if the hardware is under fault injection, the audit event itself may be corrupted.

In each case, the layers are **locally unaware of failures in adjacent layers**. An adversary
who can attack one layer in isolation can often leverage that foothold to make the other layers
appear clean.

---

## 2. The Solution: Bi-Directional Invariant Cross-Check

The Cross-Layer Resilience Matrix replaces siloed security with **bi-directional invariant
propagation**: a failure detected at any layer immediately echoes to all other layers.

```
PHYSICAL (ASIC)
  detects: bit-flip via lockstep divergence (HIV Bit 3 = 1)
  echoes to: Mathematical layer → invalidates Universe type bounds for all active flows
  echoes to: Economic layer → triggers economics { on_tamper zeroize } across affected contracts

MATHEMATICAL (AST / type system)
  detects: Girard's Paradox construction (Universe stratification violation, SPORE-UNIV-001)
  echoes to: Physical layer → halts hardware execution of the offending flow
  echoes to: Economic layer → logs attempted type-level exploit to immutable audit trail

ECONOMIC (governance contract)
  detects: budget overrun (flow exceeds economics { max_compute_cost } declaration)
  echoes to: Physical layer → demotes flow to lower hardware tier (removes active-mesh access)
  echoes to: Mathematical layer → quarantines flow's data (marks outputs as Unverified_Raw)
```

This means the security posture of each layer is **co-dependent** on the health of the others.
An adversary cannot succeed by attacking a single layer in isolation — they must simultaneously
defeat all three.

---

## 3. Physical Invariant Mapping

The Physical Invariant Mapping is the mechanism by which software flows **demand proof of
hardware integrity** before processing governed data.

A flow with a physical invariant asserts:

```galerina
pure flow processSettlement(order: SettlementOrder) -> SettlementReceipt
contract {
  intent { "Process a financial settlement — requires pristine hardware integrity." }
  invariant {
    ensure Hardware.readIntegrityVector() == HardwareStatus.PRISTINE
  }
  target {
    preferred_execution hardware
    cyber_physical_hardening {
      on_tamper_signal zeroize
    }
  }
}
decreases order.itemCount
{
  // body only executes if HIV == PRISTINE; otherwise invariant failure → contract violation
  ...
}
```

The `invariant { ensure Hardware.readIntegrityVector() == HardwareStatus.PRISTINE }` pattern
is the software-side assertion of the Hardware Integrity Vector (HIV) — the 4-bit read-only
status register described in `galerina-asic-cyber-physical.md` §3.

On non-ASIC targets (development machines, cloud VMs), `Hardware.readIntegrityVector()` returns
`HardwareStatus.PRISTINE` from a WASI shim, making the invariant trivially true. The invariant
becomes meaningful only when the flow is deployed to an ASIC target that populates the HIV from
real tamper-detection circuits.

---

## 4. Asymmetric State Compartmentalization

The resilience matrix divides execution state into two compartments with different mutability
and access rules:

### 4.1 Ephemeral Scratchpad

- **Location:** WASM linear memory (standard heap and stack)
- **Mutability:** read-write; mutable by application flows
- **Governance:** deny-by-default access from external flows (capability-gated via WASI)
- **Lifetime:** zero-filled on flow exit (same guarantee as C++ RAII scoped allocation, see
  `galerina-cpp-bridge.md` §3.1)
- **Use:** intermediate computation, local variables, in-flight results before commitment

Zero-fill on exit is enforced at the WASM module boundary. A flow that exits (normally or via
panic/error) cannot leave residual secret data in its linear memory for a subsequent flow to
read. This closes a class of side-channel attacks that exploit memory reuse patterns.

### 4.2 Immutable Governance Plane

- **Location:** ASIC active-mesh zone (Tier 1 Sovereign Core, see `galerina-asic-cyber-physical.md`)
- **Mutability:** read-only to application flows; writable only by the runtime's identity
  provisioning system at boot time and key-rotation events
- **Access:** only via typed gateway functions — direct pointer access is not possible
- **Contents:** cryptographic identity roots, ProofGraph verification keys, contract templates,
  policy roots

The Immutable Governance Plane is the "source of truth" that all three layers consult when
making trust decisions. Because it lives in the active-mesh zone with hardware write protection,
a software exploit that compromises application-level code cannot alter the governance rules —
the governance plane is physically write-protected.

---

## 5. Self-Healing Zeroization Protocol

The zeroization protocol is a **contract-declared, hardware-enforced** response to tamper events
that spans all three resilience layers:

```galerina
// Declared in a sovereign flow's contract; enforced by the runtime and ASIC hardware
contract {
  target {
    cyber_physical_hardening {
      on_tamper_signal     zeroize
      on_fault_strategy    defend_and_terminate
    }
  }
}
```

### Protocol sequence on `on_tamper_signal zeroize`:

1. **Physical:** ASIC tamper circuit detects event (HIV bit set). Tier 1 registers zeroized
   within one clock cycle.
2. **Mathematical:** Runtime invalidates all `Universe<2>` (governance) type bindings for
   flows executing under the affected identity root. Any pending ProofGraph verification passes
   are aborted.
3. **Economic:** All `economics {}` budgets for the affected flows are marked as "tamper-
   invalidated" in the audit trail. Any pending settlement or resource allocation is rolled back.
4. **Audit:** A final immutable audit record is written to non-volatile storage before the
   zeroization propagates to the audit subsystem itself.

### `on_fault_strategy defend_and_terminate`:

Used when the fault is non-catastrophic (Tier 2 response level — see
`galerina-asic-cyber-physical.md` §6). The flow is terminated cleanly (all resources released,
all open write transactions rolled back) rather than being allowed to continue in a potentially
corrupted state. The `defend` phase demotes capabilities before termination, ensuring the flow
cannot make outbound network calls or write to external storage in its final moments.

---

## 6. Resilience Tier Mapping (Auto-by-Default)

The runtime maps each flow to a resilience tier based on the ValueGraph classification of the
data it processes. This mapping is automatic — the developer declares nothing for standard
workloads.

| ValueGraph Classification | Resilience Tier | Physical | Mathematical | Economic |
|--------------------------|----------------|----------|--------------|----------|
| Low-value query (< £1) | Tier 3 | Bus scrambling, MEE | Universe<0–1> bounds | Basic economics budget |
| Standard API flow (£1–£1,000) | Tier 2 | DTI + constant-time | Universe<0–2> bounds | Full economics + epilogue sha256 |
| Governed sovereign flow (> £1,000) | Tier 1 | Active mesh + lockstep | Full Universe stratification + termination proofs | economics + zk_snark_receipt + liability |

The tier thresholds shown are **illustrative defaults derived from the ValueGraph breach-risk /
asset-weight classification** — they are not hardcoded. Profiles can set different thresholds.
This follows the same editorial principle stated in `galerina-design-secrets-epilogue-blocks.md` §0.

---

## 7. Cross-Layer Failure Scenarios

### 7.1 Fault Injection Detected During Cryptographic Key Operation

- **Physical:** HIV Bit 2 (Voltage Fault) set during AES key schedule computation.
- **Mathematical:** Physical invariant check fails → `contract.invariant` violation raised in
  the affected flow → flow exits with a `HardwareIntegrityError` before producing output.
- **Economic:** `economics { on_tamper zeroize }` fires → compute budget for this flow instance
  is logged as "fault-invalidated, output suppressed" in the audit trail.
- **Net result:** the adversary receives no output; the fault event is recorded; the flow is
  retried from a clean state on an alternative execution path (if declared in the contract).

### 7.2 Type-Level Exploit Attempt (Universe Violation)

- **Mathematical:** Compiler catches SPORE-UNIV-001 (self-referential type) at compile time.
  The exploit never reaches the runtime.
- **Physical:** No hardware event — the attack was neutralized before execution.
- **Economic:** Compile-time rejection is logged to the CI/CD audit trail as a governance event.
  If the violation was in a deployed package (runtime type injection), the runtime halts the
  affected flow instance and logs the event.
- **Net result:** Girard's Paradox cannot be constructed; ProofGraph receipts remain consistent.

### 7.3 Economics Budget Overrun in a Tier 1 Sovereign Flow

- **Economic:** `economics { max_compute_cost "£0.50" }` exceeded. Runtime raises
  `EconomicsOverrunError`.
- **Mathematical:** The flow's output type is downgraded to `Unverified_Raw` — the output
  cannot be used in a governed context without passing through a Linear Gateway Transformation
  (SPORE-GATE-* pattern). The taint monotonicity rule (see `galerina-fortified-typed-logic.md` §4)
  ensures this cannot be silently circumvented.
- **Physical:** The flow's hardware tier is demoted (active-mesh access withdrawn). If the flow
  attempts to continue executing at Tier 1, the capability gate check fails.
- **Net result:** the flow cannot produce a trusted output; the overrun is auditable evidence
  of a potential resource-exhaustion attack.

---

## 8. Implementation Phasing

| Phase | Work | Implementable now? |
|-------|------|--------------------|
| `on_tamper_signal` + `on_fault_strategy` grammar in `target {}` | Parser extension | Yes |
| `Hardware.readIntegrityVector()` WASI shim (returns PRISTINE on non-ASIC) | WASI host function stub | Yes |
| Physical Invariant Mapping in flow invariant checker | Extend `checkValueStates` | Yes |
| ValueGraph → resilience tier mapping (auto-by-default runtime inference) | Runtime inference layer | Yes |
| Zero-fill of WASM linear memory on flow exit | WASM runtime modification | Near-term |
| Immutable Governance Plane (actual ASIC active-mesh write protection) | ASIC co-design | External §Tail |
| Cross-layer failure propagation (physical → mathematical echo) | Runtime event bus | Near-term |
| HIV real hardware population | ASIC co-design | External §Tail |

---

## 9. Related Documents

- `galerina-asic-cyber-physical.md` — Physical shielding tier detail (HIV, three tiers, tamper
  response strategy, `cyber_physical_hardening {}` contract sub-block)
- `galerina-fortified-typed-logic.md` — Mathematical layer (Universe stratification, termination
  proofs, taint monotonicity) that the cross-layer matrix coordinates with
- `galerina-contract-economics.md` — Economic layer (ValueGraph, CostGraph, `economics {}`
  auto-by-default block) that forms the third axis of the resilience matrix
- `galerina-design-secrets-epilogue-blocks.md` — `secrets {}` and `epilogue {}` dual-mode
  pattern; `on_tamper_signal` contract field follows the same auto-by-default principle
- `galerina-zk-proof-plan.md` — `epilogue { generate_proof zk_snark_receipt }` produces the
  cryptographic proof receipts that the Economic layer uses as audit evidence
- `trust-conversion-model.md` — taint propagation model that the Mathematical layer's
  cross-layer quarantine mechanism uses
- `runtime-trusted-core-design.md` — software analogue of the Immutable Governance Plane
- `security-invariants-and-policy-proof.md` — existing invariant model this matrix extends
- `memory-pressure-security.md` — ephemeral scratchpad zero-fill security model
