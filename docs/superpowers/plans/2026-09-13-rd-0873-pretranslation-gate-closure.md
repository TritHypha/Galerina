# RD-0873 Pre-Translation Gate Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce fresh, exact-head evidence for the pre-translation gates and admit only a bounded, owner-authorized Fungi wave after immutable toolchain reproduction, independent review, hash/admission and mutation checks, caller-route/shadow-bake proof, and a closed manifest all pass.

**Architecture:** Keep TypeScript as the active shadow. Treat the translation pipeline as a chain of immutable identities: source bytes and symbol span → checked snapshot → canonical GIR → independently derived SLIDE artifact → VOK receipt. A crash-safe journal and a caller-route replay check provide resumability and behavioural evidence. The owner manifest is the only authorizing input; Grok can advise, Astra can independently review, and neither can grant authority.

**Tech Stack:** Node.js ESM scripts, TypeScript compiler package, existing checked-snapshot/GIR v1 and String-match v2 APIs, SLIDE/VOK tooling, JSON receipts, PowerShell on Windows, and the repository's existing focused test runners.

**Spec:** `docs/superpowers/specs/2026-08-28-rd-0873-native-fungi-bootstrap-design.md`

## Global Constraints

- Work against Galerina HEAD `e716fc677d3ca609b016cf76d7f994b67fd36466` and tree `80aa41e53fd9cacd608bf0ba392b1d8f2c005e0a`; if either changes, invalidate every receipt and restart the affected gate.
- Preserve the active worktree's unrelated changes. Do not read, hash, diff, regenerate, stage, restore, or commit the protected `build/graph/Galerina_GRAPH_REPORT.md` path.
- Reproduce the compiler/toolchain in a clean detached copy. Never use a dirty active worktree as immutable evidence.
- Keep profile `scalar-1` as the only authorizable physical profile. Profile 32 remains compatibility-only; profiles 64 and 256 remain refused and require separate owner/native/platform evidence.
- Keep TypeScript shadows and existing Fungi twins. Do not delete, quarantine, retire, switch consumers, issue production authority, or change `authorityReleased`/`productionAuthorizing` as part of this plan.
- Use one symbol per step, one source file per step, concurrency 1, retries 0. Do not run a full corpus check after each file; aggregate once after the package chapter is complete.
- Any missing, stale, empty, conflicting, oversized, or unverifiable identity refuses before authoring. Never repair a failed hash by silently re-pinning it.
- Grok outputs are advisory alternatives and knowledge-gap notes. GPT-6 Astra's receipt is independent review evidence, not owner admission.
- Pushes remain owner-controlled. Commit only the files explicitly listed in the execution record after verification; hold the push for the owner.

---

## 1. Reproduce the immutable toolchain and current authority baseline

**Files to create:**

- `docs/independent-audits/2026-09-13-rd0873-toolchain-reproduction.json`
- `docs/reports/2026-09-13-rd0873-toolchain-reproduction.md`

**Steps:**

- [ ] Create a temporary detached copy at the exact HEAD and verify its tree before any build. If the committed authority ledger differs from the working-tree ledger, freeze the committed bytes as the subject and record `HOLD_TOOLCHAIN_DRIFT`; never use the dirty pin as immutable evidence.
- [ ] Record the pinned Git executable path and digest, Node.js/npm versions, TypeScript version, WABT/WAT tool version, compiler package version, and commit `ca2bc2fb5` that introduced the Option ABI separation.
- [ ] Build `packages-ts/galerina-core-compiler` in the detached copy and derive the `secret-gate` artifact from the clean build.
- [ ] Require the derived artifact digest `sha256:f062217154df66e3a72bc6adc82e47e72392c5a8d56bc8d40442090a8c8c9166` and the current module byte length. A mismatch is `HOLD_TOOLCHAIN_DRIFT`; do not change the ledger pin.
- [ ] Run `node scripts/gather-r4-twin-hashes.mjs --verify-ledger --json` from the detached copy and require `total: 29`, `allClean: true`, and exit code 0.
- [ ] Record the detached-copy path only as a local execution detail; receipts contain repository-relative paths and digests, never secrets or private-key values.

**Acceptance:** The report contains exact HEAD/tree/tool identities, the clean `secret-gate` digest, and a 29/29 verification. Any dirty input, executable mismatch, build failure, or digest difference stops the plan.

## 2. Close the String checked-snapshot and GIR contract used by the first wave

**Files to review or modify:**

- `packages-ts/galerina-core-compiler/src/string-match-checked-module-snapshot-v2.ts`
- `packages-ts/galerina-core-compiler/src/checked-module-snapshot.ts`
- `packages-ts/galerina-core-compiler/src/checked-snapshot-gir-emitter.ts`
- `packages-ts/galerina-core-compiler/tests/string-match-snapshot-gir-v2.test.mjs`
- `packages-ts/galerina-core-compiler/tests/checked-module-snapshot-v1.test.mjs`
- `packages-ts/galerina-core-compiler/tests/checked-snapshot-gir-emitter.test.mjs`

**Steps:**

- [ ] Reuse the versioned `galerina.checked-module-snapshot.v2` String-match route for `isEnvironmentMode`; do not widen the v1 scalar schema in place.
- [ ] Verify that the v2 contract enforces UTF-8, NFC, no NUL, bounded literal bytes, exact arm order, one final wildcard, Bool results, six checker stages, and fixed limits of 3 functions, 8 blocks, 32 instructions, call depth 2, and work 96.
- [ ] If a missing emitter link is found, add the smallest versioned adapter that lowers String literals and the four-arm match to canonical GIR while preserving v1 Int/Bool compatibility. Reject wrong parameter/return types, non-exhaustive matches, duplicate arms, arbitrary calls, malformed Unicode, and oversized input.
- [ ] Keep the TypeScript source bytes as the source identity, but feed only the exact candidate Fungi bytes to the String-match snapshot v2 sealer; bind the two identities separately and refuse a candidate whose source link does not match the named TypeScript symbol. Compare the Fungi result against TypeScript for `development`, `test`, `staging`, `production`, the empty string, a non-NFC string, and a bounded hostile string.
- [ ] Capture source, snapshot, and GIR digests in the later identity envelope; do not publish a candidate from this task alone.

**Acceptance:** The three focused compiler suites pass with no skips; v1 tests remain green; the String-match snapshot and GIR bytes round-trip canonically and refuse all listed malformed cases.

## 3. Implement one exact snapshot→GIR→SLIDE→VOK identity envelope

**Files to create or extend:**

- `packages-ts/galerina-core-compiler/src/translation-identity-envelope.ts`
- `packages-ts/galerina-core-compiler/tests/translation-identity-envelope.test.mjs`
- `scripts/lib/ts-to-fungi-sandbox/identity.mjs`
- `scripts/lib/ts-to-fungi-sandbox/evidence.mjs`
- `docs/independent-audits/2026-09-13-rd0873-identity-envelope.json`

**Steps:**

- [ ] Define a closed, acyclic envelope containing repository/head/tree, source repository-relative path and symbol/span, source digest and canonicalization, candidate path and digest, profile/context, snapshot schema/digest, GIR digest, SLIDE artifact digest, VOK receipt digest, compiler/toolchain closure digests, limits, and terminal outcome. The pre-execution subject envelope is hashed first; a receipt binds that subject digest; a terminal bundle binds both. Do not put a receipt digest back into the subject envelope.
- [ ] Bind every digest to the bytes actually consumed by the next stage. Read each input twice and refuse on an ABA/TOCTOU change, symlink/substitution, path escape, BOM/line-ending drift, or non-NFC text.
- [ ] Require a direct one-to-one source-to-candidate link and a physical SLIDE/VOK receipt that repeats the subject-envelope digest. A separately recorded compiler entrypoint or module hash is insufficient for closure.
- [ ] Use stable JSON field order and a trailing newline; reject unknown fields, duplicate scope entries, empty digests, and missing terminal outcomes.
- [ ] Add substitution fixtures for source, snapshot, GIR, SLIDE, VOK, compiler, and toolchain bytes; each fixture must be refused before any target is written.

**Acceptance:** The envelope test proves exact byte conservation and refusal of each substitution fixture. The persisted receipt is explicitly non-authorizing until the owner manifest gate passes.

## 4. Make translation crash-safe and prove caller-route/shadow-bake behaviour

**Files to review or modify:**

- `scripts/lib/ts-to-fungi-sandbox/journal.mjs`
- `scripts/lib/ts-to-fungi-sandbox/controller.mjs`
- `scripts/lib/ts-to-fungi-sandbox/evidence.mjs`
- `scripts/tests/rd0873-translation-resume.test.mjs`
- `scripts/tests/rd0873-caller-route-shadow-bake.test.mjs`
- `packages-ts/galerina-framework-app-kernel/src/kernel.ts` at the `createSecretGate`/`secretGate.admit` routes around lines 404 and 637

**Steps:**

- [ ] Define checkpoint states `ready`, `checking`, `repair`, `accepted`, and `refused`, keyed by manifest digest, source digest, compiler/toolchain closure, and profile.
- [ ] Make journal ownership exclusive, records append-only and synchronised, and restart reconciliation deterministic. Existing code already refuses an active lock and torn tail; add explicit stale-lock policy, torn-tail recovery or refusal evidence, and publication reconciliation. Never publish an output twice.
- [ ] Add interruption fixtures at every transition, including process termination before receipt publication, after staging, during rename, and during journal append. Restart must either accept the exact prior result or refuse; it must not re-author or duplicate it.
- [ ] Exercise the RD-0361 caller route through `createSecretGate` and `secretGate.admit` while keeping TypeScript active. Run the retained TypeScript shadow and the Fungi twin against the same inputs and compare verdict, authority, and receipt fields.
- [ ] Record caller-route, shadow-bake, restart, and no-consumer-switch outcomes in one receipt. Do not run a full corpus scan for this proof.

**Acceptance:** Resume fixtures pass with no duplicate outputs; the two RD-0361 caller locations execute and agree for the bounded fixture set; a missing or changed shadow refuses.

## 5. Assemble the fresh non-empty exact-head owner manifest

**Files to create:**

- `governance/rd0873-current-head-translation-authority-manifest.json`
- `docs/independent-audits/2026-09-13-rd0873-current-head-translation-manifest.json`

**Manifest scope:** `scopeType: SYMBOLS`, `wholeFileReplacement: false`, profile `scalar-1`, `authorizing: false` until owner signature, concurrency 1, retries 0.

**Admitted symbols and targets:**

1. `packages-ts/galerina-core-config/src/index.ts#isEnvironmentMode` → `packages/fungi/products/galerina/rd0873-core-config/environment-mode.fungi`
2. `packages-ts/galerina-core-runtime/src/structured-await.ts#isTerminalScope` → `packages/fungi/products/galerina/rd0873-core-runtime/terminal-scope.fungi`
3. `packages-ts/galerina-core-tasks/src/load-tasks.ts#isTaskEffect` → `packages/fungi/products/galerina/rd0873-core-tasks/task-effect.fungi`
4. `packages-ts/galerina-data-model/src/index.ts#isResponseSafeClassification` → `packages/fungi/products/galerina/rd0873-data-model/response-safe-classification.fungi`

**Held-out symbols:** `isOmniUncertain` requires a separate state/Option semantic packet; `isBuiltin` and `validateTransition` remain outside this wave pending their unresolved semantic and caller-route evidence. They must not be quietly added because they share a package.

**Per-wave limits:**

- one symbol and one source file per step;
- maximum 4 symbols and 4 source files in this wave;
- maximum 65,536 input bytes and 65,536 output/evidence bytes per step;
- aggregate input cap 100,000 bytes and aggregate output/evidence cap 262,144 bytes;
- timeout 600,000 ms per step;
- no retries, concurrency 1;
- chapter aggregate only after all four package items pass; no per-file full-corpus run.

**Steps:**

- [ ] Compute source and target digests from the exact current HEAD/tree and embed them in the manifest; do not copy the stale 0510aed-era proposal.
- [ ] Embed compiler/toolchain closure identities, snapshot/GIR/SLIDE/VOK envelope references, profile and limits for every item.
- [ ] Validate the manifest with closed fields, non-empty exact scope, duplicate refusal, path containment, and head/tree mismatch refusal.
- [ ] Keep the manifest proposal `authorizing: false` until the owner signs the exact bytes and digest after all evidence receipts are available.

**Acceptance:** The validator accepts this four-item manifest only at the recorded HEAD/tree and refuses an empty scope, stale digest, profile 32/64/256, whole-file replacement, missing limits, or changed target bytes.

## 6. Obtain advisory alternatives and an independent Astra review

**Files to create:**

- `docs/independent-audits/2026-09-13-rd0873-grok-pretranslation-gap-review.json`
- `docs/independent-audits/2026-09-13-rd0873-astra-pretranslation-gate-review.json`

**Steps:**

- [ ] Give Grok a repository-relative prompt artifact that asks for alternatives and searchable knowledge gaps for the four gates, explicitly stating that its result is advisory and cannot authorize translation.
- [ ] Ask GPT-6 Astra to review the exact HEAD/tree, toolchain receipt, String/GIR contract, identity envelope, resume protocol, caller-route proof, manifest scope, profiles, and limits.
- [ ] Require Astra to classify each gate `PASS`, `HOLD_IMPLEMENTABLE`, or `HOLD_EXTERNAL_AUTHORITY` and to cite the receipt digest for every claimed pass. A review of a different head or dirty source is `HOLD`.
- [ ] Record the KB query status and any refused/dirty-source condition. Do not treat a refused KB query as evidence of absence or supersession.

**Acceptance:** Both receipts identify the same HEAD/tree. Grok contributes advisory alternatives; Astra independently confirms only the bounded gates actually evidenced.

## 7. Run fresh hash, admission, mutation, and focused wave checks

**Commands:**

- [ ] `node scripts/gather-r4-twin-hashes.mjs --verify-ledger --json` (require 29/29, exit 0).
- [ ] `node --test packages-ts/galerina-core-compiler/tests/checked-snapshot-gir-emitter.test.mjs packages-ts/galerina-core-compiler/tests/checked-module-snapshot-v1.test.mjs packages-ts/galerina-core-compiler/tests/string-match-snapshot-gir-v2.test.mjs` (require all pass, no skips).
- [ ] `node --test packages-ts/galerina-core-compiler/tests/translation-identity-envelope.test.mjs scripts/tests/rd0873-translation-resume.test.mjs scripts/tests/rd0873-caller-route-shadow-bake.test.mjs` (require all pass, no skips).
- [ ] Run the Option ABI/wildcard focused tests (22/22), the `rd0361-ak-secretgate-present` anchor and mutation checks (1/1 killed), and the focused app-kernel suites covering the two caller routes.
- [ ] Run `node scripts/audit-conversion-slice-close.mjs` with the exact project receipt, manifest path/digest, and pinned Git identity. Require the declared gates `project-corpus`, `differential`, `strict-fungi`, and `physical-slide-vok`; keep exclusions `full-tooling`, `graph-all`, and `normal-phase-close`.
- [ ] Store one machine-readable verification receipt containing command, exit code, test counts, head/tree, and artifact digests. Any failure, skip, dirty input, or stale receipt leaves the wave `HOLD`.

**Acceptance:** All listed focused checks are fresh at the same HEAD/tree and the conversion-slice audit accepts the bounded manifest. No full corpus assurance is run per file.

## 8. Owner admission and controlled translation start

- [ ] Present the exact manifest bytes/digest and all same-head receipts for owner review.
- [ ] Obtain the owner's signature over immutable manifest bytes with `authorizing: false`; write a detached admission receipt that references that digest and records the owner's `authorizing: true` decision. Do not mutate the signed manifest. Broad approval text cannot substitute for this exact non-empty admission.
- [ ] If any source, target, compiler, toolchain, profile, limit, or head/tree value changes, invalidate the signature and all dependent receipts and regenerate them.
- [ ] Translate the four admitted symbols one at a time in the listed order, using the two Fungi build guides, while retaining each TypeScript shadow and the exact per-step limits.
- [ ] After all four package items pass, run one chapter aggregate and update the package receipt. Do not activate profiles 32, 64, or 256 and do not switch runtime consumers.

**Acceptance:** A translation output is considered admitted only when its exact identity envelope, caller/shadow result, mutation result, and owner-signed manifest entry all agree. Otherwise it is a refused candidate with no authority.

## 9. Close documentation and custody without hiding unresolved gates

**Files to update after evidence is complete:**

- `docs/TODO.md`
- `docs/ROADMAP.md`
- `docs/security/POST-SLIDE-EXECUTION-AUTHORITY-LEDGER.md`
- `docs/reports/INDEX.md`
- `docs/INDEX.md`
- `docs/handover/COMPACT-HANDOFF-rd0873-pretranslation-gate-closure-2026-09-13.md`

**Steps:**

- [ ] Record each gate's exact status, receipt path, head/tree, and next action. Preserve `HOLD` for profiles 64/256, production authority, and any unverified platform evidence.
- [ ] Keep `MEMORY.md` as an index; if a durable memory update is explicitly requested, add a small locator note under `C:\Users\phill\.codex\memories\extensions\ad_hoc\notes\` rather than copying the evidence warehouse into memory.
- [ ] Validate JSON, run `git diff --check` on the planned files, and ensure no protected graph path is included.
- [ ] Commit only the planned implementation, receipt, and documentation files after all checks pass. Hold the push for the owner.

**Completion condition:** Conversion is unpaused only after Sections 1–7 pass at one immutable exact head, Section 8 has an owner signature over a non-empty manifest, and Section 9 records the resulting receipts. Until then, the conversion queue remains paused.
