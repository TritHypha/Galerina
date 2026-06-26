# Galerina Runtime Lifecycle

## Status

```text
Runtime lifecycle: specified - implementation Phase 7B/8
AstInterpreter:    specified - implementation Phase 7B/8
Applies to:        TypeScript Stage 1 runtime
```

This document defines the Stage 1 TypeScript runtime lifecycle from process
startup through request handling, flow execution, audit, and shutdown.

---

## Rules at a Glance

- Startup validates runtime metadata before opening any listener.
- Every HTTP request enters through an intake guard before route dispatch.
- Flow execution uses a fresh scoped value environment per invocation.
- The `?` operator returns `Err` early through a governed runtime signal.
- Production and deterministic modes require JSONL audit and proof evidence.
- The runtime enforces the manifest and profile; it does not infer authority.

---

## TL;DR
- Every HTTP request passes intake guard → route match → hydration → effect gate → flow execution → audit
- `?` operator returns Err early through an internal EarlyReturn signal
- Production mode requires JSONL audit and proof chain

---

## Startup Sequence

Stage 1 startup runs in this order:

1. Load runtime profile and process configuration.
2. Load and validate `galerina-manifest.json` when present.
3. Register the route table from checked `routeDecl` nodes or route manifest
   entries.
4. Warm standard-library modules required by the program, including `json`,
   `http`, `fs`, `validate`, `sanitize`, `parse`, `redact`, `AuditLog`, and
   `Env`.
5. Initialise the audit writer when the selected mode requires audit output.
6. Start the HTTP listener when one or more routes exist.
7. Emit a startup audit event.

The runtime must fail closed if the manifest is present but invalid. Manifest
structure and hashing are specified in
`galerina-core-compiler-manifest-generation-pass-14.md`.

## Request Handling Lifecycle

For each request:

1. Intake guard:
   - enforce body size limits
   - verify supported encoding
   - apply rate limit checks
   - reject malformed transport metadata
2. Route match:
   - match method and path against registered `routeDecl` entries
   - return `404` when no route exists
   - return `405` when the path exists but the method is not declared
3. Request hydration:
   - build `readonly request: Request` from the raw HTTP request
   - mark `request.body` and `request.rawBody` as unsafe boundary-origin bytes
4. Effect gate:
   - verify the target flow's declared effects are allowed in the deployment
     profile
   - return a governance denial when an effect is not permitted
5. Flow execution:
   - call the named flow with the hydrated request or decoded typed request
6. Response gate:
   - verify the response conforms to the declared route response type
   - redact or reject unsafe output according to boundary policy
7. Audit record write:
   - append a JSONL runtime audit event
   - include route, flow, actor, trace, status, and safe metadata

Detailed HTTP routing and request hydration are specified in
`galerina-route-runtime-spec.md`.

## Flow Execution Lifecycle

Each flow invocation creates an isolated execution context:

1. Create a new value environment with a scope stack.
2. Register parameter bindings as readonly and typed.
3. Execute statements sequentially.
4. Register `let`, `mut`, and `readonly` bindings in the current scope.
5. Check runtime sink calls against the binding registry when runtime
   enforcement is enabled.
6. On `?` over `Err(e)`, return `Err(e)` early and write an audit denial or
   early-return event.
7. On `return`, return the value to the caller.
8. On unhandled exception, emit an error audit event and return
   `ApiError.internal(...)`.

The runtime signal used for `?` is internal. User code observes only the
declared `Result<T, E>`.

## Shutdown Sequence

Shutdown runs in this order:

1. Stop accepting new requests.
2. Wait for in-flight governed requests to complete or reach timeout.
3. Emit a shutdown audit event.
4. Flush the JSONL audit writer.
5. Flush denial and evidence writers.
6. Generate the proof chain when required by profile.
7. Close runtime resources.

The runtime must not drop buffered audit records silently. Failure to write audit
or proof evidence is a runtime diagnostic.

## Runtime Modes

| Mode | Description |
|---|---|
| `check-only` | Parse and run all checkers; no GIR emission, no lowering, no execution. |
| `dev` | Execute with verbose safe logging; proof chain disabled unless requested. |
| `production` | Execute with JSONL audit; proof chain required. |
| `deterministic` | Production mode with fixed scheduling and no adaptive optimisation. |

The compiler pipeline modes are defined in `galerina-compiler-pipeline.md`.
Adaptive and deterministic runtime policy is defined in
`galerina-adaptive-runtime-profiles.md`.

## Compiler Status

```text
Runtime lifecycle: specified - implementation Phase 7B/8
AstInterpreter:    specified - implementation Phase 7B/8
HTTP integration:  specified - implementation Phase 7B/8
Audit writer:      specified - implementation Phase 7B/8
Proof chain:       specified - implementation Phase 7B/8
```

## See Also

- `docs/Knowledge-Bases/galerina-compiler-pipeline.md`
- `docs/Knowledge-Bases/galerina-runtime-value-model.md`
- `docs/Knowledge-Bases/galerina-route-runtime-spec.md`
- `docs/Knowledge-Bases/lsgr-runtime-components.md`
- `docs/Knowledge-Bases/bootstrap-runtime-roadmap.md`
- `docs/Knowledge-Bases/governed-execution-director.md`
- `docs/Knowledge-Bases/galerina-adaptive-runtime-profiles.md`
- `docs/Knowledge-Bases/galerina-audit-writer-spec.md`
- `docs/Knowledge-Bases/galerina-proof-chain-spec.md`
