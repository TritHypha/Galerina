# Galerina — Forward Architecture R&D (2026-06-23)

Owner ask: *"make sure the design and architecture for everything is zero-trust and offers the best tech and design
possible including photonic/tri-logic and works with the Tri-Pipe and tower-citizen."* Forward-looking design review
(workflow `wvauqijwc`, 5 agents — distinct lens from the same-day Phase-4 bug-audit `wj6vrjkmg`). Grounded in code;
respects the standing invariants (crypto Binary-only; photonic = degrade-only `vAnd` operand, emulated/projected;
fail-closed K3; verify-before-build).

## The unifying theme — generalise the cert-gate K3 pattern everywhere
The just-shipped S1 cert-gate is the reference implementation of a **K3 boundary citizen**: fold evidence into
balanced-trit sub-verdicts → `allOf`/`vAnd` (min) → `decideAtBoundary` (unknown → DENY) → degrade-only side-signals
via `withSideSignal`. **Every trust boundary should become one of these.** Today only the cert-gate is — the kernel
is still a boolean checker. The highest-leverage architectural move across all five dimensions is to make
`tower-citizen`'s `decideAtBoundary`/`allOf` the **universal admission collapse** and `withSideSignal`/`vAnd` the
**only** channel by which photonic/substrate/sentinel signals touch a verdict.

## Prioritised build ladder (cross-dimension)

| # | Item | Effort | P/Tri | Net-new? |
|---|---|:--:|---|---|
| **1** | **Wire the shipped S1 cert-gate into `kernel.ts:307` auth + bind to fuse admission (vAnd)** | M | degrade-only seam | wiring only — gate ships |
| 2 | Adopt `tower-citizen` `decideAtBoundary`/`allOf` as the **universal** kernel/framework admission collapse | M | – | net-new |
| 3 | **Fix the WAT-emitter fail-OPEN codegen bugs** (#163 record-update, #165 float arithmetic) | M | – | net-new (security) |
| 4 | Flip flow-param trust to **tainted-by-default at posture-gated entry boundaries** (the 34B hole) | M | – | net-new |
| 5 | Auto-discover `packages-galerina/*` as the project-graph manifest (kill manifest drift) | S | – | net-new |
| 6 | Standardise the degrade-only side-signal channel (`withSideSignal`/`vAnd`) as the ONLY photonic/sentinel→verdict path | S | degrade-only | net-new |
| 7 | CBOR `.lmanifest` **SubstrateAttestation tag (Tag 418)** — declared-lane + tolerance + redundancy (GIR-derived, no analog bytes) | M | – (digital attestation) | net-new |
| 8 | De-color the governed tree-walker (colorless impl, keep async semantics) — ~7.4× on the default path | L | – | net-new |
| 9 | Expand the SEC-002 mutant catalog from 3 B5a to **one mutant per shipped fail-closed gate** | M | degrade-only | net-new |
| 10 | `contract.permissions {}` device-permission clause → [galerina-contract-permissions-design.md](galerina-contract-permissions-design.md) | M | – | net-new |
| 11 | Build the 0014 fidelity harness (walker ≡ bytecode ≡ WASM) — the lean→WASM trust gate | L | – | net-new |
| 12 | ML-DSA-65 build-path signing (#34) so admission demands match what the toolchain emits | M | – | net-new (owner-gated) |
| 13 | DRCM: a **degrade-only photonic-confidence operand** on the monotonic envelope (keep V_DPM Binary) | M | degrade-only | net-new |
| 14 | core-economics: a photonic `ExecutionTarget` + **degrade-only substrate-cost axis (brake-only, never gas)** | M | degrade-only | net-new |
| 15 | core-security: a **photonic-lane taint/egress rule** (cleartext-on-noisy-lane → degrade; secret-on-photonic → forbid) | M | degrade-only | net-new |
| 16 | Record + enforce the **Tri-Pipe coverage verdict per package** as machine-checkable metadata | S | – | net-new |
| — | **Hostile-host I/O contract** (decryption-in-WASM, host = untrusted byte-mover) — *spec it, don't claim it* | XL | degrade-only | #102-106-gated |

## Dimension summaries

**Zero-trust completeness.** Lexer/parser, governance verifier (No-Coercion proven to depth-4), fuse-loader 3 gates,
and the cert-gate are SOUND/STRONG. The two live trusted-by-default holes: `kernel.ts:307` presence-only auth (any
non-empty `Authorization` header passes — item #1 fixes it) and `value-state-checker.ts:1162-1191` bare-param trust
(item #4). Real isolation (decryption-in-WASM) is #102-106-blocked — spec, don't claim.

**Best tech / design.** De-color the tree-walker (#8, biggest measured win); auto-discover the graph manifest (#5,
confirms this session's finding); **two NEW fail-OPEN WAT codegen bugs** (#163 record-update, #165 float — item #3,
treat as security). **Correction (verify-before-build): do NOT add Z3 to the cert-gate** — keep the exhaustive
3⁴ truth-table; Z3 is the right tool for tri-tier i32 conformance, not for a 4-factor min already exhaustively tested.
*(This supersedes the Z3-for-cert-gate note in the 2026-06-23 roadmap LONG section.)*

**Photonic/tri leverage.** Top pick = the CBOR SubstrateAttestation tag (#7): the signed build artifact cannot today
prove substrate posture; a GIR-derived tag adds audit value with zero analog content. DRCM/economics/security gain a
*degrade-only* photonic operand (#13/#14/#15) — never a key, never gas, brake-only.

**Tri-Pipe + tower-citizen integration.** Make `tower-citizen` the universal governance engine (#2) and the
`ExecutionRouter` the single dispatch seam (forbid bypass); standardise `withSideSignal` as the only signal channel
(#6); record per-package Tri-Pipe coverage to kill the "Binary-by-invariant vs unwired-gap" ambiguity (#16).

**`contract.permissions{}`.** Keep it a DISTINCT physical-device grant block with its own `V_PERM` register and
`SPORE-PERM-001..006`, fail-closed, AI-cannot-self-grant, folding as a `vAnd` operand. Full design:
[galerina-contract-permissions-design.md](galerina-contract-permissions-design.md).

> All photonic perf is projected/emulated, never measured silicon. Crypto/keys stay Binary everywhere.
