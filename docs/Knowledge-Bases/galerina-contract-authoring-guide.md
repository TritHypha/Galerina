# Galerina — Contract Authoring Guide (the canonical reference for AI + humans)

**This is the authoritative reference for writing a correct Galerina `contract { }`.** AI tools
generating Galerina, and humans reviewing it, should follow this. It corrects the common
mistakes of treating `types` / `request` / `response` as globally mandatory, and of letting an
AI silently widen its own authority/effects/secrets.

## ⚠️ Syntax: contract {} is OUTSIDE the body — not inside it

This is the most common mistake made by AI tools and developers coming from TypeScript/Go/Rust.

```galerina
// ✅ CORRECT — contract between signature and body
pure flow greet(name: String) -> String
contract {
  intent { "Greet the user." }
}
{
  return "Hello, " + name
}

// ❌ WRONG — contract inside body (old syntax, AI default, does not work)
pure flow greet(name: String) -> String {
  contract {
    intent { "Greet the user." }
  }
  return "Hello, " + name
}
```

The `contract {}` block is a **compile-time declaration** — the compiler reads it before any code runs. It belongs between the flow signature and the body `{ }`, not inside the body. Think of it like a Rust `#[attribute]` or Java `@Annotation` — it annotates the function, it is not part of the function body.

**Pattern to remember — three-block structure:**
```
flow-qualifier flow name(params) -> ReturnType   ← signature
contract { ... }                                  ← compile-time declaration
policy { ... }                                    ← runtime monotonic overlay (optional, DRCM Phase 4)
{                                                 ← body opens here
  ...runtime code...
}
```

The `policy {}` block is **optional** and **separate from `contract {}`**. It is NOT a sub-block inside `contract {}`. It sits between the contract declaration and the body, and contains runtime monotonic overlay rules (`emergency { on anomaly { deny ... } }`). Most flows will never declare a `policy {}` block — the runtime uses defaults. Only flows that need explicit emergency posture management (financial services, critical infrastructure) declare it explicitly.

```spore
// ✅ CORRECT — policy {} as its own separate block, between contract and body
secure flow assessRisk(input: RiskRequest) -> Result<RiskResult, Fault>
contract {
  intent { "Assess transaction risk with automatic posture management." }
  effects { database.read, network.outbound }
}
policy {
  emergency {
    on system_integrity_anomaly {
      deny network.outbound
      require local_only_execution
    }
  }
}
{
  // body
}

// ❌ WRONG — policy {} inside contract {}
secure flow assessRisk(input: RiskRequest) -> Result<RiskResult, Fault>
contract {
  intent { "..." }
  effects { database.read }
  policy {               // ← parse error: policy is not a contract sub-block
    emergency { ... }
  }
}
{ ... }
```

## The single most important rule (AI safety)

**An AI may only PROPOSE a widening of `authority`, `effects`, or `secrets`. It must never
apply one itself.** Auto-expanding these is the definition of **privilege escalation**.
The pipeline is **propose → verify → approve**:
1. **AI proposes** — writes the change to a `*.galerina.proposal` artifact, never to a production
   `.galerina` file.
2. **Compiler verifies** — `galerina --check-proposal` hard-errors if a proposed `effects` block
   doesn't match the function's actual AST (you can't declare an effect the code doesn't do, or
   omit one it does).
3. **Policy engine authorizes** — rejects proposals that cross global boundaries (e.g. adding a
   `network allow` to an internal crypto module).
4. **Human approves** — a developer/security engineer signs off, promoting the proposal to a
   production `.galerina`.

**Intent-drift guard:** because `intent` is required for secure governed flows, validate that an
`intent` block is strictly **descriptive declarative prose** — zero logic primitives, URLs, or
variable references (prevents prompt-injection from smuggling behavior into the intent string).

## The corrected contract lifecycle — which clauses, when

Nothing here is *globally* mandatory. Requirement depends on the **flow kind** and **policy**.

| Clause | Status | Role | Notes for AI / runtime / governance |
|---|---|---|---|
| `types` | **Optional** | flow-local type aliases/records | omit for primitive/pure flows or when using global types |
| `intent` | **Recommended; required for secure governed flows** | human-readable purpose | **required for AI-generated flows** — grounds the model + gives reviewers an audit path |
| `request` | **Required for API/route flows only** | accepted input shape | **omit for internal/pure functions** |
| `response` | **Required for API/route flows only** | output policy | **omit for internal/pure functions** |
| `effects` | **Required iff side effects exist** | allowed side effects | **deny-by-default: omitted ⇒ strictly pure.** AI may propose additions; human approves |
| `authority` | Optional / required by policy | actor/capability requirements | must match or *restrict* ambient runtime settings, never widen silently |
| `privacy` | Optional / required when sensitive data exists | PII/PHI/redaction rules | masking before data leaves the trust boundary |
| `secrets` | **Optional, auto-by-default** | sealed credential handles/providers | omitted ⇒ runtime handles config via standard env (`.env`) automatically; ephemeral, never logged |
| `audit` | Optional / required by policy | audit obligations | omit for a standard web API; mandatory + detailed for healthcare/banking |
| `limits` | Optional / policy default | runtime safety bounds (CPU/mem/time) | overrides or inherits global defaults |
| `economics` | **Optional, auto-by-default** | cost/resource budget | auto-inferred from CostGraph/ValueGraph when omitted |
| `epilogue` | **Optional, auto-by-default** | post-exec proof strategy | auto-tier from value when omitted; declare to pin a strategy |
| `targets` | Optional | execution preference/fallback | hardware/TEE/WASM isolation hints; never grants authority |
| `invariant` | **Optional / required for high-trust mutation flows** | pre/post condition assertions | evaluated before AND after the body; violations raise SPORE-INV-001 (pre) / SPORE-INV-002 (post); uses `ensure` keyword |
| `cyber_physical_hardening` | **Strongly discouraged unless Tier 1 ASIC** | physical shielding directives | auto-selected by runtime from ValueGraph. Only declare with high `economics.max_risk_liability` AND physical ASIC hardware. SPORE-GOV-017 warns if declared without need. |
| `liability` | **NEVER write manually** | max legal/financial exposure | auto-calculated by governance verifier from breach-risk matrix → stored in ProofGraph. SPORE-GOV-018 warns if declared in source. |

## Decision guide by flow kind

- **Pure / internal flow** (a math transform, a helper, an internal pipeline step):
  `intent` (if secure/governed) + `types` (if it needs local types). **No `request`/`response`,
  no `effects`** (it's pure). Don't carry API routing baggage.
- **API / route flow** (external ingress/egress): add `request` + `response`. Add `effects`
  for any side effects, `limits`, and `audit`/`privacy` per policy.
- **High-trust mutation** (medical ledger, billing, gov record): the full set —
  `authority` + `effects` (explicit) + `privacy` + `secrets` + mandatory `audit` + `limits` +
  `economics`.
- **Sovereign / defense-grade flow** (Tier 1 ASIC): `cyber_physical_hardening {}` **may**
  be declared when `economics.max_risk_liability` is high **AND** physical ASIC hardware is
  confirmed. Under no other circumstance. Even here the runtime can auto-select the correct
  tier from the ValueGraph — explicit declaration is only required when a regulatory mandate
  demands attestation proof in the ProofGraph.

## Verified-minimal templates (these compile — Stage-A ACCEPT)

Pure/internal flow — minimal governed contract, no API baggage, no effects:
```galerina
pure flow classify(score: Int) -> Verdict
contract {
  types { type Verdict = Result<String, String> }
  intent { "Classify a score, returning Ok(label) or Err(reason)." }
}
{
  if score < 0 { return Err("negative") }
  if score >= 50 { return Ok("pass") }
  return Ok("fail")
}
```

Secure flow with an effect (deny-by-default ⇒ `effects` only because it writes audit):
```galerina
secure flow recordAmount(amount: Int) -> Result<Int, String>
contract {
  intent { "Record an amount to the audit log." }
  effects { audit.write }
}
{
  AuditLog.write("amount recorded")
  return Ok(amount)
}
```
(More verified flows: `tests/r6-corpus/r6-00N-*.spore`.)

## Reference blueprints (authoritative STRUCTURE; some syntax illustrative/forward)

> These show the *shape* of correct contracts. A few constructs are forward/aspirational and may
> not compile in today's Stage-A (e.g. inline `type X { ... }` records that don't yet unify
> nominally, `mutates state.x`, `network allow "..."`, `bind "KEY" from provider.vault`,
> `max_gas 500_units`). Treat the structure as canonical; use the verified-minimal templates above
> for guaranteed-compiling code.

### A. Hardened API route — safe input parsing
```galerina
// contract {} is OUTSIDE the body — between signature and { body }
secure flow parseInput(readonly request: Request) -> ParseInputResult
contract {
  types {
    type RawInput { data: String }
    type ParsedOutput { tokens: Array<String> }
    type ParseInputResult = Result<ParsedOutput, ApiError>
  }
  intent   { "Parse untrusted input into a token list." }
  request  { accepts json  requires body }      // required: this is an API/route flow
  response { returns json }                      // required: API/route flow
  limits   { memory 16mb  request_time 1s }
  // audit omitted: standard web API, no specialized logging needed
}
{
  unsafe let rawBody: String = request.body
  unsafe let decoded = json.decode<RawInput>(rawBody)
  match decoded {
    Ok(inputUnsafe) => {
      let inputSafe: RawInput = validate.rawInput(inputUnsafe)
      return Ok(ParsedOutput { tokens: String.split(inputSafe.data, " ") })
    }
    Err(error) => { return Err(ApiError.BadRequest) }
  }
}
```

### B. Governed high-trust mutation — medical ledger
```galerina
// contract {} is OUTSIDE the body — between signature and { body }
secure flow recordMedicalTransaction(readonly inputPayload: MedicalPayload) -> TransactionResult
contract {
  types {
    type MedicalPayload { patient_id: String  treatment_code: String  billing_amount: Int64 }
    type TransactionResult = Result<String, GovernanceError>
  }
  intent { "Record an encrypted billing event to the ledger and verify actor authorization." }
  // internal pipeline invocation: request/response omitted (not an external route)
  authority { requires capability.billing.mutate  signed_by actor.system.billing_agent }
  effects   { mutates state.billing.ledger  network allow "vault.internal.net:8200" }
  privacy   { mask patient_id  strategy transform.crypto_pseudonymize }
  secrets   { bind "LEDGER_WRITE_KEY" from provider.vault }
  audit     { level cryptographic_state_hash  target storage.tpm_backed_log  track [ effects.mutates ] }
  limits    { memory 64mb  request_time 500ms }
  economics { max_gas 500_units  allocation profile.billing_operations }
}
{
  // compiler enforces: only state.billing.ledger may mutate; only vault.internal.net reachable.
}
```

## ⚠️ Two distinct "policy" concepts — never confuse them

### 1. Domain Guard Policy (external anchor — task #56)

A **Domain Guard Policy** is defined in an **external file** (`governance/policies/`), not in the flow. It sets an immutable ceiling on what any flow's contract is allowed to declare. The contract binds to it via `[conforms_to: PolicyName]` — a decorator on the `contract` block header.

```spore
;; External file: governance/policies/invoicing_guard.spore
policy InvoicingDomainGuard {
  permitted_effects { gateway.charge, audit.write }
  enforced_limits   { max_memory_ceiling: 4MB }
}

;; Local flow file — contract [conforms_to: ...] references the external policy
secure flow processInvoice(merchantId: String) -> Result<Void, Fault>
contract [conforms_to: InvoicingDomainGuard] {
  intent   { "Process billing under strict domain lockdowns." }
  effects  { gateway.charge }   ;; validated against InvoicingDomainGuard ✅
  limits   { max_memory: 4MB }  ;; validated against InvoicingDomainGuard ✅
}
{
  return Ok(Void)
}
```

The `[conforms_to: X]` is a decorator on the contract block header — NOT a sub-block inside `contract {}`, and NOT a separate outer block.

> Full reference: `galerina-domain-guard-policies.md`

---

### 2. Emergency Policy Overlay (inline block between contract and body — DRCM Phase 4)

An **Emergency Policy Overlay** is a per-flow, inline block that sits between `contract {}` and `{ body }`. It declares runtime monotonic security responses to anomalies. Most flows never use this.

```spore
secure flow assessRisk(input: RiskRequest) -> RiskResult
contract {
  intent  { "Assess risk with emergency posture management." }
  effects { database.read, network.outbound }
}
policy {
  emergency {
    on system_integrity_anomaly {
      deny network.outbound
      require local_only_execution
    }
  }
}
{
  // body
}
```

This `policy {}` is NOT a contract sub-block. It is NOT a domain guard. It is NOT external. It is an inline runtime overlay block, separate from `contract {}`, defined per-flow.

---

## `invariant {}` — pre/post condition assertions (DRCM Module 2)

`invariant {}` is an **optional sub-block inside `contract {}`** — it sits alongside `intent` and `effects`. It contains one or more `ensure` expressions that are checked **before the body executes** (pre-condition → `SPORE-INV-001`) and **after the body returns** (post-condition → `SPORE-INV-002`).

```galerina
// ✅ CORRECT — invariant inside contract block
secure flow processTransaction(walletId: String, amount: U64) -> Result<Void, Fault>
contract {
  intent { "Transfer funds securely while verifying balance constraints." }
  effects { ledger.mutate }
  invariant {
    ensure amount > 0;
    ensure runtime::getAvailableBalance(walletId) >= amount;
  }
}
{
  // body executes here — within a DWI isolate under DRCM
}
```

**Rules:**
- `ensure` expressions must be **simple, evaluable expressions** — not theorem prover calls. The runtime evaluates them directly.
- Complex arithmetic invariants (`ensure ledger.credits == ledger.debits`) will be static (Phase 4 SMT solver). For now, use runtime-evaluable guards.
- `SPORE-INV-001` fires when a pre-condition fails; execution aborts before the body runs.
- `SPORE-INV-002` fires when a post-condition fails; execution aborts before the result is returned.
- For AI generation: add `invariant {}` to any high-trust mutation flow (payments, medical, government records). Plain internal/pure flows do not need it.

> **Note:** `invariant {}` is a DRCM Phase 2 feature — the parser, governance verifier, and WAT gate injection are scheduled for 2026-07. The clause is documented here now so AI tools and developers write it correctly when the compiler supports it.

---

## `step` keyword — cross-trust-boundary DWI isolate allocation

`step` is used in the **flow body** (not the contract block) to cross a trust boundary. Every `step` call allocates a fresh **DWI (Deterministic Workflow Isolate)** — a shared-nothing WASM linear memory instance with fuel injection and no live pointer transfer.

```galerina
secure flow processOrder(orderId: String) -> Result<Void, Fault>
contract {
  intent { "Process an order and transmit to payment network." }
  effects { network.outbound, ledger.mutate }
}
{
  // Pure internal logic — no step needed (same isolate)
  let sanitizedId = internal_utils::clean(orderId);

  // Trust boundary: external network sink — use step
  let paymentResult = step network_client::transmitOrder(sanitizedId);

  return paymentResult;
}
```

**When to use `step`:**
- Calls to external subsystems (network, databases, third-party APIs)
- Multi-tenant dependencies
- Any state-mutating operation that must be isolated from the calling context

**When NOT to use `step`:**
- Pure internal helpers within the same flow's trust domain
- Pure math / transform functions

**Cost:** Each `step` allocates a new WASM linear memory segment (max 4MB) and fuel counter. The input is transferred as an immutable serialised snapshot — no live pointers cross the boundary. If fuel is exhausted → `FuelExhaustionFault`. If capability is violated → DSS traps immediately.

> **Note:** `step` is a DRCM Phase 5 feature — parser and ManagedStep AST node are scheduled for 2026-10.

---

## Quick checklist for AI generation

- [ ] `intent` present (descriptive prose only) for any secure/governed flow.
- [ ] `request`/`response` **only** if it's an API/route flow — never on pure/internal flows.
- [ ] `effects` lists **exactly** the side effects the body performs (deny-by-default; none ⇒ omit).
- [ ] Never widen `authority`/`effects`/`secrets` automatically — emit a `*.galerina.proposal` instead.
- [ ] `types` only when the flow needs local aliases/records.
- [ ] High-trust data ⇒ add `privacy` + `audit` (+ `secrets` for credentials).
- [ ] High-trust **mutation** flows ⇒ add `invariant { ensure ... }` inside `contract {}` for pre/post guards.
- [ ] Use `step` in the flow body (not the contract) for every cross-trust-boundary call.
- [ ] Leave `economics`/`secrets`/`epilogue` out unless overriding the auto behavior.
- [ ] `cyber_physical_hardening {}` — **do NOT write** unless on Tier 1 ASIC hardware with
  a regulatory mandate requiring attestation proof. Runtime auto-selects the tier from
  the ValueGraph. Writing this on a low-risk flow triggers **SPORE-GOV-017**.
- [ ] `liability {}` — **never write in source**. Auto-calculated by the governance verifier
  from the ValueGraph breach-risk matrix and stored in the ProofGraph. Writing it manually
  triggers **SPORE-GOV-018**.
