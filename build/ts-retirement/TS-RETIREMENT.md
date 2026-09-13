# Executable-family retirement graph (1623 tracked package paths; 546 .ts-family)

Regenerate: `node scripts/ts-retirement-graph.mjs` (graph-all 7/7). The % audit reads these numbers LIVE.

| Retirement path | Count | Deletes via |
|---|--:|---|
| Twinned (.fungi beside it) | 30 | → #143 R4 authority ledger (checked .fungi authority or retained .ts differential oracle) |
| Compiler core | 130 | → bootstrap fixpoint (the .fungi stages are compiled BY this .ts — retires last, post-v1) |
| Bounded-TCB floor | 17 | → post-beta admitted SLIDE replacement (bounded bootstrap TCB until equivalent crypto/host/algorithm evidence exists) |
| Migration program | 336 | → the #38 migration codemod program (owner-gated re-sign ceremony) |

Authority ledgers: 7 compiler + 29 governed = 36 authoritative twins.

Complete executable family: 530 .ts source · 16 .d.ts · 0 .mts · 0 .cts · 1065 .mjs · 12 .js · 0 .cjs.

Terminal physical retirement: OPEN — 1623 tracked package executable-family paths remain.

Post-SLIDE authority: OPEN — 0 non-authorizing candidate(s); 0/2544 production Fungi sources cryptographically admitted; 0/57 host boundaries owned; 95 node_modules trees.

`.fungi` in src trees: 2544 across 96 packages · staged-index drift: 0

## Twinned .ts (the #143 flip queue)
- packages-ts/galerina-core-compiler/src/effect-checker.ts
- packages-ts/galerina-core-compiler/src/gir-emitter.ts
- packages-ts/galerina-core-compiler/src/governance-verifier.ts
- packages-ts/galerina-core-compiler/src/lexer.ts
- packages-ts/galerina-core-compiler/src/parser.ts
- packages-ts/galerina-core-compiler/src/runtime.ts
- packages-ts/galerina-core-compiler/src/type-checker.ts
- packages-ts/galerina-core-compiler/src/verified-loop-envelope.ts
- packages-ts/galerina-core-logic/src/tri/tri-ops.ts
- packages-ts/galerina-core-network/src/admission-feedback.ts
- packages-ts/galerina-core-network/src/cert-gate.ts
- packages-ts/galerina-core-network/src/cors-policy.ts
- packages-ts/galerina-core-network/src/defensive-controls.ts
- packages-ts/galerina-core-network/src/egress-guard.ts
- packages-ts/galerina-core-network/src/inbound-guard.ts
- packages-ts/galerina-core-security/src/index.ts
- packages-ts/galerina-core-sentinel-egress/src/audit-egress.ts
- packages-ts/galerina-core-sentinel-memory/src/memory-validator.ts
- packages-ts/galerina-core-sentinel-power/src/power-governor.ts
- packages-ts/galerina-core-sentinel-state/src/cold-boot.ts
- packages-ts/galerina-core-sentinel-time/src/synchronization-gate.ts
- packages-ts/galerina-framework-app-kernel/src/kernel.ts
- packages-ts/galerina-framework-app-kernel/src/registry-durability-admission.ts
- packages-ts/galerina-framework-app-kernel/src/registry-durability-artifact.ts
- packages-ts/galerina-framework-app-kernel/src/registry-durability-evidence.ts
- packages-ts/galerina-framework-app-kernel/src/registry-durability-production-admission.ts
- packages-ts/galerina-framework-app-kernel/src/registry-index.ts
- packages-ts/galerina-framework-app-kernel/src/route-defaults.ts
- packages-ts/galerina-framework-app-kernel/src/secret-gate.ts
- packages-ts/galerina-tower-citizen/src/transport-fsm.ts
