# Galerina — Excellent IDE Tooling

**Status:** Phase 13/14 — Design specification
**Depends on:** [galerina-semantic-graph-system](galerina-semantic-graph-system.md), [galerina-ai-semantic-graph-output](galerina-ai-semantic-graph-output.md), `galerina-lsp`

---

## TL;DR

- Full Language Server Protocol (LSP) implementation for VS Code, JetBrains, Neovim, Cursor, and Windsurf
- Governance-aware diagnostics: not just "type mismatch" but "protected Email cannot be returned — use redact(email)"
- Value-state badges in editor: UNVALIDATED → PROTECTED → REDACTED inline as code is written

---

## Core Philosophy

Most language IDEs help developers write code. The Galerina IDE helps developers understand consequences.

When a developer writes a flow, they should immediately see — without running the compiler manually, without reading documentation, without asking a colleague — what effects that flow will have, what capabilities it requires, what trust boundaries it crosses, and what governance rules govern it.

The IDE is a real-time governance assistant. Every hover, every diagnostic, every autocomplete suggestion carries semantic meaning. The IDE does not merely report syntax problems. It continuously presents the full governance picture as code is written.

This is only possible because the compiler's full resolution is available as a queryable SemanticGraph. The IDE does not re-implement type checking or effect resolution. It queries the graph the compiler built.

---

## LSP Support

The `galerina-lsp` language server implements the Language Server Protocol and targets:

| Editor | Delivery |
|---|---|
| VS Code | Official `galerina` extension (VS Code Marketplace) |
| JetBrains (IntelliJ, GoLand, WebStorm, etc.) | Official plugin (JetBrains Marketplace) |
| Neovim | `nvim-lspconfig` entry, published configuration |
| Cursor | Uses VS Code extension directly |
| Windsurf | Uses VS Code extension directly |

The LSP server is a single binary (`galerina-lsp`) that all editors connect to. Editor-specific extensions handle installation and startup; the semantic features are implemented once in the server.

---

## Syntax Highlighting

The Galerina TextMate grammar and Treesitter grammar cover:

| Category | Examples |
|---|---|
| Keywords | `flow`, `fn`, `secure`, `intent`, `effects`, `capabilities`, `contract`, `context`, `privacy` |
| Types | Resolved type names, generic parameters, type aliases |
| Effects | `database.read`, `network.send`, `filesystem.write` — highlighted distinctly from types |
| Contracts | `contract.types`, `contract.effects`, `contract.events` — section headers |
| Events | `emits`, event names |
| Value-state qualifiers | `UNVALIDATED`, `VALIDATED`, `PROTECTED`, `REDACTED` — distinct colour class |
| Trust keywords | `secure`, `trusted`, `untrusted`, `boundary` |
| Governance | `audit`, `privacy`, `redact`, `policy` |

Value-state qualifiers use a dedicated colour that is consistent across all supported themes. A developer can see at a glance which values are in which state without reading the full annotation.

---

## Intelligent Auto-Completion

### Contract Section Names

When a developer begins writing a `contract` block, the IDE offers completions for all valid section names, with documentation:

```
contract {
    [TAB]
    ↓
    types      — type aliases for this flow's inputs and outputs
    effects    — effects this flow is permitted to use
    events     — events this flow may emit
    privacy    — privacy policy for sensitive data
    timeouts   — network and operation timeout constraints
    retries    — retry policy for network operations
}
```

### Effect Names

Inside an `effects` declaration, the IDE completes from the authoritative capability registry. Only effects valid for this flow's trust level and boundary are offered. Effects already declared are excluded.

### Privacy Patterns

Inside a `privacy` block, the IDE offers completions for common patterns:

```
privacy {
    [TAB]
    ↓
    handles [protected Email]
    redact before audit.write
    require redaction before network.send
}
```

### Context Keys

Inside `context.requires`, the IDE completes from the set of context keys defined in the project's runtime configuration.

### Capability Names

Inside `capabilities`, the IDE completes from the capability registry, filtered to capabilities available at this trust level. Capabilities the calling scope does not hold are shown with a warning marker.

---

## Contract Awareness

The IDE tracks contract declarations in real time. If a flow body uses an effect that is not declared in the flow's contract, the IDE warns before compilation:

```galerina
flow processPayment(input: PaymentRequest) -> Result<PaymentResult, PaymentError>
effects [database.read] {          // ← only database.read declared
    charge(input.card, input.amount)    // ← uses payment.charge (undeclared)
    // ⚠ SPORE-EFFECT-002: flow uses effect payment.charge not declared in contract
    //   Add payment.charge to effects, or remove this call.
}
```

The warning appears as the developer writes the call site, not at compile time. This prevents the common pattern of writing code first and discovering governance problems only at the end of a build.

---

## Governance-Aware Diagnostics

Galerina diagnostics follow a consistent format:

```
[What failed]
[Why it matters]
[Suggested fix with code]
```

### Example: Protected value returned without redaction

```
SPORE-PRIVACY-003

What:   protected Email cannot be returned from a flow with public trust boundary.
Why:    Returning protected values across a public boundary exposes personal data
        to untrusted callers without a redaction gate.
Fix:    Redact the email before returning, or restrict this flow to internal boundary.

  Before:  return Ok(UserRecord { email: user.email, ... })
  After:   return Ok(UserRecord { email: redact(user.email), ... })
```

### Example: Effect not declared

```
SPORE-EFFECT-002

What:   Call to db.query uses effect database.read, which is not declared in this flow's contract.
Why:    Undeclared effects bypass the governance model. All effects must be declared so callers
        can reason about what this flow will do before calling it.
Fix:    Add database.read to this flow's effects declaration.

  Before:  effects [network.send]
  After:   effects [network.send, database.read]
```

### Example: Missing capability

```
SPORE-CAPABILITY-003

What:   This flow calls createOrder, which requires capability orders.create.
        orders.create is not declared in this flow's capabilities.
Why:    Capability requirements propagate to callers. The runtime will refuse to execute
        this flow without the capability being granted.
Fix:    Declare the capability in this flow's contract.

  Before:  capabilities [users.read]
  After:   capabilities [users.read, orders.create]
```

The what/why/fix format is consistent across all governance diagnostic codes. Developers learn the governance model by reading diagnostics, not by reading separate documentation.

---

## Security Visualisation: Value-State Badges

As a value moves through a flow, the IDE displays its current state as an inline badge or annotation:

```galerina
flow handleRegistration(input: RegistrationRequest) -> Result<UserId, RegistrationError>
effects [database.write]
capabilities [users.create] {

    let email = input.email           // [UNVALIDATED]
    let email = validate(email) ?     // [VALIDATED]
    let email = protect(email)        // [PROTECTED]

    db.insert(Users, { email: email })

    let audit_email = redact(email)   // [REDACTED]
    audit.write({ email: audit_email })

    return Ok(newUserId)
}
```

The badge colour follows a consistent scheme across themes: red for UNVALIDATED, amber for VALIDATED, blue for PROTECTED, green for REDACTED. A developer scanning the flow can verify the value-state lifecycle without reading every line.

If a protected value reaches a sink that requires REDACTED state, the IDE marks the transition point with a warning before compilation:

```
⚠ SPORE-PRIVACY-005: protected Email passed to audit.write — redact() required first.
```

---

## Effect Tracking Visual

The IDE shows an effect tree for the currently focused flow. This panel is available in VS Code as a sidebar view and in other editors as a hover detail:

```
getUser  →  effects
├── database.read          [direct]
│   └── declared in: effects [database.read]
└── (no transitive additions)

processPayment  →  effects
├── database.write         [direct]
├── payment.charge         [direct]
│   └── via: charge() at line 14
└── network.external       [transitive]
    └── via: charge() → paymentGateway.send()
```

This view answers the question "what will this flow actually do?" immediately, without reading callee implementations.

---

## galerina explain Command

```bash
galerina explain getUser
galerina explain processPayment --detail effects
galerina explain users.spore
```

The `explain` command produces a plain-language summary of a flow, module, or file:

```
flow: getUser

What it does:
  Retrieves a verified user record by identifier from the database.

What it is allowed to do:
  - Read from the database (database.read)
  - Access the users.read capability

What it is NOT allowed to do:
  - Write to the database
  - Send network requests
  - Access the filesystem
  - Read secrets

Privacy:
  Handles protected Email and protected UserId.
  Both are redacted before any audit write.

Governance:
  Trust level: internal
  Audit required: no
  Boundary: users-service
```

The `explain` output is generated from the SemanticGraph, not from source comments. It is always accurate to what the compiler has verified.

---

## Semantic Graph Visualisation

For large projects, the IDE provides a graph view backed by the AI semantic graph. Queries available in the panel:

```
Find all flows that use: database.write
Find all callers of:     getUser
Find all flows that handle: protected Email
Find all flows crossing: users-service → billing-service boundary
Shortest path from:      handleRegistration → stripe.charge
```

Each result is a list of nodes with source anchors — clicking navigates directly to the relevant line. This replaces manual `grep`-based navigation for governance and architectural questions.

---

## Runtime Plan Visualisation

In Phase 13, the IDE will display the governance-resolved runtime plan for the selected target. For a flow decorated with a target declaration, the IDE shows:

```
Selected target:   aws.lambda.arm64
Governance result: PASS — all effects permitted on this target
Audit required:    YES — payment.charge on external target requires audit
Estimated cold start: ~180ms
```

The developer sees deployment consequences without running `galerina plan` manually. The plan is computed from the SemanticGraph and the project's target configuration.

---

## AI-Assisted Development

When an AI assistant (Cursor, Windsurf, GitHub Copilot, or similar) is active in the editor, the IDE contributes the AI semantic graph as structured context:

- The assistant receives `galerina.ai.json` for the current project
- It knows the exact effects, capabilities, and governance rules for every flow
- It does not guess at types or effect sets — it reads compiler-verified answers
- It generates code that already has correct contract declarations
- It explains governance errors using the same what/why/fix format as the IDE

The IDE is the delivery mechanism. The AI graph is the context. Together, an AI assistant working in a Galerina project generates code that passes governance checks on the first attempt, not after multiple correction cycles.

---

## Excellent Error Messages

Galerina error messages are designed with the same care as Rust and Elm. Every error message answers four questions:

1. **What failed** — the specific rule that was violated
2. **Why it matters** — the governance or safety reason this rule exists
3. **Where it failed** — file, line, and the relevant code span highlighted
4. **What to do** — a specific suggested fix, shown as a before/after diff

Error messages never say "operation not permitted" or "invalid declaration". They say what specifically was not permitted, why that rule exists, and how to satisfy it.

### Example: Missing context requirement

```
SPORE-CONTEXT-001  users.spore:24

What:   getUser requires context key trace_id, but the calling flow does not pass it.
Why:    Distributed tracing requires trace_id to be propagated on every call. Without it,
        requests cannot be correlated across service boundaries.
Where:  let result = getUser(id, ctx)
                     ^^^^^^^^^^^^^^^^^
Fix:    Ensure ctx carries trace_id, or add trace_id to the calling flow's
        context.provides declaration.

  context.provides [trace_id, actor_id]
```

---

## Project-Wide Search

```bash
galerina find effect database.write
galerina find capability payment.charge
galerina find protected Email
galerina find intent UserLookup
galerina find boundary users-service
```

These commands query the SemanticGraph directly. Results include file, line, and the node that matched. No source file scanning is needed. The graph is the index.

IDE integration surfaces these as a search panel — developers type a query, results appear immediately from the cached graph.

---

## Refactoring Support

The IDE provides governance-safe refactoring operations:

| Operation | Behaviour |
|---|---|
| Rename flow | Updates all callers (from graph edges), all contract references, all test file references |
| Rename type | Updates all fields, parameters, return types that use it |
| Rename event | Updates all `emits` declarations and all event handler registrations |
| Change effect declaration | Validates that all callers still satisfy requirements after the change |
| Move flow between modules | Verifies that the destination module's trust level permits the flow's effects |

All refactors are validated against the SemanticGraph before they are applied. A rename that would violate a governance rule is rejected with an explanation, not silently applied.

---

## Deterministic Build Display

During development, the IDE sidebar displays the deterministic hashes for the current compilation:

```
Semantic hash:   a3f9c2...  (unchanged)
AST hash:        b7e100...  (changed — 2 files)
Plan hash:       c1d420...  (unchanged)
Proof hash:      d8a311...  (unchanged — governance unaffected)
```

A developer can see immediately whether a code change affected program semantics, whether the governance proofs are still valid, and whether the deployment plan will change. This information requires no separate command — it is continuously updated as code is saved.

---

## Long-Term Vision

Most language tooling helps developers write software. It autocompletes syntax, spots type errors, and flags unused variables.

Galerina IDE tooling helps developers understand consequences. It shows what a flow will do, what it will not do, what data it touches, what authority it requires, and what governance it must satisfy — before the code is deployed, before a security review, before an audit.

The goal is that a developer looking at any flow in any Galerina project can answer the question "what will this actually do, and is it safe?" in under ten seconds, without reading anything other than what the IDE shows them.

---

## Rules at a Glance

| Rule | Detail |
|---|---|
| IDE queries the graph | All semantic features query SemanticGraph — no re-parsing at query time |
| Diagnostics are governance-aware | What/why/fix format for every diagnostic |
| Value-state is always visible | Inline badges as code is written |
| Effect tree is always available | Hover or sidebar panel for any flow |
| Refactors are validated | Graph edges verified before any rename or move |
| AI context is automatic | AI semantic graph contributed to assistants without manual steps |
| galerina explain is always accurate | Generated from compiler truth, not from comments |
| Error messages have four parts | What, why, where, fix — every time |

---

## See Also

- [galerina-semantic-graph-system](galerina-semantic-graph-system.md) — SemanticGraph architecture
- [galerina-ai-semantic-graph-output](galerina-ai-semantic-graph-output.md) — AI graph export (galerina.ai.json)
- [galerina-one-click-governance-fixes](galerina-one-click-governance-fixes.md) — quick fix implementations
- [galerina-developer-tools](galerina-developer-tools.md) — developer tooling overview
- [galerina-developer-tooling-advanced](galerina-developer-tooling-advanced.md) — test generation and signatures
- [compiler-diagnostics](compiler-diagnostics.md) — full diagnostic code reference
- [value-state-checker](value-state-checker.md) — value-state rules and transitions
- [galerina-governance-architecture](galerina-governance-architecture.md) — governance model
