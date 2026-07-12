# 168 — Redacted network send

**Concept:** redacted value is safe to send to audit/logging endpoints

`redact(email)` produces a `redacted Email`. Bind it to a `let` **before** the sink (the 161 pattern) and forward it to an audit endpoint — the raw value is masked (no `FUNGI-VALUESTATE-006`) and the boundary is gated (no `FUNGI-VALUESTATE-008`). Redacting *inline* in the call argument leaves the boundary un-gated (008), so bind first.

**AI rule:** Redacted values are safe to transmit to audit or logging endpoints — bind the `redact(...)` result to a `let` before the send.
