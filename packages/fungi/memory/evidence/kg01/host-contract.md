# KG-01 host path contract (RFC 3986)

Authority: `packages/fungi/memory/src/serve-gate.fungi` `pathProtection` plus this file.
`packages-ts/galerina-core-compiler/src/serve-secret-gate.ts` `normalizeDeclaredRoutePath` is a
NON-AUTHORITATIVE reference. Do not use it as the mapping for `.fungi` tests.

Normaliser: RFC 3986 §5.2.4 remove_dot_segments and §6.2.2 syntax-based normalisation.

1. Split path / query / fragment before any decoding.
2. Decode only percent-encoded unreserved characters (ALPHA DIGIT - . _ ~). Remaining
   escape hex is normalised to uppercase.
3. Preserve the trailing slash. No case folding of the path. No Unicode normalisation.
4. Query: keep duplicate keys in order. A repeated `object` / `version` / `v` key refuses.
5. Refuse as UNKNOWN (pathClass 6, never tags 0-5 or public 7-9):
   a bad `%` escape; encoded reserved `%2F %5C %3F %23 %26` (any case); overlong /
   non-UTF-8 and raw non-ASCII; backslash; dot segments that escape the root; `%00`
   and other control characters; any path not on the closed recognised list.
6. Output is a closed tag only. Unproven or ambiguous maps to pathClass 6.
7. `.fungi` `pathProtection` keeps tags 0-5 protected, 6 unnormalisable, 7-9 public,
   default arm 12.

Closed recognised paths after normalisation:

| path | pathClass |
|---|---|
| `/auth/verify` | 0 |
| `/hello` | 7 |
| `/fixture` | 8 |
| `/public` | 9 |
| anything else, including `/auth/verify/` | 6 |
