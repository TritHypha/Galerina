# 474-vault-session-session-pattern

## Concept

`vault.session` holds data tied to an authenticated user session. TTL = session
lifetime. Owner-checked on every access. Cleared on logout or session expiry.

## When to use vault.session

- Permission summaries loaded once per login
- User profile data needed by multiple flows
- Basket state for e-commerce
- Recently loaded records that are expensive to refetch

## When NOT to use vault.session

- **Secrets, API keys, tokens** → `vault.secure`
- **Per-request data** → `vault.request`
- **Service-wide config** → `vault global`
- **Mutable process-lifetime state** → GlobalVault (`vault {}`)

## Security rules

1. Session vault entries are owner-checked — cross-user reads are rejected.
2. Every entry must declare `ttl: session` and `owner: ctx.user.id`.
3. TTL expiry clears the entry automatically — no manual cleanup needed.
4. Access requires the flow to be in the entry's `access` list.
