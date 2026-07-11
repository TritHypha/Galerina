# 5-HOUR AUTONOMOUS ROADMAP — session 4 (2026-07-11)

**Mandate:** "make a roadmap to keep yourself busy for the next 5 hours." Full-auto, most-zero-trust option at every fork, commit-only (owner pushes), explicit pathspecs, no absolute paths, `finished = verified` (tests + audits + re-read after every edit). Every block ends GREEN (suite + touched gates) or it is not "done."

**Ground truth at start:** HEAD `bedc5ff4` · branch `refactor/spore-format` · suite 92/92 · 6,929 · 0 fail · kernel `.fungi` twins 2/6 · all audits green (known #20 baseline 165 aside).

**The honesty guardrails that shape this plan:**
- "no `.ts`" (deletion) is **execution-switch-gated** (#143 WASM byte-parity + DSS.wasm, partly HW) — NOT in the auto path; I will not fake-delete a `.ts` the build executes. The achievable-now milestone is **100% of the governed *decision surface* in checker-verified, gated `.fungi`**, `.ts` retained as the executed artifact.
- Owner-gated, therefore **PARKED (not auto)**: D2 rotation build (needs §6 answers), #20 diagnostic-taxonomy burn-down (needs your decision), any push/PR/merge, KB pushes.

---

## Block 1 (≈55 min) — Kernel governed surface → `.fungi` twins: 2/6 → 6/6

The current priority thread. Each file: author the decision-surface twin in `src/self-hosted/`, `galerina check` clean, `audit-kernel-fungi-twins` green, commit.
1. `types.ts` → `types.fungi` (records/enums; the shared shapes).
2. `registry-index.ts` → decision-surface twin (index/lookup/admission logic).
3. `kernel.ts` **decision-half** twin (the gate-ordering + K3 verdict folds; host calls stay in the `fuse-loader` seam).
4. `index.ts` (barrel) — note as re-export-only (no decision surface).
- **Done =** 6/6 governed kernel files have a checker-verified, gated `.fungi` twin; the seam (`fuse-loader.ts`) remains the declared floor. Milestone: *100% of the kernel's governed decision surface is in checker-verified `.fungi`.*

## Block 2 (≈55 min) — Type/Effect-checker twin advance (careful, #20-aware)

Effect-checker is 6/6 (parity complete). Type-checker 6/22.
- Do the **parser-shape extension** vein (Tranche B) — extend `parser.fungi`'s emitted flow-record with ONE new field cluster → `type-checker.fungi` checks it → differential tests. Target the **unambiguous, low-renumber-risk** codes first (mirror the FUNGI-EFFECT-002 pilot method).
- **Explicitly HOLD** any code whose *number* is entangled with the #20 taxonomy; list which, don't guess a renumber.
- **Done =** type-checker twin advances (e.g. 6→8/22) with the full self-hosted corpus green each commit; a short note of exactly which codes remain #20-blocked.

## Block 3 (≈50 min) — #22 live WASM DoS: fuel cap into the WAT loop emitter (RD-0314)

Real security fix (not twin work). Port the `maxIterations` fuel cap into the WAT loop emitter so an unbounded `.fungi` loop cannot emit an unbounded WASM loop (DoS). Fail-closed default. Tests: loop-without-cap → emitter injects the fuel guard; cap respected; exhaustion traps. **Done =** new tests green, suite green, commit.

## Block 4 (≈50 min) — #41 defensive-controls fold (RD-0325/0326)

K3-style decision surfaces + 2 test classes: **verified-trusted-proxy posture** (client IP non-authoritative; trust only mTLS/token), **uniform constant-time error responses** (no oracle in timing/shape), **opaque IDs + bounded pagination** (enumeration + unbounded-scan defense). Each fail-closed, unit-tested. **Done =** tests green, suite green, commit(s).

## Block 5 (≈50 min) — RD-0333 F3 verification + tower-citizen twin seeding

- **VERIFY** `substrate-erasure` / `lease` **release-on-exception** (a thrown handler must release the permit/lease — else leak → deadlock). Add tests proving release-on-throw; fix if it leaks (real correctness bug if so).
- **Generalize** `audit-kernel-fungi-twins` → a package-agnostic twin gate, and seed 1–2 `tower-citizen` decision-surface twins (`quorum`, `lease`) under `src/self-hosted/`. **Done =** F3 tested, gate generalized + green, commit(s).

## Block 6 (≈40 min) — Battery + consolidation + honest close

Full suite (`--emit-counts`) → sync counts (README/AGENTS/version.json) → all `audit-*` → `graph-all` → regen indexes (LAST) → provenance/path-leak green. Update the Stage-6 roadmap + this doc's status ledger + `galerina-work-state` memory. Write the session-close status: what's verified-done vs what's PARKED for you (#20 taxonomy, D2 §6, execution switch #143). **Done =** everything green, counts synced, memory current.

---

## Status ledger (updated as I go)
| Block | State |
|---|---|
| 1 — kernel decision-surface twins | ✅ **DONE** — 4/4 governed decision surfaces (`secret-gate`, `route-defaults`, `registry-index`, `kernel` gate-6 auth) are checker-verified `.fungi` + gated (`902d0eae`, `bedc5ff4`, `517c8fa2`, + this). `types.ts`=declarations-only, `index.ts`=barrel — no decision surface (correctly NOT force-twinned). Milestone: **100% of the kernel's governed decision surface in checker-verified `.fungi`**; `.ts` retained as executed (switch-gated). |
| 2 — type-checker twin advance | ⚠️ **GATED — deferred (verify-don't-trust).** Verified: the current Stage-B ParseResult shape carries only `{name,returnType,params,returnExpr{kind,litType,leftType,rightType}}`, so all 17 remaining codes need a parser-shape extension FIRST, and their numbering is entangled with the #20 taxonomy (your decision). Forcing a deep, corpus-churning parser extract against a registry that may renumber is not sound in a 55-min slot. **Parked with Block-2 note; not forced.** Effect-checker stays 6/6 complete. |
| 3 — #22 fuel cap | ✅ **DONE** (`36e22d9e`) — WAT while-loop emits a per-loop i32 counter that TRAPS past 100k (matches interpreter/bytecode-VM); authoritative suite 92/92 · 6997 green; signed-fixture-drift GREEN (not owner-gated). |
| RD-0340 (owner: read first) | ✅ **read + recorded** — §5 owner-gated (enforcer in a workspace not on disk); §6 verified finding (governed-match fail-closed-default residual) → owner-gated RD-0341. See section below. |
| 4 — #41 defensive controls | ⏳ starting |
| 5 — F3 verify + tc twins | ⏸ |
| 6 — battery + close | ⏸ |

## RD-0340 (owner: "read first") — outcomes

- **§5 field↔cut rung-3 hoist → OWNER-GATED, not landable here.** The enforcer `gate-check.mjs` lives in the separate `ZT-Galerina-GRAPH-ASCII-v2` workspace, which is **not on this disk** (Glob: no match). Changing only the Galerina `docs/examples/gate/*` to describe the field-token grammar would **falsely claim enforcement** the checker can't provide — a false-green, refused. The §5 spec (grammar `[name:cut(<field>…) fu op]`, extended R8 = dominating-cut-set ⊇ PRIVACY field else REJECT, 4 pinned tests, Option-2 warn-first rollout) is ready for whoever holds that workspace.
- **§6 proceeding-`_ =>` in governed matches → VERIFIED (graph, not grep): a real, narrow residual.** `governance-verifier.verifyMatchExhaustiveness` (governance-verifier.ts:3800) returns clean as soon as **any** `_` arm exists ("wildcard covers all cases"); a match *without* `_` is `FUNGI-MATCH-001`. So the checker enforces **exhaustiveness** but **not a fail-closed default arm** — a `_ => <proceed-with-success>` is permitted. For a **closed** sum (Result Ok/Err) the `_` is dead (FUNGI-TYPE-022 territory); for an **open/growable** sum in a governance/effect-scoped flow it is a latent **open-sum fail-open** (a new variant is silently handled as success). RD-0340 §2's "`_ => deny/trap` lower fail-closed" covers only *author-written* deny/trap, not auto-conversion. **Fix is a policy/semantics change with breaking risk** (would also flag benign closed-sum `_ => proceed`) → **owner-gated RD-0341 decision.** Recommended shape: a **non-breaking WARNING** when a governance/effect-scoped match's `_` arm body is neither `deny` nor `trap` and the subject is an open sum (the posture-B warn-first on-ramp), later flippable to an error. NOT changed autonomously.

## PARKED — awaiting you (not touched on auto)
- **D2 rotation build** — needs §6 answers (quorum M, cadence, placement, canary N, retire policy). Design complete at `1ebec1e2`.
- **#20 diagnostic-taxonomy burn-down** — needs your decision; unblocks the full type-checker 22/22.
- **Execution switch (#143 + DSS.wasm)** — the program that finally deletes the `.ts`; partly HW-gated.
- **All pushes / PRs / KB pushes** — you do these.

*If a block's premise proves false on inspection (verify-don't-trust), I stop that block, record why, and move to the next rather than force it.*
