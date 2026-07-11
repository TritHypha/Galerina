# 166 — Safe network send

**Concept:** protected value sent over the network — redact before the egress sink

A `protected Email` cannot be sent to `http.post` (or any egress sink) as-is: passing it un-redacted is `FUNGI-VALUESTATE-006` (protected values must be redacted before egress), and the raw boundary param reaching the sink is `FUNGI-VALUESTATE-008`. Redact the value and bind it to a `let` first (the 161 pattern) — that strips the PII **and** gates the boundary, so the send to the approved service is clean.

**AI rule:** Protected values MUST be redacted before ANY egress sink, network included — it is not policy-optional. Redact → bind → send. (See 168 for the audit-endpoint variant.)
