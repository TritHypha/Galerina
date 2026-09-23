# Galerina Tower Citizen TODO

Owner: RD-1295. Focused isolation+products tests are the product-line gate.
Signature verification, `.fungi` conversion, SLIDE/VOK admission and removing
the core-network *package* install are not this package's remaining source work.

```text
[x] Seven cluster entries: /kernel /governance /inference /tpl /photonic /custody /dataplane
[x] Kernel-free cli-check is `/governance`, not tower.governance.v1
[x] tower.governance.v1 entry `/governance-v1` re-exports kernel ∪ cli-check
    (`src/governance-v1.ts`). Closed-set = governanceAllowedFiles. Hybrid extra refuses.
[x] Named factories createCertifiedTower / createDevTower (unsigned load and host-native
    opt-ins explicit). Certified forbids allowUnsignedLoad.
[x] Composition helpers COMPOSITION_CLUSTERS + compositionAllowedFiles.
    Unknown unions throw ERR_TOWER_COMPOSITION_UNKNOWN.
[x] Live composition consumers: photonic, registry, api-data stay inside
    compositionAllowedFiles; extra hybrid-engine refuses.
[x] Certified composition contains the inference load graph.
[x] Walker: TypeScript AST, Node-faithful export conditions, PACKAGE_SELF first,
    refuse barrel and unknown subpaths, refuse require-only CJS exports.
[x] Walker bounds (E01/RD-1296 slice 2): lstat refuse symlink; file/edge/byte
    caps. Tests `load-graph-bounds.test.mjs` 3/3. Residual: lstat→read TOCTOU.
[x] Kernel linter hostile controls for TPL/photonic/custody/dataplane.
[x] Package graph entryPoints for the eight public entries; load-graph.ts is
    an explained allowOrphan. node:module and typescript admitted as live loads.
[!] HOLD extract core-network's Tower package install (architecture; runtime
    graphs already use /governance only).
[!] HOLD successful signed certified deployment (no keys in this package).
[x] Certified photonic coupon: snapshot own-data before verify; re-run
    couponRevocationCheck on every infer against the snapshot identity.
    Focused photonic+bridge tests 24/24 (audit pending).
[!] HOLD independent audit, .fungi conversion, SLIDE/VOK, hardware evidence.
```

Verification from this directory:

```text
npx tsc -p tsconfig.json
node --test tests/rd-1295-governance-isolation.test.mjs tests/rd-1295-products.test.mjs
node --test tests/photonic-certified-admission.test.mjs tests/bridge-attestation.test.mjs
```

Photonic+bridge focused route **24/24** (2026-09-22 dirty tree). Isolation+products
remain the RD-1295 product-line gate. Independent audit pending.
