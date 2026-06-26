# Priority Categories

## Purpose

Galerina ideas must be grouped clearly so humans, contributors and AI agents can
understand what matters now, what is required, what is recommended and what
belongs in future research.

The main rule:

```text
Do not treat every Galerina idea as equal.
```

Galerina should first protect non-negotiable rules, then build the core language,
then prove core concepts, then expand platform features, and only then
prioritise future research ideas.

## Priority Order

| Priority | Category | Meaning |
| --- | --- | --- |
| 1 | Non-Negotiable Rules | What Galerina must never violate |
| 2 | Core Language Rules | What the compiler and runtime must enforce |
| 3 | Core Concepts | What the first useful version must support |
| 4 | Platform Concepts | Runtime, tooling, package, deployment and ecosystem work |
| 5 | Recommended Design Rules | Strong design preferences that shape the language |
| 6 | Future / Research Concepts | Long-term ideas that must not distract from v1 |

## Naming Map

| Older name | Current name | Meaning |
| --- | --- | --- |
| Hard rules | Non-Negotiable Rules | Must never be broken |
| Core rules | Core Language Rules | Compiler and runtime rules |
| Soft rules | Recommended Design Rules | Strong design preferences |
| Hard concepts | Core Concepts | Must-have language concepts |
| Call concepts | Platform Concepts | Runtime, API, package, deployment and ecosystem concepts |
| Future aims and concepts | Future / Research Concepts | Long-term ideas, not v1 requirements |

## 1. Non-Negotiable Rules

Non-Negotiable Rules define Galerina's identity.

If a proposed feature breaks one of these rules, the feature should be rejected,
redesigned or moved into a clearly marked unsafe or experimental area.

Examples:

- memory safe by default
- security first
- no raw pointers in normal application code
- no silent `null` or `undefined`
- no truthy/falsy conditions
- only `Bool` controls ordinary conditions
- no hidden error paths as the default model
- no secret leakage into logs, reports or error messages
- no monkey patching in normal code
- no undeclared side effects
- no silent target fallback
- no public route returning raw internal models
- no package authority without declared permission
- no production builds using unsafe development settings

AI instruction:

```text
When suggesting Galerina features, never propose behaviour that violates the Non-Negotiable Rules.
```

## 2. Core Language Rules

Core Language Rules define how Galerina code behaves.

These should become compiler or runtime rules.

Examples:

- conditions must use `Bool`
- missing values must use `Option<T>`
- recoverable errors should use `Result<T, E>`
- public APIs must use request and response contracts
- internal model types must be separate from response/view types
- mutable state must be explicit
- large data should use read-only references unless cloned explicitly
- unsafe or native interop must be declared
- effects must be declared before use
- production mode must fail closed
- declared response cases should be handled
- `Result` and `Option` cases must be handled or returned

## 3. Core Concepts

Core Concepts are the concepts the first useful Galerina version must make clear.

Examples:

- data
- flow
- permission
- boundary
- report
- routes
- requests
- responses/views
- models
- contracts
- effects
- capabilities
- classification
- context
- scopes/lifetimes
- errors
- packages
- tests
- explicit polymorphism

## 4. Platform Concepts

Platform Concepts grow Galerina into a runtime, package and deployment ecosystem.

Examples:

- secure app kernel
- API server
- package registry and lockfiles
- startup and boot warmup
- fast response and keep-alive
- scoped vaults
- generated project graph
- reports and audit bundles
- deployment profiles
- adapters/connectors
- events, queues, jobs and schedules
- database/storage packages
- AI/tool boundaries

Platform Concepts can be important without being v1 compiler blockers.

## 5. Recommended Design Rules

Recommended Design Rules are strong preferences that keep Galerina coherent.

Examples:

- prefer explicit composition over inheritance
- prefer contracts over hidden runtime dispatch
- prefer `match` over unclear truthiness
- prefer typed views over raw model output
- prefer declared tasks/events over implicit background work
- prefer bounded caches over unbounded runtime state
- prefer generated reports over hidden framework behaviour

These rules can guide design even when they are not strict compiler errors yet.

## 6. Future / Research Concepts

Future and research concepts may shape Galerina later, but they should not
distract from v1.

Examples:

- native executable backend
- advanced WASM output
- GPU/NPU execution beyond planning
- photonic/optical compute
- quantum-ready compute targets
- neuromorphic workloads
- advanced AI agent ecosystems
- formal proofs beyond boundary safety
- enterprise governance packs
- large provider ecosystems

Future concepts must be labelled as future, research, target planning or
post-v1 until the core language is stable.

## Decision Rule

When a new Galerina idea appears, classify it before implementing it:

```text
1. Does it violate a non-negotiable rule?
2. Is it a compiler/runtime rule?
3. Is it a v1 core concept?
4. Is it platform/ecosystem work?
5. Is it a recommended design preference?
6. Is it future research?
```

If the category is unclear, keep the idea as documentation or planning until
the core language impact is understood.

## Core Principle

```text
Protect identity first.
Build the core second.
Expand the platform third.
Research the future last.
```
