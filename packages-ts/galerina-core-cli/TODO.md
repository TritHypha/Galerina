# Galerina CLI TODO

```text
[x] Create /packages-ts/galerina-core-cli
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
[x]   - implement BuildArtefact: path, kind (manifest|bundle|report|hash|map), hash, target -- src/verify.ts, tests/verify-contracts.test.mjs (Grok 2026-10-05)
[ ]   - implement BuildResult: success, artefacts[], diagnostics[], manifestPath, duration
[ ]   - implement BuildWorkspaceInput: workspace, target, strict, profile?, outDir
[ ]   - implement buildWorkspace(input: BuildWorkspaceInput): Promise<BuildResult>
[ ]   - diagnostic codes FUNGI-BUILD-001 through FUNGI-BUILD-005
[ ]   - create build/ dir: build-command.ts, build-pipeline.ts, build-reporter.ts, build-artifacts.ts, build-integrity.ts
[ ] Complete Galerina verify command — full governance verification
[x]   - validate manifest integrity (beyond hash-only) -- src/verify/verify-manifest.ts, tests/verify-manifest.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit): verifyRuntimeManifest / verifyRuntimeManifestSet check the shipped per-flow `fungi.runtime.manifest.v1` record (compiler type-registry.ts RuntimeManifest): closed shape read through descriptors (no getters run), exact schemaVersion, closed field domains, cross-field consistency with GovernanceFlags, verified:false never verifies, unique flows; FUNGI-VERIFY-006..011; optional `manifests` section in verification-report.json; a test pins the mirror to the compiler source. Not covered: the runtime-manifest.json file container (compiler README v0.2 `galerina.manifest.v1`, pass 14, not built) and signatures (GovernanceSignature, Phase 39); the --manifest flag row stays open
[ ]   - validate runtime compatibility, capability consistency, audit reports
[ ]   - support --json, --strict, --manifest, --hash, --policy, --audit flags
[x]   - implement VerifiedArtefact: path, hash, verified, diagnostics[] -- src/verify.ts, tests/verify-contracts.test.mjs (Grok 2026-10-05)
[x]   - implement VerificationResult: success, artefacts[], diagnostics[] -- src/verify.ts, tests/verify-contracts.test.mjs (Grok 2026-10-05); verifyArtefacts(set, root)
[x]   - implement verifyHash(artefact, expected): Promise<VerifiedArtefact> -- src/verify.ts, tests/verify-contracts.test.mjs (Grok/Codex 2026-10-05); sha256 only, checked root resolution, descriptor identity, 64 KiB streaming and no-follow where supported
[x] Portable resistance to concurrent ancestor-directory/reparse-point swaps is not provided by standard Node across Windows and Linux; document verifier as an integrity helper, not a filesystem sandbox (README.md, src/verify.ts, 2026-10-05) -- UNLOCKED 2026-10-05 (Grok Bot; owner may revisit): the actionable part (document the limit) is done in README.md and src/verify.ts, and verification-report.json now carries the same limitations; the platform limit itself stays documented, not solved
[x]   - emit verification-report.json -- src/verify/verify-reporter.ts, tests/verify-report.test.mjs (Grok 2026-10-05); createVerificationReport recomputes success, writeVerificationReport is exclusive-create (no overwrite) into an existing dir, no timestamp unless given (owner may revisit)
[x]   - diagnostic codes FUNGI-VERIFY-001 through FUNGI-VERIFY-005 -- src/verify.ts, tests/verify-contracts.test.mjs (Grok 2026-10-05); 001 malformed hash, 002 missing/unreadable/not a file, 003 mismatch, 004 path escapes root, 005 empty or duplicate set
[ ]   - create verify/ dir: verify-command.ts, verify-manifest.ts, verify-integrity.ts, verify-runtime.ts, verify-reporter.ts -- progress 2026-10-05: verify-reporter.ts and verify-manifest.ts exist; verify-command.ts, verify-integrity.ts, verify-runtime.ts not yet
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
[ ]   - diagnostic codes FUNGI-DEPLOY-001 through FUNGI-DEPLOY-005
[ ]   - create deploy/ dir: deploy-command.ts, deploy-policy.ts, deploy-validator.ts, deploy-report.ts, deploy-runtime.ts
[ ] Add Galerina explain command integration
[ ]   - explain imports, effects, capabilities, dependency tree
[ ]   - explain denial reasoning from deployment-denial.json
[ ]   - support --tree, --trace, --effects, --capabilities, --runtime, --policy, --audit, --json flags
[ ]   - implement ExplainTrace: step, label, input, output, diagnostics[]
[ ]   - implement ExplainResult: traces[], effects[], capabilities[], boundaries[], diagnostics[]
[ ]   - implement buildTrace(manifest, options): ExplainTrace[]
[ ]   - emit explain-report.json
[ ]   - diagnostic codes FUNGI-EXPLAIN-001 through FUNGI-EXPLAIN-004
[ ]   - create explain/ dir: explain-command.ts, explain-trace.ts, explain-tree.ts, explain-runtime.ts, explain-reporter.ts
[ ] Add Galerina plan command integration
[ ]   - estimate CPU/GPU/accelerator suitability and memory pressure
[ ]   - produce compute-plan.json
[ ]   - support --json, --runtime, --memory, --parallelism, --energy, --target, --graph, --compatibility flags
[ ]   - implement ComputePlan: target, gpu (GpuPlan), optical (OpticalPlan), wasm, compatibility, estimatedMemoryMb, parallelism, diagnostics[]
[ ]   - implement estimateTarget(workspace, options): ComputePlan
[ ]   - diagnostic codes FUNGI-PLAN-001 through FUNGI-PLAN-004
[ ]   - create plan/ dir: plan-command.ts, plan-graph.ts, plan-runtime.ts, plan-memory.ts, plan-reporter.ts
[ ] Add Galerina verify deploy command integration (verify running version against build manifest)
[ ] Add Galerina promote command integration (promote artifact across environments)
[ ] Add environment mode config loading
[x] Add structured CLI errors -- src/cli.ts FUNGI-CLI-001 unknown command (raw name never echoed), FUNGI-CLI-002 command threw (no internal detail), FUNGI-CLI-003 failure without its own error (exit code 0 is never success); tests/cli-structured-errors.test.mjs (Grok 2026-10-05)
[x] Add report summary output
[x] Add tests
```

Environment-mode note (2026-09-29, Grok Bot, owner-approved; see AGENTS
session-exchange grok-bot-pkg-todo-work-20260929/LEDGER.md): the `--env`
fail-open is fixed. `parseEnvironment` (src/cli.ts) now defaults to
`development` only when `--env` is absent and refuses an unknown value
(FUNGI-CLI-ENV-001, e.g. `--env prodution`), a missing value (FUNGI-CLI-ENV-002)
or a repeated flag (FUNGI-CLI-ENV-003) with a structured `CliError`
{code, safeMessage, suggestedFix} (src/types.ts) that never echoes raw input;
`--env=<value>` is also accepted. Tests: tests/cli-environment.test.mjs. The two
rows above stay open: no environment config file is loaded yet, and only the
`--env` path uses `CliError` (unknown-command and command errors are still
plain messages). Update 2026-10-05: structured CLI errors are now done (see the row above);
environment config loading stays open because no config-file convention is decided (owner may revisit).
