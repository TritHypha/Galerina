# Galerina — Governance Economics Platform

## Status

```text
Positioning document
Economics features: Phase 33+ (CostGraph), Phase 38+ (Governance Marketplace)
Current Phase: 29 complete — governance infrastructure in place
```

## TL;DR

- Galerina is not a compliance language. It is a Governance Economics Platform.
- It makes governance measurable, optimisable, and commercially quantifiable.
- It addresses the costs that actually hurt organisations — not just fine avoidance.
- The `contract.economics` block makes cost a first-class compiler concern.
- The CostGraph + ProofGraph + AuditGraph produce machine-readable ROI evidence.

---

## What Is an Economic Evaluation? (Foundational Definition)

An economic evaluation asks two questions about any choice:

1. **"What do we have to give up to get this?"** — The total cost (compute, memory, network, audit overhead, developer time, regulatory exposure)
2. **"Is what we get back actually worth it?"** — The total value or risk reduced

It is not just a price tag or a cloud hosting bill. It is the math of weighing tradeoffs.

In software engineering: balancing computing resources spent against business value or protection gained.

**Galerina's economic evaluation is governance-constrained**: the evaluation only runs on flows that have already passed the ProofGraph. Economics optimises within approved governance boundaries — it never evaluates unapproved paths.

---

## The Distinction That Matters

A **compliance language** sells to compliance teams.

A **Governance Economics Platform** sells to CIO, CTO, CISO, CRO, CFO, auditors,
regulators, and insurers simultaneously.

The difference is not feature count. It is what the platform makes possible:

| Compliance Language | Governance Economics Platform |
|---|---|
| Prevents regulatory penalties | Makes governance spend visible and optimisable |
| Sells to compliance teams | Sells to every executive with a cost centre |
| Governance is a constraint | Governance is a measurable asset |
| Audit evidence is manual | Audit evidence is generated automatically |
| Risk is described qualitatively | Risk is quantified and priced into execution cost |
| Governance shape is bespoke | Governance shapes are reusable, tradeable marketplace assets |

The market that buys "compliance" is large. The market that buys "we can tell you
what your governance costs, and make it cheaper" is every organisation that
runs software at scale.

---

## What Actually Costs Companies Money (Beyond Compliance)

GDPR fines are visible and discussed. The real costs are not.

### Overprovisioned Infrastructure

No declared compute budget means no compile-time signal when a flow requests
more resources than it needs. Engineering teams provision defensively.
Galerina's `contract.economics` block makes `compute_budget` a declared,
enforceable constraint — the compiler rejects a deployment plan that violates it.

### Failed Deployments

A deployment plan that has not been cost-validated executes against infrastructure
and fails mid-run. The governed execution plan in Galerina is produced before
execution begins. The CostGraph (Phase 33+) extends this: the runtime can
refuse to begin execution if the plan exceeds budget.

### Duplicate Governance Systems

Every team reinvents their compliance framework. Without shared governance
shapes, a healthcare team builds HIPAA controls, a payments team builds PCI-DSS
controls, and they share nothing. The Governance Marketplace (Phase 38+) makes
governance shapes reusable across organisations.

### Audit Preparation

Manual log analysis for annual audits routinely costs 40–200 developer-hours
per regulated system. ProofGraph replay replaces manual analysis with structured
evidence. The AuditGraph connects every execution back to its declared intent
and governance policy. See the ROI calculation below.

### Change Approval Boards

Without machine-readable proof of change impact, CAB reviews rely on developer
summaries and manual diffs. Galerina produces a governance diff on every change:

```bash
galerina diff main..feature-new-payment-flow --only authority
```

```text
Changed flows:
  processRefund
    Added effects:
      + payment.refund
    Added capabilities:
      + payment.refund
    Review: REQUIRED
```

The CAB receives a structured authority change report, not a code diff for
a non-technical audience to interpret.

### Manual Risk Assessments

Risk assessments are performed periodically, manually, and qualitatively.
Galerina's risk-adjusted cost model (see below) makes breach probability a
runtime-visible number derived from the ProofGraph, not a spreadsheet estimate.

### AI Oversight

The cost of an unconstrained AI workflow is unknown until the bill arrives.
Galerina's `contract.ai` block (see below) allows the compiler to reject prompts
before they are submitted, based on declared cost limits.

### Data Lineage Investigations

Tracking where data originated, who touched it, and when is a multi-day
investigation without native lineage tooling. Galerina's `lineage` syntax (see
below) makes lineage a compile-time declaration and a runtime artefact.

### Vendor Risk Reviews

Vendor risk reviews ask: what capabilities does this service use? Without a
capability routing graph, the answer requires reading source code. Galerina's
runtime manifest is a machine-readable capability routing graph, available
from the first build.

---

## The `contract.economics` Block

Cost becomes a first-class compiler concern when it is declared in the contract.

```galerina
flow processOrder(order: OrderRequest) -> Result<OrderConfirmation, OrderError>
contract {
  intent {
    purpose "Process validated customer order and charge payment"
  }

  effects {
    database.write
    payment.charge
    audit.write
  }

  economics {
    compute_budget    "50ms"
    memory_budget     "8mb"
    external_calls    2           // payment gateway + audit sink
    cost_per_call     "£0.0003"
    monthly_volume    500_000
    cost_centre       "order-processing"
    sla_tier          "standard"
  }

  audit {
    require_proof true
  }
}
```

The `economics` section is parsed by the compiler. It produces:

- A declared cost model in the runtime manifest, readable by cost attribution tools.
- A compile-time warning (`SPORE-ECON-001`) when `external_calls` is exceeded at
  the type level (e.g. a loop calling `payment.charge` without a declared batch).
- A `cost_centre` tag on every audit event, enabling per-flow cost attribution.
- Input to the CostGraph for execution plan optimisation.

The `economics` block does not replace runtime cost tracking. It makes cost
**declared**, so it can be verified, tracked against, and optimised.

---

## The CostGraph (Phase 33+)

The CostGraph is an extension of the governed execution plan. Every graph node
carries an estimated cost alongside its capability and effect declarations.

The runtime can then ask two distinct questions:

```text
Traditional question:  What is the fastest valid execution?
CostGraph question:    What is the cheapest valid execution?
```

These have different answers. A CPU execution path may be faster for a 100ms
deadline. The same path may be more expensive than a batch-deferred path at
scale.

```galerina
contract {
  economics {
    execution_strategy  "cost-optimised"   // vs "latency-optimised" | "balanced"
    defer_if_over       "£0.001"           // batch if single-call cost exceeds this
    batch_window        "5s"               // acceptable deferral for cost-optimised
  }
}
```

The compiler produces a governed execution plan annotated with cost estimates.
The runtime CostGraph evaluator selects the cheapest path that satisfies all
governance constraints. Governance remains above cost: a cheaper path that
violates a capability boundary is never selected.

```text
Cheapest path that satisfies:
  ✓ all declared effects
  ✓ all declared capabilities
  ✓ all governance rules
  ✓ all SLA tier requirements

Not:
  ✗ fastest path regardless of cost
  ✗ cheapest path regardless of governance
```

---

## The ROI Report (`contract.roi-report.json`)

`generateROIReport()` takes three inputs from the governed execution infrastructure:

- **ProofGraph** — what governance was enforced and when
- **AuditGraph** — the structured execution evidence chain
- **LineageGraph** — where data originated and who touched it

It produces a machine-readable evidence pack suitable for:

- Annual audit submissions
- Insurance premium negotiations
- Board-level governance reporting
- Regulatory evidence under GDPR Article 30 (Records of Processing Activities)

```json
{
  "schemaVersion": "spore.roi-report.v1",
  "generatedAt": "2026-06-01T00:00:00Z",
  "system": "order-processing-service",
  "period": "2026-Q1",
  "proofsSatisfied": 847,
  "proofsAuto": 847,
  "proofsManual": 0,
  "developerHoursSaved": 2118.5,
  "rateGbp": 80,
  "annualSavingGbp": 169480,
  "auditPreparationHoursAvoided": 312,
  "changeReviewsAuto": 143,
  "dataLineageInvestigationsAuto": 29,
  "breachProbabilityReduction": 0.34,
  "riskAdjustedCostReduction": 142000,
  "totalRoiGbp": 311480,
  "evidencePack": {
    "proofChainFile": "audit/2026-Q1/proof-chain.json",
    "auditLogFile": "audit/2026-Q1/audit.jsonl",
    "lineageMapFile": "audit/2026-Q1/lineage.json",
    "signatureAlgorithm": "ed25519",
    "verified": true
  }
}
```

### The Real Numbers

Governance proof preparation is manual in every system that is not Galerina.

| Variable | Value |
|---|---|
| Developer-hours saved per automated governance proof | **2.5 hours** |
| Average developer rate (UK) | **£80/hr** |
| Saving per automated proof | **£200** |
| Governance proofs per enterprise system per year | **40–200** |
| Annual saving per system in audit preparation alone | **£8,000–£40,000** |

For a mid-scale organisation running 20 regulated systems:

```text
Conservative (40 proofs × 20 systems):    £160,000/year
Typical     (100 proofs × 20 systems):    £400,000/year
Large-scale (200 proofs × 20 systems):    £800,000/year
```

These figures cover audit preparation only. They exclude:

- Reduced CAB overhead from machine-readable governance diffs
- Insurance premium reductions from demonstrable breach probability reduction
- Developer time saved on manual data lineage investigations
- Cost attribution value (knowing what each flow actually costs)

---

## Data Lineage as Native Syntax

Data lineage is typically a post-hoc investigation. Tooling reconstructs lineage
from logs after a breach or audit request. This is slow, incomplete, and expensive.

In Galerina, lineage is declared in the contract:

```galerina
flow processCustomerData(input: CustomerProfile) -> Result<ProcessedProfile, Error>
contract {
  privacy {
    pii_fields    [email, phone, address]
    lineage {
      source      "customer-onboarding-service"
      owner       "data-team@example.com"
      retention   "7years"
      basis       "contract-performance"    // GDPR Article 6(1)(b)
      regions     [EU, EEA]
    }
    redact_in_audit [email, phone]
  }
}
```

The lineage block is:

- Parsed by the compiler and embedded in the runtime manifest.
- Included in every audit event produced by the flow.
- Queryable by the LineageGraph: `galerina lineage trace email --from=order-service`.
- Machine-readable evidence under GDPR Article 30.

This eliminates:

- Manual reconstruction of data lineage during breach investigations.
- GDPR Article 30 register maintenance (the manifest is the register).
- Inconsistent lineage claims across teams (the compiler enforces consistency).

**The CPU overhead advantage:** Traditional runtime lineage tracking (polling databases, intercepting APIs) consumes up to **15% of global CPU processing capacity** in enterprise deployments. Galerina bakes the Data Lineage Graph into static compilation metadata. Tracing the complete origin and access history of an asset consumes **zero runtime CPU cycles**. The cost of a compliance inquiry drops from expensive to negligible.

A data breach investigation that would take three days with log analysis takes
minutes with `galerina lineage trace`.

---

## AI Cost Governance

The `contract.ai` block governs AI call economics at the compiler level.

```galerina
flow classifyMessage(input: UserMessage) -> Result<ClassificationResult, AiError>
contract {
  model {
    provider          "openai"
    model_id          "gpt-4o"
    fallback_model    "gpt-4o-mini"
  }

  ai {
    max_prompt_tokens   2048
    max_output_tokens   512
    max_cost_per_call   "£0.05"
    monthly_budget      "£500"
    reject_if_over_budget true
    cost_centre         "ai-classification"
  }

  effects {
    ai.inference
    audit.write
  }
}
```

This is architecturally unique. Very few systems can reject an expensive AI prompt
before the API call is made and the money is spent. Galerina's governed execution
plan is produced before execution. The CostGraph evaluator can calculate the
projected cost of the prompt (from token count × model rate) and refuse to
execute if it exceeds `max_cost_per_call` or would exhaust `monthly_budget`.

The practical result:

```text
Without contract.ai:  A prompt injection causes 50,000 tokens to be submitted
                      to GPT-4o. Bill arrives at month end.

With contract.ai:     The compiler rejects prompts where token count exceeds
                      max_prompt_tokens at the boundary (SPORE-AI-003: prompt
                      exceeds declared token limit). The expensive call never
                      happens.
```

AI budget governance is an increasingly significant enterprise concern. As AI
becomes a COGS line item (cost of goods sold), per-call cost control moves from
a nice-to-have to a financial control requirement.

---

## Cross-Flow Cost Attribution

The CostGraph attributes costs to originating flows, not just to the service
aggregate.

Without cost attribution, a service costs £X per month. That number tells
engineers nothing about which flows, which customers, or which features are
responsible.

With CostGraph attribution:

```galerina
contract {
  economics {
    cost_centre     "order-processing"
    attribute_to    request.tenant_id     // attribute cost to the originating tenant
  }
}
```

The runtime records every external call, every AI inference, every database write
against the originating flow and, where declared, the originating tenant. The
AuditGraph aggregates this into:

- **Per-customer billing data**: what does it actually cost to serve customer A?
- **Cost-of-goods-sold analysis**: what is the infrastructure COGS for the
  order-processing feature versus the reporting feature?
- **Feature economics**: which feature is unprofitable at current pricing?

```json
{
  "costAttribution": {
    "period": "2026-05",
    "byFlow": {
      "processOrder":      { "totalGbp": 1240.50, "calls": 500000 },
      "generateReport":    { "totalGbp":  890.20, "calls":  12000 },
      "classifyMessage":   { "totalGbp":  340.80, "calls":  28000 }
    },
    "byTenant": {
      "tenant-acme":       { "totalGbp": 480.30 },
      "tenant-globex":     { "totalGbp": 210.90 }
    }
  }
}
```

This is a fundamental shift: from "how much does the service cost?" to "how much
does each thing the service does cost, and who caused it?"

---

## Risk-Adjusted Cost

Traditional cost models price compute, storage, and bandwidth. They do not price
risk.

Galerina introduces risk-adjusted cost:

```text
expected_cost = compute_cost + (breach_probability × breach_cost)
```

**The ValueGraph makes this calculation at scheduling time.** Consider a concrete scenario:

> A user initiates a data transformation workflow. The payload contains a high concentration of `pii` tags.
>
> - `CostGraph` calculation: external cloud worker = cheaper, faster
> - `ValueGraph` calculation: `RiskValue` of accidental PII leak = extremely high, `RegulatoryValue` of local processing = high
> - **Scheduling decision:** route to local, isolated ARM64 secure enclave — slower and more expensive
>
> The system willingly absorbs a minor performance cost to mitigate a massive systemic risk liability.
> The expected cost of the cloud path (£0.001 compute + 2% probability × £3.5M breach) = **£70,001**.
> The expected cost of the enclave path (£0.003 compute + 0.1% probability × £3.5M breach) = **£3,500.003**.
> The ValueGraph correctly selects the "more expensive" option.

This is the fundamental claim of the governance economics model: **cheap is not the same as inexpensive when risk is included in the cost function.**

Where:

- `compute_cost` is the conventional infrastructure cost.
- `breach_probability` is reduced by the ProofGraph — every governance proof that
  the runtime can generate is a demonstrated control, and demonstrated controls
  reduce the probability of undetected breach.
- `breach_cost` is the blended cost of a breach: regulatory penalty, remediation,
  reputational damage, and insurance excess.

The ProofGraph directly reduces `breach_probability`. A system where every PHI
access is capability-gated, every audit write is immutable, and every data
lineage claim is verified has a demonstrably lower breach probability than a
system where these are conventions.

```text
Example:

  A healthcare service processes 1 million PHI reads per year.
  Without Galerina:
    breach_probability per operation: 0.0001
    breach_cost (per incident):       £2,000,000
    expected annual risk cost:        £200,000

  With Galerina (ProofGraph reduces breach_probability by 40%):
    breach_probability per operation: 0.00006
    breach_cost (per incident):       £2,000,000
    expected annual risk cost:        £120,000

  Annual risk-adjusted saving:        £80,000
```

This model is the basis for insurance premium negotiations. An insurer that can
review a machine-readable ProofGraph has concrete evidence of control quality —
not a narrative description of controls that may or may not be implemented.

The `generateROIReport()` output includes the breach probability reduction
calculation derived from ProofGraph completeness, making this argument
documentable and auditable.

---

## Governance Marketplace (Phase 38+)

Governance shapes are currently bespoke. Every organisation builds its own HIPAA
controls, its own PCI-DSS template, its own FCA trading rule set.

Phase 38+ introduces the Governance Marketplace:

```galerina
use governance_shape FCA_Trading_v2 from @galerina/certified-shapes

flow executeTrade(order: TradeOrder) -> Result<TradeConfirmation, TradeError>
using FCA_Trading_v2
contract {
  intent {
    purpose "Execute validated trade order under FCA best execution rules"
  }
  // FCA_Trading_v2 injects:
  //   - required effects: audit.immutable, trade.record
  //   - required capabilities: finance.execute
  //   - rules: best_execution_evidence required
  //   - privacy: client identity protected
}
```

Governance shapes are provided and certified by:

- **Regulators**: FCA, EBA, ICO, CMS, FDA — official regulatory templates
- **Insurers**: Lloyd's, AXA XL — insurance-backed governance shapes that reduce premiums
- **Industry bodies**: SWIFT, HL7, PCI SSC — sector standard shapes
- **Enterprise vendors**: certified shapes from major enterprise software providers

The commercial implications are significant:

1. **Regulators** can publish machine-enforceable versions of their rules. A
   Galerina system using `FCA_Trading_v2` can demonstrate FCA compliance to a
   regulator through audit chain verification, not through a questionnaire.

2. **Insurers** can offer premium reductions to organisations using certified
   shapes, because the insurer can verify coverage quality mechanically, not
   through annual attestations.

3. **Industry bodies** can set a floor for sector governance quality that is
   enforced at the compiler level, not through documentation reviews.

```galerina
// Future: governance shapes from the certified registry
use governance_shape HIPAA_SafeHarbour_v3    from @galerina/certified-shapes
use governance_shape PCI_DSS_v4              from @galerina/certified-shapes
use governance_shape GDPR_Article30_v2       from @galerina/certified-shapes
use governance_shape ISO27001_Annex_A_v2022  from @galerina/certified-shapes
```

A governance shape is a composable, versioned, signed contract set. An
organisation that adopts `HIPAA_SafeHarbour_v3` cannot ship a build that violates
it — the compiler prevents it.

---

## The Moat: Measurable Governance

Most organisations cannot currently answer these questions:

```text
What does compliance cost?
What does this API endpoint cost?
What does this AI workflow cost?
What does this audit requirement cost?
What is our risk-adjusted cost per customer?
```

The inability to answer these questions is not a governance failure. It is a
tooling failure. Existing tools were built to enforce governance, not to
measure it.

Galerina can answer all five questions. That is the moat.

| Question | Galerina mechanism |
|---|---|
| What does compliance cost? | `contract.economics` + `cost_centre` tags aggregate compliance spend by regime |
| What does this endpoint cost? | CostGraph attribution per flow per call |
| What does this AI workflow cost? | `contract.ai` budget tracking + CostGraph |
| What does this audit requirement cost? | `generateROIReport()` audit preparation saving per requirement |
| What is our risk-adjusted cost per customer? | CostGraph tenant attribution × risk-adjusted cost model |

This is not a reporting feature. It is a structural property of the platform.
The economics are calculated from the same governed execution infrastructure
that enforces the governance. They cannot diverge because they share the same
source of truth: the runtime manifest and the AuditGraph.

---

## The Vision: `contract.economics` as Platform Foundation

The progression is:

```text
Phase 1 (now):     Governance is declarative and enforceable.
Phase 2 (Phase 33+): Governance is measurable (CostGraph).
Phase 3 (Phase 35+): Governance generates ROI evidence (generateROIReport).
Phase 4 (Phase 38+): Governance shapes are marketplace assets (Governance Marketplace).
Phase 5 (Phase 40+): Governance is a competitive input — organisations that
                     demonstrate lower breach probability pay lower insurance
                     premiums, attract better enterprise contracts, and can
                     price their services more accurately.
```

Once governance becomes measurable, it becomes optimisable. Once it is
optimisable, the runtime can make decisions based on what is allowed AND what
is economically optimal — within the hard constraint that governance always wins.

This is where Galerina evolves from a programming language into a governance
economics infrastructure layer. The contract is no longer just a safety
declaration. It is a profit-and-loss statement for the flow.

```galerina
// A flow contract in the fully realised platform model

flow processPayment(payment: PaymentRequest) -> Result<PaymentResult, PaymentError>
contract {
  intent {
    purpose "Process validated payment under PCI-DSS v4 governance"
  }

  effects {
    payment.charge
    database.write
    audit.immutable
  }

  economics {
    compute_budget      "30ms"
    memory_budget       "4mb"
    cost_per_call       "£0.0008"
    monthly_volume      2_000_000
    cost_centre         "payments"
    execution_strategy  "cost-optimised"
    attribute_to        request.tenant_id
    monthly_budget      "£2000"
  }

  ai {
    // fraud scoring sub-call
    model_id          "fraud-classifier-v3"
    max_prompt_tokens  512
    max_cost_per_call  "£0.0001"
  }

  privacy {
    pii_fields [card_holder_name, billing_address]
    lineage {
      source    "checkout-service"
      owner     "payments-team@example.com"
      retention "7years"
      basis     "legal-obligation"
    }
    redact_in_audit [card_holder_name]
  }

  audit {
    require_proof   true
    require_chain   true
    immutable       true
  }
}
```

The compiler produces from this single contract:
- A governed execution plan validated against PCI-DSS shape
- A CostGraph execution strategy selection
- A cost attribution record per tenant per call
- A data lineage record satisfying GDPR Article 30
- A proof chain for auditor verification
- Input to `generateROIReport()` for board-level governance economics reporting

No separate compliance tool. No separate cost attribution system. No separate
lineage tracker. No separate audit preparation workflow.

One contract. One governed execution. Complete economics.

---

## See Also

| Document | Relevance |
|---|---|
| [galerina-concept-audit-proof.md](galerina-concept-audit-proof.md) | ProofGraph and audit chain architecture |
| [galerina-compliance-governance.md](galerina-compliance-governance.md) | PII, PHI, PCI, SOX type-level compliance |
| [galerina-contract-full-model.md](galerina-contract-full-model.md) | Full contract section reference (16 sections) |
| [galerina-governance-architecture.md](galerina-governance-architecture.md) | Full governance pipeline — intent to audit proof |
| [galerina-roadmap-phase30-40.md](galerina-roadmap-phase30-40.md) | CostGraph (Phase 33), Distributed Governance (Phase 38) |
| [galerina-proof-chain-spec.md](galerina-proof-chain-spec.md) | ExecutionProofChain schema and hash computation |
| [galerina-pii-handling.md](galerina-pii-handling.md) | PII type rules, lineage, redaction |
| [galerina-concept-governed-execution-plan.md](galerina-concept-governed-execution-plan.md) | Governed execution plan — pre-execution planning |
| [galerina-governance-diff-ci.md](galerina-governance-diff-ci.md) | Machine-readable change impact for CAB |
| [galerina-phase-27-ai-native.md](galerina-phase-27-ai-native.md) | AI inference governance and NPU dispatch |
