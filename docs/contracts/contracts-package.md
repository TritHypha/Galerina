# Contracts: Package

## Purpose

A package contract defines what a reusable Galerina package provides and what
authority it requires.

## Short Definition

Package contracts are code boundary agreements.

## Security Rules

- Packages must declare effects and permissions.
- Production profiles must not enable development-only packages by default.
- Package resolution must be reproducible.
- Package reports must expose authority and trust decisions.

## Generated Reports

```text
package-authority-report.json
package-policy-report.json
dependency-report.json
```

## v1 Scope

Package boundaries, effect declarations, profile rules and report output.
