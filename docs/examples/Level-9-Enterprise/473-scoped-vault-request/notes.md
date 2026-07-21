# 473-scoped-vault-request

## Concept

`vault.request` solves the repeated-database-call problem without introducing global
state. Data loaded once within a single HTTP request is cached in the vault and
reused by all downstream flows — but the vault is automatically destroyed when the
request ends.

## The problem it solves

Without vault.request:
```text
validateOrder     → database (customer load)
checkDiscounts    → database (customer load again)
calculateDelivery → database (customer load again)
createOrder       → database (customer load again)
```

With vault.request:
```text
loadCustomer      → database (once)
validateOrder     → vault.request (instant, no DB)
checkDiscounts    → vault.request (instant, no DB)
calculateDelivery → vault.request (instant, no DB)
createOrder       → vault.request (instant, no DB)
```

## Vault request rules

1. TTL must be `request` — the entry cannot outlive the current HTTP request.
2. `owner: ctx.user.id` — owner-checked on every access.
3. `access: [FlowA, FlowB]` — only listed flows may access the entry.
4. `sensitivity: private` — not logged, not exposed to AI tooling.
5. Effects: writing = `vault.write`, reading = `vault.read`.
