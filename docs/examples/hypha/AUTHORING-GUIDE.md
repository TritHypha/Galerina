# Authoring `.hypha` — TritMeshQL (v2)

A short guide to writing valid, injection-proof `.hypha` queries. Every rule here is **enforced by the reference
checker** (`hypha-check.mjs`) — if you break one, you get a REJECT with the reason, not a silent-wrong query. The
sibling of the `.gate` [AI-AUTHORING-GUIDE](../gate/AI-AUTHORING-GUIDE.md).

## Mental model

A `.hypha` query is **read-only** and **zone-typed**. Think of it as a small map that flows through one boundary — the
**Gate**:

- **Opaque** fields (coordinates, ids: `x`, `y`, `z`, `doc_id`, `UUID`, `visit_date`, …) are non-semantic. Predicates
  over them run **before** the Gate, in the untrusted coordinate index.
- **Semantic** fields (decrypted content: `label`, `ssn`, `Name`, `notes`, `embedding`, …) run **after** the Gate,
  in the trusted zone.

You never write the zones — the checker computes the split from the schema. Your job is just to write a well-formed
query; the split, the Gate, and egress redaction are structural.

## The shape (canonical clause order)

```hypha
RETURN   <field, …>            # or SELECT (alias). Bare identifiers only — never a quoted string.
FROM     <collection>          # the anchor / authorized root. Name it explicitly.
JOIN     <coll> ON [a]-(edge)->[b] AS <alias>    # optional, GATED — see below
FILTER:  [where <field> <op> <value>]            # zero or more; multiple lines = implicit AND
NEAREST  [<v1>, <v2>, …] K <n>                    # optional vector similarity (trusted zone)
ORDER BY <field> [ASC|DESC]                        # optional
REDACT   <field, …>                                # optional egress cut
LIMIT    <n>                                        # optional (non-negative integer)
OFFSET   <n>                                        # optional
```

A schema **metaquery** is a whole statement on its own: `SHOW FIELDS [OF <collection>]` · `DESCRIBE <collection>` ·
`LIST COLLECTIONS` · `LIST EDGES`.

## The `[where …]` drawing form

Predicates are drawn, `.gate`-style, as bracket nodes joined by arrows:

- One condition: `FILTER: [where x = 3]`
- `AND`: put it on multiple `FILTER:` lines (implicit AND), **or** draw it: `[where x = 3] -> [and] -> [where y = 1]`
- `OR`: draw it — `[where label = "report"] -> [or] -> [where label = "summary"]`
- Operators: `=` `<` `>` `<=` `>=`, plus `IN (a, b, …)` and `RANGE (lo, hi)`.
- Values are **typed leaves**: a number (`3`, `-1.5`), a quoted string (`"report"`), or a bound parameter (`$q`).

## Vocabulary (the exact tokens)

- **Verbs** (a statement must start with one): `RETURN`, `SELECT`, `SHOW`, `DESCRIBE`, `LIST`.
- **Clauses**: `FROM`, `JOIN … ON … AS`, `FILTER:`, `NEAREST` (`NEAR` accepted), `K`, `ORDER BY … ASC|DESC`,
  `REDACT`, `LIMIT`, `OFFSET`.
- **Predicate**: `[where …]`, `[and]`, `[or]`, operators `= < > <= >= IN RANGE`.
- **Metaquery**: `SHOW FIELDS`, `OF`, `DESCRIBE`, `LIST COLLECTIONS`, `LIST EDGES`.

## DO / DON'T (the hallucination guards)

| DON'T | DO | Why |
|---|---|---|
| a write verb (`INSERT`/`UPDATE`/`DELETE`/`DROP`) | only `RETURN`/`SELECT`/`SHOW`/`DESCRIBE`/`LIST` | `.hypha` is read-only; writes are a separate governed path |
| bare `WHERE x = 3` at top level | `FILTER: [where x = 3]` | v2 uses the drawing form (aligns with `.gate`) |
| build a query by string concatenation | write the literal; pass user input as `"…"` or `$param` | injection-proof by construction — a value can never become structure |
| quote a field name (`RETURN "label"`) | bare identifier (`RETURN label`) | identifiers resolve against the schema; only *values* may be strings |
| invent a field / collection / edge | use one that exists in the schema | unknown ⇒ REJECT (fail-closed) |
| expect a `JOIN` to run | know it returns **GATED** until the signed spine lands | topology proves reach, the Gate proves authorization |
| project a semantic field and assume it's safe | add `REDACT <field>` (or send only to a trusted destination) | semantic egress must be cut or trusted |
| two statements separated by `;` | one statement per file | single-statement lexer (kills stacked-query injection) |

## The verify loop

Author → run the checker → read the verdict → fix. Never hand-wave a query as "probably fine":

```
node Galerina-R-AND-D/tritmeshql/hypha-check.mjs  my-query.hypha
```

You get **PASS** (safe + shippable), **GATED** (safe syntax, blocked on the signed spine), or **REJECT** (with the
reason). The worked, checker-verified examples in this folder ([`01`](01-basic-projection-filter.hypha)–
[`08`](08-rejected-unknown-field.hypha)) are the templates — copy their shape.
