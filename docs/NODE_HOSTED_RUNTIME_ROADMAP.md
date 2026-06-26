# Node-Hosted Runtime And Standalone Roadmap

Galerina's practical web/API execution path is currently Node-hosted.

This means Galerina should be described as a secure language/framework layer that
can run through Node.js while the core language, checker, runtime contracts and
reports mature.

## Current Execution Shape

```text
HTTP request
  -> Node.js server
  -> Galerina framework/API server adapter
  -> Galerina app kernel
  -> Galerina checked rules and flows
  -> Node.js executes the runtime path
  -> HTTP response
```

## Current Claim

```text
At this stage, Galerina is Node-hosted, but the design should keep the core
language target-independent.
```

## Future Claim

```text
Galerina may later compile to secure runtime targets such as WASM, native
binaries, VM bytecode or other checked backends.
```

## Roadmap To Standalone Runtime

Standalone runtime work depends on:

```text
stable language core
Galerina IR
runtime memory model
VM or interpreter
WASM/native backend
async/event runtime
HTTP/web runtime
storage/network libraries
security runtime enforcement
production runtime tooling
```

## Rule

Galerina should not claim to be a standalone native web server/runtime until these
layers exist as implemented, tested, reportable runtime components.

## Knowledge Base

See [Node-Hosted Runtime Roadmap](Knowledge-Bases/node-hosted-runtime-roadmap.md).
