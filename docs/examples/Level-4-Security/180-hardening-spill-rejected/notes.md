# 180 — An unhonourable residency ceiling is rejected, never spilled (RD-0358 H-2 / HV5)

The explicit `hardening {}` block is the *exception* surface (the common case is auto-derived, example
179). Here the developer asks for the strictest ceiling — `residency register_only` — on a host that
can only `mlock` (no-swap/no-disk, but not register pinning):

```
hardening { residency register_only host mlock_posix }
```

The compiler **fails closed**: rather than silently spill a secret past its declared ceiling, it
REJECTS with `FUNGI-HARDEN-005`. Make it compile by declaring a capable seam
(`host register_pinned`) or by relaxing the ceiling with an audited opt-out.

Honest scope: the softer "governed downgrade that re-types the value `Refuted`/`Tainted`" (RD-0358 §3-2)
needs the epistemic type-state (RD-0337) and is **stubbed** on this branch — so the prototype takes the
stricter REJECT path. Constant-time (H-4) is also honestly partial (undecidable in general).
