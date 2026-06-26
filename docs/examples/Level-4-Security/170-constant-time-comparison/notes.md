# 170 — Constant-time comparison

**Concept:** constantTimeEquals for safe secret comparison

constantTimeEquals(apiKey, suppliedKey) compares secrets in constant time, preventing timing side-channel attacks. This is the required pattern for all secret comparisons in Galerina.

**AI rule:** Use constantTimeEquals(a, b) for all secret value comparisons.
