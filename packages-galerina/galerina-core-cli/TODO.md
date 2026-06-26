# Galerina CLI TODO

```text
[x] Create /packages-galerina/galerina-core-cli
[x] Add README.md
[x] Add TODO.md
[x] Add package.json
[x] Add tsconfig.json
[x] Add src/index.ts
[x] Add command router placeholder
[x] Add safe output redaction placeholder
[x] Add Galerina graph project graph command integration
[x] Add Galerina check command integration
[x] Add Galerina build command integration
[x] Add Galerina run command integration
[x] Add Galerina serve command integration
[x] Add Galerina reports command integration
[x] Add Galerina security:check command integration
[x] Add Galerina routes command integration
[x] Add Galerina task command integration with galerina-core-tasks
[ ] Complete Galerina build command — full 14-pass pipeline with artefact generation
[ ]   - emit runtime-manifest.json, compiler-report.json, effect-report.json, capability-report.json
[ ]   - emit audit-report.json, build-hash.txt
[ ]   - support --target, --json, --report, --strict, --profile, --out, --audit flags
[ ]   - implement BuildArtefact: path, kind (manifest|bundle|report|hash|map), hash, target
[ ]   - implement BuildResult: success, artefacts[], diagnostics[], manifestPath, duration
[ ]   - implement BuildWorkspaceInput: workspace, target, strict, profile?, outDir
[ ]   - implement buildWorkspace(input: BuildWorkspaceInput): Promise<BuildResult>
[ ]   - diagnostic codes SPORE-BUILD-001 through SPORE-BUILD-005
[ ]   - create build/ dir: build-command.ts, build-pipeline.ts, build-reporter.ts, build-artifacts.ts, build-integrity.ts
[ ] Complete Galerina verify command — full governance verification
[ ]   - validate manifest integrity (beyond hash-only)
[ ]   - validate runtime compatibility, capability consistency, audit reports
[ ]   - support --json, --strict, --manifest, --hash, --policy, --audit flags
[ ]   - implement VerifiedArtefact: path, hash, verified, diagnostics[]
[ ]   - implement VerificationResult: success, artefacts[], diagnostics[]
[ ]   - implement verifyHash(artefact, expected): Promise<VerifiedArtefact>
[ ]   - emit verification-report.json
[ ]   - diagnostic codes SPORE-VERIFY-001 through SPORE-VERIFY-005
[ ]   - create verify/ dir: verify-command.ts, verify-manifest.ts, verify-integrity.ts, verify-runtime.ts, verify-reporter.ts
[ ] Add Galerina deploy command integration
[ ]   - load workspace manifest, runtime profile, deployment policy
[ ]   - validate effects, capabilities, runtime targets, module hashes
[ ]   - produce deployment-report.json
[ ]   - support --dry-run, --json, --report, --audit, --strict flags
[ ]   - implement DeploymentTarget union: node|wasm|native|serverless|edge|gpu|photonic
[ ]   - implement DeploymentResult: success, target, manifestHash, diagnostics[], reportPath?
[ ]   - implement ValidateEffectsInput: manifest, policy, target
[ ]   - implement validateEffects(input): CompilerDiagnostic[]
[ ]   - return exit codes 0–7 (0 success, 2 policy denial, 3 runtime incompatibility, 4 validation failure, 5 capability failure, 6 verify failure, 7 manifest integrity)
[ ]   - diagnostic codes SPORE-DEPLOY-001 through SPORE-DEPLOY-005
[ ]   - create deploy/ dir: deploy-command.ts, deploy-policy.ts, deploy-validator.ts, deploy-report.ts, deploy-runtime.ts
[ ] Add Galerina explain command integration
[ ]   - explain imports, effects, capabilities, dependency tree
[ ]   - explain denial reasoning from deployment-denial.json
[ ]   - support --tree, --trace, --effects, --capabilities, --runtime, --policy, --audit, --json flags
[ ]   - implement ExplainTrace: step, label, input, output, diagnostics[]
[ ]   - implement ExplainResult: traces[], effects[], capabilities[], boundaries[], diagnostics[]
[ ]   - implement buildTrace(manifest, options): ExplainTrace[]
[ ]   - emit explain-report.json
[ ]   - diagnostic codes SPORE-EXPLAIN-001 through SPORE-EXPLAIN-004
[ ]   - create explain/ dir: explain-command.ts, explain-trace.ts, explain-tree.ts, explain-runtime.ts, explain-reporter.ts
[ ] Add Galerina plan command integration
[ ]   - estimate CPU/GPU/accelerator suitability and memory pressure
[ ]   - produce compute-plan.json
[ ]   - support --json, --runtime, --memory, --parallelism, --energy, --target, --graph, --compatibility flags
[ ]   - implement ComputePlan: target, gpu (GpuPlan), optical (OpticalPlan), wasm, compatibility, estimatedMemoryMb, parallelism, diagnostics[]
[ ]   - implement estimateTarget(workspace, options): ComputePlan
[ ]   - diagnostic codes SPORE-PLAN-001 through SPORE-PLAN-004
[ ]   - create plan/ dir: plan-command.ts, plan-graph.ts, plan-runtime.ts, plan-memory.ts, plan-reporter.ts
[ ] Add Galerina verify deploy command integration (verify running version against build manifest)
[ ] Add Galerina promote command integration (promote artifact across environments)
[ ] Add environment mode config loading
[ ] Add structured CLI errors
[x] Add report summary output
[x] Add tests
```
