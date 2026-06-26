# Galerina — Architecture Patterns

**Version:** 1.0 (2026-06-04)  
**Purpose:** Canonical patterns for structuring Galerina programs. Complements `architecture-charter.md` (principles) and `galerina-governance-rules.md` (rules) with concrete, copy-paste-ready structural shapes.

Each pattern has:
- **When to use it** — the situation it solves
- **Structure** — the minimal correct form
- **Rules applied** — which governance rules govern it
- **Common mistakes** — what to avoid

---

## Feature Profile Reference

| Profile | Patterns | Compiles today? |
|---|---|---|
| `drcm_stable_v0` | 1, 2, 3, 5 (and stable portions of 4, 6) | ✅ Yes |
| `drcm_core_v1` | 4 (step), 7, 8, 9 | ⚠️ Requires `@experimental_profile` wrapper |

For forward-looking syntax in examples, wrap with:

```spore
@experimental_profile(name: "drcm_core_v1", status: "planned_phase_5") {
  ;; ... forward syntax here ...
}
```

In `--release` builds, the compiler parses but skips verification of these blocks. Under `--enable-experimental-profile=drcm_core_v1`, full verification runs. Bare `step` without a wrapper emits `SPORE-DRCM-UNSUPPORTED`.

---

## Pattern 1 — Pure Internal Transform

**Use when:** a flow is purely computational — no I/O, no network, no secrets, no mutation. Math functions, string transforms, validation logic, data mapping.

```spore
pure flow scoreToGrade(score: Int) -> String
contract {
  intent { "Convert a numeric score to a letter grade." }
}
{
  if score >= 90 { return "A" }
  if score >= 80 { return "B" }
  if score >= 70 { return "C" }
  return "F"
}
```

**Rules:** S-001, S-002, S-004 (no effects declared = pure)  
**Common mistakes:**
- Adding `request`/`response` blocks (not an API flow — use Pattern 2 for that)
- Calling `AuditLog.write` inside a `pure` flow (immediate `SPORE-EFFECT-003`)
- Using `secure` qualifier when no capability/secrets are needed

---

## Pattern 2 — Governed API Route

**Use when:** a flow handles external HTTP/webhook/event ingress. It accepts untrusted input, validates it, performs business logic, and returns a typed response.

```spore
secure flow createOrder(readonly req: CreateOrderRequest, ctx: RequestContext)
  -> Result<OrderResponse, ApiError>
contract {
  intent { "Accept a validated order request and persist it to the order ledger." }
  request  { accepts json  requires body  validate strict }
  response { returns json  status 201 }
  effects  { db.write, audit.write }
  authority { requires capability.orders.create }
  limits   { memory 32mb  request_time 2s }
  audit    { level standard  event "order.created" }
}
{
  let validated = validate::orderPayload(req.body)
  let order = OrderRepository.persist(validated)
  AuditLog.write("order.created", { order_id: order.id, actor: ctx.actor })
  return Ok(OrderResponse.from(order))
}
```

**Rules:** S-001, S-002, S-003, S-004, C-001, E-001  
**Common mistakes:**
- Omitting `request`/`response` on an API route (required for external flows)
- Omitting `effects` when `db.write` or `audit.write` occurs (SPORE-EFFECT-001)
- Logging the raw request body before sanitizing (potential secret/PII leak)
- Using `pure` when the flow touches a database (SPORE-EFFECT-003)

---

## Pattern 3 — High-Trust Mutation (Payments / Medical / Government)

**Use when:** a flow mutates sensitive state — financial ledger, medical records, government data. Full contract required: authority, effects, privacy, secrets, audit, limits, and invariants (DRCM Phase 2+).

```spore
secure flow transferFunds(
  readonly payload: TransferPayload,
  ctx: RequestContext
) -> Result<TransferReceipt, GovernanceError>
contract {
  intent { "Transfer funds between accounts after verifying balance and actor authorization." }
  authority { requires capability.finance.transfer  signed_by actor.system.payment_agent }
  effects   { ledger.mutate, audit.write, secret.access }
  privacy   { mask payload.account_number  strategy transform.crypto_pseudonymize }
  secrets   { bind "LEDGER_WRITE_KEY" from provider.vault }
  audit     { level cryptographic_state_hash  target storage.tpm_backed_log  track [ effects.mutates ] }
  limits    { memory 64mb  request_time 500ms }
  economics { max_gas 500_units  allocation profile.financial_operations }
  ;; invariant {} is LIVE as of DRCM Phase 2 — no @experimental_profile wrapper needed.
  ;; ensure payload.amount > 0:
  ;;   - Runtime parameter → WAT assertion gate injected (i32.eqz + unreachable)
  ;;   - SPORE-INV-001 fires at compile time if statically provable false
  ;; ensure runtime::getAvailableBalance(...) >= payload.amount:
  ;;   - Function call → runtime-precheck (WAT gate injected)
  invariant {
    ensure payload.amount > 0;
    ensure runtime::getAvailableBalance(payload.from_account) >= payload.amount;
  }
}
{
  let fromBalance = LedgerRepository.getBalance(payload.from_account)
  let toBalance = LedgerRepository.getBalance(payload.to_account)
  let newFrom = fromBalance - payload.amount
  let newTo = toBalance + payload.amount
  LedgerRepository.setBalance(payload.from_account, newFrom)
  LedgerRepository.setBalance(payload.to_account, newTo)
  AuditLog.cryptoWrite("transfer.completed", ctx.actor, payload)
  return Ok(TransferReceipt.new(payload))
}
```

**Rules:** S-001–S-005, C-001–C-005, E-001–E-003, K-004, A-001–A-005  
**Common mistakes:**
- Omitting `privacy {}` on a flow that handles `account_number` (PII/PCI violation)
- Omitting `secrets {}` when calling vault for `LEDGER_WRITE_KEY` (SPORE-SECRET-001)
- Setting `audit.level = standard` on financial mutations (must be `cryptographic_state_hash`)
- Writing `liability {}` manually (always auto-computed — SPORE-GOV-018)
- Not handling the `Err` branch of `LedgerRepository.setBalance`

---

## Pattern 4 — Cross-Boundary Workflow (`step` keyword)

**Use when:** a flow needs to call external services, a payment processor, a third-party API, or any code that runs in a different trust context. Each cross-boundary call gets its own DWI isolate.

> **Note:** `step` is a DRCM Phase 5 (2026-10) feature. Wrap with `@experimental_profile(name: "drcm_core_v1", status: "planned_phase_5") { ... }` until then.

```spore
secure flow fulfillShipment(orderId: String, ctx: RequestContext)
  -> Result<ShipmentConfirmation, LogisticsError>
contract {
  intent { "Trigger fulfillment of a confirmed order via the logistics API." }
  effects { network.outbound, db.write, audit.write }
  authority { requires capability.logistics.dispatch }
  limits    { memory 32mb  request_time 5s }
}
{
  ;; Pure internal logic — same isolate, no step needed
  let order = OrderRepository.findOrFail(orderId)
  let shipPayload = ShipmentMapper.toPayload(order)

  ;; Cross-boundary call — new DWI isolate allocated per step (DRCM Phase 5)
  ;; Requires @experimental_profile(name: "drcm_core_v1", status: "planned_phase_5"):
  @experimental_profile(name: "drcm_core_v1", status: "planned_phase_5") {
    let tracking = step logistics_api::createShipment(shipPayload)
    let confirmation = step logistics_api::confirmDispatch(tracking.id)
  }

  ;; Interim (pre-DRCM): direct call
  let tracking = logistics_api::createShipment(shipPayload)
  let confirmation = logistics_api::confirmDispatch(tracking.id)

  OrderRepository.updateStatus(orderId, "shipped")
  AuditLog.write("shipment.dispatched", { order_id: orderId, tracking: tracking.id })
  return Ok(ShipmentConfirmation.new(tracking, confirmation))
}
```

**Rules:** S-001, S-006, I-001  
**DRCM isolation properties per `step`:**
- 4MB sealed linear memory per isolate
- Immutable serialised input snapshot (no live pointers)
- Fuel budget from `policy::calculateStepFuelLimit`
- Trap on fuel exhaustion → `SPORE-RESOURCE-001`

---

## Pattern 5 — Secret-Using Flow

**Use when:** a flow needs to access a credential (API key, database password, signing key) from `.env`, vault, or KMS.

```spore
secure flow sendPaymentNotification(payload: NotificationPayload) -> Result<Void, NotifyError>
contract {
  intent { "Send a payment confirmation notification via the email gateway." }
  effects { network.outbound }
  secrets { bind "EMAIL_API_KEY" from provider.env }
  limits  { request_time 3s }
}
{
  let apiKey: SecureString = secret.get("EMAIL_API_KEY")

  ;; ❌ WRONG — would trigger SPORE-SECRET-002:
  ;; http.post("https://email.api/send", body: { key: apiKey, to: payload.email })

  ;; ✅ CORRECT — apiKey is passed as a header, not in body; http driver handles auth
  let result = email_gateway::send(payload, auth: apiKey)
  return result
}
```

**Key rule:** `SecureString` cannot flow into log, network body, or serialized records. The compiler catches this at Stage A. `redact()` is the only safe escape.

**Common mistakes:**
- String-interpolating a secret into a log message (SPORE-SECRET-001)
- Including a secret in a JSON body that gets serialized (SPORE-SECRET-003)
- Forgetting that concatenation `"prefix" + apiKey` produces `TaintedString` which inherits all sink restrictions

---

## Pattern 6 — Multi-Tier Governed Service (Full Stack)

**Use when:** designing an entire service — API layer → business logic → data layer. Shows how the patterns compose and where trust boundaries sit.

```
┌─────────────────────────────────────────────────────────┐
│ API LAYER (Pattern 2 — Governed API Route)              │
│                                                         │
│  secure flow createPayment(req, ctx) -> Result<...>     │
│  contract { request {} response {} effects {} audit {} }│
│  { validated = validate(req.body)                       │
│    result = step businessLogic::processPayment(validated)│  ← Pattern 4 (DRCM Phase 5)
│    return result }                                      │
└─────────────────────────────────────────────────────────┘
            │ step (trust boundary)
            ▼
┌─────────────────────────────────────────────────────────┐
│ BUSINESS LOGIC LAYER (Pattern 3 — High-Trust Mutation)  │
│                                                         │
│  secure flow processPayment(p: PaymentPayload)          │
│  contract { authority {} effects { ledger.mutate }      │
│             secrets {} audit { level crypto } }         │
│  { balance = LedgerRepository.getBalance(p.from)        │
│    result = step transferFunds(p)                       │  ← Pattern 4 (inner step)
│    return result }                                      │
└─────────────────────────────────────────────────────────┘
            │ step (trust boundary)
            ▼
┌─────────────────────────────────────────────────────────┐
│ DATA LAYER (Pattern 1 — Pure + Pattern 3 Hybrid)        │
│                                                         │
│  pure flow validateLedgerEntry(e: Entry) -> Bool        │  ← Pattern 1 (pure)
│  secure flow persistLedgerEntry(e: Entry) -> Result<..> │  ← Pattern 3 (mutation)
│  contract { effects { ledger.mutate } secrets { ... } } │
└─────────────────────────────────────────────────────────┘
```

**Key insight:** Each `step` boundary allocates a DWI isolate. The API layer cannot corrupt the business logic layer's state, and the business logic layer cannot corrupt the data layer's state. Failures are contained to the isolate.

---

## Pattern 7 — Governed WASM Module (DRCM)

**Use when:** deploying a full service through the DRCM execution model — DSS supervision, DWI guest isolates, V_DPM monotonic capability management.

> **Note:** All DRCM components are planned (Phase 5, 2026-10). This is the target architecture.

```
Wasmtime binary (TCB)
│
└─ DSS.wasm  ← compiled from dss.spore — the supervisor
     │
     ├─ V_DPM: 0b11111111  (all capabilities active at launch)
     │    Bit 0: network.outbound
     │    Bit 1: storage.write
     │    Bit 2: secret.access
     │    Bit 3: audit.write
     │    ...
     │
     ├─ DWI instance A  ← step api::createPayment(...)
     │    4MB sealed memory
     │    fuel budget: 50,000 instructions
     │    input: immutable snapshot of PaymentPayload
     │
     ├─ DWI instance B  ← step business::processPayment(...)
     │    4MB sealed memory
     │    fuel budget: 100,000 instructions
     │    input: immutable snapshot of ValidatedPayload
     │
     └─ Epilogue Receipt  ← signed by DSS with ML-DSA-65
          H(inputs ‖ outputs ‖ V_DPM_final ‖ timestamp)
```

**Fault behavior:**
- DWI fuel exhausted → `FuelExhaustionFault` (SPORE-RESOURCE-001) → DSS discards isolate, rolls back
- Invariant pre-condition fails → `SPORE-INV-001` → DSS discards isolate, returns error
- Capability violation → DSS traps mid-instruction, drops V_DPM bit → `SPORE-MONO-001`
- Secret in output stream → `SPORE-SECRET-BREACH` (trap 3001) → entire session terminated

---

## Pattern 8 — Emergency Policy Overlay

**Use when:** a service must automatically tighten its own security posture in response to anomalies (unusual memory growth, invariant failures, unexpected exception patterns).

> **Note:** `policy { emergency { ... } }` is DRCM Phase 4 (2026-09).

```spore
;; Requires @experimental_profile(name: "drcm_core_v1", status: "planned_phase_4"):
@experimental_profile(name: "drcm_core_v1", status: "planned_phase_4") {
secure flow monitoredPaymentProcessor(...) -> Result<...>
contract {
  intent { "Process payments with automatic security posture management." }
  effects { ledger.mutate, network.outbound, audit.write }
  policy {
    emergency {
      on invariant_failure {
        deny network.outbound
        require local_only_execution
        audit { level cryptographic_state_hash }
      }
      on memory_pressure_high {
        deny network.outbound
        deny storage.write
        flush ephemeral_scratchpad
      }
      on secret_breach_detected {
        zeroize all_key_material
        terminate execution
        emit audit_final_entry
      }
    }
  }
}
{ ... }
} ;; end @experimental_profile
```

**Monotonic Rule (M-001/M-003):**
- Once `deny network.outbound` fires — it cannot be reversed in this session
- Overlays escalate (Tier 1 tighten → Tier 2 quarantine → Tier 3 zeroize) but never de-escalate
- The service operator must restart a fresh DSS/Wasmtime session to restore full capabilities

---

## Pattern 9 — The .lmanifest (Compliance Evidence)

**Use when:** a compiled artifact needs to carry machine-verifiable proof of its governance properties — for PCI DSS, SOC 2, HIPAA, or government compliance.

> **Note:** `.lmanifest` generation is DRCM Phase 3 (2026-08).

The `.lmanifest` is emitted at compile time alongside the `.wasm` binary. It is signed with Ed25519 + ML-DSA-65 (post-quantum).

```json
{
  "schemaVersion": "spore.manifest.v1",
  "sourceHash": "sha256:3f4a...",
  "derivedConstraints": [
    "CardholderData never_touches TelemetryLog",
    "PAN requires redact() before AuditLog",
    "LEDGER_WRITE_KEY never_reaches network.outbound"
  ],
  "proofObligations": [
    { "flowId": "transferFunds", "invariant": "amount > 0", "verified": "runtime-precheck" },
    { "flowId": "transferFunds", "invariant": "balance >= amount", "verified": "runtime-precheck" }
  ],
  "governanceSignature": {
    "ed25519": "...",
    "mlDsa65": "..."
  },
  "generatedAt": "2026-06-04T10:00:00Z"
}
```

A QSA (Qualified Security Assessor) can verify this file without reading source code. The derived constraints are machine-verifiable proofs from the ProofGraph, not comments.

---

## Quick Selector

| Situation | Pattern | Profile |
|---|---|---|
| Math / transform / pure helper | Pattern 1 — Pure Internal Transform | `drcm_stable_v0` |
| HTTP route / webhook / event handler | Pattern 2 — Governed API Route | `drcm_stable_v0` |
| Financial / medical / government mutation | Pattern 3 — High-Trust Mutation | `drcm_stable_v0` |
| Calling external services / third-party APIs | Pattern 4 — Cross-Boundary Workflow | `drcm_core_v1` |
| Needs a secret / credential | Pattern 5 — Secret-Using Flow | `drcm_stable_v0` |
| Full service with API + business + data layers | Pattern 6 — Multi-Tier Governed Service | `drcm_stable_v0` (partial), `drcm_core_v1` (step calls) |
| WASM deployment with DSS supervision (future) | Pattern 7 — Governed WASM Module | `drcm_core_v1` |
| Auto-tightening security posture (future) | Pattern 8 — Emergency Policy Overlay | `drcm_core_v1` |
| Compliance evidence for auditors | Pattern 9 — The .lmanifest | `drcm_core_v1` |

---

## Cross-References

| Topic | Document |
|---|---|
| Rule registry | `galerina-governance-rules.md` |
| Contract clause reference | `galerina-contract-authoring-guide.md` |
| DRCM architecture | `galerina-deterministic-runtime-containment.md` |
| Architecture principles | `architecture-charter.md` |
| Secrets + epilogue | `galerina-design-secrets-epilogue-blocks.md` |
