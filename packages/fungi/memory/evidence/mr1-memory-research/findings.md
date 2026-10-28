# MEM-R1 memory research slice: SecretArena provider fault grid

Date: 2026-10-28. Branch: `grok/mem-r1-memory-research-20261028` from main `10b96b2a6`.
Run: work driver `gcw-wd-34b0af75`. Data: synthetic only (canary `MR1-CANARY-7f3a9c-SYNTHETIC`).

## Scope

Test-only pins over the frozen TypeScript reference SecretArena provider
(`packages-ts/galerina-framework-app-kernel/dist/secret-arena-provider.js`), driven
against a synthetic custodian (`tests/mr1-memory-research/mr1-fake-custodian.mjs`) that
speaks the provider wire protocol and misbehaves on purpose. No source change. The
.fungi arena state machine (`secret-arena.fungi`) and its slot/generation checks
(MB-12 `arenaSlotCheck`, `arenaReadBeforeInit`) are already pinned by `37-u3-secret-arena`
and `s7-product-custody`, so this slice covers the host-side gaps the gap map left open.

The clock-window item (gap map item 9) is deliberately left out: it is K3-adjacent
and held by the SuperGrok K3 rows (`k3-wire.fungi` trusted-clock window).

## Gap map coverage

| Gap | Pin | Result |
| --- | --- | --- |
| 3.5 / H11 RPC frame | truncated body, zero-length header, header above MAX_FRAME | refuse, callback never runs, provider quarantined |
| 3.5 follow-up | has/put after a frame fault | `SecretArenaQuarantined` |
| 3.4 child kill | SIGKILL custodian mid-get | refuse, quarantined, no bytes delivered |
| 3.4 custodian quarantine | status QUARANTINED on get | `SecretArenaQuarantined`, epoch fenced strictly past last |
| 3.4 unlisted status | status byte 9 | refuse, custodian payload not echoed |
| 1.1 / 2.5 borrowed view | view kept past callback | all-zero after return |
| 1.1 escape channels | callback returns value or promise | refused, view still wiped |
| 1.2 stale epoch | custodian epoch 5 then 3 | throws stale, quarantined |
| 1.2 malformed epoch | 7-byte epoch frame | refuse, never truncated or padded |
| 2.5 disposed | use/put/has/revocationEpoch after dispose | all refuse, status quarantined |
| 1.3 canary | every fault mode | no 4-byte canary window in error, message or status |

## Mutants (all red on mutant, green on landed)

1. `no-kill-on-frame-fault`: drop `killCustodian()` in the rpc catch.
2. `no-max-frame-cap`: drop the `respLen > MAX_FRAME` guard.
3. `accept-zero-frame`: drop the `respLen > 0` guard.
4. `accept-stale-epoch`: drop the `epoch < lastEpoch` refusal.
5. `skip-view-wipe`: drop the borrowed-view wipe in `allocateNonDetachableSecret`.

Mutants edit a temp copy of the compiled dist and are imported from the temp dir;
the tree is never modified.

## Observations (no change made)

- A malformed (7-byte) epoch frame refuses but does not quarantine, while a stale
  epoch does. Both fail closed; whether a malformed epoch should also quarantine is a
  design question for the .fungi port (`arenaEpoch`), not a TS change (TS is frozen).
- An unlisted status byte on get refuses without quarantine. Same note.

## Block test

`node --test packages/fungi/memory/tests/mr1-memory-research/*.test.mjs` on WSL node
v24.20.0: 26 tests, 26 pass, 0 fail. Linux-only; skips elsewhere because the provider
refuses non-Linux by design.