# 172 — Secret value in console log

**Concept:** secret value sent to console sink is forbidden

piKey is a secret value. Writing it to the console (or any log) is a critical security error. Galerina enforces this statically — secrets cannot reach console sinks.

**AI rule:** Never log secret values (API keys, passwords, tokens).
