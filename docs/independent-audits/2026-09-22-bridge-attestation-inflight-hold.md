# PASS — Incomplete bridge verification is not cached as successful admission

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, signed,
or written to `.fungi`. This receipt is not the author’s packet and is
not GPT-6 Astra.

Named claim: incomplete bridge verification is not cached as successful
admission. Scan revision `0f24ca30` (`0f24ca30ef3f173c43a60c914c18b161327f2227`)
`checkBridgeAttestation` set `bridgeAttestationChecked = true` **before**
`await verifyAttestationHybrid`, while `bridgeAttestationDenial` was still
`null` (success). Current dirty tree: `checkBridgeAttestation` returns the
cached denial only after `#runBridgeAttestation` completes; concurrent
callers await `#bridgeAttestationInFlight` instead of observing a null
denial. Concurrent `infer` with a signed stub-ternary registry both
complete without trap.

This is **one scan ID** (`csf_04b1ca56fd9143e13de6b0d2`,
`PARTIAL_THIS_TREE`). It is **not** 124-scan closure and **not**
production admission. Inventory after this slice remains **90 OPEN /
30 PARTIAL / 4 PATCHED_AUDIT_PENDING**. Overall disposition stays
**INCOMPLETE_NON_AUTHORITATIVE**.

Node v24.18.0, npm 12.0.2, Windows win32 x64. Tests import
`../dist/index.js`. `dist/hybrid-engine.js` mtime
(`2026-09-23T02:28:03.0029104Z`) is newer than dirty
`src/hybrid-engine.ts` (`2026-09-23T02:27:50.1850169Z`) and contains
`#bridgeAttestationInFlight`, `async #runBridgeAttestation`, wrapper
assignment of in-flight **before** any `await`, and
`bridgeAttestationChecked = true` only on `#runBridgeAttestation` exit
paths after verify/admit/deny/catch. This reviewer did not rebuild.

Dirty slice for this claim vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-tower-citizen/src/hybrid-engine.ts` (`+`
`#bridgeAttestationInFlight`; wrapper/coalesce; body moved into
`#runBridgeAttestation`) and `M`
`packages-ts/galerina-tower-citizen/tests/bridge-attestation.test.mjs`
(`+1` concurrent-infer hostile). HEAD already set
`bridgeAttestationChecked` **after** verify; the scan-shaped early flag
is on `0f24ca30` lines 465–466, not on HEAD. `dist/` is gitignored.
Passing tests here are **not** production admission.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-tower-citizen/src/hybrid-engine.ts` | `ed1f4c23be89bb6e535e743bbf255d55950d2e02c7906cf059b5ea4da56599cc` |
| `packages-ts/galerina-tower-citizen/dist/hybrid-engine.js` | `8ae47a33425382573eb67a44307fc2828a818cddf2ddf365a23a48977f55501f` |
| `packages-ts/galerina-tower-citizen/tests/bridge-attestation.test.mjs` | `ba0bb282cd331b75fcecbd53c6e4104efdd38c67a4b9119187e47debf050a452` |
| `packages-ts/galerina-tower-citizen/dist/index.js` | `a25d2ae0912dd4c68ab363f79fa37124a3c6d991c9a474f44d30259ba26c1d32` |

HEAD `src/hybrid-engine.ts` (post-scan flag-after-verify, pre-in-flight
wrapper) sha256
`04e12188e361ac514dd175e65ea868d739797e6df84431740e407270c7bd754a`.
Author-claimed hashes for the three named files **match**.

Scan inventory
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
`ed70ae4403578e94928e0b099cb988079f65e0eacfb40cbcb8dbd0e0f01494b7`
(`findings_json_sha256`
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`).
This review did not modify inventory.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| Scan `0f24ca30` set `checked=true` before `await verifyAttestationHybrid` with denial still `null` | `git show 0f24ca30` `hybrid-engine.ts` 464–502: line 466 `this.bridgeAttestationChecked = true` then 493–495 `await verifyAttestationHybrid`. Independent replica: second caller settled `null` while first later returned `"denied"` |
| Current wrapper assigns in-flight **synchronously** before any `await` | source `checkBridgeAttestation` 541–550: `pending = this.#runBridgeAttestation(); this.#bridgeAttestationInFlight = pending;` then `await pending`. Dist 320–328. Same-turn assignment: no other JS runs between start and store |
| Cached result returned only after `#runBridgeAttestation` completes | source 542: `if (this.bridgeAttestationChecked) return this.bridgeAttestationDenial` is reachable as a cache hit only after `#run` sets the flag. Flag writes: 562, 570, 577, 585, 595, 602, 609, 614 — all after verify/admit/deny/catch, none before the 590 await |
| Concurrent callers await `#bridgeAttestationInFlight` instead of a null denial | source 543; dist 323–324. Independent delayed-verify replica: at second entry `checked=false`, `denial=null`, `inFlight=true`, second still `"waiting"` until verify resolves; failing verify → both `"denied"` |
| Concurrent infer with signed stub-ternary both `trapFired === false` | executed named hostile; independent probe both `trapFired=false`, `bridges=["stub-ternary"]`. Additional hybrid (`verifyAttestationHybrid`) concurrent pair also both `trapFired=false` |
| Unattested registry still `ERR_BRIDGE_UNATTESTED` | executed suite test; independent probe `trapFired=true`, `trapCode=ERR_BRIDGE_UNATTESTED` |
| Dist not stale vs dirty source | dist mtime newer; symbols `#bridgeAttestationInFlight`, `#runBridgeAttestation` present; `photonicCertifiedChecked = true` still before its await (residual) |
| 124-finding scan | **not this claim** (`csf_04b1ca56fd9143e13de6b0d2` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=30000 packages-ts/galerina-tower-citizen/tests/bridge-attestation.test.mjs`
   → **10/10 pass**, `fail 0`, `cancelled 0`, `skipped 0`,
   `duration_ms 184.3835`.
   Named-claim tests:
   - `hostile: concurrent infer does not treat in-flight attestation as already admitted` — **green** (7.6365ms)
   - `engine DENIES an unattested bridge under an attestation policy` — **green** (1.3962ms)
   Remaining 8 tests are signature/pin/revocation/bind/permit coverage
   in the same file; they ran; they are not the in-flight claim.

Independent extra probes
(`%TEMP%\galerina-bridge-attestation-inflight-probe.mjs`; not
production; imports this tree’s `dist/index.js`): **8/8**.

- Real concurrent signed stub-ternary: both `trapFired=false`.
- Real unattested default stub registry: `ERR_BRIDGE_UNATTESTED`.
- Real concurrent hybrid (ML-DSA `await verifyAttestationHybrid`): both
  `trapFired=false`.
- Scan-shaped replica, **failing** delayed verify: at second entry
  `checked=true`, `denial=null`; second settled `null` **before** verify;
  first later `"denied"`. **CONFIRMED:** a second caller would see
  success.
- Scan-shaped replica, succeeding delayed verify: second still settled
  `null` before first completed (false admission window even on the
  success path).
- Current-wrapper replica, failing delayed verify: second did **not**
  settle before verify (`secondValueBeforeVerify="waiting"`,
  `inFlightAtSecond=true`, `checkedAtSecond=false`); both `"denied"`.
- Current-wrapper replica, succeeding delayed verify: both `null` only
  after verify; `checkedAfter=true`, `denialAfter=null`.
- Photonic residual replica: `photonicCertifiedChecked=true` before
  await, `verified` still `false`; second settled `false` (deny, not
  success).

The named concurrent suite test is an **ALLOW-path** pair. With
classical Ed25519, `verifyAttestation` is synchronous, so
`#runBridgeAttestation` can finish before a second `infer` reads the
cache; HEAD `91b4dec0` (flag after verify, no in-flight) would also
admit both. Discriminating evidence for the scan-shaped premature
success is the delayed-verify replica, not that test going green.

## Challenge 1 — can a second caller observe `bridgeAttestationDenial === null` while verify is still in flight?

**No on the current wrapper. CONFIRMED closed for `checkBridgeAttestation`.**

Locators: source 541–550 / 553–617; dist 320–400. Scan reconstruction:
`0f24ca30` 466 then 494.

Wrapper stores `#bridgeAttestationInFlight` on the same turn as starting
`#runBridgeAttestation`, before the wrapper’s `await`. `#run` does not
set `bridgeAttestationChecked` until after `verifyAttestation` /
`verifyAttestationHybrid` / admit / deny / catch. Independent replica
with a held promise: second caller sees `inFlight` and remains
`"waiting"`; a failing verify denies **both**. Scan-shaped replica with
the same held promise: second caller settles `null` (success) while
first later returns `"denied"`.

## Challenge 2 — do concurrent signed-registry infers both complete without trap?

**Yes. CONFIRMED** on the dirty dist. Named hostile and independent
classical + hybrid pairs: `trapFired=false` on both legs. This is the
named ALLOW, not a red detector for premature success.

## Challenge 3 — does unattested still trap `ERR_BRIDGE_UNATTESTED`?

**Yes. CONFIRMED.** Default stub registry (manifest, no signature)
under `requireSigned` + `publicKeyPem`. Suite and independent probe
both `trapFired=true`, `trapCode=ERR_BRIDGE_UNATTESTED`. Detector can
go red.

## Residuals (not findings against the named claim)

- `verifyPhotonicCertifiedAdmission` still sets `photonicCertifiedChecked = true`
  **before** `await verifyAttestationHybrid` (source 637–639 / dist
  419–422). Default `photonicCertifiedVerified = false`, so a concurrent
  caller observes **deny**, not success. Independent replica: second
  settled `false` while first later became `true`. Out of this named
  claim; not 124-scan closure.
- `resolveCapabilityGrant` still sets `#capabilityResolved = true`
  before `await verifyCapabilityGrant` (source 521–529). Concurrent
  callers skip the in-flight grant and read mask `0` →
  `ERR_CAPABILITY_DENIED` (deny, not success). Named tests opt into
  `allowUnsignedCapabilityGrant`, so they never hit that await.
- Named concurrent hostile is ALLOW-path and classical-sync; it does
  not go red on the scan-shaped early-`checked` bug. Discriminator is
  the delayed-verify replica.
- Same dirty `hybrid-engine.ts` also carries live-bridge snapshot
  admission (`#admittedBridges`) already on HEAD. Out of this in-flight
  claim.
- Scan ID `csf_04b1ca56fd9143e13de6b0d2` stays `PARTIAL_THIS_TREE`.
  Inventory counts stay **90 OPEN / 30 PARTIAL / 4 PATCHED_AUDIT_PENDING**.
  Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named in-flight / premature-success claim.
The scan-shaped early `checked=true` with null denial **is**
reconstructible on `0f24ca30` and **is not** present on this dirty
wrapper: concurrent callers await `#bridgeAttestationInFlight`; the
success cache is written only after `#runBridgeAttestation`. Unattested
still denies. Photonic (and capability-grant) still set a “checked”
flag before their awaits; those concurrent windows are deny, not
success, and are not this claim.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan
closure. **Not clean-HEAD evidence.**
