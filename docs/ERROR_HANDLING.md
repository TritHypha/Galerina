
---

# `docs/ERROR_HANDLING.md`

```md
# Error Handling

## Purpose

This document explains how the app should handle errors.

## Core Principles

- Errors should be explicit.
- User-facing errors should be safe.
- Internal logs should contain useful debugging information.
- Sensitive data must not be logged.
- Failed operations should not leave the app in an unsafe state.

## Galerina Error Handling Expectations

Where useful, Galerina code should handle:

- undefined values
- expected errors
- unexpected errors
- rollback or backwards logic
- waiting states
- failed external calls

## User-Facing Errors

User-facing errors should be simple and safe.

Example:

```text
Something went wrong. Please try again.