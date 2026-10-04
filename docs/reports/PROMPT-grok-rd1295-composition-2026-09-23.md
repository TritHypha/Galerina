# Grok — verify Tower RD-1295 composition and load identity — PRIVATE

## 1. Role

Act as a bounded Galerina implementation owner and sceptical reviewer. This is
one hard task, not a programme-clearance or production-admission audit.

## 2. Intended use

Decide whether the *claimed* Tower composition identity gap is real. Repair one
source-backed defect only if a hostile/positive test pair first demonstrates
it. An equally valid result is `NO_DEFECT` with the source reason. Do not
claim RD-1295 closed on the strength of this slice.

## 3. Exact scope and preflight

Access mode: read KB contracts; modify only the in-scope Galerina files and
tests after confirming a defect. Do not read unrelated repositories.
Work in `Galerina/.worktrees/rd-0873-native-fungi-bootstrap-implementation`.
Read the private RD-1295 KB research note (tower-citizen modular product line)
sections 6.10 and 9 as a contract, not proof of live behaviour. Before edits,
record `git rev-parse HEAD`, branch, and relevant status. At handoff, the
Galerina HEAD was `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` on a dirty
`main`, one local roadmap-doc commit ahead of `origin/main`; stop and
reconcile if the live state differs. Preserve all unrelated dirty files.

## 4. Constraints and authority

Binding constraints:
Out of scope: any consumer not needed to settle Q1 or Q2, and all compiler
RD-1296 work.
No commit, merge, push, signing, `.fungi` authoring/build, conversion queue,
overlay, corpus run, KB pin bump, or constitution adoption in this task. Do
not invent product profiles or widen existing allow-lists. Keep K3
Allow/Deny/Unknown, fail-closed refusal, and No-Coercion intact. A focused
test pass is not independent audit or production admission.

## 5. Already established facts, with limits

At the handoff HEAD, Tower TypeScript checking passed and the focused
`load-graph-bounds`, `rd-1295-governance-isolation`, and `rd-1295-products`
tests passed 86/86. `src/product-profiles.ts` holds frozen composition IDs and
cluster tables, so a mutable-composition claim is **not established**.
`src/load-graph.ts` owns `walkLoadGraph`, `compositionAllowedFiles`,
`compositionExternals`, and `enforceClosedSet`. The scan inventory's 0 OPEN /
120 PARTIAL / 4 PATCHED split is historical at `91b4dec0…`, not an audit of
the handoff HEAD.

## 6. Two independent challenge vectors

Q1. **Composition input/decision identity:** Trace an admitted composition ID
from caller input through `compositionClusters` to the consumed load set.
Check whether coercion, accessors, proxies, or mutable referenced entries can
alter the decision *after* validation. Distinguish a real runtime path from a
synthetic object the typed API cannot receive. Pin exact file:line and show a
contained positive plus hostile control. If the frozen string API already
prevents this, report `NO_DEFECT`; do not add a ceremonial snapshot.

Q2. **Checked versus loaded module identity:** Trace the real sequence from
`walkLoadGraph` and `enforceClosedSet` to a production consumer's actual
module load. Test whether a leaf, parent, or linked path can change between
graph check and consumption; distinguish symlink refusal from byte/inode
binding. Use a deterministic pause/swap test only where the platform permits.
Show a positive contained path and the hostile outcome, or label the claim
`NOT VERIFIABLE` and name the missing observation. Do not equate a source
graph with execution-byte attestation.

## 7. Required source checks

Start with `packages-ts/galerina-tower-citizen/src/product-profiles.ts`,
`src/load-graph.ts`, and the three focused tests named above. Inspect only
the actual consumer needed to settle vector B. Reopen Tower `TODO.md`,
`docs/TODO.md`, and `docs > reports > outstanding-and-blockers-2026-09-23.md`
before altering a status. The old
`docs > reports > PROMPT-grok-e01-rd1296-2026-09-23.md` is **SUPERSEDED**.

## 8. Implementation and verification rule

If a defect is confirmed, add a hostile test that fails on current behaviour,
make the smallest fail-closed repair, then rerun that test, the contained
positive, Tower typecheck, and the focused product-line suite. Record exact
commands, counts, source locators, and residuals. Do not claim an unchanged
inventory ID newly PATCHED. Update only the Tower TODO and current outstanding
report when source evidence warrants it; preserve historical HOLD boxes.

## 9. Output and next boundary

Deliverable budget: reply in at most 800 words, marking each material claim `CONFIRMED`,
`PLAUSIBLE`, `NO_DEFECT`, or `NOT VERIFIABLE`. Give the two-vector result,
changed paths, fresh test receipt, remaining risks, and the next single task.
Compiler secret-arena/return ABI and nested contextual record questions are
**RD-1296**, not this Tower RD-1295 task; do not combine them. Independent
review remains HOLD until a separate reviewer examines a committed candidate.

## 10. Self-reject check

Reject your own result and correct it before replying if you conflate RD-1295
with RD-1296, infer a defect from names alone, skip either challenge vector,
modify production code without a red hostile test, claim production admission
from focused checks, or treat the historical inventory as fresh clearance.
