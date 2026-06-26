# Contracts: Overview

## Purpose

Contracts define explicit boundary agreements in Galerina applications.

## Short Definition

A contract states the shape, behavior, permissions and reports expected at a
boundary.

## Contract Order

```text
request  = what enters
response = what leaves
model    = internal data
flow     = execution boundary
policy   = allowed behavior
package  = code boundary
storage  = persistence boundary
external = outside-system boundary
event    = async boundary
AI/tool  = agent/tool boundary
compute  = target/planning boundary
```

## Security Rules

- Public boundaries require explicit contracts.
- Contract fields must be typed.
- Secrets and sensitive data must be classified.
- Contract reports must be safe for AI and reviewer use.

## Generated Reports

```text
contract-index-report.json
contract-definition-report.json
contract-effective-report.json
```

## v1 Scope

Request, response, model, flow, policy and package contracts.
