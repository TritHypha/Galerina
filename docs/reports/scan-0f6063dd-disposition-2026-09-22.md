# Scan `0f6063dd` — 124-ID inventory

**Overall: INCOMPLETE_NON_AUTHORITATIVE.** Inventory is now 124/124 IDs. Closure is not.

- Scan id: `0f6063dd-cf7c-409d-852a-0aca46df30cc`
- Scan revision: `0f24ca30ef3f173c43a60c914c18b161327f2227`
- Snapshot: `codex-security-snapshot/v1:sha256:57f45438eabe616142ed43d84990cca9a2029fd14b6f8bafef024347db958d2d`
- findings.json sha256: `07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`
- Worktree HEAD (dirty): `91b4dec08fe4376febc9494a8023bd02912b8695`
- Severity: high 4 / medium 68 / low 52
- Disposition counts: PATCHED_AUDIT_PENDING 4 / PARTIAL_THIS_TREE 120 / OPEN_ON_SCAN_SNAPSHOT 0

The payload lived in Codex Security workbench + `%TEMP%\codex-security-scans-PN841u\...\findings.json`.
This table copies identity fields only (id, severity, title, path). It does not copy PoCs.
OPEN_ON_SCAN_SNAPSHOT means the ID is known and not re-verified on this dirty tree.
PARTIAL_THIS_TREE / PATCHED_AUDIT_PENDING are not production closure.

| # | finding_id | sev | path | title | disposition |
|---|---|---|---|---|---|
| 1 | `csf_7c334da06ea43bf62f7b58f9` | high | `scripts/lib/signed-lmanifest.mjs` | Windows package rebuilding interprets discovered directory names as shell commands | PATCHED_AUDIT_PENDING |
| 2 | `csf_2a86648bf19537088fa9b394` | high | `packages-ts/galerina-framework-app-kernel/src/kernel.ts` | Unauthenticated requests permanently exhaust the default kernel audit capacity | PATCHED_AUDIT_PENDING |
| 3 | `csf_176f3d7332761399dac3c39d` | high | `packages-ts/galerina-framework-app-kernel/src/fuse-loader.ts` | Manifest key identifiers can escape the governance directory and select attacker-owned verification keys | PATCHED_AUDIT_PENDING |
| 4 | `csf_abb8e005fb7ba36366169ba5` | high | `packages-ts/galerina-framework-api-server/src/index.ts` | Malformed request targets escape the asynchronous request error boundary | PATCHED_AUDIT_PENDING |
| 5 | `csf_f282dd36883a0c39f717e72d` | medium | `packages-ts/galerina-tower-citizen/src/hybrid-engine.ts` | Bridge attestation is not bound to the instances invoked throughout their lifecycle | PARTIAL_THIS_TREE |
| 6 | `csf_fb5b3bf4d8124b5a9ea9f1e9` | medium | `packages-ts/galerina-ext-photonic-emulator/src/partition-decider.ts` | Photonic routing allocates from an unchecked kernel dimension | PARTIAL_THIS_TREE |
| 7 | `csf_cc6db185bcfb679e18ea482a` | medium | `packages-ts/galerina-core-sentinel-memory/src/tpl-state-buffer.ts` | TPL buffer keeps access to a freed and reused allocation | PARTIAL_THIS_TREE |
| 8 | `csf_0492167ebb8e01c09ad5872c` | medium | `packages-ts/galerina-core-sentinel-state/src/atomic-writer.ts` | Snapshot names escape the configured storage directory | PARTIAL_THIS_TREE |
| 9 | `csf_018f73bf926a34658d55adfc` | medium | `packages-ts/galerina-tools-myco/src/graph/store.ts` | Myco rebuild follows rejected cache symlinks and overwrites files outside its root | PARTIAL_THIS_TREE |
| 10 | `csf_7a6508dbb21c910a7648d293` | medium | `packages-ts/galerina-core-compiler/src/crypto-provider-node.ts` | BCrypt.hash accepts source-controlled expensive cost and runs synchronously | PARTIAL_THIS_TREE |
| 11 | `csf_f3401d9749e83f0b194b56df` | medium | `packages-ts/galerina-core-sentinel-state/src/atomic-writer.ts` | Snapshot reading and erasure allocate from unbounded file size | PARTIAL_THIS_TREE |
| 12 | `csf_02156b5c510ca60c2a2637f7` | medium | `packages-ts/galerina-ext-photonic-emulator/src/photonic-bridge.ts` | Photonic bridge decoding ignores buffer capacity and count ceilings | PARTIAL_THIS_TREE |
| 13 | `csf_5740f1c66d778367a4f731d6` | medium | `packages-ts/galerina-auth/src/bearer.ts` | Serialized asymmetric public keys are accepted as JWT HMAC secrets | PARTIAL_THIS_TREE |
| 14 | `csf_d87a999abe6e43db3197cc1f` | medium | `packages-ts/galerina-devtools-benchmarks/src/runner.mjs` | Deno benchmark shell interpolation bypasses runtime permission boundaries | PARTIAL_THIS_TREE |
| 15 | `csf_e79c558f745535f0e23cab14` | medium | `packages-ts/galerina-tri-regex/src/parser.ts` | Regex nesting bypasses the parser's work-budget refusal | PARTIAL_THIS_TREE |
| 16 | `csf_aee31b6185becb47f883b0d7` | medium | `packages-ts/galerina-core-sentinel-state/src/cold-boot.ts` | Cold boot verifies snapshot integrity without a rollback floor | PARTIAL_THIS_TREE |
| 17 | `csf_87352346f8708fa965b75642` | medium | `packages-ts/galerina-core-compiler/src/stdlib.ts` | Filesystem writes escape GALERINA_FS_ROOT through dangling symlinks | PARTIAL_THIS_TREE |
| 18 | `csf_4b117d1baa93121b41b11e87` | medium | `packages-ts/galerina-core-compiler/src/cli.ts` | Compiler source readers allocate entire files before enforcing source limits | PARTIAL_THIS_TREE |
| 19 | `csf_4531c31d96dd7d2291a4d57c` | medium | `packages-ts/galerina-framework-app-kernel/src/registry-durability-production-admission.ts` | Linked publication and production rotation bypass the separate owner-release gate | PARTIAL_THIS_TREE |
| 20 | `csf_e3409dfe75ff7adda18f556a` | medium | `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` | WASM's range host import allocates outside guest memory and fuel limits | PARTIAL_THIS_TREE |
| 21 | `csf_04b1ca56fd9143e13de6b0d2` | medium | `packages-ts/galerina-tower-citizen/src/hybrid-engine.ts` | Incomplete bridge verification is cached as successful admission | PARTIAL_THIS_TREE |
| 22 | `csf_ecf2128fafd9c3efdffc7611` | medium | `packages-ts/galerina-core/compiler/galerina.js` | AI-guide output path escapes the configured build directory | PARTIAL_THIS_TREE |
| 23 | `csf_0a13165351fee2628f4fc557` | medium | `packages-ts/galerina-tower-citizen/src/bridge/stub-provider.ts` | Packed ternary decoding allocates from an unchecked caller count | PARTIAL_THIS_TREE |
| 24 | `csf_97aa94f1a74c506b55bcb1a1` | medium | `packages-ts/galerina-core-compiler/src/runtime.ts` | Source-declared effects are used as runtime authorization | PARTIAL_THIS_TREE |
| 25 | `csf_77b916a8ab8239a016c1794f` | medium | `packages-ts/galerina-core-compiler/src/runtime/retryPolicy.ts` | Retry policy accepts unbounded attempts and can loop indefinitely | PARTIAL_THIS_TREE |
| 26 | `csf_44ad57ee61239f80ba431e63` | medium | `packages-ts/galerina-core-sentinel-state/src/state-serializer.ts` | Default snapshot authentication uses a public all-zero HMAC key | PARTIAL_THIS_TREE |
| 27 | `csf_6c6ebe8f17bfb2ad895b1f30` | medium | `packages-ts/galerina-data-json/src/json-value.ts` | JSON input limits are enforced after attacker-sized decoding and allocation | PARTIAL_THIS_TREE |
| 28 | `csf_554dd888b982b37741c01b17` | medium | `packages-ts/galerina-core-compiler/src/lexer.ts` | Lexer token limits are bypassed by non-newline token paths | PARTIAL_THIS_TREE |
| 29 | `csf_231c9774990ce1458711c40d` | medium | `packages-ts/galerina-devtools-benchmarks/src/build-native.mjs` | Native benchmark compilation interprets repository paths as shell syntax | PARTIAL_THIS_TREE |
| 30 | `csf_9f99c2b9351a58e3105857f0` | medium | `galerina.mjs` | Manifest verification authenticates the JSON sidecar instead of the checked CBOR subject | PARTIAL_THIS_TREE |
| 31 | `csf_bec723cd02be20807a46da3c` | medium | `packages-ts/galerina-core-compiler/src/parser.ts` | Unary-prefix parsing bypasses the expression-depth guard | PARTIAL_THIS_TREE |
| 32 | `csf_bc2637b129881b6961435a97` | medium | `packages-ts/galerina-devtools-package-graph/src/scanner.ts` | String literals containing comment markers hide real imports from boundary enforcement | PARTIAL_THIS_TREE |
| 33 | `csf_19dd3815a61cb9705e944b71` | medium | `packages-ts/galerina-devtools-security/src/secret-checker.ts` | Secret metadata detector misses camelCase credential keys | PARTIAL_THIS_TREE |
| 34 | `csf_ca7eb6675543b7214745b057` | medium | `governance/revocation-registry.mjs` | Legacy admission treats missing or replaced revocation state as trusted | PARTIAL_THIS_TREE |
| 35 | `csf_758d92313370e633b8bc394d` | medium | `packages-ts/galerina-ext-photonic-emulator/src/freivalds.ts` | Freivalds verifier accepts non-finite products without detecting mismatch | PARTIAL_THIS_TREE |
| 36 | `csf_ae1e06eae125bbb82c0c332a` | medium | `packages-ts/galerina-tower-citizen/src/hybrid-engine.ts` | Untrusted inference plans allocate and persist before admission or input bounds | PARTIAL_THIS_TREE |
| 37 | `csf_d27f1685f1b406f9a3f55647` | medium | `packages-ts/galerina-core/compiler/galerina.js` | Project ingestion has no aggregate source size, file-count, or traversal-depth budget | PARTIAL_THIS_TREE |
| 38 | `csf_8eb750c29eea3b36b37a8d65` | medium | `packages-ts/galerina-ext-secrets-spore/src/cli.ts` | Entering secrets in the interactive shell can expose them on the terminal | PARTIAL_THIS_TREE |
| 39 | `csf_1b4570816f7f2097d9cf405b` | medium | `galerina.mjs` | Package descriptor names escape the build output directory | PARTIAL_THIS_TREE |
| 40 | `csf_620c9e3a9501ebf19273ddd7` | medium | `packages-ts/galerina-core-runtime/src/index.ts` | The governed runtime retains mutable artifact aliases across admission and execution | PARTIAL_THIS_TREE |
| 41 | `csf_87678448ed0e81dd1e9b4a88` | medium | `scripts/build-requirement-launcher.mjs` | Requirement launcher writes through unverified output links | PARTIAL_THIS_TREE |
| 42 | `csf_37a9ad734f2294cf7eddf3e5` | medium | `packages-ts/galerina-tower-citizen/src/substrate-erasure.ts` | Storage substrate attestation can bypass signer revocation | PARTIAL_THIS_TREE |
| 43 | `csf_5272befa84a2050393d0f899` | medium | `packages-ts/galerina-tools-myco/src/ingest/walk.ts` | Repository-controlled ignore globs cause synchronous catastrophic backtracking | PARTIAL_THIS_TREE |
| 44 | `csf_fbc2bfa6f90625ea0e399ec7` | medium | `scripts/deploy-linux.sh` | Linux deployment helper interpolates source basenames into node -e code | PARTIAL_THIS_TREE |
| 45 | `csf_78294e1131c5f50b6041a758` | medium | `packages-ts/galerina-core-sentinel-io/src/zero-copy-mapper.ts` | Sentinel ingestion can stage bytes different from those verified | PARTIAL_THIS_TREE |
| 46 | `csf_0a079c981e51180496dc447a` | medium | `packages-ts/galerina-core-compiler/src/wat-assembler.ts` | Direct WAT execution has no enforceable execution deadline or fuel budget | PARTIAL_THIS_TREE |
| 47 | `csf_e5f6b2d8cd56326fcafa7f6f` | medium | `packages-ts/galerina-core-sentinel-memory/src/photonic-bridge-interface.ts` | SRAM channel handles can read and write outside their stride | PARTIAL_THIS_TREE |
| 48 | `csf_d76d15646ea7b5493277f60c` | medium | `packages-ts/galerina-tower-citizen/src/photonic-admission.ts` | Photonic configuration controls whether its signer is checked for revocation | PARTIAL_THIS_TREE |
| 49 | `csf_275271374b1b30b39c30222f` | medium | `packages-ts/galerina-framework-app-kernel/src/registry-generation-store.ts` | Generation publication follows a replaceable pathname when changing permissions | PARTIAL_THIS_TREE |
| 50 | `csf_6863d7f4897abd8b695edff4` | medium | `packages-ts/galerina-framework-app-kernel/src/registry-durability-production-admission.ts` | Durability admission brands profile fields that were not signed | PARTIAL_THIS_TREE |
| 51 | `csf_106c55f9ca064178e29347d0` | medium | `packages-ts/galerina-core/compiler/galerina.js` | Raw source-text matching selects unbounded benchmark execution | PARTIAL_THIS_TREE |
| 52 | `csf_44389b10328fc0b12408a84c` | medium | `packages-ts/galerina-core-sentinel-state/src/state-serializer.ts` | Snapshot deserialization parses a value different from the verified payload | PARTIAL_THIS_TREE |
| 53 | `csf_8b808c52eea585b85adaabc8` | medium | `packages-ts/galerina-core-sentinel-state/src/cold-boot.ts` | Checkpoint writes and scrubbing follow storage links outside their directory | PARTIAL_THIS_TREE |
| 54 | `csf_d612a71be9f290ce1b6f2c75` | medium | `galerina.mjs` | Build signing rereads source after compilation and can bind a different input | PARTIAL_THIS_TREE |
| 55 | `csf_51a46d204732d2c352ceb6f7` | medium | `packages-ts/galerina-ext-spore/src/container.ts` | Opening a compact .spore file can trigger repeated payload hashing | PARTIAL_THIS_TREE |
| 56 | `csf_c12eac261f985af483ce61d8` | medium | `packages-ts/galerina-devtools-project-graph/src/reporting/event-dag.ts` | Audit event DAG reconstruction repeats full graph copies per continuation | PARTIAL_THIS_TREE |
| 57 | `csf_6ffbe767fb4a7baff5000c26` | medium | `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` | admitAndInstantiate can verify one WASM module and instantiate another | PARTIAL_THIS_TREE |
| 58 | `csf_6955d450f0b42e29883196a8` | medium | `packages-ts/galerina-tower-citizen/src/registry-key-rotation.ts` | Checkpoint restore authenticates different bytes from the state it restores | PARTIAL_THIS_TREE |
| 59 | `csf_03064225783c475027bf7f5b` | medium | `packages-ts/galerina-core-compiler/src/stdlib.ts` | Array.range permits non-progressing loops outside interpreter budgets | PARTIAL_THIS_TREE |
| 60 | `csf_d5bf0279d3fa0e2679371071` | medium | `packages-ts/galerina-framework-api-server/src/replay-store.ts` | The webhook replay store retains an unbounded number of attacker-selected keys | PARTIAL_THIS_TREE |
| 61 | `csf_17fa05e63b8f227132fd6669` | medium | `packages-ts/galerina-core-compiler/src/module-registry.ts` | Acyclic import graphs cause exponential repeated resolution | PARTIAL_THIS_TREE |
| 62 | `csf_2f01f14cfd15ebcf53d39c71` | medium | `packages-ts/galerina-tower-citizen/src/bridge-attestation.ts` | Hybrid signatures can verify different manifest preimages | PARTIAL_THIS_TREE |
| 63 | `csf_14ab43fde3a4875a5afe9810` | medium | `packages-ts/galerina-core/compiler/galerina.js` | Recursive pseudo-evaluation has no call-depth or cycle bound | PARTIAL_THIS_TREE |
| 64 | `csf_6cff52f9ec86bf43a69a0e0e` | medium | `packages-ts/galerina-devtools-intelligence/src/indexer.ts` | Intelligence indexer reads sources and cache before any byte budget | PARTIAL_THIS_TREE |
| 65 | `csf_088de8906119ef06a0cc4fdf` | medium | `packages-ts/galerina-devtools-package-graph/src/scanner.ts` | Package-controlled scan configuration bypasses the dependency boundary gate | PARTIAL_THIS_TREE |
| 66 | `csf_a29c2f0f698df064615df16d` | medium | `packages-ts/galerina-framework-api-server/src/webhook-admission.ts` | Unsigned event IDs allow signed webhook bodies to be replayed | PARTIAL_THIS_TREE |
| 67 | `csf_0f748088754ddb920ceb641f` | medium | `packages-ts/galerina-core-sentinel-egress/src/audit-egress.ts` | Audit-chain MAC does not bind record boundaries | PARTIAL_THIS_TREE |
| 68 | `csf_f89b4b3e81e08121ebbdabed` | medium | `packages-ts/galerina-core-compiler/src/interpreter.ts` | Environment reads bypass capability authorization and secure-value tracking | PARTIAL_THIS_TREE |
| 69 | `csf_123a0c5bba057ae4781efcd9` | medium | `packages-ts/galerina-core-compiler/src/typed-content-block.ts` | Typed-content interpolation validation performs quadratic work | PARTIAL_THIS_TREE |
| 70 | `csf_5d8c6b9918cd7dfe231ce75f` | medium | `packages-ts/galerina-data-json/src/json-value.ts` | JSON encoding recursively expands caller-controlled graphs without resource limits | PARTIAL_THIS_TREE |
| 71 | `csf_f2a86f77b0c6d0e831e14640` | medium | `packages-ts/galerina-tower-citizen/src/hybrid-engine.ts` | Cached admission ignores later signing-key and device revocation | PARTIAL_THIS_TREE |
| 72 | `csf_6cf7a494a713c40efe8c5d2c` | medium | `packages-ts/galerina-tower-citizen/src/hybrid-engine.ts` | Capability authority is adopted from mutable input after signature verification | PARTIAL_THIS_TREE |
| 73 | `csf_fd74b2a34bfe325906af1691` | low | `packages-ts/galerina-observability/src/logger.ts` | Default logger retains every emitted record indefinitely | PARTIAL_THIS_TREE |
| 74 | `csf_23eb306ca5b3cc0c49f1da9f` | low | `packages-ts/galerina-core-sentinel-memory/src/tpl-state-buffer.ts` | Recycled TPL allocations start with invalid packed-trit state | PARTIAL_THIS_TREE |
| 75 | `csf_ba63b06905a1b2259c3cb1a4` | low | `packages-ts/galerina-core-sentinel-state/src/cold-boot.ts` | Snapshot scrub leaves plaintext temporary files after interrupted writes | PARTIAL_THIS_TREE |
| 76 | `csf_e145f9dfd60df70053acdab4` | low | `packages-ts/galerina-core-sentinel-power/src/power-governor.ts` | Non-finite thermal readings select the nominal execution tier | PARTIAL_THIS_TREE |
| 77 | `csf_e28e823a7e7a74767725c9db` | low | `packages-ts/galerina-devtools-impact/src/git-changes.mjs` | Impact planner passes an option-like base argument to Git before the option terminator | PARTIAL_THIS_TREE |
| 78 | `csf_ac73ec6448618999eb697045` | low | `packages-ts/galerina-core-sentinel-memory/src/static-memory-pool.ts` | Pool views trust caller-supplied allocation length | PARTIAL_THIS_TREE |
| 79 | `csf_b7c875ed001f66b8abedfc85` | low | `packages-ts/galerina-devtools-graph-algorithms/src/semantic/SemanticGraph.ts` | Semantic reachability rescans every edge for each visited node | PARTIAL_THIS_TREE |
| 80 | `csf_a0b09998cf446f5ab4abfa6b` | low | `packages-ts/galerina-core/compiler/galerina.js` | Generated-output writes follow preexisting symlinks or reparse points | PARTIAL_THIS_TREE |
| 81 | `csf_c840efd6f4fca9794bafb11d` | low | `packages-ts/galerina-devtools-pci/src/pci-checker.ts` | PCI audit accepts TLS and authority evidence from unrelated flows | PARTIAL_THIS_TREE |
| 82 | `csf_d6acd81d895092a4750e52bf` | low | `packages-ts/galerina-devtools-package-graph/src/scanner.ts` | Package scan roots can traverse outside the caller-selected scope | PARTIAL_THIS_TREE |
| 83 | `csf_cd736ac270a43e44766d688f` | low | `packages-ts/galerina-core-tasks/src/load-tasks.ts` | Task loader allocates an entire source file without a byte ceiling | PARTIAL_THIS_TREE |
| 84 | `csf_231c2c91fe1c3bf4207683a3` | low | `packages-ts/galerina-core/compiler/formatter.js` | Formatter follows a caller-supplied source symlink and overwrites its target | PARTIAL_THIS_TREE |
| 85 | `csf_ddbb7e9eaad1d95ecfd447ee` | low | `scripts/relink-workspace.mjs` | Workspace dependency names redirect link creation outside node_modules | PARTIAL_THIS_TREE |
| 86 | `csf_6d57f5d985e3cf31042c6b60` | low | `packages-ts/galerina-core/compiler/galerina.js` | Build verification follows manifest-controlled paths outside the build directory | PARTIAL_THIS_TREE |
| 87 | `csf_2341f6d5046d9f3ae2f276ef` | low | `packages-ts/galerina-core-compiler/scripts/cec-do-promote.mjs` | cec-do-promote trusts candidate names and can overwrite files outside Examples | PARTIAL_THIS_TREE |
| 88 | `csf_1c14fc61fe1e266650aea121` | low | `scripts/audit-corpus-effect-names.mjs` | Effect-name audit treats unread or absent corpus input as a clean sweep | PARTIAL_THIS_TREE |
| 89 | `csf_5afc126460cedbd17c970337` | low | `packages-ts/galerina-test/src/runners.ts` | Build-evidence verification performs unbounded recursive duplicate-key scanning | PARTIAL_THIS_TREE |
| 90 | `csf_bae056fe7c8d64f567f4b7ec` | low | `packages-ts/galerina-framework-app-kernel/native/registry-durability/src/lib.rs` | A preexisting FIFO can indefinitely block Linux native publication | PARTIAL_THIS_TREE |
| 91 | `csf_322ab6f1302a5fe0ecac5b2c` | low | `packages-ts/galerina-devtools-fungi-scan/src/scanner.ts` | Shape-only signed-manifest detection exempts arbitrary corpus files from strict migration checks | PARTIAL_THIS_TREE |
| 92 | `csf_4ed0a2dce4f0a888cce874b7` | low | `packages-ts/galerina-devtools-graph-algorithms/src/graphs/boundary-graph.ts` | Missing flow metadata is promoted to internal trust in boundary graphs | PARTIAL_THIS_TREE |
| 93 | `csf_f569fd828cde29e4e9f64660` | low | `scripts/check-gate-injection.mjs` | Admission-border revocation checks can be bypassed with comments or unrelated identifiers | PARTIAL_THIS_TREE |
| 94 | `csf_2cb1c6d5f0b7c955766a9b48` | low | `scripts/verify-artifacts.mjs` | Manifest-declared wasm references can make the integrity scanner read outside the repository | PARTIAL_THIS_TREE |
| 95 | `csf_487865ffec641dbfe1b0b711` | low | `packages-ts/galerina-core-compiler/src/stdlib.ts` | Filesystem reads reopen checked paths and permit link-substitution escape | PARTIAL_THIS_TREE |
| 96 | `csf_0906c00787369feb953dde55` | low | `packages-ts/galerina-core-compiler/src/wat-emitter.ts` | Secret-marked heap data is not wiped on every flow exit | PARTIAL_THIS_TREE |
| 97 | `csf_0a95c15113bc3d0743b38458` | low | `scripts/emit-doc-wat.mjs` | emit-doc-wat permits repository-controlled markers to import files outside the repository | PARTIAL_THIS_TREE |
| 98 | `csf_33d88401265b94e1efe460dc` | low | `packages-ts/galerina-framework-app-kernel/src/fuse-loader.ts` | Fuse loader derives manifest and WASM paths from an unvalidated package name | PARTIAL_THIS_TREE |
| 99 | `csf_37603f68f4f4bc0ad123cb61` | low | `galerina.mjs` | Package entry traversal redirects automatic source rewriting outside the package | PARTIAL_THIS_TREE |
| 100 | `csf_bcefbf918290f4ae5f95fb54` | low | `scripts/audit-wasm-validate.mjs` | WASM validation returns success for skipped or absent input | PARTIAL_THIS_TREE |
| 101 | `csf_ad2941465d7416a0948f89da` | low | `scripts/conversion-queue.mjs` | Conversion queue hashes files outside the repository from unvalidated retirement metadata | PARTIAL_THIS_TREE |
| 102 | `csf_9858ec158575ac1bc8012785` | low | `packages-ts/galerina-devtools-pci/src/compliance-ledger.ts` | Compliance ledger accepts unauthenticated egress decisions | PARTIAL_THIS_TREE |
| 103 | `csf_014ea5de2911424f2c64d2d6` | low | `packages-ts/galerina-devtools-benchmarks/src/report-model.mjs` | Benchmark Markdown reports preserve result-controlled markup | PARTIAL_THIS_TREE |
| 104 | `csf_dcb4cf46b657cc73883f5615` | low | `packages-ts/galerina-core-sentinel-time/src/logical-clock.ts` | Logical clock stops advancing outside the safe integer range | PARTIAL_THIS_TREE |
| 105 | `csf_844ae53189ccca7718b6024b` | low | `packages-ts/galerina-framework-app-kernel/src/registry-durability-production-admission.ts` | Owner-release activation can accept an expired signed authorization through inconsistent object reads | PARTIAL_THIS_TREE |
| 106 | `csf_7e68290c158f93818c9dac5e` | low | `scripts/lib/receipt-bound-slide-build.mjs` | SLIDE builder executes tool files after their pinned-content check | PARTIAL_THIS_TREE |
| 107 | `csf_1ebc84936ed0b9a02d25d724` | low | `packages-ts/galerina-core-cli/src/graph-command.ts` | Project graph collection escapes the workspace through configured roots | PARTIAL_THIS_TREE |
| 108 | `csf_f1da2541c73e90978ac2095c` | low | `scripts/audit-private-doc-leak.mjs` | Private-document publication gate reports success for 256 detected references | PARTIAL_THIS_TREE |
| 109 | `csf_f8430446c39ce8e2ed571bab` | low | `packages-ts/galerina-devtools-provenance/src/analyzer.ts` | Provenance directory traversal follows symlinks and can escape or cycle outside the selected root | PARTIAL_THIS_TREE |
| 110 | `csf_a77cdc8c16ffb066c41b81fd` | low | `packages-ts/galerina-devtools-fungi-scan/src/scanner.ts` | Corpus scanner performs unbounded hostile-file reads before applying parser limits | PARTIAL_THIS_TREE |
| 111 | `csf_9897c60d1d1b4dc57fa81419` | low | `packages-ts/galerina-devtools-context/src/markdown-renderer.ts` | Context receipt Markdown output emits source-controlled intent without control or markup escaping | PARTIAL_THIS_TREE |
| 112 | `csf_ec4df379040fdca288ff057c` | low | `packages-ts/galerina-core-sentinel-time/src/synchronization-gate.ts` | Non-finite clock inputs suppress drift refusal | PARTIAL_THIS_TREE |
| 113 | `csf_b020bf3ce948fc9267d8e23d` | low | `packages-ts/galerina-ext-bridge-cpp/src/addon-loader.ts` | Native addon pinning checks different file access from native loading | PARTIAL_THIS_TREE |
| 114 | `csf_456107f3e63d6f916462d1bf` | low | `packages-ts/galerina-core-compiler/src/pure-flow-cache.ts` | Pure-flow result caching is not bound to the current source | PARTIAL_THIS_TREE |
| 115 | `csf_ca20b261bd6e7c977a558785` | low | `scripts/audit-wat-lowering.mjs` | WAT lowering audit accepts unread or parse-skipped corpus input | PARTIAL_THIS_TREE |
| 116 | `csf_96f8b6458988c6ce1208df0b` | low | `scripts/rebrand-tmf-to-spore.mjs` | rebrand-tmf-to-spore enables Windows command injection through tracked filenames | PARTIAL_THIS_TREE |
| 117 | `csf_30936b039d064da89a8a7b01` | low | `packages-ts/galerina-framework-api-server/src/index.ts` | Rejected webhook requests consume replay identity before authorization | PARTIAL_THIS_TREE |
| 118 | `csf_d61c1410698c885114d3b250` | low | `packages-ts/galerina-framework-app-kernel/src/registry-generation-store.ts` | Registry read limits are checked after unbounded reads | PARTIAL_THIS_TREE |
| 119 | `csf_6ea131d447cf245230cf6c2f` | low | `scripts/fix-logicn-brand.mjs` | fix-logicn-brand can read and overwrite arbitrary paths supplied through stdin | PARTIAL_THIS_TREE |
| 120 | `csf_38215fae09550ce4426e5ce1` | low | `packages-ts/galerina-ext-tritsocket/src/prefilter.ts` | Tritsocket helpers allocate from unchecked numeric dimensions | PARTIAL_THIS_TREE |
| 121 | `csf_5e50fd79deea0f1d7bfc1c84` | low | `packages-ts/galerina-devtools-provenance/src/analyzer.ts` | Provenance analyzer can certify a sink as gated from comments or out-of-order gate calls | PARTIAL_THIS_TREE |
| 122 | `csf_635ee1a63cbbdf28942f7abc` | low | `packages-ts/galerina-devtools-security/conformance-scan.mjs` | Text-presence conformance gate can certify controls that exist only in comments or dead strings | PARTIAL_THIS_TREE |
| 123 | `csf_ea1e5710b3b1a7fc3df7e589` | low | `scripts/migrate-fungi.mjs` | Bulk maintenance follows repository links when rewriting external files | PARTIAL_THIS_TREE |
| 124 | `csf_0e7d6b428bc9ca9bc291ea3d` | low | `packages-ts/galerina-devtools-fungi-scan/src/scanner.ts` | Manifest name permits path traversal during signed-root discovery | PARTIAL_THIS_TREE |

Machine-readable companion: [scan-0f6063dd-inventory-2026-09-22.json](scan-0f6063dd-inventory-2026-09-22.json).
