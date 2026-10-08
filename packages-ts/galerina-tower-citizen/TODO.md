# Galerina Tower Citizen TODO

2026-09-26 custody check: RD-1295 remains open in the dirty RD-0873
worktree. The 2026-09-23 focused counts below are dated receipts, not a
fresh run. The core-network package-install extraction, walker check/load
identity, independent admission, and hardware evidence remain HOLD.

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
[x] Walker bounds (Tower RD-1295; formerly labelled E01/RD-1296):
    lstat refuse symlink; file/edge/byte
    caps. Tests `load-graph-bounds.test.mjs` 3/3. Residual: lstat→read TOCTOU.
[x] Composition/load identity challenge 2026-09-23 HEAD `e8f1b682` (this
    dirty tree). Q1 NO_DEFECT: frozen `TOWER_COMPOSITION_IDS` /
    `COMPOSITION_CLUSTERS` / stems (`product-profiles.ts:93-123`); primitive
    and boxed String keys are stable; table mutation throws. Q2 NOT
    VERIFIABLE as production check-then-load: `cert-gate.ts:38` and
    `admission-feedback.ts:34` `import` `/governance` directly; no production
    caller of `walkLoadGraph`. Focused suite **86/86**. No snapshot added.
    Residual: walker lstat→read TOCTOU; graph is not byte attestation.
[x] Kernel linter hostile controls for TPL/photonic/custody/dataplane.
[x] Package graph entryPoints for the eight public entries; load-graph.ts is
    an explained allowOrphan. node:module and typescript admitted as live loads.
[x] App-kernel request path imports `/governance`, not the Tower root barrel
    (`kernel.ts`). Registry modules import `/custody` (+ `/governance` when
    they fold trits). Hostile source test: no `src/*.ts` imports the barrel.
    Isolation Q3: `dist/kernel.js` load graph is cli-check Tower only.
    App-kernel focused 46/46; Tower product-line **87/87**. Independent
    scoped PASS `01a0cf3f-d35d`
    (`docs/independent-audits/2026-09-23-appkernel-tower-subpath-hold.md`).
    Residual: core-network still *installs* the package; registry modules
    still load the custody cluster.
[x] Tower side of core-network install extract: always refuse
    extractCoreNetworkTowerInstall returns TW_CORE_NETWORK_INSTALL_EXTRACT_FORBIDDEN
    for every input. This package does not depend on core-network. The extract act
    stays architecture (core-network's file: install). tests/rd1295-hold-pin.test.mjs.
    (SuperGrok 2026-10-08.)
[!] HOLD extract core-network's Tower package install (architecture; runtime
    graphs already use /governance only).
    Kept HOLD: RD-1295 does not authorize a package split. Tower's side is the
    typed refuse; the file: install lives in core-network. (SuperGrok pin 2026-10-08.)
[x] Tower side of signed certified deployment: typed request only; never sign
    prepareCertifiedDeploymentRequest emits REQUESTED_NOT_SIGNED with
    requires.v1ReleaseSigningCeremony. Authority keys, private/throwaway/ceremony
    key material, and allowUnsignedLoad refuse. signCertifiedDeployment always
    TW_CERTIFIED_DEPLOYMENT_SIGN_FORBIDDEN. createCertifiedTower still forbids
    allowUnsignedLoad. tests/rd1295-hold-pin.test.mjs. (SuperGrok 2026-10-08.)
[!] HOLD successful signed certified deployment (no keys in this package).
    Owner decision 2026-10-06 10:14 BST (O4, Phillip): wait for the v1 release-signing ceremony; no throwaway
    keys and no allowUnsigned. Tower's side is done (typed request + refuse sign);
    the ceremony itself is not this package. (SuperGrok pin 2026-10-08.)
[x] Certified photonic coupon: snapshot own-data before verify; re-run
    couponRevocationCheck on every infer against the snapshot identity.
    Focused photonic+bridge tests 24/24 (audit pending).
[x] Tower side of independent audit / .fungi / SLIDE/VOK / hardware evidence: refuse
    convertTowerToFungi, admitTowerArtifact, authoriseTowerArtifact,
    claimHardwareEvidence, claimIndependentAudit always refuse. Walker read now
    uses O_NOFOLLOW fd + size match (lstat→read TOCTOU residual).
    tests/rd1295-hold-pin.test.mjs, tests/load-graph-bounds.test.mjs.
    (SuperGrok 2026-10-08.)
[!] HOLD independent audit, .fungi conversion, SLIDE/VOK, hardware evidence.
    Kept HOLD: those acts are not this package. Tower's side is the typed refuse.
    (SuperGrok pin 2026-10-08.)
```

Verification from this directory:

```text
npx tsc -p tsconfig.json
node --test tests/rd-1295-governance-isolation.test.mjs tests/rd-1295-products.test.mjs
node --test tests/photonic-certified-admission.test.mjs tests/bridge-attestation.test.mjs
```

Photonic+bridge focused route **24/24** (2026-09-22 dirty tree). Isolation+products
remain the RD-1295 product-line gate. Independent audit pending.
