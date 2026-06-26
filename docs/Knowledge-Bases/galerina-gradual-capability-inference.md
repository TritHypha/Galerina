# Galerina — Gradual Capability and Effect Inference

---

**Phase 13 — Architectural Proposal (suggestion)**
**Priority:** HIGH for developer experience
**Decision:** Infer effects, NOT capabilities. Developers think in `database.read`; infrastructure maps to `host.database.read`

---

## TL;DR

- During development, the compiler infers missing effect declarations and suggests them
- Production builds require explicit declarations — inference never silently grants authority
- Developers write code naturally; the compiler fills in the governance paperwork

---

## The Problem

Full explicit declaration creates friction at the point where a developer is simply trying to get something working.

Consider a developer writing a straightforward flow:

```galerina
flow getUser(id: UserId) -> User {
  let user = database.find(User, { id })
  audit.log("user.fetched", { id })
  return user
}
```

Without gradual inference, the compiler stops them immediately:

```
Error: Flow 'getUser' uses database.find() but declares no effects.
Error: Flow 'getUser' uses audit.log() but declares no effects.
Build failed.
```

The developer must now stop, consult the effect registry, map each operation to its required effect, and write:

```galerina
flow getUser(id: UserId) -> User
contract {
  effects {
    database.read
    audit.write
  }
}
{
  let user = database.find(User, { id })
  audit.log("user.fetched", { id })
  return user
}
```

This is the correct end state — but requiring it before the developer has even confirmed the logic works makes the language feel hostile. The declarations are governance paperwork, and governance paperwork should not block a developer from thinking through a flow body.

---

## Design Goal

The developer writes the flow body. The compiler does the detection work:

> "This flow uses `database.find()` — it needs effects `[database.read]`. Here is the suggested declaration."

This is a **suggested fix**, not a hard failure. The compiler acts as a knowledgeable colleague rather than a gatekeeper during development. The gatekeeper role is reserved for production builds, where it is appropriate.

---

## Three Compiler Modes

### 1. Development — `galerina dev` or `galerina check --infer-effects`

- Infers required effects from the flow body
- Emits suggestions, not errors
- Build continues; hot-reload proceeds
- Output example:

```
[suggest] flow 'getUser' is missing effect declarations.
  Inferred: database.read, audit.write
  Run: galerina fix --effects src/flows/getUser.ln
  Or add manually: contract { effects { database.read, audit.write } }
```

### 2. CI — `galerina check`

- Runs inference to identify what declarations are missing
- Emits warnings with suggested fixes
- Generates a governance report listing all inferred-but-undeclared effects across the codebase
- Does not fail the build by default, but governance policy can escalate warnings to errors via project config

```
[warn] 3 flow(s) have undeclared effects.
  getUser      — missing: database.read, audit.write
  listOrders   — missing: database.read
  sendReceipt  — missing: network.write
Governance report written to: .galerina/effect-report.json
```

### 3. Production — `galerina build --production`

- Strict mode: explicit declarations only
- Build fails on any missing declaration
- Inference does not run; there are no suggestions, only errors
- No authority is ever granted silently

```
Error: flow 'getUser' uses database.find() but declares no effects. [E_EFFECT_MISSING]
Error: flow 'getUser' uses audit.log() but declares no effects.    [E_EFFECT_MISSING]
Build failed. (2 errors)
```

---

## Inference Sources

The compiler maps operations to required effects using a built-in inference table. This table is extensible via `capability-registry.yaml`.

| Operation | Inferred Effect |
|---|---|
| `database.find()` | `database.read` |
| `database.save()` | `database.write` |
| `database.delete()` | `database.write` |
| `cache.get()` | `cache.read` |
| `cache.set()` | `cache.write` |
| `fs.read()` | `filesystem.read` |
| `fs.write()` | `filesystem.write` |
| `http.get()` | `network.read` |
| `http.post()` | `network.write` |
| `audit.log()` | `audit.write` |

Custom operations defined in library flows carry their own declared effects, which propagate to callers through the EffectGraph (see below).

---

## Effect Propagation

Inference works transitively. The compiler builds an **EffectGraph** within the SPORE-Graph and walks it to determine the complete effect footprint of any given flow.

If `dbQuery()` is declared with `effects [database.read]`, and `getUser()` calls `dbQuery()`, the compiler infers that `getUser()` also requires `database.read` — even if `getUser()` never directly calls a database operation itself.

```
EffectGraph:
  getUser
    → dbQuery          [declared: database.read]
    → audit.log()      [inferred: audit.write]

  Inferred for getUser: database.read, audit.write
```

This means inference is correct even through abstraction layers. A developer who extracts database logic into a helper flow does not lose governance traceability — the compiler follows the call graph.

---

## IDE Integration

The Galerina language server exposes inferred effect data to IDE tooling. A flow panel in the editor shows the current state of a flow's effect declarations at a glance:

```
Flow: getUser
  Declared:  none
  Inferred:  database.read, audit.write
  [Quick Fix: Add inferred effects]
```

Clicking "Quick Fix" inserts the `contract { effects { ... } }` block into the source file directly. The developer reviews, adjusts if needed, and commits. The IDE never silently modifies governance declarations without the developer seeing the change in their diff.

---

## `galerina fix --effects`

For developers who prefer to work in the terminal, the compiler can update source files directly:

```
galerina fix --effects src/flows/getUser.ln
```

The compiler parses the file, runs inference on each flow missing declarations, inserts a `contract { effects { ... } }` block at the correct position in the source, and writes the file. Output:

```
Updated: src/flows/getUser.ln
  getUser   — added: contract { effects { database.read, audit.write } }
```

The developer inspects the diff, commits the changes to source control, and the governance record is now explicit and permanent. All future builds — including production — will pass the effect check for that flow.

---

## Why Effects, Not Capabilities

Galerina separates two layers of concern:

- **Effects** (`database.read`, `network.write`) — what the flow does, expressed in terms a developer understands
- **Capabilities** (`host.database.read`, `host.network.write`) — what the infrastructure grants, expressed in terms the platform understands

Developers think in effects. The infrastructure thinks in capabilities. These are not the same thing, and conflating them forces developers to understand infrastructure topology before they can write application logic.

The compiler maps effects to capabilities through the **capability registry**. A developer declares `database.read`; the registry resolves that to `host.database.read` for the current deployment target. The developer never needs to know the host-level name.

This keeps Galerina learnable. A developer new to the codebase can read `contract { effects { database.read, audit.write } }` and understand exactly what the flow does. They do not need to understand the capability registry to read, write, or review application code.

---

## Governance Principle

Inference is developer convenience. It must never weaken governance.

The compiler may suggest declarations. It may never silently grant authority.

The distinction is precise: a suggestion that the developer ignores leaves the production build failing. A silent grant that the developer never sees means authority was exercised without review. Galerina only permits the former.

This principle holds at every layer:

- Inference surfaces undeclared effects; it does not patch them away
- `galerina fix --effects` writes to files the developer commits; it does not modify the compiled output invisibly
- The production build flag (`--production`) has no inference fallback; there is no override

---

## Rules at a Glance

| Mode | Missing declaration | Build result |
|---|---|---|
| `galerina dev` | Suggest + infer | Continues |
| `galerina check` | Warn + report | Continues (configurable) |
| `galerina build --production` | Error | Fails |

Inference runs in dev and CI modes only. Production mode is strict and explicit. Suggestions are always visible to the developer. Authority is never granted silently.

---

## See Also

- `capability-registry.yaml` — maps effects to host capabilities per deployment target
- `galerina-semantic-graph-system` — SPORE-Graph and EffectGraph architecture
- `effect-checker` — the compiler pass that validates declared effects against usage
- `galerina-roadmap` — Phase 13 and surrounding architectural proposals
