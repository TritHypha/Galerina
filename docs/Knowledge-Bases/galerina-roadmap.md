# Galerina — Roadmap (authoritative forward view)

**As of:** 2026-06-06 · **State (verified by running):** 44/44 packages · 4,129 tests · 0 fail · audit:security 0 findings · governance NEUTRAL · graph 2,924 nodes / 3,673 edges.

This is the single forward-looking view. Where it disagrees with older roadmap text, this wins. Status: ✅ done · 🔶 in-progress · 🔲 pending · ⛔ blocked.

---

## 0. Honest status line (lead with this)
- **Production-hardened:** the Stage A compiler/runtime, governance pipeline, CBOR manifests, Ed25519+ML-DSA signing, the Governed Inference Tower (CF-3/CF-7 attestation, P9 certified mode, V_DPM capability gate, numeric policy table), 6 Sentinels, and the #105 WASM admission gate.
- **P9 byte-parity ACHIEVED (#143, 2026-06-06):** the self-hosted **`lexer.spore` `tokenize` produces a byte-for-byte identical token stream in the Stage-A interpreter AND in real WASM** through the #105 admission gate (12-input corpus; `tests/wat-p9-tokenize-parity.test.mjs`). 3,295/3,295 compiler tests green. Remaining for full self-hosting: parser/type-checker/governance-verifier WASM parity (they execute in Stage-A today).
- **Templates, NOT implemented:** the framework/app/api-server/app-kernel packages. Present Galerina as a hardened **compiler/runtime engine**, not a finished app platform.
- **Open critical:** the committed signing key remains in git *history* until scrubbed (#149).

---

## 1. CRITICAL PATH — complete P9 (self-hosting byte-parity)
The single gate to "Galerina compiles + runs Galerina".

| Step | Task | Status |
|---|---|---|
| guarded WAT bodies · record layout · enum lowering · export gating | #120, #141, #142, #144 | ✅ |
| WASM admission-gate harness (security core) | #105 | ✅ core |
| **lexer module wabt-assembles to a real binary** | **#145a** | ✅ **2026-06-06** |
| type-aware string lowering: `String +`→`__str_concat`, `Char.toString`→`__char_to_string`, String `==`/`!=`→`__str_eq`, `Array<String>.contains`→`__array_contains_str`, Option<Char> None/Some sentinel dispatch + binding, `charLiteral`→codepoint, `codePoint` identity, `(unreachable)` tail terminator (scalar-type inference: `inferExprType` + `flowReturnTypes` + `recordVarTypes`-as-scalar) | **#160 / #145b** | ✅ **2026-06-06** |
| string-intern table exposure (`getInternedStrings`) + complete host stdlib + **output reader** (`readResult`/`readArray`/`readRecordField`) | #145 | ✅ **2026-06-06** |
| run `tokenize.wasm` → byte-parity vs interpreter (12-input corpus; `tests/wat-p9-tokenize-parity.test.mjs`) | **#143** | ✅ **2026-06-06 — COMPLETES P9 tokenize parity** |

---

## 2. SECURITY & INTEGRITY (review remediation, sequence ASAP)
| Item | Task | Status |
|---|---|---|
| Signing key untracked + git-ignored + **rotated** | (#149) | ✅ done this session |
| **Git-history scrub** of the key + CI secret scanning + retire old pubkey | **#149** | 🔲 **CRITICAL — user-driven (destructive)** |
| `border-check` fail-closed + `deploy` argv-spawn (no shell injection) | #151 | ✅ |
| Fail-closed hardening: `effectsToFlags` / unknown taint-origin / `triToBool unknown_as_true` | #153 | 🔲 high |
| README Stage-B status reconcile (0% vs 87% vs 100%) | #152 | 🔲 high |
| `version.json` counts corrected | (#150) | ✅ done; auto-gen pending #150 |
| npm workspaces / `galerina-core` tsc reproducibility | #155 | 🔲 |
| App-layer reframe: repoint workspace default + mark templates | #154 | 🔲 (needs user nod) |

Full register: `docs/Knowledge-Bases/galerina-residual-risks.md`.

---

## 3. POST-P9 — real DSS.wasm (DRCM Phase 4 completion)
| Task | What |
|---|---|
| #102 | `dss/index.spore` → `build/dss.wasm` via Stage B |
| #103 | Wasmtime component supervises DWI guests |
| #104 | real per-DWI fuel injection |
| #105* | `galerina run` on the real DSS component (the harness core exists) |
| #106 | epilogue receipts signed by DSS.wasm |

---

## 4. POST-P9 — enhancements (verified non-redundant; specs written)
| Task | What | Spec |
|---|---|---|
| #146 | Compliance **ledger** over audit-egress (runtime evidence → PCI/DO-178C; extends devtools-pci static map) | residual KB §3 |
| #147 | Warm-sandbox reuse + Memory Sanitizer (gates #156's memory-sanitizer benchmark) | — |
| #148 | 3 governance partials: delegatable capability token · versioned decision cache · offline partial-evaluator | governance-actors KB |
| #156 | Hardened-border enforcement-cost benchmarks (governance-tax, context-switch; memory-sanitizer ⛔#147) | benchmark-enforcement-cost-spec |
| #157 | Forensic diagnostics: differential observability (start here) · causality traces · RV · perf-drift plugin | diagnostics-spec |
| #158 | Governance-ready vector quantization plugin (TurboQuant clean-room, TS→WASM, attestation-gated) | task #158 |
| CF-4 | extract `@galerina/tpl-oracle` so the Brawn imports no Tower runtime | — |
| CF-5/9/10 | vector commit gate · ECC/TMR · atomic failover | — |

---

## 5. Backlog / hygiene
- #69 floor-specific dev-tools graphs · #110 secrets{} key rotation.
- Record follow-ons: `#record-update` lowering + cross-flow return-type tracking.
- `register-vm` bytecode (UNREACHABLE stub, Phase 24) — by design.

---

## 6. Recommended sequence
1. **#149 git-history scrub** (security stop-the-line; user-driven) — in parallel with engineering.
2. **#160 → #145 reader → #143** — finish P9 (the headline milestone).
3. **#153 + #152** — close the high-severity fail-closed + README-honesty gaps (cheap, high-trust).
4. **#154/#155** — reframe app-layer + fix reproducibility (presentation readiness).
5. **Post-P9:** real DSS.wasm (#102–#106), then enhancements (#146, #156/#157 start, #158).

**Maintenance:** re-run `node scripts/run-phase-close.mjs` after each landing; update `version.json`/SOT (auto-gen via #150); triage new advisory proposals against `galerina-task-ledger.md` §4 + `galerina-runtime-governance-actors.md` §3a before opening tasks (verify-before-build).
