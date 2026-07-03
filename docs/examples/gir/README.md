# GIR examples (`fungi.gir.v1`) — generated from `.fungi`, not hand-authored

Each `*.gir.json` here is the **GIR** (Galerina's single in-memory logic IR) for a real `.fungi` example, **serialized straight from
the shipped compiler**. They are produced by `gen-gir.mjs` — which runs the compiler's own `parseProgram → checkEffects → emitGIR`
pipeline — so they **cannot drift** from the compiler and contain **no hand-authored numbers**.

> **Naming (owner, 2026-07-02).** `.gate` is the **light-ASCII "draw-don't-code" authoring *language*** (`SPEC-gate-language.md`
> v0.4) — app-level source, not an IR. **GIR is the IR** (an ordinary graph; the compiler's one in-memory logic IR). This folder was
> previously `docs/examples/gate/` and held hand-authored placeholders under a `.gate` / `.lmanifest.json` extension asserting the old
> *"`.gate` = the back-of-pipeline signed IR"* model — that model is the **superseded v1 framing** and is machine-DISMISSED as
> `M-backIR` in `proofs/rd-0232-gate-model-proof.mjs`. The folder is now `gir/`, the artifacts are `*.gir.json` (`fungi.gir.v1`), and
> they are **real compiler output**. For the `.gate` *authoring language*, see `ZT-Galerina-GRAPH-ASCII-v2/examples/*.gate`.

## Regenerate

```
node docs/examples/gir/gen-gir.mjs --emit docs/examples/gir      # emit the curated set
node docs/examples/gir/gen-gir.mjs                               # self-test on one example
```

`gen-gir.mjs` finds the repo root, imports `@galerina/core-compiler` (`dist/index.js`), and for each `.fungi` source emits a
deterministic `fungi.gir.v1` artifact (the timestamp is stripped so re-running only changes a file when its source changes). To add an
example, add a `[name, 'Level-N/dir']` row to the `CURATED` list.

## Signing is a separate step

These GIR artifacts are **unsigned** — GIR is descriptive. Admission is a **separate** concern: the compiler signs the runtime **IR
digest** into an `.lmanifest` (`Ed25519 + ML-DSA-65`), and the ML-DSA half is gated on key custody (DRCM #34). Sign the **IR**, never
the `.gate`/`.fungi` source (swap-test proven, `proofs/rd-0232-gate-model-proof.mjs`). Topology is never the authority — a valid
signature over a capability set is.

## The examples

| file | source `.fungi` | flow | demonstrates |
|------|-----------------|------|--------------|
| `001-pure-flow.gir.json`               | `Level-1-Basics/001-pure-flow`               | `calculateVat` | pure flow, **no effects** — minimal GIR |
| `104-multiple-effects.gir.json`        | `Level-3-Effects/104-multiple-effects`       | `syncOrder` | three effects |
| `173-validation-chain.gir.json`        | `Level-4-Security/173-validation-chain`      | `processUserEmail` | raw → validate → protected → redact → audit |
| `224-contract-best-practices.gir.json` | `Level-5-Governance/224-contract-best-practices` | `getPatientProfile` | full contract (privacy, audit, context, observability) |
| `208-audit-proof-required.gir.json`    | `Level-5-Governance/208-audit-proof-required` | `deletePatient` | destructive delete with mandatory audit evidence |
| `365-ai-summary-flow.gir.json`         | `Level-7-AI/365-ai-summary-flow`             | `scoreHealthRisk` | `ai.inference` + tensor + compute governance |
| `453-financial-payment-charge.gir.json`| `Level-9-Enterprise/453-financial-payment-charge` | `chargePayment` | `Money<GBP>` payment; extended effect `payment.charge` |
| `465-enterprise-summary.gir.json`      | `Level-9-Enterprise/465-enterprise-summary`  | `createAndScorePatient` | every layer: PII/PHI, AI, compute, policy, audit |

## Field reference (real compiler shapes)

- `gir-emitter.ts` — `GIRFlow`, `emitGIR`, `EFFECT_TO_CAPABILITY`, tensor/affinity/proof derivation.
- `type-registry.ts` — `EffectFlags` / `effectsToFlags` (the `allowedEffectsMask` bitset: `database.read=1, database.write=2,
  network.outbound=4, audit.write=8, ai.inference=16, …`; unknown effects are name-tracked, contribute 0 — never silently granted).
- `capability-types.ts` — `CAPABILITY_BIT_POSITION` (V_DPM layout; `database.read = -1`, read-only; extended domain effects not yet
  bit-wired also `-1`).
- `manifest-generator.ts` — `LManifest`, `PolicyResolutionDag`, placeholder signature (the *signing* layer, separate from GIR).
- `proofs/rd-0232-gate-model-proof.mjs` — proves `.gate` = source and GIR = the one in-memory IR (the old `.gate`-as-signed-IR framing is dismissed).
