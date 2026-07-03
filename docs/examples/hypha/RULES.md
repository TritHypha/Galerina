# `.hypha` rules — the fail-closed invariants

The normative invariants the reference checker (`hypha-check.mjs`, RD-0246) enforces. Each is machine-checked; the
"prevents" column is the attack it closes. Counterpart to the `.gate` [RULES](../gate/RULES.md). A conformant
TritMeshQL engine MUST uphold all of them.

| # | Rule | Prevents |
|---|---|---|
| **R1** | **Read-only by SAFE-set.** A statement MUST begin with `RETURN`/`SELECT` (query) or `SHOW`/`DESCRIBE`/`LIST` (schema). Anything else fails to parse → REJECT. Writes are **not** a blocklist — they simply aren't in the grammar. | data mutation through the query language; novel/unknown verbs (fail-closed by allow-list) |
| **R2** | **One statement, lexed once.** No `;`-separated second statement; any trailing token after a complete statement → REJECT. | stacked-query / second-order injection |
| **R3** | **Values are typed leaves.** User values are string/number literals or `$params`, lexed once into inert AST leaves — never re-lexed or spliced into query text. There is no string→query construction path. | SQL/NoSQL injection (a quote/`;`/`DROP` in a value is just data) |
| **R4** | **Fail-closed resolution.** Every field/collection/edge MUST resolve against the (signed) schema; unknown or ambiguous → REJECT. Identifiers are bare tokens, never strings. | field-name / identifier injection; typos silently returning wrong data |
| **R5** | **T-ZONE invariant.** No **semantic** field may appear in any operator at or before the Gate. Only all-opaque conjuncts push down to the untrusted index; any semantic reference (or a zone-mixing `OR`) is a post-Gate residual. | leaking decrypted content into the untrusted zone / before authorization |
| **R6** | **Traversal is typed and GATED.** A `JOIN`/`MATCH`'s endpoints, direction, and source/target collections MUST match the declared signed edge, or REJECT. Traversal returns **GATED** (never PASS) until the signed graph-spine (RD-0150/0167) lands. Topology proves *reach*, the Gate proves *authorization*. | cross-tenant traversal (IDOR/CWE-639); topology-as-authority; unsigned-index read-redirect |
| **R7** | **Redaction is explicit.** A semantic field leaves redacted only when a `REDACT` (→ a `.gate` `:cut` that dominates egress) covers it, or the destination is trusted. No name-based auto-redaction. | silent PII/PHI egress to an untrusted destination |
| **R8** | **Schema fail-closed.** A field classified PII/PHI/PCI can never be zoned opaque (a sensitive field is never a pushdown key); a mis-authored schema → REJECT up front. Classifications are canonicalized (case/whitespace/array), unparseable shapes rejected. | a mis-authored schema pushing a sensitive field pre-Gate |
| **R9** | **Bounded + well-formed.** Numeric literals must be well-formed; `LIMIT`/`OFFSET` non-negative integers, `K ≥ 1`; the `FILTER` drawing has a depth cap. Malformed → REJECT (intentionally, not by stack limit). | malformed-number coercion; negative/absurd bounds; recursion DoS |
| **R10** | **Auth is the K3 Gate, never a predicate.** Authorization is a signed capability at the Gate — never a query condition, never topology, never a ternary/health value. | forgeable authorization; predicate-as-auth confusion |

**Verdict model (fail-closed):** **PASS** (safe + shippable) · **GATED** (safe syntax, blocked on the signed
graph-spine) · **REJECT** (fail-closed). A "green" never silently green-lights an unshippable traversal.

**Design law (why a checker, not a style guide):** these are *by-construction* properties, not conventions — the same
discipline that made `.gate` credible. "Injection-proof" and "fail-closed" are only real when a re-runnable checker
proves them and its own tests are non-vacuous (RD-0246 found and fixed 7 real defects behind an initial green).
