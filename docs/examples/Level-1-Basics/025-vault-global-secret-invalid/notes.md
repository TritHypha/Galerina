# 025-vault-global-secret-invalid

## Concept

`vault global` is for non-secret config only. The compiler detects values that look
like API keys, signing keys, or passwords and emits `FUNGI-VAULT-001`.

## Detection heuristics

The compiler flags values matching:
- Prefixes: `sk_live_`, `sk_test_`, `-----BEGIN`
- Suffixes on key names: `_KEY`, `_SECRET`, `_PASSWORD`, `_TOKEN`
- High-entropy base64-looking strings

## Fix

Move secrets to `secret {}` references:

```fungi
secret STRIPE_API_KEY {
  from vault "vault://payments/stripe"
  provider "stripe"
}
```

## AI rule

`vault global` = non-secret config. Secrets = `secret {}`. Never mix them.
