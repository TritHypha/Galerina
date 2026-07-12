# 182 — You cannot DECLARE your way past a residency ceiling (RD-0358 H-6 / RD-0360 Q2)

Example 180 shows the *implicit* spill being rejected: a hardened value that would cross its residency
ceiling is re-typed `Refuted` (`FUNGI-HARDEN-005/007`). This example shows the *explicit* door being
shut just as firmly.

A developer tries to legitimise the crossing by DECLARING the effect:

```
effects { memory.spill }
```

`memory.spill` is **deny-only** (`DENY_ONLY_EFFECTS`, the same tier as `eval.execute`): a recognised
name that can **never** be granted. There is no capability bit, host import, or admission path that
carries it, so declaring it is rejected with `FUNGI-EFFECT-006` — not as an under-declaration to fix,
but as a design boundary. The two doors together mean a hardened secret can be spilled by **no** path:
the checker refuses the implicit spill (180), and the effect system refuses the explicit one (here).

Why deny-only and not a normal, grantable effect: a canonical effect is *grantable*, and no authority
legitimises leaking a hardened secret to memory. A future *grantable* "audited paged-optimizer" spill
(RD-0356 B5) would be a **distinct** canonical effect with its own admission gate — never this name, so
"declared spill" can never become a synonym for "declared paging".
