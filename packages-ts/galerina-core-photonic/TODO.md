# Galerina Photonic TODO

Post-v1 status: photonic concept work is preserved as planning only unless a
piece is required to clarify core `Tri` or `Galerina` semantics. Do not
promote simulation or transport execution into the v1 build.

Tower certified photonic *coupon admission* (snapshot-before-verify, coupon
revocation on every infer) lives in `@galerina/tower-citizen`, not this
package. That slice does not promote photonic execution or hardware evidence.
See `docs/reports/security-q1q2-continuation-2026-09-22.md`.

Canonical ownership (2026-09-22 reconciliation):
- `PhotonicMode` in `src/index.ts` is the concept enum.
- `OpticalTransportMode` ("photonic"|"electrical"|"hybrid") is **not** admitted.
- `FUNGI-PHOTONIC-001..006` live on `fungi.photonic.diagnostic.v1` (C10 / RD-1282).
  That registry is diagnostics, not a transport planner.

```text
[x] Reconcile coverage conflict: PhotonicMode is canonical; OpticalTransportMode is not admitted
[x] Reconcile coverage conflict: FUNGI-PHOTONIC-001..006 is the C10 diagnostic table
[x] Ownership: core-photonic owns concepts/diagnostics; compute owns target selection;
    target-photonic owns artefact identity; emulator owns simulation. No v1 execution.
[x] Create /packages-ts/galerina-core-photonic
[x] Document package boundary
[x] Add package metadata
[x] Add initial typed exports
[x] Clarify that galerina-core-photonic owns concepts, types, models and APIs
[x] Define wavelength model
[x] Define phase and amplitude model
[x] Define PhotonicMode
[x] Define PhotonicPlan as a developer-facing model concept
[!] POST-V1 Define Mach-Zehnder / WDM / optical-matmul model helpers
    (PhotonicMode names exist; no v1 simulation APIs).
[x] Define optical signal reports
[x] Define mappings from galerina-core-logic states
[!] POST-V1 simulation APIs, OpticalTransportMode, runtime/planner/routing
    packages, and execution-plan helpers. C10 diagnostics already exist.
    Do not implement these on the v1 surface.
[x] Add examples
[x] Add tests
[x] C10 `fungi.photonic.diagnostic.v1` shared with target-photonic (`RD-1282`).
    Core tests **8/8**. Legacy `safeMessage` is refused. Registry
    `FUNGI-PHOTONIC-001..006` remains separate.

## v0.2 Governance Architecture (from galerina-core-photonic-v02.md)

[ ] Replace OpticalTransportMode string union with 6-value enum (Waveguide/Coherent/Mesh/FreeSpace/Hybrid/Experimental)
[ ] Update PhotonicRuntimeTarget to v0.2 fields (id/transport/realtime/deterministic/supportsIsolation/maxPropagationDepth)
[ ] Update PhotonicExecutionPlan to v0.2 fields (target/topology/propagationDepth/estimatedLatencyNs/isolated/warnings[])
[ ] Update buildPhotonicPlan() signature to accept PhotonicRuntimeTarget and return v0.2 plan
[ ] Implement validateIsolation(target: PhotonicRuntimeTarget): boolean
[ ] Implement validatePropagation(depth: number, target: PhotonicRuntimeTarget): boolean
[ ] Implement validateHybridMode(target: PhotonicRuntimeTarget): boolean
[ ] Implement validateRealtime(plan: PhotonicExecutionPlan): boolean
[ ] Define PhotonicCapability enum (OpticalExecution/HybridExecution/ExperimentalRouting/RealtimeScheduling)
[ ] Implement validateCapability(capability: PhotonicCapability): boolean — blocks ExperimentalRouting by default
[ ] Define optical topologies list (OpticalMesh/WaveguideBus/CoherentRing/HybridBridge)
[ ] Update FUNGI-PHOTONIC-001–006 meanings to v0.2 (001=isolation missing, 002=propagation exceeded, 003=experimental prohibited, 004=invalid topology, 005=non-deterministic, 006=unsafe hybrid)
[ ] Create runtime/transport.ts (OpticalTransportMode enum)
[ ] Create runtime/isolation.ts (validateIsolation)
[ ] Create planning/topology.ts (topologies list)
[ ] Create planning/scheduling.ts (validateRealtime)
[ ] Create governance/validation.ts (validatePropagation, validateHybridMode)
[ ] Create governance/capabilities.ts (PhotonicCapability enum, validateCapability)
[ ] Create targets/runtimeTargets.ts (PhotonicRuntimeTarget)
[ ] Create targets/OpticalTransportMode.ts
[ ] Enforce determinism rule: identical inputs must produce identical execution plans/routes/schedules/diagnostics
[ ] Add experimental transport restrictions (no production deployment, sandboxed only, explicit capability required, full audit logging)
```

## Live reconciliation (2026-09-21)

- Implemented base source is bounded to `src/index.ts`: `OpticalSignal` and
  `PhotonicMapping` (`:13`, `:24`), `PhotonicPlan` and `PhotonicReport`
  (`:76`, `:84`), signal/mapping/plan validators (`:110`, `:154`, `:221`),
  and the C10 schema/decoder (`:40`, `:308`).
- The package-owned test surface is
  `tests/photonic-contracts.test.mjs:28-210`. Fresh `npm.cmd test` completed
  typecheck, build and **8/8** tests.
- Rows still marked `[ ]` above and below remain unimplemented planning/spec
  obligations. The current source and tests do not authorize runtime targets,
  planners, fallback decisions, hardware bindings or diagnostic-code meaning
  changes.

### Explicit HOLD groups

- **HOLD-PHOTONIC-TRANSPORT:** the legacy three-value
  `OpticalTransportMode` and the v0.2 six-value enum conflict. Required owner
  decision/receipt: one cross-package adjudication from
  `galerina-core-photonic`, `galerina-core-vector`, `galerina-core-compute`
  and `galerina-target-photonic` naming the canonical enum and superseding
  shape. The inspected package source does not supply that receipt.
- **HOLD-PHOTONIC-DIAGNOSTICS:** the legacy and v0.2 meanings for
  `FUNGI-PHOTONIC-001..006` conflict. Required owner decision/receipt: one
  canonical six-code meaning table plus its registry owner. The C10 schema is
  admitted, but it does not settle those meanings or supply an adjudication
  receipt.
- **HOLD-PHOTONIC-BOUNDARY:** runtime target, execution-plan, simulation,
  audit and fallback ownership must be confirmed across the package boundary
  before implementation. Required receipt: the boundary decision named in
  row 9 above. Hardware, key custody, SLIDE and VOK evidence are separate
  authority lanes and are not supplied by this package.

The v0.2 section above is retained as historical planning. Every row remains
unimplemented and held by the decisions above.
Independent audit remains pending.
