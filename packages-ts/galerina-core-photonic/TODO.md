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
    Owner decision 2026-10-06 10:14 BST (O1, Phillip): stays parked until v1 ships; no implementation.
    Kept HOLD (SuperGrok 2026-10-08): implementPostV1PhotonicSimulation always refuses with PHOTONIC_POST_V1_SIMULATION_FORBIDDEN.
[x] Define optical signal reports
[x] Define mappings from galerina-core-logic states
[!] POST-V1 simulation APIs, OpticalTransportMode, runtime/planner/routing
    packages, and execution-plan helpers. C10 diagnostics already exist.
    Do not implement these on the v1 surface.
    Owner decision 2026-10-06 10:14 BST (O1, Phillip): stays parked until v1 ships; no implementation.
    Kept HOLD (SuperGrok 2026-10-08): admitOpticalTransportMode / implementPhotonicRuntimePlanner always refuse.
[x] Add examples
[x] Add tests
[x] C10 `fungi.photonic.diagnostic.v1` shared with target-photonic (`RD-1282`).
    Core tests **8/8**. Legacy `safeMessage` is refused. Registry
    `FUNGI-PHOTONIC-001..006` remains separate.

## v0.2 Governance Architecture (from galerina-core-photonic-v02.md)

Owner decision 2026-10-06 10:14 BST (O1, Phillip): every row in this v0.2 section stays parked until
v1 ships; no implementation. The HOLD groups below are unchanged.
Marker sync 2026-10-06 (Grok Bot): the 22 rows below changed from `[ ]` to `[HOLD]` so the open count
reflects the O1 decision above. No row was implemented, removed or reworded. Reopen as `[ ]` after v1 ships.

[HOLD] Replace OpticalTransportMode string union with 6-value enum (Waveguide/Coherent/Mesh/FreeSpace/Hybrid/Experimental)
[HOLD] Update PhotonicRuntimeTarget to v0.2 fields (id/transport/realtime/deterministic/supportsIsolation/maxPropagationDepth)
[HOLD] Update PhotonicExecutionPlan to v0.2 fields (target/topology/propagationDepth/estimatedLatencyNs/isolated/warnings[])
[HOLD] Update buildPhotonicPlan() signature to accept PhotonicRuntimeTarget and return v0.2 plan
[HOLD] Implement validateIsolation(target: PhotonicRuntimeTarget): boolean
[HOLD] Implement validatePropagation(depth: number, target: PhotonicRuntimeTarget): boolean
[HOLD] Implement validateHybridMode(target: PhotonicRuntimeTarget): boolean
[HOLD] Implement validateRealtime(plan: PhotonicExecutionPlan): boolean
[HOLD] Define PhotonicCapability enum (OpticalExecution/HybridExecution/ExperimentalRouting/RealtimeScheduling)
[HOLD] Implement validateCapability(capability: PhotonicCapability): boolean — blocks ExperimentalRouting by default
[HOLD] Define optical topologies list (OpticalMesh/WaveguideBus/CoherentRing/HybridBridge)
[HOLD] Update FUNGI-PHOTONIC-001–006 meanings to v0.2 (001=isolation missing, 002=propagation exceeded, 003=experimental prohibited, 004=invalid topology, 005=non-deterministic, 006=unsafe hybrid)
[HOLD] Create runtime/transport.ts (OpticalTransportMode enum)
[HOLD] Create runtime/isolation.ts (validateIsolation)
[HOLD] Create planning/topology.ts (topologies list)
[HOLD] Create planning/scheduling.ts (validateRealtime)
[HOLD] Create governance/validation.ts (validatePropagation, validateHybridMode)
[HOLD] Create governance/capabilities.ts (PhotonicCapability enum, validateCapability)
[HOLD] Create targets/runtimeTargets.ts (PhotonicRuntimeTarget)
[HOLD] Create targets/OpticalTransportMode.ts
[HOLD] Enforce determinism rule: identical inputs must produce identical execution plans/routes/schedules/diagnostics
[HOLD] Add experimental transport restrictions (no production deployment, sandboxed only, explicit capability required, full audit logging)
      Kept HOLD (SuperGrok 2026-10-08): admitOpticalTransportMode, implementPhotonicRuntimePlanner, rewriteFungiPhotonicMeanings, and addExperimentalPhotonicTransport always refuse with PHOTONIC_*_FORBIDDEN. Two [!] POST-V1 rows stay parked.
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
  the "Ownership:" reconciliation row near the top of this file (2026-09-22;
  RD-1242, RD-1282). Hardware, key custody, SLIDE and VOK evidence are separate
  authority lanes and are not supplied by this package.

The v0.2 section above is retained as historical planning. Every row remains
unimplemented and held by the decisions above.
Independent audit remains pending.

### Consistency note (2026-09-29, Grok Bot, owner-approved; AGENTS session-exchange grok-bot-pkg-todo-work-20260929/LEDGER.md)

This file currently disagrees with itself. The ticked 2026-09-22 reconciliation
rows at the top (PhotonicMode canonical; OpticalTransportMode not admitted;
FUNGI-PHOTONIC-001..006 = the C10 diagnostic table; the ownership split) read
as settling HOLD-PHOTONIC-TRANSPORT, -DIAGNOSTICS and -BOUNDARY. The 2026-09-21
HOLD groups above still say the cross-package adjudication receipt is missing.
The 09-22 decision is recorded only in this file, not in core-vector,
core-compute or target-photonic, and README.md "Coverage Reconciliation
Status" still describes the conflict as open. HOLD-PHOTONIC-BOUNDARY's
"row 9 above" pointer is also stale (line 9 is now prose). The HOLDs are left in
place until the owner confirms whether the 09-22 rows are the receipt.
Pointer fixed 2026-10-06 (Grok Bot, doc only): HOLD-PHOTONIC-BOUNDARY now names
the "Ownership:" row; no HOLD state changed.

## Package-side HOLD pin — 2026-10-08

- [x] Package-side HOLD pin: `prepareCorePhotonicHoldRequest` emits
      REQUESTED_NOT_ADMITTED; POST-V1 simulation, OpticalTransportMode,
      v0.2 runtime planner, C10 meaning rewrite, and experimental transport
      always refuse with `PHOTONIC_*_FORBIDDEN`. PhotonicMode and
      `fungi.photonic.diagnostic.v1` unchanged besides the hold-pin re-export.
      `tests/core-photonic-hold-pin.test.mjs`. (SuperGrok 2026-10-08.)
