# galerina-core TODO: W01 inventory against the root work register (2026-10-05)

Grok Bot, standing permission; owner may revisit. NON_AUTHORIZING. Documentation only: no row is ticked, no source or .fungi file is changed.

Inputs: `packages-ts/galerina-core/TODO.md` and `docs/PRE-FUNGI-WORK-REGISTER-2026-09-22.md` at `origin/main` `df01d4ee038f54c56647a39cdd39ca863a40eff4`. This is the W01 lane output for this one file ("distinguish duplicates, historical slices, actual defects, missing decisions and deliberate deferrals").

## Method

Every open `[ ]` row (321) was assigned exactly one class. The source TODO separately contains 8 pre-existing actionable `[!]` blocked entries; these are not part of the 321 open rows. The 12 HOLD rows below are open `[ ]` tasks classified under the register's held lanes, not a recount of those `[!]` entries:

- **COVERED**: the register names the lane (W01-W15) that owns this work.
- **DEFERRED**: post-v1 by the package's own v1 scope rows (TODO.md:19-20, "v1 target scope CPU and WASM"; GPU/AI/photonic/domain packages post-v1) and register W11/W13 ("not silently promoted").
- **MEMORY**: memory-model work; skipped by instruction.
- **HOLD**: falls under the register's Held lanes (signing, production activation).
- **LIKELY_DONE**: an implementation already exists elsewhere (locator given). Not ticked here: the register's COMPLETE_VERIFIED needs a linked receipt, not a locator.
- **UNCOVERED**: not named by any lane, not a hold and not memory work. This is real work; each group lists its smallest next action.
- **NOT_A_TASK**: legend text.

Evidence probes were `git grep` over `packages-ts/*/src`, `scripts`, `docs`, `.github` and root markdown at the same commit, excluding galerina-core itself. A probe hit is a locator, not proof of behaviour.

## Totals

| Class | Rows |
|---|---|
| COVERED | 123 |
| DEFERRED | 84 |
| UNCOVERED | 73 |
| LIKELY_DONE | 14 |
| MEMORY | 14 |
| HOLD | 12 |
| NOT_A_TASK | 1 |
| **Total** | **321** |

## Uncovered real work (do or decide)

| TODO.md lines | Rows | Lane | Note / smallest next action |
|---|---|---|---|
| 403 | 1 | - | Decide module syntax: language contract decision not named in any register lane. Next: owner/Codex decision record |
| 829-837 | 9 | - | Debug console syntax/policy: not in any lane and not in v1 scope rows. Next: owner decision whether console is v1 or post-v1 |
| 916-918 | 3 | - | Debug/release build modes and build folder layout: not named in a lane. build/debug/ exists as a de-facto layout. Next: docs record of the existing layout |
| 936 | 1 | - | Source-map output rules (see 1021-1022). build/debug/app.source-map.json exists; no lane |
| 948-957 | 10 | - | Startup block / pre-main validation (env, secrets, routes, ports, webhook, packages, policies). docs/STARTUP_AND_BOOT_WARMUP.md is the design; no lane. Overlaps W15 security but not named |
| 958-966 | 9 | - | build --with-tests/--security/--strict flags, compiler block, fail_on_* and report outputs: CLI/product decisions, no lane |
| 976-993 | 3 | - | CLI init/lint/deploy: lint-checker.ts exists in the compiler; init/deploy commands absent in core-cli. Next: owner decision (deploy touches production activation, which is held) |
| 1006-1009 | 4 | - | AI-friendly summaries (token-efficient errors, project/route/type summaries). core-reports has AI-guide pieces; no lane |
| 1021-1022 | 2 | - | app.source-map.json format / binary-error mapping. build/debug/app.source-map.json exists as an artefact; no format doc |
| 1061-1072 | 11 | - | Test syntax and test models: galerina-test package exists; language test syntax not in a lane |
| 1107-1116 | 10 | - | Repository Git policy (branches, commits, PR/issue templates, tags, changelog, protection): owner process policy; CHANGELOG.md exists, no .github templates |
| 1125-1135 | 10 | - | Compiled-app Git policy (what to commit, artefacts, tags, rollback records): docs-only but policy-setting |

Uncovered rows in full:

- L403 (Syntax TODO): Decide module syntax
- L829 (Debug Console TODO): Define console.log/info/warn/error/debug syntax
- L830 (Debug Console TODO): Define console.here source-map output
- L831 (Debug Console TODO): Define console.scope and console.vars safety rules
- L832 (Debug Console TODO): Define console.dump size limits
- L833 (Debug Console TODO): Define SecureString redaction for console output
- L834 (Debug Console TODO): Define large JSON console summaries
- L835 (Debug Console TODO): Define production console policy
- L836 (Debug Console TODO): Define console report schema
- L837 (Debug Console TODO): Add console diagnostics to compiler prototype
- L916 (Build TODO): Define debug build mode
- L917 (Build TODO): Define release build mode
- L918 (Build TODO): Define build folder layout
- L936 (Build TODO): Define source-map output rules
- L948 (Security-First Build System TODO): Define startup block syntax
- L949 (Security-First Build System TODO): Define startup report schema
- L950 (Security-First Build System TODO): Validate required env variables before main()
- L951 (Security-First Build System TODO): Validate required secrets before main()
- L952 (Security-First Build System TODO): Validate security.api_methods against routes
- L953 (Security-First Build System TODO): Validate inbound ports against server.listen()
- L954 (Security-First Build System TODO): Validate route handlers before main()
- L955 (Security-First Build System TODO): Validate webhook HMAC/replay/idempotency requirements before main()
- L956 (Security-First Build System TODO): Validate packages registry before main()
- L957 (Security-First Build System TODO): Validate memory/vector/json policies before main()
- L958 (Security-First Build System TODO): Define Galerina build --with-tests
- L959 (Security-First Build System TODO): Define Galerina build --security
- L960 (Security-First Build System TODO): Define Galerina build --strict
- L961 (Security-First Build System TODO): Define compiler block syntax
- L962 (Security-First Build System TODO): Define fail_on_warning behavior
- L963 (Security-First Build System TODO): Define fail_on_test_failure behavior
- L964 (Security-First Build System TODO): Define app.test-report.json
- L965 (Security-First Build System TODO): Define app.ai-suggestions.md
- L966 (Security-First Build System TODO): Define app.ai-suggestions.json
- L976 (CLI TODO): Galerina init
- L985 (CLI TODO): Galerina lint
- L993 (CLI TODO): Galerina deploy
- L1006 (AI-Friendly TODO): Define token-efficient error reports
- L1007 (AI-Friendly TODO): Define AI-safe project summaries
- L1008 (AI-Friendly TODO): Define route summary output
- L1009 (AI-Friendly TODO): Define type summary output
- L1021 (Source Map TODO): Define app.source-map.json format
- L1022 (Source Map TODO): Map binary errors to .fungi files
- L1061 (Testing TODO): Define test syntax
- L1062 (Testing TODO): Define unit test model
- L1063 (Testing TODO): Define integration test model
- L1064 (Testing TODO): Define API test model
- L1065 (Testing TODO): Define webhook test model
- L1066 (Testing TODO): Define JSON validation tests
- L1067 (Testing TODO): Define security tests
- L1068 (Testing TODO): Define memory-safety tests
- L1070 (Testing TODO): Define source-map tests
- L1071 (Testing TODO): Define compiler report tests
- L1072 (Testing TODO): Define target report tests
- L1107 (Git TODO): Define branch strategy
- L1108 (Git TODO): Define feature branch naming
- L1109 (Git TODO): Define commit message format
- L1110 (Git TODO): Define pull request template
- L1111 (Git TODO): Define issue templates
- L1112 (Git TODO): Define release tags
- L1113 (Git TODO): Define changelog update process
- L1114 (Git TODO): Define generated file policy
- L1115 (Git TODO): Define docs-only change policy
- L1116 (Git TODO): Define main branch protection policy
- L1125 (Compiled App Git TODO): Define what Galerina app files should be committed
- L1126 (Compiled App Git TODO): Define what build files should not be committed
- L1127 (Compiled App Git TODO): Define when build artefacts may be stored
- L1128 (Compiled App Git TODO): Define source-map handling
- L1129 (Compiled App Git TODO): Define .env handling
- L1130 (Compiled App Git TODO): Define .env.example handling
- L1132 (Compiled App Git TODO): Define release artefact storage
- L1133 (Compiled App Git TODO): Define CI/CD deployment tags
- L1134 (Compiled App Git TODO): Define rollback tags
- L1135 (Compiled App Git TODO): Define multi-server deployment records

## Likely done elsewhere (needs a receipt before ticking)

| TODO.md lines | Rows | Lane | Note / smallest next action |
|---|---|---|---|
| 25 | 1 | - | scripts/audit-syntax.mjs, scripts/audit-example-diagnostics.mjs, core-compiler tests/gate-v3-shipped-examples.test.mjs parse docs/examples |
| 27 | 1 | - | docs/language-core-maturity-roadmap.md exists (packages-ts/galerina-core/docs/); row is a standing rule |
| 415 | 1 | - | docs/examples/ Level-1..9 with INDEX.md, EXAMPLES_INDEX.md and examples.manifest.json |
| 887-888 | 2 | - | Compiler is TypeScript under packages-ts/galerina-core-compiler/src |
| 890-892 | 3 | - | parser.ts, symbol-resolver.ts exist (AST types inside parser.ts) |
| 895-896 | 2 | - | taint-checker.ts / source-escape-checker.ts (security), effect-checker.ts |
| 898 | 1 | - | IR: gir-emitter.ts (GIR) |
| 902 | 1 | - | WASM output: core-compiler cli.ts/interpreter.ts, target-wasm |
| 907 | 1 | - | Report generator: core-reports/src/index.ts |
| 1163 | 1 | - | Repository scaffold exists |

## Covered by a register lane

| TODO.md lines | Rows | Lane | Note / smallest next action |
|---|---|---|---|
| 18-21 | 4 | Register execution order / root TODO (v1 core focus) | Standing scope policy; owner-held, not a code task |
| 23 | 1 | W04/W06/W07 | Bool/Tri/Decision/Option/Result semantics (Option/Result/Decimal schema decisions) |
| 26 | 1 | W13 | Reject post-v1 syntax: deliberate deferral lane |
| 114 | 1 | W04 | await-outside-async diagnostic: compiler semantic case enumeration |
| 164-176 | 13 | W08 (+W15 security) | Auth/OAuth/JWT/DPoP/PQ policy: OAuth/OpenID scope mapping is a CONTRACT_DECISION; galerina-auth/src/bearer.ts has JWT alg checks |
| 180-195 | 16 | W08/W09 | API body/limits/proxy/streaming policy (framework-api-server owner) |
| 199-214 | 16 | W08/W09 | Duplicate route / idempotency / webhook duplicates (route-registry.ts, app-kernel) |
| 416-424 | 9 | W13 (C20 general matcher) | Pattern/regex syntax and gates: deliberate deferral |
| 576-585 | 10 | W08/W15 | Auth/token/proof reports and JWT/DPoP/replay/PQ enforcement |
| 644-668 | 19 | W08/W09 | API duplicate/idempotency/body/load-control reports |
| 720-748 | 17 | W10/W11 | Compute/target/fallback/capability reports (compiler-compute handoff decision) |
| 761-773 | 4 | W10/W11 | Vector model (core-vector photonic ownership unsettled) |
| 848-858 | 5 | W10 | Target server/native/wasm syntax and capability reports |
| 897 | 1 | W06/W07 | JSON/API checker: JSON-Decimal and schema mapping decisions |
| 899-901 | 3 | W05/W10 | Optimiser/linker/CPU-native output: residual lowering + native target decisions |
| 967-968 | 2 | W10/W02 | Vector/offload and target-import checks in build pipeline |
| 1143 | 1 | W01/W06 | Finish documentation set |

## Deferred by v1 scope

| TODO.md lines | Rows | Lane | Note / smallest next action |
|---|---|---|---|
| 115-125 | 11 | Row 19-20 v1 scope + W13 | Dart/Flutter targets are post-v1 (v1 = CPU + WASM) |
| 129-139 | 11 | Row 19-20 v1 scope + W10/W13 | JS/Node/framework-adapter targets post-v1 (target-js has export markers in src/index.ts) |
| 143-148 | 6 | Row 20 v1 scope | Device/mobile boundary: domain package, post-v1 |
| 152-160 | 9 | Row 20 v1 scope | Text/token/prompt policy: domain package, post-v1 |
| 539-562 | 24 | Row 20 v1 scope | Image/video/search/translation provider packages: post-v1 domain |
| 784-792 | 9 | W11 (photonic post-v1) | Wavelength/hybrid compute |
| 804-819 | 14 | Row 19 v1 scope + W13 | Browser/frontend/DOM targets post-v1 |

## Held

| TODO.md lines | Rows | Lane | Note / smallest next action |
|---|---|---|---|
| 935 | 1 | Held lanes (signing/key ceremony) | Build signing: signing not authorized this phase |
| 1042-1053 | 11 | Held lanes (production activation) | Deployment workflow/rollback/production source maps: production activation is an owner/evidence gate. docs/DEPLOYMENT.md, .env.example and observability/src/health.ts exist for 1043-1044 and 1050 |

## Memory work (skipped)

| TODO.md lines | Rows | Lane | Note / smallest next action |
|---|---|---|---|
| 22 | 1 | - | Hybrid ownership memory model: memory work, skipped |
| 868-879 | 12 | - | Graph ownership / ownership modes / FFI ownership: memory work, skipped |
| 894 | 1 | - | Memory checker: memory work, skipped |

## Not a task

| TODO.md lines | Rows | Lane | Note / smallest next action |
|---|---|---|---|
| 36 | 1 | - | Status-key legend line |

## Disposition of the uncovered rows

None of the 73 uncovered rows is a bounded repair under an admitted contract. Each needs a product, language or process choice first, so none was implemented in this pass (doing so would invent semantics, which W01-W04 forbid). The decisions needed, smallest first:

1. **Git and compiled-app Git policy (L1107-1116, L1125-1135; 20 rows).** Owner process policy. Existing practice to record: `grok/` and `codex/` branch prefixes, CHANGELOG.md, `.github/workflows/conventions.yml`; there are no PR or issue templates.
2. **Build modes, layout and source maps (L916-918, L936, L1021-1022; 6 rows).** `build/debug/` and `build/debug/app.source-map.json` exist as de-facto artefacts with no format doc. Next: record the existing layout and source-map format as descriptive docs, then decide release mode.
3. **Startup / pre-main validation and build flags (L948-966; 19 rows).** Design is in `docs/STARTUP_AND_BOOT_WARMUP.md`; overlaps W15 but is not named. Next: decide whether this joins W15 or a new lane.
4. **CLI init/lint/deploy (L976-993; 3 rows).** `lint-checker.ts` exists in the compiler; core-cli has no init/deploy command. `deploy` touches production activation, which is held.
5. **Test syntax and test models (L1061-1072; 11 rows).** `galerina-test` exists as a package; language-level test syntax is undecided.
6. **AI-friendly summaries (L1006-1009; 4 rows)** and **debug console (L829-837; 9 rows).** Decide v1 versus post-v1.
7. **Module syntax (L403; 1 row).** Language contract decision.

Suggested register change (owner/Codex): add these seven groups to W01 as named CONTRACT_DECISION items, or mark them DEFERRED_SCOPE, so the package TODO can be closed against the register.
