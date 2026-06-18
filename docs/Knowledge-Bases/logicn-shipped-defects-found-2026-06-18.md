# Shipped-Code Defects Found by Adversarial R&D — hub-verified ledger (2026-06-18)

> The adversarial R&D loop (jobs 0014–0022) surfaced a set of "shipped-code defects." This is the
> **hub's code-grounded verification** of each — with **corrected severity**, because two were
> over-stated as active exploits when the code shows they are latent or defense-in-depth-covered.
> That correction is the point: a finding is only as good as its verified blast radius. Companion:
> [[logicn-pipeline-security-posture]], [[logicn-security-audit-2026-06-16]].
>
> **Headline:** **none of these is an active, exploitable hole in the currently-shipped hub runtime.**
> Three were fixed this session; one is latent (Phase-2 gate); two are design-gated; two are in the
> owner-gated quantum-bridge repo.

## Ledger
| # | Finding | Location (verified) | Hub verdict | Severity | Status |
|---|---|---|---|---|---|
| 1 | Walker `INT32_MIN` unary-neg divergence + `-0` leak vs other tiers | `interpreter.ts` BINARY_DISPATCH / unary | **REAL** cross-tier divergence | was med | ✅ **FIXED** this session — `i32NegChecked` traps `-INT32_MIN`; `\| 0` canonicalizes `-0→0` (`cfb72f9`) |
| 2 | Silent `(i32.const 0)` fail-open — `emitBlockLastExpr` unrecognized block tail | `wat-emitter.ts:1277` | **REAL** fail-open (a wrong 0 into a governance predicate) | medium | ✅ **FIXED** this session — now `(unreachable)`, fail-closed (`b01f713`) |
| 3 | Zeroize-on-trap data-remanence | `tower-runtime.ts:98` (no try/finally, trap returns early); `plugin-sandbox.ts:58-60` (`erase()` = boolean no-op) | **REAL structurally, but LATENT** — `PluginSandbox` holds **no secret buffer** (Phase-1 `execute()` is a stub: "real dispatch in logicn-ext-bridge-*"). No secret memory exists to remain today. | latent (high **when Phase-2 lands**) | **OPEN — hard Phase-2 prerequisite.** The i32-overflow traps shipped this session make mid-exec traps more common, so fix the LOAD→TRAP→ERASE *before* Phase-2 wires real execution+buffers. |
| 4 | Deadline "fail-open" — interpreter caught the deadline throw + **continued** | `interpreter.ts:1505-1511` | **REAL fail-open PATTERN, but DEFENSE-IN-DEPTH-COVERED** — the governed effect was still blocked downstream by `capabilityHost.check()` (fail-closed, `capabilityHost.ts:218-225`, called by `execute()` at `:241`). **Not an exploitable bypass.** | was med → low | ✅ **HARDENED** this session — interpreter now fail-closes too (returns the host's `err` shape, one layer earlier). Fail-closed at every layer. |
| 5 | `MAX_ITERATIONS` (100k loop guard) lives in only one tier | `interpreter.ts:1187` (`LLN-RUNTIME-005`, walker only) | **REAL** — bytecode VM / WASM rely on the (unbuilt) compute-gas | medium | **OPEN — design-gated** on R&D 0022-A (deterministic gas: 1 unit at loop back-edge + fn entry, counter on `i32AddChecked`). |
| 6 | `max_instructions_ceiling` parses but is never enforced | `parser.ts:3434` (parsed in `enforced_limits {}`); no enforcer | **REAL** parse-without-enforce | medium | **OPEN — design-gated** on R&D 0022-A (same gas mechanism). |
| 7 | `ffsim.__version__` probe doesn't exist in ffsim 0.0.80 → reports "unavailable" | quantum-bridge `env-detect.ts:25` | as R&D reported (NOT hub-verified — separate production repo) | high (blocks Phase-2) | **OPEN — owner-gated** (production-repo gate). One-line fix (`importlib.metadata.version`). |
| 8 | Op-enum mismatch — golden op not in `QuantumOp` enum | quantum-bridge worker/enum | as R&D reported (NOT hub-verified) | high (gate would reject its own golden) | **OPEN — owner-gated** (production-repo gate). |

## What this says about the project (the real point)
The adversarial loop is doing exactly what it should: **catching the framework's own conformance + security breaks before they ship downstream.** The *value* is the verified ledger — including the honest down-grades (3 latent, 4 defense-in-depth). The two genuine open *hub* items are **(3) zeroize-on-trap** (close it as part of Phase-2's real execution, with a `try/finally` LOAD→TRAP→ERASE + a real `TPLSimulator.erase()` wipe + a property test that traps mid-buffer-write and asserts zero entropy) and **(5)+(6)** the resource-bound enforcement (the R&D 0022-A compute-gas). Everything else is fixed, design-gated, or in the owner-gated quantum-bridge repo.
