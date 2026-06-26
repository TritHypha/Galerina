# Phase 26 — Wasmtime Standalone Target + Healthcare Governance

## Overview

Phase 26 proves the `wasm-standalone` runtime target using a representative
healthcare flow (`getPatient`). Where Phase 25 proved the `wasm-hybrid` model
(JS capability shell + WASM pure-flow core), Phase 26 proves the fully
standalone path: a `.wasm` module that runs under `wasmtime` with no JS
runtime required.

---

## Phase 26 Runtime Target: wasmtime (wasm-standalone)

The `wasm-standalone` target compiles a Galerina flow to a self-contained WASI
module. The module:

- Imports only declared WASI host functions (one per declared effect).
- Exports a single entry-point function matching the flow signature.
- Carries no JS bootstrap shim or Node.js dependency.
- Runs directly under `wasmtime` or any WASI-compliant runtime.

**CLI invocation:**

```
galerina build --target=wasm-standalone examples/healthcare/
```

The compiler performs full governance and effect-checker validation before
emitting the WAT stub. If any governance invariant is violated, the build
fails with an error; no `.wasm` output is produced.

---

## Healthcare Example Governance: PHI Declared, Redacted Before Audit

The `getPatient` flow (`examples/healthcare/getPatient.spore`) demonstrates the
PHI governance pattern:

1. **PHI declaration** — `privacy { phi name dob }` marks `name` and `dob` as
   protected health information at the contract level.
2. **Redaction enforcement** — `require redaction before audit.write` is a
   static contract constraint. The effect checker emits a diagnostic if
   `redact()` is not called on a PHI field before `AuditLog.write`.
3. **Response boundary** — `deny protected PatientId to response.body` prevents
   the raw patient identifier from appearing in any HTTP response. Only the
   redacted form may cross the response boundary.
4. **Actor requirement** — `audit { require actor }` means every audit record
   must carry the authenticated actor identity. Flows that cannot supply an
   actor are rejected at the contract boundary.

This pattern satisfies HIPAA minimum necessary and audit trail requirements at
the type-system level, not just at runtime policy.

---

## Stage B Parser Parity: Goal for Phase 26

Phase 26 sets the goal of **Stage B parser parity**: the self-hosted `parser.spore`
(written in Galerina) should produce identical parse results to the TypeScript
reference parser for all flows in the Canonical Example Corpus (CEC), including
the new healthcare example.

Parity is measured by:

- Zero parse-error divergence across CEC flows.
- Identical `flowDecl`, `contractBlock`, and `effectsBlock` AST node shapes.
- Identical `declaredEffects` arrays on all `FlowMeta` objects.

Stage A parity (lexer) was proved in Phase 25. Stage B (parser) is the Phase 26
milestone.

---

## WASI Imports Required by getPatient

The three effects declared in `getPatient` map to the following WASI host
imports in the emitted WAT module:

| Declared effect | WASI host import | Description |
|---|---|---|
| `database.read` | `host:db.find` | Read-only patient record lookup; no write capability granted |
| `phi.read` | `host:phi.read` | Controlled PHI field access; enforced by WASI import table |
| `audit.write` | `host:audit.write` | Append-only audit sink; no read-back capability |

Each import is surfaced in the WAT `(import ...)` stanza exactly once. The
import table enforces the declared capability boundary: a module compiled from
a `secure` flow with `database.read` cannot call `host:db.write` because that
import is not present in the module's import table.

---

## Phase Progression

| Phase | Target | Proof |
|---|---|---|
| 25 | `wasm-hybrid` | JS shell + WASM pure-flow core; auth-service example |
| 26 | `wasm-standalone` | wasmtime WASI; healthcare example; Stage B parser parity goal |
| 27 (planned) | `wasm-standalone` production | Full WAT emitter; GIR hasher; deterministic `.wasm` output |
