# RD-0528 compiler self-hosting — I-1 evidence pack (7 stages)

**Assembled:** 2026-07-22 · **Track:** RD-0528 Phase I — compiler self-hosting (retire the `.ts` compiler so `.fungi` compiles `.fungi`) · **State:** ⚠ **I-1 EVIDENCE ONLY — NOT flip-ready.**

This pack records the three I-1 evidence items — **(a)** R3 byte-parity, **(c)** mutation-kill non-vacuity, **(d)** hash-pin + #105 admission — for all seven self-hosted compiler stages. It does **not** support an authority flip. Every stage stays non-authoritative: the authority ledger [`rd0528-compiler-authoritative-stages.json`](rd0528-compiler-authoritative-stages.json) `twins` array is empty and stays empty until the owner's per-stage condition-form nod (I-4). If any item below later proves false, that evidence is void.

## Why this is NOT a flip request (unlike the kernel T1/T2 packs)

The RD-0361 kernel packs supported a flip because each sentinel twin already had an **execution-cutover differential** — a standing test asserting `WASM verdict === real .ts verdict` over a boundary corpus — so trusting the `.fungi` WASM was safe: any divergence from the `.ts` was already a RED alarm.

The compiler stages have **no comprehensive, enforced `.fungi ≡ .ts`-equivalence oracle yet.** R3 byte-parity (item a) proves each stage is *internally* faithful — its WASM backend agrees with its interpreter, and both match hand-authored fixtures — but internal faithfulness does **not** prove the self-hosted stage produces the same output as the current `.ts` compiler. What exists toward that equivalence is narrow: only the **lexer** has an *enforced* `.ts`-differential (`tests/bootstrap-determinism/lexer-parity.test.mjs`, `PARITY_ACHIEVED = true` → hard-asserts token count / kind / value of the TS `lex()` against the self-hosted `tokenize`), and it covers a **single source line**, not a corpus; the **parser**'s bootstrap-parity harness exists but is **not enforced** (`PARITY_ACHIEVED = false`, informational); the other **five** stages have no `.ts`-differential at all. Building that equivalence out to a comprehensive, enforced corpus across all seven stages **is** prerequisite I-3. Prerequisite I-2 (a pinned trusted stage0 `.fungi`→WASM compiler, so `.fungi` compiles `.fungi` with no `.ts` in the loop) is also not built — `tests/bootstrap-determinism/canonical-hash.test.mjs` supplies part of its foundation (same-source → same-GIR-hash determinism), but the trusted-seed pin itself does not exist. Both prerequisites are HARD and **not pre-emptible** (RD-0528 §2; ledger `prerequisites`). Until both exist, no flip is askable — deny-by-default.

## The seven stages

All live in `packages-galerina/galerina-core-compiler/src/self-hosted/`.

| Stage | `.fungi` | Role |
|---|---|---|
| lexer | `lexer.fungi` | source text → tokens |
| parser | `parser.fungi` | tokens → AST |
| gir-emitter | `gir-emitter.fungi` | AST → GIR (governed IR) |
| runtime | `runtime.fungi` | GIR interpreter + execution-tier classifier |
| type-checker | `type-checker.fungi` | type diagnostics (`FUNGI-TYPE-*`) |
| effect-checker | `effect-checker.fungi` | effect diagnostics (`FUNGI-EFFECT-*`) |
| governance-verifier | `governance-verifier.fungi` | governance diagnostics (`FUNGI-GOV-*` etc.) |

## The three I-1 evidence items

### (a) R3 byte-parity — ✅ 512 / 512

Each stage, compiled through the P9 WASM backend, produces output byte-identical to its interpreted form (`interp ≡ WASM`, the `wat-p9-*-parity` suite), and both agree with the expected fixtures (`interp ≡ EXPECTED`, the `self-hosted-*` suite). Re-run 2026-07-22 over the 27 files (11 `self-hosted-*.test.mjs` + 16 `wat-p9-*.test.mjs`):

```
tests 512 · pass 512 · fail 0 · skipped 0 · todo 0
```

Scope note: this is *internal* faithfulness (backend + fixtures), **not** the comprehensive `.fungi ≡ .ts`-compiler equivalence a flip needs (that is I-3, only narrowly started — see above).

### (c) mutation-kill non-vacuity — ✅ 7 / 7

For each stage a deliberately-wrong **value** is planted into the `.fungi`; the stage's own `self-hosted-*` correctness oracle rebuilds from the mutated source and **kills the mutant** (output ≠ EXPECTED → the test fails). This proves item (a)'s green is a real guard, not a vacuous pass. Every mutant is a value change — none touches loop control — so the harness never hangs and its `finally`-restore always runs. `node scripts/audit-mutation.mjs` (SEC-002, group `RD0528_COMPILER`): full suite **59/59 killed, 0 survived, VIOLATIONS 0**; the seven stage mutants:

| Stage | mutant id | planted defect |
|---|---|---|
| lexer | `rd0528-lexer-keyword-table` | keyword `"let"` → `"lett"` (the `let` keyword tokenizes as an Identifier) |
| parser | `rd0528-parser-param-readonly` | `isReadonly: false` → `true` (a non-readonly param mis-classified readonly) |
| gir-emitter | `rd0528-gir-emitter-op-load` | `op = "load"` → `"xoad"` (a param read emits the wrong op) |
| runtime | `rd0528-runtime-tier-sync` | `tier: "sync"` → `"synx"` (the no-effects fast-path mis-tiers) |
| type-checker | `rd0528-type-checker-type003` | `code: "FUNGI-TYPE-003"` → `903` (wrong diagnostic code) |
| effect-checker | `rd0528-effect-checker-effect006` | `code: "FUNGI-EFFECT-006"` → `906` (wrong diagnostic code) |
| governance-verifier | `rd0528-governance-verifier-gov002` | `"FUNGI-GOV-002"` → `902` (wrong diagnostic code) |

> Anchoring note: the checker codes are non-unique in-file (each has `if code == "…"` label/severity maps), so the anchors use the colon-form `code: "…"` emission — a bare-code replace would hit a map first and pass vacuously. The gir-emitter anchor is the `op = "load"` *assignment* (the covered path); the separate `op: "load"` *return* literal is exercised by neither `self-hosted` test — a small oracle coverage gap, recorded but not blocking.

### (d) hash-pin + #105 admission — ✅ 7 / 7, GATED (not a stale snapshot)

`node scripts/gather-compiler-stage-hashes.mjs` builds each stage to WASM (R0), signs it (ephemeral dev key), and admits it through the attestation-first #105 gate (R1). All seven R0-clean + #105-admitted; the recorded sha256 is `wasmHash` of the **WASM bytes** (not the ephemeral signature) → deterministic.

**The authoritative baseline is `rd0528-compiler-stage-hashes-baseline.json`, GATED by `scripts/audit-compiler-stage-hashes.mjs`** (wired into `run-phase-close.mjs`; self-tested). A hardcoded table in this doc previously drifted SILENTLY as the emitter evolved (e.g. `parser` grew 17062→17854 bytes across commits with no `parser.fungi` change — legitimate emitter drift) and claimed live "hash-pin" evidence it could not back (bridge 0101/0103, owner-approved 0104). The gate closes that:

- It re-derives all seven hashes each phase-close and compares them to the reviewed baseline.
- **Emitter drift is EXPECTED** — compiled bytes legitimately change as the emitter is iterated — so the gate reds VISIBLY on drift (never silent), and the fix is a REVIEW: `--update-baseline` when the drift is expected emitter evolution; **investigate** when the affected stage's `.fungi` source did NOT change (the real thing a hash-pin should catch). This gates the INVARIANT (determinism + reviewed baseline), not a frozen value.

> To see the current pinned values: `node scripts/audit-compiler-stage-hashes.mjs --json`, or read the baseline JSON. Before any flip, the gate must be green (or the baseline re-reviewed) — the hashes are no longer a doc snapshot that can rot.

## Open prerequisites before ANY flip (HARD, not pre-emptible)

1. **I-2 bootstrap-seed** — pin a trusted stage0 `.fungi`→WASM compiler so `.fungi` compiles `.fungi` with no `.ts` in the trust path. **Not built.**
2. **I-3 oracle-before-`.ts`-deletion** — a comprehensive, enforced `.fungi ≡ .ts`-compiler equivalence oracle over a real corpus for all seven stages (the compiler analog of the kernel's execution-cutover differential), so a stage can be trusted over its `.ts` and the `.ts` retained one bake window before deletion. **Only narrowly started:** the lexer has an enforced single-line `.ts`-differential (`bootstrap-determinism/lexer-parity.test.mjs`); the parser's is informational (`PARITY_ACHIEVED = false`); the other five have none.
3. **Per-stage owner nod (I-4)** — nod → ledger entry → shadow-bake window → post-bake `.ts` delete. Owner-gated, one stage at a time.

The standing enforcement already exists: `scripts/audit-compiler-stage-twins.mjs` (wired into `run-phase-close.mjs`) reads the ledger and, fail-closed, RED-alarms any authoritative stage that regresses to shadow or fails `galerina check`. With `twins: []` it currently enforces that all seven stay check-clean and differential.

## The ask

**None yet.** This pack documents I-1 evidence only; no flip is requested and none is askable until I-2 and I-3 (both mine to build) are done. Only then does a per-stage condition-form nod become meaningful — at which point a stage is added to `rd0528-compiler-authoritative-stages.json` citing the owner's go and this pack, exactly as the kernel T1/T2 flips did.
