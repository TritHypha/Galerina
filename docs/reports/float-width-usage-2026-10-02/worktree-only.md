# Float32Array / Float16Array / Math.fround / Math.f16round: sites only in other worktrees

Tool: scripts/symbol-usage-search.mjs --preset float-width (read-only; tracked + untracked-not-ignored files; node_modules, .worktrees, build, dist, target, coverage excluded). Main reference: 39 paths.

## Paths with matches that are not on main (4)

- packages-ts/galerina-core-compiler/src/interpreter.ts (3 lines, comment) - grok-baseline-05eb5c29-20261002
- packages-ts/galerina-core-compiler/src/narrow-float.ts (6 lines, comment/rounding-call) - grok-baseline-05eb5c29-20261002
- packages-ts/galerina-core-compiler/src/wat-emitter-binary.ts (2 lines, comment) - grok-baseline-05eb5c29-20261002
- packages-ts/galerina-core-compiler/tests/wat-e5-narrow-float.test.mjs (9 lines, comment/other/rounding-call) - grok-baseline-05eb5c29-20261002

## Per worktree (73)

- Galerina: 75 matches in 34 files; 0 paths not on main
- C:/Users/phill/AppData/Local/Temp/codex-security-range-worktree-20260811-151236/Galerina: missing on disk
- C:/Users/phill/AppData/Local/Temp/galerina-ci-fix-1ce0bae691f340d6b95904bff47b2805/worktree: missing on disk
- C:/Users/phill/AppData/Local/Temp/rd0858-fix-round-2-e4d4897: missing on disk
- rd0873-graph-e77598e4: 75 matches in 34 files; 0 paths not on main
- Galerina: 51 matches in 22 files; 0 paths not on main
- docs-index-lf-materialization: 49 matches in 21 files; 0 paths not on main
- grok-baseline-05eb5c29-20261002: 122 matches in 43 files; 4 paths not on main
- grok-diag-constants-20261002: 80 matches in 37 files; 0 paths not on main
- grok-interpreter-i2-i3-20261002: 80 matches in 37 files; 0 paths not on main
- grok-pkg-todos-20260929: 80 matches in 37 files; 0 paths not on main
- grok-roadmap-05eb5c29: 80 matches in 37 files; 0 paths not on main
- grok-rounding-20260930: 80 matches in 37 files; 0 paths not on main
- grok-wat-integration-20260930: 80 matches in 37 files; 0 paths not on main
- Galerina: 73 matches in 33 files; 0 paths not on main
- rd-0873-native-fungi-bootstrap-continuation: 75 matches in 34 files; 0 paths not on main
- rd-0873-native-fungi-bootstrap-finalize: 75 matches in 34 files; 0 paths not on main
- rd-0873-native-fungi-bootstrap-implementation: 80 matches in 37 files; 0 paths not on main
- rd-0873-native-fungi-bootstrap-plan: 75 matches in 34 files; 0 paths not on main
- rd-0873-native-fungi-bootstrap-resume: 75 matches in 34 files; 0 paths not on main
- rd0873-docs-index-manifest: 75 matches in 34 files; 0 paths not on main
- rd0873-graph-refresh-clean: 75 matches in 34 files; 0 paths not on main
- rd0873-pinned-upload-format-observation-source: 49 matches in 21 files; 0 paths not on main
- rd0873-pre-restart-docs-20260905: 75 matches in 34 files; 0 paths not on main
- rd0873-source-origin-galerina: 75 matches in 34 files; 0 paths not on main
- rd0873-task6b-f0-split-evidence: 75 matches in 34 files; 0 paths not on main
- rd0873-task6b-split-evidence-candidate: 75 matches in 34 files; 0 paths not on main
- rd0873-task6cr-hosted-evidence: 75 matches in 34 files; 0 paths not on main
- rd0873-task6d-cumulative: 75 matches in 34 files; 0 paths not on main
- rd0873-task6d-platform-receipt-hold: 75 matches in 34 files; 0 paths not on main
- rd0873-task6d-workflow-repair: 75 matches in 34 files; 0 paths not on main
- rd0873-task6f-dispatch-registration: 49 matches in 21 files; 0 paths not on main
- rd0873-task6f-evidence-candidate: 75 matches in 34 files; 0 paths not on main
- rd0873-toolchain-pin-observation-fix: 75 matches in 34 files; 0 paths not on main
- rd0873-toolchain-pin-workflow-main: 49 matches in 21 files; 0 paths not on main
- rd1246-scalar-chain-spike: 80 matches in 37 files; 0 paths not on main
- rd1296-host-lifecycle: 80 matches in 37 files; 0 paths not on main
- root-lock-base-audit-c3360c14: 75 matches in 34 files; 0 paths not on main
- supergrok-wat-hof-20260929: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-hof-capture-20260929: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-hof-shadowing-20260929: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-j1-20260929: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-j3-20260929: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-j4-20260929: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-j5-20260929: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-j6a-20260929: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-j6b-20260929: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-j6c-20260929: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-j7-20260929: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-j8-20260929: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-jr2-20260929: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-jr3-20260929: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-jr4-20260929: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-jr5-20260929: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-jr6-20260929: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-jr6b-20260929: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-zt-q5n-d7-d8-refusal-build-20261001: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-zt-q7-k5-build-20261001: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-zt-q8-null-build-20261001: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-zt-q9-fault-recode-20261001: 80 matches in 37 files; 0 paths not on main
- supergrok-wat-zt-q9b-fault006-test-flip-20261001: 80 matches in 37 files; 0 paths not on main
- Galerina-branch-archive-20260823: 49 matches in 21 files; 0 paths not on main
- Galerina-codex-canonical-close-2026-08-08: 51 matches in 22 files; 0 paths not on main
- Galerina-codex-final-close-2026-08-08: 51 matches in 22 files; 0 paths not on main
- Galerina-codex-final2-close-2026-08-08: 51 matches in 22 files; 0 paths not on main
- Galerina-codex-fresh-verify-2026-08-08: 51 matches in 22 files; 0 paths not on main
- Galerina-codex-stable-close-2026-08-08: 51 matches in 22 files; 0 paths not on main
- Galerina-consolidation-verify-a4f42ce: 73 matches in 33 files; 0 paths not on main
- Galerina-detached-scalar-phase1: 73 matches in 33 files; 0 paths not on main
- Galerina-rd0858-broad-assurance-temp2: 75 matches in 34 files; 0 paths not on main
- Galerina-rd0858-crlf-final: 75 matches in 34 files; 0 paths not on main
- Galerina-rd0858-full-estate-temp: 75 matches in 34 files; 0 paths not on main
- Galerina-rd0858-generator-contract-temp: 75 matches in 34 files; 0 paths not on main
