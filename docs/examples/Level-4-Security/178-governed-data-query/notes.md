# 178 — Governed data-query

**Concept:** a governed, SQL-like query (filter-many) over sensitive records — the multi-row companion to the single-record `getPatient` flagship.

Untrusted filter inputs (`request.status`, `request.minAmount`) are `unsafe let` — "unknown until proven". They are untainted with `validate.*(...)?` **before** they can reach `database.read` (a raw value reaching the DB is `FUNGI-VALUESTATE-003` — it won't compile). The audit records only **validated** values (`status`, `rows.length`) — never a raw `request.context.*`, which would be `FUNGI-VALUESTATE-008` (a migration-stage warning in plain check that ESCALATES to an ERROR in a governed/production build; see the `getPatient` fix).

Verified `galerina check`-clean in **both** plain and `--strict-types` (0 errors, 0 governance warnings).

**AI rule:** Prove boundary filters (`validate.*(...)?`) before the database; audit only validated values. Untrusted → Validated → Database is the query-shaped trust flow (the filter-many companion to Protected → Redacted → Audit).
