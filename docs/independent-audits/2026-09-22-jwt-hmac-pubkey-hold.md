# Independent audit — JWT HS* refuses PEM / SPKI DER / PKCS#1 DER / JWK public keys as HMAC secrets

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

Follow-up after the prior residual on this same receipt: PKCS#1 DER and
JWK JSON as HS256 secrets must now DENY; valid HS256 must still ALLOW.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources were not edited by
this reviewer. Nothing was committed. This receipt is not the author’s
packet and is not GPT-6 Astra.

Named claim: JWT HS* verification refuses serialized asymmetric public
keys as HMAC secrets (PEM, SPKI DER, PKCS#1 DER, JWK JSON with
`kty !== "oct"`). `isSerializedAsymmetricKey` plus alg pin. Classic
confusion: HS256 signed with RSA public material, verified with that
material as HS256 key → DENY. Dummy keys generated in-process.

This is **not** 124-scan closure (`csf_5740f1c66d778367a4f731d6` remains
`PARTIAL_THIS_TREE`). OAuth CLI was not started.

Node v24.18.0. Tests import `../dist/index.js` (gitignored dist).
`dist/bearer.js` mtime (`2026-09-23T00:32:50.710Z`) is newer than dirty
`src/bearer.ts` (`2026-09-23T00:32:44.867Z`) and contains the same
`PEM_MARKER` / JWK `kty !== "oct"` / DER `["spki","pkcs1"]` loop /
`isSerializedAsymmetricKey` / HS* refuse. This reviewer did not rebuild.

Dirty slice for this claim: `M`
`packages-ts/galerina-auth/src/bearer.ts` and `M`
`packages-ts/galerina-auth/tests/bearer.test.mjs`. Passing tests here
are **not** production admission.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-auth/src/bearer.ts` | `b6459dcd3438fb66e216725efb2acc731e24d44b46f4ac9172f5855a29b7fa03` |
| `packages-ts/galerina-auth/dist/bearer.js` | `5ddaf02e826bef25d58d04249c83f50a33a2e2a9685feeec43ba08e5bc1ba03d` |
| `packages-ts/galerina-auth/tests/bearer.test.mjs` | `b614bdf593ae8f572a54152886ae65f9b4acfbb861a0b1db1a6d3da363aca889` |

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| HS256 signed with RSA public PEM, verified with that PEM as HS256 key → DENY | source `bearer.ts` `isSerializedAsymmetricKey` 81–119 / `verifySignature` 164–167; executed named test; independent probe `pemHs256=-1` |
| SPKI DER public key as HS256 secret → DENY | source DER loop `type:"spki"` 103–110; executed hostile test; independent probe `spkiDerHs256=-1` |
| PKCS#1 DER public key as HS256 secret → DENY | source DER loop `type:"pkcs1"` 103–110; executed hostile test; independent probe `pkcs1DerHs256=-1`; Node `createPublicKey({format:"der", type:"pkcs1"})` → `rsa` |
| JWK JSON public key as HS256 secret → DENY | source JWK parse `trimmed.startsWith("{")` + `kty !== "oct"` + `createPublicKey({format:"jwk"})` 85–101; executed hostile test; independent probes compact/pretty/Buffer/whitespace/Ed25519/EC/private JWK all `-1` |
| alg pin denies RS256↔HS256 confusion when caller pins RS256 | source 233–236; executed named test (rejects before verification) |
| KeyObject public key cannot be an HS256 secret | source 165–166; executed `key-type mismatch` test |
| valid HS256 with in-process secret → ALLOW | executed named test (`"a".repeat(32)`); independent `randomBytes(32)` → `validRandomHs256=1` |
| JWKS JSON `{keys:[JWK]}` as HS256 secret | **not in named suite**; independent probe `jwksJsonHs256=1` (ALLOW) |
| PKCS#1/SPKI DER as latin1/utf8 JS string, or hex/base64/base64url text | **not in named suite**; independent probes ALLOW (string path UTF-8-reencodes; named DER path is `Uint8Array`/`Buffer`) |
| 124-finding scan / OAuth CLI | **not this claim** |

## Command receipts

1. `node --test --test-timeout=30000 --test-name-pattern="PEM|DER|JWK|valid HS256" packages-ts/galerina-auth/tests/bearer.test.mjs`
   → **5/5 pass**, 0 fail, `duration_ms 231.9507`.
   - `valid HS256 token → ALLOW` — **green**
   - `serialized PEM public keys cannot be used as HS256 HMAC secrets` — **green**
   - `hostile: SPKI DER public keys cannot be used as HS256 HMAC secrets` — **green**
   - `hostile: PKCS#1 DER public keys cannot be used as HS256 HMAC secrets` — **green**
   - `hostile: JWK public keys cannot be used as HS256 HMAC secrets` — **green**

2. `node --test --test-timeout=30000 packages-ts/galerina-auth/tests/bearer.test.mjs`
   → **30/30 pass**, 0 fail, `duration_ms 287.7478`.
   Remaining 25 tests green (alg:none, KeyObject mismatch, exp/nbf/iss/aud, compose).

Independent extra probes (eval only; dummy in-process RSA/Ed25519/P-256;
not production):

- PEM public key as HS256 secret → `Verdict.DENY` (−1)
- SPKI DER public key as HS256 secret → `Verdict.DENY` (−1)
- PKCS#1 DER public key as HS256 secret → `Verdict.DENY` (−1)
- PKCS#1 PEM (`BEGIN RSA PUBLIC KEY`) → DENY
- JWK JSON compact / pretty / Buffer / leading-trailing ws / BOM / tab → DENY
- Ed25519 JWK, EC P-256 JWK, RSA private JWK → DENY
- Ed25519 SPKI PEM and SPKI DER → DENY
- PKCS#8 private DER and PKCS#1 private DER → DENY
- Dual pin `["HS256","RS256"]` with RSA JWK + HS256 token → DENY
- `randomBytes(32)` HS256 → `Verdict.ALLOW` (+1)
- `"a".repeat(32)` HS256 → `Verdict.ALLOW` (+1)
- Benign JSON object HMAC secret (`{"not":"a-key"}`) → ALLOW
- oct JWK JSON (`kty:"oct"`) as HMAC string → ALLOW (intentional; not asymmetric)
- JWKS JSON `{keys:[JWK]}` (compact and pretty) → **ALLOW** (+1)
- PKCS#1 DER as latin1 string / utf8-decoded string → **ALLOW** (+1)
- SPKI DER as latin1 string → **ALLOW** (+1)
- hex / base64 / base64url text of PKCS#1 DER → **ALLOW** (+1)
- JWK `kty` lowercase `"rsa"` → **ALLOW** (+1); Node `createPublicKey` throws `rsa is not a supported JWK key type`

## Challenge 1 — classic PEM confusion still ALLOW?

**No. CONFIRMED refused** on the HS* path before HMAC.
Locator: `bearer.ts` 81–119 and 164–167. Named PEM test and independent
probe both returned DENY.

## Challenge 2 — SPKI DER public key as HS256 secret still ALLOW?

**No. CONFIRMED refused.** Named hostile DER test and independent probe
both returned DENY. Detector can go red: those tests `assert.equal(..., Verdict.DENY)`.

## Challenge 3 — PKCS#1 DER public key as HS256 secret still ALLOW?

**No. CONFIRMED refused.** Prior residual is closed on the
`Uint8Array`/`Buffer` DER path. Named hostile PKCS#1 DER test and
independent probe both returned DENY. Detector can go red.

## Challenge 4 — JWK JSON public key as HS256 secret still ALLOW?

**No. CONFIRMED refused** for a single JWK object (`kty` string and
`kty !== "oct"`, `createPublicKey({format:"jwk"})` succeeds). Named
hostile JWK test and independent compact/pretty/Buffer probes all
returned DENY. Detector can go red.

## Challenge 5 — can a valid HS256 random secret still ALLOW?

**Yes. CONFIRMED.** Named suite ALLOW with 32-byte `"a"` secret.
Independent probe ALLOW with `randomBytes(32)`. Benign JSON object
secret also ALLOW (does not trip the public-key detector).

## Residuals (not findings against the named PEM / SPKI / PKCS#1 DER / JWK claim)

- JWKS documents (`{"keys":[JWK, …]}`) are not a single JWK (`kty` is
  not on the root object) and are not refused. Independent probe signed
  and verified HS256 using `JSON.stringify({keys:[publicJwk]})` as the
  secret → ALLOW. Named suite does not cover JWKS.
- Binary DER stuffed into a JS `string` (latin1 / replacement UTF-8) is
  not the `Uint8Array` DER path: `isSerializedAsymmetricKey` re-encodes
  strings as UTF-8 before `createPublicKey({format:"der"})`. Hex /
  base64 / base64url *text* of PKCS#1 DER also ALLOW. Named PKCS#1 /
  SPKI refuse is the Buffer/Uint8Array export.
- JWK `kty:"rsa"` (lowercase) is not a JOSE key type; Node rejects it
  and the detector falls through → ALLOW. Standard `kty:"RSA"|"EC"|"OKP"`
  public JWKs DENY.
- oct JWK JSON is excluded on purpose (`kty === "oct"`) and ALLOW as an
  HMAC string. That is not an asymmetric public key.
- Scan ID `csf_5740f1c66d778367a4f731d6` stays `PARTIAL_THIS_TREE`
  (serialized asymmetric public keys as HMAC secrets; PEM/SPKI/PKCS#1
  DER/JWK closed, JWKS and text-wrapped DER remain).
- Inventory `findings.json` sha256
  `07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`
  is unchanged by this review. Not 124-scan closure. Not OAuth CLI.
- HMAC `KeyObject` secrets (`createSecretKey`) are also refused by the
  object-not-Uint8Array guard (fail-closed; not in named suite).
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named PEM / SPKI DER / PKCS#1 DER / JWK
claim. Detector is not invalid. Evidence is sufficient for those refuses
plus valid HS256 ALLOW; insufficient for JWKS / text-wrapped DER refuse,
scan closure, and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
