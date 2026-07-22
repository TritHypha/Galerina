# DSS.wasm Readiness Report

**Date:** 2026-07-22  
**Status:** Pre-readiness assessment — Stage A gate analysis  
**Suite baseline:** 95/95 packages · 7,616 tests · 0 fail · audit 0 errors  
**HEAD:** Galerina `58f7e1b1` · ZTF-KB `52bc13d`

---

## What DSS.wasm is

DSS.wasm is the real **Wasmtime-hosted supervisor** — the production execution target that
replaces the Stage-A TypeScript simulation. It is tracked as `#102–106` and listed in the
README as `post-v1` / `post-P9`.

It provides:
- **Kernel-bypass / in-sandbox isolation** — the host writes raw encrypted packets as
  unparsed byte arrays directly into WASM linear memory; decryption happens strictly inside
  the sandbox (the kernel never sees plaintext).
- The **real DSS supervisor** tracking the V_DPM (Virtual Dynamic Posture Matrix) register
  — every capability use is a bitmask check, every trap produces a structured AuditEvent,
  rollback fires `unreachable` before the next instruction.
- **R4 authority flip** (`#143`) — the `R4` flip that makes the differential WASM twins
  authoritative (deletes the `.ts` decider).

---

## Gate map — what must land before DSS.wasm

### Gate 1: Stage A completion (in progress)

DSS.wasm hosts the governed execution. It needs the **full compiler pipeline** to be
stable and complete so the `.wasm` artifacts it supervises are well-formed.

| Item | Status | Blocker? |
|---|---|---|
| Lexer / Parser / AST | ✅ 100% | — |
| Type checker | ✅ 100% (Stage A) | — |
| Effect checker | ✅ 100% (Stage A) | — |
| Value-state checker | ✅ 100% (Stage A) | — |
| Governance verifier | ✅ 100% (Stage A) | — |
| GIR emitter | ✅ 100% (Stage A) | — |
| WAT emitter | ✅ ~89% | partial — non-blocking for DSS.wasm |
| A18 tenant scope | ☐ **BETA BLOCKER** | **YES** — next work package |
| W6 codemod + taint-default flip | ☐ owner-locked | YES for language freeze |
| Diagnostic namespace clean | ✅ fixed this session | — |

**A18 is the primary Stage A blocker.** Everything else is either done or in known
hold. A18 must land before the language surface is declared stable, and DSS.wasm
supervises the language runtime.

### Gate 2: Self-hosting WASM byte-parity (P9 / #143)

DSS.wasm's `R4` authority flip requires all 7 self-hosted compiler stages to reach
byte-parity (Stage-A ≡ Stage-B real WASM output on the same corpus).

| Stage | R2 (runs) | R3 (byte-parity) |
|---|---|---|
| `lexer.fungi` | ✅ | ✅ proven (53 differential tests) |
| `parser.fungi` | ✅ | ✅ proven (full ladder) |
| `gir-emitter.fungi` | ✅ | ✅ proven |
| `type-checker.fungi` | ❌ traps (#100) | ❌ |
| `effect-checker.fungi` | ❌ traps (#100) | ❌ |
| `governance-verifier.fungi` | ❌ traps (#100) | ❌ |
| `runtime.fungi` | ✅ (separate gate) | ✅ partial parity |

**#100 blocker:** `Array<Auto>` type erasure prevents the type-checker, effect-checker,
and governance-verifier from running as real WASM. Fix: concretize `Array<Auto>` AST
params in the `.fungi` twins (the same fix already applied to `gir-emitter` on 2026-07-19).
This is mechanical — one stage at a time following the proven pattern.

### Gate 3: Differential twins authoritative (RD-0361 R4)

27 differential twins + 1 shadow are currently in `differential` state (Stage-A ≡ Stage-B
output proven, but `.ts` is still the authoritative decider). R4 (the authority flip that
makes WASM authoritative and retires the `.ts`) requires:
- All 27 twins proven at R3 byte-parity
- #143 byte-parity for remaining stages
- Owner gate: the R4 flip is 🔒 owner-locked

### Gate 4: Wasmtime TCB (#102–106)

The DSS.wasm supervisor itself requires:
- A real Wasmtime embedder (not a stub) — #102
- The capability host protocol (WASM↔host seam) — #103
- The V_DPM register implementation — #104
- The audit event emission seam — #105 (partially shipped)
- The kernel-bypass byte-pipe (raw encrypted bytes into WASM linear memory) — #106

These are **design-spec complete** (in R&D) and **unlocked-to-build** but are `post-v1` by
explicit owner decision.

---

## Ordered work toward DSS.wasm readiness

### Phase 1 — Stage A completion (current priority)

**A18 tenant scope** is the declared next work package and the beta blocker. It must land
before anything else.

After A18:
- W6 codemod + taint-default flip (language surface freeze)
- T2.3 `sealed auto schema` (typestate-CORE design first)

### Phase 2 — #100 erasure fix (unlocks the 3 trapped stages)

Fix `Array<Auto>` type erasure in `type-checker.fungi`, `effect-checker.fungi`, and
`governance-verifier.fungi` using the same pattern as `gir-emitter` (2026-07-19):
concretize `Array<Auto>` AST params to the specific types the stage consumes.

Each fix follows the proven loop:
1. Identify the `Array<Auto>` sites in the `.fungi` twin
2. Type them to the concrete record shape the stage reads
3. Verify `galerina check` clean
4. Run `audit-stage-execution.mjs` — stage should move from `traps` → `runs`
5. Add differential tests for R3 byte-parity
6. Commit one stage at a time

### Phase 3 — Remaining WASM byte-parity (R3 for all stages)

Once stages run (Phase 2), prove byte-parity via the differential harness on the self-hosted
corpus. This is the direct gate on #143.

### Phase 4 — R4 flip (owner-gated)

Once all stages are at R3, the owner executes the authority flip: makes WASM authoritative,
retires the `.ts` deciders. This is the `#143` milestone.

### Phase 5 — DSS.wasm TCB build (#102–106)

With the full pipeline running as governed WASM and R4 flipped:
- Implement the Wasmtime embedder (#102)
- Wire the capability host seam (#103)
- Implement V_DPM register (#104)
- Complete audit emission seam (#105)
- Implement kernel-bypass byte-pipe (#106)

---

## Current honest distance to DSS.wasm

```
TODAY
  Stage A: ~95% done (A18 + W6 + T2.3 remain)
  Self-hosting: 3/7 stages at R3 · 3 trapped at #100 · 1 R3-partial
  Differential twins: 27/27 differential · R4 flip = owner-gated

PHASE 1 (A18 + W6 + T2.3):  Stage A complete
PHASE 2 (#100 fix × 3):     All 7 stages run
PHASE 3 (R3 × 4 stages):    All stages byte-parity proven
PHASE 4 (R4 flip):          WASM authoritative — #143 milestone
PHASE 5 (#102–106 build):   DSS.wasm ready
```

**DSS.wasm is the final milestone of Galerina:Core Foundation v1.0.** It is not blocked
by any unknown design work — every gate has a design spec, a proven pattern, or an owner
decision already recorded. The path is mechanical execution in the correct order.

---

## Next immediate action: A18 tenant scope

From `docs/SYNTAX_UPDATE_TRACKER.md`:

> A18 tenant scope (BETA BLOCKER — next work package)
> Sequenced AFTER W5–W7 (rides the new schema/taint surface), then its own focused package.

**A18 is the work that should start now.**

---

*No absolute local paths. No keys.*
