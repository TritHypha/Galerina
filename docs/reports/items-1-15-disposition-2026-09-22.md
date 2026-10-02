# Remaining-work items 1–15 — disposition

**As of:** 2026-09-23. Live HEAD `ed4a1359898767699387008ad2488b71a107b32c`
(parent `91b4dec08fe4376febc9494a8023bd02912b8695`). Dirty.
**Overall:** INCOMPLETE_NON_AUTHORITATIVE. This table does **not** close
excluded owner stops by reclassification. Items 1–15 are **not** production-complete.
Current outstanding list: [outstanding-and-blockers-2026-09-23.md](outstanding-and-blockers-2026-09-23.md).
Doc alignment: [documentation-reconciliation-2026-09-23.md](documentation-reconciliation-2026-09-23.md).

The easy-wins handoff reopened 1–15 for engineering **and** said: do not start
all fifteen workstreams; do not commit; do not adopt the constitution; do not
fabricate a durable store, Decimal, OAuth, hardware receipts, or `.fungi`.

| # | Item | Status | Why it is not “done” as production closure |
|---|---|---|---|
| 1 | Explicit-path commit | **BLOCKED** | Handoff forbids commit/merge/push. Dirty tree is retained on purpose. |
| 2 | Independent production admission | **HOLD** | Scoped PASSes exist (closed recursive flatten `01a0cb1b`). None is clean-HEAD production admission. |
| 3 | KB pin check | **CONFIRMED mismatch** | `ZTF-Knowledge-Bases/.github/workflows/kb-guards.yml` pins Galerina `dc05e30a728484877623c957b522dc6dc8b550a2`. This worktree is `ed4a1359…` (parent `91b4dec0…`). Pin advancement is an owner action. |
| 4 | Durable replay backend (RD-1286) | **EXCLUDED** | Empty admit-list is implemented. No fake backend. |
| 5 | JSON fractions as Decimal (RD-1289) | **EXCLUDED** | v1 integer-only encoder preserved. |
| 6 | OAuth / OpenAPI CLI | **EXCLUDED** | App Kernel remains bearer/public. |
| 7 | 124-finding scan | **INVENTORIED, not closed** | 124/124 IDs bound to findings.json sha256 `07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2` (scan rev `0f24ca30…`). Dispositions: 4 PATCHED_AUDIT_PENDING, 120 PARTIAL_THIS_TREE, **0 OPEN_ON_SCAN_SNAPSHOT**. See [scan-0f6063dd-disposition-2026-09-22.md](scan-0f6063dd-disposition-2026-09-22.md). |
| 8 | Constitution adoption | **EXCLUDED** | DISCUSSION_DRAFT / NOT_ADOPTED. |
| 9 | Windows-native FIFO | **NOT VERIFIABLE** | Live FIFO is WSL/Linux. Windows Node omits `O_NONBLOCK` (Q3 native-Windows test). |
| 10 | `.fungi` conversion / queue / corpus | **EXCLUDED** | Global `.fungi` stop. |
| 11 | Photonic post-v1 / hardware | **DEFERRED** | Simulation is not hardware. |
| 12 | PROJECT READY / graph provenance | **OPEN** | Semantic-assurance remains dirty. Generator success is not READY. |
| 13 | Historical TODO checkboxes (~242+) | **HOLD** | Mass `[x]` would fake completion. |
| 14 | Physical durability receipts | **EXCLUDED** | No manufactured hardware/power-loss evidence. |
| 15 | Example-app signing | **EXCLUDED** | No keys or signing ceremony in this batch. |

## Engineering that did proceed (not a substitute for 1–15)

Secret-memory ownership (Q1 nested wipe, guest-owned wipe, production copy,
flatten, closed recursive layout `[0,1,7]`) is implemented on this dirty tree.
Q1 **27/27**. Independent scoped PASS
`docs/independent-audits/2026-09-22-closed-recursive-flatten-hold.md`
(`01a0cb1b-b407-73b2-a16e-de6b3f417ff9`). Residual: trees deeper than one
recursive expansion still drop grandchild secrets.

Item 7 inventory is complete; **0** findings remain OPEN_ON_SCAN_SNAPSHOT. PARTIAL residuals and E01/RD-1296 remain.

## What an owner must pick to move 1–15

Commit authority (1), pin advancement (3), reopen RD-1286/1289/OAuth (4–6),
E01/RD-1296 after item-7 OPEN exhaustion (7), constitution versioning (8),
`.fungi` stop lift (10), or signing keys (15).
