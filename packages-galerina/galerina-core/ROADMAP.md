# Galerina Roadmap

This roadmap outlines the planned direction for **Galerina / Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware programming language concept.

The roadmap is designed to move Galerina from concept documentation into a working prototype, then towards a usable language toolchain.

---

## Roadmap Summary

Galerina should be developed in beta stages before any stable release:

```text
0.1.x  Documentation and concept
0.2.x  Parser prototype
0.3.x  Type and safety checker prototype
0.4.x  JSON/API/webhook prototype
0.5.x  Target planning prototype
0.6.x  AI-friendly tooling prototype
0.7.x  Developer tooling
0.8.x  Runtime prototype
0.9.x  Larger application structure and package conventions
1.0.0-beta.x  Beta language specification candidate
1.0.0         First stable language specification, only after release criteria are met
```

The first goal is not real photonic hardware support.

The first goal is to make Galerina useful and understandable on normal systems.

The current repository version is beta. It should not be described as a stable
release while compiler, runtime, package and documentation contracts are still
being shaped.

Galerina should not claim production maturity until the missing language-core work
in `docs/language-core-maturity-roadmap.md` is implemented: real compiler
pipeline, protocols/interfaces, deterministic cleanup, trusted interop, package
management, testing, async runtime semantics, source-mapped runtime errors and a
small standard library.

---

## Roadmap Principles

Every roadmap item should support one or more of these goals:

```text
make Galerina safer
make Galerina stricter
make Galerina easier to debug
make Galerina better for JSON/API systems
make Galerina better for webhooks
make Galerina better for AI coding assistants
make Galerina easier to deploy
make Galerina ready for multi-target compilation
make Galerina useful without future hardware
```

Generated roadmap documents are advisory. If a generated document conflicts
with this repository's package structure, `AGENTS.md`, workspace map or
maintained docs, the repository structure takes precedence. Version labels may
move when that produces a clearer beta, staging or release path.

---

## Current Stage

Current stage:

```text
Concept and documentation
```

Current focus:

```text
README
concept documents
requirements
design notes
architecture
security model
AI instructions
examples
Git workflow
compiled app workflow
Apache-2.0 licensing
```

---

## Version 0.1.x — Concept Documentation

### Goal

Create a complete documentation bundle explaining what Galerina is and why it exists.

### Status

```text
In progress
```

### Planned Files

```text
README.md
ABOUT.md
CONCEPT.md
LICENSE
LICENCE.md
NOTICE.md
REQUIREMENTS.md
DESIGN.md
TASKS.md
TODO.md
ROADMAP.md
ARCHITECTURE.md
SECURITY.md
CONTRIBUTING.md
CODE_OF_CONDUCT.md
AI-INSTRUCTIONS.md
CHANGELOG.md
GETTING_STARTED.md
DEMO_hello_WORLD.md
GIT.md
COMPILED_APP_GIT.md
.env.example
.gitignore
docs/
```

### Goals

```text
define the language purpose
define the file structure
define .spore source files
define boot.spore
define strict type rules
define memory safety goals
define security-first defaults
define JSON-native design
define API-native design
define webhook design
define GPU planning
define photonic planning
define ternary simulation
define source maps
define AI context files
define build outputs
define deployment principles
```

### Completion Criteria

```text
all main documentation files drafted
Apache-2.0 licence included
example .spore files drafted
roadmap agreed
core terminology consistent
```

---

## Version 0.2.x — Parser Prototype

### Goal

Build the first parser prototype for `.spore` files.

### Planned Features

```text
lexer
parser
AST output
basic syntax errors
file and line tracking
basic source-map structure
```

### Syntax to Parse

```text
boot.spore
project block
language block
entry declaration
target blocks
security block
permissions block
imports
flow definitions
secure flow definitions
type definitions
enum definitions
map expressions (pattern matching)
let bindings
mut bindings
return statements
```

### Example Input

```Galerina
secure flow main() -> Result<Void, Error> {
  print("hello from Galerina")
  return Ok()
}
```

### Example Output

```text
AST JSON
basic source map
basic failure report
```

### Completion Criteria

```text
hello.spore parses successfully
boot.spore parses successfully
parser reports line/column errors
AST contains source positions
```

---

## Version 0.3.x — Type and Safety Checker Prototype

### Goal

Add early compile-time safety checks.

### Planned Features

```text
strict type checking
no undefined check
no silent null check
truthy/falsy rejection
Option<T> checks
Result<T, Error> checks
exhaustive map checking
explicit conversion checks
basic SecureString checks
```

### Errors to Detect

```text
String + Int without conversion
Option<T> accessed without map
Result<T, E> ignored
non-exhaustive map
truthy/falsy checks
secret logging
unsafe denied by default
```

### Completion Criteria

```text
type errors include source file and line
Option misuse is detected
Result misuse is detected
non-exhaustive map is detected
failure report is generated
security report is generated
```

---

## Version 0.4.x — JSON, API and Webhook Prototype

### Goal

Add first-class JSON, API and webhook design support.

### Planned Features

```text
Json type
typed JSON decoding
raw JSON access
json.decode<T>
json.pick<T>
JSON policy parsing
API block parsing
webhook block parsing
OpenAPI draft output
JSON schema draft output
API report output
webhook security warnings
```

### API Features

```text
typed request bodies
typed response bodies
route params
query params
declared errors
timeouts
max body size
handler compatibility checks
```

### Webhook Features

```text
HMAC declaration
secret from environment
max age
max body size
replay protection
idempotency key
handler compatibility checks
```

### Completion Criteria

```text
API block parses
webhook block parses
typed JSON decode is represented in AST/IR
OpenAPI draft can be generated
JSON schema draft can be generated
API report can be generated
webhook missing security warning is generated
```

---

## Version 0.5.x — Target Planning Prototype

### Goal

Add target planning for CPU, WASM, GPU, photonic and ternary simulation.

### Planned Features

```text
compute block parsing
target compatibility checking
CPU target report
WASM target report
GPU plan output
photonic plan output
ternary simulation output
target fallback report
unsupported compute operation errors
```

### Target Outputs

```text
app.gpu.plan
app.photonic.plan
app.ternary.sim
app.target-report.json
```

### Compute Block Example

```Galerina
compute target best {
  prefer photonic
  fallback gpu
  fallback cpu

  score = fraudModel(features)
}
```

### Completion Criteria

```text
compute blocks parse successfully
file/network I/O inside compute block is rejected
GPU plan report is generated
photonic plan report is generated
fallback decision is reported
```

---

## Version 0.6.x — AI-Friendly Tooling Prototype

### Goal

Add AI-readable summaries and explanations.

### Planned Features

```text
Galerina ai-context
app.ai-context.json
app.ai-context.md
Galerina explain --for-ai
compact error reports
source-map powered explanations
redacted AI output
```

### AI Context Should Include

```text
project name
entry file
source files
routes
webhooks
types
imports
permissions
targets
errors
changed files
suggested next actions
```

### Example Command

```bash
Galerina explain --for-ai build/app.failure-report.json
```

### Completion Criteria

```text
AI context file generated
AI explain output generated
secrets redacted
source file and line included
suggested fix included
```

---

## Version 0.7.x — Developer Tooling

### Goal

Improve developer experience.

### Planned Features

```text
Galerina fmt
Galerina lint
CLI help
basic VS Code syntax highlighting
basic snippets
basic diagnostics
```

### Linter Checks

```text
non-exhaustive map
unused imports
webhook without idempotency
webhook without replay protection
API route without timeout
JSON endpoint without max body size
secret logging
compute block with unsupported I/O
overly broad permissions
```

### Completion Criteria

```text
formatter works on example files
linter reports common issues
VS Code highlights .spore files
CLI help is available
```

---

## Version 0.8.x — Runtime Prototype

### Goal

Create a small runtime for executing basic Galerina programs.

### Planned Runtime Areas

```text
error runtime
Option runtime
Result runtime
JSON runtime
API runtime
webhook runtime
environment runtime
security runtime
source-map lookup
```

### Completion Criteria

```text
hello.spore can run
simple JSON decode example can run
simple API route example can run
simple webhook example can be validated
runtime errors map back to source files
```

---

## Version 0.9.x — Larger Application Structure

### Goal

Create early support for larger API applications without making Galerina an MVC or
web framework.

### Planned Features

```text
service blocks
typed API route declarations
handler modules
domain models
package-provided views
package-provided middleware
workers
channels
configuration
storage paths
test structure
```

### Example Structure

```text
my-galerina-api-app/
├── boot.spore
├── src/
├── app/
│   ├── controllers/
│   ├── models/
│   ├── views/
│   ├── middleware/
│   └── services/
├── config/
├── tests/
└── build/
```

### Completion Criteria

```text
basic API app runs
routes map to handlers
JSON request/response works
worker/channel example works
source maps work across app files
```

---

## Version 1.0.0-beta.x - Beta Specification Candidate

### Goal

Publish a beta Galerina language specification candidate and basic toolchain for
review before any stable release.

### Required for 1.0.0-beta.x

```text
beta .spore syntax
beta boot.spore structure
beta strict type rules
beta Option and Result model
beta Decision model
beta JSON model
beta API/webhook model
beta source-map format
beta compiler report formats
working parser
working checker
working formatter
working linter
working examples
clear documentation
Apache-2.0 licence
```

### Not Required for 1.0.0-beta.x

```text
real photonic hardware backend
full production GPU backend
complete package manager
formal verification
built-in full MVC framework
large standard library
```

The beta candidate should focus on correctness, clarity and developer
experience. A later stable `1.0.0` release should happen only after beta review,
compatibility checks, security review and documentation sign-off.

---

## Long-Term Roadmap

Long-term ideas include:

```text
LLVM backend
MLIR backend
WASM backend
native executable compiler
real GPU backend
ONNX support
AI model pipeline support
photonic vendor backend
ternary-native backend
package manager
language server
VS Code extension
web playground
debugger
deployment tooling
formal verification tools
standard library
web framework packages
cloud deployment adapters
```

## Post-Beta Major Roadmap

The following major-version direction is advisory and may move as the beta
stabilises:

```text
v10  Advanced Hardware
v11  Financial Industry and Stock Market Support
v13  OSWARP - Operating System Wrapper and Runtime Portability
v18  Syntax and Security Review
v19  Framework Review
v20  Standards and ISO Review
v21  Basic Mobile Graphics
```

`v10` should cover advanced hardware planning before mobile and finance
expansion. GPU, AI accelerator, low-bit AI, optical I/O, photonic, ternary and
Omni-logic work remain planning, simulation and report layers unless concrete
backend support exists.

`v11` may cover financial-market data, money and currency types, risk, audit,
trading safety boundaries and stock-market support. These should be package or
standard-library candidates, not unreviewed core syntax.

The first `v11` planning surface should be the grouped `galerina-finance-core` package
area. Start with deterministic finance maths, calendars, market data, FIX
contracts and audit/replay evidence before risk, pricing, desktop interop or
low-latency runtime profiles.

`v13` may use OSWARP as a working name for Operating System Wrapper and Runtime
Portability. It should wrap runtime portability and platform policy rather than
turning Galerina into an operating system.

`v20` should align relevant Galerina contracts with ISO, IEC, IEEE, W3C, OWASP and
NIST-style standards where useful. `v21` should keep mobile graphics basic:
canvas-style primitives, charting and adapter planning such as Flutter or Skia,
without making frontend frameworks part of `galerina-core`.

`docs/language-positioning-principles.md` should guide positioning. Galerina
should compete through explicit security contracts, effect/permission reports,
AI-readable project context, target-aware planning and source-mapped diagnostics.

---

## Future Hardware Roadmap

Galerina should support future hardware carefully.

### Stage 1

```text
target planning
simulation
reports
fallback design
```

### Stage 2

```text
GPU backend
WASM backend
MLIR/LLVM integration
ONNX integration
```

### Stage 3

```text
photonic backend when hardware/tooling is available
ternary-native backend if hardware becomes practical
vendor-specific accelerator adapters
```

Photonic support should never block normal Galerina usage.

---

## Documentation Roadmap

Documentation should expand into:

```text
docs/syntax.md
docs/type-system.md
docs/memory-safety.md
docs/security-model.md
docs/json-native-design.md
docs/api-native-design.md
docs/webhooks.md
docs/concurrency.md
docs/compute-blocks.md
docs/gpu-target.md
docs/photonic-target.md
docs/ternary-logic.md
docs/source-maps.md
docs/compiler-reports.md
docs/ai-context.md
docs/deployment.md
docs/package-system.md
docs/glossary.md
```

---

## Example Roadmap

Examples should be added in this order:

```text
hello.spore
strict-types.spore
option.spore
result.spore
decision.spore
json-decode.spore
api-orders.spore
payment-webhook.spore
parallel-api-calls.spore
workers.spore
rollback.spore
compute-block.spore
gpu-plan.spore
photonic-plan.spore
ternary-sim.spore
source-map-error.spore
ai-context.spore
```

---

## Security Roadmap

Security features should be developed early.

Priority order:

```text
strict types
no undefined
no silent null
Result and Option checks
SecureString
secret logging prevention
JSON safety policy
webhook HMAC verification
idempotency
replay protection
permissions
effect system
package permission checks
security reports
CI security checks
```

---

## API and JSON Roadmap

API and JSON should be core to Galerina adoption.

Priority order:

```text
typed JSON decoding
raw JSON access
JSON policy
JSON schema generation
API route contracts
webhook contracts
OpenAPI output
request validation
response validation
API reports
API client generation
test mocks
```

---

## AI Tooling Roadmap

AI tooling should be part of Galerina from early stages.

Priority order:

```text
machine-readable errors
source-map aware diagnostics
app.ai-context.json
app.ai-context.md
Galerina explain --for-ai
redaction rules
changed-file summaries
route/type summaries
target summaries
suggested next actions
```

---

## Deployment Roadmap

Deployment should support build-once, deploy-many.

Priority order:

```text
build manifest
source hashes
output hashes
dependency hashes
.env outside compiled files
server environment variables
artefact verification
health checks
rollback guidance
compiled app Git guidance
CI/CD examples
```

---

## Git Roadmap

Git documentation should include two documents.

```text
GIT.md
```

For the Galerina language repository.

```text
COMPILED_APP_GIT.md
```

For applications built with Galerina.

These documents should explain:

```text
branching
commits
tags
releases
generated files
build outputs
source maps
.env files
compiled artefacts
deployment records
```

---

## Success Criteria

Galerina is successful if it becomes:

```text
easy to understand
safe by default
strict by default
good for JSON/API work
good for webhook systems
easy to debug after compilation
friendly to AI coding assistants
useful on normal CPUs
ready for future accelerator targets
```

---

## Risks

Known risks:

```text
scope becomes too broad
language becomes too complex
photonic focus distracts from practical use
syntax becomes too unfamiliar
compiler implementation becomes too difficult
package ecosystem never grows
AI tooling becomes an afterthought
JSON/API support becomes too framework-like
security claims become too strong
```

---

## Risk Controls

Controls:

```text
prioritise CPU usefulness first
prioritise JSON/API use cases early
keep syntax small
document non-goals
avoid unsupported claims
build reports before real exotic backends
keep kernel and driver development last and permission-gated
make examples practical
keep source maps central
keep security defaults strict
```

---

## Kernel and Driver Development Policy

Kernel and driver development is not an early roadmap item.

It should happen only after the language specification, memory model, security
model, native binding policy, runtime isolation strategy and target reports are
stable.

Rule:

```text
kernel and driver development is last-stage work
kernel and driver development requires explicit maintainer or project permission
no kernel module, driver, privileged runtime, vendor SDK binding or raw hardware
backend should start without approval
```

---

## Final Roadmap Statement

Galerina should move from:

```text
concept → documentation → parser → safety checker → JSON/API prototype → target planner → AI tooling → runtime → stable specification
```

The roadmap should keep Galerina practical today and ready for future compute tomorrow.
