# 176 — SQL injection concat (SECURITY)

**Concept:** String taint propagation — SPORE-VALUESTATE-004

`"SELECT " + rawEmail` produces a tainted string. The unsafe binding taints any
string it is concatenated with. This is the SQL injection pattern.

**Fix:** Validate first, or use parameterised queries.

**AI rule:** String concatenation with unsafe input produces a tainted string — never
concatenate raw boundary input into query strings, shell commands, or HTML.
