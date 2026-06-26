# Galerina Financial Markets

Galerina financial-markets work is centered on typed, auditable and resilient
market systems. The product direction is not to make a finance application
depend on any single implementation language. Galerina should define the domain
contracts, safety rules, runtime reports and integration boundaries that make a
financial system understandable before it is optimized.

## Scope

This document covers Galerina positioning for:

- market data ingestion and normalization
- order-intent validation and routing boundaries
- pre-trade and post-trade risk checks
- strategy, simulation and backtesting contracts
- execution reports, audit trails and replay-safe workflows
- latency, throughput and failure-behaviour requirements

It is an application and architecture document. Galerina language syntax belongs
in `packages-galerina/galerina-core/`, not in this file.

## Galerina Responsibilities

Galerina should make financial workflows explicit and reviewable:

- represent market, order, fill, risk and report data with strict types
- model workflows as controlled flows with declared inputs, outputs and errors
- separate strategy intent from execution permissions
- require explicit handling for partial fills, rejected orders, stale prices and
  timeout outcomes
- produce privacy-safe audit reports for decisions, policy checks and runtime
  failures
- keep replay, idempotency and correlation identifiers visible at API and queue
  boundaries

The core product value is the policy and contract layer: Galerina describes what
must be true, what may happen next and what evidence must be emitted.

## Runtime Direction

Financial systems need predictable operational behaviour. Galerina runtime and
package planning should prioritize:

- deterministic validation before external side effects
- bounded retry and recovery policy
- explicit clock, latency and freshness constraints
- circuit-breaker, quarantine and manual-review states
- typed reports for risk decisions, execution events and resilient flows
- benchmarkable package behaviour without making benchmark tooling part of
  production by default

Low-level runtime components may be implemented in an appropriate systems
language when native performance, memory safety or exchange connectivity
requires it. That implementation choice should remain behind Galerina package,
API or runtime adapter boundaries.

## Architecture Shape

A practical Galerina-centered financial-markets system separates concerns:

- Galerina contracts define domain data, policy gates and report schemas.
- Galerina flows define validation, risk, routing and recovery behaviour.
- Runtime adapters connect to market data feeds, brokers, exchanges, storage and
  message queues.
- Research and modelling tools can feed candidate strategy inputs into typed
  Galerina simulation and approval flows.
- Reports preserve the audit trail across ingestion, decision, execution and
  reconciliation.

This keeps the finance product centered on Galerina while still allowing
specialized runtimes and external tools where they are the right execution
target.

## Package Alignment

Financial-markets planning should align with existing Galerina package areas:

- `galerina-core-security` for policy, secret handling and cryptographic controls
- `galerina-core-runtime` for deterministic runtime and adapter boundaries
- `galerina-core-reports` for audit, diagnostic and execution report contracts
- `galerina-core-compute` and `galerina-core-vector` for simulation, numeric and
  matrix/tensor-oriented contracts
- `galerina-tools-benchmark` for non-production diagnostics and benchmark reports

Finance-specific package planning that is archived outside this workspace must
not be treated as part of the active v1 build graph unless it is explicitly
reintroduced through the package-profile process.

## Safety Rules

Galerina finance-facing work must treat money movement and market action as
high-risk side effects:

- validate all external input at the boundary
- require explicit authorization policy before order submission
- make stale market data and delayed decisions visible as typed failure states
- record correlation identifiers across every external call and queue message
- never store real credentials or broker secrets in source control
- prefer dry-run, simulation and review modes before live execution paths
- document any architecture, security, API or deployment behaviour changes in
  the relevant project docs

## Non-Goals

Galerina financial-markets documentation should not become:

- an implementation guide for another runtime
- a broker-specific integration manual
- a mandatory ORM, CMS, admin UI or frontend-framework design
- language syntax documentation for Galerina core

Implementation-language notes are allowed only when they clarify an adapter,
runtime target or interoperability boundary.
