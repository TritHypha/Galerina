# Galerina — Governance Verifier Architecture

## Status

```
Stage A baseline:   SPORE-GOV-002..012, SPORE-CONTEXT-001, profiles (dev/production/deterministic) ✅
Phase 18F:          GovernanceFlags bitset, RuntimeManifest, buildRuntimeManifest() ✅
Phase 19+:          GovernanceGraph, authority graph precomputation
Phase 20+:          Full runtime manifest with audit chain, package boundary checks
Phase 21+:          APU/NPU/photonic governance hints
```

## Principle

```
The Governance Verifier should turn contracts into deployable proof obligations
and runtime manifests.

Governance should be proven before deployment, not guessed at runtime.
```

---

## Pipeline Position

```
Lexer → Parser → AST
  → Symbol Resolver
  → Type Checker
  → Value-State Checker
  → Effect Checker
  → Governance Verifier    ← here
  → GovernanceProof / RuntimeManifest
```

---

## What the Verifier Proves

```
intent      — flows declare what they do and why
effects     — effects are consistent with declared authority
policy      — policy purposes do not contradict declared effects
compute     — denied targets are not used
audit       — governed sinks are backed by audit evidence
response    — protected PII cannot leave through denied response fields
authority   — authority blocks declare a reason
context     — required context fields are accessed
```

---

## GovernanceFlags (Internal Bitset)

Fast bit-operation checks replace repeated string traversal:

```
RequiresAudit     — flow uses a governed sink that mandates audit.write
DenyRemote        — flow denies remote.execution (compute governance)
ContainsPII       — flow handles protected or redacted PII data
AllowsNetwork     — flow declares or uses network.outbound
RequiresActor     — flow contract.context requires actor / user_id
ProductionStrict  — flow is in production profile and verified error-free
RequiresIntent    — flow is a secure flow and must have an intent declaration
```

Benefit: `actualMask & forbiddenMask === 0` replaces nested string checks.

---

## RuntimeManifest

Compact per-flow JSON for runtime execution:

```json
{
  "flow": "createCustomer",
  "qualifier": "secure",
  "requiresAudit": true,
  "deniesRemote": true,
  "allowedEffects": ["database.write", "audit.write"],
  "requiredContext": ["actor", "trace_id"],
  "computeTarget": "best",
  "governanceFlagsMask": 3,
  "proofObligations": ["audit.write required by database.write"],
  "policyPurposes": ["write-access"],
  "verified": true
}
```

The runtime EXECUTES from this manifest — it does not re-verify governance.
The manifest is signed by the compiler via the attestation system.

---

## GovernanceGraph (Phase 19+)

```
Flow
  → Contract
  → Effects
  → Policies
  → Authority (with reason)
  → Audit obligations
  → Compute target rules
  → Response/privacy rules
```

Feeds:
- SemanticGraph
- PassiveExecutionPlan
- RuntimeManifest
- galerina.ai.json

---

## Authority Graph Precomputation (Phase 19+)

IAM-style role inheritance:

```
Admin inherits Manager
Manager inherits Staff
Staff can read
```

Precompute the authority closure so the verifier does not traverse role trees on every check.

Benefit: large enterprise projects, package policies, public-sector deployments.

---

## Production Profiles

Already implemented:
```
"dev"           → info/warning
"check-only"    → warning
"production"    → error
"deterministic" → strict error
```

Future: profile-aware RuntimeManifest generation (production manifests omit dev-only fields).

---

## Diagnostic Code Table

| Code | Name | Rule |
|---|---|---|
| `SPORE-GOV-002` | `MISSING_AUDIT_FOR_GOVERNED_SINK` | database.write/payment.charge without audit.write |
| `SPORE-GOV-003` | `PROTECTED_DATA_IN_RESPONSE` | denied field in response |
| `SPORE-GOV-004` | `DENIED_TARGET_SELECTED` | compute.deny conflicts with network.outbound |
| `SPORE-GOV-005` | `POLICY_PURPOSE_MISMATCH` | purpose "read-only" + database.write |
| `SPORE-GOV-007` | `AUTHORITY_BLOCK_MISSING_REASON` | authority block has no reason |
| `SPORE-GOV-008` | `EXPERIMENTAL_CODE_IN_PRODUCTION_PROFILE` | experimental in production |
| `SPORE-GOV-009` | `PRIVILEGED_FLOW_MISSING_CAPABILITY` | privileged flow with no declared capability |
| `SPORE-GOV-010` | `INTENT_MISSING_ON_SECURE_FLOW` | secure flow without intent |
| `SPORE-GOV-011` | `UnknownContractSet` | use SetName references undeclared contract set |
| `SPORE-GOV-012` | `ContractSetRequirementNotMet` | contract set audit requirement not met |
| `SPORE-CONTEXT-001` | `REQUIRED_CONTEXT_NOT_ACCESSED` | required context field never accessed |

---

## Response / Privacy Governance

Current:
- `contract.response.denies email` vs returned fields → SPORE-GOV-003

Future (Phase 19+):
- `protected PII cannot leave response unless response.exposes allows it`
- `redacted PII may go to audit/logs (but not raw response)`

---

## Hardware Governance

Governance does NOT schedule hardware. It proves what is allowed:

```
deny remote.execution → enforced by SPORE-GOV-004
readonly data → proven by value-state checker (ReadOnly flag)
fixed privacy policy → proven by contract.privacy
```

The ExecutionPlanner uses these proofs to select safe compute paths:
```
deny remote + readonly + fixed policy → NPU local inference eligible
```

---

## Legacy to Demote

Avoid string hacks like:
```
identifier value: "qualifier:privileged"
value.startsWith("privileged:")
```

Prefer: proper `NodeFlags.IsSecure`, `FlowMeta.qualifier`, structured AST fields.

Phase 19: migrate remaining string-parsing patterns in governance-verifier.ts to use NodeFlags.

---

## Implementation Status

| Feature | Status |
|---|---|
| SPORE-GOV-002..012, SPORE-CONTEXT-001 | ✅ Stage A |
| Profiles (dev/production/deterministic/check-only) | ✅ Stage A |
| PURPOSE_DENIED_EFFECTS map | ✅ Stage A |
| Intent required for secure flows | ✅ Stage A |
| Denied target checks | ✅ Stage A |
| AI inference compute hints | ✅ Stage A |
| GovernanceFlags bitset | ✅ Phase 18F |
| RuntimeManifest interface + buildRuntimeManifest() | ✅ Phase 18F |
| GovernanceVerifyResult.governanceFlagsByFlow | ✅ Phase 18F |
| GovernanceGraph | 📋 Phase 19 |
| Authority graph precomputation | 📋 Phase 19 |
| Full runtime manifest with audit chain | 📋 Phase 20 |
| Package boundary governance checks | 📋 Phase 20 |
| APU/NPU/photonic governance hints | 📋 Phase 21 |
