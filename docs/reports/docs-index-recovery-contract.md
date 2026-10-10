# Docs-index publication recovery

The wrapper `scripts/docs-index-manifest.mjs` operates only in an affirmed,
owner-controlled quiescent window. It binds rendered outputs, not every source
document byte. It provides neither multi-file atomicity nor hostile-host or
power-loss protection. Direct generator application is a separate legacy route.

## Journal failure after publication

A rename can succeed before the next journal write fails. The returned failure
receipt records that completed rename. If the catch retry also fails, it includes
`journalError`; the last usable disk record can still have that target in
`pending`, with an older `completed` and `remaining` list. This is unresolved
intent, not evidence that the target was never published.

Before any further application:

1. Preserve the exact plan, all journal files, remaining stages and backups.
   A failed write can leave an incomplete journal file. Do not assume the
   highest-numbered filename is a complete usable record.
2. Validate a usable record and bind its `planSha256` to the preserved plan.
   Do not treat `remaining` as an approved resume list.
3. In the quiescent window, compare the pending target's byte length and hash
   with the plan's output and preimage. Inspect its recorded stage and backup.
   Exact planned output, a consumed stage and a different or absent preimage
   reconcile the exercised post-rename failure case. When output and preimage
   coincide, bytes alone cannot prove which historical operation occurred.
4. Keep conflicting, unreadable or otherwise ambiguous evidence unresolved.
   Do not overwrite it to manufacture a successful receipt.
5. There is no built-in resume command. Reconcile first; any later restore must
   be explicitly reviewed, or generate and review a fresh plan against the
   reconciled current state. Blindly reapplying a stale plan is not recovery.

The regression in `scripts/tests/docs-index-manifest.test.mjs` injects transient
and persistent journal-open failures after a real rename. It checks output bytes,
the untouched next target, returned progress, persisted pending intent and stale
plan refusal. These controls do not establish write/fsync/close-failure or crash
durability guarantees.
