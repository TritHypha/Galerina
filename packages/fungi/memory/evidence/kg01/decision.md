# KG-01 encoding decision

Required normaliser (grok.com R&D 2026-10-21 Q4): RFC 3986, not WHATWG.

## Rejected options

| id | option | why rejected |
|---|---|---|
| R1a | WHATWG URL parsing | lenient, backslash to slash, different dot/percent rules |
| R1b | decodeURIComponent of the whole path before split | current TS; turns `%2F` into a separator |
| R1c | case folding / NFC | aliasing |
| R1d | trailing-slash strip | current TS; folds `/auth/verify/` onto the protected route |
| R1e | last-wins or first-wins for duplicate object/version keys | RD-1413 O2 requires refuse |

Dot-segment escape of the root is refused (UNKNOWN). RFC 3986 §5.2.4 would clamp at
root; that clamp is m1f and is RED.

## serve-secret-gate.ts divergences (reference only)

`normalizeDeclaredRoutePath` still: whole-path `decodeURIComponent`, `toLowerCase`,
trailing-slash strip. Behaviour is unchanged in this brief.
