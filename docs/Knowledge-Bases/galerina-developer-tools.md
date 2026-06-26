# Galerina Developer Tools — LSP, Diagnostics-with-Fixes, Governance REPL

## Overview

Three closely related developer tooling features make Galerina's strictness helpful
rather than burdensome:

1. **LSP Implementation** — standard editor features plus Galerina-specific effect,
   capability, security-boundary and taint insights in any LSP-capable editor
2. **Diagnostics that emit fixes** — structured before/after patches alongside every
   compiler diagnostic; ranked repair strategies; never silently weakens security
3. **Governance-aware REPL** — interactive execution under the project manifest; effects,
   capabilities and boundary crossings displayed per expression; vault secrets governed
   by normal `ProtectedSecret<T>` rules; session audit report generated

---

## Part 1: Language Server Protocol (LSP)

### Standard LSP Features

The Galerina LSP provides all standard editor capabilities:

```text
autocomplete
hover types
go-to-definition
find references
inline diagnostics
semantic tokens
document symbols
workspace symbol search
formatting / range formatting
```

These require the parser and type checker to be accessible from the LSP without
duplicating compiler logic. The LSP calls a shared compiler analysis service.

### Galerina-Specific LSP Features

Because effects, capabilities, security boundaries and API contracts are declared in
source, the LSP can expose domain-specific insights unavailable in conventional languages.

**Effect hover** — on a flow declaration:

```text
Effects:
  database.write
  network.external

Requires:
  package permission: database.write
  production gate: external network policy
```

**Capability hints** — inline display:

```text
requires: secret.read
requires: network.external
```

**Boundary annotations** — for security-sensitive flows:

```text
Crosses boundary:
  public API -> database
  public API -> external payment provider
```

**Secret safety hover** — on a `SecureString` or `ProtectedSecret<T>`:

```text
SecureString
  cannot print
  cannot log
  cannot convert to String accidentally
  reveal requires approved secure context
```

**Taint/provenance display** — on a `Tainted<T>` value:

```text
Tainted<String>
Source: HTTP request body
Required before sink: sanitizer or validator
```

**Compute target hints** — for compute blocks:

```text
Target plan:
  preferred: GPU
  fallback: CPU
  verification: cpu_reference
```

**API contract navigation** — from a route declaration, go-to-definition jumps to:

```text
request type
response type
handler flow
error type
auth policy
```

### Diagnostics in the Editor

The LSP surfaces the same diagnostic family as the compiler:

```text
SPORE-TYPE-001            type mismatch
SPORE-EFFECT-001          undeclared effect
SPORE-CAP-001             missing capability
SPORE-SECURITY-001        secret leaked to log
SPORE-TAINT-001           tainted value reached sink
SPORE-SUPPLY-001          dependency content hash mismatch
SPORE-CRYPTO-001          runtime crypto algorithm selection forbidden
SPORE-MEMORY-SCOPE-001    request-scoped value escapes request
```

### Safe Quick Fixes

Good quick fixes:

```text
add missing effect declaration
wrap missing value in Option handling
convert thrown error path to Result
add match arm for exhaustive variant
import missing type
create stub flow
create request/response type
add sanitizer call
replace print(secret) with redact(secret)
pin dependency hash
```

Quick fixes must never silently weaken security. Bad quick fixes (never auto-apply):

```text
add unsafe permission automatically
disable crypto verification
allow tainted database query
turn off production gate
```

Security-relevant fixes must require explicit review.

### Editor Commands

```text
Galerina: Explain Diagnostic
Galerina: Show Flow Effects
Galerina: Show Capability Path
Galerina: Show Boundary Graph
Galerina: Show Affected Flows
Galerina: Generate AI Context
Galerina: Run Check
Galerina: Open Security Report
```

### 5-Stage Rollout

| Stage | Features |
|---|---|
| 1. Parser-backed | Parse-on-change, syntax errors, document symbols, basic completion, formatting |
| 2. Type-aware | Type hovers, go-to-definition, find references, type diagnostics, import resolution |
| 3. Effect/capability-aware | Effect hovers, missing effect diagnostics, capability requirements, permission quick fixes |
| 4. Security-aware | Secret diagnostics, taint diagnostics, crypto policy diagnostics, supply-chain warnings, request-scope escape warnings |
| 5. Project-aware | Workspace graph, affected flows, incremental checking, report previews, test selection hints, target plan previews |

### Performance Targets

```text
parse current file under 50ms for normal files
incremental diagnostics under 200ms where possible
workspace graph updates asynchronously
expensive security analysis debounced
large reports generated on demand
```

Do not block keystrokes on full-project analysis.

---

## Part 2: Diagnostics That Emit Fixes

### Three Levels of Help

Every diagnostic should include repair information at one or more of these levels:

**Level 1 — Explanation:**

```text
`order` was moved into `process(order)` and is no longer available.
```

**Level 2 — Repair strategy:**

```text
Borrow `order`, clone it, or move the audit call before the consuming call.
```

**Level 3 — Machine-applicable edit:**

```diff
- process(order)
+ process(order.clone())
```

Not every diagnostic can safely emit a Level 3 edit. Where multiple repairs are valid,
the compiler presents ranked options.

### Structured Diagnostic Format

Compiler diagnostics include structured JSON repair metadata:

```json
{
  "code": "SPORE-MEMORY-001",
  "message": "moved value used after move",
  "primary_span": "orders.spore:12:7",
  "related_spans": [
    { "span": "orders.spore:11:3", "label": "value moved here" }
  ],
  "fixes": [
    {
      "title": "Borrow order instead of moving it",
      "applicability": "machine-applicable",
      "edits": [
        { "file": "orders.spore", "range": "11:11-11:16", "replacement": "&order" }
      ]
    }
  ]
}
```

This powers CLI diffs, LSP quick fixes, editor code actions, AI-readable repair suggestions
and CI annotations.

### Applicability Classes

| Class | Meaning |
|---|---|
| `machine-applicable` | Compiler-proven safe edit; apply automatically |
| `maybe-applicable` | Likely safe, but context-dependent |
| `manual-review-required` | Changes authority or semantics; requires human review |
| `security-sensitive` | Widens security posture; must be reviewed |
| `not-auto-applicable` | Guidance only; no safe automatic edit exists |

Examples:

```text
add missing import          → machine-applicable
add missing match arm       → maybe-applicable
add database.write effect   → manual-review-required
allow unsafe/native binding → security-sensitive
rewrite ownership model     → not-auto-applicable
```

### Security-Sensitive Fixes

Some edits restore validity by weakening safety. These are never silent quick-fixes:

```text
add unsafe
add secret reveal
add network.external
add database.write
disable certificate verification
allow tainted query
promote request-scoped value globally
increase memory budget
permit native binding
```

Example display:

```text
Fix available:
  Add effect [database.write]

Review required:
  This widens the flow's authority and may affect production policy.

Better alternative:
  Move the database call into an existing flow that already has database.write.
```

### Fix Ranking

Multiple repair options are ranked by:

```text
least authority increase
least allocation
least semantic change
least code movement
preserves source intent
passes type/effect checks
```

### CLI Commands

```bash
galerina check --fix-preview      # preview all available fixes
galerina fix                       # apply all machine-applicable fixes
galerina fix --safe                # apply only machine-applicable fixes
galerina fix --review-security     # preview security-sensitive fixes
```

### Diagnostic Families: Example Fixes

| Diagnostic | Suggested fixes |
|---|---|
| `SPORE-MEMORY-001` moved value | borrow, clone, reorder |
| `SPORE-EFFECT-001` undeclared effect | add effect (review required), move call to allowed flow |
| `SPORE-TAINT-001` tainted sink | add sanitizer call |
| `SPORE-SECURITY-001` secret printed | replace with `redact(secret)` |
| `SPORE-ERROR-001` unhandled Result | add `?` propagation or `match` |
| `SPORE-MATCH-001` missing variant | add match arm |

---

## Part 3: Governance-Aware REPL

### Starting the REPL

```bash
galerina repl --pure                                               # pure flows only, no effects
galerina repl --profile local                                     # local profile
galerina repl --profile staging --capabilities database.read,orders.preview
```

The REPL loads at start:

```text
galerina.workspace.json
package-galerina.json
galerina.lock.json
environment profile
permission policy
secret source policy
route / flow graph
type / effect / capability graph
```

### Per-Expression Output

```galerina
> createOrder(sampleOrder)
Ok(CreateOrderResponse { id: "ord_123" })

Effects:
  database.write
  network.external

Capabilities:
  orders.create
  payments.authorise

Secrets:
  PAYMENT_API_KEY via vault

Target:
  cpu checked

Report:
  build/repl/session-2026-05-27/expr-004.json
```

### Capability Model

The REPL requires explicit session capabilities:

```galerina
> :capabilities
database.read
orders.preview
```

Attempting an unauthorised effect:

```galerina
> deleteOrder("ord_123")
Denied

Required:
  database.write
  orders.delete

Session has:
  database.read
  orders.preview
```

`--allow-all` is blocked in production profiles.

### Vault Secrets

Vault secrets flow through normal `ProtectedSecret<T>` rules:

```galerina
> secrets.get<ApiKey>("PAYMENT_API_KEY")
ProtectedSecret<ApiKey>(redacted)

Effects:
  secret.read

Source:
  vault

Reveal:
  denied in REPL display
```

The REPL never prints raw secret values.

### REPL Commands

```text
:help
:profile
:capabilities
:effects
:flow createOrder
:type <expression>
:explain last
:report last
:target last
:graph flowName
:secrets
:save-test "test name"
:reset
:history
:quit
```

### Session Audit

Every REPL session produces a report artefact:

```text
session ID
user / environment
profile
capabilities requested / granted
expressions evaluated
effects used per expression
secret references accessed
boundary crossings
runtime targets selected
errors / diagnostics
duration
report path
```

### REPL Modes

| Mode | Command | Restrictions |
|---|---|---|
| Pure | `--pure` | Pure flows only, no effects or secrets |
| Local governed | `--profile local` | Local profile, permitted effects |
| Staging | `--profile staging --capabilities ...` | Explicit capabilities, audited |
| Production | `--profile production` | Read-only by default, no secret reveal, audited, timeout required |

### Policy Failures

The REPL is designed for debugging policy failures:

```galerina
> sendInvoice(order)
Denied: SPORE-CAP-001

Missing capability:
  network.external

Flow requires:
  email.send
  network.external

Session has:
  email.preview

Suggested:
  restart REPL with `--capabilities email.send,network.external`
  or run `sendInvoicePreview(order)` if you only need preview mode.
```

### Test Generation

```galerina
> :save-test "creates order with paid item"
```

Saves the last call as a test fixture:

```galerina
test "creates order with paid item" {
  let result = createOrder(sampleOrder)
  expect(result).isOk()
}
```

### REPL Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-REPL-001` | Capability not granted for session |
| `SPORE-REPL-002` | Secret reveal denied in REPL |
| `SPORE-REPL-003` | Production profile requires audited session |
| `SPORE-REPL-004` | Destructive effect requires confirmation |
| `SPORE-REPL-005` | Project manifest could not be loaded |
| `SPORE-REPL-006` | Flow cannot be evaluated because module is invalid |
| `SPORE-REPL-007` | Target fallback occurred during REPL execution |
| `SPORE-REPL-008` | Expression exceeded REPL resource limit |

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `galerina-core` | Language syntax, AST, type/effect semantics, diagnostic codes |
| `galerina-core-compiler` | Parser, checker, diagnostics, source maps, incremental analysis API, fix generation |
| `galerina-core-cli` | LSP entrypoint, `galerina fix` command, `galerina repl` command |
| `galerina-core-runtime` | Governed expression execution, effect dispatch, REPL runtime |
| `galerina-core-security` | Capability checks, secret redaction, reveal policy |
| `galerina-core-config` | Profile/environment loading, production gates |
| `galerina-core-reports` | Diagnostic schema, REPL session reports, expression evidence |
| `galerina-devtools-project-graph` | Workspace graph, symbol graph, AI-readable context |
| `galerina-framework-app-kernel` | Optional request/API context simulation in REPL |
