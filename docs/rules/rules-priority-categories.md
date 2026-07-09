# Rules: Priority Categories

## Purpose

Priority categories tell contributors and AI tools how to sort Galerina ideas
before treating them as requirements.

## Priority Order

1. Non-Negotiable Rules
2. Core Language Rules
3. Core Concepts
4. Platform Concepts
5. Recommended Design Rules
6. Future / Research Concepts

## Category Rules

### Non-Negotiable Rules

Rules in this category define Galerina's identity and must not be violated by
normal features.

Examples include memory safety by default, security-first execution, explicit
errors, secret-safe reports, declared effects, `Bool`-only conditions and no
public raw model output.

### Core Language Rules

Rules in this category should become compiler or runtime behaviour.

Examples include `Option<T>` for missing values, `Result<T, E>` for recoverable
errors, explicit effects, declared interop and fail-closed production mode.

### Core Concepts

Concepts in this category are required for the first useful Galerina version.

Examples include data, flow, permission, boundary, report, routes, requests,
responses/views, models, contracts, effects, capabilities, classification,
context, scopes, errors, packages and tests.

### Platform Concepts

Concepts in this category build the ecosystem around the language.

Examples include the secure app kernel, API server, package registry, startup
profiles, scoped vaults, project graph, deployment profiles, adapters, storage,
events, jobs and AI/tool boundaries.

### Recommended Design Rules

Rules in this category guide design but may not be immediate compiler errors.

Examples include preferring composition over inheritance, contracts over hidden
dispatch, typed views over raw model output and bounded caches over unbounded
runtime state.

See [Design Principles](rules-design-principles.md) for the rules that sit at the
top of this category — the identity sentence as a feature gate, coherency over
consistency, the grug test and the dual-audience rule.

### Future / Research Concepts

Concepts in this category are long-term planning or research.

Examples include advanced native output, full GPU/NPU execution, photonic
compute, quantum compute targets, neuromorphic workloads, autonomous AI
ecosystems and formal proofs beyond boundary safety.

## AI Instruction

AI tools must not promote a future/research concept into v1 scope unless the
repository requirements, tasks and package boundaries explicitly support it.

AI tools must reject or redesign suggestions that violate non-negotiable rules.

## Knowledge Base

See [Priority Categories](../Knowledge-Bases/priority-categories.md).
