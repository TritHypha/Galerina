# Galerina — AI Semantic Graph Output (--emit-ai-graph)

**Status:** Phase 13A — Implementation target
**Depends on:** [galerina-semantic-graph-system](galerina-semantic-graph-system.md), SPORE-Graph, `galerina-core-compiler`

---

## TL;DR

- AI should consume resolved program meaning, not raw source text
- `galerina check --emit-ai-graph` emits `build/semantic/galerina.ai.json` with all compiler knowledge
- Dramatically reduces LLM hallucinations by providing verified types, effects, capabilities, and governance

---

## Problem

When an AI assistant reads a Galerina codebase without a semantic graph, it must:

- Open and read dozens of source files
- Infer type relationships from syntax patterns
- Guess which effects a flow transitively requires by tracing calls manually
- Reconstruct governance rules from comments and convention
- Approximate capability requirements from naming and context

This process is slow, incomplete, and produces hallucinations. The AI may confidently generate code that calls a flow without the required effects declared, passes a `protected Email` to a logging function, or ignores a trust boundary entirely.

None of these mistakes are the AI's fault. The information it needs is not presented to it in a form it can reliably consume. The compiler has already resolved all of this. The AI is not given access to the compiler's conclusions.

---

## Core Principle: Program Meaning, Not Program Text

The compiler knows the program completely. After a full compilation pipeline, the compiler holds:

- Every resolved type, including all aliases unwound
- Every effect set per flow, including transitive propagation
- Every capability requirement, including those inherited from callees
- Every governance rule and which nodes they apply to
- Every trust boundary and what may cross it
- Every value-state annotation and where state transitions occur
- Every diagnostic currently active in the program

An AI assistant needs this knowledge, not the raw source. The source is how a human writes the program. The semantic graph is what the program means. Those are different things, and the AI should reason on meaning.

`--emit-ai-graph` exports the compiler's complete resolved knowledge into a single structured file designed for AI consumption.

---

## What Is an AI Semantic Graph

The AI semantic graph is generated after the full compiler pipeline has run — after lexing, parsing, AST construction, type checking, effect checking, capability resolution, governance verification, and diagnostic collection.

It is not a snapshot of syntax. It is a snapshot of resolved program meaning: every relationship the compiler has established, every inference it has made, every constraint it has verified.

The graph is structured around flows, functions, types, effects, capabilities, and governance rules as nodes, with edges encoding relationships: calls, returns, requires, crosses-boundary, owns, declares.

A tool that reads `galerina.ai.json` understands the program as well as the compiler does, within the limits of what can be serialised.

---

## Compiler Command

```bash
galerina check --emit-ai-graph
```

Emits: `build/semantic/galerina.ai.json`

The flag runs after the standard type check and effect check passes. No additional source compilation is required. If the program has errors, the graph is still emitted with the diagnostics section populated — AI tools can read the graph to understand and explain errors.

To emit both the standard semantic graph and the AI graph in one pass:

```bash
galerina check --emit-semantic-graph --emit-ai-graph
```

---

## Example: Source and AI Graph Output

### Source (users.spore)

```galerina
intent UserLookup {
    description "Retrieve a verified user record by identifier"
    sensitivity internal
}

secure flow getUser(id: UserId, ctx: RequestContext)
    -> GetUserResult
intent UserLookup
effects [database.read]
capabilities [users.read]
context.requires [trace_id, actor_id]
privacy {
    handles [protected Email, protected UserId]
    redact before audit.write
}
contract {
  types {
    type GetUserResult = Result<UserRecord, UserError>
  }
}
{
    let row = db.query(Users, id) ?
    let user: UserRecord = Users.fromRow(row) ?
    return Ok(user)
}
```

### galerina.ai.json (excerpt)

```json
{
  "schema": "galerina.ai.graph.v1",
  "generatedAt": "2026-05-30T10:00:00Z",
  "compilerVersion": "0.13.0-alpha",
  "flows": [
    {
      "id": "flow:users.getUser",
      "displayName": "getUser",
      "intent": {
        "name": "UserLookup",
        "description": "Retrieve a verified user record by identifier",
        "sensitivity": "internal"
      },
      "parameters": [
        { "name": "id", "type": "UserId", "resolvedType": "users.UserId", "valueState": "UNVALIDATED" },
        { "name": "ctx", "type": "RequestContext", "resolvedType": "runtime.RequestContext" }
      ],
      "returns": {
        "type": "Result<UserRecord, UserError>",
        "resolvedOk": "users.UserRecord",
        "resolvedErr": "users.UserError"
      },
      "effects": {
        "direct": ["database.read"],
        "transitive": ["database.read"]
      },
      "capabilities": {
        "required": ["users.read"],
        "transitive": ["users.read"]
      },
      "context": {
        "requires": ["trace_id", "actor_id"]
      },
      "privacy": {
        "handles": ["protected Email", "protected UserId"],
        "policy": "redact before audit.write"
      },
      "governance": {
        "trustLevel": "internal",
        "boundaryMembership": ["users-service"],
        "auditRequired": false
      },
      "calls": ["flow:db.query", "fn:Users.fromRow"],
      "valueStateTransitions": [
        { "parameter": "id", "from": "UNVALIDATED", "to": "VALIDATED", "at": "db.query" }
      ],
      "diagnostics": [],
      "source": { "file": "users.spore", "startLine": 8, "endLine": 18 }
    }
  ],
  "types": [
    {
      "id": "type:users.UserRecord",
      "fields": [
        { "name": "id", "type": "UserId" },
        { "name": "email", "type": "Email", "valueState": "protected" },
        { "name": "createdAt", "type": "Timestamp" }
      ],
      "source": { "file": "users.spore", "startLine": 1 }
    }
  ],
  "diagnostics": []
}
```

---

## Information Included in galerina.ai.json

### Types

Every type in the program, fully resolved. No aliases left unresolved. Generic instantiations expanded. Value-state annotations included per field.

### Effects

Effect sets per flow, with two views: direct (what the flow itself declares) and transitive (everything reachable through calls). AI tools should use the transitive view when reasoning about callers.

### Capabilities

Capability requirements per flow, direct and transitive. Includes the source of each capability requirement — which flow in the call chain introduces it.

### Governance

Trust level per flow, trust boundary membership, whether audit is required, privacy policies, and which governance rules apply to each node.

### Value-State

Where values transition through states — from UNVALIDATED to VALIDATED to PROTECTED to REDACTED. The graph records at which call site each transition occurs.

### Intent

The declared intent for each flow or module, including description and sensitivity level. This is the human-authored statement of purpose, compiler-linked to the implementation.

### Diagnostics

All active diagnostics for the current program state — type errors, effect violations, governance failures, capability mismatches — each linked to the graph node they apply to.

### Source Spans

Every graph node carries a source span: file, start line, end line. AI tools can anchor back to source when presenting results to a developer.

---

## Benefits

### Better Code Generation

When an AI generates a new flow that calls `getUser`, it reads from the graph that `getUser` requires `database.read` and `users.read`. It does not guess. It generates the correct effects and capabilities for the caller automatically. No effect guessing. No missing capability declarations.

### Better Refactoring

All callers of a flow are already in the graph as incoming `calls` edges. When an AI is asked to rename `getUser` or change its signature, it does not need to search source files — it queries the graph for all callers and updates them precisely.

### Better Governance Analysis

Governance questions become graph traversals. "Can a `protected Email` value reach the `network.send` effect in this flow?" is a path query from the privacy node to the effect node. The AI does not need to read and reason about multiple files — the graph encodes the answer.

### Better Security Auditing

Trust boundaries, capability requirements, value-state transitions, and privacy policies are all first-class nodes and edges in the graph. A security review tool reads the graph, not source files, and produces accurate findings anchored to source spans.

---

## Relationship to SPORE-Graph

The AI semantic graph is one export format derived from the SemanticGraph built by SPORE-Graph. The pipeline is:

```
Source
  → Compiler Pipeline
    → SemanticGraph (SPORE-Graph)     ← canonical shared semantic model
      → --emit-semantic-graph       → build/semantic/semantic-graph.json
      → --emit-ai-graph             → build/semantic/galerina.ai.json
```

`galerina.ai.json` is not a separate model. It is a shaped export of the same SemanticGraph, enriched with intent metadata and formatted for AI consumption. There is one source of truth: the SemanticGraph. The AI graph is a view over it.

---

## Relationship to Self-Hosting

When the Stage B self-hosting compiler processes its own source, it builds a SemanticGraph of itself. Running `--emit-ai-graph` on the compiler produces a graph of the compiler — its own passes as flow nodes, its own type checker as a typed module, its own effect checker's effects declared and verified.

The self-hosting compiler is self-describing. An AI assistant working on the compiler reads the compiler's own AI graph and reasons about compiler internals with the same accuracy it reasons about any other Galerina program.

One model. No special cases for the compiler itself.

---

## IDE Integration

IDEs consume `galerina.ai.json` to provide:

- **Effect chain display** — show every effect a flow transitively requires, as a collapsible tree
- **Capability chain display** — show every capability required, with the callee that introduces each
- **Trust boundary overlay** — highlight code that crosses a trust boundary
- **Callers panel** — list all flows that call the currently selected flow, from graph edges
- **Value-state timeline** — show how a value's state changes from parameter to return

The IDE does not re-parse or re-type-check for any of these views. It queries the graph.

---

## Future Extensions

### Semantic Graph Hash

A stable hash of the AI graph for a given compilation, allowing CI to detect when the program's semantic structure changes — not just its source. A governance diff between two graph hashes is more meaningful than a source diff.

### Change Graphs

A differential graph export: only the nodes and edges that changed between two compilations. AI tools can receive targeted updates rather than re-loading the entire graph on every edit.

### Governance Proofs

A structured export of governance proof chains — the sequence of compiler decisions that establish a given governance property. AI tools can present these proofs to auditors in plain language.

---

## What It Is NOT

- Not an AST. The AST records source structure; the AI graph records resolved meaning. These are different things.
- Not a syntax dump. There is no unparsed source text in `galerina.ai.json`.
- Not documentation. The graph is machine-generated from compiler truth, not hand-authored.
- Not a replacement for source files. Developers write in source; the graph is a derived artifact.
- Not speculative. Every entry in the graph has been verified by the compiler. There are no inferences or guesses in the output.

---

## Rules at a Glance

| Rule | Detail |
|---|---|
| One command | `galerina check --emit-ai-graph` — no separate tooling required |
| Output location | Always `build/semantic/galerina.ai.json` |
| Generated after full pipeline | Types, effects, and governance are resolved before export |
| Emitted even with errors | Diagnostics section is populated; graph is still useful |
| Anchored to source | Every node carries a file and line reference |
| Transitive views included | AI tools receive direct and transitive effects and capabilities |
| One source of truth | AI graph is a view over the SemanticGraph — no separate model |
| Not speculative | Every entry is compiler-verified, not inferred from syntax |

---

## See Also

- [galerina-semantic-graph-system](galerina-semantic-graph-system.md) — SemanticGraph architecture and SPORE-Graph integration
- [galerina-intent-graph](galerina-intent-graph.md) — intent declaration and IntentGraph
- [galerina-compiler-pipeline](galerina-compiler-pipeline.md) — full compiler phase sequence
- [galerina-ide-tooling](galerina-ide-tooling.md) — how IDEs consume the AI graph
- [galerina-governance-architecture](galerina-governance-architecture.md) — governance model
- [capabilities](capabilities.md) — authoritative capability definitions
- [value-state-checker](value-state-checker.md) — value-state annotation rules
