# Git Workflow for Compiled Galerina Applications

This document explains how Git should be used for applications built with **Galerina / Galerina**.

This file is different from:

```text
GIT.md
```

`GIT.md` is for the Galerina language repository itself.

This document is for projects written in Galerina, such as:

```text
API services
webhook processors
JSON-heavy applications
worker services
MVC-style applications
AI workflow applications
compiled Galerina binaries
```

---

## Purpose

The purpose of this document is to define how a Galerina application should be stored, versioned, built and deployed using Git.

A Galerina application may compile into several outputs:

```text
CPU binary
WebAssembly
GPU plan
photonic plan
ternary simulation
OpenAPI file
JSON schemas
source maps
security reports
target reports
AI context files
build manifests
```

Git should clearly separate:

```text
source files
configuration templates
generated files
compiled artefacts
runtime secrets
deployment records
```

---

## Core Rule

The core rule is:

```text
Commit source.
Do not commit secrets.
Do not commit generated build output by default.
Use release artefacts for compiled files.
```

---

## Recommended Galerina App Structure

A typical Galerina application should look like this:

```text
my-galerina-app/
├── README.md
├── boot.spore
├── Galerina.config
├── Galerina.lock
├── .env.example
├── .gitignore
│
├── src/
│   ├── main.spore
│   ├── routes.spore
│   └── services/
│       ├── order-service.spore
│       ├── payment-service.spore
│       └── fraud-service.spore
│
├── app/
│   ├── controllers/
│   ├── models/
│   ├── views/
│   ├── middleware/
│   └── services/
│
├── components/
├── packages/
├── vendor/
├── config/
├── public/
├── storage/
├── tests/
└── build/
```

---

## Files That Should Be Committed

Commit these files:

```text
README.md
boot.spore
Galerina.config
Galerina.lock
.env.example
.gitignore
src/**/*.spore
app/**/*.spore
components/**/*.spore
config/**/*.spore
tests/**/*.spore
public assets where relevant
documentation
safe example files
```

Also commit:

```text
OpenAPI source definitions if manually maintained
JSON schema source definitions if manually maintained
deployment templates
Dockerfile if used
CI/CD workflow files
infrastructure-as-code files where appropriate
```

---

## Files That Should Not Be Committed

Do not commit:

```text
.env
.env.local
.env.production
.env.staging
real secrets
private keys
API keys
database passwords
local logs
local caches
temporary files
local build outputs
```

Do not commit by default:

```text
build/
dist/
out/
*.bin
*.wasm
*.gpu.plan
*.photonic.plan
*.ternary.sim
*.source-map.json
*.security-report.json
*.target-report.json
*.failure-report.json
*.ai-context.json
*.build-manifest.json
```

These files should usually be generated during build or stored as release artefacts.

---

## `.env` Handling

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

Example `.env.example`:

```env
APP_ENV=local
APP_PORT=8080
DATABASE_URL=
API_KEY=
WEBHOOK_SECRET=
```

Production secrets should come from:

```text
server environment variables
container secrets
cloud secrets managers
deployment platform secrets
```

---

## Compiled Files

Galerina compiled files may include:

```text
app.bin
app.wasm
app.gpu.plan
app.photonic.plan
app.ternary.sim
```

These should not normally be committed to the source repository.

Instead, store them as:

```text
GitHub release artefacts
CI/CD build artefacts
deployment artefacts
container images
release storage objects
package registry artefacts
```

---

## Why Not Commit Compiled Output?

Compiled output should usually be excluded from Git because:

```text
it can be regenerated
it can be large
it creates noisy diffs
it may vary by platform
it can include debug metadata
it may accidentally include sensitive paths
it makes source history harder to review
```

Git should track the source of truth.

The source of truth should be:

```text
.spore source files
configuration templates
lockfiles
tests
documentation
```

---

## When Build Artefacts May Be Committed

There are some exceptions.

Build artefacts may be committed if they are:

```text
small test fixtures
documentation examples
golden files for compiler tests
intentional demo outputs
required for reproducibility testing
```

Recommended location:

```text
tests/fixtures/
docs/examples/
examples/generated/
```

Example:

```text
tests/fixtures/hello/
├── hello.source-map.json
├── hello.failure-report.json
└── hello.ai-context.json
```

Do not commit production artefacts as fixtures.

---

## Source Maps

Galerina source maps are important for debugging.

Source maps connect compiled output back to original `.spore` source files.

Example:

```text
app.source-map.json
```

For local development:

```text
source maps may be generated locally
source maps should normally stay out of Git
```

For production:

```text
source maps should be stored securely
source maps should not be publicly exposed
source maps may be uploaded to a private error-reporting system
```

Commit source-map examples only if they are intentional test fixtures.

---

## Security Reports

Galerina may generate:

```text
app.security-report.json
```

Security reports can be useful, but they may include sensitive details such as:

```text
file paths
permission information
environment variable names
package permissions
webhook configuration
```

Do not commit production security reports by default.

Commit only:

```text
sanitised examples
test fixtures
documentation samples
```

---

## AI Context Files

Galerina may generate:

```text
app.ai-context.json
app.ai-context.md
```

These are intended to reduce AI token use and summarise project structure.

However, they may include:

```text
routes
types
file names
security settings
target settings
error summaries
environment variable names
```

Do not commit generated AI context files by default unless they are sanitised examples.

AI context files must not contain secret values.

---

## Build Manifest

Galerina should generate:

```text
app.build-manifest.json
```

The build manifest should include:

```text
project name
version
compiler version
build mode
targets
source hash
output hashes
dependency hashes
created timestamp
```

For application source repositories:

```text
do not commit local build manifests by default
```

For releases:

```text
store build manifests with release artefacts
```

A release should ideally contain:

```text
app.bin
app.wasm
app.build-manifest.json
app.security-report.json
app.target-report.json
```

depending on project policy.

---

## Release Artefact Structure

A release package might look like:

```text
release-v1.2.0/
├── app.bin
├── app.wasm
├── app.gpu.plan
├── app.photonic.plan
├── app.target-report.json
├── app.security-report.json
├── app.source-map.json
├── app.build-manifest.json
└── README-DEPLOY.md
```

Production source maps should be handled carefully.

If source maps are sensitive, store them separately:

```text
private-source-maps/
└── app.source-map.json
```

---

## Build Once, Deploy Many

Galerina applications should support build-once, deploy-many.

Recommended flow:

```text
1. Build once in CI/CD
2. Generate app.bin or app.wasm
3. Generate build manifest
4. Generate hashes
5. Store artefact
6. Deploy same artefact to each server
7. Each server loads its own environment variables
8. Run health checks
9. Roll back if needed
```

Example:

```text
Server A → same app.bin + production environment
Server B → same app.bin + production environment
Server C → same app.bin + production environment
```

The binary should be the same.

Runtime configuration should be different where needed.

---

## Deployment Environments

A Galerina app may have:

```text
local
development
staging
production
test
```

Environment-specific values should live outside compiled files.

Recommended approach:

```text
source code is the same
compiled artefact is the same
environment variables differ
```

Example:

```text
APP_ENV=production
DATABASE_URL=from server secret
WEBHOOK_SECRET=from server secret
```

---

## Branch Strategy for Galerina Apps

Recommended simple branch strategy:

```text
main
feature/*
fix/*
release/*
hotfix/*
```

### main

```text
stable production-ready source
```

### feature/*

```text
new work
```

Examples:

```text
feature/payment-webhook
feature/order-api
feature/fraud-risk-score
```

### fix/*

```text
normal bug fixes
```

Examples:

```text
fix/order-validation
fix/webhook-idempotency
```

### release/*

```text
release preparation
```

Example:

```text
release/v1.2.0
```

### hotfix/*

```text
urgent production fixes
```

Example:

```text
hotfix/payment-webhook-replay
```

---

## Commit Message Style

Recommended format:

```text
type: short description
```

Examples:

```text
api: add create order route
webhook: add payment succeeded handler
security: enforce webhook replay protection
json: add CreateOrderRequest validation
fix: handle PaymentStatus.Unknown
deploy: update production health check
docs: update deployment notes
```

Suggested types:

```text
api
webhook
json
security
feature
fix
deploy
docs
test
chore
```

---

## Pull Request Checklist

Before merging a Galerina application change:

```text
[ ] Source files use `.spore`
[ ] No `.env` file committed
[ ] No real secrets committed
[ ] No compiled build output committed unintentionally
[ ] JSON inputs are typed where practical
[ ] API routes include timeout and body size where relevant
[ ] Webhooks include verification and idempotency where relevant
[ ] Result and Option handling is explicit
[ ] match branches handle all important states
[ ] Source maps are enabled for debugging
[ ] Build manifest is generated in CI/CD
[ ] Security report has no high-risk warnings
```

---

## CI/CD Workflow

A Galerina application CI/CD pipeline should usually:

```text
checkout source
install Galerina toolchain
restore dependencies
run Galerina fmt check
run Galerina lint
run Galerina check
run tests
build release artefact
generate reports
generate build manifest
verify hashes
store artefacts
deploy to environment
run health checks
```

Example future command flow:

```bash
Galerina fmt --check
Galerina lint
Galerina check --target all
Galerina test
Galerina build --mode release --target all
Galerina verify build/release/app.build-manifest.json
```

---

## Example GitHub Actions Flow

Example future workflow:

```yaml
name: Galerina Build

on:
  push:
    branches:
      - main
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout source
        uses: actions/checkout@v4

      - name: Install Galerina
        run: |
          echo "Install Galerina toolchain here"

      - name: Check formatting
        run: Galerina fmt --check

      - name: Lint
        run: Galerina lint

      - name: Check targets
        run: Galerina check --target all

      - name: Test
        run: Galerina test

      - name: Build
        run: Galerina build --mode release --target all

      - name: Verify build
        run: Galerina verify build/release/app.build-manifest.json
```

---

## Release Tags

Use semantic version tags:

```text
v1.0.0
v1.1.0
v1.1.1
```

Example:

```bash
git tag v1.0.0
git push origin v1.0.0
```

---

## Release Notes

Release notes should include:

```text
summary
new API routes
new webhook handlers
security changes
migration notes
build artefact hashes
deployment notes
known issues
rollback instructions
```

Example:

```text
v1.2.0 - Payment Webhook Release

Added:
- PaymentWebhook handler
- HMAC verification
- idempotency key support

Security:
- Replay protection enabled
- Max body size set to 512kb

Artefacts:
- app.bin
- app.build-manifest.json
```

---

## Build Manifest in Releases

Every release should include a build manifest.

Example:

```json
{
  "project": "order-risk-api",
  "version": "1.2.0",
  "language": "Galerina",
  "compiler": "0.5.0",
  "mode": "release",
  "targets": ["binary", "wasm", "gpu-plan", "photonic-plan"],
  "sourceHash": "sha256:...",
  "binaryHash": "sha256:...",
  "createdAt": "2026-05-02T10:00:00Z"
}
```

The manifest helps confirm what was built and deployed.

---

## Rollback Strategy

Each production release should be rollback-friendly.

Recommended:

```text
keep previous release artefact
keep previous build manifest
keep previous deployment config
keep health check history
tag releases clearly
document rollback command
```

Rollback should use the previous known-good artefact.

Do not rebuild old releases unless necessary.

---

## Hotfix Strategy

For urgent fixes:

```text
1. Create hotfix branch from production tag
2. Apply minimal fix
3. Run checks
4. Build release artefact
5. Deploy to staging if possible
6. Deploy to production
7. Tag hotfix release
8. Merge back to main
```

Example branch:

```text
hotfix/webhook-replay-check
```

---

## Source Maps in Production

Recommended production approach:

```text
generate source maps
store source maps privately
do not expose source maps publicly
link runtime error reports to private source maps
```

Production runtime errors should show safe public messages.

Internal error reports can use source maps.

---

## Public Error Responses

Public API errors should not expose internals.

Good public error:

```json
{
  "error": "validation_failed",
  "message": "Request payload is invalid."
}
```

Bad public error:

```json
{
  "error": "src/services/payment-service.spore line 42 database password failed"
}
```

Internal reports may include file and line details.

---

## App Versioning

Galerina applications should define their own version.

Possible location:

```Galerina
project "OrderRiskApi"

version "1.2.0"
```

or:

```text
Galerina.config
```

The version should match release tags where possible.

Example:

```text
project version: 1.2.0
Git tag: v1.2.0
release artefact: order-risk-api-v1.2.0.tar.gz
```

---

## Dependency Locking

Commit:

```text
Galerina.lock
```

The lockfile should preserve:

```text
dependency versions
dependency hashes
package permissions
licence information
target compatibility
```

This helps ensure reproducible builds.

---

## Dependency Updates

Dependency updates should be reviewed carefully.

Checklist:

```text
[ ] Version change is intentional
[ ] Licence is acceptable
[ ] Package permissions did not expand unexpectedly
[ ] Security report reviewed
[ ] Tests pass
[ ] Build manifest updated
```

---

## Generated OpenAPI and Schemas

Galerina may generate:

```text
app.openapi.json
schemas/*.schema.json
```

Whether to commit these depends on the project.

Recommended:

```text
do not commit generated OpenAPI/schemas by default
store them as build artefacts
```

Commit generated API files only if:

```text
external clients depend on them directly from Git
the team intentionally reviews generated API diffs
they are used as fixtures
```

---

## Docker and Containers

For container deployment, recommended approach:

```text
compile app in CI
copy app.bin into runtime image
inject secrets at runtime
do not bake .env into image
run health check
```

Example container structure:

```text
/app/
├── app.bin
├── app.build-manifest.json
└── README-DEPLOY.md
```

Do not include:

```text
.env
private keys
unnecessary source maps
local cache
```

unless intentionally secured.

---

## Git Ignore for Galerina Apps

A Galerina application `.gitignore` should include:

```gitignore
.env
.env.*
!.env.example

build/
dist/
out/

*.bin
*.wasm
*.gpu.plan
*.photonic.plan
*.ternary.sim

*.source-map.json
*.security-report.json
*.target-report.json
*.failure-report.json
*.ai-context.json
*.build-manifest.json

storage/logs/
storage/cache/
storage/tmp/
```

Keep:

```gitignore
!Galerina.lock
!.env.example
```

---

## What Belongs in Git?

Use this rule:

```text
If it is written by developers and needed to rebuild the app, commit it.
If it is generated by the compiler, usually do not commit it.
If it contains secrets, never commit it.
If it proves a release, store it as a release artefact.
```

---

## Recommended Release Storage

Release artefacts can be stored in:

```text
GitHub Releases
container registry
cloud object storage
internal artefact registry
deployment platform releases
```

Git source history should not be the only place production artefacts exist.

---

## Audit Trail

For production systems, keep records of:

```text
Git commit SHA
release tag
build manifest
artefact hash
deployment time
deployed servers
health check result
rollback status
```

This helps debugging and compliance.

---

## Example Deployment Record

```json
{
  "app": "order-risk-api",
  "version": "1.2.0",
  "gitCommit": "abc123",
  "releaseTag": "v1.2.0",
  "artifact": "order-risk-api-v1.2.0.tar.gz",
  "artifactHash": "sha256:...",
  "deployedAt": "2026-05-02T10:15:00Z",
  "servers": ["api-1", "api-2", "api-3"],
  "healthCheck": "passed"
}
```

---

## Security Checklist Before Release

Before releasing a compiled Galerina app:

```text
[ ] No secrets in source
[ ] No secrets in build output
[ ] `.env` not committed
[ ] `.env.example` updated
[ ] Security report reviewed
[ ] Webhooks verified
[ ] Idempotency enabled where needed
[ ] Replay protection enabled where needed
[ ] API timeouts configured
[ ] JSON body limits configured
[ ] Source maps handled securely
[ ] Build manifest generated
[ ] Artefact hashes generated
[ ] Rollback artefact available
```

---

## AI Context and Git

Generated AI context files should not normally be committed.

Reason:

```text
they are generated
they may include internal structure
they can become stale
they may contain sensitive summaries if redaction fails
```

Commit only sanitised examples.

Example safe fixture:

```text
tests/fixtures/ai-context/hello.ai-context.json
```

---

## Local Development Workflow

Typical local workflow:

```bash
cp .env.example .env
Galerina run
Galerina fmt
Galerina lint
Galerina check
Galerina test
git status
git add src/ boot.spore Galerina.config tests/
git commit -m "api: add order route"
```

Do not add:

```text
.env
build/
storage/logs/
```

---

## Production Build Workflow

Typical production build:

```bash
Galerina fmt --check
Galerina lint
Galerina check --target all
Galerina test
Galerina build --mode release --target all
Galerina verify build/release/app.build-manifest.json
```

Then upload artefacts.

---

## Final Principle

A Galerina application repository should make it clear:

```text
what source code was written
what configuration is safe to share
what secrets stay outside Git
what files are generated
what build was released
what artefact was deployed
how to roll back
```

The best Git workflow for compiled Galerina apps is:

```text
source in Git
secrets outside Git
builds in CI
artefacts in releases
manifests for traceability
same artefact deployed to many servers
```