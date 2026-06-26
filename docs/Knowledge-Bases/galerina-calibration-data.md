# Galerina — Calibration Data (Phases 29, 33, 37)

**Version: 1.0 — 2026-06-01**
**Status: Canonical empirical baseline for CostGraph + ValueGraph.**
**Sources: Intel ARK, DigitalOcean pricing, OpenAI pricing, IBM/Ponemon 2025 Cost of a Data Breach.**

---

## 1. Hardware Profiles (Phase 33)

### Canonical Performance Machine — i9 Desktop ("truth")

```typescript
export const i9Desktop = {
  cpu: {
    model: "Intel_Core_i9_9900K",
    architecture: "Coffee_Lake",
    topology: "symmetric",          // NO P/E-core split
    cores: 8,
    threads: 16,
    base_clock_hz: 3.6e9,
    max_turbo_hz: 5.0e9,
    l3_cache_bytes: 16 * 1024 * 1024,
    vector: ["sse4_1", "sse4_2", "avx2"],
    avx512: false,                  // Coffee Lake has NO AVX-512
  },
  gpu: {
    model: "Asus_ROG_Strix_GeForce_RTX_2060_OC",
    vendor: "nvidia",
    architecture: "Turing",
    memory_bytes: 6 * 1024 * 1024 * 1024,
    role: "optional_cuda_or_webgpu_accelerator",
    governance_mode: "native_provider_required",
  },
};
```

> Note: original spec said "i9 8899K" — corrected to **i9-9900K** (Coffee Lake, 8c/16t,
> 3.6GHz base / 5.0GHz turbo, 16MB L3, AVX2, no AVX-512). Intel ARK confirmed.

### Development Machine — i5 Laptop (current dev rig)

```typescript
export const i5Laptop = {
  cpu: {
    model: "Intel_Core_i5_11400H",
    architecture: "Tiger_Lake_H",
    topology: "symmetric",          // 11th-gen H, no P/E split
    cores: 6,
    threads: 12,
    base_clock_hz: 2.69e9,
    max_turbo_hz: 4.5e9,            // ~4.36GHz observed
    l1_cache_bytes: 480 * 1024,
    l2_cache_bytes: Math.round(7.5 * 1024 * 1024),
    l3_cache_bytes: 12 * 1024 * 1024,
    vector: ["sse4_1", "sse4_2", "avx2"],
    avx512: false,                  // Tiger Lake H mobile: no AVX-512
  },
  gpu: {
    model: "NVIDIA_GeForce_RTX_3050_Ti_Laptop",
    vendor: "nvidia",
    architecture: "Ampere",
    dedicated_memory_bytes: 4 * 1024 * 1024 * 1024,
    shared_memory_bytes: Math.round(7.9 * 1024 * 1024 * 1024),
    directx: "12_FL_12_2",
    role: "optional_cuda_or_webgpu_accelerator",
  },
};
```

### Hardware Routing Rules (both machines)

```
CPU:
  Use AVX2 path — NOT AVX-512 (neither machine has it).
  No P/E-core scheduling — treat all cores as symmetric.
  i9: 8 cores for parallelism. i5: 6 cores.

GPU (RTX 2060 6GB / RTX 3050 Ti 4GB):
  Useful for CUDA / WebGPU experiments, tensor prototypes, local AI.
  Do NOT treat GPU memory as a security boundary by itself.
  Require signed/native provider + audit + CPU fallback.
```

### i5 ⇄ i9 Equivalence (Confirmed)

The i5 laptop and i9 desktop are **architecturally equivalent for Galerina**:
- Both route to the AVX2 tier (neither has AVX-512) → same compiler hardware path
- Both symmetric topology → same scheduler, no P/E logic
- Both CUDA/WebGPU GPUs under native-provider governance
- i5 is newer (Tiger Lake, better IPC); i9 has more cores + higher clock (faster absolute)

**Conclusion:** Develop and benchmark on the i5 freely. Results are *proportionally*
identical (traffic-light colours match). The i9 is the canonical "truth" machine for
final published figures — re-run benchmarks there before release, but no code or
architecture changes are needed to move between them. The i5 is a valid CI/dev machine.

This means the **Two-Tier Hardware Design** (Phase 33) routes to **AVX2** as the top tier,
never AVX-512. The benchmark `Rust AVX-512` column will always be `—` on these machines.

---

## 2. Cloud Pricing — DigitalOcean (Phase 29)

```typescript
export const digitalOceanPricing = {
  // Terminable droplets — billed per second, 60-second minimum.
  droplet_basic_1gb:  { hourly_usd: 0.00893, ram_gb: 1 },
  droplet_basic_2gb:  { hourly_usd: 0.01786, ram_gb: 2 },  // if Node/WASM needs more RAM
  bandwidth_overage_per_gib_usd: 0.01,
  billing: "per_second_60s_minimum",
};
```

**Key for the terminable model:** DigitalOcean bills per second (60s min) → the Galerina
service can spin up, serve, and terminate cheaply. This validates the
"terminable when not in use" deployment requirement.

**Phase 29 baseline:** Basic 1GB droplet at **$0.00893/hr** (or 2GB at $0.01786/hr).

---

## 3. AI Pricing — OpenAI (Phase 29, per 1M tokens)

```typescript
export const openAiPricing = {
  // Per 1M tokens. Divide by 1000 for per-1K-token.
  "gpt-5.5": {
    input_usd_per_1m: 5.00,
    cached_input_usd_per_1m: 0.50,
    output_usd_per_1m: 30.00,
    role: "high_value_reasoning_review",
  },
  "gpt-5.4-mini": {
    input_usd_per_1m: 0.75,
    cached_input_usd_per_1m: 0.075,
    output_usd_per_1m: 4.50,
    role: "routine_ai_assistance",
  },
};
```

**CostGraph AI_cost term:**
```
AI_cost = (input_tokens / 1e6 × input_price)
        + (cached_tokens / 1e6 × cached_price)
        + (output_tokens / 1e6 × output_price)
```

**Recommendation:** `gpt-5.4-mini` for routine; `gpt-5.5` for high-value review.

---

## 4. Breach Cost Matrix — IBM/Ponemon 2025 (Phase 37)

```
Global average breach cost:  $4.44M  (down slightly)
US average breach cost:      $10.22M (all-time record — regulatory escalation)
```

### Per-Record Loss (the breach_loss term)

```typescript
export const Phase37RiskMatrix = {
  Public:                0,
  Employee_Data:         138,   // $/record
  Healthcare_PHI:        142,
  Financial_Record:      155,
  Customer_PII:          160,   // most frequently targeted (53% of breaches)
  Intellectual_Property: 178,   // costliest (long-term valuation destruction)
};
```

### Industry Baselines (total average loss per incident)

```typescript
export const industryBreachBaseline = {
  Healthcare:              7.42e6,   // #1 for 14 consecutive years
  Financial_Services:      5.56e6,
  Industrial_Manufacturing: 5.00e6,
};
```

### Risk Modifiers (continuous cost inflators)

```typescript
export const riskModifiers = {
  multi_environment_penalty: 1.04e6,  // delta: multi-cloud ($5.05M) vs pure on-prem ($4.01M)
  shadow_ai_accelerator_tax: 0.67e6,  // ungoverned external AI / unvetted runtime (+$670K)
};
```

---

## 5. The Risk Routing Algorithm (Phase 37)

```typescript
function calculateRiskCost(
  classification: DataClassification,
  recordCount: number,
  breachProbability: number,    // from node vulnerability matrix (ProofGraph)
  isMultiCloud: boolean,
  isUngovernedNpu: boolean,
): number {
  let loss = Phase37RiskMatrix[classification] * recordCount;
  if (isMultiCloud)     loss += riskModifiers.multi_environment_penalty;
  if (isUngovernedNpu)  loss += riskModifiers.shadow_ai_accelerator_tax;
  return breachProbability * loss;   // risk_cost = P(breach) × loss
}
```

### Decision Matrix

```
risk_cost < $1,000   → Standard Track (ProofLevel 1)
                       Static check, raw-speed AVX2 lanes on i9, no sealing.

risk_cost ≥ $1,000   → Escalated Track (ProofLevel 2/3)
                       CPU-Sovereign memory + Immutable Input/Output Seals,
                       even when running locally on the RTX 2060.
```

**Example:** 20,000 records of Customer_PII = 20,000 × $160 = $3.2M loss.
At even 0.1% breach probability → $3,200 risk_cost → **Escalated Track** → seals enforced.

**Example:** 5 public log files → ~$0 risk_cost → **Standard Track** → wire-speed AVX2.

This binds **applied economics to the machine layer** — the compiler forces tighter
security on physical hardware exactly when financial liability rises.

---

## See Also
- `galerina-roadmap-next10-phases.md` — Phases 29, 33, 37
- `galerina-core-economics-package.md` — CostGraph total_cost formula
- `galerina-hardware-compute-fabric.md` — ProofLevel escalation, Input/Output Seals
- `galerina-hardware-nvidia.md` — RTX governance (native provider required)
