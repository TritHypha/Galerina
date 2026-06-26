# 169 — Secret comparison (invalid)

**Concept:** Direct equality comparison on secrets is forbidden

Using == to compare secret values (API keys, passwords, tokens) is vulnerable to timing attacks. Galerina requires constantTimeEquals(...) for all secret comparisons.

**AI rule:** Never compare secrets with ==. Use constantTimeEquals(...) to prevent timing attacks.
