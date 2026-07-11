# 179 — Secret value is auto-hardened (RD-0358 H-1)

A `secure flow` handling a secret (here via `privacy { contains PII }`) has its **maximum
memory-residency tier** derived automatically — the developer writes nothing:

```
residency: no_swap     // never swapped/persisted to disk (mlock)
erase:     on_exit      // zeroized when the value leaves scope
timing:    constant     // no secret-dependent branch/index (the §2 obligation)
substrate: binary       // secrets never route to the analog photonic path
```

This is **auto-SECURE, not auto-convenient**: the optimizer cannot relax it. Because auto-derivation
is a checker-verified *shadow* on this prototype branch (not build-wired until the execution switch,
#143), it emits **no diagnostic** — the example compiles clean. To see exactly what the compiler
injects (HV3 auditability):

```
node scripts/hardening-show-derived.mjs docs/examples/Level-4-Security/179-hardening-secret-auto/example.fungi
```

Honest boundary: see example 181 (an *unlabelled* value is NOT hardened — HV8).
