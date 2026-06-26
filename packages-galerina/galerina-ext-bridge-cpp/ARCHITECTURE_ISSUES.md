# ARCHITECTURE_ISSUES — galerina-ext-bridge-cpp

Cross-package concerns observed while working inside this package. Per the project
guardrail, issues that reach beyond this package are **logged here, not
implemented** — they need a deliberate wider-project decision.

---

## ISSUE-001 — Two BitNet bridge packages overlap

**Status:** open · logged 2026-06-06

**Observation.** There are two packages that both bridge Microsoft BitNet:

| Package | Shape | Governance integration |
|---|---|---|
| `galerina-ext-bridge-cpp` (this one) | Implements the modern `InferenceBridge` contract from `@galerina/tower-citizen`; upholds the three Citizen One Standards (TPL Determinism, Hold-First, Zero-Copy); uses `StubTernaryBridge` as the determinism oracle. | Routed by the Tower's `HybridInferenceEngine` via the `BridgeRegistry` (see `createCppBridgeRegistry()`). |
| `galerina-ext-bridge-bitnet` | Older, lower-level wrapper around the BitNet.cpp C API (`ggml_bitnet_*`). Does **not** implement `InferenceBridge`. | Has its own `TowerRuntime` lifecycle wrapper, but is not consumable by the engine's bridge registry. |

Both depend on `@galerina/tower-citizen` (`file:../galerina-tower-citizen`).

**Why this is a wider-project issue.** Resolving it touches a *second* package
(`galerina-ext-bridge-bitnet`) and the question of which one the platform keeps as
canonical — out of scope for edits confined to `galerina-ext-bridge-cpp`.

**Decision recorded for the integration work (2026-06-06).** For wiring the
Governed Inference Tower into the Galerina runtime, **`galerina-ext-bridge-cpp` is
canonical** — it is the one that satisfies the `InferenceBridge` contract and the
Citizen One Standards, so the engine routes through it.

**Proposed reconciliation (NOT yet done — needs sign-off).**
1. Audit `galerina-ext-bridge-bitnet` for any unique, useful surface (e.g. the
   detailed `ggml_bitnet_*` C-API mapping and kernel-family notes) that this
   package lacks.
2. Migrate anything worth keeping into this package's `native/README.md` N-API
   contract (the documented native seam).
3. Deprecate `galerina-ext-bridge-bitnet`, or explicitly re-scope it as the
   "low-level C-API layer" that this package's native addon links against — so
   the split is intentional rather than accidental duplication.

Until that decision is made, treat `galerina-ext-bridge-bitnet` as legacy and do
not extend it.

---

## NOTE-002 — CF-3/CF-7 bridge attestation landed (2026-06-06)

**Status:** done (in-package) · cross-package follow-up logged below

`BitNetCpuBridge` now carries a `manifest: BridgeManifest` (CF-3) and the native
addon loader hashes the `.node` binary with SHA-256 **before** `require()`,
failing closed (`ERR_ADDON_HASH_MISMATCH`) on a pin mismatch (CF-7). The manifest
ships unsigned (`certificationProfile: "dev"`, `packageHash` = zero placeholder)
and is signed offline at release time via `galerina bridge-attest sign`. The Tower's
`HybridInferenceEngine`, under an `AttestationPolicy`, denies any unattested bridge
with `ERR_BRIDGE_UNATTESTED` before compute.

**Cross-package follow-up (NOT done — needs the release pipeline).**
1. `packageHash` is a zero placeholder. A release step must compute the real
   sha256 of the published package tarball and bake it into the manifest (or the
   `galerina bridge-attest` flow must accept it) so the pin is meaningful.
2. The certified deployment must pass `loadNativeAddon({ expectedHash })` with the
   release-pinned addon hash; today no caller supplies it (advisory until a
   compiled `.node` addon exists).
