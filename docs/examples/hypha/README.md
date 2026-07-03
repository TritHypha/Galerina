# `.hypha` examples — TritMeshQL (v2)

`.hypha` is **TritMeshQL** — the draw-don't-code, **read-only** query language for the `.spore` database
(the `.sql`-equivalent). These examples are the counterpart to [`../gate/`](../gate/): every file is
**verified against the reference checker**, and each declares the verdict it must produce.

> **Status.** The grammar shown here is **v2** (owner decisions RD-0243/0244). The reference checker
> `hypha-check.mjs` is an **R&D artifact** (`Galerina-R-AND-D/tritmeshql/`), not yet wired into prod; the
> dedicated spec repo `TritMesh-Query-Language` is still at the v0 reference grammar pending a review
> checkpoint (see *Reconciliation* below). Writes are **not** part of `.hypha` — data mutations go through a
> separate governed write path.

## The verdict model (fail-closed)

The checker returns one of three states — a "green" never silently green-lights something unshippable:

| Verdict | Meaning |
|---|---|
| **PASS** | Safe and shippable now. |
| **GATED** | Valid syntax, but **blocked on the signed graph-spine** (RD-0150/0167) — e.g. any cross-collection `JOIN`/traversal. Must not execute until the spine lands. |
| **REJECT** | Fails closed — a write verb, an unknown field/edge, a malformed query, a mis-typed traversal. |

## The examples

| File | Verdict | Shows |
|---|---|---|
| [`01-basic-projection-filter.hypha`](01-basic-projection-filter.hypha) | PASS | the minimal query — opaque projection + opaque coordinate filter (all pre-Gate, untrusted index) |
| [`02-semantic-filter-redact.hypha`](02-semantic-filter-redact.hypha) | PASS | the **zone split** (opaque pushdown pre-Gate vs semantic residual post-Gate) + `REDACT`→`:cut` egress |
| [`03-or-nearest-order.hypha`](03-or-nearest-order.hypha) | PASS | in-line `OR` drawing, `NEAREST` vector similarity (trusted-zone), `ORDER BY`/`LIMIT`/`OFFSET` |
| [`04-tenant-join-gated.hypha`](04-tenant-join-gated.hypha) | **GATED** | cross-collection traversal (the reachability-as-authorization moat) — valid, but blocked on the signed spine |
| [`05-schema-introspection.hypha`](05-schema-introspection.hypha) | PASS | `SHOW FIELDS` — schema discovery for the low-schema `.spore` |
| [`06-injection-is-inert.hypha`](06-injection-is-inert.hypha) | PASS | **injection-proof by construction** — a SQLi payload is an inert string leaf, harmless |
| [`07-rejected-write.hypha`](07-rejected-write.hypha) | **REJECT** | **read-only by SAFE-set** — a write verb isn't in the grammar, so it fails to parse |
| [`08-rejected-unknown-field.hypha`](08-rejected-unknown-field.hypha) | **REJECT** | **fail-closed resolution** — an unknown identifier is rejected (kills field-name injection) |

## The security model (what the checker enforces)

1. **Read-only by SAFE-SET, not denylist.** A statement must begin `RETURN`/`SELECT` or `SHOW`/`DESCRIBE`/
   `LIST`; anything else fails to parse. `INSERT`/`UPDATE`/`DELETE`/`DROP`/`;`-stacking die *structurally*,
   never named in a blocklist (07).
2. **Injection-proof by construction.** One statement, lexed once; user values are only typed value-leaves
   / `$params`, never re-lexed or spliced. A payload can only ever be inert data (06). Quotes are *safer*,
   not riskier — they give values an unambiguous boundary.
3. **Zone-typing + T-ZONE invariant.** Every field is **opaque** (coordinate/metadata — safe pre-Gate in
   the untrusted index) or **semantic** (decrypted content — trusted, post-Gate only). No semantic field
   ever appears in an operator at or before the Gate (02).
4. **Fail-closed resolution + traversal typing.** Unknown field/collection/edge → REJECT (08); a `JOIN`'s
   endpoints, direction, and source/target collections must all match the declared signed edge (04).
5. **`JOIN`/`MATCH` = GATED** on the signed graph-spine — topology proves *reach*, the Gate proves
   *authorization*, and the index is never the authority (04).
6. **`REDACT` → a `.gate` `:cut`** that dominates egress (02, 04). Auth is the K3 Gate (a signed
   capability), never a query predicate.

The execution plan every query lowers to:

```
IndexScan(untrusted, opaque pushdown) → Gate(verify-before-decrypt + K3 ALLOW)
  → Filter(trusted, semantic residual) → Traverse(signed spine) → ANN(trusted)
  → Project + REDACT(:cut) → Order → Limit → Offset
```

## Verify these yourself

```
node Galerina-R-AND-D/tritmeshql/hypha-check.mjs  Galerina/docs/examples/hypha/*.hypha
```

Each file's `# expect: PASS|GATED|REJECT` header is checked; the run exits non-zero if any file's verdict
drifts. (Run the checker with no arguments to execute its own 51/51 self-test battery.)

## Reconciliation (owner-gated)

These examples use the **v2** grammar (RD-0243/0244). The dedicated repo `TritMesh-Query-Language` still
carries the **v0** reference grammar (`SELECT…WHERE…NEAR`) and its `05-conformance` is outline-only "after
the review checkpoint" — the checker here *is* that conformance reference, at v2. The owner decision
(adopt v2 into the repo grammar + land the checker as `05-conformance`, vs keep v0) is pending; see
`tritmeshql-hypha-reference-checker-and-redteam-2026-07-03.md` (RD-0246).
