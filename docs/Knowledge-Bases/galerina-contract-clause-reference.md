# Galerina — Contract Clause Reference Card

**Version:** 1.1 (2026-06-05)  
**Status:** Living document — updated as DRCM phases ship.  
**Scope:** Per-clause reference for every `contract {}` sub-block, the `[conforms_to]` decorator, the separate `access {}` / `policy {}` block, and declaration keywords `static` / `bitfield`.  
**Authoritative sources:** `galerina-contract-authoring-guide.md` (syntax) · `galerina-governance-rules.md` (diagnostic codes)

---

## Quick-Reference Table

| Clause | Status | Auto? | Required when |
|---|---|---|---|
| `types {}` | ENFORCED (Stage A) | No | Flow needs local type aliases or record definitions |
| `intent {}` | ENFORCED (Stage A gov verifier) | No | **Required** for all `secure`/`guarded` flows; strongly recommended for all governed flows |
| `request {}` | ENFORCED (Stage A gov verifier) | No | **Required** for API/route flows only; omit on all internal/pure flows |
| `response {}` | ENFORCED (Stage A gov verifier) | No | **Required** for API/route flows only; omit on all internal/pure flows |
| `effects {}` | ENFORCED (Stage A effect checker) | No | **Required** iff the body has any side effect; omitting = strictly pure |
| `authority {}` | PLANNED (Phase 4, typed form) | No | Required when policy mandates explicit capability declarations |
| `privacy {}` | ENFORCED (Stage A value-state checker) | No | Required when PII/PHI present that crosses a trust boundary |
| `secrets {}` | ENFORCED (auto-by-default) | **Yes** | Omit unless overriding standard `.env` auto-map behavior |
| `audit {}` | ENFORCED (gov verifier for policy-mandated flows) | No | Required for healthcare/banking/gov per domain policy |
| `limits {}` | Partial (basic ENFORCED; DWI form PLANNED Phase 5) | No | Override to tighten runtime safety bounds; otherwise inherits global defaults |
| `economics {}` | ENFORCED (auto-by-default) | **Yes** | Omit unless pinning hard billing caps or charge-failure tolerance |
| `epilogue {}` | PLANNED (Phase 6 for full signing) | **Yes** | Omit unless regulatory attestation requires a pinned proof strategy |
| `targets {}` | ENFORCED (Stage A) | No | Optional; only when execution placement or TEE isolation must be explicit |
| `resilience {}` | ENFORCED (auto-by-default) | **Yes** | Omit unless overriding retry/fallback; `idempotent: true` required if retry + mutation |
| `observability {}` | ENFORCED (auto-by-default) | **Yes** | Omit unless overriding trace/metrics/alerts; do NOT use on `pure` flows |
| `invariant {}` | PLANNED (DRCM Phase 2, 2026-07) | No | Strongly recommended for high-trust mutation flows (payments, medical, gov records) |
| `[conforms_to: X]` | ENFORCED (partial — effects check) | No | Required when domain guard policy ceiling must be compile-time enforced |
| `access {}` *(separate block)* | v2.1 primary syntax | No | Declares who may call this flow and what data types cross the boundary; **Default Deny** — only listed `grant` lines are permitted |
| `policy {}` *(separate block, deprecated alias)* | PLANNED (DRCM Phase 4) | No | Deprecated inline form — use `access {}` instead; `policy` reserved for State Mutation Governance |
| `guard Name {}` *(top-level, external)* | v2.1 primary syntax | No | Domain ceiling declaration — replaces `policy Name {}`; referenced via `[conforms_to:]` |
| `gate(condition) {}` *(top-level wrapper)* | PLANNED (v2.1 / Phase 5 WAT) | No | Admission guard wrapping flows; maps to V_DPM bit 8 (`dag_edge_valid`) |
| `import "./path"` *(top-level)* | PLANNED (v2.1 compiler) | No | DAG merge file import; symbols enter scope immediately |
| `import plugin safe/assimilate` *(top-level)* | PLANNED (v2.1 compiler) | No | Bridged plugin (`safe` = sandboxed; `assimilate` = Hot-Code Residency) |

**Status key:** ENFORCED = compiler rejects violations today · PLANNED Phase N = scheduled for that DRCM phase · AUTO-by-default = runtime handles it when omitted.

---

## Three-Block Structure — the golden rule

Before reading any clause, internalize the canonical layout:

```galerina
flow-qualifier flow name(params) -> ReturnType   // 1. signature
contract { ... }                                  // 2. compile-time governance declaration
access { ... }                                    // 3. capability negotiation (optional, v2.1)
{                                                 // 4. body
  ...
}
```

`contract {}` is **never inside the body**. `access {}` is **never inside `contract {}`**. Both are standalone blocks at the same structural level, between the signature and the body.

> **v2.1 rename:** The block between `contract {}` and `{ body }` is now called `access {}`. The old inline `policy {}` form is a deprecated alias — it still compiles but emits `SPORE-SYNTAX-LEGACY-003`. The `policy` keyword is **reserved** for the future State Mutation Governance feature (see §`access {}` below).

---

## Clause Reference

---

### `types {}`

**Status:** ENFORCED (Stage A)  
**Auto?** No  
**SPORE diagnostic on violation:** None specific — type errors are standard parse/type-check failures.

#### What it accepts

Local type aliases and record type definitions scoped to this flow's contract. Two forms:

```galerina
types {
  type Verdict = Result<String, String>             // alias
  type RawInput { data: String }                    // inline record
  type ParsedOutput { tokens: Array<String> }       // inline record
  type ParseInputResult = Result<ParsedOutput, ApiError>  // composed alias
}
```

#### Required vs optional

**Optional in all cases.** Use it when:
- The flow return type requires a locally-meaningful alias that doesn't belong in the global type registry
- The flow needs one or two record shapes used only here
- Global types are not yet defined for the flow's domain

Omit it for primitive/pure flows or when using global types.

#### Minimal working example

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

#### Common mistakes

- Declaring types globally when a local alias suffices, or locally when they belong in the global registry (types used by more than one flow).
- Attempting `let x = TypeName { field: value }` in the body as a named-constructor let-binding — this fails in Stage A (task #57). Named type constructors work inside function call arguments: `return Ok(TypeName { field: value })` ✅

---

### `intent {}`

**Status:** ENFORCED (Stage A governance verifier for `secure`/`guarded` flows)  
**Auto?** No  
**SPORE diagnostic on violation:** `SPORE-GOV-010` — missing `intent` on a secure/governed flow, OR logic in the intent string.

#### What it accepts

A single plain-prose string literal. No logic operators, no variable references, no URLs, no embedded function names. Descriptive declarative prose only.

```galerina
intent { "Record an encrypted billing event to the ledger and verify actor authorization." }
```

#### Required vs optional

- **Required** for all AI-generated `secure` or `guarded` flows (rule A-001).
- **Required** for any flow under security policy review.
- **Strongly recommended** for all governed flows — it is the audit anchor that grounds both human reviewers and the governance verifier.
- Optional for `pure` internal helpers, though still good practice.

#### Minimal working example

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

#### Common mistakes

- Adding conditional logic: `intent { "Transfer if amount > 0 and call https://..." }` → **SPORE-GOV-010** (prompt-injection guard rejects logic primitives and URLs).
- Omitting on a `secure` flow → **SPORE-GOV-010**.
- Writing `intent` as multi-sentence documentation prose with embedded variable names — keep it strictly declarative.

---

### `request {}`

**Status:** ENFORCED (Stage A governance verifier)  
**Auto?** No  
**SPORE diagnostic on violation:** `SPORE-GOV-003` — `request {}` on a non-API flow.

#### What it accepts

Input shape declaration for external ingress flows. Accepted directives:

```galerina
request {
  accepts json
  requires body
}
```

#### Required vs optional

- **Required** for flows that handle external ingress: HTTP routes, webhook handlers, event consumers.
- **Must be omitted** for internal/pure/helper flows. Placing `request {}` on a non-API flow is a compile error (`SPORE-GOV-003`).

#### Minimal working example

```galerina
secure flow parseInput(readonly request: Request) -> ParseInputResult
contract {
  types {
    type RawInput { data: String }
    type ParsedOutput { tokens: Array<String> }
    type ParseInputResult = Result<ParsedOutput, ApiError>
  }
  intent   { "Parse untrusted input into a token list." }
  request  { accepts json  requires body }
  response { returns json }
  limits   { memory 16mb  request_time 1s }
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

#### Common mistakes

- Adding `request {}` to an internal pipeline helper. Rule C-001: API routing baggage on internal flows is a compile error.
- Forgetting `request {}` on an actual HTTP route — the governance verifier enforces that external-facing flows declare their input shape.

---

### `response {}`

**Status:** ENFORCED (Stage A governance verifier)  
**Auto?** No  
**SPORE diagnostic on violation:** `SPORE-GOV-003` — `response {}` on a non-API flow.

#### What it accepts

Output policy for external egress flows. Accepted directives:

```galerina
response {
  returns json
}
```

#### Required vs optional

- **Required** for API/route flows (same conditions as `request {}`).
- **Must be omitted** for internal/pure/helper flows.
- Always paired with `request {}` — a flow that declares one without the other is an authoring error.

#### Minimal working example

See the `parseInput` example under `request {}` above — `request` and `response` always appear together on API flows.

#### Common mistakes

- Declaring `response {}` without `request {}` (or vice versa) on a flow — they are paired.
- Adding `response {}` to an internal mutation flow that is not an HTTP route — `SPORE-GOV-003`.

---

### `effects {}`

**Status:** ENFORCED (Stage A effect checker)  
**Auto?** No (deny-by-default: omitting = pure)  
**SPORE diagnostics on violation:**
- `SPORE-EFFECT-001` — body performs an effect not declared in `effects {}`
- `SPORE-EFFECT-002` — declared effects do not match the body's actual effects
- `SPORE-EFFECT-003` — any effect in a `pure` flow (always a hard error, no warning)

#### What it accepts

One or more effect family tokens, comma- or space-separated:

| Effect | Covers |
|---|---|
| `audit.write` | Writing to audit logs |
| `ledger.mutate` | Financial / ledger mutations |
| `network.outbound` | Any outbound network call |
| `network.inbound` | Accepting inbound connections |
| `storage.read` | Reading from persistent storage |
| `storage.write` | Writing to persistent storage |
| `state.mutate` | Mutating shared application state |
| `db.read` | Database reads |
| `db.write` | Database writes / mutations |
| `secret.access` | Accessing secrets/vault bindings |
| `shell.execute` | Shell commands (restricted/dangerous) |
| `ai.call` | Calling an AI/LLM tool |

```galerina
effects { audit.write, ledger.mutate, network.outbound }
```

#### Required vs optional

- **Required** if the body performs any side effect. Omitting `effects {}` is a declaration that the flow is strictly pure — any effect in the body becomes `SPORE-EFFECT-001`.
- Effects are **additive**: if the body does both `audit.write` and `ledger.mutate`, both must be declared (rule E-002).

#### Minimal working example

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

#### Common mistakes

- Declaring a subset of effects — e.g., only `ledger.mutate` when the body also calls `AuditLog.write` → **SPORE-EFFECT-002**.
- Putting any effect in a `pure` flow → **SPORE-EFFECT-003** (hard error, no override).
- **AI safety critical:** an AI tool must never silently add new effect entries to an existing `effects {}` block. All widening must go through the `propose → verify → approve` pipeline (rule C-005, rule A-002). Write the proposed change to a `*.galerina.proposal` artifact; do not touch the production `.spore` file.

---

### `authority {}`

**Status:** Stable form (string) ENFORCED today; typed `SystemCapability` form PLANNED (DRCM Phase 4)  
**Auto?** No  
**SPORE diagnostic on violation:** `SPORE-CAP-001` — raw string capability / wildcard `*` in NetworkTarget (Phase 4+).

#### What it accepts

Capability declarations for what the flow is permitted to call or reach. The canonical form uses typed algebraic `SystemCapability` objects (Phase 4):

```galerina
// Canonical form (Phase 4 — use @experimental_profile for now)
authority {
  requires {
    SystemCapability.CallGate(
      module: "gateway",
      function: "charge_endpoint",
      enforce_tls: true
    ),
    SystemCapability.NetworkEgress(
      target: NetworkTarget.ExplicitHost("api.gateway.internal"),
      port: 443
    )
  }
}
```

Raw string declarations (`allow_call: "module::function"`) will be banned at Phase 4 (`SPORE-CAP-001`) — they are a parsing-exploit risk.

#### Required vs optional

- Optional by default; **required when policy mandates** explicit capability declaration (e.g., high-trust billing, defense-grade flows).
- Must match or **restrict** ambient runtime settings — never silently widen.
- `UnrestrictedInternet` as a network target requires an explicit policy authorization (`SPORE-CAP-002`).

#### Minimal working example

```galerina
// ✅ Stage A workaround — string form (will be banned at Phase 4)
secure flow processInvoice(merchantId: String) -> Result<Void, Fault>
contract {
  intent { "Process billing under domain authority constraints." }
  effects { gateway.charge }
  authority { requires capability.billing.mutate }
}
{
  return Ok(Void)
}
```

#### Common mistakes

- Using wildcard `"*"` in a network target → **SPORE-CAP-001** (Phase 4).
- Widening `authority {}` beyond what the ambient runtime configuration permits → **SPORE-MONO-002**.
- AI generating `authority {}` blocks without the propose → verify → approve gate → **privilege escalation** (rule A-002).

---

### `privacy {}`

**Status:** ENFORCED (Stage A value-state checker)  
**Auto?** No  
**SPORE diagnostics on violation:**
- `SPORE-SECRET-001` — secret/PII flows to a log/audit sink without redaction
- `SPORE-SECRET-002` — secret/PII flows to network/egress without redaction
- `SPORE-SECRET-003` — secret/PII flows to serialize/record without redaction

#### What it accepts

Field masking and pseudonymization directives. Applied before data leaves the trust boundary:

```galerina
privacy {
  mask patient_id
  strategy transform.crypto_pseudonymize
}
```

#### Required vs optional

- Optional in the grammar; **required in practice** whenever the flow handles PII, PHI, or other sensitive identity fields.
- When present, the value-state checker verifies that the named fields are correctly masked before any external sink.

#### Minimal working example

```galerina
// Illustrative structure — some field descriptors are forward/Phase 4
secure flow recordMedicalEvent(inputPayload: MedicalPayload) -> Result<String, Fault>
contract {
  intent { "Record an encrypted billing event to the ledger." }
  effects { ledger.mutate, audit.write }
  privacy {
    mask patient_id
    strategy transform.crypto_pseudonymize
  }
}
{
  return Ok("recorded")
}
```

#### Common mistakes

- Omitting `privacy {}` on a flow that handles `patient_id`, `ssn`, or financial identifiers — the value-state checker still fires on any `SecureString` flowing to a sink even without an explicit `privacy {}` block.
- Using `redact()` incorrectly as a substitute for declaring `privacy {}` — `redact()` is the safe exit at a specific call site, not a contract-level policy.

---

### `secrets {}`

**Status:** ENFORCED (auto-by-default, rule C-002)  
**Auto?** **Yes** — omitting is the normal case  
**SPORE diagnostics on violation:**
- `SPORE-SECRET-001` — secret value flows to log/audit output
- `SPORE-SECRET-002` — secret value flows to network/egress
- `SPORE-SECRET-003` — secret value flows to serialized record

#### What it accepts

Credential handle declarations binding a named secret to a provider:

```galerina
secrets {
  bind "LEDGER_WRITE_KEY" from provider.vault
}
```

When omitted, the runtime auto-maps `.env` bindings through standard environment handling. The secret is ephemeral and never logged.

#### Required vs optional

**Almost always omit.** Declare only when:
- Overriding the standard `.env` auto-map (e.g., binding to a specific vault provider)
- The flow requires attestation that a named secret is vault-backed rather than env-backed

Never add `secrets {}` entries beyond what the body actually requires — all widening is privilege escalation (rule A-002 / C-005).

#### Minimal working example

```galerina
// With secrets {} override — only needed when vault binding is required
secure flow recordMedicalTransaction(inputPayload: MedicalPayload) -> Result<String, Fault>
contract {
  intent { "Record an encrypted billing event using a vault-backed ledger key." }
  effects { ledger.mutate, secret.access }
  secrets { bind "LEDGER_WRITE_KEY" from provider.vault }
}
{
  return Ok("recorded")
}
```

```galerina
// Without secrets {} — the normal case; runtime handles .env automatically
secure flow processOrder(orderId: String) -> Result<Void, Fault>
contract {
  intent { "Process an order using automatically-managed credentials." }
  effects { db.write }
}
{
  return Ok(Void)
}
```

#### Common mistakes

- Adding `secrets {}` to every `secure` flow "just in case" — this is unnecessary and makes the contract harder to audit. Omit it; the runtime handles secrets automatically.
- Declaring `secrets {}` without also declaring `secret.access` in `effects {}` — if the body accesses a secret, the effect must be declared.
- Any `SecureString` (a value derived from `secret.get()`, `vault.read()`, `kms.decrypt()`, or `secrets.*`) flowing into a log, network call, or serialized record → **SPORE-SECRET-001/002/003**. Use `redact()` as the safe escape.

---

### `audit {}`

**Status:** ENFORCED (governance verifier for policy-mandated flows); optional for standard web APIs  
**Auto?** No  
**SPORE diagnostic on violation:** `SPORE-SECRET-003` — secret in audit record (value-state checker applies regardless of audit level).

#### What it accepts

Audit obligation declarations:

```galerina
audit {
  level cryptographic_state_hash
  target storage.tpm_backed_log
  track [ effects.mutates ]
}
```

#### Required vs optional

- **Optional** for standard web APIs and internal flows.
- **Mandatory and detailed** for healthcare, banking, government, and other regulated domains per policy.
- When `audit { level: cryptographic_state_hash }` is declared on a high-trust flow, an Epilogue Receipt (`AU-001`) must be generated (Phase 6).

#### Minimal working example

```galerina
// Minimal audit for a secure write (add only what policy requires)
secure flow recordTransaction(amount: Int) -> Result<Int, String>
contract {
  intent { "Record an audited financial transaction." }
  effects { ledger.mutate, audit.write }
  audit {
    level cryptographic_state_hash
    target storage.tpm_backed_log
    track [ effects.mutates ]
  }
}
{
  AuditLog.write("transaction recorded")
  return Ok(amount)
}
```

#### Common mistakes

- Omitting `audit {}` on healthcare or banking flows where domain policy mandates it.
- Putting a `SecureString` or `TaintedString` value into an audit record → **SPORE-SECRET-003** (always enforced, regardless of audit level).
- Declaring `audit {}` on a `pure` flow that has no `effects { audit.write }` — the effect must be declared.

---

### `limits {}`

**Status:** Basic form ENFORCED (Stage A); DWI-enforcement form PLANNED (DRCM Phase 5)  
**Auto?** No (inherits global defaults when omitted)  
**SPORE diagnostic on violation:** `SPORE-EC-001` (static cost overflow, Phase 5); `SPORE-RESOURCE-001` (fuel exhaustion in DWI, Phase 5).

#### What it accepts

Two forms:

```galerina
// Basic form — compiles today (drcm_stable_v0)
limits { memory 16mb  request_time 1s }

// DWI-enforcement form — requires @experimental_profile (Phase 5)
@experimental_profile(name: "drcm_core_v1", status: "planned_phase_5") {
  limits { max_memory: 4MB  max_instructions: 5_000_000 }
}
```

#### Required vs optional

- Optional. Omitting inherits global policy defaults.
- Declare to **tighten** bounds (e.g., harden a specific flow beyond the global default).
- Cannot declare bounds **wider** than the global policy ceiling — that is a capability violation.

#### Minimal working example

```galerina
secure flow parseInput(readonly request: Request) -> Result<String, ApiError>
contract {
  intent   { "Parse untrusted input with strict memory and time limits." }
  request  { accepts json  requires body }
  response { returns json }
  limits   { memory 16mb  request_time 1s }
}
{
  return Ok("parsed")
}
```

#### Common mistakes

- Declaring `limits {}` values wider than the global policy ceiling (not currently enforced but will be at Phase 5).
- Using the DWI-enforcement form (`max_memory`, `max_instructions`) without an `@experimental_profile` wrapper in `--release` builds → **SPORE-DRCM-UNSUPPORTED**.

---

### `economics {}`

**Status:** ENFORCED (auto-by-default); explicit override is ENFORCED (Stage A parser + economics-inference.ts)  
**Auto?** **Yes** — omitting is the normal case  
**SPORE diagnostics on violation:**
- `SPORE-EC-001` — static cost overflow: estimated loop cost exceeds `max_aggregate_flow_budget` (Phase 5)
- `SPORE-EC-002` — `charge_failure_tolerance_ratio` breached → DPM quarantine triggered (Phase 5)

#### What it accepts

Cost and resource budget overrides:

```galerina
economics {
  max_gas 500_units
  allocation profile.billing_operations
}
```

```galerina
// Forward-looking form (Phase 5)
@experimental_profile(name: "drcm_core_v1", status: "planned_phase_5") {
  economics {
    currency: "USD"
    max_billing_quota_per_call: 500_00
    charge_failure_tolerance_ratio: 0.01
  }
}
```

When omitted, the runtime auto-infers resource budgets from the CostGraph and ValueGraph (rule EC-001).

#### Required vs optional

**Almost always omit.** Declare only when:
- A flow needs a hard billing cap that differs from the auto-inferred default
- A flow must pin a specific currency or charge-failure tolerance (financial services)
- A regulatory mandate requires an explicit budget record in the ProofGraph

#### Minimal working example

```galerina
// Normal — economics {} omitted; auto-inferred from CostGraph
pure flow classify(score: Int) -> Result<String, String>
contract {
  intent { "Classify a score with auto-managed resource budgeting." }
}
{
  if score >= 50 { return Ok("pass") }
  return Ok("fail")
}
```

```galerina
// Override — only when pinning a hard cap for financial operations
secure flow chargeBillingEvent(amount: Int) -> Result<Void, Fault>
contract {
  intent { "Charge a billing event with an explicit cost ceiling." }
  effects { gateway.charge, audit.write }
  economics { max_gas 500_units  allocation profile.billing_operations }
}
{
  return Ok(Void)
}
```

#### Common mistakes

- Adding `economics {}` to every flow by default — it adds noise and disables accurate auto-inference.
- Setting `charge_failure_tolerance_ratio` too high on a financial flow — when the threshold is exceeded, the DSS sets the V_DPM quarantine bit, which is **monotonic** (cannot be reversed without restarting the DSS session).

---

### `epilogue {}`

**Status:** AUTO-by-default (rule C-002); full Epilogue Receipt signing PLANNED (DRCM Phase 6)  
**Auto?** **Yes** — omitting is the normal case  
**SPORE diagnostic on violation:** `SPORE-AU-001` — `epilogue { strategy: none }` declared on a high-trust flow (`max_risk_liability: high`).

#### What it accepts

Post-execution proof strategy. When declared explicitly, it pins the strategy rather than letting the ValueGraph auto-select:

```galerina
epilogue {
  strategy: cryptographic_state_hash
}
```

The auto-tier logic selects the receipt strategy from the ValueGraph based on the flow's trust level and economics settings. For high-trust flows (`audit { level: cryptographic_state_hash }`), the Epilogue Receipt structure is:

```
R_E = Sign_DSS_ML-DSA-65( H( inputs ‖ outputs ‖ V_DPM_final ‖ timestamp ) )
```

#### Required vs optional

**Almost always omit.** Declare only when:
- A regulatory mandate requires a specific proof strategy to be attested in the ProofGraph
- You must **prevent** the auto-tier from selecting a lower-cost proof tier than your policy requires

Do not declare `epilogue { strategy: none }` on a flow where `audit { level: cryptographic_state_hash }` is set → **SPORE-AU-001**.

#### Minimal working example

```galerina
// Normal — epilogue {} omitted; ValueGraph auto-selects proof tier
secure flow recordPayment(amount: Int) -> Result<Void, Fault>
contract {
  intent   { "Record a payment to the ledger." }
  effects  { ledger.mutate, audit.write }
  audit    { level cryptographic_state_hash  target storage.tpm_backed_log  track [ effects.mutates ] }
  // epilogue omitted — auto-tier from ValueGraph
}
{
  return Ok(Void)
}
```

#### Common mistakes

- Declaring `epilogue { strategy: none }` on a flow with `max_risk_liability: high` → **SPORE-AU-001**.
- Treating `epilogue {}` as a required documentation clause — it is not. Auto-selection from the ValueGraph is the design intent; declaration is an explicit override.

---

### `targets {}`

**Status:** ENFORCED (Stage A)  
**Auto?** No  
**SPORE diagnostic on violation:** None directly. `SPORE-GOV-005` fires if `targets {}` is used to claim authority on a mismatched flow qualifier.

#### What it accepts

Execution placement and isolation hints. Hardware, TEE, and WASM isolation preferences:

```galerina
targets {
  prefer wasm_sandbox
  fallback native
}
```

```galerina
// TEE hint (forward-looking — illustrative)
targets {
  prefer tee_enclave
  fallback wasm_sandbox
}
```

#### Required vs optional

**Optional in all cases.** The runtime picks the execution target from the ValueGraph when omitted.

`targets {}` declares a **preference** — it never grants authority, never widens capabilities, and is never a substitute for `authority {}`.

#### Minimal working example

```galerina
secure flow processInvoice(merchantId: String) -> Result<Void, Fault>
contract {
  intent   { "Process billing with WASM isolation preference." }
  effects  { gateway.charge }
  targets  { prefer wasm_sandbox }
}
{
  return Ok(Void)
}
```

#### Common mistakes

- Using `targets {}` to try to grant elevated capability — it is an execution placement hint, not an authority declaration. Capability claims must go in `authority {}`.
- Declaring `targets { prefer tee_enclave }` on a standard internal flow without a corresponding `economics.max_risk_liability` justification — this may trigger a governance review.

---

### `resilience {}` — AUTO-BY-DEFAULT

**Status:** ENFORCED (Stage A — auto-inferred; explicit override parsed)  
**Auto?** Yes — inferred from effects profile  
**SPORE diagnostics:** `SPORE-RES-001` (retry + mutation without `idempotent: true`)

#### What it accepts

Declares retry strategy, fallback behaviour, and quarantine policy for transient faults.

```spore
contract {
  resilience {
    retry    3 times  with_backoff exponential  max_delay 5s
    idempotent: true           // ← REQUIRED when retry + database.write or gateway.charge
    fallback circuit_breaker   // other values: return_cached | return_default | quarantine | escalate | propagate
    quarantine_after 10 consecutive_failures
    quarantine_reset after 60s
    on_quarantine set_posture_bit DPM_DEFENSIVE_MODE  // DRCM Phase 5 — V_DPM integration
  }
}
```

#### Auto-defaults by effects profile

| Flow type | Default retry | Default fallback |
|---|---|---|
| `pure` | 0 (no retry) | propagate |
| `secure` + `network.outbound` | 1 retry, exponential | propagate |
| `secure` + `database.write` / `gateway.charge` | 0 retries | propagate |

#### Required vs optional

**Optional — omit for most flows.** Declare only to override auto-inferred behaviour.

**⚠️ Critical rule:** `retry N times` on a flow with `database.write` or `gateway.charge` requires `idempotent: true` — otherwise `SPORE-RES-001` fires. Retrying mutations without idempotency risks duplicate writes.

#### `fallback` variants

- `propagate` — return error as-is (default)
- `return_cached` — return the last successful cached result
- `return_default` — return the flow's declared default value
- `quarantine` — immediately quarantine the flow
- `circuit_breaker` — trip V_DPM bitmask → `DPM_DEFENSIVE_MODE` (DRCM Phase 5)
- `escalate` — surface to the parent flow's error handler

#### Common mistakes

- Using `retry` on `database.write` without `idempotent: true` → `SPORE-RES-001`
- Putting `resilience {}` inside `policy {}` — it belongs in `contract {}`
- Confusing `resilience.quarantine_after` with DRCM Phase 4 emergency overlays — they work at different layers

---

### `observability {}` — AUTO-BY-DEFAULT

**Status:** ENFORCED (Stage A — auto-inferred; explicit override parsed)  
**Auto?** Yes — inferred from flow qualifier + audit level  
**SPORE diagnostics:** `SPORE-OBS-001` (explicit block on a `pure` flow)

#### What it accepts

Declares operational telemetry configuration. **Distinct from `audit {}`** — observability is best-effort, sampled, and has rolling retention. Audit is evidentiary, signed, and permanent.

```spore
contract {
  observability {
    trace    sample_rate 0.25         // float 0.0–1.0 (IEEE 754)
    metrics  latency_p99  error_rate  throughput  custom "payments.processed.count"
    alert_on latency_p99 > 200ms      // platform-agnostic predicate (no sink routing)
    alert_on error_rate  > 1%
    log_level warn                    // debug | info | warn | error | silent
  }
}
```

#### Auto-defaults by flow type

| Flow type | Trace | Metrics | Alert |
|---|---|---|---|
| `pure` | disabled | latency only | none |
| `secure` standard | 10% sampling | latency_p99 + error_rate | p99 > 1s, error > 5% |
| `secure` high-trust (crypto audit) | 100% sampling | all three + custom | p99 > 500ms, error > 1% |

#### Required vs optional

**Optional — omit for most flows.** Declare only to override auto-inferred behaviour.

**⚠️ Do NOT declare on `pure` flows** — pure flows have no side effects; traces and error rates are meaningless. Triggers `SPORE-OBS-001` warning.

#### `alert_on` is platform-agnostic

`alert_on latency_p99 > 200ms` declares **what** to alert on. Routing to PagerDuty, Slack, etc. is a deployment configuration concern, not a governance contract concern.

#### Common mistakes

- Adding `observability {}` to a `pure` flow → `SPORE-OBS-001`
- Confusing `observability {}` with `audit {}` — they serve different purposes with different trust/retention models
- Setting `log_level debug` in production — high verbosity under load can bloat operational logs

---

### `invariant {}`

**Status:** PLANNED (DRCM Phase 2, target 2026-07) — parser, governance verifier, and WAT gate injection scheduled for Phase 2  
**Auto?** No  
**SPORE diagnostics on violation:**
- `SPORE-INV-001` — pre-condition `ensure` fails before body executes (aborts before body runs)
- `SPORE-INV-002` — post-condition `ensure` fails after body returns (aborts before result is returned)
- `SPORE-INV-003` — `invariant {}` misplaced outside `contract {}` (parse error)

#### What it accepts

One or more `ensure` expressions, evaluated as runtime guards before and after body execution:

```galerina
invariant {
  ensure amount > 0;
  ensure runtime.getAvailableBalance(walletId) >= amount;
}
```

**Constraint:** `ensure` expressions must be **simple, directly evaluable expressions**. Theorem-prover calls and complex arithmetic identity proofs (`ensure ledger.credits == ledger.debits`) are Phase 4 SMT-solver territory. For now, use runtime-evaluable guards.

**Position:** `invariant {}` is a **sub-block inside `contract {}`** — alongside `intent` and `effects`. It is never a top-level block, never a body-level statement, and never a sibling of `contract {}`.

Use `@experimental_profile(name: "drcm_core_v1", status: "planned_phase_2")` to wrap the block in current Stage A source, signalling forward-looking intent without breaking compilation.

#### Required vs optional

- Optional in the grammar.
- **Strongly recommended** for high-trust mutation flows: payments, medical records, government ledgers, billing operations.
- Rule of thumb: if the flow has `effects { ledger.mutate }` or `effects { db.write }` on sensitive data, add `invariant {}`.

#### Minimal working example

```galerina
// ✅ CORRECT — invariant inside contract block
secure flow processTransaction(walletId: String, amount: Int) -> Result<Void, Fault>
contract {
  intent { "Transfer funds securely while verifying balance constraints." }
  effects { ledger.mutate }
  @experimental_profile(name: "drcm_core_v1", status: "planned_phase_2") {
    invariant {
      ensure amount > 0;
      ensure runtime.getAvailableBalance(walletId) >= amount;
    }
  }
}
{
  return Ok(Void)
}
```

#### Common mistakes

```galerina
// ❌ WRONG — invariant as a standalone block outside contract {}
secure flow processTransaction(walletId: String, amount: Int) -> Result<Void, Fault>
contract { intent { "Transfer funds." }  effects { ledger.mutate } }
invariant { ensure amount > 0; }   // SPORE-INV-003: parse error — not a valid top-level block
{ ... }

// ❌ WRONG — invariant inside body
secure flow processTransaction(walletId: String, amount: Int) -> Result<Void, Fault>
contract { intent { "Transfer funds." }  effects { ledger.mutate } }
{
  invariant { ensure amount > 0; }   // SPORE-INV-003: invariant is not a body statement
  ...
}
```

---

### `[conforms_to: PolicyName]`

**Status:** PLANNED (DRCM / task #56)  
**Auto?** No  
**SPORE diagnostics on violation:** `SPORE-GOV-004`, `SPORE-LIMIT-001`, `SPORE-GOV-019` — see `galerina-domain-guard-policies.md` for full definitions.

#### What it accepts

A domain guard binding that connects the flow's contract to an **external** `policy {}` file (defined in `governance/policies/`). The referenced policy sets an immutable ceiling on what the contract is permitted to declare.

```galerina
contract [conforms_to: InvoicingDomainGuard] {
  intent   { "Process billing under strict domain lockdowns." }
  effects  { gateway.charge }
  limits   { max_memory: 4MB }
}
```

The binding is a **decorator on the `contract` block header** — not a sub-block inside `contract {}`, and not a separate outer block.

#### Required vs optional

- Optional by default. Required when a domain policy mandates that flows within a module conform to a specific guard ceiling.
- When present, the compiler performs a **Differential Proof** at compile time: every clause in the contract must be within the bounds declared by the guard policy. A contract that attempts to declare an effect not in `permitted_effects {}` or a limit exceeding `enforced_limits {}` is a hard compile error.

#### Minimal working example

```galerina
// External file: governance/policies/invoicing_guard.spore
// Use `guard Name {}` for top-level domain ceilings (v2.1 — replaces `policy Name {}`)
guard InvoicingDomainGuard {
  permitted_effects { gateway.charge, audit.write }
  enforced_limits   { max_memory_ceiling: 4MB }
}

// Flow file — [conforms_to: ...] on contract header
secure flow processInvoice(merchantId: String) -> Result<Void, Fault>
contract [conforms_to: InvoicingDomainGuard] {
  intent   { "Process billing under strict domain lockdowns." }
  effects  { gateway.charge }       // validated against InvoicingDomainGuard ✅
  limits   { max_memory: 4MB }      // validated against InvoicingDomainGuard ✅
}
{
  return Ok(Void)
}
```

> **v2.1 rename:** Top-level domain ceiling declarations use `guard Name {}` instead of `policy Name {}`. The `policy` keyword is reserved for State Mutation Governance (see below). Existing `policy Name {}` files emit `SPORE-SYNTAX-LEGACY-003` advisory.

#### Common mistakes

- Placing `conforms_to` as a sub-block inside `contract {}` — it is a decorator on the header, not a clause.
- Referencing a guard policy that does not exist in `governance/policies/` — compile error at the guard-resolution step.
- Declaring effects in the contract that exceed the guard's `permitted_effects {}` ceiling — the Differential Proof will reject.
- Using `policy Name {}` for domain ceilings instead of `guard Name {}` in new code — `SPORE-SYNTAX-LEGACY-003`.

> Full reference: `galerina-domain-guard-policies.md`

---

## Separate Block: `access {}` — Capability Negotiation Block

**Status:** v2.1 primary syntax — replaces deprecated inline `policy {}`  
**Auto?** No — most flows omit this block  
**SPORE diagnostics:**
- `SPORE-SYNTAX-LEGACY-003` — inline `policy {}` used instead of `access {}` (advisory)

### `access {}` — Capability Negotiation Block

**Position:** Between `contract {}` and `{ body }`  
**Purpose:** Declares who may call this flow and what data types cross the boundary.  
**Status:** v2.1 primary syntax — replaces deprecated inline `policy {}`.

Represents the *active negotiation of rights* at the call boundary, distinct from `contract {}`
which declares static governance properties.

**Clauses:**
- `purpose "tag"` — machine-readable purpose string
- `allow TypeName to "action"` — permit a type to cross the boundary for a specific action
- `deny TypeName` — explicitly block a type from crossing
- `require effect.name` — declare a required capability for callers
- `grant capability.name` — permit a named capability (Default Deny form — see below)

#### Default Deny

`access {}` operates under **Default Deny**: if a capability is not listed with `grant`,
it is automatically denied. You never need to list what is denied.

```spore
// Old syntax (explicit allow + deny):
policy {
  allow Payment to "process"
  deny RawCard
}

// New syntax (default deny — only list what IS permitted):
access {
  grant network.outbound    // everything else is automatically denied
  grant audit.write
}
```

**Example:**
```spore
flow processPayment(req: PaymentRequest) -> Result<Receipt, Error>
contract {
  intent { "Process a payment with full audit trail." }
  effects { database.write, audit.write }
}
access {
  purpose "payment-processing"
  grant database.write
  grant audit.write
  // network.outbound automatically denied — not listed
}
{
  // body
}
```

**Deprecated alias:** `policy {}` (inline form only — NOT the named top-level Domain Guard form)

### Three-block structure (v2.1)

```galerina
secure flow assessRisk(input: RiskRequest) -> Result<RiskResult, Fault>
contract {                              // 1. compile-time governance
  intent  { "Assess risk with full capability negotiation." }
  effects { db.read, network.outbound }
}
access {                               // 2. capability negotiation (v2.1 — SEPARATE block)
  purpose "risk-assessment"
  allow RiskRequest to "read"
  require db.read
}
{                                      // 3. body
  return Ok(RiskResult { level: 0 })
}
```

### Required vs optional

**Almost always omit.** Declare only when:
- A flow needs to explicitly restrict which data types may cross its call boundary
- A machine-readable purpose tag is required for policy audit traces
- Callers must satisfy a declared capability before dispatch is permitted

### Common mistakes

- Using the deprecated `policy {}` form instead of `access {}` → `SPORE-SYNTAX-LEGACY-003`
- Placing `access {}` inside `contract {}` — it is a separate block at the same structural level
- Confusing `access {}` (per-flow capability negotiation) with `policy DomainName {}` (external domain guard in `governance/policies/`)

---

## Separate Block: `policy {}` *(Deprecated Inline Alias)*

**Status:** PLANNED (DRCM Phase 4)  
**Auto?** No — most flows never declare this  
**SPORE diagnostics:**
- `SPORE-GOV-020` — `policy {}` placed inside `contract {}` (parse error)
- `SPORE-MONO-001` — capability expansion attempted through overlay (monotonic violation)
- `SPORE-MONO-003` — emergency overlay attempted de-escalation (monotonic violation)
- `SPORE-SYNTAX-LEGACY-003` — inline `policy {}` used as capability negotiation block; use `access {}` instead (advisory)

> **v2.1 note:** In v2.1, the inline `policy {}` block (for capability negotiation) is renamed to `access {}`. The `policy` keyword is **reserved** for the future State Mutation Governance feature (see below). The emergency overlay form (`policy { emergency {} }`) remains valid syntax but is also subject to rename in a future version.

### What it is

The inline `policy {}` block (emergency form) is a **per-flow, runtime monotonic overlay** — a block that declares how the flow's runtime capability posture should respond to software anomalies. It is:

- **Separate from `contract {}`** — it sits between `contract {}` and the body `{ }`
- **Not a domain guard** — it is local, per-flow, and not stored in `governance/policies/`
- **Not a contract sub-block** — placing it inside `contract {}` is `SPORE-GOV-020`

### Three-block structure reminder (v2.0 form — use `access {}` in v2.1)

```galerina
secure flow assessRisk(input: RiskRequest) -> Result<RiskResult, Fault>
contract {                              // 1. compile-time governance
  intent  { "Assess risk with emergency posture management." }
  effects { db.read, network.outbound }
}
policy {                               // 2. runtime monotonic overlay (SEPARATE block — deprecated inline form)
  emergency {
    on system_integrity_anomaly {
      deny network.outbound
      require local_only_execution
    }
  }
}
{                                      // 3. body
  return Ok(RiskResult { level: 0 })
}
```

### What it accepts

`emergency { on <trigger> { deny <effect>  require <constraint> } }` blocks. Triggers are software signals (`system_integrity_anomaly`, invariant failures, memory pressure). The overlay fires when the trigger condition is detected by the DSS.

### Monotonic rules

- Emergency overlays are **one-way**: once an overlay fires, the resulting capability restriction is **permanent for the current session** (rule M-003).
- Overlays can escalate (Tier 1 → Tier 2 → Tier 3) but **cannot de-escalate** → `SPORE-MONO-003`.
- `deny` only — you cannot `allow` a previously-denied capability through an overlay → `SPORE-MONO-001`.

### Required vs optional

**Almost always omit.** Only flows that need explicit emergency posture management declare a `policy {}` block — financial services, critical infrastructure, and similar regulated flows. Standard web APIs, internal helpers, and pure flows never need it.

### Common mistakes

```galerina
// ❌ WRONG — policy inside contract
secure flow assessRisk(input: RiskRequest) -> Result<RiskResult, Fault>
contract {
  intent { "Assess risk." }
  effects { db.read }
  policy {                          // SPORE-GOV-020: parse error
    emergency { on anomaly { deny network.outbound } }
  }
}
{ ... }
```

- Do not confuse `policy {}` (inline, per-flow, runtime overlay) with `policy DomainName {}` (external, domain guard, in `governance/policies/`). These are two entirely distinct constructs. See **Policy Disambiguation** in `galerina-governance-rules.md`.

---

## Three `policy`-Related Concepts — Never Confuse Them

| | Domain Guard Policy | `access {}` Capability Negotiation (v2.1) | Emergency Policy Overlay (deprecated inline `policy {}`) |
|---|---|---|---|
| **Syntax** | `policy DomainName { permitted_effects {} enforced_limits {} }` | `access { purpose "..." allow T to "..." }` | `policy { emergency { on X { deny Y } } }` |
| **Location** | External file in `governance/policies/` | Inline block between `contract {}` and `{ body }` | Inline block between `contract {}` and `{ body }` |
| **Referenced via** | `contract [conforms_to: PolicyName]` header decorator | Declared directly as a standalone block | Declared directly as a standalone block |
| **Purpose** | Immutable compile-time ceiling on contract clauses | Active negotiation of call-boundary rights (v2.1) | Runtime monotonic capability de-escalation on anomaly |
| **Most flows** | Reference when domain requires it | Omit unless boundary type control needed | Never declare |
| **v2.1 status** | Unchanged | **Primary syntax** — replaces inline `policy {}` | Deprecated alias; `policy` keyword reserved for State Mutation Governance |

---

## Declaration Keywords: `static` and `bitfield`

These are **top-level declaration keywords** (not contract sub-blocks). They appear at module scope and produce compile-time constants used in contracts and flow bodies.

### `static` — Compile-Time Constant

```spore
static NAME = VALUE
```

Defines a compile-time constant. The compiler substitutes VALUE everywhere NAME appears — zero memory overhead, O(1) lookup. Type-safe equivalent of C `#define`.

**Compile-time folding:** The WAT emitter replaces every reference to a `static` constant with an inline literal. For example, `static FLOOR_PROOF = 3` causes every use of `FLOOR_PROOF` in WAT output to emit `(i32.const 3)` — no memory load, no indirection.

**Governance rules:**
- `SPORE-STATIC-001` — value is not a compile-time constant (contains runtime expressions)
- `SPORE-STATIC-002` — name declared more than once in the same scope

**Example:**
```spore
static FLOOR_PROOF = 3
static MAX_RETRY = 3

// WAT output for a reference to FLOOR_PROOF:
// (i32.const 3)  ← no memory load; zero overhead
```

---

### `bitfield` — Type-Safe Governance Register

```spore
bitfield NAME {
  field_name: BIT_POSITION
  ...
}
```

Defines a structured governance register. Replaces the verbose `pure flow VDPM_BIT_*() -> Int` pattern.

The compiler generates two accessors for each declared field:
- `NAME.field_name` → `(1 << BIT_POSITION)` — the **bitmask value** (use for AND/OR operations)
- `NAME.BIT_field_name` → `BIT_POSITION` — the **raw bit position** (use for shift operations)

So for `bitfield V_DPM { network_outbound: 0 }`:
- `V_DPM.network_outbound` evaluates to `1` (i.e. `1 << 0`)
- `V_DPM.BIT_network_outbound` evaluates to `0`

**Governance rules:**
- `SPORE-BF-001` — duplicate bit positions in the same `bitfield`
- `SPORE-BF-002` — bit position > 31 (V_DPM is a 32-bit register)

**Example:**
```spore
bitfield V_DPM {
  network_outbound: 0
  storage_write: 1
  secret_access: 2
  audit_write: 3
  database_write: 4
  ai_inference: 5
  shell_execute: 6
  native_call: 7
  dag_edge_valid: 8
}
// V_DPM.network_outbound = 1  (bitmask: 1 << 0)
// V_DPM.BIT_network_outbound = 0  (raw bit position)
// V_DPM.dag_edge_valid = 256  (bitmask: 1 << 8)
// V_DPM.BIT_dag_edge_valid = 8  (raw bit position)
```

---

## Top-Level Declaration: `guard Name {}` — Domain Ceiling

**Status:** v2.1 primary syntax — replaces `policy Name {}` for domain ceilings  
**Location:** External file in `governance/policies/` (never inline in a flow file)

`guard Name {}` defines an immutable compile-time ceiling on what any `contract [conforms_to: Name]` flow may declare. It is verified via Differential Proof at compile time.

```spore
// governance/policies/payment_guard.spore
guard PaymentDomainGuard {
  permitted_effects { gateway.charge, audit.write, db.read }
  enforced_limits   { max_memory_ceiling: 8MB }
}
```

> **v2.1 rename:** `policy Name {}` for domain ceilings is deprecated. Use `guard Name {}` in all new code. Existing `policy Name {}` files continue to compile but emit `SPORE-SYNTAX-LEGACY-003`.

---

## Top-Level Declaration: `gate(condition) {}` — Flow Admission Guard

**Status:** PLANNED (v2.1 governance verifier; Phase 5 WAT enforcement)  
**Location:** Top-level block wrapping one or more flow declarations

`gate(condition) {}` wraps one or more flows with an admission guard. The `condition` names a Domain Guard Policy. Only callers satisfying the policy ceiling can dispatch flows inside the gate block.

Maps to V_DPM bit 8 (`dag_edge_valid`) — the topology check fires before capability checks.

```spore
gate(admin_only) {
  secure flow deleteRecord(id: String) -> Result<Void, Fault>
  contract {
    intent { "Delete a record — admin only." }
    effects { db.write }
  }
  {
    return Ok(Void)
  }
}
```

**Governance rules:** `SPORE-GATE-001` (unknown condition), `SPORE-GATE-002` (wraps pure flow — redundant).  
`gateConstraints[]` in the `.lmanifest` tracks all `gate {}` admission guards.

---

## Top-Level Declaration: `import` — DAG Merge

**Status:** PLANNED (v2.1 compiler)  
**Diagnostics:** SPORE-IMPORT-001 through SPORE-IMPORT-004

Two forms:

```spore
// Form 1 — plain file import (DAG merge)
import "./path.spore"

// Form 2 — bridged plugin (safe: sandboxed; assimilate: Hot-Code Residency)
import plugin safe "./path" as X {
  contract { access { grant capability.name } }
}

import plugin assimilate "./path" as X {
  contract { access { grant capability.name } }
}
```

- **Plain import:** Merges the target file's symbols into the current DAG scope. Symbols are live — the file is compiled as part of the same DAG.
- **`plugin safe`:** Sandboxed bridge. The plugin runs in an isolated module; calls are mediated by the `access {}` boundary.
- **`plugin assimilate`:** Hot-Code Residency. The plugin is loaded into the DSS bootstrap memory at startup. Must be declared in `boot.spore`. Requires `assimilation_memory_budget` in `governance {}`. The `.lmanifest` tracks assimilated plugins in `assimilatedPlugins[]`.

---

## Comment Syntax

| Syntax | Token | Purpose |
|---|---|---|
| `// text` | `comment` | Code documentation — discarded after parse |
| `/// text` | `docComment` | API documentation — extracted by doc tooling |
| `;; text` | `govComment` | Governance annotation — scanned by verifier, stored in .lmanifest |
| `/* text */` | `comment` | Block code comment — discarded after parse |
| `;` (trailing) | `newline` | Optional statement separator — silently collapsed |

`;;` governance annotations are first-class tokens. The verifier collects them into `governanceAnnotations[]` in the `.lmanifest` narrative alongside `ProofObligations`.

---

## What to Never Write in Source

| Clause | Why | Diagnostic |
|---|---|---|
| `liability {}` | Auto-calculated by governance verifier from breach-risk matrix; stored in ProofGraph. Manual declaration is always wrong. | `SPORE-GOV-018` |
| `cyber_physical_hardening {}` | Auto-selected by runtime from ValueGraph. Only declare with Tier 1 ASIC hardware + regulatory attestation mandate + high `economics.max_risk_liability`. | `SPORE-GOV-017` |

---

## Stage A Syntax Notes

These apply to all examples in this document:

- **`->`** is the return type operator (not `:`).
- **Module paths use `.` today** — `AuditLog.write(...)`, `String.length(...)`. The canonical form is `::` (`AuditLog::write`, `String::length`) but the `::` parser is not yet implemented (task #57, rule S-000). Use `.` in all `.spore` source files.
- **Named type constructors in let-bindings fail:** `let x = TypeName { field: value }` → Stage A parse error (task #57). Use `return Ok(TypeName { field: value })` or pass constructors directly as call arguments instead.
- **Forward-looking DRCM syntax** (`invariant {}`, `step`, `policy { emergency {} }`, `limits {}` with DWI semantics) must be wrapped in `@experimental_profile(name: "drcm_core_v1", status: "planned_phaseN")` in `--release` builds, or the compiler emits `SPORE-DRCM-UNSUPPORTED` (rule A-004).

---

## Cross-References

| Topic | Document |
|---|---|
| Canonical contract authoring guide | `galerina-contract-authoring-guide.md` |
| Full governance rules + SPORE diagnostic registry | `galerina-governance-rules.md` |
| Domain guard policies (`[conforms_to]`) | `galerina-domain-guard-policies.md` |
| DRCM 7-module architecture (V_DPM, DWI, DSS) | `galerina-deterministic-runtime-containment.md` |
| Architecture patterns (9 patterns, feature profiles) | `galerina-architecture-patterns.md` |
| Economics block detailed reference | `galerina-contract-economics.md` |
| Secrets + epilogue design | `galerina-design-secrets-epilogue-blocks.md` |
| KB master index | `KNOWLEDGE-BASE-INDEX.md` |

---

> **KNOWLEDGE-BASE-INDEX.md update needed:** Add `galerina-contract-clause-reference.md` to the Document Inventory table under Layer 2B (Syntax Reference), alongside `galerina-contract-authoring-guide.md`. Description: "Per-clause reference card for every `contract {}` sub-block — status, syntax, required-when, examples, diagnostics."
