# Layered Rate Limits

## Status

```
Status: Active — governing policy
Scope:  Boot-level, route-level, and permission-level rate limit declarations
See also: network-boundary-policy.md, boot-main-startup-defaults.md, permission-capability-actor-model.md
```

## Definition

Galerina rate limits are **layered** — each layer has its own responsibility and the strictest applicable limit wins.

```text
Network limit    = protect port/runtime
Boot limit       = protect whole app
Route limit      = protect endpoint
Permission limit = protect capability
Actor limit      = protect account/user
```

## Layer 1 — Boot/Main Global Limits

Protects the whole runtime from abuse:

```galerina
boot main {
  rate limit default {
    ip: 60 per minute
    actor: 300 per hour
    burst: 10 per 10 seconds
    on_limit: return 429
  }

  rate limit anonymous {
    ip: 10 per minute
    burst: 3 per 10 seconds
  }
}
```

Purpose:

```text
protect runtime from abuse
protect worker pools
protect DB/AI/compute from flooding
avoid IP blacklisting
stop obvious traffic floods
```

## Layer 2 — Route/API-Specific Limits

Protects sensitive endpoints with tighter rules:

```galerina
route POST "/login" {
  request Login.post
  response Login.response
  flow login
  permission use auth_login

  rate limit {
    ip: 5 per minute
    email: 5 per 15 minutes
    actor: 20 per hour
    on_limit: return 429
  }
}
```

Purpose:

```text
login brute-force protection
password reset protection
AI/tool cost protection
file upload protection
DB-heavy route protection
```

## Layer 3 — Permission-Level Limits

For expensive capabilities (GPU, AI, large compute):

```galerina
permission image_analyse {
  code {
    allow compute.target gpu
    allow ai.infer
  }

  rate limit {
    actor: 10 per hour
    cost: high
  }

  audit required event "image.analyse"
}
```

## Principle

```text
Rate limits should be layered.
Global limits stop abuse.
Local limits protect risky actions.
Strictest limit wins.
```

All limits are declared — not hidden configuration files.
