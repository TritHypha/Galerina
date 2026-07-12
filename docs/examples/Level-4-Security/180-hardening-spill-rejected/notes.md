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

Honest scope: the governed downgrade that re-types the value `Refuted` (RD-0358 §3-2) is now **wired for
real** (RD-0360 Option A) — that is the `FUNGI-HARDEN-007` above, via a compiler-side epistemic trit held
equivalent to the runtime RD-0337 trit by a fail-closed conformance gate. To DECLARE the spill instead of
suffering it is refused too — see example 182 (`memory.spill` is deny-only, `FUNGI-EFFECT-006`).
Constant-time (H-4) is still honestly partial (undecidable in general).
