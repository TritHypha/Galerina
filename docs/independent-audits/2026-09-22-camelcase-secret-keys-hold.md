# Independent audit — secret metadata detector flags camelCase credential keys

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: the secret metadata detector flags camelCase credential keys.

- Scan `0f24ca30` `normaliseKey` was only `toLowerCase` + replace `[-.\s]`
  with `_`
- Current: insert underscore between `[a-z0-9][A-Z]` before lowercase
- `apiKey`, `accessToken`, `privateKey`, `clientSecret`, `refreshToken`
  are findings (`clean=false`)
- `password`, `api_key`, `Authorization` still flag

Tests: `packages-ts/galerina-devtools-security/tests/security-devtools.test.mjs`
describe `"secret-checker: credential detection"`. Imports `../dist/index.js`.
Dist `normaliseKey` has the camelCase split and is not stale vs src.

Scan `csf_19dd3815a61cb9705e944b71` is **PARTIAL_THIS_TREE**. Inventory
file `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` reports
**84 OPEN / 36 PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 84,
`PARTIAL_THIS_TREE` 36, `PATCHED_AUDIT_PENDING` 4). This reviewer did
not re-adjudicate all 124 IDs. This is **not** 124-scan closure. Not
Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). This
reviewer did not rebuild. Dist is gitignored (`packages-ts/.gitignore`
line 5 `dist/`). `dist/secret-checker.js` mtime
(`2026-09-22T12:53:23.790Z`) is newer than clean-vs-HEAD
`src/secret-checker.ts` (`2026-09-22T07:25:18.150Z`). Dist is not stale
vs src: both insert `_` with `/([a-z0-9])([A-Z])/g` **before**
`toLowerCase()`, then replace `/[-.\s]+/g` with `_`. `normaliseKey` is
module-private in both (not exported from `dist/index.js`);
`checkKeyValueForSecret` / `checkMetadataForSecrets` are the observable.

Dirty slice for this claim vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-devtools-security/tests/security-devtools.test.mjs`
(+2 lines: `clientSecret` and `refreshToken` in `"detects sensitive key
names"`). `src/secret-checker.ts` is **clean vs HEAD** (git blob
`f8568878c9ae5b0df421ee8d5f79cc10c5ff5418`). Dist is untracked
(gitignored). Unrelated dirty on this worktree was not this claim.

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions`. Scan-revision source
`0f24ca30ef3f173c43a60c914c18b161327f2227` still has
`key.toLowerCase().replace(/[-.\s]/g, "_")` (no camelCase split; single
`[-.\s]` class, not `+`). Current HEAD src (landed in ancestor
`eb1645a4f`) already carries the split.

## Source hashes on this tree

Author-named hashes MATCH all three listed files. Independent SHA-256 of
the working-tree bytes.

| path | sha256 |
|---|---|
| `packages-ts/galerina-devtools-security/src/secret-checker.ts` | `cb51e3f35ff3519845866ff5836a756cb5c849e366a2350d5090ef29f0860c24` |
| `packages-ts/galerina-devtools-security/dist/secret-checker.js` | `3532d87cf2d2c75c6d7a672b77e75664dc251e5a5cdd9221fb430b6ad1caf8c1` |
| `packages-ts/galerina-devtools-security/tests/security-devtools.test.mjs` | `8f1483c13e01e0461b46fc6c0226b9d530aad007a2fd7e88be653161506f0d17` |

`dist/index.js` (re-export only; sha256
`a268415caa3a45cfb035dc773e9ef83880995dd07fec9ed2bbe4973711d781a0`)
exports `checkKeyValueForSecret`, `checkMetadataForSecrets`,
`redactMetadata` from `./secret-checker.js`. Dist is not in HEAD. HEAD
test blob `5c15a33f92cbc53560495658ae16511d02508534` already asserts
`apiKey` / `accessToken` / `privateKey`; the dirty working-tree test
blob `c3c232212379940fbc79dfaeda683676f7b403ee` adds `clientSecret` /
`refreshToken`.

Inventory file sha256
`b84e8cac6590905ba44aa09728251f82e807d43aa8026612871cc65fbf6d6820`
(`n` 124, `scan_revision` `0f24ca30…`, `worktree_head` `91b4dec0…`,
`overall` `INCOMPLETE_NON_AUTHORITATIVE`). Finding
`csf_19dd3815a61cb9705e944b71` (medium, high, path
`packages-ts/galerina-devtools-security/src/secret-checker.ts`) is
recorded `PARTIAL_THIS_TREE`. This review did not edit that inventory.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| Scan `0f24ca30` `normaliseKey` was toLowerCase + `[-.\s]` only | `git show 0f24ca30…:packages-ts/galerina-devtools-security/src/secret-checker.ts`: `return key.toLowerCase().replace(/[-.\s]/g, "_")` |
| Current inserts `_` between `[a-z0-9][A-Z]` before lowercase | src 38–43 / dist 29–34: `.replace(/([a-z0-9])([A-Z])/g, "$1_$2")` then `.toLowerCase()` then `.replace(/[-.\s]+/g, "_")` |
| Dist not stale vs src | **CONFIRMED** same regex, same order, same `SENSITIVE_KEYS` set (src 19–24 / dist 12–17). Dist mtime newer than src. Tests import dist |
| `apiKey` / `accessToken` / `privateKey` / `clientSecret` / `refreshToken` → `clean=false` | named `"detects sensitive key names"`; independent probe all five `clean:false`, field equals the raw key |
| `password` / `api_key` / `Authorization` still flag | named test plus independent probe all three `clean:false` |
| `userId` stays clean | named `"allows safe metadata"` `{ event, userId, status }`; independent `userId` `clean:true` and `checkMetadataForSecrets({event, userId, status}).clean===true` |
| Scan-shaped toLowerCase-only would miss `accessToken` | independent reconstruction of `0f24ca30` `normaliseKey` maps `accessToken` → `accesstoken`, not in `SENSITIVE_KEYS`; `scanWouldFlag=false`. Current maps `accessToken` → `access_token` and flags |
| Residual: `XApiKey` does not become `api_key` | independent: current norm `xapi_key`, `clean:true`; `XApiKey_is_api_key=false` |
| 124-finding scan | **not this claim** (`csf_19dd3815a61cb9705e944b71` stays `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=30000 --test-name-pattern "secret-checker: credential" packages-ts/galerina-devtools-security/tests/security-devtools.test.mjs`
   → **6/6 pass**, 0 fail, `duration_ms 315.5336`.
   - `detects sensitive key names` — **green** (0.6793ms)
   - `detects JWT values` — **green**
   - `detects OpenAI-style keys` — **green**
   - `detects Bearer auth header values` — **green**
   - `allows safe metadata` — **green**
   - `redactMetadata replaces secrets with [REDACTED]` — **green**

Independent extra probes (eval only; temp
`%TEMP%\camelcase-secret-keys-probe.mjs`, not production; imports the
same gitignored `dist/secret-checker.js`):

- `accessToken` / `clientSecret` / `apiKey` / `privateKey` /
  `refreshToken` → `clean:false`, finding
  `Sensitive field name '<key>' — redact before writing to audit`
- `password` / `api_key` / `Authorization` → `clean:false`
- `userId` → `clean:true`; metadata `{event:"Login", userId:"user_123",
  status:"ok"}` → `clean:true`
- metadata `{accessToken:"anything", userId:"user_123"}` →
  `clean:false`, field `accessToken`
- metadata `{clientSecret:"anything"}` → `clean:false`
- `redactMetadata({event, accessToken, userId})` redacts only
  `accessToken` to `[REDACTED]`; `userId` remains `u1`
- Scan-shaped `toLowerCase().replace(/[-.\s]/g, "_")` (exact
  `0f24ca30` body, same `SENSITIVE_KEYS` set): `accessToken` →
  `accesstoken` **miss**; `clientSecret` → `clientsecret` **miss**;
  `privateKey` → `privatekey` **miss**; `refreshToken` → `refreshtoken`
  **miss**. `apiKey` → `apikey` **would still flag** via the `apikey`
  alias (not the camelCase split)
- Current independent reconstruction of `normaliseKey`: `accessToken` →
  `access_token`; `clientSecret` → `client_secret`; `apiKey` →
  `api_key`; `XApiKey` → `xapi_key` (not `api_key`)
- `XApiKey` live `checkKeyValueForSecret` → `clean:true`; metadata
  `{XApiKey, userId}` → `clean:true`
- PascalCase `AccessToken` → `access_token` → `clean:false` (extra
  observation; not a named case)
- Probe printed `PROBE_OK`. Node v24.18.0.

## Challenge 1 — does dist `normaliseKey` still lack the camelCase split?

**No. CONFIRMED present and not stale.** Locator: src 39–43 / dist 30–34.
Both run `/([a-z0-9])([A-Z])/g` → `"$1_$2"` **before** `toLowerCase()`.
Dist mtime is newer than src. `dist/index.js` re-exports this module.
Named tests import dist and are green.

## Challenge 2 — do the named camelCase credential keys still miss?

**No. CONFIRMED findings (`clean=false`).** Named `"detects sensitive
key names"` asserts `apiKey`, `accessToken`, `privateKey`,
`clientSecret`, `refreshToken`. Independent probe agrees; metadata
objects with `accessToken` or `clientSecret` are not clean.

## Challenge 3 — did snake_case / already-lower keys regress?

**No. CONFIRMED still flag.** Named and independent: `password`,
`api_key`, `Authorization` remain `clean=false`.

## Challenge 4 — does `userId` stay clean (negative control)?

**Yes. CONFIRMED.** Named `"allows safe metadata"` and independent
`userId` / `{event, userId, status}` are `clean:true`. Current
normalisation yields `user_id`, which is not in `SENSITIVE_KEYS`.

## Challenge 5 — would scan-shaped toLowerCase-only still miss `accessToken`?

**Yes. CONFIRMED miss under the `0f24ca30` function.** Independent
reconstruction: `accessToken`.toLowerCase() is `accesstoken`, not
`access_token`, and is absent from `SENSITIVE_KEYS`. Same miss for
`clientSecret`, `privateKey`, `refreshToken`. The live detector on this
tree does not take that path.

## Residuals (not findings against the named camelCase-flag claim)

- **`XApiKey` does not become `api_key`.** The split requires a
  lowercase or digit immediately before an uppercase letter. `XApiKey`
  becomes `XApi_Key` → `xapi_key`, which is not in `SENSITIVE_KEYS`.
  Independent live check is `clean:true`. This is why
  `csf_19dd3815a61cb9705e944b71` stays **PARTIAL_THIS_TREE**, not
  PATCHED. Leading-acronym prefixes (`XApiKey`, `IOToken`, …) still
  miss.
- `apiKey` would have flagged even on scan `0f24ca30` because
  `SENSITIVE_KEYS` contains the alias `apikey`. The split is necessary
  for `accessToken` / `clientSecret` / `privateKey` / `refreshToken`,
  not for `apiKey`.
- Detector is exact set membership after normalisation, not semantic
  analysis. Keys such as `userId` are intentionally clean.
- Scan-time replace was `/[-.\s]/g` (one character); current is
  `/[-.\s]+/g`. That is a related current-vs-scan difference, not the
  named camelCase claim.
- Scan ID `csf_19dd3815a61cb9705e944b71`
  (`Secret metadata detector misses camelCase credential keys`, medium,
  `packages-ts/galerina-devtools-security/src/secret-checker.ts`)
  stays `PARTIAL_THIS_TREE`. Inventory totals **84 OPEN / 36 PARTIAL /
  4 PATCHED** were read from
  `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` and were not
  a 124-ID re-review. Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission. Items 1–15 remain incomplete. Not Astra.

## Classification

No `CONFIRMED_FINDING` on the named camelCase-flag / no-regression /
`userId`-clean claim. Detector is not invalid for those bullets.
Evidence is sufficient for the split, the named keys, the scan-shaped
`accessToken` miss reconstruction, and the `XApiKey` residual;
insufficient for scan closure and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
