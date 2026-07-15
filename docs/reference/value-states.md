# Reference — value-states (the boundary-data lattice)

The states a value carries as it moves from an untrusted boundary to a governed sink, and the qualifiers that mark
its sensitivity. This is the detail page behind the "Value-states" row in
[contract-authoring-model.md](../contract-authoring-model.md). Value-states are **Table 2 (auto-derived / tracked)**:
the checker propagates them from the boundary; your levers are the recognised **gate** and **declassifier** calls.

**Source of truth:** `packages-galerina/galerina-core-compiler/src/value-state-checker.ts` (`ValueStateFlags`,
`SINK_REQUIREMENTS`, `PassportStage`); canonical sink registry `stdlib-gates.yaml §sinks`. **Verified against source
2026-07-15.** Two elements beyond the overview table are documented here: the **`ReadOnly`** flag and the **Passport
typestate** (Raw → Verified → Authorized → Sealed).

---

## A. How value-states work (the shared slots)

- **What (in general)** — a binding carries flags on **two independent axes** that may both apply at once:
  **trust** (how validated the data is) and **sensitivity** (a privacy qualifier). The checker assigns flags during
  binding analysis and enforces them at **sink** sites.
- **Where — authored** — mostly *not* written: `Unsafe` comes from boundary input (`request.body`/`params`);
  `unsafe let raw` marks untrusted input explicitly; qualifiers (`protected`, `redacted`, `SecureString`) are
  declared on params/types. State changes happen by **calling a gate**, not by annotation.
- **Where — enforced** — `value-state-checker.ts`, after the parser and before the effect checker. Governed sinks
  declare a **required state** (`SINK_REQUIREMENTS`); a value that does not satisfy it is a violation.
- **How — gates (the only upgrade path)** — an `Unsafe` value reaches `Safe` **only** through a recognised gate
  function; user-defined functions whose names start `validate*` / `sanitize*` / `check*` / `verify*` / `parse*` /
  `decode*` break the taint chain exactly like stdlib gates. Taint propagates through non-gate expressions
  (including two hops), and an unsafe value used as an `if`-condition does **not** clear taint — it propagates into
  **both** branches (cross-conditional).
- **How — the only declassifier** — `seal()` / `encrypt()` is the only way to lower a `Secret`; `redact()` is the
  Protected→Redacted step required before an audit sink.
- **If omitted** — a value with no gate stays `Unsafe`/`Tainted` and **cannot reach a governed sink** — fail-closed.
  There is no "assume validated."
- **Result — guarantee** — untrusted boundary data cannot cross a governed sink (DB write, network egress, shell,
  audit log, response body) without passing the gate the sink requires; secrets cannot be logged, compared, or
  serialised. Enforced structurally, at compile time.

### Governed sinks and the state each requires

| Sink | Required state | Why |
|---|---|---|
| `database.write`, `*DB.*`, `network.outbound`, `http(s).post/put/patch/delete`, `ai.remoteInference`, `shell.exec`, `*Payment.charge`, `EmailService.send` | **validated** | mutations / egress / injection-prone sinks need explicitly-checked data |
| `response.body`, `FileSystem.write`, `fs.write*`, `File.write*` | **safe** | must be gated, not necessarily deep-validated |
| `AuditLog.write`, `log.write`, `audit.*` | **redacted** | logs must not contain raw PII or secrets |

*(Matching is case-insensitive and covers both effect-style and module-style spellings, so `Shell.exec` is governed
identically to `shell.exec` — a fail-open that was closed in RD-0234.)*

---

## B. The trust axis

#### `Unsafe`
**What** — untrusted boundary input (`request.body`, `params`, or an explicit `unsafe let raw`). The deny-by-default
starting state for anything that entered from outside.
**Result** — cannot reach a governed sink (`FUNGI-VALUESTATE-003`) and cannot become `Safe` except through a
recognised gate (`FUNGI-VALUESTATE-001`; a gate on only one branch of an `if`/`else` is `FUNGI-VALUESTATE-002`).

#### `Safe`
**What** — a value that has passed a recognised gate. The baseline "may cross a sink that asks for safe" state.
**Reached by** — a gate call (`validate*`/`sanitize*`/`check*`/`verify*`/`parse*`/`decode*`, or a stdlib gate).
**Result** — satisfies `safe`-tier sinks (`response.body`, filesystem writes); still below `validated`.

#### `Validated`
**What** — an explicitly-validated value; a **subset of `Safe`**. The state the high-consequence sinks demand.
**Reached by** — a validating gate.
**Result** — required by `database.write`, `network.outbound`, `shell.exec`, `*Payment.*`, HTTP write methods, and
AI calls. Below it, those sinks reject.

#### `Tainted`
**What** — a value **derived from `Unsafe`** through a non-gate expression (concatenation, interpolation, a
transform that is not a gate). It carries the boundary's untrust forward.
**Reached by** — using an `Unsafe` value in any non-gate expression; propagates across two hops and into both
branches of a condition.
**Result** — treated like `Unsafe` at a sink; `FUNGI-VALUESTATE-004` (propagation) / `FUNGI-VALUESTATE-005` (a
derived unsafe value reaching a sink).

## C. The sensitivity axis (privacy qualifiers)

#### `Protected`
**What** — the `protected` qualifier: a value that may be used internally but not exposed raw. Sits *alongside* a
trust state (a value can be `Validated` **and** `Protected`).
**Result** — passing it to an audit sink without `redact()` is `FUNGI-VALUESTATE-006`.

#### `Redacted`
**What** — the `redacted` qualifier: a value that may be logged/audited but **not reversed**. The state audit sinks
require.
**Reached by** — `redact()` on a `Protected` value.
**Result** — satisfies `redacted`-tier sinks (`AuditLog.write`, `log.write`, `audit.*`).

#### `Secret`  (`SecureString`)
**What** — the strongest sensitivity qualifier: a `SecureString` usable only through approved operations.
**Result** — cannot be logged (`FUNGI-SECRET-001`), compared with `==` (`FUNGI-SECRET-002`), or serialised
(`FUNGI-SECRET-003`). The **only** declassifier is `seal()` / `encrypt()`. A `Secret` value also drives the
`hardening` auto-derivation (its residency floor is `no_swap`, substrate `binary`) — see [hardening.md](hardening.md).

## D. The mutability axis

#### `ReadOnly`  *(not in the overview table — documented here)*
**What** — a `readonly` binding. Distinct from trust/sensitivity: it marks a value that is not mutated, which makes
it an **APU shared-memory candidate** (safe to share across a parallel lane without copying).
**Result** — an optimisation/safety signal consumed by the execution planner; it does not gate a sink.

## E. The Passport typestate  *(not in the overview table — documented here)*

A separate, **monotone, affine (consume-once)** ladder for authority tokens — the shipped form of the rd-0087 proven
invariant. Deny-by-default: an un-gated Passport is `Raw`.

| Stage | Value | Reached by | Meaning |
|---|---|---|---|
| `Raw` | 0 | (initial) | untrusted — the most restricted stage |
| `Verified` | 1 | a `verify*` gate | identity/shape verified |
| `Authorized` | 2 | an `authorize*` gate | authorised for an action |
| `Sealed` | 3 | a `seal*` gate | sealed / final |

Authority sinks require a **minimum stage**: `response.body` and `database.write` require `Authorized` (2);
`AuditLog.write` requires `Sealed` (3). Two guarantees enforce it: **consume-once** — a Passport may be used once
(`FUNGI-AFFINE-001`, CWE-664); and **no stage-skip** — you cannot jump the ladder (`FUNGI-PASSPORT-002`, CWE-696).

---

## Diagnostics (the value-state family)

| Code | Meaning |
|---|---|
| `FUNGI-VALUESTATE-001` | unsafe→safe transition without a recognised gate |
| `FUNGI-VALUESTATE-002` | conditional upgrade (gate on one branch only) |
| `FUNGI-VALUESTATE-003` | an unsafe value reached a governed sink |
| `FUNGI-VALUESTATE-004` | tainted-value propagation |
| `FUNGI-VALUESTATE-005` | a derived unsafe value reached a sink (two-hop) |
| `FUNGI-VALUESTATE-006` | a protected value at an audit sink without `redact()` |
| `FUNGI-SECRET-001/002/003` | a secret logged / `==`-compared / serialised |
| `FUNGI-AFFINE-001` | a Passport used more than once (consume-once) |
| `FUNGI-PASSPORT-002` | a Passport stage was skipped |

*Provenance: `value-state-checker.ts` (`ValueStateFlags`, `SINK_REQUIREMENTS`/`getSinkRequirement`, `PassportStage`);
`stdlib-gates.yaml §sinks`. Verified against source 2026-07-15.*
