# Galerina Photonic TODO

Post-v1 status: photonic concept work is preserved as planning only unless a
piece is required to clarify core `Tri` or `Galerina` semantics.

```text
[ ] Reconcile coverage conflict: choose one canonical OpticalTransportMode enum
[ ] Reconcile coverage conflict: choose one canonical SPORE-PHOTONIC-001..006 table
[ ] Confirm photonic ownership with galerina-core-vector, galerina-core-compute and galerina-target-photonic before implementation
[x] Create /packages-galerina/galerina-core-photonic
[x] Document package boundary
[x] Add package metadata
[x] Add initial typed exports
[x] Clarify that galerina-core-photonic owns concepts, types, models and APIs
[x] Define wavelength model
[x] Define phase and amplitude model
[x] Define PhotonicMode
[x] Define PhotonicPlan as a developer-facing model concept
[ ] Define Mach-Zehnder model helpers
[ ] Define wavelength-division multiplexing model helpers
[ ] Define optical matrix multiplication model helpers
[x] Define optical signal reports
[x] Define mappings from galerina-core-logic states
[ ] Define photonic simulation helper APIs
[ ] Define OpticalTransportMode type: "photonic"|"electrical"|"hybrid"
[ ] Define PhotonicRuntimeTarget interface (name/distributed/transportMode/fallbackTarget)
[ ] Define PhotonicExecutionPlan interface (module/distributed/recommendedTransport/fallbackTarget/reasoning)
[ ] Implement estimateOpticalSuitability(graph: ExecutionGraph): boolean
[ ] Implement buildPhotonicPlan(module: string): PhotonicExecutionPlan
[ ] Implement resolveFallback(opticalAvailable: boolean): string
[ ] Define SPORE-PHOTONIC-001 through SPORE-PHOTONIC-006 diagnostic codes
[ ] Create internal dir: photonic-runtime.ts, photonic-planner.ts, photonic-routing.ts, photonic-fallback.ts, photonic-audit.ts, photonic-targets.ts
[ ] Define runtime audit event shapes for photonic transport and fallback
[ ] Plan sub-packages: galerina-target-photonic-runtime, galerina-target-photonic-routing, galerina-target-photonic-audit
[x] Add examples
[x] Add tests

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
[ ] Update SPORE-PHOTONIC-001–006 meanings to v0.2 (001=isolation missing, 002=propagation exceeded, 003=experimental prohibited, 004=invalid topology, 005=non-deterministic, 006=unsafe hybrid)
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
