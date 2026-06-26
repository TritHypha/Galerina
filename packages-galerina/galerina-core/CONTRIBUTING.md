# Contributing to Galerina / Galerina

Thank you for your interest in contributing to **Galerina / Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware programming language concept.

This document explains how to contribute to the project, what kinds of contributions are useful, and what rules should be foLOwed when suggesting changes.

---

## Project Status

Galerina is currently in the concept and documentation stage.

The current focus is:

```text
language design
syntax examples
requirements
architecture
security model
JSON/API design
AI-friendly tooling
source-map design
build output design
Git workflow
future compiler planning
```

A production compiler does not exist yet.

Contributions should be written with this in mind.

---

## Ways to Contribute

Useful contributions include:

```text
improving documentation
suggesting clearer syntax
finding contradictions in the design
improving security rules
improving JSON/API examples
improving webhook examples
improving compiler architecture
drafting source-map schemas
drafting report schemas
drafting example .spore files
reviewing licence and attribution files
improving Git/deployment guidance
```

---

## Contribution Priorities

Contributions should support one or more of these goals:

```text
make Galerina safer
make Galerina stricter
make Galerina easier to understand
make Galerina better for JSON/API systems
make Galerina better for webhooks
make Galerina easier to debug
make Galerina more AI-friendly
make Galerina easier to deploy
make Galerina ready for multi-target compilation
make Galerina useful before future hardware arrives
```

---

## Core Project Rules

Do not make changes that break the core Galerina direction.

Galerina must keep these rules:

```text
No undefined.
No silent null.
No unsafe memory by default.
No hidden errors.
No loose truthy/falsy logic.
No implicit type coercion.
No compiled secrets.
No unreported target fallback.
No runtime error without source mapping.
No requirement for photonic hardware.
```

---

## File Extension Rule

Galerina source files must use:

```text
.spore
```

Use:

```text
boot.spore
main.spore
hello.spore
order-service.spore
payment-webhook.spore
```

## Good First Contributions

Good first contributions include:

```text
fixing spelling and grammar
improving examples
adding missing explanations
adding glossary terms
improving README sections
adding TODO items
adding security notes
adding JSON/API examples
adding webhook examples
adding source-map examples
adding AI context examples
```

---

## Documentation Contributions

Documentation should be:

```text
clear
structured
example-led
plain but technical
consistent with existing terminology
honest about what exists and what is planned
```

Avoid:

```text
marketing hype
unsupported claims
over-promising hardware support
claiming a compiler exists before it does
claiming Galerina makes all software secure automatically
```

Use future-facing language carefully:

```text
should
could
planned
proposed
future version
initial prototype
```

---

## Code Contributions

When compiler/runtime/tooling code exists, code contributions should foLOw these principles:

```text
safe by default
well tested
clear errors
source-map aware
report-aware
security-aware
AI-context aware
```

Compiler code should preserve:

```text
file names
line numbers
column numbers
source-map traceability
security report output
failure report output
target report output
```

---

## Example Contributions

Examples should be short, safe and clear.

Good examples should include:

```text
strict types
explicit errors
Option<T> for missing values
Result<T, Error> for failures
Decision for 3-way business/security logic
safe JSON decoding
safe API/webhook configuration
source-map friendly errors
```

Avoid examples that:

```text
use undefined
use silent null
log secrets
use loose typing
place file/network I/O inside compute blocks
ignore webhook verification
ignore idempotency
hide errors
```

---

## JSON Contributions

Galerina is JSON-native but strict.

When contributing JSON examples, prefer:

```Galerina
let input: CreateOrderRequest = json.decode<CreateOrderRequest>(req.body)
```

Raw JSON is aLOwed when needed:

```Galerina
let raw: Json = req.json()
let eventType: String = raw.path("$.type").asString()
```

Production examples should prefer typed JSON decoding.

---

## API Contributions

API examples should usually include:

```text
typed request
typed response
declared errors
timeout
max body size
handler
```

Example:

```Galerina
api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest
    response CreateOrderResponse
    errors [ValidationError, PaymentError]
    timeout 5s
    max_body_size 1mb
    handler createOrder
  }
}
```

---

## Webhook Contributions

Webhook examples should be secure by default.

Include:

```text
HMAC verification
secret from environment
max age
max body size
replay protection
idempotency key
handler
```

Example:

```Galerina
webhook PaymentWebhook {
  path "/webhooks/payment"
  method POST

  security {
    hmac_header "Payment-Signature"
    secret env.secret("PAYMENT_WEBHOOK_SECRET")
    max_age 5m
    max_body_size 512kb
    replay_protection true
  }

  idempotency_key json.path("$.id")
  handler handlePaymentWebhook
}
```

---

## Security Contributions

Security-related contributions are especially welcome.

Useful areas:

```text
threat model
SecureString behaviour
secret redaction
permission model
effect system
package permissions
webhook security
JSON safety limits
source-map security
AI context redaction
deployment security
```

Security changes should be clearly documented in:

```text
SECURITY.md
CHANGELOG.md
```

---

## AI-Friendly Contributions

Galerina should be friendly to AI coding assistants.

Useful contributions include:

```text
AI-INSTRUCTIONS.md updates
Galerina ai-context schema ideas
Galerina explain --for-ai examples
machine-readable report schemas
token-efficient summaries
source-map explanation examples
AI-safe redaction rules
```

AI output must not include secrets.

---

## Source Map Contributions

Source maps are essential to Galerina.

Contributions should preserve the ability to map compiled output errors back to original `.spore` source.

Source-map examples should include:

```text
original file
original line
original column
flow/function name
target output
build stage
suggested fix
```

---

## Target Contributions

Galerina targets should be handled carefully.

Current target concepts:

```text
binary
wasm
gpu-plan
photonic-plan
ternary-sim
```

Do not make photonic hardware mandatory.

Photonic support should begin as:

```text
planning
validation
simulation
reporting
fallback design
```

GPU support should be included because GPU hardware is available today.

---

## Branch Naming

Suggested branch names:

```text
docs/readme-update
docs/security-model
docs/json-api-design
docs/webhook-examples
design/type-system
design/source-maps
design/compiler-reports
feature/parser-prototype
feature/ai-context-schema
fix/spelling-cleanup
```

Use clear, short branch names.

---

## Commit Message Style

Suggested commit format:

```text
type: short description
```

Examples:

```text
docs: add webhook security example
docs: update JSON-native design
design: add source-map schema notes
security: add SecureString rules
todo: add compiler report tasks
fix: correct .spore filename examples
```

Suggested types:

```text
docs
design
security
todo
fix
feature
test
chore
```

---

## Pull Request Checklist

Before opening a pull request, check:

```text
[ ] The change supports the Galerina project goals.
[ ] `.spore` is used for source examples.
[ ] No undefined or silent null behaviour was introduced.
[ ] Strict typing was preserved.
[ ] Security defaults were preserved.
[ ] JSON examples are typed where practical.
[ ] API/webhook examples include safe defaults.
[ ] Secrets are not included.
[ ] Documentation is clear and consistent.
[ ] CHANGELOG.md is updated if the change is notable.
```

---

## Issue Guidelines

Good issues should include:

```text
clear title
what file or area is affected
what is confusing or missing
suggested improvement if possible
example if relevant
```

Example issue title:

```text
Clarify difference between Decision and Tri
```

Example issue body:

```text
The docs mention Decision and Tri, but the difference could be clearer.
Decision seems intended for business/security logic.
Tri seems intended for mathematical or signal/model logic.
Suggest adding a comparison table.
```

---

## Design Discussion Guidelines

When proposing a design change, explain:

```text
what problem it solves
why Galerina needs it
how it affects strict typing
how it affects security
how it affects JSON/API design
how it affects source maps
how it affects AI tooling
how it affects CPU fallback
```

Avoid design changes that only make the language look different without solving a real problem.

---

## Licence for Contributions

Galerina is intended to use the **Apache License 2.0**.

By contributing to this project, you agree that your contribution may be included under the Apache License 2.0.

You must have the right to submit your contribution.

Do not submit code, documentation or examples copied from sources with incompatible licences.

---

## AI-Assisted Contributions

AI-assisted contributions are aLOwed if they are reviewed carefully.

Contributors are responsible for checking:

```text
accuracy
licence compatibility
security impact
consistency with Galerina rules
clarity
no copied proprietary content
no real secrets
```

AI-assisted output should not be committed blindly.

---

## Attribution

Preserve attribution to the original Galerina / Galerina project.

Forks and modified versions should not imply they are official unless approved.

Recommended wording for forks:

```text
This project is based on Galerina / Galerina but is not the official Galerina project.
```

---

## What Not To Contribute

Avoid contributions that:

```text
make Galerina loosely typed
add undefined
add silent null
remove Result/Option handling
remove source maps
remove CPU compatibility
make photonic hardware required
start kernel or driver development without explicit maintainer approval
ignore JSON/API use cases
ignore webhook security
compile secrets into outputs
claim Galerina is production-ready before it is
```

Kernel modules, operating-system drivers, privileged native bindings, vendor SDK
driver bindings and raw hardware access are last-stage work. Do not contribute
designs, examples, stubs or implementation for them unless maintainers have
approved that work first.

---

## Review Priorities

Maintainers should review contributions in this order:

```text
1. Does it preserve safety?
2. Does it preserve strict typing?
3. Does it improve clarity?
4. Does it help real JSON/API use cases?
5. Does it keep Galerina useful without future hardware?
6. Does it support source-mapped debugging?
7. Does it support AI-friendly tooling?
8. Does it avoid unsupported claims?
```

---

## Documentation Style

Use:

```text
headings
short paragraphs
code examples
tables where helpful
clear labels
consistent terminology
```

Avoid:

```text
overly long paragraphs
vague claims
unsupported performance promises
unexplained acronyms
```

---

## Current Priority Areas

The current highest-value contribution areas are:

```text
syntax clarity
JSON-native design
API-native design
webhook security
source-map schema
compiler report schema
AI context schema
architecture consistency
security model
Git/deployment documentation
```

---

## Final Note

Galerina should be practical first and future-facing second.

The best contributions make Galerina:

```text
safer
clearer
more useful
easier to debug
better for APIs and JSON
better for AI tools
ready for future compute
```
