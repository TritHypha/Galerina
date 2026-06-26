# Galerina Compiler TODO

V1 freeze rule: the compiler package should prioritise the parser, AST,
diagnostics and checker pipeline for the frozen core syntax subset before
adding post-v1 targets or domain package syntax.

```text
[x] Create /packages-galerina/galerina-core-compiler
[x] Add README.md
[x] Add TODO.md
[x] Add package metadata
[x] Add initial typed exports
[x] Define compiler input contract
[ ] Define lexer contract
[ ] Define parser contract
[ ] Define AST contract
[ ] Define symbol table contract
[x] Define initial core syntax safety checker contract
[ ] Define full checker pipeline contract
[ ] Define IR contract
[ ] Define IR handoff requirements for VM, WASM, native and Node-hosted runtime
  paths
[ ] Define target handoff contract
[ ] Define diagnostic format
[ ] Define source-map contract
[ ] Define compiler report output
[ ] Define effect checker contract (what effects each function performs)
[ ] Implement effect declaration validation (SPORE-EFFECT-001, SPORE-E4001)
[ ] Implement effect propagation validation (SPORE-EFFECT-002, SPORE-E4002)
[ ] Implement compile-time effect restrictions (SPORE-EFFECT-003, SPORE-E4003)
[ ] Define boundary checker contract (module/package/trust/runtime boundaries)
[ ] Implement module visibility boundary enforcement (SPORE-BOUNDARY-004, SPORE-E3004)
[ ] Implement package contract boundary enforcement (SPORE-BOUNDARY-002)
[ ] Implement compile-time/runtime boundary enforcement (SPORE-BOUNDARY-003, SPORE-E4004)
[ ] Implement package trust boundary enforcement (SPORE-BOUNDARY-005, SPORE-E4006)
[ ] Implement secret/data leakage boundary detection (SPORE-BOUNDARY-006)
[ ] Implement network boundary checks — host allowlist (SPORE-BOUNDARY-008)
[ ] Implement filesystem boundary checks — path allowlist (SPORE-BOUNDARY-009)
[ ] Implement capability boundary enforcement (SPORE-BOUNDARY-007, SPORE-E4005)
[ ] Add effect checker diagnostics with suggested fixes
[ ] Add boundary checker diagnostics with suggested fixes
[ ] Generate runtime manifest including effect and boundary metadata (pass 14)
[ ] Implement manifest builder — aggregate compiler metadata into runtime-manifest.json
[ ] Define RuntimeManifest TypeScript type (module/effects/capabilities/targets/trustLevel/auditRequired)
[ ] Upgrade RuntimeManifest to v0.2 schema: schemaVersion, buildId, generatedAt, target, routes[], functions[], effects[], permissions[], boundaries[], reports[], diagnostics[]
[ ] Define RouteManifest, FunctionManifest, EffectManifest, BoundaryManifest sub-types
[ ] Define BuildManifestInput: checkedProgram, effectGraph, boundaryGraph, compilerOptions
[ ] Implement buildManifest(input: BuildManifestInput): RuntimeManifest
[ ] Implement validateManifest(manifest: RuntimeManifest): CompilerDiagnostic[]
[ ] Implement manifest hash generation (SPORE-MANIFEST-002)
[ ] Implement manifest schema validation (SPORE-MANIFEST-001, SPORE-MANIFEST-003)
[ ] Implement capability reference validation in manifest (SPORE-MANIFEST-004)
[ ] Implement runtime target validation in manifest (SPORE-MANIFEST-005)
[ ] Create manifests/ dir structure: manifest-builder.ts, manifest-schema.ts, manifest-hash.ts, manifest-serializer.ts, manifest-validator.ts
[ ] Define Effect interface: id, name, category (10 values), unsafe, boundarySensitive, requiredCapability
[ ] Define EffectCategory union: network|database|filesystem|shell|process|secret|ai|gpu|native|custom
[ ] Define CheckedFunction: id, name, declaredEffects, inferredEffects, effectiveEffects = union, boundaryRequirements, diagnostics
[ ] Define EffectGraphNode: functionId, outgoingCalls, inferredEffects
[ ] Define EffectGraph: nodes, nodeMap
[ ] Implement inferExpressionEffects(expression, context): Effect[] — switch on expression.kind
[ ] Implement propagateEffects(graph: EffectGraph): EffectGraph — iterative fixpoint
[ ] Create effects/ dir: effect-interface.ts, effect-graph.ts, effect-propagation.ts, effect-diagnostics.ts
[ ] Implement SPORE-EFFECT-001 (undeclared), SPORE-EFFECT-002 (forbidden), SPORE-EFFECT-003 (missing capability), SPORE-EFFECT-004 (unsafe transitive)
[ ] Define Boundary: id, type (10 BoundaryType values), trustLevel (4 values), allowedEffects, deniedEffects, requiredPolicies
[ ] Define BoundaryRequirement: boundaryType, requiresValidation, requiresAuth, requiresRateLimit, requiresReplayProtection, requiresSecretProtection
[ ] Define BoundaryEdge: from, to, transferredEffects, transferredSecrets, requiresValidation
[ ] Define BoundaryGraph: boundaries, edges
[ ] Define CheckedCallExpression IR: callee, arguments, resolvedEffects, boundaryContext
[ ] Create boundaries/ dir: boundary-interface.ts, boundary-graph.ts, boundary-requirement.ts, boundary-diagnostics.ts
[ ] Implement SPORE-BOUNDARY-001 (missing validation), SPORE-BOUNDARY-002 (missing replay), SPORE-BOUNDARY-003 (unsafe effect crossing), SPORE-BOUNDARY-004 (secret leak)
[ ] Define ComputeDeviceProfile: id, vendor, family, kind, capabilities, memoryMb, supports(effect)
[ ] Implement selectDevice(profiles, plan): ComputeDeviceProfile | null
[ ] Create ir/ dir: checked-call.ts, checked-function.ts
[ ] Parse at least 20 v1 .spore examples
[ ] Reject post-v1 syntax with clear diagnostics
[ ] Add examples
[x] Add initial syntax safety tests
```
