# Galerina — Intent-Guided Optimisation (IGO)

## Status

```
Adopted — Phase 8+ runtime architecture concept
Public name: Intent-Guided Optimisation (IGO)
Internal module name: GIRT (Governed Intent-Guided Runtime)
```

## TL;DR
- Intent is a signal for optimisation, not a grant of authority
- The runtime learns workload patterns and optimises within governance bounds
- Learned preferences must expire, be bounded, and be auditable — the anti-entropy rule
- IGO works for all future targets: GPU, NPU, photonic, quantum

---

## The One-Line Definition

> **Intent is a signal for optimisation, not a grant of authority.**

This single sentence captures the entire Galerina IGO philosophy. Intent declarations
guide the runtime toward better execution strategies. They never grant permission
to use denied targets, add effects, or relax governance.

---

## Naming Convention

| Name | Used for |
|---|---|
| **IGO** (Intent-Guided Optimisation) | Public concept, docs, examples, external communication |
| **GIRT** (Governed Intent-Guided Runtime) | Internal runtime module name, if needed |

Use IGO in all external-facing documentation. GIRT is implementation vocabulary.

---

## Core Architecture

```
Galerina Source (intent declared)
      ↓
Governed IR (effects, denied targets, proof obligations)
      ↓
GIRT / IGO Runtime (learns workload, selects targets)
      ↓
Target Bridge (CPU / GPU / NPU / Photonic / Quantum)
      ↓
Audit Proof (what ran, on what target, why)
```

The GIRT layer observes workload patterns and builds learned preferences.
It operates between the GIR (fixed) and the target bridge (variable).
It cannot modify GIR semantics.

---

## The Anti-Entropy Rule — Expiring, Bounded, Auditable Preferences

Without expiry, learned runtime preferences can drift into stale or unsafe
behaviour. A runtime that learned GPU is fastest in 2025 may make wrong decisions
in 2026 when NPU availability changes, costs shift, or model architectures change.

**The anti-entropy rule:** learned preferences must expire and re-prove themselves
under current conditions.

### Runtime Profile Schema

```yaml
runtime_profile:

  workload: ai_inference

  learned_preferences:
    preferred_target: gpu
    confidence: 0.92
    evidence_count: 240000

  governance_bounds:
    denied_targets:
      - remote.execution
    max_confidence: 1.0         # allowed to reach full confidence
    audit_at_confidence: 0.8   # requires audit trail once confidence exceeds this

  stale_after: "2026-07-01T00:00:00Z"  # profile expires and must re-learn
```

### Why each field matters

| Field | Purpose |
|---|---|
| `confidence` | How certain the runtime is about the preferred target (0.0–1.0) |
| `evidence_count` | Number of observations that built this preference |
| `denied_targets` | Governance bounds — these are never overridden |
| `audit_at_confidence` | Once confidence crosses this threshold, all target selections are audited |
| `stale_after` | ISO 8601 expiry — after this date the runtime re-learns from scratch |

### The expiry analogy

The `stale_after` field is analogous to certificate expiry — it's not that the
information was wrong, it's that you cannot trust old information in production
without re-verification. Forcing re-learning prevents governance drift.

### Confidence ceiling

The `audit_at_confidence` threshold (e.g. 0.8) prevents the runtime from reaching
"certainty" without audit oversight. Once the runtime becomes highly confident
about a target, all selections must be recorded in the audit trail for governance
review. High-confidence preferences are more likely to become load-bearing
assumptions — that's exactly when audit evidence is most important.

---

## Intent as a Learning Signal

Intent declarations are parsed for workload classification signals:

```galerina
intent "Classify inbound messages locally without remote execution"
```

The runtime can infer from this intent:
- AI inference workload → model warmup is useful
- "locally" → remote execution must remain denied
- "without remote execution" → `deny [remote.execution]` is validated against intent
- NPU/GPU may be preferred if governance allows

```galerina
intent "Score fraud risk locally"
```
- AI inference workload → prefer NPU/GPU
- "locally" → confirms `deny [remote.execution]` is intentional
- High-frequency workload likely → batching beneficial

### The learning boundary

| The runtime may learn | The runtime may not learn |
|---|---|
| Which target performs best for this workload | Whether a denied target is "actually fine" |
| When to batch requests | Whether validation is "slow enough to skip" |
| Which model warmup strategy is optimal | Whether audit is "unnecessary overhead" |
| How to pre-schedule based on intent hints | What authority the intent grants |

---

## IGO and Future Compute Targets

IGO works especially well for future hardware because all advanced targets
require workload classification before choosing an execution strategy.

### GPU

The runtime learns which CUDA kernels and stream scheduling strategies are fastest
for this workload. Intent saying "high-throughput inference" guides the GPU planner
without source changes.

### NPU

NPUs have fixed compilation graphs. IGO gives the backend enough information to
pre-compile the right graphs. `intent "Classify text locally"` tells the NPU bridge
what to cache.

### Photonic

Photonic systems have warmup costs (calibration, phase tuning) and wavelength-domain
constraints that are workload-specific. IGO is arguably essential for photonic
targeting — without intent, the runtime cannot know when to invest in calibration.

### Quantum

Quantum targeting is more constrained than classical targets. NISQ (Noisy
Intermediate-Scale Quantum) systems are still limited in qubit count and
decoherence time. The QIR and OpenQASM standards already show why specialised
bridge layers are necessary.

**Recommendation:** Galerina quantum support remains **target-bridge based**.
IGO can classify workloads as quantum-suitable (optimisation problems, sampling,
search) but the quantum bridge handles all circuit-level decisions.

```galerina
intent "Optimise route plan using best available compute"
```

The GIRT layer classifies this as an optimisation workload and offers it to
the quantum bridge as a candidate. The quantum bridge decides whether the
current hardware is capable and calibrated for the specific problem size.

The source never changes. The bridge handles NISQ limitations.

---

## Audit Integration

The runtime profile artifact is part of the audit chain:

```yaml
# Emitted alongside the JSONL audit stream
runtime_profile:
  workload: ai_inference
  actual_target: gpu          # what actually ran
  requested_preference: npu  # what IGO preferred
  fallback_reason: "npu calibration timeout"
  governance_changes: none
  security_changes: none
  confidence_at_execution: 0.87
  evidence_at_execution: 238500
```

The audit proof chain (Layer 5) must hash the runtime profile alongside the
audit log. This prevents post-hoc modification of the "what target was used"
record.

---

## Deterministic Mode

For regulated environments where adaptive behaviour creates audit complexity:

```galerina
runtime deterministic
```

In deterministic mode:
- No target learning occurs
- No preferences are built
- The compute target declared in source is used exactly as specified
- Profile artifact records `adaptive: false`

Deterministic mode is required for: government systems, healthcare, defence,
and any deployment where identical execution planning must be provable across
all runs.

---

## Implementation Plan

### Phase 8 — Foundation

- `src/runtime-profile.ts` — `RuntimeProfile` type, profile loading, expiry check
- `src/girt.ts` — GIRT planner stub, preference recording, confidence tracking
- JSONL audit writer integration — profile emitted alongside audit events

### Phase 9 — Learning

- Flow-level workload classification from declared effects and intent
- Per-target performance tracking (latency, throughput, accuracy)
- Confidence scoring with `evidence_count` tracking
- Auto-suggestion of `compute target` blocks when `SPORE-HINT-COMPUTE-001` fires

### Phase 10 — Full IGO

- Expiry enforcement (`stale_after` checked on startup)
- `audit_at_confidence` threshold monitoring
- Cross-deployment preference sharing (for identical flows)
- Quantum and photonic workload classification

---

## See Also

- `docs/Knowledge-Bases/galerina-adaptive-runtime-profiles.md` — runtime modes
- `docs/Knowledge-Bases/galerina-architecture-layers.md` — five-layer model
- `docs/Knowledge-Bases/galerina-proof-chain-spec.md` — audit proof chain
- `docs/Knowledge-Bases/galerina-compute-target-optimisation.md` — GIR tensor metadata
- `docs/Knowledge-Bases/galerina-quantum-target-bridge.md` — quantum architecture
