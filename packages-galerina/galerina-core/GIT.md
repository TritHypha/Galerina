# Galerina Git Workflow

This document defines the recommended Git workflow for the **Galerina / Galerina** language repository.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware programming language concept.

This document is for the Galerina language/project repository itself, not for applications built with Galerina.

For compiled Galerina application Git guidance, see:

```text
COMPILED_APP_GIT.md
```

---

## Purpose

The purpose of this document is to keep the Galerina repository organised, traceable and easy to contribute to.

Git should be used to track:

```text
language design
documentation
examples
compiler prototypes
runtime prototypes
tooling
tests
security rules
architecture decisions
release history
```

Git should not be used to store:

```text
real secrets
local .env files
temporary build output
local caches
generated debug artefacts
private keys
```

---

## Repository Type

This repository is for the Galerina language project.

It may contain:

```text
documentation
language specification drafts
example .spore files
compiler source code
runtime source code
tooling source code
tests
schemas
GitHub workflows
project metadata
```

It should not normally contain compiled Galerina application artefacts unless they are small intentional examples.

---

## Recommended Repository Structure

```text
Galerina/
├── README.md
├── ABOUT.md
├── CONCEPT.md
├── LICENSE
├── LICENCE.md
├── NOTICE.md
├── REQUIREMENTS.md
├── DESIGN.md
├── TASKS.md
├── TODO.md
├── ROADMAP.md
├── ARCHITECTURE.md
├── SECURITY.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── AI-INSTRUCTIONS.md
├── CHANGELOG.md
├── GETTING_STARTED.md
├── DEMO_hello_WORLD.md
├── GIT.md
├── COMPILED_APP_GIT.md
├── .env.example
├── .gitignore
│
├── examples/
├── compiler/
├── runtime/
├── tooling/
├── docs/
├── tests/
└── build/
```

---

## Main Branch

The main stable branch should be:

```text
main
```

The `main` branch should contain:

```text
reviewed documentation
accepted design changes
working examples
stable project files
passing tests when tests exist
```

Direct commits to `main` should be avoided once the project has more than one contributor.

---

## Branch Protection

When the project becomes active, protect `main`.

Recommended protection rules:

```text
require pull request before merge
require at least one review
require status checks to pass
require branch to be up to date
prevent force pushes
prevent deletion
```

Optional later rules:

```text
require signed commits
require linear history
require security scan passing
require documentation build passing
```

---

## Development Branch

A development branch may be used later:

```text
dev
```

Use `dev` only if the project becomes active enough to need a staging branch.

Early-stage project:

```text
main + feature branches is enough
```

Larger project:

```text
main = stable
dev = integration
feature branches = work in progress
```

---

## Branch Naming

Use short, clear branch names.

Recommended format:

```text
type/topic
```

Examples:

```text
docs/readme-update
docs/security-model
docs/json-api-design
docs/webhook-examples
docs/git-workflow
design/type-system
design/source-maps
design/compiler-reports
feature/parser-prototype
feature/ai-context-schema
fix/spelling-cleanup
chore/repo-structure
```

---

## Branch Types

Suggested branch types:

| Type | Purpose |
|---|---|
| `docs/` | Documentation updates |
| `design/` | Language design or architecture updates |
| `feature/` | New compiler/runtime/tooling features |
| `fix/` | Corrections or bug fixes |
| `security/` | Security-related changes |
| `test/` | Test additions or fixes |
| `chore/` | Maintenance and repository tasks |
| `release/` | Release preparation |

---

## Commit Message Style

Use clear commit messages.

Recommended format:

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
chore: add Apache notice file
```

---

## Commit Types

Suggested types:

```text
docs
design
feature
fix
security
test
chore
refactor
release
todo
```

---

## Good Commit Examples

Good:

```text
docs: add API-native design section
security: define SecureString logging rules
design: add compute block restrictions
```

Poor:

```text
update
changes
stuff
fix things
more docs
```

---

## Commit Size

Keep commits focused.

Good:

```text
one commit for README update
one commit for SECURITY.md update
one commit for webhook examples
```

Avoid:

```text
one huge commit changing every file without explanation
```

Focused commits make review, rollback and changelog updates easier.

---

## Pull Requests

Pull requests should explain:

```text
what changed
why it changed
which files were affected
whether it affects syntax
whether it affects security
whether it affects examples
whether CHANGELOG.md was updated
```

Suggested pull request template:

```markdown
## Summary

Describe the change.

## Reason

Why is this needed?

## Affected Areas

- [ ] Documentation
- [ ] Syntax
- [ ] Security
- [ ] JSON/API design
- [ ] Webhooks
- [ ] Compiler architecture
- [ ] AI tooling
- [ ] Build/deployment
- [ ] Examples

## Checklist

- [ ] Uses `.spore` for source examples
- [ ] Preserves strict typing
- [ ] Preserves no undefined / no silent null
- [ ] Preserves source-map requirements
- [ ] Preserves CPU fallback
- [ ] Updates CHANGELOG.md if notable
```

---

## Issue Labels

Recommended issue labels:

```text
docs
design
syntax
security
json
api
webhooks
compiler
runtime
tooling
ai-context
source-maps
targets
gpu
photonic
ternary
good-first-issue
needs-decision
blocked
bug
enhancement
question
```

---

## Milestones

Suggested milestones:

```text
v0.1.0 documentation
v0.2.0 parser prototype
v0.3.0 type checker prototype
v0.4.0 JSON/API prototype
v0.5.0 target planning prototype
v0.6.0 AI tooling prototype
v1.0.0 stable specification
```

---

## Tags

Release tags should use:

```text
vMAJOR.MINOR.PATCH
```

Examples:

```text
v0.1.0
v0.2.0
v1.0.0
```

Documentation-only milestones may still use version tags while the project is in concept stage.

---

## Changelog

Update:

```text
CHANGELOG.md
```

when changes affect:

```text
language syntax
project structure
security rules
compiler architecture
target outputs
file names
licence model
JSON/API design
AI tooling
deployment model
```

Small typo fixes do not always need changelog entries.

---

## Versioning

Galerina should use semantic versioning once implementation begins.

Format:

```text
MAJOR.MINOR.PATCH
```

During the concept stage:

```text
0.1.0 = documentation bundle
0.2.0 = parser prototype
0.3.0 = type checker prototype
0.4.0 = JSON/API prototype
0.5.0 = target planning prototype
```

---

## Generated Files

Do not commit generated build files by default.

Usually ignore:

```text
build/
dist/
out/
target/
*.bin
*.wasm
*.gpu.plan
*.photonic.plan
*.ternary.sim
*.source-map.json
*.failure-report.json
*.security-report.json
*.target-report.json
*.ai-context.json
*.build-manifest.json
```

Exceptions may be made for small example snapshots in:

```text
examples/
docs/examples/
tests/fixtures/
```

If generated files are committed as fixtures, make that clear.

---

## Example Fixtures

Generated files may be committed if they are used as test fixtures.

Recommended folder:

```text
tests/fixtures/
```

Example:

```text
tests/fixtures/
├── hello.ast.json
├── hello.source-map.json
├── hello.failure-report.json
└── hello.ai-context.json
```

Fixture files should be small and intentional.

---

## Environment Files

Commit:

```text
.env.example
```

Do not commit:

```text
.env
.env.local
.env.production
.env.staging
.env.test
```

Real secrets must never be committed.

---

## Secret Scanning

Before committing, check for:

```text
API keys
passwords
private keys
tokens
database URLs with passwords
webhook secrets
cloud credentials
```

Recommended future tooling:

```text
secret scanning
pre-commit hooks
CI secret detection
```

---

## Source Maps

Source maps are important to Galerina, but production source maps may reveal source structure.

For the Galerina language repository:

```text
source-map examples may be committed as documentation or test fixtures
real production source maps should not be committed
```

Example fixture:

```text
tests/fixtures/source-maps/hello.source-map.json
```

---

## Documentation Changes

Documentation changes should be reviewed for:

```text
accuracy
consistency
no unsupported claims
correct .spore file naming
security-first language
clear examples
Apache-2.0 compatibility
```

Avoid claiming that features exist before they are implemented.

Use:

```text
should
planned
proposed
future version
concept
```

where appropriate.

---

## AI-Assisted Commits

AI-assisted work is aLOwed, but it must be reviewed.

Before committing AI-assisted content, check:

```text
accuracy
security
licence compatibility
no real secrets
no copied proprietary text
consistency with Galerina rules
```

Do not commit AI output blindly.

---

## Pre-Commit Checklist

Before committing:

```text
[ ] No real secrets added
[ ] `.spore` extension used correctly
[ ] Documentation is consistent
[ ] Strict typing rules preserved
[ ] Security defaults preserved
[ ] Source-map requirement preserved
[ ] CPU fallback preserved
[ ] CHANGELOG.md updated if needed
[ ] Generated files excluded unless intentional fixtures
```

---

## Pull Request Review Priorities

Review in this order:

```text
1. Does the change preserve safety?
2. Does it preserve strict typing?
3. Does it preserve JSON/API usefulness?
4. Does it preserve source-map debugging?
5. Does it preserve AI-friendly reporting?
6. Does it keep Galerina useful without future hardware?
7. Does it avoid unsupported claims?
8. Is the documentation clear?
```

---

## Merge Strategy

Recommended early strategy:

```text
squash merge for small documentation PRs
merge commit for larger design changes
release branches only when needed
```

Once the project has code, choose one consistent strategy.

Recommended:

```text
squash merge feature branches into main
```

This keeps history clean.

---

## Release Process

Suggested release process:

```text
1. Confirm tasks for release are complete
2. Update CHANGELOG.md
3. Update version references
4. Run tests/checks if available
5. Create release branch if needed
6. Merge into main
7. Tag release
8. Create GitHub release notes
```

Example tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

---

## Release Notes

Release notes should include:

```text
summary
added
changed
security
breaking changes
known limitations
next milestone
```

Example:

```text
Galerina v0.1.0 - Concept Documentation

Added:
- README
- Concept docs
- Security model
- Architecture notes
- AI instructions
```

---

## Handling Breaking Changes

Breaking changes should be clearly labelled.

Examples:

```text
renaming file extension
changing boot.spore structure
changing syntax
changing report schemas
changing security defaults
```

Migration notes should be included.

## GitHub Discussions

GitHub Discussions may be useful for:

```text
syntax proposals
architecture questions
security model discussion
JSON/API design
target planning
AI tooling ideas
future hardware discussion
```

Issues should be used for actionable work.

Discussions should be used for open-ended design.

---

## Decision Records

Important design decisions should eventually be tracked.

Recommended folder:

```text
docs/decisions/
```

Example files:

```text
docs/decisions/0001-use-galerina-extension.md
docs/decisions/0002-use-boot-galerina-entry.md
docs/decisions/0003-apache-2-license.md
docs/decisions/0004-json-native-design.md
```

Decision records should include:

```text
status
context
decision
consequences
alternatives considered
```

---

## Suggested Decision Record Template

```markdown
# Decision: [Title]

## Status

Accepted / Proposed / Rejected / Superseded

## Context

Why was this decision needed?

## Decision

What was decided?

## Consequences

What changes because of this?

## Alternatives Considered

What else was considered?
```

---

## CI/CD for the Galerina Repository

Future CI should check:

```text
documentation formatting
broken links
spelling where possible
example syntax validity
tests
secret scanning
licence checks
generated fixture consistency
```

Possible future workflow:

```text
on pull request:
  run docs checks
  run parser tests
  run linter tests
  run security checks
  run secret scan
```

---

## Git Ignore Rules

The repository should include:

```text
.gitignore
```

It should ignore:

```text
local environment files
secrets
build outputs
logs
caches
editor files
temporary files
```

It should keep:

```text
.env.example
Galerina.lock
source files
documentation
examples
test fixtures
```

---

## Forks

Forks are aLOwed under Apache-2.0.

Forks should not imply they are official unless approved.

Suggested wording:

```text
This project is based on Galerina / Galerina but is not the official Galerina project.
```

---

## Attribution

Preserve attribution through:

```text
LICENSE
NOTICE.md
README.md
Git history
release notes
```

Do not remove original attribution notices when redistributing covered material.

---

## Final Git Principle

Git should make Galerina easier to trust.

The repository should show:

```text
where ideas came from
who changed what
why decisions were made
what changed between versions
which files are source
which files are generated
what is safe to commit
what must stay private
```

A clear Git workflow supports Galerina’s wider goals:

```text
safety
traceability
debuggability
security
open collaboration
future-ready development
```
