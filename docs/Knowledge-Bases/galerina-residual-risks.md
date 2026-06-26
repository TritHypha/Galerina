# Galerina — Non-P9 Residual Risks (verified catalogue)

**Source:** senior-dev app+security review (2026-06-06), every claim independently
re-verified against the repo via an 18-agent verification fan-out — **16/16 confirmed,
0 refuted**. This catalogue is the honest register of known gaps that are NOT on the P9
critical path. Per the discipline: *aware-and-tracked beats claiming-perfect.*

Severity = the reviewer's + verifier's assessment. Status = what this session did.

## Critical (handled this session)
| ID | Finding | Status |
|---|---|---|
| signing-key | `.env.galerina-signing` (private key `8eecf4187ebc9341`) was tracked in git (commit `cb5036d`). | ✅ untracked + git-ignored + **rotated** → `ab46f4c7e2797b9b`. ⚠️ **history still contains it** → scrub = **#149** (destructive, user-driven). Old key COMPROMISED. |
| plugin-pending-hash | `groq-inference-v1` manifest had `sourceHash: "sha256:pending-galerina-promote"` while requesting `ai.inference`+`network.outbound`+`audit.write`. | ✅ `border-check` now **DENIES** it (fail-closed). Plugin needs real promotion (compute+sign hash) before admission. |
| deploy-execsync | `galerina deploy` interpolated the user `llnFile` into `execSync` shell strings (injection). | ✅ argv `spawnSync(shell:false)` + path validation. |

## High
| ID | Finding | Evidence | Status / decision |
|---|---|---|---|
| border-check-superficial | border-check only checked file presence; no hash/capability/limit validation. | `galerina.mjs` (old 405-433) | ✅ FIXED — rewritten fail-closed (hash fmt, blacklist, capability allow-list, resource ranges, tier, schema parse). |
| readme-stageb | README states Stage B "100% complete" (L109-111), "0%" WASM execution (L95), and 87% (L68/94) — three contradictory numbers. | `README.md` | 🔲 **#152** — reconcile into per-deliverable metrics (compilation vs governance vs WASM execution). |
| effects-silent-skip | `effectsToFlags` silently drops unknown effect names (a typo'd effect → silently no flag). | `type-registry.ts:193-200` | 🔲 **#153** — decide fail-closed vs diagnostic; a security boundary should not silently drop. |
| unknown-origin-clean | Unknown `source_from` origins are treated as CLEAN (not unknown/unsafe). | `value-state-checker.ts:570-579` | 🔲 **#153** — for a security language, unknown origin should be taint-by-default OR a closed validated enum. |
| tritobool-footgun | Legacy numeric `triToBool` still supports `unknown_as_true` (README says "must never"). | `core-logic/src/index.ts:99-119` | 🔲 **#153** — deprecate/remove `unknown_as_true`; fail-closed only. |
| core-tsc-missing | `galerina-core` can't `npm run typecheck` — no local tsc; no root npm workspaces. | `galerina-core/package.json` | 🔲 **#155** — add npm workspaces OR document per-package install. |
| app-kernel-todo | app-kernel has metadata+smoke fixtures but typed API boundary/auth/idempotency are open TODOs. | `galerina-framework-app-kernel/TODO.md:8-12` | 🔲 **#154** — present as template, not production. |

## Medium
| ID | Finding | Status / decision |
|---|---|---|
| version-stale | `version.json` said 3,383 tests / 33 pkgs vs real 4,129 / 44. | ✅ FIXED (version.json rewritten + honest framing). |
| sotcore-stale | SOT `test:core` count off (3,383 vs ~3,403). | 🔲 **#150** (auto-generate counts from runner). |
| default-app-placeholder | `galerina.workspace.json` default = empty `galerina-framework-example-app`. | 🔲 **#154** — repoint default + mark as template (needs user nod). |
| api-server-todo | `galerina-framework-api-server` is README+TODO only (no src/pkg/tests). | 🔲 **#154** — explicit template label. |
| empty-packages | Many workspace packages (data/db/web/registry/targets) have no src/tests. | 🔲 **#154** — prune or mark template. |
| register-vm-stub | `register-vm.ts emitBytecode()` is an UNREACHABLE-only stub. | ℹ️ BY DESIGN (Phase 24 pending); documented, no action. |

## Low
| ID | Finding | Status |
|---|---|---|
| stub-provider-devhash | Tower stub bridges use `"0".repeat(64)` packageHash + `certificationProfile:"dev"`. | ℹ️ BY DESIGN (dev/test stubs); a release must pin real hashes. Documented. |

## Presentation framing (advisor)
Lead with the **truth**: *"The compiler and admission gates are production-hardened (4,129 tests, 0 audit findings); the framework/app packages are structural templates; we are focused on the compiler bootstrap (P9) and have deliberately deferred the app-layer."* **Do NOT claim:** full app/API-server/app-kernel implementation, complete real DSS.wasm, certified `groq-inference-v1` admission, or clean git history (until #149).
