# 358 — AI secure string in AI call

**Concept:** passing a SecureString to an AI model is a secret-exposure error

`SecureString` values (API keys, tokens, passwords) are classified as secrets. Passing them to an AI model inference call risks leaking the secret into a prompt, log, or telemetry trace. The compiler raises `SPORE-SECRET-001` to block this.

**AI rule:** Never pass a `SecureString` or secret-typed value to an AI model call.
