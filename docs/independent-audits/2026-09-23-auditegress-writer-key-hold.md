# Independent audit — AuditEgress omitted writer key HOLD

**Verdict: PASS** (scoped to the named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty).
Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree. It is **not** clean-HEAD evidence.
Production sources and tests were not edited by this reviewer. Nothing was
committed, merged, pushed, or signed. `.fungi` was not touched. Passing
tests here are **not** production admission. Finding
`csf_0f748088754ddb920ceb641f` stays **PARTIAL_THIS_TREE**. Do **not**
promote **PATCHED**.

Reviewer: Grok independent auditor `01a0d003-1eab` (did not author these
changes). Not Astra.

Named claim:

- Constructor throws `EGR-KEY-002` when `hmacKey` is omitted (`=== undefined`).
- Explicit all-zero `new Uint8Array(32)` remains the named development key
  unless `strictKey` (then `EGR-KEY-001`).
- `verifyChain` omitted `hmacKey` still returns `false`.
- Options type/comment no longer promise an implicit `ZERO_KEY` default;
  `hmacKey` is required on `AuditEgressOptions`.
- Finding stays **PARTIAL_THIS_TREE**.

Platform: win32 Node v24.18.0, npm 12.0.2.

## Dirty slice vs HEAD `e8f1b682`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-core-sentinel-egress/src/audit-egress.ts` | **M**. HEAD constructor `this.#hmacKey = opts.hmacKey ?? ZERO_KEY`. THIS TURN: `hmacKey: Uint8Array` required; omitted → `EGR-KEY-002`; assignment `this.#hmacKey = opts.hmacKey`. `verifyChain` omitted gate kept. |
| `packages-ts/galerina-core-sentinel-egress/tests/hmac-chain.test.mjs` | **M**. Hostile omitted ctor; named zeros admit / `strictKey` refuse; positive nonzero; omitted `verifyChain` still `false`. |
| `packages-ts/galerina-core-sentinel-egress/tests/never-drop.test.mjs` | **M**. Supplies `new Uint8Array(32)`. |
| `packages-ts/galerina-core-sentinel-egress/tests/audit-egress.test.mjs` | **M**. Happy-path ctors pass `DEV_KEY`. CFG-001 cases still omit key (CFG-001 fires first). |
| `packages-ts/galerina-tower-citizen/tests/certified-profile.test.mjs` | **M**. Omitted → `EGR-KEY-002`; `strictKey` zeros → `EGR-KEY-001`. |
| `packages-ts/galerina-devtools-pci/src/compliance-ledger.ts` | **M** comment only. `readEgressBatches(..., hmacKey = ZERO_KEY)` unchanged (residual). |
| `packages-ts/galerina-core-sentinel-egress/dist/audit-egress.js` | gitignored; rebuilt (`tsc` exit 0). Matches src. |

## Source hashes

Independent `crypto.createHash('sha256')`. Author hashes MATCH.

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-core-sentinel-egress/src/audit-egress.ts` | 14318 | `1eb47b944548cd907af5379bb78f7f1a0cca93540a8040afff6fa1d4955a741a` |
| `packages-ts/galerina-core-sentinel-egress/dist/audit-egress.js` | 11952 | `6dbc3fd09e165b3b1acd1733503d54142e0f4e156f2f781081c8a926e8fd323c` |
| `packages-ts/galerina-core-sentinel-egress/tests/hmac-chain.test.mjs` | 5933 | `225e93c45d3e0a5f1a876fe0daa71ea7eef65dd2cc231e41e842a4ad8d7a70e3` |

## Requirement-to-evidence

| requirement | evidence | label |
|---|---|---|
| Omitted writer key throws `EGR-KEY-002` | src 139–144 / dist 74–76. Independent `HOSTILE_OMITTED_CTOR`. | **CONFIRMED** |
| Explicit zeros named dev key unless `strictKey` | src 10–16, 145–150. Independent `EXPLICIT_ZERO_CTOR` admits; `strictKey` → `EGR-KEY-001`. | **CONFIRMED** |
| `verifyChain` omitted still `false` | src 275–278 / dist 187–190. | **CONFIRMED** |
| Type/comment no implicit ZERO_KEY | `hmacKey: Uint8Array` src 52–59. | **CONFIRMED** |
| CFG-001 first is allowed | src 133–138 before key check. | **CONFIRMED** |
| PCI reader still defaults ZERO_KEY | `compliance-ledger.ts:100`. Residual. | **CONFIRMED** residual |
| Named suite | **32/32** pass, 0 fail, 0 skipped. | **CONFIRMED** |
| certified-profile omitted/strictKey | **2/2**. | **CONFIRMED** |

## RED / GREEN actually run

Rebuild `tsc -p tsconfig.json` in the egress package → exit 0.

`node --test tests/hmac-chain.test.mjs tests/never-drop.test.mjs tests/audit-egress.test.mjs tests/epoch-rotation.test.mjs` → **32/32**.

Independent probe of gitignored dist:

- RED: omitted ctor `EGR-KEY-002`; `hmacKey: undefined` same; omitted `verifyChain` `false`; `strictKey` + zeros `EGR-KEY-001`; `batchSize: 0` omitted key still `EGR-CFG-001`.
- GREEN: `fill(7)` seals and verifies; explicit zeros seal and verify with zeros only.

Empty `Uint8Array(0)` admits without `strictKey` and is HMAC-equivalent to 32 zero bytes (HMAC-SHA256 zero-pads a short key). Residual.

## Remaining risk

Keep **PARTIAL_THIS_TREE**. Do **not** promote **PATCHED**.

- PCI `readEgressBatches` still defaults `ZERO_KEY`.
- Length-0 `Uint8Array` is not `EGR-KEY-002` and is HMAC-equivalent to the named 32-zero key without `strictKey`.
- Fungi twin `configVerdict` does not mention `EGR-KEY-002` (`.fungi` not touched).
- Dirty `main`. Not production admission. `full-sentinel-flight` `LSS-KEY-001` is out of this claim.

Author hashes: **MATCH**.
