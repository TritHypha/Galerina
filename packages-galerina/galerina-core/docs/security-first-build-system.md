# Galerina Security-First Build System

This document defines Galerina as a **security-first build system**, not only a compiler.

Galerina should not silently translate `.spore` into JavaScript, WASM, native output or reports. It should check, test, explain and report before producing output.

---

## Purpose

A good Galerina compile command should be:

```bash
Galerina build
```

Internally, it should behave like a guardian pipeline:

```text
1. Read boot.spore
2. Run startup validation
3. Parse code
4. Type-check code
5. Check imports and target rules
6. Run security checks
7. Run memory checks
8. Run vector/offload safety checks
9. Run tests when configured
10. Generate compiler reports
11. Generate suggestions
12. Compile output
```

Core idea:

```text
Galerina does not compile unsafe code silently.
Galerina checks, tests, explains, reports, and suggests before producing output.
```

---

## Status

Current prototype:

```text
Implemented: parse/check/build command skeleton
Implemented: type, target, memory, security and source-map diagnostics
Implemented: generated reports and docs
Implemented: prototype test command
Planned: build --with-tests
Planned: build --strict
Planned: full startup validation report
Planned: build-time vector/offload safety checks
Planned: AI suggestions report
Planned: test report output
```

---

## Startup Validation

Before `main()` runs or a production build writes output, Galerina should validate
the project configuration.

Startup validation should check:

```text
boot.spore is valid
entry file exists
main() exists
required env variables exist
secrets are not empty
global values match declared types
aLOwed ports match server.listen()
API methods match security policy
routes have handlers
webhooks have HMAC/replay/idempotency if required
packages are registered before use
package permissions are valid
JSON body limits are set
memory/cache policies are valid
```

Detailed planning lives in `docs/startup-validation.md`.

---

## Build Commands

Recommended commands:

```bash
Galerina test
Galerina build
Galerina build --with-tests
Galerina build --security
Galerina build --strict
```

Suggested defaults:

```text
Galerina build              = run essential checks and generate output
Galerina build --with-tests = run tests before output
Galerina build --security   = run security-focused checks and reports
Galerina build --strict     = fail on warnings
```

---

## Compiler as Guardian

Galerina should reject unsafe target/import combinations.

Example:

```Galerina
target browser

import server.database
```

Compiler error:

```text
galerina-ERR-SECURITY-001: Server-only import cannot be used in browser target.
```

Details:

```text
Import: server.database
Reason: Browser code is public and cannot contain database access.
Suggestion: Move database access to a server target or API endpoint.
```

---

## Vector and Offload Guardrails

Vector blocks should be checked before optimisation.

Example:

```Galerina
let results = vector users {
  user => saveToDatabase(user)
}
```

Compiler error:

```text
galerina-ERR-VECTOR-SECURITY-001: Database write found inside vector block.
```

Reason:

```text
Vector blocks must be pure by default.
```

Suggestion:

```Galerina
let cleanedUsers = vector users {
  user => cleanUser(user)
}

saveUsers(cleanedUsers)
```

Offload nodes should be checked for:

```text
CPU budget
memory budget
queue limit
timeout
failure policy
aLOwed effects
borrowed value lifetime
secret handling
```

---

## Tests in the Build Pipeline

Tests should be available as part of the compile pipeline.

Commands:

```bash
Galerina test
Galerina build --with-tests
```

Rules:

```text
test failures block output when fail_on_test_failure is true
test reports should be generated in build output
test diagnostics should be source-mapped
security tests may be required for strict builds
```

Example report:

```text
build/app.test-report.json
```

---

## Suggestions

Galerina should suggest fixes and improvements.

It should not only say what is wrong.

Example safety suggestion:

```text
Suggestion:
Move saveToDatabase(user) outside the vector block.
```

Example optimisation suggestion:

```text
Suggestion:
This loop may be suitable for vector syntax.
```

Current:

```Galerina
for item in order.items {
  totals.add(item.price * item.quantity)
}
```

Suggested:

```Galerina
let totals = vector order.items {
  item => item.price * item.quantity
}
```

Suggestions should be reviewable. Galerina should not silently rewrite source files.

---

## Build Configuration

Suggested `boot.spore` option:

```Galerina
boot {
  compiler {
    run_tests true
    run_security_checks true
    run_memory_checks true
    generate_suggestions true
    fail_on_security_warning true
    fail_on_test_failure true
  }
}
```

Stricter option:

```Galerina
boot {
  compiler {
    mode security_first
    run_tests always
    run_security_checks always
    run_memory_checks always
    run_vector_checks always
    generate_suggestions true
    fail_on_warning true
  }
}
```

---

## Build Reports

Galerina should generate reports like:

```text
build/app.security-report.json
build/app.test-report.json
build/app.memory-report.json
build/app.vector-report.json
build/app.target-report.json
build/app.ai-suggestions.md
```

These reports support human review and AI-assisted development.

AI tools should be able to read reports instead of scanning the whole project.

---

## Standard Build Pipeline

Recommended production build pipeline:

```text
load project
parse source
build AST
type-check
target/capability check
import check
security check
memory check
vector/offload check
test when configured
lower to checked IR
generate reports
generate suggestions
compile target outputs
write source maps
write build manifest
verify required outputs
```

Important rule:

```text
Checks happen before output where possible.
Reports explain both failures and successful fallbacks.
```

---

## Strict Mode

Strict builds should fail on warnings.

Example:

```bash
Galerina build --strict
```

Equivalent policy:

```Galerina
compiler {
  fail_on_warning true
  fail_on_security_warning true
  fail_on_target_fallback true
  fail_on_unreported_memory_pressure true
}
```

Strict mode is useful for:

```text
production releases
security-sensitive services
payment flows
regulated workflows
CI/CD gates
release signing
```

---

## AI Integration

Galerina suggestions should be emitted in machine-readable and human-readable forms.

Recommended outputs:

```text
build/app.ai-suggestions.md
build/app.ai-suggestions.json
build/app.failure-report.json
build/app.source-map.json
build/app.map-manifest.json
```

The AI suggestions should include:

```text
source file
source line
diagnostic code
category
risk level
reason
suggested fix
safe pattern
whether the fix can be automated
```

---

## Non-Goals

The security-first build system should not:

```text
silently rewrite source files
hide unsafe fallbacks
skip security checks for convenience
compile browser code with server secrets
optimise vector/offload code before safety checks
overwrite the last good AI guide after failed builds unless configured
claim real accelerator execution when only planning artefacts exist
```

---

## Recommended v0.1 Boundary

The v0.1 build-system boundary should be small:

```text
parse source
type-check source
check target/import rules
run basic security checks
run basic memory checks
generate core reports
generate source maps
compile placeholder CPU/WASM/planning outputs
verify required outputs
```

Planned after v0.1:

```text
build --with-tests
build --strict
app.test-report.json
app.vector-report.json
app.ai-suggestions.md
browser import blocking
vector/offload safety checks
```

---

## Final Rule

```text
Galerina is not only a translator.
Galerina is a security-first build system.
It should check, test, explain, report and suggest before producing output.
```
