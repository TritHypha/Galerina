# Galerina Specification

This document is the root normative specification for **Galerina / Galerina**.

Galerina is still a concept and prototype project. This specification therefore
defines the official language rules, required safety properties, compatibility
boundaries and generated artefact expectations that future implementations must
follow.

Detailed design discussion may live elsewhere. When there is a conflict,
`SPEC.md` and the documents it marks as normative take precedence over example
code, exploratory notes or prototype behaviour.

## Specification Status Words

Galerina specification text uses these status words:

```text
required     = mandatory for a stable Galerina implementation
prototype    = implemented in the current repository prototype
planned      = accepted direction, not yet fully implemented
experimental = intentionally unstable and subject to redesign
future       = reserved for later target/runtime/backend support
```

Interpretation rule:

```text
required language rules define the contract
prototype behaviour may be narrower than the future contract
planned and future text does not imply current implementation
```

## Normative Document Set

This root specification incorporates the following documents by reference:

```text
docs/language-rules.md
docs/type-system.md
docs/memory-safety.md
docs/memory-and-variable-use.md
docs/security-model.md
docs/contracts.md
docs/modules-and-visibility.md
docs/json-native-design.md
docs/webhooks.md
docs/target-and-capability-model.md
docs/omni-logic.md
docs/warnings-and-diagnostics.md
docs/error-codes.md
```

Supporting but less normative design documents include:

```text
REQUIREMENTS.md
DESIGN.md
ARCHITECTURE.md
SECURITY.md
OMNI_LOGIC.md
COMPATIBILITY.md
docs/compiler-backends.md
docs/security-first-build-system.md
docs/run-and-compile-modes.md
```

## Scope

The Galerina specification covers:

```text
source file format and project layout
entry and configuration model
syntax and parser-visible constructs
type system and explicit error handling
memory safety and mutation rules
security defaults and permissions
JSON and API contracts
webhook safety requirements
concurrency and rollback direction
compute/accelerator target rules
logic-width compatibility
diagnostic and report formats
source maps, manifests and generated documentation
build, explain and AI-context behaviour
```

## Official Language Rules

The following rules define the official Galerina language contract at a root level.
Detailed examples and edge-case guidance live in `docs/language-rules.md`.

### Rule 1: Source Files

Galerina source files must use the `.spore` extension.

`boot.spore` is the preferred full-project entry and configuration file.
Single-file scripts are allowed for small examples and learning material.

### Rule 2: Practical CPU Baseline

Galerina must remain useful on normal binary CPU systems.

GPU, photonic, ternary, wavelength and future targets are additive. They may
improve acceleration or analysis, but they must not become a hidden requirement
for ordinary Galerina development.

### Rule 3: Strict Types

Galerina is strictly typed. It must reject:

```text
implicit type coercion
undefined values
silent null behaviour
truthy/falsy shortcuts
hidden error conversion
```

Missing values must be explicit, for example through `Option<T>`.
Fallible work must be explicit, for example through `Result<T, E>`.

### Rule 4: Explicit Decisions

Galerina must distinguish between:

```text
Bool      for true/false values
Decision  for business/security allow-deny-review style outcomes
Tri       for mathematical or ternary/model-state logic
```

These categories must not be silently collapsed into one another.

### Rule 5: Exhaustive and Explainable Control Flow

`map`-style branching should be exhaustive for enums, `Option<T>` and
`Result<T, E>` where practical.

The language should prefer explicit, readable control flow over implicit or
exception-driven behaviour.

### Rule 6: Memory Safety by Default

Normal Galerina code must be memory-safe by default. The language must prevent or
explicitly guard against:

```text
use-after-free
double free
buffer overflow
out-of-bounds access
dangling references
uninitialised memory
unsafe shared mutation
data races
```

Mutation must be explicit. Large copies must not be hidden. Borrowing,
cloning, cache bypass and spill behaviour must be reportable.

### Rule 7: Security-First Defaults

Galerina must default to secure behaviour. At minimum, the language and toolchain
must treat the following as first-class concerns:

```text
secret handling
redaction
permissions
package approval
webhook verification
environment access
unsafe/native binding restrictions
```

Compiled outputs must not embed real secrets.

### Rule 8: JSON-Native but Not Loose

Galerina is JSON-native, but JSON handling must still be typed, bounded and safe.

The language should support typed decoding, schema generation, OpenAPI
generation and safety policies such as body-size, depth and duplicate-key
controls.

### Rule 9: API-Native and Webhook-Safe

API and webhook declarations must be contract-driven. Request types, response
types, timeout expectations and security boundaries should be explicit.

Webhook processing must support HMAC verification, replay protection,
idempotency and source-mapped diagnostics.

### Rule 10: Structured Effects, Concurrency and Rollback

Effects must be visible in the language model.

Concurrency should remain structured. Cancellation, timeout, offload and queue
behaviour should be explicit and reportable. Rollback and checkpoint behaviour
must be auditable rather than implied.

### Rule 11: Accelerator-Safe Compute

Compute blocks are reserved for accelerator-suitable work such as pure maths,
vector, matrix, tensor and model-style operations.

File I/O, network I/O, database access, secret access and arbitrary side
effects must be rejected inside accelerator-targeted compute regions unless the
specification explicitly allows them in the future.

### Rule 12: Fallback Must Be Visible

Target fallback must never be silent.

If a requested target cannot be used, Galerina must report:

```text
requested target
selected target
fallback reason
blocked operations
precision or capability caveats
source location
```

### Rule 13: Source Maps and Reports Are Required

Galerina is not only a language; it is also an explainable build system.

Implementations must support source-mapped diagnostics and machine-readable
reports for failures, targets, security, AI context and generated artefacts.

### Rule 14: AI-Oriented Outputs Must Be Safe

Galerina may generate AI-oriented outputs such as `ai-context`, AI guides and
`Galerina explain --for-ai`, but those outputs must stay compact, deterministic and
redacted. They must not leak secret values.

### Rule 15: Documentation Must Match Reality

The project must distinguish clearly between:

```text
prototype
planned
experimental
future
stable
```

No document should claim real backends or guarantees that the implementation
does not provide.

## Language Surface

The specification recognises the following major language areas:

```text
project and entry declarations
imports/modules/packages
types/enums/results/options
flows and secure/pure/vector variants
effects and permissions
JSON policies and typed decoding
API and webhook declarations
rollback/checkpoint constructs
compute and target declarations
diagnostic/report generation
```

Exact syntax may evolve during prototype stages, but the semantic rules above
must remain consistent unless the specification version changes.

## Static Semantics

A conforming Galerina implementation must aim to provide:

```text
lexing and parsing with source locations
name resolution
type checking
explicit missing-value analysis
exhaustiveness checking where defined
target-compatibility checking
security and permission checking
memory-safety checking
report generation
```

Stable Galerina releases should reject unsafe or ambiguous programs before target
generation whenever possible.

## Runtime and Build Semantics

Galerina supports both checked source execution and compiled/build output generation.

The specification requires these high-level build properties:

```text
checked diagnostics before execution
source maps for failures
structured JSON reports
build manifests and output hashing
generated documentation and AI context where configured
clear distinction between development output and production output
```

The prototype may emit placeholder target artefacts for some backends, but the
report contracts and safety rules are still part of the specification.

## Diagnostics and Artefacts

Galerina diagnostics and generated artefacts are part of the language contract, not
merely implementation detail.

Examples of required or planned artefact families:

```text
failure reports
security reports
target reports
runtime and memory reports
source maps
map manifests
docs manifests
AI context files
AI guides
build manifests
```

Detailed schemas may evolve, but their purpose and safety constraints must stay
consistent with this specification and `COMPATIBILITY.md`.

## Conformance Levels

Until Galerina reaches a stable release, it is useful to distinguish conformance
levels:

```text
design-conformant     = matches the published language rules and safety model
prototype-conformant  = implemented and exercised by the current repository CLI
target-conformant     = produces target/report artefacts for the requested mode
```

The current repository mainly demonstrates prototype conformance for a subset of
the full design.

## Change Control

Changes to the Galerina language contract should update, at minimum:

```text
SPEC.md
COMPATIBILITY.md when compatibility impact exists
the relevant normative docs in docs/
schemas and examples when outputs change
TODO.md or ROADMAP.md when work remains incomplete
```

Breaking semantic changes should be documented explicitly rather than being
hidden inside examples or prototype code.

## Summary

Galerina is defined by five non-negotiable ideas:

```text
strict and explicit semantics
memory-safe and security-first defaults
JSON/API practicality
explainable reports and source maps
future-aware targets without sacrificing CPU usefulness
```

Any future Galerina implementation should be judged against those rules first.
