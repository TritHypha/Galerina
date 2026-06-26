# Governance Mode Ladder — `full` / `auto` / `lean` (JOB 0011)

> **Status (2026-06-17):** the **pure decision core (parts b+c) is SHIPPED** — `governance-mode.ts`
> `resolveGovernanceMode()` + 9 tests incl. the monotone-safety invariant. Parts (a) the parser
> token, (d) the `governanceMode` manifest field, and (e) the AOT-`lean`-to-WASM router are
> staged follow-ons; **(e) is gated behind the fidelity differential harness** per the hard-path
> invariant. Grounded in R&D job 0011 (`rd-absorbed`/the done-record). Default mode is **`full`**.

## The one-sentence answer
A blog's `renderPost()` is a `pure`, effect-free flow → `governance: auto` proves it touches no
effect and is taint-clean → resolves to **`lean`** (skip runtime governance — there is nothing to
enforce) → (future, item e) AOT-compiles to the **WASM production tier** for native-class speed.
A `charge()` flow declares `network`/`crypto`/`secret` effects → `auto` can **only** resolve it to
**`full`**: every gate, the K3 capability check, crypto-on-core, and the secret/PII egress floors
run unconditionally. **The knob narrows which *checks run* on effect-free code; it can never narrow
which *authority is granted*.**

## The ladder
| Mode | Meaning | When `auto` picks it |
|---|---|---|
| **`full`** (default) | Every gate, audit, proof, capability check, all hard floors. | Any flow with a declared/inferred effect, or any taint reaching a sink. |
| **`auto`** | Compiler right-sizes per flow; resolves to exactly `full` or `lean` — **never a middle tier**. | (it's the chooser, not a tier) |
| **`lean`** | Pure, effect-free flows skip runtime governance entirely (just compute). | A flow that is EffectFree **and** taint-clean. |

`auto` is **two-valued at runtime** (full or lean, never partial). A "run some gates, skip others"
middle tier is exactly the laundering surface we refuse — it would require deciding *which* gate to
skip on a flow that *has* an effect.

## Monotone-safety (proved by construction — the security invariant)
`resolveGovernanceMode(...).tier === "lean"  ⟹  (effectFree ∧ taintClean)`.

- **`lean` is erasure of enforcement that was compiler-proved unnecessary**, never relaxation of an enforcement that exists.
- The resolver's output set is `{full, lean}` and it grants **no capability** — there is no value of the knob that adds a capability bit, so **Deny→Allow is structurally unreachable** through it.
- `lean` is reachable **iff** EffectFree (no declared *and* no inferred effects) ∧ taint-clean (no secret/PII/embedding taint reaches a sink). A flow with an effect/taint has a gate to run, so it is forced to `full`. Therefore **`lean ⊆ EffectFree ∧ taint-clean`**, and since the floors are defined on effects/taint, the intersection of "nothing to enforce" with "the floors" is empty — relaxation can only remove enforcement from code that provably had nothing to enforce.
- The 9-case test includes an exhaustive invariant check: across every (project × flow × effectFree × taintClean) combination, `tier==="lean"` implies `effectFree ∧ taintClean`.

## Precedence — stricter wins (`full > auto > lean`)
A flow may opt **up** (request stricter than the project) but may **never opt down past the project
ceiling**. Project `full` + flow `lean` → `full` (rejected, `SPORE-CONFIG-GOV-001`). Project `auto`
+ flow `full` → `full` (opt-up, fine). An explicit `lean` on a flow that isn't EffectFree/taint-clean
→ safety override to `full` (`SPORE-CONFIG-GOV-002`). Mirrors the shipped `posture.ts` fail-secure
`off|auto|on` shape (secure pole = `full`).

## The hard floors (never relaxable, even under `lean`)
Crypto-on-core (`SPORE-SUBSTRATE-001`) · K3 capability gate (`(required & granted) === required`) ·
secret egress (`SPORE-SECRET-002`) · privacy egress (`SPORE-PRIVACY-002`) · the three-valued border
(`collapse(unknown)=deny`). All shipped, all fail-closed; the knob never touches them.

## Build status (verify-before-build)
- **(b)+(c) SHIPPED:** `governance-mode.ts` `resolveGovernanceMode()` — the pure precedence + eligibility + monotone-guard decision core. 9 tests.
- **(a) staged:** the `contract { governance: full|auto|lean }` token (parser + flow contract field) + `ProjectConfig.governance` default `full`.
- **(d) staged:** a `governanceMode` per-flow `ProofObligation` + CFG-fingerprint inclusion (tamper-evident) + a `governanceMode` field on the runtime audit record (distinct from `executionTier`, which is *how* it ran, not *which profile was authorised*).
- **(e) staged — HARNESS-GATED:** the `auto`-`lean`→WASM router (the ~2,129× win). It carries no governance into WASM only because `lean` flows have none — but lowering to WASM must be proved byte-identical to the reference walker by the **fidelity differential harness** before it ships. Do not build (e) before the harness.

## Caching note (don't oversell)
The gate is **not** the bottleneck — the report shows ~no measurable gate tax; the cost is tree-walk
dispatch + per-node allocation, which WASM eliminates. GateCache (`#194`) memoizes the *compiled
evaluator*, never a verdict — correct and worth wiring into the CLI reparse path, but its win for a
diverse-input app is small. The honest perf path is **prove-effect-free → route to WASM**, not gate-caching.
