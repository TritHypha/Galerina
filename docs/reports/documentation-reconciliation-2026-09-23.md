# Documentation reconciliation — 2026-09-23

**Overall:** INCOMPLETE_NON_AUTHORITATIVE. Live HEAD
`ed4a1359898767699387008ad2488b71a107b32c` (parent `91b4dec0…`). This
refresh did not commit. ROADMAP SVG not regenerated. Historical root TODO
checkboxes (~242+) remain HOLD.

## Live inventory

Scan `0f6063dd` [inventory JSON](scan-0f6063dd-inventory-2026-09-22.json)
recounts **124/124 IDs**:

| Disposition | Count |
|---|---|
| PATCHED_AUDIT_PENDING | 4 |
| PARTIAL_THIS_TREE | 120 |
| OPEN_ON_SCAN_SNAPSHOT | 0 (0 high / 0 medium / 0 low) |

The [disposition table](scan-0f6063dd-disposition-2026-09-22.md) matches
those 124 IDs and dispositions (0 table mismatches on this pass).

## Documents aligned to those counts

- [ROADMAP.md](../ROADMAP.md) security continuation
- [TODO.md](../TODO.md) resolution continuation (every PARTIAL_THIS_TREE
  id is now cited there)
- [outstanding-and-blockers-2026-09-23.md](outstanding-and-blockers-2026-09-23.md)
- [PRE-FUNGI-WORK-REGISTER-2026-09-22.md](../PRE-FUNGI-WORK-REGISTER-2026-09-22.md)
- [items-1-15-disposition-2026-09-22.md](items-1-15-disposition-2026-09-22.md)

Dated packets [coding-batch-ready-2026-09-22.md](coding-batch-ready-2026-09-22.md)
and [easy-wins-then-hard-2026-09-22.md](easy-wins-then-hard-2026-09-22.md)
keep their batch-time 114 OPEN figures and now point here for the live
count. Independent-audit receipts keep the counts they recounted at
review time.

## TODO scope

Resolution-continuation `[x]` rows cover the implementable scan slices.
Item 13 (historical checkboxes) is not mass-checked. Items 1–15 stay
incomplete. OPEN scan lows are exhausted. RD-1308 exact-args identity
landed on this dirty tree; `csf_456107f3e63d6f916462d1bf` remains
PARTIAL_THIS_TREE and was not promoted to PATCHED. Next named hard stream
is E01/RD-1296 ([prompt](PROMPT-grok-e01-rd1296-2026-09-23.md)); it was not
started under the item-7 live-scan prompt.
