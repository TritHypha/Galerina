# Secure Web Runtime First

Galerina's first serious milestone should be a memory-safe, security-first,
AI-readable language and runtime for secure web apps, APIs and agent workflows.

The first milestone should not depend on native executable compilation. Galerina
should be useful for normal web applications through a Galerina secure runtime
that can check, serve and run typed application code with reports.

## Current Node-Hosted Reality

At this stage, practical Galerina web/API execution is Node-hosted.

```text
HTTP request
  -> Node.js server
  -> Galerina framework/API server adapter
  -> Galerina app kernel
  -> Galerina checked rules and flows
  -> Node.js executes the runtime path
  -> HTTP response
```

This is acceptable for the current phase. It lets Galerina focus on typed
requests, response contracts, policies, effects, capabilities, audit reports and
AI/tool boundaries while Node provides the host process, HTTP and platform I/O.

The design rule is:

```text
Node-hosted today.
Target-independent core.
Secure runtime targets later.
```

Node/V8 behavior must not become the definition of Galerina source semantics.

## Primary Direction

```text
secure web runtime first
native executable output later
accelerator and systems targets later
```

The runtime-first path keeps Galerina focused on what makes it different:

```text
typed API contracts
explicit effects
deny-by-default permissions
secret-safe output
memory-safe values
safe runtime profiles
source maps
AI-readable project context
machine-readable reports
```

## Target Workloads

Galerina should first serve:

```text
HTTP APIs
webhooks
queue workers
service workers
typed JSON services
auth-heavy backend applications
agent/tool gateway backends
AI/model-serving control planes
secure admin/API backends
```

This is application runtime work. Low-level systems targets, embedded targets,
accelerator targets and native executable packaging can remain future output
paths.

## V1 Milestone

The main v1 milestone is:

```text
galerina serve / secure web runtime
```

The secondary v1 milestone is:

```text
compile to a simple portable build target
```

This means Galerina v1 should be useful for web applications without requiring a
native executable build. Native and WASM targets can stay visible in reports and
package planning, but they should not block the first secure runtime slice.

## Faster Web Apps Without Binary Compilation

Galerina can become fast for web apps before native executable output by making
the runtime do less work per request.

Runtime-first performance rules:

```text
precheck source before serving
cache parsed AST and typed IR
compile route manifests once per build
precompute permission and effect decisions
generate typed JSON decoders and encoders
stream large request and response bodies
use read-only views for large payloads
require explicit clone for expensive copies
cache source maps and diagnostics
keep hot route metadata in compact runtime tables
support worker pools for safe background work
make compute-heavy paths eligible for optional WASM later
specialise runtime plans from local machine capability profiles
```

The fast path should be:

```text
request -> route manifest -> typed decode -> policy check -> flow -> typed response
```

The runtime should avoid:

```text
dynamic route lookup on every request
re-decoding schemas repeatedly
copying large payloads unnecessarily
running security discovery after handler code starts
loading dev-only packages in production mode
```

## Machine Profile Bridge

Galerina should keep developer code high-level while still allowing the runtime to
specialise for the machine it is installed on. The draft name for this layer is
the **Machine Profile Bridge**.

The bridge sits between checked Galerina source and machine-specific execution:

```text
high-level Galerina source
  -> checked typed IR
  -> Machine Profile Bridge
  -> local runtime plan
  -> secure web runtime / target adapter
```

The bridge should:

```text
detect local OS, architecture, runtime, CPU features and available adapters
write a local capability profile that is not committed to source control
specialise boot/main runtime settings for the deployment machine
choose safe runtime adapters from declared policy
preserve the developer's high-level source syntax
report every local selection and fallback
fail closed when a required capability or permission is missing
```

Example direction:

```galerina
machine profile local_runtime {
  detect os
  detect architecture
  detect runtime
  detect cpu_features

  cache ".galerina/capabilities.local.json"
  commit false
}

runtime bridge web_runtime {
  from local_runtime
  serve AppServer
  fallback cpu
  report "runtime-bridge-report.json"
}
```

This is a tooling/runtime concept, not an invitation to write low-level app
code. Normal Galerina source should stay readable and policy-first.

## Native Layout And Interop Wording

Galerina should use `layout native` and `interop native` as the official draft
wording for low-level boundaries. A native block must still declare a concrete
ABI, because calling convention, layout and ownership rules cannot be guessed.

```galerina
layout native UserRecord {
  abi c

  fields {
    id: UInt64
    email: CString
    active: Bool8
  }

  alignment auto
  padding explicit
}
```

```galerina
interop native sqlite {
  abi c
  library "sqlite3"

  functions {
    sqlite3_open(filename: CString, db: Out<NativeHandle>) -> CInt
    sqlite3_close(db: NativeHandle) -> CInt
  }

  memory {
    ownership explicit
    nulls denied
    bounds checked
  }

  effects {
    allow file.read
    allow file.write
    deny network.external
  }
}
```

The rule is:

```text
Use native as the official Galerina category.
Use abi c, abi wasm, abi system or abi plugin for the concrete boundary rules.
```

Native interop must remain controlled, source-mapped, permissioned and
reportable. It is not normal application code.

## Security Model

Security should be default runtime behavior, not framework convention.

Required defaults:

```text
input starts untrusted
effects are denied until declared
packages have no authority until approved
secrets redact by default
unknown JSON fields are rejected or reported
route limits are declared
auth requirements are route-visible
unsafe interop is blocked in production profiles
fallback decisions are reported
```

The runtime should fail closed when it cannot prove a route, package, secret,
effect or deployment setting is safe enough for the selected profile.

## Memory Safety

Galerina should make memory behavior clear without forcing normal web developers
into low-level memory work.

Required direction:

```text
Option for missing values
Result for recoverable errors
bounded arrays and slices
read-only views for large data
explicit clone for large copies
resource scopes for files, sockets, handles and secrets
graph ownership for workflow, route and AST structures
audited interop boundaries for native libraries
memory reports for large payloads and hot routes
```

Normal application code should not need manual allocation or manual cleanup for
ordinary values.

## Developer Experience

Galerina should feel strict but practical.

Developer workflow:

```text
galerina check
galerina run
galerina serve
galerina test
galerina reports
```

Diagnostics should explain:

```text
what failed
why it matters
how to fix it
which source line caused it
which type, effect, route or permission rule was involved
```

The language should prefer clear syntax, one obvious form for common behavior,
small core concepts, real examples and predictable formatting.

## AI-Readable Runtime

Galerina should make code understandable to AI tools without giving those tools
unsafe authority.

Runtime and build outputs should include:

```text
project graph
route manifest
type manifest
effect manifest
security report
memory report
package authority report
source maps
AI-safe project summary
redacted diagnostics
```

AI context must be generated from checked project facts, not raw secrets, hidden
runtime state or unbounded logs.

## Future Targets

Future output targets remain useful, but they should not block the first
production-value milestone.

Staged target order:

```text
1. Checked secure web runtime.
2. Cached typed IR for faster local serve/run.
3. Web-safe module output for selected code.
4. WASM for isolated compute-heavy functions.
5. Native executable output where deployment needs it.
6. Accelerator planning and reports for AI/vector workloads.
```

Standalone runtime work requires more layers: stable language core, Galerina IR,
runtime memory model, VM/interpreter or native/WASM backend, async/event
runtime, HTTP/web runtime, storage/network libraries, security runtime
enforcement and production runtime tooling.

The first public promise should be:

```text
Galerina makes secure web runtime behavior typed, explicit, reportable and
AI-readable.
```
