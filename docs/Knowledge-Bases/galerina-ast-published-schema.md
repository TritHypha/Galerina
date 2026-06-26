# Galerina — Stable Published AST JSON Schema

## Overview

`galerina ast --json` emits a Galerina AST conforming to a published, versioned JSON Schema.
Every AI tool, embedding pipeline, IDE extension, static analyzer, formatter and linter
speaks one stable format. The compiler's internal IR remains free to evolve; only the
public AST schema is a compatibility contract.

---

## Why a Stable Public Schema

Without a published schema, every downstream tool must:

```text
parse Galerina source itself
depend on private compiler internals
scrape report output
use fragile regexes
build custom adapters
```

With a published schema, the ecosystem interoperates:

```text
AI tools          — reason from structure, not raw text
embedding pipelines — chunk by flow/API/compute block, not token window
IDE extensions    — symbols, hover, go-to-definition without a custom parser
security scanners — traverse effect/capability declarations semantically
migration tools   — transform source with source-mapped precision
documentation generators — extract types, flows, contracts from AST
```

---

## Schema Versioning

```json
{
  "$schema": "https://schemas.galerina.dev/ast/v1/schema.json",
  "schemaVersion": "1.0.0",
  "languageEdition": "2026.1",
  "files": []
}
```

Version rules:

```text
patch version: additive metadata only
minor version: backward-compatible node/field additions
major version: breaking shape changes
languageEdition: source-language compatibility
schemaVersion: JSON contract compatibility
```

Language evolution and JSON schema evolution are versioned separately.

---

## Every Node Has a Span

Every AST node must include:

```json
{
  "id": "node_abc123",
  "kind": "FlowDeclaration",
  "span": {
    "file": "api-orders.spore",
    "start": { "line": 10, "column": 1 },
    "end": { "line": 18, "column": 2 }
  }
}
```

Source spans are essential for IDEs and AI tools that need to jump from semantic fact to code.

---

## Node Design: Discriminated Unions

```json
{
  "kind": "FlowDeclaration",
  "name": "createOrder",
  "visibility": "public",
  "security": "secure",
  "parameters": [
    {
      "kind": "Parameter",
      "name": "input",
      "type": { "kind": "NamedType", "name": "CreateOrderRequest" }
    }
  ],
  "returnType": {
    "kind": "ResultType",
    "ok": { "kind": "NamedType", "name": "CreateOrderResponse" },
    "err": { "kind": "NamedType", "name": "ApiError" }
  },
  "effects": ["database.write", "payment.charge"],
  "body": []
}
```

Discriminated unions are easy for TypeScript, Python, Rust, Go and AI pipelines to consume.

---

## Stable Fields

The schema must define:

```text
schema version
language edition
source file path / module ID
node kind
node ID
source span
comments / trivia policy
imports
declarations
types
flows
parameters
return types
effects
capabilities
expressions
statements
API declarations
webhook declarations
compute blocks
security / policy declarations
diagnostic attachment points
```

---

## CLI Output Modes

```bash
galerina ast api-orders.spore --json
galerina ast src --json --out build/ast
galerina ast api-orders.spore --json --syntax-only
galerina ast api-orders.spore --json --resolved
galerina ast src --json --compact
galerina ast src --json --include-trivia
galerina schema ast --out schema/galerina-ast-v1.json
galerina ast api-orders.spore --json | galerina schema validate ast
```

| Mode | Description |
|---|---|
| `--syntax-only` | Parse-only AST, no resolution; available even with type errors |
| `--resolved` | Includes resolved symbol references; requires successful checking |
| `--include-trivia` | All comments and whitespace tokens |
| `--compact` | Omits trivia and non-essential metadata |

---

## Optional Resolved References

The `--resolved` mode adds resolved cross-references:

```json
{
  "kind": "CallExpression",
  "callee": {
    "text": "createOrder",
    "ref": "flow:orders.createOrder"
  }
}
```

`--syntax-only` omits all `ref` fields. Tools should not depend on `ref` being present
unless they request `--resolved`.

---

## Doc Comments

Doc comments are first-class:

```json
{
  "kind": "FlowDeclaration",
  "name": "createOrder",
  "doc": "Creates an order after payment validation."
}
```

Default: include doc comments on declarations.
`--include-trivia`: include all comments and whitespace.
`--compact`: omit all trivia.

---

## Public vs Internal Schema

The public AST schema is a tooling contract, not the compiler's internal IR.

```text
galerina ast --json           → stable public AST
galerina check --report-json  → stable diagnostics/type/effect reports
galerina graph --json         → stable project graph
galerina ir --debug           → unstable compiler-internal output
```

Internal representations (typed HIR, MIR, effect graph, borrow/lifetime graph, backend IR)
remain free to evolve without breaking tool consumers.

---

## AI Tool Benefits

A stable schema helps AI tools work from structure rather than raw text:

```text
better chunking          — by flow, type, API, effect boundary, compute block, test group
stable embeddings        — schema-stable node identity across commits
node-level references    — source-mapped explanations
safer code transforms    — verified against typed schema
schema-guided generation — constrain generation to valid AST shapes
less hallucinated parsing
dependency-aware retrieval
```

---

## Project Graph Integration

Identifiers connect the AST to other artefacts:

```json
{
  "symbolId": "flow:orders.createOrder",
  "nodeId": "node_abc123"
}
```

Graph reports and governance diffs can refer to AST nodes without ambiguity.

---

## Security and Privacy

AST output may contain sensitive source text. Rules:

```text
do not include secret values from runtime config
do not inline .env values
do not include resolved vault secret contents
redact protected literals if language supports secret literals
respect project privacy filters for AI context
```

The AST describes source code; it must not leak deployment secrets.

---

## Schema Publication

Publish alongside every language edition:

```text
JSON Schema definition
TypeScript types
Rust structs / schema-generated examples
Python dataclasses or Pydantic models
sample AST files
compatibility policy
migration guide
```

Suggested package name: `@galerina/ast-schema`

---

## Stability Policy

```text
stable node kinds cannot be renamed within a major schema version
required fields cannot be removed within a major schema version
new optional fields may be added in minor versions
unknown fields must be ignored by consumers
experimental nodes must be marked experimental
internal compiler-only nodes are not exposed by default
```

---

## Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-AST-001` | AST JSON emitted |
| `SPORE-AST-002` | Requested AST schema version is unsupported |
| `SPORE-AST-003` | Resolved AST unavailable due to type errors |
| `SPORE-AST-004` | AST schema validation failed |
| `SPORE-AST-005` | Unstable internal node requested in stable AST mode |
| `SPORE-AST-006` | Language edition requires newer AST schema |

---

## Relationship to Other Schemas

The AST schema is intentionally narrow:

```text
AST schema           — syntax / source structure
diagnostic schema    — errors / warnings / fixes
effect graph schema  — flow effects / capabilities
governance report    — policies / resources / security boundaries
build report schema  — artefacts / targets / source maps
```

The AST must not become an overloaded universal data blob. Each concern gets its own schema.

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `galerina-core` | Node kind definitions, span model, doc comment rules |
| `galerina-core-compiler` | AST generation, symbol resolution, `--syntax-only` / `--resolved` modes |
| `galerina-core-reports` | AST JSON schema, validation, emitter |
| `galerina-core-cli` | `galerina ast` command and mode flags |
| `galerina-devtools-project-graph` | Graph integration and symbol cross-references |
| `galerina-core-security` | Secret / privacy redaction rules for AST export |
| `@galerina/ast-schema` | Published schema package for consumer SDKs |
