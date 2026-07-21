# DEPRECATED — galerina-ext-bridge-bitnet

**This package is deprecated as of 2026-07. Do not extend it or add new dependencies on it.**

## Migration

Use [`@galerina/ext-bridge-cpp`](../galerina-ext-bridge-cpp/) instead.

`galerina-ext-bridge-cpp` is the canonical BitNet bridge. It:

- Implements the `InferenceBridge` contract from `@galerina/inference-bridge-contract`
- Satisfies the three Citizen One Standards (TPL Determinism, Hold-First, Zero-Copy)
- Is routed by the Tower's `HybridInferenceEngine` via the `BridgeRegistry`
- Has a documented native N-API seam (`native/README.md`)

This package (`galerina-ext-bridge-bitnet`) is an older, lower-level wrapper that does not
implement `InferenceBridge` and is not consumable by the engine's bridge registry.

## Status

Decision recorded in [`galerina-ext-bridge-cpp/ARCHITECTURE_ISSUES.md`](../galerina-ext-bridge-cpp/ARCHITECTURE_ISSUES.md)
(ISSUE-001). Any unique surface from this package (C-API kernel-family notes, etc.) should
be migrated to `galerina-ext-bridge-cpp/native/README.md` before this package is removed.

## Removal plan

1. Audit this package for anything `galerina-ext-bridge-cpp` lacks
2. Migrate unique content to `galerina-ext-bridge-cpp`
3. Remove from `galerina.workspace.json`
4. Archive or delete this directory
