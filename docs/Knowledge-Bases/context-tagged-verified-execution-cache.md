# Context Tagged Verified Execution Cache

## Purpose

Galerina may cache verified execution plans, but cached plans must be reusable
only inside the context they were verified for.

This is not:

```text
same code = reuse
```

It is:

```text
same code + same policy + same actor scope + same data view + same runtime zone
+ same hardware trust = reusable
```

## Core Principle

```text
Cache execution plans, not trust.
Reuse verification only when context still matches.
```

A cache can remember a verified result. A cache must not grant authority.

```text
Authority Control decides.
Caches remember only verified results.
```

## Cache Contents

A verified execution cache entry should store:

1. the verified execution plan
2. the verification context tags
3. expiry and invalidation metadata
4. audit/report metadata

## Verification Tags

Execution-plan cache keys should include tags such as:

```text
source_hash
governed_ir_hash
permission_hash
policy_version
view_rules_version
actor_type
actor_scope
actor_trust
data_view
view_scope
zone
runtime_mode
hardware_target
hardware_trust
compute_target
vault_version
audit_level
package_version
```

Example key shape:

```text
cache key =
  hash(
    source_hash,
    governed_ir_hash,
    permission_hash,
    policy_version,
    actor_scope,
    view_scope,
    zone,
    compute_target,
    hardware_trust,
    audit_level
  )
```

If any important tag changes:

```text
cache miss -> reverify -> rebuild plan
```

## Example

A cached profile-read plan:

```text
flow: getProfile
permission: profile_read
actor_type: authenticated_user
view: public + private_owner_only
zone: web_api
hardware: cpu
```

May be reusable for another normal authenticated user with the same actor
scope, view scope, policy version and zone.

It must not be reused for:

- admin access
- support staff access
- AI agent access
- secret data access
- a different policy version
- a different view rules version
- a different vault rules version
- a lower-trust runtime zone
- a different hardware-trust context

## Security Value

Context-tagging prevents dangerous reuse:

- cached admin execution plan reused for normal user
- cached private-data plan reused for public route
- cached GPU/TPU plan reused in a lower-trust hardware zone
- cached old-policy plan reused after policy update
- cached vault-sensitive plan reused after vault rule changes

## Cache Structure

Galerina should use one central verified execution cache plus specialist caches
for runtime areas.

```text
Verified Execution Cache = whole verified plan
Parser Cache             = source -> AST
IR Cache                 = AST -> Governed IR
Policy Cache             = permission/policy decisions
View Cache               = response exposure rules
Vault Cache              = safe short-lived vault reads
Compute Cache            = hardware plans / tensor shapes
Schedule Cache           = known safe execution lanes
Audit Cache              = buffered audit writes
```

Specialist caches must follow central cache safety rules.

Each cache should define:

- context tags
- expiry
- policy version
- permission version
- actor scope
- view scope
- runtime zone
- audit level
- invalidation rules
- report output

## Sensitive Cache Limits

The following must not be cached freely:

- secrets
- private data
- authorization decisions
- admin decisions
- AI outputs
- cross-user responses
- hardware trust decisions
- raw sensitive payloads

These may be cached only when strict tags, expiry, redaction, isolation,
encryption and policy allow it. Some categories should remain denied by default.

## Invalidation

Authority Control must be able to invalidate all relevant caches when authority
or trust context changes.

Invalidation triggers include:

- source hash change
- Governed IR hash change
- policy version change
- permission version change
- view rule change
- actor trust change
- vault version change
- package version change
- runtime mode change
- zone change
- compute target or hardware trust change
- audit requirement change
- expiry
- revocation event

## Architecture Rule

```text
Local caches for speed.
Central cache rules for safety.
Authority Control can invalidate all caches.
```

## Final Rule

```text
Cache work, not trust.
Reuse certainty, not authority.
```
