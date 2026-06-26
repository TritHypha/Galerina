# Context Tagged Verified Execution Cache

Galerina may cache verified execution plans, but a cached plan is reusable only
inside the context it was verified for.

Core principle:

```text
Cache execution plans, not trust.
Reuse verification only when context still matches.
```

## Rule

The cache must store both:

1. verified execution plan
2. verification context tags

Authority Control decides whether execution is allowed. Caches remember only
verified results and must not grant authority.

## Verification Tags

Cache keys should include tags such as:

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

Example:

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

If any important tag changes, the runtime must treat the entry as a miss,
reverify and rebuild the plan.

## Cache Areas

Galerina should use one central verified execution cache plus specialist caches:

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

Every specialist cache must follow central context-tagging, expiry, policy
versioning, permission versioning, actor scope, view scope, zone, audit and
invalidation rules.

## Denied Or Strictly Tagged Values

These must not be cached freely:

- secrets
- private data
- authorization decisions
- admin decisions
- AI outputs
- cross-user responses
- hardware trust decisions
- raw sensitive payloads

## Final Rule

```text
Cache work, not trust.
Reuse certainty, not authority.
```
