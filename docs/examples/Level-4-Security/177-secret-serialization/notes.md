# 177 — secret serialization (SECURITY)

**Concept:** SPORE-SECRET-003 SecretSerializationDenied

Passing a SecureString to json.encode, serialize, or toString would expose the
raw secret value in the output payload. This violates the SecureString contract.

**Fix:** Use redact(apiKey) before serialization.

**AI rule:** SecureString must never appear in serialized output, API responses, or log messages.
