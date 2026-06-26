# Galerina Check Configuration — `galerina.check.json`

**Phase: 69+ (extended `galerina check` command)**

## Overview

`galerina check` reads `galerina.check.json` (or `.galerinarc.json`) from the project root
and applies it as project-level configuration. All fields are optional — omitting
a field inherits the built-in default.

## File locations searched (in order)

1. `{targetDir}/galerina.check.json`
2. `{targetDir}/.galerinarc.json`
3. `{targetDir}/galerina.config.json`
4. `{cwd}/galerina.check.json`
5. `{cwd}/.galerinarc.json`

## Full schema

```json
{
  "profile": "production",

  "rules": {
    "SPORE-TAINT-001": "error",
    "SPORE-STYLE-001": "off",
    "SPORE-PROFILE-006": "warning"
  },

  "ignore": [
    "tests/**",
    "examples/**"
  ],

  "minSeverity": "warning",

  "security": false,
  "flowgraph": false
}
```

## Fields

### `profile`
Deployment profile applied to governance checks.
- `"dev"` — relaxed checks
- `"production"` — standard production checks (default)
- `"deterministic"` — strict deterministic mode
- `"strict"` — all rules at maximum severity

### `rules`
Per-diagnostic-code severity overrides.

| Severity | Meaning |
|---|---|
| `"error"` | Fails the check (exit code 2) |
| `"warning"` | Reported but does not fail |
| `"info"` | Informational only |
| `"off"` | Diagnostic suppressed entirely |

Example — turn off style advisory, keep security as error:
```json
{
  "rules": {
    "SPORE-STYLE-001": "off",
    "SPORE-TAINT-001": "error",
    "SPORE-SYNTAX-010": "error"
  }
}
```

### `ignore`
Array of path prefixes to skip. Simple prefix matching — `"tests/**"` skips
any file whose relative path starts with `tests/`.

### `minSeverity`
Minimum severity to report:
- `"info"` — show everything (default)
- `"warning"` — suppress info-only diagnostics  
- `"error"` — suppress warnings and info (CI mode)

### `security`
When `true`, runs `@galerina/devtools-security` checks (runSecurityAudit) on each file.
Adds ~2s per file. Recommended for CI pipelines, off by default for local speed.

### `flowgraph`
When `true`, runs `@galerina/devtools-flowgraph` checks (SPORE-GRAPH-001..006) on each file.
Detects cycles, dead flows, authority escalation, PII leakage, missing audit coverage.

## Rules at a Glance

- Config is optional — `galerina check` works without it, using built-in defaults.
- Config is loaded once per run, not per-file.
- `"off"` completely suppresses a diagnostic — it won't appear in output or affect exit code.
- `minSeverity: "error"` makes `galerina check` silent on warnings — useful for CI where only errors matter.

## Example: strict project config

```json
{
  "profile": "strict",
  "rules": {
    "SPORE-TAINT-001": "error",
    "SPORE-TAINT-003": "error",
    "SPORE-TAINT-005": "error",
    "SPORE-VAL-001": "error",
    "SPORE-VAL-002": "error",
    "SPORE-SYNTAX-010": "error",
    "SPORE-SYNTAX-LEGACY-001": "error",
    "SPORE-STYLE-001": "off"
  },
  "ignore": ["tests/**", "generated/**"],
  "minSeverity": "warning",
  "security": true,
  "flowgraph": true
}
```

## Example: CI pipeline config (errors only)

```json
{
  "profile": "production",
  "minSeverity": "error",
  "ignore": ["tests/**"],
  "security": true
}
```

## Diagnostic code reference

See `docs/Knowledge-Bases/compiler-diagnostics.md` for the full list of codes.
Key codes to configure:

| Code | What it checks | Recommended |
|---|---|---|
| SPORE-TAINT-001 | SQL injection | `"error"` |
| SPORE-TAINT-005 | HTTP header injection | `"error"` |
| SPORE-TAINT-006 | SSRF | `"error"` |
| SPORE-VAL-001/002 | safety_critical invariants | `"error"` |
| SPORE-SYNTAX-010 | `else if` hard error | `"error"` |
| SPORE-SYNTAX-LEGACY-001 | `with effects` removed | `"error"` |
| SPORE-STYLE-001 | Advisory only | `"off"` or `"warning"` |
| SPORE-PROFILE-006 | Missing runtime budget | `"warning"` |
| SPORE-GRAPH-001 | Cycle detected | `"error"` (requires `flowgraph: true`) |
| SPORE-GRAPH-005 | Missing audit coverage | `"warning"` (requires `flowgraph: true`) |
