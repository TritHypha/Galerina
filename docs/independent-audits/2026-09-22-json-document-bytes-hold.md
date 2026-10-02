# Independent audit — parseJsonValue maxDocumentBytes without whole-document encode

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: `parseJsonValue` enforces `maxDocumentBytes` on UTF-8 size
without `encoder.encode` of the whole string.

- `Uint8Array`: `byteLength` check before `TextDecoder.decode`
- string: UTF-16 `length > maxBytes` refuses; if `length * 3 > maxBytes`,
  `utf8ByteLength` walks without allocating a UTF-8 copy
- four U+20AC in a JSON string with `maxDocumentBytes` 10 refuses
  `FUNGI-JSON-002` even though UTF-16 length is 6; two euros admit

Tests: `packages-ts/galerina-data-json/tests/json-document-bytes.test.mjs`
import `../dist/json-value.js`. Dist `utf8ByteLength` /
`documentExceedsMaxBytes` / `parseJsonValue` match src. Dist is not stale.

Scan `csf_6c6ebe8f17bfb2ad895b1f30` is **PARTIAL_THIS_TREE**. Inventory
file reports **86 OPEN / 34 PARTIAL / 4 PATCHED**. This is **not**
124-scan closure. Not Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64. This reviewer did not
rebuild. Dist is gitignored (`packages-ts/.gitignore` `dist/`).
`dist/json-value.js` mtime (`2026-09-23T02:56:40.000Z`) is newer than
dirty `src/json-value.ts` (`2026-09-23T02:56:28.000Z`). Dist is not
stale vs src: both define `utf8ByteLength` and `documentExceedsMaxBytes`;
both call that helper in `parseJsonValue` **before** `sourceText`;
neither `parseJsonValue` body calls `encoder.encode` on the document.

Dirty slice for this claim vs HEAD `91b4dec0`:

- `M` `packages-ts/galerina-data-json/src/json-value.ts` (working-tree
  git blob `54e8fb58f2f233b562a679bd8afe074480200685`; HEAD blob
  `9e258e9451614de52b6ca21f47063ce0570736db`)
- `??` `packages-ts/galerina-data-json/tests/json-document-bytes.test.mjs`
- `??` `packages-ts/galerina-data-json/tests/json-encode-budget.test.mjs`
  (named command also ran this file; encode-budget is not the named
  parse claim)
- `dist/json-value.js` untracked (gitignored)

HEAD `parseJsonValue` still did
`encoder.encode(text).byteLength` **after** `sourceText`. The dirty
candidate deletes that whole-document encode and substitutes
`documentExceedsMaxBytes` before decode. Unrelated dirty on this
worktree was not this claim.

## Source hashes on this tree

Author-named hashes MATCH all three listed files. Independent SHA-256 of
the working-tree bytes.

| path | sha256 |
|---|---|
| `packages-ts/galerina-data-json/src/json-value.ts` | `1fd747d707ce9855f443d2b49c26225eaaca6a1f4a4b923f60cacaaff12f46bc` |
| `packages-ts/galerina-data-json/dist/json-value.js` | `c688744bfe71cf69d3998be73a956852d349bf63b0883e4ce51d93800f865fb2` |
| `packages-ts/galerina-data-json/tests/json-document-bytes.test.mjs` | `51868c5b8e6997115853550bc3015f01e1a939f901a391dabf604af919f8873c` |

`utf8ByteLength` / `documentExceedsMaxBytes` are module-private in both
src and dist (not exported). Observable is `parseJsonValue`. Dist is
not in HEAD.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| Enforce `maxDocumentBytes` on UTF-8 size | src `parseJsonValue` 377–380 / dist 333–335: `documentExceedsMaxBytes` then `FUNGI-JSON-002` `"JSON value exceeds maxDocumentBytes."` Named hostile four-euro case; independent `four_euros` / `three_euros` / `four_euros_uint8array` |
| No `encoder.encode` of the whole document | **CONFIRMED.** HEAD still had `encoder.encode(text).byteLength` after `sourceText`. Dirty src/dist `parseJsonValue` has no `encoder.encode`. Independent four-euro / ASCII-true / ASCII-len-11 / oversize-Uint8Array probes: `encode_calls === 0` on the refuse path. `parseString` still encodes the *decoded string value* after admission (src 173 / dist 122); that is not the document. `encodeJsonValue` still `encoder.encode`s encoded output (src 506 / dist 472); that is the encode path. |
| `Uint8Array`: `byteLength` before `decode` | src `documentExceedsMaxBytes` 349 / dist 306–307; `sourceText` decode is later (src 360 / dist 318) and only if the bound check passed. Independent `four_euros_uint8array` (14 bytes) and `uint8array_11_ascii`: `FUNGI-JSON-002`, `decode_calls === 0`. Independent `uint8array_true` (4 bytes) admits with `decode_calls === 1`. |
| string: UTF-16 `length > maxBytes` refuses | src 350 / dist 308–309. Independent `ascii_len_11` (`length === 11`) → `FUNGI-JSON-002`, no encode/decode. |
| string: `length * 3 <= maxBytes` skips the walk | src 351 / dist 310–311. Upper bound is correct for UTF-16 (BMP ≤ 3 bytes/unit; surrogate pair 2 units → 4 bytes). Discriminating four-euro case does **not** take this branch (`6 * 3 = 18 > 10`). |
| else `utf8ByteLength` walks without a UTF-8 copy | src 325–346 / dist 278–304: `charCodeAt` loop, surrogate-pair +4, unpaired +3. No `TextEncoder` / `Buffer` / `Uint8Array` allocation in that function. Independent four-euro refuse: `encode_calls === 0`. |
| four U+20AC JSON string, max 10 → `FUNGI-JSON-002` despite UTF-16 length 6 | Named hostile test (`euros.length <= 10`). Independent `four_euros`: `utf16_length === 6`, `utf8_bytes === 14`, `ok: false`, `FUNGI-JSON-002`. Detector can go red. |
| two euros admit | Named `"two euro characters fit in 10 UTF-8 bytes including quotes"` (`Buffer.byteLength === 8`). Independent `two_euros` `ok: true`, value `"€€"`. |
| ASCII `true` admit | Named `"a short ASCII JSON document is admitted under maxDocumentBytes"`. Independent `ascii_true` `ok: true`, `value === true`, no encode/decode. |
| Dist matches src for this gate | **CONFIRMED** same predicates, same `FUNGI-JSON-002` code, same order (bound then `sourceText`). |
| Named node tests | **10/10 pass** for the requested command (`3/3` document-bytes + `7/7` encode-budget), `duration_ms 407.7782`. |
| 124-finding scan | **not this claim** (`csf_6c6ebe8f17bfb2ad895b1f30` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=30000 packages-ts/galerina-data-json/tests/json-document-bytes.test.mjs packages-ts/galerina-data-json/tests/json-encode-budget.test.mjs`
   → **10/10 pass**, 0 fail, `duration_ms 407.7782`.
   - `a short ASCII JSON document is admitted under maxDocumentBytes` — **green** (1.1072ms)
   - `hostile: UTF-16 length under the ceiling still refuses oversize UTF-8` — **green** (0.1912ms)
   - `two euro characters fit in 10 UTF-8 bytes including quotes` — **green** (0.8846ms)
   - seven encode-budget tests — **green** (not the named parse claim)

Independent extra probes (eval only; temp
`%TEMP%\json-document-bytes-probe.mjs`, not production; imports the same
gitignored `dist/json-value.js`; `TextEncoder.prototype.encode` /
`TextDecoder.prototype.decode` wrapped after import):

- `"€€€€"` (`U+20AC` × 4, UTF-16 length **6**, UTF-8 **14**) with
  `maxDocumentBytes: 10` → `ok: false`, `FUNGI-JSON-002`,
  `"JSON value exceeds maxDocumentBytes."`, `encode_calls=0`,
  `decode_calls=0`
- `"€€"` (UTF-8 **8**) → `ok: true`, string `"€€"`; one `encode` of the
  inner string value only (`parseString` / `maxStringBytes` path)
- `"true"` → `ok: true`, bool `true`, no encode/decode
- `Uint8Array` of the 14-byte four-euro document → `FUNGI-JSON-002`,
  `decode_calls=0`
- `Uint8Array(11)` ASCII → `FUNGI-JSON-002`, `decode_calls=0`
- `Uint8Array` of `"true"` (4 bytes) → `ok: true`, `decode_calls=1`
- ASCII string length 11 → `FUNGI-JSON-002`, no encode/decode
- `"€€€"` (UTF-16 length **5**, UTF-8 **11**) → `FUNGI-JSON-002`,
  `encode_calls=0`
- `Uint8Array` of the two-euro document (8 bytes) → `ok: true`,
  `decode_calls=1`

Probe printed `PROBE_OK`. Node v24.18.0.

## Challenge 1 — does `parseJsonValue` still `encoder.encode` the whole document?

**No. CONFIRMED removed on this dirty candidate.** Locator: dirty src
377–380 / dist 333–335 vs HEAD after-`sourceText` encode. Independent
four-euro refuse recorded **zero** `TextEncoder.encode` calls.

## Challenge 2 — is a UTF-16 length under the ceiling still admitted when UTF-8 exceeds `maxDocumentBytes`?

**No. CONFIRMED refused.** Four U+20AC JSON string: UTF-16 length 6 ≤ 10,
UTF-8 14 > 10, `FUNGI-JSON-002`. Named hostile test and independent
`four_euros` / `three_euros` agree. Detector can go red.

## Challenge 3 — is `Uint8Array` still decoded before the byte ceiling?

**No. CONFIRMED `byteLength` first.** Oversize `Uint8Array` (14-byte
four-euro document; 11-byte ASCII) refuses with `decode_calls=0`.
Admitted 4-byte `"true"` `Uint8Array` decodes once.

## Challenge 4 — are two euros and ASCII `true` admitted under max 10?

**Yes. CONFIRMED.** Named suite and independent `two_euros` /
`ascii_true` admit. Two-euro UTF-8 is 8 bytes including quotes.

## Residuals (not findings against the named no-whole-document-encode / UTF-8 ceiling claim)

- Admitted documents still become a JS string of size up to
  `maxDocumentBytes` UTF-8. String inputs are reused; `Uint8Array` inputs
  that pass `byteLength` still `decoder.decode` into a JS string
  (independent `uint8array_true` / `two_euros_uint8array` `decode_calls=1`).
- `Scanner` still walks that JS string after the bound check (src
  `parse()` 124–135 / dist 68–78). Node budget reuses
  `maxDocumentBytes` as a node count (`nodes > maxDocumentBytes`, src
  142–143). That is not a UTF-8 copy of the document, and it is not
  124-scan closure.
- `parseString` still calls `encoder.encode(out)` on each decoded JSON
  string value for `maxStringBytes` (src 173). Independent two-euro
  admit recorded that inner encode. Out of scope for whole-document
  `maxDocumentBytes`.
- Scan ID `csf_6c6ebe8f17bfb2ad895b1f30`
  (`JSON input limits are enforced after attacker-sized decoding and allocation`,
  medium, `packages-ts/galerina-data-json/src/json-value.ts`)
  stays `PARTIAL_THIS_TREE`. Inventory file
  `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
  `85bc123d435a89092f585d32d7fbe7c8a61954ba46a7c2bfc82a7510b201cb33`
  reports **86 OPEN_ON_SCAN_SNAPSHOT / 34 PARTIAL_THIS_TREE /
  4 PATCHED_AUDIT_PENDING**, `n=124`, overall
  `INCOMPLETE_NON_AUTHORITATIVE`. Those totals were read from the
  inventory file, not re-adjudicated finding-by-finding. Not 124-scan
  closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named UTF-8 `maxDocumentBytes` /
no-whole-document-`encoder.encode` / four-euro refuse / two-euro admit
claim. Detector is not invalid. Evidence is sufficient for those parse
bullets; insufficient for post-admit JS-string residency, scanner walk,
scan closure, and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
