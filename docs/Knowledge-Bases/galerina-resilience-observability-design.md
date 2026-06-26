# Galerina — Resilience & Observability Contract Blocks (Design Proposal)

**Version:** 1.1 (2026-06-04) — APPROVED  
**Status:** Approved for implementation (task #58). Refinements incorporated from review.  
**Source:** Research synthesis notes/25, gap analysis from galerina-governed-design-synthesis.md.

---

## Why These Blocks Are Needed

From the research synthesis, three blocks answer three distinct questions:

| Block | Question answered |
|---|---|
| `limits {}` | *Can this run safely?* (memory, time, CPU) |
| `economics {}` | *Is this cost envelope acceptable?* (billing, AI tokens, compute budget) |
| `resilience {}` | *How does this degrade or recover when safety/cost edges are hit?* |
| `observability {}` | *What telemetry does this flow emit for operators?* (distinct from evidentiary `audit {}`) |

`resilience` and `observability` are currently absent. Without them, retry logic, fallback behaviour, and operator telemetry are left to convention rather than declared governance.

---

## 1. `resilience {}` — Retry, Fallback, Quarantine

### Design Intent

`resilience {}` declares how a flow behaves when it encounters faults — not how to prevent them (that's `limits {}` and `invariant {}`), but how to **recover from them**. It is auto-by-default like `economics {}`: if omitted, the runtime uses a profile-derived policy.

### Proposed Syntax (Approved)

```spore
resilience {
  // Retry on transient failure (default: 0 retries)
  // ⚠️ Forbidden on flows with database.write or gateway.charge effects
  //    unless idempotent: true is declared (SPORE-RES-001)
  retry    3 times  with_backoff exponential  max_delay 5s
  idempotent: true  // required when retry + database.write or gateway.charge

  // What to return if all retries exhausted (default: propagate)
  fallback circuit_breaker  // or: return_cached | return_default | quarantine | escalate | propagate

  // Quarantine this flow after N consecutive failures (default: disabled)
  quarantine_after 5 consecutive_failures

  // Reset quarantine after a cool-down period (default: manual only)
  quarantine_reset after 60s

  // DRCM integration: trip the V_DPM bitmask when this flow is quarantined
  // Shifts the DSS into Fail-Fast state before next invocation (DRCM Phase 5)
  on_quarantine set_posture_bit DPM_DEFENSIVE_MODE
}
```

**`circuit_breaker` + `on_quarantine`:** When `fallback circuit_breaker` fires AND `on_quarantine set_posture_bit DPM_DEFENSIVE_MODE` is declared, the resilience engine trips a V_DPM bit. This integrates `resilience {}` with the DRCM DSS monotonic policy layer — the flow is not just quarantined, it shifts the entire isolate's security posture. This is a DRCM Phase 5 feature; until then, it is parsed and stored but the bit-trip is a no-op.

### Field Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `retry` | `N times` | `0 times` | Number of retry attempts on transient error |
| `with_backoff` | `linear \| exponential \| constant` | `constant` | Backoff strategy between retries |
| `max_delay` | duration | `5s` | Maximum delay between retry attempts |
| `fallback` | variant (see below) | `propagate` | Behaviour when retries exhausted |
| `quarantine_after` | `N consecutive_failures` | disabled | Auto-quarantine trigger |
| `quarantine_reset` | `after Ns \| manual` | `manual` | How quarantine is lifted |

**Fallback variants:**
- `return_cached` — return the most recent successful result from the response cache
- `return_default` — return the flow's declared default value (requires a `default:` annotation)
- `quarantine` — immediately quarantine the flow (same as `quarantine_after 1`)
- `circuit_breaker` — trip the V_DPM bitmask into `DPM_DEFENSIVE_MODE`, shifting the DSS into Fail-Fast state before the next invocation; integrates directly with DRCM Phase 5 (planned)
- `escalate` — surface to the parent flow's error handler
- `propagate` — return the error as-is (default)

### Auto-by-Default Inference

When `resilience {}` is omitted:
- For `pure` flows: no retry (pure functions are side-effect-free, safe to retry implicitly)
- For `secure` flows with `network.outbound`: 1 retry with exponential backoff, propagate on exhaustion
- For `secure` flows with `database.write`: 0 retries (mutations must be idempotent or not retried by default)
- For `secure` flows with `audit.write`: 0 retries (audit records must not duplicate)

The runtime infers from the `effects {}` profile. Explicit declaration overrides inference.

### Example

```spore
secure flow fetchPaymentStatus(orderId: String) -> Result<PaymentStatus, ApiError>
contract {
  intent { "Fetch payment status from the external payment gateway." }
  effects { network.outbound }
  limits { request_time 3s }
  resilience {
    retry    3 times  with_backoff exponential  max_delay 2s
    fallback return_cached
    quarantine_after 10 consecutive_failures
    quarantine_reset after 120s
  }
}
{
  return payment_gateway::getStatus(orderId)
}
```

---

## 2. `observability {}` — Operator Telemetry (DISTINCT from `audit {}`)

### Design Intent

**`audit {}`** is evidentiary — it produces cryptographically signed records for compliance, QSA review, and legal accountability. It is immutable and always correct by design.

**`observability {}`** is operational — it produces telemetry for operators: latency histograms, error rates, trace spans. It is best-effort, lossy under load, and never carries compliance weight.

These MUST be kept separate because:
1. They have different retention requirements (audit = permanent; telemetry = rolling 30-90 days)
2. They have different trust levels (audit = signed, verified; telemetry = unsigned, sampled)
3. They have different costs (audit = always-on, full fidelity; telemetry = configurable sampling)

### Proposed Syntax

```spore
observability {
  // Distributed tracing (default: disabled for pure flows, enabled for secure governed flows)
  trace    enabled | disabled | sample_rate 0.1  // float 0.0–1.0 (IEEE 754)

  // Metrics to expose on this flow (default: latency_p99 + error_rate)
  metrics  latency_p99  error_rate  throughput  custom "payments.processed.count"

  // Alerting thresholds (default: from global policy)
  alert_on latency_p99 > 500ms
  alert_on error_rate  > 5%

  // Log level for operational output (NOT compliance output — that's audit {})
  log_level debug | info | warn | error | silent
}
```

### Field Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `trace` | `enabled \| disabled \| sample_rate N` | auto (secure=enabled, pure=disabled) | Distributed trace emission |
| `metrics` | list of metric names | `latency_p99 error_rate` | Which metrics to collect |
| `alert_on` | `metric > threshold` | from global policy | Alerting rule for this flow |
| `log_level` | log level enum | `info` | Operational log verbosity |

### Auto-by-Default Inference

When `observability {}` is omitted:
- `pure` flows: tracing disabled, metrics: latency only, no alerts
- `secure` flows: tracing enabled at 10% sample rate, metrics: latency_p99 + error_rate, alert at p99 > 1s
- High-trust flows (`audit.level = cryptographic_state_hash`): tracing enabled at 100%, all metrics, alert at p99 > 500ms

### Example

```spore
secure flow processPayment(readonly req: PaymentRequest) -> Result<Receipt, Error>
contract {
  intent { "Process a payment transaction." }
  effects { network.outbound, database.write, audit.write }
  audit { level cryptographic_state_hash }    ;; evidentiary — always-on, signed
  observability {
    trace    sample_rate 0.25                  ;; operational — sampled, not signed
    metrics  latency_p99  error_rate  throughput  custom "payments.total_amount_cents"
    alert_on latency_p99 > 200ms
    alert_on error_rate  > 1%
    log_level warn
  }
}
{
  // ...
}
```

---

## 3. Implementation Plan

### Parser (Stage A TypeScript + governance-verifier.spore)

Both blocks follow the **auto-by-default pattern** already established for `economics {}`:
1. Parser recognises `resilience {}` and `observability {}` as `contractDecl` sub-blocks (same one-liner dispatch pattern as the ~18 existing sub-blocks)
2. `resilience-inference.ts` — auto-infers retry/fallback settings from the flow's `effects {}` profile when the block is omitted
3. `observability-inference.ts` — auto-infers trace/metrics settings from the flow's qualifier and `audit.level` when the block is omitted
4. Both blocks are exposed on the `FlowMeta` and stored in the ProofGraph

### Governance Verifier

Add SPORE codes:
- `SPORE-RES-001` — conflicting resilience settings (retry + database.write without explicit `idempotent: true`)
- `SPORE-OBS-001` — observability declared on `pure` flow (tracing a side-effect-free flow has no observable effects)

### Stage B .spore (canonical form)

After compiler acceptance, add `resilience` and `observability` sub-block parsing to `governance-verifier.spore` (incremental migration pattern).

---

## 4. Design Decisions (Resolved 2026-06-04)

| Decision | Resolution |
|---|---|
| `circuit_breaker` fallback | ✅ Added — trips V_DPM via `on_quarantine set_posture_bit DPM_DEFENSIVE_MODE` |
| retry + `database.write` | ✅ Forbidden without `idempotent: true` in `resilience {}` → `SPORE-RES-001` |
| `observability` vs `telemetry` | ✅ Keep `observability {}` — operational accuracy, AI authoring clarity |
| Sampling rate type | ✅ Float (0.0–1.0), IEEE 754 — consistent with `economics {}` primitives |
| Alert destinations | ✅ Platform-agnostic — `alert_on` declares predicate only; routing is deployment config |

---

## Cross-References

| Topic | Document |
|---|---|
| Economics auto-by-default model | `galerina-contract-economics.md` |
| Contract authoring guide | `galerina-contract-authoring-guide.md` |
| Governance rules (T-xxx category) | `galerina-governance-rules.md` |
| Research synthesis source | `galerina-governed-design-synthesis.md` |
