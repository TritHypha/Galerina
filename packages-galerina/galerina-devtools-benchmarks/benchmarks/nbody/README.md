# nbody

A **physics-shaped compute throughput** test: the pairwise gravitational force on
every body from every other body, in 2D, summed into a deterministic checksum.

This is the classic O(n²) N-body inner loop — the workload that dominates particle
simulators, molecular dynamics and gravity codes. Here it runs in **scaled integers**
so it executes on Galerina's governed integer path and produces a bit-for-bit identical
checksum on Node, Python and Galerina.

## Why scaled integers

Float results diverge across runtimes (rounding, FMA, SIMD reassociation), which
makes a cross-language checksum meaningless. So the force law uses integer math:

- `G = 100000` scales the gravitational constant.
- Force magnitude is `G * |d| / d²` with `d² = dx² + dy² + 1` (the `+1` is softening,
  avoiding division by zero), truncated toward zero.
- `G` is sized so **every intermediate stays below 2^31** — the integer path is 32-bit,
  and every division has a non-negative numerator, so JS `Math.trunc(a/b)`,
  Python `a // b` and Galerina `a / b` agree exactly.

Positions are derived by index math (no arrays): `posX(i,t) = i*73 + i*t`,
`posY(i,t) = i*149 + i*t`. The multiplicative `i*t` coupling means the pairwise
difference is `(j-i)*(73+t)` — so bodies genuinely move from step to step (a purely
additive `t` term would cancel in the difference).

## Algorithm

```
posX(i,t) = i*73  + i*t
posY(i,t) = i*149 + i*t

netForce(i,t,n):
  fx = fy = 0
  for j in 0..n, j != i:
    dx = posX(j,t) - posX(i,t);  dy = posY(j,t) - posY(i,t)
    d2 = dx*dx + dy*dy + 1
    fx += sign(dx) * (G*|dx| / d2)
    fy += sign(dy) * (G*|dy| / d2)
  return |fx| + |fy|

simulate(n,steps):
  checksum = 0
  for t in 0..steps, i in 0..n:
    checksum += netForce(i,t,n)         # wraps at 1e9
  return checksum

main() = simulate(64, 8)
```

One run is `simulate(64, 8)` = `steps × n × n` = **32,768 force evaluations**.

**Canonical checksum:** `simulate(64, 8) = 536024` (small cross-check:
`simulate(8, 2) = 16274`). All three runtimes must return 536024.

## Files

| File | Runtime |
|------|---------|
| `node.mjs` | Node.js |
| `python.py` | Python 3 |
| `benchmark.spore` | Galerina governed/manifest/passive |
