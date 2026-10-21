# KG-05 encoding decision

Required encoding (grok.com R&D 2026-10-21 Q5): tagged length-prefixed buffer.
byte0 tag `0x01` i64 or `0x02` u64, byte1 length exactly 8, then 8 bytes little-endian.
Total exactly 10 bytes. Unknown tag, length other than 8, short or long buffer refuses
before conversion. Host range-checks the wide domain then the call-site domain.
`.fungi` range-checks again after decode. No 32-bit intermediate. No `BigInt.asIntN`
or `BigInt.asUintN`.

## Rejected options

| id | option | why rejected |
|---|---|---|
| R5a | split hi/lo i32 pairs at the general boundary | two independently-forged halves have no tag or length binding and are easy to mis-order |
| R5b | raw i64 at the general boundary | relies on engine/BigInt wrap semantics |
| R5c | keep i32 + host pre-check only | truncation stays reachable by any caller that skips the pre-check |

## Residual

Raw `galerina.mjs run --invoke` still marshals CLI decimals through WebAssembly i32
(`tests/45-host-adapter-audit/wrap-vectors.test.mjs`). KG-05 fields use the tagged
10-byte path plus `classifyLegacyI32`, which returns classTag 8 for `|x| > 2147483647`
before any WASM call.
