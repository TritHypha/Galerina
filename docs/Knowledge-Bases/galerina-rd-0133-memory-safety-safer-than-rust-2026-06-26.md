# RD-0133 — Galerina memory-safety: "as-safe-or-safer than Rust" positioning

- **Date:** 2026-06-26 · **Status:** ⏸ **DEFERRED (owner hold — do NOT action yet)** · **Roadmap task:** #65
- **Source:** owner note (2026-06-26) + `notes/70-beyond-1-bit.md` context · **TODO:** `notes/TODO-deferred-rd-memory-safety-and-beyond-1bit.md`

## Thesis (verified)
Galerina is **already memory-safe** — the work is **honesty + positioning, not building a borrow checker.**
Value-semantics (no shared mutable aliasing), no raw pointers, no manual malloc/free, no pointer arithmetic;
Stage-A is an interpreted tree-walker, production path is WASM (bounds-checked, capability-sandboxed linear
memory). The bug classes Rust's borrow checker exists to prevent — use-after-free, double-free, buffer overflow,
dangling pointers, data races — **cannot occur in Galerina by construction.**

## The plan (when un-deferred → #65, a small honesty fix)
1. **Fix the one real defect — the false gate.** `SPORE-MEMORY-001/002/003/007` (use-after-move / borrow-after-move
   / borrow-escapes-scope / unchecked-access) are reserved codes with **no emitter** (the false-gate class). Because
   Galerina is value-semantics those bugs can't happen → **retire the 4 dead codes + document
   memory-safety-by-value-semantics**, don't implement a checker for a bug class that doesn't exist.
2. **Keep `SPORE-AFFINE-001`** (affine consume-once typestate) — the one real linear-resource guarantee.
3. **Tell the true story:** *as safe* (memory-safe by construction); *safer #1* no `unsafe{}` escape hatch;
   *safer #2* WASM sandbox contains even a compiler bug; *safer #3* information-flow safety (caps+effects+taint,
   `SPORE-SECRET-001..004`) Rust doesn't address.
4. **Do NOT chase the RD-0130-refuted hardware claims** (CHERI 0-cycle, photonic immutability, WDM zero-alloc).
5. **Caveat:** revisit only if Galerina ever adds shared mutable references.

## Status
DEFERRED. Inert: the 4 reserved codes are not a live fail-open (they simply never emit). See [[galerina-rd-0130-frontier-domains-positioning]].
