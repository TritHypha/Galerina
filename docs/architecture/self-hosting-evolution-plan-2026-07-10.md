# How Galerina evolves to run on its own `.fungi` (not `.ts`) — the staged plan

**Author:** main Galerina session · **2026-07-10** · branch `refactor/tmf-format-to-spore`.
**Companion to:** `docs/architecture/self-hosting-readiness-2026-07-09.md` (that doc maps the *current* state; this one is the forward *plan*).

## 0. The premise (why "delete `.ts` now" is refused, and what replaces it)

The `.ts` toolchain is **the only thing that compiles `.fungi`** — deleting it bricks the
project (compiler + crypto TCB) with no runnable replacement. So self-hosting is not a
delete; it is a **bootstrap**: a compiler *written in Galerina* must be able to compile
itself, verified against the `.ts` reference at every step, before any `.ts` is retired.

The zero-trust twist on the classic bootstrap: every stage gate is **differential and
attested**, not "it runs". The `.ts` compiler is retained as the **oracle** (the thing the
`.fungi` output is diffed against) long after the `.fungi` compiler works — it is the
regression detector, and the defense against a trusting-trust self-compile that silently
diverges.

## 1. Current position

- **Reality:** 88 `.ts` vs 8 `.fungi`. The running toolchain is compiled TypeScript
  (`dist/index.js`). The 8 `.fungi` corpus files (`src/self-hosted/*`: lexer, parser,
  type-checker, effect-checker, gir-emitter, governance-verifier, runtime, capabilities)
  are `check`-clean but **not the running toolchain** — they compile nothing yet.
- **Lowering surface (`.fungi`→WASM):** scalars ✓, cross-calls ✓, `match` on scalars ✓,
  **ADTs (Result/Option/String) ✓ and `?` error-propagation ✓ — landed this session**.
- **The blocking gap (finding ii):** `check`-clean ≠ runnable. `runtime.fungi` is
  `check`-clean yet `run --governed rtInt` surfaces `FUNGI-TYPE-005/008`, and standalone
  `run` returns an **untrustworthy** value (rtInt→1024, no governed reference to confirm).
  → *We are at the Stage 1/2 boundary.*

## 2. The stages (each gate is fail-closed)

### Stage 1 — Complete + trust the lowering surface
Lower everything the compiler corpus uses: records/tuples, the full collection surface,
recursion, the full stdlib host surface — **and resolve finding (ii)** so that `check`,
`run` (standalone WASM), and `run --governed` (tree-walker) *agree*.
**Gate:** every corpus flow runs standalone **and matches the governed reference**
(differential fidelity), not merely `check`-clean. This is the real "lowering-complete" bar.

### Stage 2 — Green, *executable* self-hosted corpus (differential parity)
The 8 `.fungi` modules must not just check-clean but **run and produce outputs identical to
their `.ts` counterparts** on a shared corpus (differential harness: same input ⇒
`.ts` output ≡ `.fungi` output, byte-for-byte), tier by tier (lexer → parser → checker → …).
**Gate:** differential suite green across the corpus. This proves the `.fungi` compiler is
*correct*, not just runnable.

### Stage 3 — The bootstrap fixpoint (self-compile)
Use the `.ts` compiler to compile the `.fungi` compiler → `fungic.wasm`. Then use
`fungic.wasm` to compile the `.fungi` compiler **again** → `fungic'.wasm`.
**Gate:** `fungic.wasm` ≡ `fungic'.wasm` (byte-identical, **reproducible** self-compile),
and it compiles the whole corpus identically to the `.ts` toolchain. Both artifacts attested
and diffed. Reproducibility here is the trusting-trust defense.

### Stage 4 — Self-host the crypto + host floor (the TCB)
Why "delete all `.ts`" fails today: `kemdem.ts` (crypto), `tower-citizen` (governance/host
TCB), `tri-pipe` (interop) have no runnable `.fungi` replacement. Resolution:
- **Crypto primitives** (AES-GCM, ML-KEM, **ML-DSA/FIPS-204**) are **not** re-implemented in
  a young language — they **bind vetted libraries through a capability-gated, attested FFI
  seam**. (This is where the ML-DSA/FIPS-204 blocker lives — it is a *dependency* gate, not a
  coding gate.)
- `.fungi` code calls those host functions under the governed capability/attestation model.
**Gate:** crypto golden-vectors pass through the `.fungi` path; the FFI seam is deny-by-
default, capability-scoped, and attested (Hardened Border + conformance stay green).

### Stage 5 — The `.fungi`↔host consumption path
A correct `fungic.wasm` still has to be *driven*: read source, write artifacts, invoke the
host. Today there is **no `.fungi`↔host consumption path**. Build the governed host runtime
that lets `fungic.wasm` consume input and emit artifacts under capability control.
**Gate:** `galerina build` runs end-to-end through `fungic.wasm` for a real package.

### Stage 6 — Convert outward, floor by floor, differential-gated
Only now — with a proven, reproducible, self-compiling `.fungi` compiler + host bridge —
convert packages `.ts`→`.fungi` **one at a time**. Order: the ~29 pure-logic
"convertible-now" packages first; crypto/host/interop (the TCB) **last**.
**Gate per conversion:** the `.fungi` module produces output identical to the `.ts` it
replaces (differential parity) **and** every security gate (Hardened Border, conformance,
attestation) stays green. A `.ts` file is deleted **only after** its `.fungi` replacement is
the running toolchain and has passed a defined **bake period** as sole toolchain with the
`.ts` retained as oracle.

## 3. Invariants (zero-trust, all stages)

1. **Never delete the `.ts` that compiles `.fungi`** until a *verified* `.fungi` replacement
   is the running toolchain (differential-proven, not "it runs").
2. **Every conversion is differential-gated** — `.ts` output ≡ `.fungi` output. Parity, not
   plausibility.
3. **The bootstrap must be reproducible** — byte-identical self-compile (trusting-trust
   defense).
4. **Crypto binds vetted libs via a capability-gated FFI seam** — you do not hand-roll
   AES/ML-KEM/ML-DSA in a young language.
5. **Fail-closed at every gate**; the `.ts` oracle is retained as the regression detector
   through the bake period, then retired deliberately (dated artifact), never silently.

## 4. Immediate next actions (from where we stand)

1. **Resolve finding (ii)** — reconcile `check`↔`governed` whole-program type inference on
   `runtime.fungi` so `check`-clean implies runnable; make standalone `run` match governed
   (kills the untrustworthy rtInt→1024). *This is the current Stage-1 blocker.*
2. **Records/collections/recursion lowering** — the remaining Stage-1 surface.
3. **Stand up the differential harness** (Stage 2 infra): `.ts` module vs `.fungi` module,
   same input, assert identical output — starting with the lexer (smallest, purely
   functional tier).

*Everything here is commit-only; the retirement of any `.ts` is owner-gated and dated.*
