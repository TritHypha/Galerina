# 098 — Minting is taint-transparent (RD-0353, T4)

The most important safety property of hallmarks: **a gate mints, it does not sanitize.**
Passing a tainted value through a hallmark gate does not launder it — the value-state
checker treats a hallmark gate like any other user flow, not as a registered untaint
context. So a `Tainted<String>` cannot be turned into a "clean" `CustomerRef` by minting:

```fungi
unsafe let evil: String = request.body
safe mut c = assayCustomerRef(evil)?   // FUNGI-VALUESTATE-004 + FUNGI-VALUESTATE-001
```

Two enforced facts:

- `FUNGI-VALUESTATE-004` — a tainted value may not even be passed *into* the gate flow
  until it has been validated.
- `FUNGI-VALUESTATE-001` — a `safe mut` binding requires a *recognised* untaint gate
  (`validate.*`, `sanitize.*`, `parse.*`); a hallmark assay is not one, so it cannot produce
  a `safe` binding.

Untainting stays exclusive to registered validate/redact contexts (`FUNGI-TAINT-003`). This
is why "a gate that rejects nothing is RED" (the redness test) and "minting ≠ sanitizing"
are *both* required: a hallmark proves *shape/identity*, not *trust*.
