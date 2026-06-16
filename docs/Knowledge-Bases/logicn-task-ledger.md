# LogicN — Task Ledger #1–#148 (graph-review checklist)

**Generated:** 2026-06-06 · **Re-verified:** 2026-06-15 · **State:** 48/48 packages · 4,360 tests · 0 fail · graph 2,995 nodes / 3,764 edges (1,839 files) · governance NEUTRAL.
*(The original 44/44 · 4,128 figure was a 2026-06-06 snapshot; counts re-run this session via `node scripts/run-all-tests.cjs` + `cli graph`. See SOT §1.)*

## How to use this (the point)
When you change a file, find its **code area** in §4, read off the **task IDs** that touch
it, and re-verify those features. Cross-check with the project graph
(`node scripts/run-phase-close.mjs` → graph:reindex, or the devtools-project-graph) to see
which flows/packages depend on the changed node. Status legend: ✅ done · 🔶 in-progress · 🔲 pending.

---

## 1. Status rollup
- **Done:** 137+ · **In-progress:** 1 (#105 parity-gated) · **Pending (in-repo):** #69, #110, #146, #147, #148, #177, #199(Ph2). **Blocked (external infra):** #102, #103, #104, #106. *(§2 rows below were stale for #143/#145/#199 — corrected 2026-06-15.)*
- **P9 critical path:** #144 ✅ → #145 ✅ → #143 ✅ — **P9 tokenize byte-parity COMPLETE (2026-06-06, see §3).** The §2 table rows had not been updated; now reconciled.
- **Post-P9 (frozen until P9 parity + gaps review):** #146, #147, #148. **Post-P9 DSS.wasm:** #102–#104, #106.

---

## 2. Task ledger (#1–#148)

| # | Title (abbrev) | Status | Subsystem |
|---|---|---|---|
| 1–3 | Graph generator: place / build / wire+run | ✅ | devtools-project-graph |
| 4–10 | LLN-GOV-010 intent cleanup + auditor minimal-example rule | ✅ | examples · devtools-security |
| 11–13 | call-chain benchmark (.lln + mirrors + runner) | ✅ | devtools-benchmarks |
| 14 | Full benchmark suite + compare | ✅ | devtools-benchmarks |
| 15–16 | Bytecode-VM CALL fix + compiler tests | ✅ | core-compiler (interpreter) |
| 17–18 | Security audit sweep · examples up-to-date | ✅ | devtools-security · examples |
| 19 | Roadmap to 100% Runtime-in-LogicN | ✅ | docs |
| 20–22 | compare.mjs label fixes · http-throughput | ✅ | devtools-benchmarks |
| 23 | Physics N-body benchmark | ✅ | devtools-benchmarks |
| 24–27 | Self-hosting Stage B stubs · type-checker.lln subset | ✅ | core-compiler/self-hosted |
| 28 | ext-secrets-aws vault | ✅ | ext-secrets-vault |
| 29 | ext-proof-snarkjs Groth16 | ✅ | ext-proof-snarkjs |
| 30–35 | DRCM Phase 1: cap audit / scanner / CAS / CBOR / key custody / receipt sep | ✅ | core-compiler (manifest/proof/capability) |
| 36 | DRCM P2: invariant{} parser + static proof + WAT gate | ✅ | core-compiler (parser, wat-emitter) |
| 37 | DRCM P3: .lmanifest pipeline + admission gate | ✅ | core-compiler (manifest-generator, governance-verifier) |
| 38–39 | DRCM P4: SystemCapabilityType · policy{} monotonicity | ✅ | core-compiler (capability-types, governance-verifier) |
| 40–41 | DRCM P5: DWI step keyword + fuel · DSS supervisor .lln | ✅ | core-compiler · self-hosted/dss |
| 42 | DRCM P6: Epilogue Receipt + ledger | ✅ | core-compiler (proof-chain, manifest) |
| 43–44 | DRCM P7: OWASP negative suite · OCI/gVisor deploy | ✅ | tests · scripts (Dockerfile, deploy-linux) |
| 45 | LLN-GOV/EFFECT/CAP code wiring | ✅ | core-compiler (governance-verifier) |
| 46–49 | Pattern examples + README + graph index | ✅ | tests/patterns · docs |
| 50 | T/FG/EC/ID/AU/LC diagnostic categories | ✅ | core-compiler (diagnostics) |
| 51 | @experimental_profile directive | ✅ | core-compiler (parser) |
| 52 | security::interim BoundaryProxy | ✅ | core-compiler |
| 53 | KNOWLEDGE-BASE-INDEX.md | ✅ | docs |
| 54 | T-006/007/008 goal harness | ✅ | tests |
| 55 | Named arguments at call sites | ✅ | core-compiler (parser, interpreter) |
| 56 | Domain Guard Policies (Static Manifest Clamping) | ✅ | core-compiler (governance-verifier) |
| 57 | Record constructor in let bindings | ✅ | core-compiler (parser) |
| 58 | resilience{} + observability{} blocks | ✅ | core-compiler (resilience-inference) |
| 59 | Change-class review workflow + CI | ✅ | scripts · .github |
| 60 | Contract clause reference | ✅ | docs |
| 61 | `::` module separator | ✅ | core-compiler (parser) |
| 62 | Multi-variant match arms `A|B =>` | ✅ | core-compiler (parser, interpreter) |
| 63 | governance-impact.json artifact | ✅ | core-compiler · scripts |
| 64–65 | logicn check --diff · init-env | ✅ | core-compiler (cli) |
| 66 | observability{} ⊄ privacy{} verifier | ✅ | core-compiler (governance-verifier) |
| 67–68 | .lmanifest CBOR (RFC 8949) + secure parser | ✅ | core-compiler (manifest-generator, cbor) |
| 69 | **Floor-specific dev-tools graphs** | 🔲 | devtools-project-graph |
| 70 | WAT single-exit body transform | ✅ | core-compiler (wat-emitter) |
| 71 | logicn check --what-if (Shadow Policy) | ✅ | core-compiler (governance-verifier) |
| 72 | parent_policy: inheritance + subset | ✅ | core-compiler (governance-verifier) |
| 73–74 | assuming{} proof-tracing block + verify | ✅ | core-compiler (parser, governance-verifier) |
| 75 | Governance-as-Evidence (CBOR Tag 410) | ✅ | core-compiler (manifest-generator) |
| 76 | LLN-INV-000 DSS trap handler + audit event | ✅ | core-compiler · self-hosted/dss |
| 77 | Execution DAG (Tag 414) | ✅ | core-compiler (execution-graph) |
| 78 | MMCP typed memory views (Tag 415) | ✅ | core-compiler |
| 79 | Pre-resolved Policy DAG (Tag 416) | ✅ | core-compiler (governance-verifier) |
| 80 | Behavioral Fingerprinting CFG hash (Tag 417) | ✅ | core-compiler |
| 81 | `trap` keyword | ✅ | core-compiler (parser, wat-emitter) |
| 82 | `governed` flow qualifier | ✅ | core-compiler |
| 83 | `view(cap)` MMCP annotation | ✅ | core-compiler |
| 84 | Match exhaustiveness (LLN-MATCH-001) | ✅ | core-compiler (type-checker) |
| 85 | DSS.lln V_DPM bit layout + bitmask | ✅ | self-hosted/dss · capability-types |
| 86 | `static` compile-time constants | ✅ | core-compiler (interpreter, governance-verifier) |
| 87 | `bitfield` V_DPM register | ✅ | core-compiler (parser, wat-emitter) |
| 88 | `gate {}` admission guard | ✅ | core-compiler (governance-verifier) |
| 89 | `access {}` enforcement | ✅ | core-compiler (governance-verifier) |
| 90 | `policy {}` state mutation governance | ✅ | core-compiler (governance-verifier) |
| 91 | vdpm.lln → `bitfield V_DPM` | ✅ | self-hosted/dss |
| 92 | import plugin assimilate/evict | ✅ | core-compiler (module-registry) |
| 93 | `;;` govComment manifest collection | ✅ | core-compiler (lexer, manifest) |
| 94 | import ./path.lln DAG merge | ✅ | core-compiler (module-registry) |
| 95–96 | Tower execution log + test gate | ✅ | scripts · tests |
| 97 | Stage B lexer.lln functional | ✅ | self-hosted/lexer.lln |
| 98 | Stage B parser.lln functional | ✅ | self-hosted/parser.lln |
| 99 | Stage B type-checker.lln functional | ✅ | self-hosted/type-checker.lln |
| 100 | Stage B governance-verifier.lln functional | ✅ | self-hosted/governance-verifier.lln |
| 101 | R6 corpus 100% Stage-A==Stage-B | ✅ | tests/r6-corpus |
| 102 | **dss/index.lln → build/dss.wasm** | 🔲 | self-hosted/dss · wat pipeline |
| 103 | **Wasmtime component supervises DWI** | 🔲 | runtime (Post-P9) |
| 104 | **Real Wasmtime fuel per DWI** | 🔲 | runtime (Post-P9) |
| 105 | **WASM admission-gate harness** (security core ✅; parity gated on #144/#145) | 🔶 | core-compiler/wasm-runtime.ts |
| 106 | **Epilogue receipts signed by DSS.wasm** | 🔲 | runtime (Post-P9) |
| 107–109 | **Ed25519** keygen · build-time manifest signing · admission verify gate (ML-DSA-65 PQ upgrade planned — see §9) | ✅ | core-compiler (attestation, manifest-generator, cli) |
| 110 | **Key rotation in secrets{}** | 🔲 | core-compiler (secrets) · ext-secrets-vault |
| 111–113 | Linux deploy · logicn deploy · OCI/gVisor | ✅ | scripts · core-cli |
| 114–117 | Package gate · SOT update · R6 final · v1.0 | ✅ | repo-wide · docs |
| 118 | P9.2 WAT String/Record linear-memory | ✅ | core-compiler (wat-emitter) |
| 119 | P9.3 stdlib method calls → host imports | ✅ | core-compiler (wat-emitter) |
| 120 | P9.4 guarded bodies + record layout (umbrella) | ✅ | core-compiler (wat-emitter) |
| 121–122 | Brain→Brawn BridgeRegistry · ai{} gov enforcement | ✅ | tower-citizen (hybrid-engine) |
| 123 | ext-bridge-cpp registry factory | ✅ | ext-bridge-cpp |
| 124–125 | CLI infer driver + ai{} contract · E2E | ✅ | logicn.mjs · tower-citizen |
| 126–129 | graph devtools · audit+tests · KB sync · benchmark table | ✅ | repo-wide |
| 130–136 | Sentinels: LSM · LSIO · LST · LSP · LSS · Egress + wiring | ✅ | core-sentinel-* |
| 137 | **CF-3/CF-7 bridge attestation** | ✅ | tower-citizen/bridge-attestation.ts · ext-bridge-cpp/addon-loader.ts |
| 138 | P9 certified mode mandates signed bridges | ✅ | tower-citizen (hybrid-engine, compiled-policy) |
| 139 | Enforced V_DPM capability gate | ✅ | tower-citizen (hybrid-engine) |
| 140 | Numeric policy table (CompiledPolicy) | ✅ | tower-citizen/compiled-policy.ts |
| 141 | P9.4b record struct layout (construct + field access) | ✅ | core-compiler/wat-emitter.ts |
| 142 | P9.4c guarded-flow export gating | ✅ | core-compiler/wat-emitter.ts |
| 143 | **P9 ceremony — tokenize byte-parity** (DONE 2026-06-06 — ledger §2 was stale; see §3) | ✅ | core-compiler · wasm-runtime |
| 144 | P9.4d enum-variant member lowering | ✅ | core-compiler/wat-emitter.ts (buildEnumVariants) |
| 145 | **P9 string runtime: type-aware `+`/`Char.toString` + `__str_concat`/`__char_to_string`/`__str_eq` + table exposure + output reader** | ✅ | core-compiler/wat-emitter.ts · wasm-runtime.ts (DONE 2026-06-06; ledger §2 was stale) |
| 146 | **Post-P9: compliance ledger over audit-egress** | 🔲 | devtools-pci · sentinel-egress |
| 147 | **Post-P9: warm-sandbox + memory sanitizer** | 🔲 | core-compiler/wasm-runtime.ts |
| 148 | **Post-P9: 3 governance partials (token/cache/partial-eval)** | 🔲 | tower-citizen · core-compiler |

---

## 3. P9 tokenize byte-parity — ✅ DONE (2026-06-06)
- **#143 / #145 / #160 — ACHIEVED.** `lexer.lln` `tokenize` produces a byte-for-byte
  identical token stream in the Stage-A interpreter AND in real WASM through the #105
  admission gate (12-input corpus; `tests/wat-p9-tokenize-parity.test.mjs`). 3,295/3,295
  compiler tests green. Type-directed emitter lowering (Option<Char> sentinel dispatch,
  `charLiteral`→codepoint, `Char.toString`→`__char_to_string`, String `+`→`__str_concat`,
  String `==`/`!=`→`__str_eq`, `Array<String>.contains`→`__array_contains_str`, complete
  host stdlib + output reader). **Scope:** `tokenize` only; parser/type-checker/governance-
  verifier WASM parity remain.

## 3b. Post-parity Technical-Debt / Gaps Review — tasks #161–#191
Full grounded findings + fixes in **`docs/Knowledge-Bases/logicn-techdebt-gaps-review.md`**
(50 adversarially-verified findings). New tasks (one line each; details in the review doc).

**✅ Landed 2026-06-06 (first batch):** #161 (Array.count), #169 (Char classifiers
isUpper/isLower/isWhitespace), #170 (code-point host string indexing + interpreter
charCount reconciliation; non-BMP oracle test), #174 (kb-graph/diagnostic shell-injection
→ spawnSync), #175 (keygen 0o600), #185 (host-stdlib oracle test), #189 (parity corpus now spans
string/char literals, line/block comments, string concat, and escape sequences — 21
inputs, all byte-parity-clean), #191 (README/version.json P9 status), **#168**
(enum-variant `match tok.kind { Keyword => … }` → i32 tag dispatch via `enumVariantTag`;
verified in real WASM by `tests/wat-enum-match.test.mjs`). The #168 work also REWROTE the
statement-path match chain (`emitMatchArmStmt`), fixing two pre-existing #167-class silent
miscompiles: 3+-arm chains dropped the 3rd+ arm with imbalanced parens, and one-liner arm
bodies (`Red => return 10`) were mis-emitted as `;; unhandled stmt: numberLiteral`.
**3,314/3,314 compiler tests green** (tokenize parity preserved through the rewrite);
`logicn kb-graph` CLI re-verified. No latent bugs in the string-heavy lexer paths —
#160 type-directed lowering is sound across all token classes.

**✅ Landed 2026-06-06 (second batch — match dispatch):** **#164** Result `Ok(v)`/`Err(e)`
dispatch (new host `__result_tag`/`__result_value`; reads tag → unwraps payload → binds
v/e) + guard `when COND => body` arms (condition = the guard expr). Verified in real WASM
by `tests/wat-result-match.test.mjs`. The statement-path match dispatch is now COMPLETE:
Option (None/Some) · Result (Ok/Err) · enum variants (#168) · int literals · guard `when`
· wildcard default — all dispatch + bind correctly. **3,317/3,317 compiler tests green.**

**✅ Landed 2026-06-06 (third batch — host String methods):** **#162** host
`startsWith`/`endsWith`/`trim`/`indexOf`/`slice` (String-only → STDLIB_HOST_MAP) + type-
directed `contains` (String → `__str_contains` substring; Array<String> → `__array_contains_str`)
and `toUpper`/`toLower` (Char → `__char_to_upper/lower`; String → `__str_to_upper/lower`).
Host fns mirror src/stdlib.ts EXACTLY (slice/indexOf UTF-16, charAt/length code-point — the
interpreter's own inconsistency replicated for byte-parity). Verified in real WASM by
`tests/wat-string-methods.test.mjs`. **3,320/3,320 compiler tests green.**

**✅ Landed 2026-06-06 (fourth batch — records):** **#163** `#record-update`
(`{ ...base, field: v }`) — bump-allocate a fresh record of the base's type, copy ALL
base slots, overwrite the named fields; was a silent null-handle placeholder. Verified in
real WASM (`tests/wat-record-update.test.mjs`: overwrite per slot position + base not
mutated). **3,322/3,322 compiler tests green.** Parser-parity prerequisites now cleared:
**#161 · #162 · #163 · #164 · #168 · #169 done**; remaining for parser WASM parity:
#165 (float arithmetic), #192 (match-as-expression parser), #193 (param-naming collision).

> Note: expression-position `match` (`return match …` / `let x = match …`) is a separate
> PARSER gap (parses `match` as an identifier) — the expression-path Option/enum/Result
> dispatch is correct by construction but unreachable/untestable until that parsing lands
> (task **#192**). The statement path (which all self-hosted flows use) is fully exercised.

| # | Task | Sev | Eff |
|---|------|-----|-----|
| 161 | Lower `Array.count()` (unblock all self-hosted loops) | high | S |
| 162 | Add host string methods (slice/startsWith/endsWith/toLower/toUpper/trim/indexOf/substr-contains) | high | M |
| 163 | Lower `#record-update` instead of null-handle placeholder | high | M |
| 164 | Sentinel/tag-dispatch Result `Ok/Err` + guard `when` match arms | high | L |
| 165 | Type-direct float arithmetic to f64 ops + f64 locals | medium | L |
| 166 | Fix `bodyTailIsUnreachable` for non-exhaustive match / normal-exit while | medium | M |
| 167 | Make WAT emitter placeholder fallbacks fail-closed (no silent return-0) | medium | M |
| 168 | Resolve enum-variant match arms (`match tok.kind {…}`) via `enumVariants` | high | M |
| 169 | Add host Char classifiers (isUpper/isLower/isWhitespace/toUpper/toLower) | low | S |
| 170 | Code-point-correct host string indexing + reconcile interpreter charCount | medium | S |
| 171 | Replace in-band `-1` None sentinel with boxed Option/Result handle | high | M |
| 172 | Stop i32-truncating `__int_to_str` | low | S |
| 173 | Bind certified-profile + sha256 into WASM admission signature pre-image | high | M |
| 174 | Fix command injection in `logicn kb-graph` / `diagnostic` | medium | S |
| 175 | Write keygen private-key file with 0o600 | medium | S |
| 176 | Import-closure validation + attestation freshness/revocation in #105 gate | medium | M |
| 177 | Deprecated `policy {}` alias → `accessDecl` (or hard-reject) | low | M |
| 178 | Cross-module `assuming()` proof-borrowing fail-closed in `--release` | medium | M |
| 179 | Fail closed on non-numeric RHS in interpreter numeric comparisons | low | S |
| 180 | Replace placeholder manifest signatures with real ML-DSA-65 (or hard-fail) | low | M |
| 181 | Wire GovernanceEnforcer 0→1 commit gate into `TowerRuntime.execute` + de-stub outputHash | medium | M |
| 182 | Make `signAudit` a real signature (or rename misleading `mldsa65:` prefix) | medium | M |
| 183 | BitNet CPU/GPU `execute()` fail-closed on `canCommit()` (CF-5) | medium | S |
| 184 | Gate `tmacVector` COMMIT through `checkTransition` | low | S |
| 185 | Truth-table oracle test for type-directed WAT host fns | medium | S |
| 186 | Enforce + test disallowed-host-import rejection in #105 gate | medium | M |
| 187 | Isolated WAT tests for `bodyTailIsUnreachable` ifStmt branch | low | S |
| 188 | Isolated WAT tests for Option<T> match in expression position | low | M |
| 189 | Extend tokenize parity corpus: string/char literals + comments | medium | S |
| 190 | Wrong-key + malformed-signature rejection tests for #105 gate | low | S |
| 191 | Reconcile README + version.json P9 byte-parity status with SOT | medium | S |
| 192 | Parser: support `match` in expression position (`return match …` / `let x = match …`) — currently parses `match` as an identifier, splitting arms into stray blocks (found verifying #168) | medium | M |
| 193 | WAT emitter: a user variable named `p0`/`p1`/`p2`/… collides with the positional param WAT name `$p<i>` → "redefinition of parameter" link error. Prefix params (`$__arg<i>`) or locals to avoid the clash (found verifying #163) | low | S |
| 194 | **Caching of logic/governance for speed** (USER PRIORITY, sooner). Cache the compiled evaluator (#140 numeric policy table); zero-trust invariant: NEVER cache a final allow/deny decision. Shadow-mode → enforce. Design per LogicN's real `flow`+`contract` model. See checkpoint §8.2 | high | M |
| 195 | OS/Hardware-compromised posture as `off \| auto \| on` (default `auto`, fail-secure). USER directive. Config knob read by DSS + #105 gate + Tower hot path. See checkpoint §8.1 | medium | M |
| ~~196~~ | ~~Ternary XOR / SUM gate~~ — **NOT ADOPTED** (notes discussion). Binary XOR already covered (`^`→i32.xor); that answers the question. | — | — |
| ~~197~~ | ~~Zig-ready IR track~~ — **REJECTED 2026-06-06** ("Do NOT add Zig to this project"). WASM + native stay as-is. | — | — |
| ~~198~~ | ~~Language-Framework Hybrid / remove middleware~~ — **NOT ADOPTED.** Notes were DISCUSSION ONLY; their code examples don't reflect real LogicN. LogicN stays a TypeScript-like `flow`+`contract` language. `logicn-framework-*` packages remain scaffolds (#154). | — | — |
| **ZTF** | **Zero Trust Framework** — umbrella project over LogicN + siblings; a governing SECURITY BAR (deny-by-default, no ambient authority, explicit capability, fail-closed, actor-aware audit, OS/HW-as-compromised). Every component must warrant the badge. See checkpoint §8.7. | — | principle |
| — | **CLEANUP (done 2026-06-06):** removed stale `scripts/run-all-tests.js`; fixed the 2 broken `.claude/settings.json` refs (`test-core`/`test-all` → `.cjs`); renamed `scripts/{mark-core-change,run-core-tests}.js` → `.cjs` (were broken by root `type:module`). | — | done |
| — | **NOTE: `notes/30-notes*.md` are DISCUSSION ONLY.** AI-written code examples may not reflect real LogicN. Do NOT build from them; LogicN stays `flow`+`contract`. | — | — |
| 199 | **`@logicn/ext-bridge-quantum` — governed out-of-process bridge for IBM `ffsim`** (fermionic quantum-chemistry sim, Apache-2.0). DESIGN COMPLETE, build not started. *Govern it, don't absorb it:* ffsim's Python/Rust stays out-of-process (Tier-3 untrusted, Toxic Border); no math reimplemented in core. **⚠️ STATUS CORRECTED 2026-06-15: Phase 0 + Phase 1 SHIPPED & TESTED** (`tolerance` manifest schema in `inference-bridge-contract` + pure-TS governance core in `logicn-ext-bridge-quantum`, 12 tests). FFSM `SESSION-HANDOFF.md` "nothing built / start at Phase 0" is STALE — resume at **Phase 1.5** (AuditLogger + Ed25519 attestation) → **Phase 2** (real `ffsim_worker.py` + child_process, external-infra-gated on a pinned Linux venv). New job-oriented `QuantumSimBackend` contract (NOT the ternary `InferenceBridge`); `quantum {}` contract sub-block (analog of `ai {}`); pre-spawn **subspace-dim gate** `C(norb,nα)·C(norb,nβ)` as the real memory governor; **tolerance-determinism** (never bit-exact) → needs additive `manifest.ts` extension (`DeterminismMode+="tolerance"`, `pinnedEnvHash`, `backendArtifactHash`); reuses CF-3/CF-7 attestation (#137/#138). **All 7 design decisions RATIFIED 2026-06-15:** tolerance-certified admissible iff 3 pins present (pinnedEnvHash+tolerance+backendArtifactHash), fail-closed; crypto-exclusion = **`LLN-SUBSTRATE-001`** (declare ffsim path `lane: noisy`, reuse shipped `verifySubstrate` — no new machinery); receipt signs SHA-256 on the deterministic core; per-call spawn v1; OCI/gVisor sandbox Stage B. Full spec + skeleton + checklist + resolved decisions in **`docs/Knowledge-Bases/logicn-ext-bridge-quantum-design.md`**. Corrects `notes/33` ffsim↔ternary/NTT/BitNet/MeshQL conflations. **Phase 0 = additive `inference-bridge-contract` manifest schema change (decided, §9.1) gates everything.** | 🔲 | ext-bridge-quantum (new) · inference-bridge-contract · tower-citizen · substrate-model |

---

## 4. Code-area → task review reverse index (graph triggers)
*Change a file in the left column → re-verify the task IDs on the right.*

| Code area | Tasks to review |
|---|---|
| `core-compiler/wat-emitter.ts` | 36, 70, 81, 87, 118, 119, 120, 141, 142, **144**, **145** |
| `core-compiler/wasm-runtime.ts` | **105**, **143**, **145**, 147 |
| `core-compiler/governance-verifier.ts` | 37, 38, 39, 45, 56, 66, 71, 72, 74, 79, 88, 89, 90, 100 |
| `core-compiler/manifest-generator.ts` · cbor | 33, 37, 67, 68, 75, 77, 78, 79, 80, 108 |
| `core-compiler/parser.ts` · lexer.ts | 36, 51, 55, 57, 61, 62, 73, 81, 87, 93, 144 (enumDecl) |
| `core-compiler/interpreter.ts` | 15, 55, 62, 86 |
| `core-compiler/attestation.ts` | 34, 35, 107, 108, 109, 137 (Ed25519 pattern reused) |
| `core-compiler/capability-types.ts` | 38, 85 |
| `core-compiler/self-hosted/lexer.lln` | 97, 101, **143**, **145** |
| `core-compiler/self-hosted/{parser,type-checker,govern}.lln` | 98, 99, 100, 101 |
| `core-compiler/self-hosted/dss/*.lln` | 41, 76, 85, 91, 102 |
| `tower-citizen/hybrid-engine.ts` | 121, 122, 138, 139, 140 |
| `tower-citizen/bridge-attestation.ts` | 137, 138 |
| `tower-citizen/compiled-policy.ts` | 140 |
| `inference-bridge-contract/*` | 121, 137 (manifest schema), 199 (tolerance/backendArtifactHash extension — design) |
| `ext-bridge-cpp/*` | 123, 137 (addon hash) |
| `ext-bridge-quantum/*` (new — design only) | 199 (ffsim out-of-process bridge) |
| `core-sentinel-*` | 130–136 |
| `devtools-pci/*` | 146 |
| `devtools-security/*` | 9, 10, 17 |
| `devtools-project-graph/*` | 1, 2, 3, 69 |
| `devtools-benchmarks/*` | 11–14, 20–23, 129 |
| `scripts/run-phase-close.mjs` · CI | 59, 63, 95, 96 |
| `logicn.mjs` (CLI) · core-cli | 64, 65, 112, 124, 137 (`bridge-attest`) |
| `docs/Knowledge-Bases/*` | 19, 49, 53, 60 + this ledger |

*Maintenance: when a task lands or a file moves, update the row above. Re-run `run-phase-close.mjs`
after edits to refresh graph node/edge counts and confirm audit/governance stay green.*

---

## 5. Milestone #200 / P10 — Post-P9 Integrity & Graph-Indexing Close-Out (2026-06-15)

Full record: **[logicn-200-closeout-2026-06-15.md](logicn-200-closeout-2026-06-15.md)**.
Verified state: **48/48 packages · 4,360 tests · 0 fail**; graph **3,533 nodes / 3,969 edges**.

| # | Item | Status |
|---|---|---|
| 200 | **Post-P9 integrity close-out (umbrella)** | ✅ in-repo portion COMPLETE |
| 200a | Doc reconciliation (SOT/ledger counts, #143/#145 un-staled, #199 corrected, FFSM banner) | ✅ |
| 200b | **#177 graph fix** — `createFileNode`+`extractLogicnSymbols` logicn-source nodes; +3 pkgs to workspace | ✅ |
| 200c | `SecretSinkMonitor` dead-duplicate consolidation + graph regen | ✅ |
| 200d | Full-repo deep audit (48 confirmed / 1 refuted; 10H/17M/21L) | ✅ |
| 200e | External idea-mining (8 repos → 12 ranked; [logicn-external-idea-mining-2026-06-15.md](logicn-external-idea-mining-2026-06-15.md)) | ✅ |

**Open follow-ups become the roadmap (NOT part of #200):**
- **#201 — "calibration-as-attestation" lane (increments 1-2 LANDED 2026-06-15 — see §6):** measured-tolerance/precision-attestation contract work (idea-mining #5→#2+#12→#3+#4→#1); extends `BridgeManifest`+`DeterminismMode "tolerance"`.
- **#202 (proposed) — honesty pass (#179-class):** H3/H4 ML-DSA naming, manifest CBOR/JSON header, LEXER_PARITY downgrade, scaffold relabeling, README overclaims, `canCommit` wiring-or-docstring.
- **#177-followon:** add the remaining ~34 real packages to `logicn.workspace.json` (graph under-coverage; #155-adjacent).
- **User-gated (TCB/decisions):** H1 cert-profile pre-image · H2 `policy{}` fail-open (parser) · H5 fusion-B2 ABI · #149 key rotation+force-push.
- **External-infra:** real DSS.wasm (#102-106) · ffsim Phase 2 (#199) · ML-DSA-65 manifest wiring.
- ⚠️ **dead-export findings are "wire-or-verify", NOT "delete"** — some (e.g. plugin-schema.ts) are pending-integration security code per P9-144.

---

## 6. Session continuation (2026-06-15 cont.) — #201 lane opened + audit-fix landings

Verified: **48/48 · 4,368 tests · 0 fail**. 7 commits on top of `Initial commit` (all local). KB: [logicn-precision-attestation.md](logicn-precision-attestation.md).

| # | Item | Status | Commit |
|---|---|---|---|
| 201 | **Calibration-as-attestation lane (umbrella)** | 🔶 contract-package portion landed | — |
| 201.1 | Measured-attestation manifest fields: `comparabilityHash`, fidelity floor (`minFidelity`/`measuredFidelity`), `toleranceWitness {N,ε,std,noiseModelId}` + the **"can't claim a tighter band than measured"** invariant. Opt-in, hash-preserving, fail-closed. | ✅ | `659b90c` |
| 201.2 | `QuantizationMethod` axis (none/qat/gptq/awq/marlin/nf4/gguf) + optional `quantizationMethod` field (idea #5 done as a SEPARATE axis — widening `PrecisionTechnique` would break the Tower's exhaustive `Record<PrecisionTechnique,_>` maps). | ✅ | `31b44ee` |
| AF-1 | **border-check** fail-closed admission gate: 13 spawn-CLI regression tests (P9-144 §83) + wired into `run-phase-close`. | ✅ | `2d584c0` |
| AF-2 | **Sentinel instanceof fix:** `Object.setPrototypeOf` restored in memory/state error classes (consistent with egress/io) + regression test. | ✅ | `beb575b` |
| AF-3 | `type-registry.ts:145` stale comment → inline `EffectFlags`. | ✅ | `beb575b` |
| AF-4 | **Graph duplicates:** verified NOT mergeable (`project-graph` is a vendored external repo + `graph-algorithms` is compiler-used); hardened our `canReach` + do-not-merge marker. | ✅ | `f57ef02` |

**#201 — enforcement + still-open (corrected 2026-06-16):**
- ✅ **Universal enforcement VERIFIED (not a gap).** The Tower admission gate `hybrid-engine.ts:265 → verifyAttestation → validateManifestShape` (`bridge-attestation.ts:71`, fail-closed) runs ALL #201 checks; `attestationHash` hashes the `canonNum`-hardened pre-image. Proven end-to-end by `bridge-attestation.test.mjs` (non-finite tolerance / below-floor fidelity / tighter-than-measured witness all DENY at admission). *(The earlier "not wired" note was a grep `head` truncation false-negative — caught by reading the code.)*
- 🔒 **Attestation-injectivity fail-open FIXED** (`66e1b48`): non-finite numeric fields can no longer alias two manifests to one sha256.
- **Still open:** **#1** precision-attestation gate (compiler-side) · **#3/#4** substrate integration (`verifySubstrate` + the witness) · storage/compute-precision split (needs `int4`/`int8` in the routing enum + both Tower Records) · **#2** comparability + mandatory-witness as required pins for `determinismMode='tolerance'` (with ffsim-manifest migration).

---

## 7. R&D adoption — `.tmf` / tri-encryption (2026-06-16)

Full review: **[logicn-rd-adoption-2026-06-16.md](logicn-rd-adoption-2026-06-16.md)**. Both R&D tracks are
R&D-only; the `.tmf` engine + confidentiality build are **gated on owner go**. Crypto stays the engine layer.

**Usable in LogicN NOW (govern-don't-absorb) — proposed:**
| # | Task | From | Status |
|---|---|---|---|
| 203 | **Verify-before-decrypt key-release pattern** — `tests/patterns/pattern-10-verify-before-decrypt-gate.lln` (collapse/authorize/keyRelease, fail-closed). `logicn check` clean + runs on WASM (collapse(0)=-1; keyRelease(t,t,1)=1; keyRelease(f,t,1) & (t,t,0)=-1). LogicN governs confidentiality; crypto stays engine-side. | tri-enc U1 | ✅ **LANDED 2026-06-16** |
| 204 | **"No cleartext semantic embedding across a trust boundary" rule** — candidate `LLN-PRIVACY-*` data-exposure diagnostic (unencrypted embedding/attribute vector crossing egress/wire = violation). | tri-enc U2 (verdict 5) | 🔲 proposed (MED) |
| — | Strengthen `LLN-SUBSTRATE-001` substrate KB with the crypto-on-core evidence + extend wording to "encryption/hashing/signatures" (`future-substrates` contradiction already ✅ fixed). | U3 | 🔶 partial |
| — | Ground `fp4_block` `PrecisionTechnique` with the verified NVFP4 byte facts (16×E2M1 + 1-byte scale = 9 B/block, lossy, not-ternary). `TECHNIQUE_BITS fp4_block=4` already correct. | U4 | ✅ done (comment) |

**NOT usable / gated:** `.tmf` Rust engine · KEM-DEM impl · TMX/container/NVFP4 specs · ML-DSA-65 hybrid spec (feeds #34 when it lands) · FFSM Phase 2 · MeshQL DB layer.
