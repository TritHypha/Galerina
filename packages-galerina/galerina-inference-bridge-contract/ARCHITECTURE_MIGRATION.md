# Migration: extracting `@galerina/inference-bridge-contract`

Date: 2026-06-06 · Resolves audit finding **CF-4** (Brawn imported Brain internals)
and enables **CF-3** (signed bridge attestation).

## What moved

Out of `galerina-tower-citizen` and into this neutral, **zero-dependency** package:

| Symbol | Old home | New home |
|---|---|---|
| `PrecisionTechnique`, `SchedulingTechnique`, `InferenceOpClass` | `tower-citizen/src/precision-strategy.ts` (defs) | `src/precision-types.ts` |
| `InferenceBridge`, `BridgeOp`, `BridgeResult`, `BridgeRegistry`, `assertDeterminism` | `tower-citizen/src/bridge/interface.ts` | `src/bridge.ts` |
| `FixedScale` (new — fixed-point ternary scale) | — | `src/bridge.ts` |
| `BridgeManifest`, `BridgeAttestation`, `canonicalManifestString`, `validateManifestShape` (new — CF-3) | — | `src/manifest.ts` |
| `TernaryOracle`, `oracleAgrees` (new — determinism oracle interface) | — | `src/oracle.ts` |

## What did NOT move (stays in the Tower — the "Brain")

`HybridInferenceEngine`, `TowerRuntime`, `GovernanceEnforcer`, `AuditLogger`,
`PluginSandbox`, and the reference **`TPLSimulator` / `StubTernaryBridge` oracle
implementation**. The contract package is types + tiny pure helpers only — no
runtime governance/audit state.

## Compatibility approach (no breaking changes)

- `tower-citizen/src/bridge/interface.ts` is now a **re-export shim** of the
  contract, so all historical `./bridge/interface.js` imports keep working.
- `precision-strategy.ts` imports the three precision types from the contract and
  **re-exports** them, so `@galerina/tower-citizen` consumers are unaffected.
- `galerina-ext-bridge-cpp` now imports the **contract** for `InferenceBridge` /
  `BridgeOp` / `BridgeResult` / `assertDeterminism`, and only the **oracle**
  (`StubTernaryBridge`) + `GovernanceEnforcer` / `AuditLogger` from the Tower.

Result: contract 4 tests · tower-citizen 86 · ext-bridge-cpp 13 — all green, no
test edits required.

## How this enables CF-3 (signed bridge manifests)

`BridgeManifest` + `canonicalManifestString()` now live in one neutral place that
both the Tower and every Brawn package import. The next increment adds, in the
Tower: `sha256(canonicalManifestString(m))`, a signature check against the
governance key, and a `requireSignedBridge` gate in the Certified Profile that
refuses any bridge whose manifest is missing/invalid/unpinned.

## Deferred (next structural step)

Extracting the **oracle implementation** (`TPLSimulator` / `StubTernaryBridge`)
into its own package (e.g. `@galerina/tpl-oracle`) so `ext-bridge-cpp` imports NO
Tower runtime at all. Today it still imports the oracle + governance/audit from
the Tower — the contract types are fully decoupled, the oracle is the remaining tie.
