# @galerina/ext-tritsocket — a deny-only ternary (K3) pre-filter

> ## ⚠️ THIS IS A PERFORMANCE PRE-FILTER, NOT A SECURITY BOUNDARY. ⚠️
>
> It does **not** replace TLS, mTLS, X.509, ML-DSA, HMAC, or any authentication. Its verdict is one of
> **`Deny`** or **`Maybe`** — there is deliberately **no `Allow`**. `Maybe` means *"I could not cheaply reject
> this; you **MUST** now run your real keyed post-quantum cryptographic check."*
>
> The capability mask is **public**, so the score is **forgeable**: an attacker who copies the mask (`S = C`)
> passes the pre-filter with **no secret**. That is *exactly why* `Maybe` is never an `Allow`. The **only** sound
> use is:
>
> ```ts
> const admitted = await admit(subject, mask, n, realKeyedPqGate);
> //             = (prefilter(subject, mask, n) !== Deny) && (await realKeyedPqGate())
> ```
>
> A false `Maybe` merely wastes one real crypto check (safe); it can **never** manufacture an allow. Selling
> this as authentication is a fail-open landmine — do not.

## Why it exists

A keyed PQ signature / MAC check is relatively expensive. When most incoming requests obviously don't match a
required capability set, a **cheap, branchless, cache-dense** ternary check can reject the obvious non-matches
*before* the expensive gate runs — cutting load — **without ever weakening** the real gate (because it only ever
says `Deny` or `Maybe`, never `Allow`).

## What it is / isn't

| It is | It is NOT |
|---|---|
| A cheap **necessary-condition** filter (deny-only) | A sufficient condition / an authorization decision |
| A **constant-factor** speed-up (fewer expensive checks) | An `O(1)` or "million-in-one-cycle" anything |
| Bit-packed K3: `0b00=0`, `0b01=+1`, `0b10=-1`, `0b11=reserved→Deny` | A cryptographic primitive (it holds no key) |
| Something you AND **in front of** real keyed PQ crypto | A TLS / auth replacement |

## Encoding

2 bits per trit, 4 trits per byte (little-endian within a byte); **256 trits pack into a 64-byte cache line**.
`0b00 = 0` (don't-care/absent), `0b01 = +1` (present), `0b10 = -1` (forbidden), `0b11 = reserved`. A reserved code
anywhere — or an undersized buffer — is a hard `Deny` (**fail-closed**).

For each lane the **public** mask `C` states a requirement: `Cᵢ = +1` must be present (Deny if `Sᵢ ≠ +1`);
`Cᵢ = -1` must be absent (Deny if `Sᵢ = +1`); `Cᵢ = 0` is don't-care.

## API

```ts
import { pack, prefilter, dot, prefilterBatch, admit, admitSync, Verdict } from "@galerina/ext-tritsocket";

const mask    = pack([1, 0, -1, 0]);   // need lane0, forbid lane2
const subject = pack([1, 1,  0, -1]);

prefilter(subject, mask, 4);           // → Verdict.Maybe | Verdict.Deny   (never Allow)

// The ONLY sound use — the real keyed gate is the only thing that can grant:
const ok = await admit(subject, mask, 4, async () => verifyMlDsaSignature(/* … */));
```

- `admit` / `admitSync` short-circuit to `false` on a pre-filter `Deny` **without** invoking the expensive real gate.
- `dot` is the **forgeable** diagnostic functional `Σ Sᵢ·Cᵢ` — provided for interop/benchmarks only; **never** an allow oracle.
- Honest complexity: `prefilterBatch` is **Θ(n · lenTrits)** — linear in the work, not `O(1)`.

## The real gate this fronts

The downstream keyed gate is whatever unforgeable check your endpoint requires — e.g. the HMAC + timestamp + replay
+ idempotency pipeline specified for `@galerina/core-network` (webhook security), or an ML-DSA / Ed25519 signature
verification. The pre-filter never replaces it; it only removes obvious non-matches before it runs.

## Provenance

Implements the **sound half** of Galerina/TritMesh **RD-0162 / RD-0163** — a bit-packed SIMD-friendly ternary
dot-product / K3 fold, shipped as a **deny-only performance pre-filter** *in front of* real PQ crypto, with the
forgery caveat front-and-centre, exactly as the R&D required. Machine-checked by `scripts/rd-0162-0164-tritsocket-tritrpc-proof.mjs`
and this package's `tests/`.

The native **Rust / C-ABI / WASM** implementation (with FFI wrappers for Node, Python, PHP, C#, Java) lives in the
**independent `ZT-tritsocket` repository** and is **not vendored here**. This package is a self-contained,
dependency-free **TypeScript-native port** that keeps the same encoding and ABI-compatible verdict values
(`Deny = 0`, `Maybe = 1`).
