# Galerina Compatibility

This document defines compatibility policy for **Galerina / Galerina**.

Compatibility in Galerina applies to more than source syntax. It also applies to the
compiler CLI, generated reports, schemas, manifests, source maps and target
planning outputs.

Galerina is still pre-1.0. That means compatibility should be managed carefully, but
the project does not yet promise the same stability level that a 1.x language
release would promise.

## Compatibility Scope

Galerina compatibility is tracked across these layers:

```text
language source compatibility
project structure compatibility
compiler CLI compatibility
generated report/schema compatibility
target and fallback compatibility
deployment/build artefact compatibility
documentation compatibility
```

## Version Dimensions

Galerina should track versioning in separate but related dimensions:

```text
language version          = syntax and semantic contract
compiler version          = implementation/prototype release
schema/report version     = generated JSON and manifest contracts
build artefact version    = deployable output format contract
```

These may move together in early versions, but they should be treated as
separate concepts in the long term.

## Current Stage Policy

Current repository stage:

```text
0.x prototype
```

Current expectation:

```text
breaking changes are still allowed
breaking changes must be documented
examples, schemas and docs should be updated in the same change
prototype behaviour must not be described as stable unless explicitly marked
```

Practical rule:

```text
0.x means "changing with documentation"
1.x should mean "stable by default"
```

## Source Compatibility Policy

Source compatibility answers the question:

```text
Will an older `.spore` project still parse and mean the same thing?
```

Policy:

```text
patch version   = no intentional source-language break
minor version   = additive changes preferred; source breaks should be rare and documented
major version   = breaking syntax or semantic changes allowed with migration notes
```

Before 1.0, a minor version may still contain breaking source changes, but only
when the design materially improves and the migration path is documented.

Preferred source-compatibility rules:

```text
do not silently change the meaning of valid code
do not widen loose behaviour into previously strict behaviour
do not reuse syntax for a conflicting meaning without a version boundary
prefer additive keywords or blocks over semantic overload
```

## Semantic Compatibility Policy

Parsing compatibility alone is not enough. Galerina also tracks semantic
compatibility.

A release is semantically compatible only if existing valid code keeps the same
meaning for:

```text
types
missing-value handling
error handling
security defaults
target fallback behaviour
generated diagnostics intent
```

The following require explicit compatibility notes when changed:

```text
Option/Result/Decision/Tri semantics
default security profile behaviour
default memory behaviour
compute block restrictions
target fallback ordering
report redaction rules
```

## Project Structure Compatibility

The Git repository represents the Galerina package root. Paths inside this repository
should remain root-relative.

Compatible examples:

```text
compiler/galerina.js
examples/hello.spore
schemas/ai-context.schema.json
docs/type-system.md
```

Incompatible inside this repository:

```text
packages-galerina/galerina-core/compiler/galerina.js
packages-galerina/galerina-core/examples/hello.spore
packages-galerina/galerina-core/schemas/ai-context.schema.json
packages-galerina/galerina-core/docs/type-system.md
```

Project layout compatibility should preserve the meaning of established
top-level files such as:

```text
README.md
SPEC.md
COMPATIBILITY.md
AI-INSTRUCTIONS.md
TODO.md
boot.spore
build/
docs/
schemas/
```

## CLI Compatibility Policy

CLI compatibility covers command names, flag meaning, exit-code intent and
machine-consumable output modes.

Policy:

```text
existing command names should not be repurposed silently
existing flags should not change meaning without documentation
human-readable output may improve over time
machine-readable modes need stronger stability
exit codes should remain stable for success/failure meaning
```

Commands that deserve stronger compatibility protection:

```text
Galerina build
Galerina check
Galerina verify
Galerina targets
Galerina ai-context
Galerina explain --for-ai
```

If output must change incompatibly for machine consumers, the project should
prefer one of these approaches:

```text
add a version field
add a new output mode or flag
document a schema/version bump
deprecate the old form before removal where practical
```

## Generated Report and Schema Compatibility

Generated JSON reports are part of Galerina's tool contract.

Examples:

```text
app.failure-report.json
app.security-report.json
app.target-report.json
app.runtime-report.json
app.memory-report.json
app.ai-context.json
app.build-manifest.json
app.source-map.json
app.map-manifest.json
docs/docs-manifest.json
```

Compatibility policy for reports:

```text
required fields should not disappear silently
field meaning should not change silently
new fields may be added in additive releases
secret-redaction guarantees must not weaken
machine-readable reports should carry explicit version identifiers over time
```

Schema compatibility policy:

```text
additive fields = compatible for tolerant readers
field rename/removal = breaking unless versioned
type changes for existing fields = breaking
redaction-to-plain-text change = breaking and usually disallowed
```

## Source Map Compatibility

Source maps are a compatibility promise between generated outputs and original
`.spore` code.

At minimum, source-map compatibility should preserve:

```text
original file path
original line
original column
flow/function identity where available
build stage
target identity where relevant
suggested fix or related diagnostic guidance
```

If source-map structure changes, `Galerina explain` and `Galerina explain --for-ai` must
either remain compatible or clearly version their inputs/outputs.

## Target Compatibility Policy

Galerina supports multiple targets, but compatibility guarantees are asymmetric.

Baseline rule:

```text
CPU compatibility is the required baseline
accelerator support is additive
fallback must be reported
```

Target compatibility means:

```text
the language can describe work for the target
the compiler can validate target suitability
the reports explain when the target is unavailable or restricted
```

It does not automatically mean:

```text
a real production backend exists
hardware support is complete
all targets preserve identical performance characteristics
```

Target compatibility notes must be explicit when changing:

```text
blocked operations
fallback rules
precision expectations
CPU-reference verification policy
browser/server import restrictions
logic-width support
```

## Logic Compatibility

Galerina starts with binary and ternary concepts, but it must not become ternary-only.

Preferred future-safe terminology:

```text
logic-width
logic-mode
logic-state
logic-target
omni-logic
multi-state
```

Compatibility rule:

```text
ternary support may expand, but future logic-width support must not be blocked by ternary-specific naming assumptions
```

## Development Output vs Production Output Compatibility

Development-generated outputs and production build outputs are intentionally
different.

```text
development outputs = checked reports and generated docs for iteration
production outputs  = compile, hash, verify and package deployable artefacts
```

Compatibility rule:

```text
development output changes should not silently break production verification
production output contracts should remain stricter than development output contracts
```

`Galerina generate`, `Galerina dev` and `Galerina run --generate` may evolve quickly, but `Galerina
build` and `Galerina verify` should move more conservatively.

## Deployment Compatibility

Galerina aims for build-once deploy-many.

Deployment compatibility requires stable expectations for:

```text
build manifest shape
artefact hashing
source-map separation
runtime environment loading
verification flow
rollback metadata
```

Secrets compatibility rule:

```text
deployment methods may change
secret-redaction and no-compiled-secrets rules must not weaken
```

## Documentation Compatibility

Root files should remain stable entry points. Detailed topic expansion should
live in `docs/`.

When a root file and a `docs/` file overlap:

```text
the root file should stay concise and normative or navigational
the docs file may carry detail
they must not contradict each other
```

Examples and generated docs should be updated when compatibility-sensitive
behaviour changes.

## Deprecation Policy

When Galerina needs to replace a syntax form, report field or CLI flag, the preferred
process is:

```text
1. document the old form as deprecated
2. introduce the replacement
3. update examples, schemas and docs
4. keep both forms for a transition period when practical
5. remove the old form only with explicit release notes
```

For 0.x prototype work, the transition period may be short, but removal should
still be documented.

## Compatibility Checklist for Breaking Changes

Any intentional compatibility break should answer:

```text
what layer is breaking
why the break is necessary
what old behaviour looked like
what new behaviour looks like
how users migrate
which docs/examples/schemas were updated
whether CLI or machine-readable reports need version bumps
```

## Summary

Galerina compatibility should be strict where automation depends on it and flexible
only where the project is still honestly experimental.

The core compatibility promise is:

```text
keep source meaning explicit
keep CPU usefulness intact
keep machine-readable outputs explainable
keep secrets redacted
document every real break
```
