# KG-01 mutants

| id | change | vector | expected |
|---|---|---|---|
| m1a | decode before split | `/auth/verify%3F?x=1` (`%3F` is `?`) | RED tag 0 (was 6) |
| m1b | decode `%2F` | `/auth/verify%2F` | RED tag 0 or separator (was 6) |
| m1c | lowercase the path | `/AUTH/verify` | RED tag 0 (was 6) |
| m1d | strip the trailing slash | `/auth/verify/` | RED tag 0 (was 6) |
| m1e | accept backslash as slash | `/auth\verify` | RED tag 0 (was 6) |
| m1f | clamp `..` at root | `/../auth/verify` | RED tag 0 (was 6) |
| m1g | last-wins duplicate version key | `?v=1&v=2` | RED tag 0 (was 6) |
| m1h | `.fungi` default arm returns 0 | pathClass 99 | RED pathProtection 0 (was 12) |
