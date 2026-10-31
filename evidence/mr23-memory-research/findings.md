# MR23 findings: custodian child death seen from the parent (gap 2.2 / H7, .fungi side)

Date: 2026-10-31. Branch grok/mem-r23-fungi-child-death-20261031. Synthetic integers only.

## What was missing
Gap map row 2.2 and H7 were PARTIAL: the VOK custodian side (MEM-R19) exits and refuses on bad frames, but nothing pinned what the parent does when the custodian child dies, and no test showed that a later, otherwise valid lease is refused.

## What was added (packages/fungi/memory/src/secret-arena.fungi)
- arenaChildLiveness: 100 running, 106 dead with a request in flight (the reply never came, K3 UNKNOWN), 153 CUSTODIAN_GONE dead while idle. A clean exit 0 is still 153, never 141 Disposed. Malformed readings are 110, unlisted classes 111, a running child with a non-zero detail is 106.
- arenaChildStepCode: only 100 and 153 pass; every other value is stepped as 106. The first draft passed the raw value through, and the MR20 canary sweep caught it echoing caller bits (synt and negSynt traces), so it now fails closed instead.
- arenaChildDeathStep: the reading paired through arenaStep. 153 is unlisted in arenaStateAfter, so an idle death quarantines (1531 from Active); an in-flight death is 1061; Disposed stays Disposed; quarantine is never undone.
- arenaLeaseAfterChildEvent: a later lease opens only against the state after the child reading, so after any death an Active, zero-live lease is refused 106 before any read. Running child leaves arenaLeaseOpen unchanged (100, 151, 106). A receipt for 106 or 153 is K3 UNKNOWN (-128), never ALLOW and never 0.

## Tests (packages/fungi/memory/tests/mr23-child-death, 26 tests)
Liveness table, step table, later-lease refusal with a differential against arenaLeaseOpen, K3 receipt outcome, and 7 mutants (in-flight arm dropped, idle death admitted, contradicting running reading admitted, lease against the stale state, signal 0 admitted, 153 listed as benign, unreadable reading passed through): all killed.
MR20 closed result set gained 110, 153 and 1531.

## Still open
Row 1.5 crash-and-scan needs a real process kill and memory scan on Phillip's side (VOK). This row models the parent's decision; it does not spawn a process.