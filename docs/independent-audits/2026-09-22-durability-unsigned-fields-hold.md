# Independent audit — durability admission does not brand extra unsigned fields

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: `admitRegistryDurabilityProfile` does not brand
attacker-supplied extra unsigned fields. `snapshotPlainData` copies own
data properties; `manifestShapeIsValid` requires exact `MANIFEST_KEYS`.
Extra key `unsignedPrivilege` throws
`REGISTRY_DURABILITY_PRODUCTION_MANIFEST_REFUSED`. Profile fields are
copied from the snapshot by name; `WeakSet` is the runtime brand.

Scan `csf_6863d7f4897abd8b695edff4` is **PARTIAL_THIS_TREE**. Inventory
**69 OPEN / 51 PARTIAL / 4 PATCHED** was independently recounted from
this tree’s inventory JSON `disposition_counts` and matches the
`findings[]` array (`n=124`). This is **not** 124-scan closure. Not
Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). This
reviewer did not rebuild. Dist is gitignored (`packages-ts/.gitignore`
`dist/`). Tests import `../dist/index.js`, which re-exports
`admitRegistryDurabilityProfile` from
`./registry-durability-production-admission.js`. Dist
`registry-durability-production-admission.js` mtime
(`2026-09-22T16:25:37.000Z`) is newer than clean-vs-HEAD
`src/registry-durability-production-admission.ts`
(`2026-09-22T11:43:58.000Z`). Dist is **not stale** vs src: both
snapshot own data properties, both require exact `MANIFEST_KEYS`, both
copy profile fields by name, both brand with a module-local `WeakSet`
after `Object.freeze`.

Dirty slice for this claim vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-framework-app-kernel/tests/registry-durability-production-admission.test.mjs`
(+11 lines: the named hostile extra-field case).
`src/registry-durability-production-admission.ts` is **clean vs HEAD**
(git blob `5e86449e7fbc6719f9180ee0b6fd0f22bdc4500f`). Dist is untracked
(gitignored). Unrelated dirty paths in this worktree were not reviewed
for this claim.

## Source hashes on this tree

Author-named hashes MATCH both listed files. Independent SHA-256 of
the working-tree bytes.

| path | sha256 |
|---|---|
| `packages-ts/galerina-framework-app-kernel/src/registry-durability-production-admission.ts` | `a6ceb96872c265dd308d4dae5145465e7745e0ceb77a7d3d342401c580bd558f` |
| `packages-ts/galerina-framework-app-kernel/tests/registry-durability-production-admission.test.mjs` | `e3200939a807c04ade46f2fcca29bf818ad33d4d489764c06a866591e6bace81` |
| `packages-ts/galerina-framework-app-kernel/dist/registry-durability-production-admission.js` | `8979b4579d51270de7c9bc51c7bf3a49205facf7c6c8b3a0b57b325a4bf9e472` |
| `packages-ts/galerina-framework-app-kernel/dist/index.js` | `e9b4541e997e514b763dd762310e833fc95cffda9f615b233ccfabe37d0bfb9d` |

`dist/index.js` (re-export only) exports from
`./registry-durability-production-admission.js`. Dist is not in HEAD.
HEAD test blob `468ea05f6265121e5e02a7a62a8cc32b61877de3` lacks the
hostile extra-field case. Working-tree test blob
`2b20cd916c9602b1a7f1f86588b227908f0ac4e4`.

Scan-era `0f24ca30ef3f173c43a60c914c18b161327f2227` is an ancestor of
this HEAD. That blob already had exact `MANIFEST_KEYS` /
`hasExactDataShape` and named profile field copies plus `WeakSet`
branding. It validated the live `manifestValue` (no
`snapshotPlainData`). The snapshot-then-exact-shape path is on HEAD
`91b4dec0`; this dirty tree only adds the extra-field hostile test.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `snapshotPlainData` copies own data properties | src 208–231 / dist 79–105: `Object.getOwnPropertyDescriptors`, sorted `Object.keys`, data descriptors only; getters/setters/non-plain → `null` |
| `manifestShapeIsValid` requires exact `MANIFEST_KEYS` | src 146–169 + 257–264 / dist 19–42 + 125–129: `hasExactDataShape` joins sorted own keys and requires equality with the frozen 22-key list |
| Extra key `unsignedPrivilege` throws `REGISTRY_DURABILITY_PRODUCTION_MANIFEST_REFUSED` | named hostile; independent `extra=REGISTRY_DURABILITY_PRODUCTION_MANIFEST_REFUSED` |
| Refuse happens **before** branding | src 401–404 refuse; `productionProfiles.add` is src 491 / dist 314, after named freeze |
| Profile fields copied from the snapshot by name | src 464–490 / dist 287–313: explicit `adapterId: manifest.adapterId` etc. No `...manifest` spread |
| `WeakSet` is the runtime brand | src 201 + 570–576 / dist 74 + 383–387: `productionProfiles.has(value)`. Independent `honestBrand=true`, `spreadBrand=false` |
| Dist snapshot/exact-shape not stale vs src | **CONFIRMED** same descriptor copy, same key-join exactness, same named profile fields, same `WeakSet.add` after freeze |
| Named node tests | **8/8 pass** under the assigned file, `duration_ms 204.1903` |
| 124-finding scan | **not this claim** (`csf_6863d7f4897abd8b695edff4` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=60000 packages-ts/galerina-framework-app-kernel/tests/registry-durability-production-admission.test.mjs`
   → **8/8 pass**, 0 fail, `duration_ms 204.1903`.
   - `issues one private, frozen profile only after both root components verify` — **green** (3.4034ms)
   - `releases authority only through a separate owner-signed exact-profile authorization` — **green** (0.7049ms)
   - `refuses copied candidates, mismatched targets, stale windows and failed owner verifiers` — **green** (0.9375ms)
   - `refuses copied evidence, stale authority, revocation, and either missing signature verifier` — **green** (0.9024ms)
   - `refuses mixed platform, implementation, storage, evidence, and operational identities` — **green** (0.5491ms)
   - `hostile: an extra unsigned manifest field is refused before branding` — **green** (0.2409ms)
   - `materializes the signed manifest before branding so a Proxy cannot swap fields after verify` — **green** (0.3332ms)
   - `binds generation, key, delegation, index, adapter, checkpoint, and active window` — **green** (0.5358ms)

Independent extra probes (eval only; temp
`%TEMP%\durability-unsigned-fields-probe.mjs`, not production; imports
the same gitignored `dist/index.js`). Printed `PROBE_OK`. Node v24.18.0.

Current dist:

- `{ ...manifest(), unsignedPrivilege: true }` →
  `REGISTRY_DURABILITY_PRODUCTION_MANIFEST_REFUSED`
- `{ ...manifest(), productionAuthorizing: true }` →
  `REGISTRY_DURABILITY_PRODUCTION_MANIFEST_REFUSED` (attacker cannot
  supply the derived boolean as a manifest key)
- extra `rootSignature.extraSig` →
  `REGISTRY_DURABILITY_PRODUCTION_MANIFEST_REFUSED` (`SIGNATURE_KEYS`
  exact shape)
- missing `generationId` →
  `REGISTRY_DURABILITY_PRODUCTION_MANIFEST_REFUSED`
- honest admit: `isProductionRegistryDurabilityProfile=true`,
  `Object.isFrozen=true`, no own `unsignedPrivilege`
- `{ ...honestProfile }` is **not** branded (`spreadBrand=false`)
- honest constants: `authenticated=true`,
  `authorityReleased=false`, `productionAuthorizing=false`

Scan-era `0f24ca30` already refused a plain extra string key via
`hasExactDataShape` + `MANIFEST_KEYS` and already copied profile
fields by name (no manifest spread). The live-object path without
`snapshotPlainData` is the scan-era difference; HEAD added the
snapshot. Extra `unsignedPrivilege` on a plain object is refused in
both.

## Challenge 1 — does extra `unsignedPrivilege` get branded?

**No. CONFIRMED refused before branding.** Named hostile
`assert.throws(..., /REGISTRY_DURABILITY_PRODUCTION_MANIFEST_REFUSED/)`
and independent `extra=REGISTRY_DURABILITY_PRODUCTION_MANIFEST_REFUSED`.
`productionProfiles.add` is not reached. Detector can go red.

## Challenge 2 — does the snapshot copy extras onto the branded profile?

**No. CONFIRMED.** Snapshot copies own data keys first; exact
`MANIFEST_KEYS` then fails. Even if shape passed, the profile object
is a named field list (src 464–490 / dist 287–313), not a spread of
the snapshot. Independent honest profile own keys do not include
`unsignedPrivilege`.

## Challenge 3 — are dist snapshot / exact-shape checks stale vs src?

**No. CONFIRMED not stale.** Dist mtime is newer than src. Src blob
equals HEAD. Dist `snapshotPlainData` (79–105), `hasExactDataShape`
key-join (106–116), `MANIFEST_KEYS` (19–42), named freeze (287–313),
and `WeakSet.add` (314) match src 208–231, 233–247, 146–169, 464–491.
Tests import that dist re-export.

## Challenge 4 — are `authenticated` / `authorityReleased` / `productionAuthorizing` attacker fields?

**No. CONFIRMED constants.** They are not in `MANIFEST_KEYS`. An
attacker key `productionAuthorizing: true` is
`MANIFEST_REFUSED`. Admit writes `true` / `false` / `false` as
literals. Independent honest profile has those three values. WeakSet
identity is the brand; a spread copy with the same booleans is not
admitted (`spreadBrand=false`).

## Residuals (not findings against the named extra-unsigned-field claim)

- The branded profile also carries derived
  `authenticated` / `authorityReleased` / `productionAuthorizing`
  booleans that are **not** in the signed manifest. They are
  constants written by admit, not attacker fields. WeakSet identity
  is the brand.
- Symbol-keyed extras are ignored by `Object.keys` in both snapshot
  and exact-shape. Independent `symbolAdmitted=true` and
  `symbolOnProfile=false`: admission succeeds, the symbol is **not**
  copied onto the profile. The named claim is the string key
  `unsignedPrivilege`.
- Inherited extras on a non-`Object.prototype` object fail closed
  (`protoCode=REGISTRY_DURABILITY_PRODUCTION_MANIFEST_REFUSED`)
  because snapshot requires a plain object. Own-property extra string
  keys are the named case.
- Scan-era live-object admit without snapshot is a Proxy/TOCTOU
  surface already covered by the separate
  `"materializes the signed manifest..."` test. Not this extra-field
  claim.
- Scan ID `csf_6863d7f4897abd8b695edff4`
  (`Durability admission brands profile fields that were not signed`,
  medium,
  `packages-ts/galerina-framework-app-kernel/src/registry-durability-production-admission.ts`)
  stays `PARTIAL_THIS_TREE`. Inventory file
  `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
  `360a56825276f8fc2146bfc1f16d548f89e74761607e957318df4d1a6d3c4b45`
  `disposition_counts` independently recounted as **69 OPEN / 51
  PARTIAL / 4 PATCHED**. This review did not re-adjudicate the other
  123 IDs. Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named extra-unsigned-field refuse /
named-copy / WeakSet-brand claim. Detector is not invalid. Evidence
is sufficient for those bullets; insufficient for symbol-key
coverage as a signed-field rule, scan closure, and production
admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
