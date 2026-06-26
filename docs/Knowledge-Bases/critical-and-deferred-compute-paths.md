# Critical and Deferred Compute Paths

## Definition

LSGR defines two execution path types: the **Critical Path** (work that must complete before the response) and the **Deferred Compute Path** (work that can continue safely after the response).

```text
Secure first.
Respond when safe.
Compute the rest when governed.
```

## Core Concept

```text
Primary Path = must finish now
Side Path    = can run separately
```

At execution classification (steps 3–6 of the runtime pipeline), the runtime decides:

```text
Does this need to block the response?
Or can it run as deferred compute?
```

## Example: Image Upload

Critical path (blocks response):

```text
validate request
check permission
store original image
return accepted response
```

Deferred compute path (after response):

```text
resize image
generate thumbnail
extract metadata
run image AI analysis
optimise file
update search index
```

The user does not wait for everything — they get an immediate accepted response.

## Path Types

The Scheduler may split execution into:

```text
Critical Path       — must complete before response
Deferred Compute Path — runs after response is accepted
Background Path     — scheduled later by runtime
Accelerator Path    — sent to GPU/NPU/TPU when ready
Batch Path          — grouped with similar work for efficiency
```

## What Must Stay on the Critical Path

```text
authentication
authorisation
input validation
capability checks
dangerous policy decisions
ownership checks
security audit registration
```

These cannot be deferred because the response's safety depends on them.

## What Can Be Deferred

```text
image processing
thumbnail generation
embeddings
logging enrichment
analytics
cache warming
background AI analysis
report generation
notifications
search indexing
```

## Important Rule

```text
Only non-essential work may leave the critical path.
```

## Governance Rule

Deferred work must still pass through the Sheriff (Authority Control) and must still use declared effects, capabilities, budgets, and audit rules.

```text
Deferred does not mean ungoverned.
```

## Core Principle

This gives Galerina speed without weakening security.
