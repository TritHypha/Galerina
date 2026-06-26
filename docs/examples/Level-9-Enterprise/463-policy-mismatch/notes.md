# 463 — Policy mismatch

**Concept:** declared purpose does not match the template used in the flow body

The `policy` block declares `purpose "appointment_reminder"` but the flow uses `template: "marketing_offer"`. The compiler detects this inconsistency and raises `SPORE-GOV-005`. This prevents purpose-creep — using patient contact data collected for one purpose to send marketing material.

**AI rule:** The template or action used in the flow body must be consistent with the `purpose` declared in the `policy` block.
