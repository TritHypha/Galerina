# ADR — Resolving "OS-kernel → 100% `.fungi`, no `.ts`": the governed surface vs. the declared host floor

**Status:** Accepted (2026-07-10) · **Scope:** the App Kernel (`galerina-framework-app-kernel`) and, by the same rule, every host-boundary package (`tower-citizen`, the compiler's crypto/host edges).

## 1. The problem

A stated goal — *"the OS-kernel / I-O boundary to 100% `.fungi`, no `.ts`"* — is **not achievable as literally worded.** `.fungi` is a governed language that compiles to a sandboxed WASM component; it deliberately has **no** way to author host primitives — cryptographic verification, filesystem reads, or WASM instantiation. The kernel **is** the boundary where those primitives are called. So a kernel with *zero* `.ts`/host code is a kernel that cannot read a signed artifact off disk, verify its signature, or instantiate it — i.e. not a kernel.

Pursuing "zero `.ts`" literally would therefore mean either (a) never finishing, or (b) smuggling host calls into `.fungi` through an ungoverned escape hatch — which is strictly worse than an honest, declared floor.

## 2. The evidence (measured, not asserted)

Classifying `app-kernel/src` with the readiness audit's own floor detectors (`crypto` = `node:crypto`/`@noble`; `host-io` = `node:fs`/`net`/`process`; `ts-interop` = imports a sibling `dist/*.js`):

| File | Lines | Floor | Nature |
|---|---:|---|---|
| `fuse-loader.ts` | 1066 | **crypto + host-io** | the **only** real host floor |
| `kernel.ts` | 525 | ts-interop only | decision logic; imports sibling *verdicts* |
| `registry-index.ts` | 257 | — | pure logic |
| `route-defaults.ts` | 160 | — | pure logic |
| `types.ts` | 104 | — | pure logic |
| `secret-gate.ts` | 84 | — | pure logic |
| `index.ts` | 14 | — | barrel |

Two facts follow:

1. **The floor is not sprawled — it is concentrated in one file and already isolated.** `fuse-loader.ts` declares the *minimal* host surface it needs as typed interfaces and loads it through a single seam (`loadNode()`):
   - `NodeCrypto`: `createHash("sha256")`, `createPublicKey`, `verify` — **3 primitives**
   - `NodeFs`: `readFileSync`, `existsSync`, `readdirSync` — **file reads**
   - `NodePath`: `join`, `basename`
   plus `WebAssembly.instantiate`. That is **≈9 host primitives behind one import seam** — the entire irreducible floor of the kernel.

2. **≈60% of the kernel is already floor-free pure decision logic** (registry-index, route-defaults, types, secret-gate, and the decision half of fuse-loader/kernel.ts): gate sequencing, the K3 admission fold, hash-pin comparison, capability-mask intersection, revocation-verdict assembly. All of that is exactly what `.fungi` is *for*.

This is not an accident. It is the project's stated doctrine already realised: **"the host is a dumb byte-mover"** (README, TLSTP) and **"Govern-Don't-Absorb"** — the core governs; primitives live at a governed border, never absorbed into the trusted logic.

## 3. The decision

**Redefine the goal to the architecturally-sound target the kernel is already built for:**

> **The governed decision surface is `.fungi`. The host floor is a *declared, enumerated, minimal* TCB shim** — the `loadNode()` seam — **which stays `.ts` today and becomes the real `DSS.wasm` TCB (#102–106).**

Concretely, "kernel `.fungi`-complete" means **all three** of:

1. **Every decision** — admission gate order, hash-pin compare, signature-*result* fold, capability-mask intersection, revocation verdict, route defaults, secret gating — is authored in `.fungi` and gated by the differential-parity harness (the same loop the [effect-checker pilot](../../packages-galerina/galerina-core-compiler/src/self-hosted/effect-checker.fungi) just proved).
2. **The host floor is the declared manifest** — the ≈9 `loadNode` primitives + `WebAssembly.instantiate` — and **nothing else** in the kernel touches `node:crypto`/`node:fs`/`node:net`/`process`. The `.fungi` decision logic receives the *outputs* of these primitives (a computed digest, a boolean verify result, a byte buffer) and folds them — exactly as `cert-gate.ts` already folds a TLS library's outputs without doing ASN.1 itself.
3. **The floor can only shrink, never sprawl** — enforced by a check (below), so a future edit cannot quietly re-introduce a host call into governed logic.

Under this definition the goal is **reachable and measurable**, and "100%" is honest: *100% of the governed surface is `.fungi`; the floor is a bounded N-primitive TCB*, with N tracked and minimised, and N eventually re-homed into `DSS.wasm` rather than TS.

## 4. Making it measurable + fail-closed (the enforcement)

- **Declare the floor manifest.** A machine-readable list of the permitted floor primitives (the `NodeCrypto`/`NodeFs`/`NodePath` members + `WebAssembly.instantiate`) and the single file/seam allowed to call them (`fuse-loader.ts` `loadNode`).
- **A `audit-kernel-floor` check** (sibling of `audit-selfhost-readiness`): fail-closed if any kernel file *other than the declared seam* references `node:crypto`/`node:fs`/`node:net`/`process`, or if the seam's surface grows beyond the manifest without an owner-approved manifest edit. This turns the floor from "however much host code happens to be here" into a **bounded, audited, monotonically-shrinking TCB** — the same fail-closed discipline the project uses everywhere else.
- **Progress metric:** `governed-surface %.fungi` (decision logic converted) and `floor size N` (primitives), reported per boundary package — replacing the misleading "% of lines that are `.fungi`" with the two numbers that actually matter.

## 5. Roadmap (differential-gated, in order)

1. **Convert the floor-free files first** (registry-index, route-defaults, types, secret-gate) → `.fungi`, each gated by a behavioral differential test — reachable now, no floor in the way.
2. **Extract the decision half of `fuse-loader.ts`/`kernel.ts`** (gate order, hash-pin compare, capability intersection, verdict fold) into `.fungi`, leaving `loadNode` + the ≈9 primitives as the declared shim that feeds it.
3. **Land `audit-kernel-floor`** so the floor is enforced-bounded from that point on.
4. **(Later, #102–106)** re-home the declared floor from the TS shim into the real `DSS.wasm` TCB. At that point the kernel *is* "no `.ts`" — because the floor became WASM, not because it was pretended away.

## 6. Consequence

The honest headline for external docs becomes: **"the kernel's governance is authored in `.fungi`; its host floor is a declared, minimal, audited TCB shim (≈9 primitives) on a path to `DSS.wasm`"** — which is both true and stronger than an unachievable "100% no `.ts`". The `.fungi` conversion program (type-checker, effect-checker, kernel decision logic) proceeds on the reachable target; the floor is tracked and shrunk, never faked.
