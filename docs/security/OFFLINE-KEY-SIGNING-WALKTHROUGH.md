# Galerina offline registry signing — historical ceremony receipt

**Current state: THE 2026-07-30 ARTIFACT IS COMPLETE — NO OWNER SIGNING ACTION FOR THAT HISTORICAL ARTIFACT.**

This live page contains no runnable signing command. It records the exact
2026-07-30 root, package-manifest and registry-index ceremony only. Later
security hardening changed the package bytes, so its signed outputs are not
the current candidate and must not be treated as live authority.

## Completion chart

| Order | State | Verified evidence |
|---:|:---:|---|
| 1 | 🟩 **COMPLETE** | Root `21415420b447e219` hybrid-signed serial-1 delegation for operational key `f3172a48372bfb23`; signature, window, serial, roles, revocation and both public pins verify. |
| 2 | 🟩 **COMPLETE** | Operational key `f3172a48372bfb23` hybrid-signed `@galerina/auth` version `1.0.0-beta.2`; the returned public manifest is byte-identical in the live tree and verifies against package bytes and the complete authority chain. |
| 3 | 🟩 **COMPLETE** | A public-only rebuild produced exactly one unsigned index entry at `2026-07-30T16:33:10.307Z`; SHA-256 `15D531566E9FB71F152E34BD9C4C62D4D6FAE15DB0309CBCFA0834BE2E020383`. |
| 4 | 🟩 **COMPLETE** | The owner returned the operational hybrid-signed one-entry index. Both signature components independently verify under `f3172a48372bfb23`; its signed payload exactly equals the public-only rebuild. |
| 5 | 🟩 **COMPLETE** | Signed index SHA-256 is `DCF80AA0717DEBF8BEB837584FDC053E24891C0D1224FB4735900E68FC1AAF06`; seven returned-artifact mutations—entry, either signature, either missing signature, context and algorithm—were all refused. |

## Current owner action

None. Return `env.slide-hybrid-f3172a48372bfb23` to offline custody and do not
mount it again for this artifact.

The verified public index is tracked at:

```text
packages-ts/galerina-registry/registry-index-v2.json
```

The historical production registry signing act is green for its exact
2026-07-30 bytes. It does not independently authorize the current Galerina
beta-v1 candidate: the key register requires a new owner-controlled offline
hybrid ceremony after the final unsigned evidence set and package bytes are
fixed. Automatic operational-key rotation integration and the remaining
release gates are tracked separately in `docs/TODO.md` and the live roadmap.

The engineering history and reusable procedure remain in
`OFFLINE-KEY-SIGNING-CEREMONY-REFERENCE.md`. That file is a locked reference,
not current permission to execute another ceremony.
