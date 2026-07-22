# DSS.wasm runtime errors — the stable developer-facing contract

**Status:** contract of record for the `#102`–`#106` runtime. Two surfaces, two maturities:
- **Compile-time** `FUNGI-*` diagnostics (at `galerina build`) — **live today**.
- **Admission** refusal (`CRITICAL_SECURITY_VIOLATION`) — **live today** (`admitAndInstantiate`).
- **Runtime trap → coded, audited event** — the DSS.wasm *contract*: defined in the shipped supervisor
  (`galerina-core-security/src/dss/`) and differential-tested, but it fires as a *classified* code only when
  DSS.wasm is the live supervisor (`#102`). Today a compiled module that hits `unreachable` in the Node
  `WebAssembly` path raises a **raw, unclassified** trap — turning that into a coded, signed AuditEvent is
  exactly the job DSS.wasm does.

---

## The principle: developers see Galerina codes, never raw engine errors

A developer must **never** have to catch a raw Wasmtime/WASM error string. Those are not stable — Wasmtime
rewrites them across versions (it removed `Store::add_fuel` outright; a program that matched on the text
`"out of fuel"` would silently break). A raw engine error also leaks the engine and says nothing about
*governance* — which capability was denied, which invariant failed, whether the audit is durable.

So the **sidecar is the translation boundary**. Every Wasmtime trap, link failure, or admission refusal is
mapped to exactly one stable `FUNGI-*` code and — for a trap — folded into a **signed AuditEvent first**
(`FUNGI-INV-000`, audit-before-anything, `trap-handler.fungi`). The code set below is versioned with
**Galerina, not Wasmtime**, so a program written against it keeps working across engine upgrades — the seam
that lets the engine be replaced underneath without breaking a single `.fungi` program's error handling.

> **Rule (enforced at `#102`):** `dss-host` never returns a `wasmtime::Error`/`Trap` to a caller. It
> classifies it into a code below, emits the AuditEvent, then returns the code. An engine error it cannot
> classify is itself a fault (fail-closed) → `FUNGI-INV-003` (host-supervisor execution failure), never leaked.

---

## Runtime codes — the DSS.wasm trap contract

Grounded in the shipped supervisor. As *classified* codes these land with `#102`; the underlying `unreachable`
already fires today (unclassified) in the Node path.

| Code | Meaning | Origin (`trapKind`) | What the developer does |
|---|---|---|---|
| **FUNGI-INV-000** | Runtime governance violation — a governed effect was attempted without its V_DPM capability bit (`bitAnd(V_DPM, request_mask) == 0`). | `unreachable`, `capability` | Declare the effect in `contract { effects {} }`; the posture matrix denied it. |
| **FUNGI-INV-001** | Pre-condition failed — a `contract { invariant { ensure … } }` was false **before** the body ran. | `unreachable`, `pre` | Fix caller/inputs so the precondition holds; fail-closed by design. |
| **FUNGI-INV-002** | Post-condition failed — an `ensure` was false **after** the body returned. | `unreachable`, `post` | The body violated its own contract; the result was rejected, no effect released. |
| **FUNGI-INV-003** | Host-supervisor execution failure — the DSS caught a trap it could not classify (fail-closed catch-all). | any unmapped `Trap` | File it — an unclassified trap is a supervisor gap; execution was contained + rolled back clean. |
| **FUNGI-FUEL-001** *(reserved)* | Fuel exhausted — the `step` exceeded its `policy::calculateStepFuelLimit` budget (the DoS bound). | `Trap::OutOfFuel` | Raise the step's fuel policy, or split the work; the isolate was discarded + rolled back. |
| **FUNGI-PLUGIN-001** | Plugin not resident — a call reached an evicted/absent plugin. | `unreachable`, `plugin` | Re-assimilate the plugin, or handle absence; deny-by-default when not resident. |

`FUNGI-INV-000/001/002` and `FUNGI-PLUGIN-001` are defined in the shipped supervisor `.fungi`; `FUNGI-INV-003`
is referenced in the DRCM as the containment catch-all; **`FUNGI-FUEL-001` is reserved, not yet minted** — a
dedicated fuel code reads better for developers than `FUNGI-INV-000 + trapKind=fuel`, but minting it is a
registration decision (U6-adjacent), noted here, not taken.

## Admission codes — before a module runs

Admission is attestation-**first** and fail-closed on every branch (`verifyWasm` / `admitAndInstantiate`,
`galerina-core-runtime-wasm`). A refusal throws **`CRITICAL_SECURITY_VIOLATION: <reason>`** — one code, reason
from a closed set:

| Reason | Cause |
|---|---|
| `no attestation provided` | the module arrived without an attestation |
| `attestation hash ≠ binary hash` | the `.wasm` does not match its signed hash (tamper / stale) |
| `signature verification failed` | the signature does not verify over the `#173` domain preimage |
| `certified profile required, attestation is "…"` | a dev-profile artifact reached a certified gate |
| `binary hash not pinned` | the hash is not in the allow-list |
| missing host import (`LinkError`) | the module reached for a capability **outside its closed grant** |

At `#102` the **Rust host re-verifies this per module** (hash + signature over the `#173` preimage — F3), never
"Node already checked"; and the signature floor is **hybrid ML-DSA-65 + Ed25519** (F2, owner-ruled 2026-07-22),
not classical-only.

---

## Why not just surface the Wasmtime error?

Because it couples every Galerina program to the engine forever — the exact 50-year mistake. The U3 fuel-API
rewrite (`add_fuel` → `set_fuel`) is the live proof: engine error/API surfaces move; a program written against
the codes above does not have to. The mapping table is the seam.

---

**Provenance:** verified 2026-07-22 against `galerina-core-security/src/dss/trap-handler.fungi` (FUNGI-INV-000,
FUNGI-PLUGIN-001, the trap→AuditEvent fold), `.../dss/types/trap-signal.fungi` (`trapKind`),
`.../dss/vdpm.fungi` (the capability-bit check → trap), and `galerina-core-runtime-wasm/src/wasm-runtime.ts`
(`verifyWasm`/`admitAndInstantiate`, `CRITICAL_SECURITY_VIOLATION`). Contract of record for `#102`–`#106`;
`FUNGI-INV-003` and `FUNGI-FUEL-001` are reserved (DRCM / not-yet-minted), labelled as such above.
