# ROADMAP — Stage-6 "100% + no .ts" for the Type/Effect checker and the OS-kernel (measured, mechanical, honest)

**Status:** Active roadmap (2026-07-10). Owner objective (verbatim): *"Type checker / Effect checker to 100% build and .fungi, no .ts — and then the I/O — the OS kernel to 100%, both no .ts."*
**This document is the "ensure we CAN" answer:** both objectives are reachable; here is the measured gap, the mechanical loop that closes each item, and the two honest floors with their endgames. Companions: `kernel-fungi-floor-resolution-2026-07-10.md` (the floor ADR + `audit-kernel-floor.mjs` gate), the RD-0338 differential-parity discipline, RD-0337 (the checker's 3-axis design frame).

## 0. Measured state (2026-07-10, HEAD after battery `4cfbcd8e`)

| Target | Today | Remaining to "100% .fungi logic" |
|---|---|---|
| **Effect checker** | `effect-checker.fungi` **6/6 codes — DIAGNOSTIC PARITY COMPLETE** (pilot `5a23152c`) | execution-switch only (§3) |
| **Type checker** | `type-checker.fungi` **6/22 codes** (001/002/004/005/007 + a Stage-B-only 006) | **17 codes** + reconcile the 006 divergence (§1) |
| **GIR emitter** | `gir-emitter.fungi` already self-hosted | — (rides the same execution switch) |
| **OS-kernel** | **0/6** floor-free files converted (1,144 lines); floor confined to `fuse-loader.ts` (1,066 lines, 9 primitives, gate GREEN) | 6 file conversions (§2) + the seam endgame (§4) |

Suite 92/92 · 6,929 · 0 fail; self-hosted corpus 294/294; all gates green (known #20 baseline aside).

## 1. Objective 1 — Type checker to 22/22 codes (the burn-down)

**Missing codes (17):** 003 (nominal/brand gate) · 008 (null denied) · 009/010 (generic arity/constraint) · 011 (collection element) · 012 (Result) · 014 (missing effect) · 016/017/030 (tensor shape/precision/element) · 018 (runtime-target) · 019 (unknown symbol) · 020 (shadowing) · 021/022 (match exhaustive/unreachable) · 023/024 (Auto deferral).
**Divergence to reconcile:** the `.fungi` emits **FUNGI-TYPE-006** (trap-statement checks) which Stage-A does not — decide retire-vs-adopt against the Stage-A registry, differential tests updated to the parity answer (the effect-checker pilot did exactly this for its 4 subset-encoding tests).

**The honest pacing fact:** the Stage-B twin checks **what its input shape carries**. Its ParseResult flow-records carry `{name, returnType, params[{name,typeName}], returnExpr{kind,litType,leftType,rightType}}` (+ v2.2 static/bitfield/view/trap/step). So the 17 codes split:

- **Tranche A — expressible on (or near) the current shape:** 008 (null literal), 019 (unknown symbol in the param/expr subset), 020 (duplicate/shadowed binding), 011 (Array element in the literal subset). Start here.
- **Tranche B — needs a Stage-B parser-shape extension first** (each = parser.fungi emits the new fields → type-checker.fungi checks them → differential tests): 003 brands · 009/010 generics · 012 Result · 021/022 match arms · 023/024 Auto.
- **Tranche C — needs the tensor/effect sub-shapes:** 014 (declared-effects, mirrors the effect-checker's shape) · 016/017/030 tensors · 018 runtime-target.

**The proven loop (per code, from the FUNGI-EFFECT-002 pilot):** read the Stage-A check semantics → (if needed) extend parser.fungi's record shape → implement in type-checker.fungi → `galerina check` clean → reconcile/extend `self-hosted-type-checker.test.mjs` differential blocks → full self-hosted corpus green → commit. **One code (or one shape-extension cluster) per commit; never fan-out.**

## 2. Objective 2 — Kernel: convert the 6 floor-free files (1,144 lines)

Order by dependency-lightness (each = author the `.fungi` twin + a differential test pinning `.ts`-vs-`.fungi` behavior on the same inputs; the `audit-kernel-floor` gate already proves them floor-free):
1. `types.ts` (104) — type/record declarations → `.fungi` records.
2. `secret-gate.ts` (84) — pure decision logic; smallest behavioral twin.
3. `route-defaults.ts` (160) — the secure-by-default table.
4. `registry-index.ts` (257) — index/lookup logic.
5. `kernel.ts` (525) — the gate pipeline (decision half; its host calls already route through the seam).
6. `index.ts` (14) — re-exports; trivial last.

These are *behavioral-twin* conversions under the kernel's own 104-test suite + new differential tests — the same discipline as the compiler corpus, without waiting for the full Stage-B execution switch.

## 3. The execution switch (what finally deletes the `.ts`)

Diagnostic parity makes a `.fungi` twin *complete*; deleting the `.ts` requires the build to *execute* the `.fungi`:
- **Gate:** Stage-B **WASM byte-parity** (#143) — today only `tokenize` reaches it. The lowering floors already burned down this arc: ADT ABI + `?` error-prop landed; remaining floors tracked in the self-hosting evolution plan.
- **Sequence:** per-stage byte-parity (lexer → parser → checkers → gir-emitter) → flip that stage's build entry to the `.fungi`-compiled artifact → the `.ts` twin becomes a frozen reference (kept for the differential oracle) → delete once the oracle is re-anchored on the WASM artifact.
- **RD-0316/0318 assurance layer** (#29) is the safety net for the switch: fuzz differential-oracle + scoped Z3 on the checker algebra.

## 4. The two floors and their endgames (the honest "no .ts" for the kernel)

| Floor | Why `.fungi` can never hold it | Endgame that still reaches "no `.ts` source" |
|---|---|---|
| **Kernel host seam** (`fuse-loader.ts`, 9 primitives: createHash/createPublicKey/verify/readFileSync/existsSync/readdirSync/join/basename/WebAssembly.instantiate) | `.fungi` is host-blind by design (`galerina check` rejects even `^`); *something* must call the host | **(a)** extract the decision half into `.fungi` (shrinks the seam), then **(b)** the residual shim becomes **JSDoc-typed `.mjs` checked by `tsc --checkJs`** (type safety kept, zero `.ts` source), and **(c)** long-term the seam collapses into the **DSS.wasm TCB (#102-106)** where the host boundary is the WASM embedder itself. The `audit-kernel-floor` gate holds throughout: the floor can only shrink. |
| **Compiler crypto/host-io** (signing, fs) | same host-blindness | same (b)/(c) pattern at the compiler's I/O edge; the checker/emitter logic itself has no floor |

**Bottom line, stated plainly:** *"100% + no `.ts`"* is reachable for both objectives — the checker modules literally (pure logic, twins + execution switch), the kernel literally at the **source-language** level (governed surface → `.fungi`; the irreducible 9-primitive host shim → `.mjs`/DSS.wasm, which is *not TypeScript*). What can never happen is `.fungi` itself calling the host — that is the boundary the whole architecture exists to govern, and the floor gate keeps it honest while it shrinks.

## 5. Sequence (owner-visible checkpoints)

1. **Type-checker Tranche A** (008/019/020/011 + the 006 reconcile) — current shape, starts immediately.
2. **Tranche B/C shape-extensions**, one cluster per commit, corpus green each time.
3. **Kernel files 1→6** (§2) in parallel-safe order (behavioral twins; no compiler dependency).
4. **Execution switch per stage** as #143 byte-parity lands (assurance layer #29 gates the flip).
5. **Seam shrink → `.mjs` shim → DSS.wasm** (#102-106; owner-gated — it touches the TCB).

Each checkpoint keeps: suite green · self-hosted corpus green · `audit-kernel-floor` green · counts synced.
