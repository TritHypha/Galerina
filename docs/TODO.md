# TODO

Living task list. Authoritative forward view: `../ZTF-Knowledge-Bases/galerina-roadmap.md`.
Live per-item state also lives in the in-session task board + `../ZTF-Knowledge-Bases/coordination/` (main↔R&D).
The dated blocks below are a historical log; the **CURRENT STATE** block is the head.

## 📍 CURRENT STATE — 2026-07-24 (three-valued-stance corrections + path-forward plan · owner ruling: tick-bounding suspended for the parser arc)

**Forward view:** `roadmap-2026-07-24.md`. Source of truth for this plan is the R&D corrections & path-forward
plan (relayed via bridge `0150`/`0151`, owner-directed 2026-07-24); the rows below mirror it onto this board
with local `#NNN` handles. Shared cross-session labels (`C#` corrections · `U#` updates · `R#` re-working ·
`S#` sync-items) are kept as the canonical vocabulary. **Owner ruling (2026-07-24):** both parked latitudes
GRANTED — **tick-bounding SUSPENDED** for the flagship COMMIT 1 and the traced `parseParams` fix (each is a
single indivisible verified unit; tick-slicing is the worse fail-open). **Order: C4+C5 (traced fix) → COMMIT 1
(R2) → COMMIT 2 (R3).** Each lands complete with its own differential; no half-states.

### QC check-off — EVERY landing checks ALL boxes before "done" (owner-directed, on the board)

```
[ ] mechanism TRACED at source before the edit (no fix built from a guess)
[ ] finder tooling named in the report: myco + codebase-memory graph (what was searched, what found)
[ ] checking tool MANUFACTURED or extended for this change, with a self-test that goes RED and GREEN
[ ] new tests added (not only existing suites green)
[ ] audit added/updated if the change closes an enforcement gap (advisory→error, new gate)
[ ] acceptance probe run and cited: which battery rows / probe rows flipped, with exit codes
[ ] parser.fungi touched? → R3 parity re-proved + hashes regathered + evidence pack refreshed, own commit + differential
[ ] docs truth-in-docs: no advisory called an error; enforcement strength stated as measured
[ ] no half-states: the unit landed complete or not at all
[ ] bridge report sent; R&D re-verification requested where agreed (C4 five-row table, battery fixtures)
```

### A · Corrections (defects measured, fixes settled)

| Board | Label | What is wrong | Fix | Acceptance |
|---|---|---|---|---|
| #144 | C1/S1 | `if`-condition typing does not exist — `if <Verdict>`/`if <Int>` compile + build clean (battery F1; MAIN independently confirmed `if <Int>` → 0 diags even `--strict-types`) | new counted FUNGI-TYPE code; `if`/`while`/`check` conditions must type as `Bool` | battery s1+s8 flip RED; 460-file corpus stays green (28/28 bare-ident ifs are Bool → pure prevention) |
| #145 | C2/S2 | FUNGI-GOV-3VL-004 demoted to uncounted advisory; builds proceed (F2) | promote to counted error + build refusal | battery s2 flips RED |
| #146 | C3/S3 | A9 mixed Verdict/Bool rules (`and`,`==`) advisory-only (F3) | promote to counted errors (incl. `return 2` as Verdict) | battery s3/s4/s9 flip RED |
| #147 | C4+C5 | Twin `parseParams` discards qualifiers; `readonly tainted` → `isReadonly:false` — silent safety-property loss (traced bridge 0147: missing qualifier loop + 2nd capture site hardcoding `false`); FlowParam metadata gap is a parser-flip precondition | `parser.fungi:453-487` — qualifier loop (any order), ONE capture path, `source_from` suffix, `FlowParam`+`isTainted`+`sourceFrom` | R&D 5-row probe green, rows 3–5 carry modifiers; R&D re-probes on landing |
| #151 | C6 | Docs overstate enforcement ("compile error" where product demotes to advisory) | truth-in-docs sweep; wording tracks S2/S3 promotion status | no doc calls an advisory an error |
| #152 | C7/S5 | "identical to BitNet I2_S" reads as vendor dependency (`tpl-simulator.ts:60`) | "coincides with … (informative)" | wording landed |

### B · Updates (bring docs/components to the settled stance)

| Board | Label | Item |
|---|---|---|
| #153 | U1/S6 | "Kleene K3" first-use sweep + docs lint (first `K3` in any doc = "Kleene K3") |
| #154 | U2/S7 | W5a rationale + FREEZE: document `and`/`or` Verdict overload (K3 min/max) + mixed-reject; no new type-overloaded operators; `==` returns Bool universally |
| #155 | U3 | Hardware-stance wording: vendor-neutral (differentiator = hardware-independent typed indeterminacy; ternary HW = optional backend) |
| — | U4 | Operator ruling: words now, symbols later ONLY via opt-in edition (owner 2026-07-24); `===`/`!==` unlexed forever. Propagate to Galerina docs when touched |
| #156 | U5/S11 | Battery → regression fixtures (12 files w/ `@version 1`), after S1–S3 |

### C · Re-working (structural)

| Board | Label | Item | Gate |
|---|---|---|---|
| #150 | R1/S4 | Verdict-match wildcard-polarity audit (`_` arm on Verdict must not reach allow-outcome; corpus clean today) | 🟢 ready — MAIN lands, R&D self-test shapes exist |
| #148 | R2 | **Flagship COMMIT 1** (`where` admission, `parser.ts`) — 7-element single unit: parse → (B′) sibling flow-clause → Verdict-ALLOW-only gate → Bool\|Verdict auto-lift → **fast-tier exclusion (4 sites: `:1337`/`:3532`/`:3653`/`:3844`)** → test → FUNGI-ADMIT-001/002/003 | ⏳ after C4+C5 (owner-ordered) |
| #149 | R3 | COMMIT 2 (twin parity for R2) — twin carries `whereExpr` as flow-clause keyed by param name | ⏳ after R2 + C4 |
| — | R4 | Spec layering L0–L4 "Semantic Constitution" | 🔴 owner |
| — | R5/S10 | Collapse surface + unforgeable PermitToken evaluation | 🔴 owner (R&D drafts comparison paper first) |
| — | R6/S9 | Conformance additions (non-laws, 21-vector tables, illegal-4th-state trap tests, collapse-barrier tests) | MAIN; RD-0529 family |
| — | R7 | Parser-stage authority flip (RD-0528 I-4) — needs C4/C5 + finding-d + rung-4 policy + R3 re-prove + #163 | 🔴 owner per-stage nod |
| #163 | R7-pre | **Per-stage intern-table isolation** — the gather's shared cross-stage intern table couples per-stage evidence hashes: a single `parser.fungi` edit moved all 7 stage hashes though only parser's source changed (measured C4/C5 `40c056a2`; R&D-confirmed 0154). Per-stage evidence cannot be independently pinned until compilation is intern-isolated. A **parser-flip precondition** (finding-d 2nd drift finding). | ⏳ before R7; MAIN |
| — | R8 | Mass `.fungi` conversion — behind doc blockers + S1–S3 + R1 | 🔴 owner GO after Phase 1+2 |

### D · Additions (owner-directed, plan §G)

| Board | Label | Item |
|---|---|---|
| #157 | S13 | **Advisory-tier systemic audit** — enumerate EVERY diagnostic family demoted to "not counted in plain check"; per-family counted-vs-advisory ruling. A security-grade rule silently advisory is the class the battery caught |
| #158 | S14 | **Tooling mandate** — every arc uses myco + codebase-memory graph AND manufactures its checking tools (battery→standing gate, FlowParam probe→fidelity tool, admission fixtures, R1 audit) + new tests/audits per arc; state tooling in bridge reports ("hand-checked" ≠ tooling) |
| #159 | S15 | **myco re-vendor** — fold upstream fixes (EPIPE `f930c53` + file-path/stderr `830e120`) from `subprojects/myco` into `@galerina/tools-myco` WITH regression tests (0032 lesson) |
| #160 | S16 | S1 scope: acceptance covers `while` + `check` too; enumerate the FUNGI-TYPE code each current advisory carries |
| #161 | S17 | S2/S3 acceptance includes BUILD refusal (battery s3/s4/s9 never run through build), not just check-counting |
| — | S18 | Housekeeping (owner): push queues · archive oversized session-bridge memory · retire superseded KB `coordination/` channel |

### Phased path (plan §D)
1. **Prevention gates** (corpus clean = cheapest): S1→S2→S3 (one arc, same files) + R1 audit + U5 fixtures.
2. **Parser fidelity arc** (owner-ordered, tick-bounding suspended): **C4+C5 → R2 (COMMIT 1) → R3 (COMMIT 2)**.
3. **Wording/docs** (parallel-safe): C6, C7, U1–U4.
4. **Owner-gated structure:** R4 · R5 · R7 preconditions.
5. **Conversion GO:** R8 once Phases 1–2 land + doc blockers clear.

> Phase-1-vs-Phase-2 ordering was the owner's call; the ruling fixed **Phase 2's internal order** (C4+C5 first).
> S1–S3 ride as the next arc or as tick-sized side-work.

## 📍 2026-07-23 (superseded by the 2026-07-24 head above) — compiler self-hosting RD-0528 + crypto-agility 0099 part 1 + parameter-enhancements commission · pre-flip battery run

**Forward view:** `roadmap-2026-07-23.md`. This head supersedes the U2-ceremony block below — U2 is DONE + enforced, and the token-kind arc is LIVE-COMPLETE (not "active"). Owner unlocked the I-2/I-4/crypto/DSS gates; key bytes stay the owner's.

### Session deliverables (since the U2 ceremony)

- **Token-kind arc LIVE-COMPLETE.** The dispatch-wildcard `==` fail-open closed (records/lists structural, `195804fd`); the live twin `Token.kind == "…"` sites migrated value-based (`7d603948` underscore lexer · `d622b464` policy · `72e85535` guard+conforms_to). No broken kind-compare remains. `a1` (full enum-value evaluation) is deferred as a coordinated interp+WASM-emitter change (interp-only breaks the R3 parity gate).
- **Crypto-agility (0099) part 1** (`eec56499` + `1c437ca`): `governance/crypto-suites.json` mirrors the authoritative signature-suite register (3 domain-separated families) + a fail-closed reader (`crypto-suites.mjs`: only an active suite signs, a retired suite keeps verifying, unknown/malformed denies), 18/18. Carries the `signProofGraphHybrid`→v1 signer-downgrade finding for the part-3 gate. Parts 2–3 (dispatcher + conformance gate) queued.
- **Compiler self-hosting I-3 oracle** — 3 tranches over the REAL self-hosted pipeline, 31/31: type-correctness (FUNGI-TYPE), parse-correctness (FUNGI-PARSE-001..004, `0f3a7761`), governance-correctness (FUNGI-GOV-002 + FUNGI-VAL-001, `e1a9112c`; + safety_critical VAL-001/002 end-to-end `aec10ce0`).
- **Finding (d)** (`d6b27b64`): the self-hosted parser now extracts `classification` + `deterministic` from the `value{}`/`safety{}` contract sub-blocks — the **parser-flip precondition** (R&D 0116). 4968/4968, wat-p9-parser-parity green, #105-admit. Two rule-10 drift findings: the stage-hash baseline was stale for parser since `72e85535` (fixed); the gather's **shared cross-stage intern table** couples per-stage hashes (a flip-ledger precondition — isolate per-stage compilation before I-4).
- **Hardened Border** (`b2dc4d97`): allow `node:url` in `@galerina/core-compiler` (a `fileURLToPath` import added in U2 without the policy widening — latent-red, now green; border 97/0).
- **Parameter-enhancements commission (RD 0119) item 1** (`8394c62f`): `docs/language/fungi/parameters.md` — source-grounded parameter reference (the free win). Flagship (three-valued K3 parameter admission) is next, R&D co-designs; owner elevated the commission to before-`.ts`-switch.
- **Pre-flip battery (owner-asked):** graph-all 6/6 green (project 6883n/7153e · integrity 0 · **border 97/0** · kb/memory/dev-tool clean) · full test suite green (exit 0) · phase-close green EXCEPT two reds — (1) `effects:corpus`: the 4 vault `vault.read/write` examples (non-canonical → FUNGI-EFFECT-004), **owner-routed to R&D** to decide+spec (`0124`); (2) `artifact-drift`: a **PRE-EXISTING** diagnostic-code registry ratchet growth (phantom 111→112, dead 8→13, entered at `3081a5b2` a day before this session — the taxonomy burn-down #86, NOT blind-bumpable).
- **Flip-prereq set** (all before the `.ts` switch): finding-d ✓ · parameter enhancements (flagship) · per-stage intern isolation · usedEffects derive-not-field-read confirm · the vault-effects decision (R&D) · the artifact-drift hygiene · then the owner's full graph+audit+tests battery.

## 📍 2026-07-23 (earlier, superseded) — U2 ceremony COMPLETE + floor ENFORCED · parser fail-closed · token-kind arc

**Forward view:** `roadmap-2026-07-23.md` (generated status block + the ladder). Compiler pkg last evidenced
**4,930/4,930 · 0 fail**; drift gate green; gate-selftests 69 gates · 56 guarded · 0 violations.

### Session deliverables — 2026-07-23 (the U2 ceremony day)

- **U2 admission provenance COMPLETE + ENFORCED.** `generateManifest` stamps `compilerVersion` inside the
  SIGNED manifest body (`4726e301`; Ed25519 verifies WITH the field, strip-control fails — the stamp is under
  the signature). Owner ceremony re-signed `greeting` under the operational key `942d6b2726b0a991`
  (`596bae4e`, pushed) — the root/operational split is complete, the root key never entered the ceremony.
  Floor gate `scripts/audit-u2-version-floor.mjs` (self-test 11/11, CG-7 shared discovery, no-op alarm)
  flipped to `--enforce` in phase-close (`3961346a`): absent field on a signed package manifest ⟹ refuse,
  permanently. Ceremony determinism datum: the rebuilt `greeting.wasm` was byte-identical to HEAD.
  Runbook hardened live during the ceremony: 4.5 requires `--force` (CG-7 writer guard's documented
  pre-re-sign override) · 4.7 stages BOTH drifted files (`.fuse.json` moves with the manifest).
- **Self-hosted parser FAIL-CLOSED** (`07699ca4` FUNGI-PARSE-001..004 mirroring the `.ts` reject points;
  anti-cascade = one bad line one error) + **driver refusal at all 8 sites** (`001ff8cf`). The guards paid
  immediately: exposed the line-1 `@version` over-closure and a months-old always-true kind compare that
  corrupted every import path. Zero parity-hash movement; suites green.
- **A7 interp preconditions** (`2a348d1b`): non-`result` `invariant { ensure … }` enforced at flow ENTRY
  (`FUNGI-INV-001`), fast tiers excluded for such flows (anti-bypass). Corpus 31 programs / 63 calls
  interp ≡ V8 ≡ wasmtime (49 value · 14 symmetric-trap).
- **Token-kind arc GROUND TRUTH measured (the active primary):** enum comparison is broken in EVERY form —
  `Color.Red == Color.Green` is `true`, `== "Red"` always false, bare members always true, checkTypes silent
  on all of it; `policy` decls are dropped by the twin parser (now LOUDLY — driver refusal catches them);
  `permitted_effects` lexes as 3 tokens (`scanIdent` lacks underscore — `.ts` measured: ONE token, so the
  twin lexer is the bug). Build order (R&D-coordinated): (a1) interp enum values + real equality →
  (a2) FUNGI-TYPE enum-vs-string + FUNGI-NAME bare-member statics → (b) underscore lexer fix →
  (c) policy-branch migration. Acceptance: probe table → true/false/error/error/error · `policies count : 1`
  · R3 re-proof per commit. The parser authority flip (I-4) is HARD-blocked on (c).
- **Board hygiene:** #100/#138/#140 CLOSED (stale labels — work had landed and was re-proven functionally);
  #137 re-scoped tractable (wire the existing ScaledDecimal i32-handle); #103 parked; #66 deprioritized.
- Bridge: myco field report (index freshness verified OK; two minor UX items) · underscore ruling ·
  PLUGIN-001/FUEL-001 traced + handed over · ceremony settled-values handover. R&D lands its KB batch
  (register settle-up + canonical registrations) as one push post-ceremony.

## 📍 PREVIOUS STATE — 2026-07-23 earlier (RD-0528 compiler self-hosting — I-1 authority track + I-3 functional corpus; DSS.wasm at ceiling)

**Suite green.** Full workspace last totalled 95/95 pkgs · 7,672 · 0 fail (2026-07-22); this session ADDED tests, all pass — full re-total pending. Evidenced this session: compiler pkg **4926/4926**, SEC-002 **59/59 killed**, I-3 corpus **11/11**, all 6 graphs green, audit 0 errors.

### Session deliverables — 2026-07-23 (DSS.wasm at ceiling · RD-0528 I-1/I-3 · #141 report-blind → 0 · redact standalone)

Full-auto loop (main); owner away for the tail. Commits below, NONE pushed (owner pushes).

- **DSS.wasm sidecar at un-gated CEILING** (`subprojects/dss-host`, native Rust wasmtime TCB): M0 fuel · M1 386-pt V_DPM differential+laws through REAL wasmtime (U10 engine-transfer closed) · F4 pooled zero-on-reset · **F3 #173 attestation re-verify** (`ade43cd3`; ed25519-dalek per owner ruling; INTEROP + 4 tamper-reject proven, 5/5). No open HIGH. F7 / collapse-conformance / U2 batched for a later Phase-5 sprint (owner-gated).
- **RD-0528 compiler self-hosting I-1** — the 7 self-hosted stages get their OWN authority track (PROPOSAL; each flip owner-gated at I-4, SEPARATE from the kernel sentinel ledger): (a) R3 byte-parity re-verified **512/512**; (d) `scripts/gather-compiler-stage-hashes.mjs` — 7 build-clean + #105-admitted, deterministic sha256; ledger `docs/security/rd0528-compiler-authoritative-stages.json` (empty `twins`) + gate `scripts/audit-compiler-stage-twins.mjs` wired into phase-close; (c) **mutation-kill 7/7** in SEC-002 (`RD0528_COMPILER`, **59/59 killed · VIOLATIONS 0**); evidence pack `docs/security/rd0528-compiler-stages-evidence-pack.md`. **Prereqs NOT pre-empted:** I-2 bootstrap-seed (owner's steer: pin the current Stage-A WASM at a commit + trust register) · I-3 oracle.
- **RD-0528 I-3 functional corpus tranche 1** (`ef246e01`) — owner ruled I-3 = FUNCTIONAL correctness, NOT `.ts`-intermediate identity. `tests/self-hosted-i3-functional-corpus.test.mjs`: NON-VACUOUS (4 must-pass + 6 must-fail with exact MEASURED codes) over the self-hosted lex→parse→typecheck pipeline, **11/11**. Findings routed to R&D (`#0048`/`#0049`): the self-hosted compiler has NO WAT/WASM backend (bootstrap fixpoint blocked) · `parser.fungi` never reports parse errors → pipeline fails OPEN on 3/6 malformed inputs.
- **#141 report-blind consumers → baseline 0** (`a5a779f9` signing-path gather-t1/t2 · `20f98252` +6 audit/bench): every `assembleWAT` consumer now gates on `valid && diagnostics.length===0` before using `.wasm` — the unfaithful-STUB fail-open class is now impossible to introduce silently (a new one = a VIOLATION, exit 1). Detector **0 violations / 0 baselined**, self-test 15/15; twin sha256 unchanged (signing path preserved).
- **redact standalone fix** (`7180bd04`): `redact(x)` emitted a call to an undefined `$host___redact` → invalid standalone module (A2 defect); now lowered INLINE to the **-2 sentinel** (`__redact` always returns -2 — value-faithful, PII-stripping, host-free). audit-wasm-validate exit 0; full compiler suite **4926/4926**.
- **All 6 graphs green** (`308b5e4d`): project 6848n/7121e · integrity 0 · **Hardened Border 97/0** · memory clean · dev-tools 97 pkgs / 111 tools / 40 proofs.
- ⚠ **Stale task-board items caught (verify-don't-trust):** `#140` (CLI omits AST arg) + `#138` (consumers gate on `valid` alone) BOTH already fixed in-tree — not re-done.

### Session deliverables — 2026-07-22 (R4 T2 flip · DSS.wasm Phase 5 START)

- **WAT emitter confirmed DONE** — `audit-wat-lowering.mjs` `VIOLATIONS: 0`; only Decimal (bignum,
  correctly fail-closed, `#137`) + HOF (closures) remain, tracked as their own feature-flags.
- **R4 authority flip (`#143`) — T2 Memory tranche FLIPPED** (`432cddee`) under owner GO. Five
  sentinel-memory twins now authoritative (memory-validator · pool-allocation-guard · pool-policy ·
  segmentation-guard · trit-buffer-guard); full evidence pack `docs/security/rd0361-t2-r4-evidence-pack.md`
  (a–e: all differential · 7,672 green · **52/52 mutants killed** · 5/5 hash-pinned + #105-admitted via new
  `scripts/gather-t2-twin-hashes.mjs` · perf N/A). **Ledger: 9 authoritative (4 T1 + 5 T2) · 20 differential ·
  0 shadow · `audit-kernel-fungi-twins` exit 0.** Non-destructive shadow-bake (`.ts` retained as the live
  differential guard; deletion is a later step). Remaining per-tranche: T3 IO/network · T5 tower (mutation
  groups already exist) · **T4 cert-gate LAST** (flips late).
- **DSS.wasm Phase 5 (`#102–106`) STARTED** — owner lifted the pause. Spec-of-record: KB
  `galerina-deterministic-runtime-containment.md` (DRCM, locked Decisions 2026-06-04) + R&D bridge **#0039
  addendum U1–U8** (the build checklist): U1 `#105` admission faithfulness precondition (structural since
  `#163`) · U2 compiler-version floor in the attestation profile · U3 wasmtime fuel-API re-pin
  (`Store::add_fuel` removed → `set_fuel`/`get_fuel` + `Config::consume_fuel`; a Store starts at **0 fuel and
  traps** = fail-closed default) · U4 audit via `Observer.onOutput` → sentinel-egress HMAC ledger (DONE,
  `c82db9b1`) · U5 V_DPM zero-mask fail-closed differential point · U6 register `FUNGI-INV-000/001/002` ·
  U7 fuzz determinism replay `(seed, params, version)` · U8 DRCM 7-phase gantt marked historical.

### Session deliverables — 2026-07-22 (WAT stdlib host stubs finished · EXOR/XNOR · RT-28→DSS.wasm inputs)

Full-auto loop (main). 3 commits, none pushed. Verified green this session: runtime-wasm **27/27** · compiler host+p9-exec **32/32** · core-logic tri-contracts **45/45**.

- **WAT stdlib host stubs FINISHED** (`c82db9b1`, on prior `3081a5b2`). Money currency constructors
  (gbp/eur/usd/chf/jpy/cad/aud/nzd/sgd/hkd) + `print`/`println` + `redact` + `range` now LOWER
  (`STDLIB_HOST_CALL_MAP` in `wat-emitter.ts`) **and EXECUTE** (host stubs in
  `galerina-core-runtime-wasm/src/wasm-runtime.ts`). `print`/`println` route through a NEW
  **`Observer.onOutput`** (the governed, auditable sink — DSS audit-output seam), console.log dev-fallback
  only; the old comment overpromised "observer capture" while only console.log'ing → fixed. Added
  **`readMoney`** accessor (the money handle was write-only). New oracle
  `wat-host-stdlib-stubs-oracle.test.mjs` (11 cases). Decimal/map/reduce/filter stay fail-closed `(unreachable)`.
- **EXOR question answered — NO exclusive trit-or is needed** (owner asked). `xorTrit` = `sumTrit` =
  arithmetic balanced-ternary SUM (the AXOR), correct and quarantined from governance by the Verdict/Trit
  brand + machine-checked in `tools/verify-governance-algebra.mjs` SUITE 3 + `governance-algebra-binding.test.mjs`.
  `triStateXnor` = Kleene equivalence — was defined+exported but **UNTESTED**; added truth-table +
  unknown-propagation tests for it AND `triStateImplies` (`32996c49`). `triStateXor` genuinely absent, no
  consumer. ⚠ The RD-0525 **T1 "binary-fuse/XOR filters"** tech uses **bitwise** `Int.bitXor`→`i32.xor`
  (already shipped `d18e2841`, differential-tested) — NOT a trit operator. A logical EXOR would be
  `triStateEXOR = NOT(triStateXnor)`; add only when a real consumer needs "exactly one of A/B" reasoning.
- **RT-28 (Wasmtime security/correctness) → DSS.wasm** design inputs committed (`6281396c`,
  `docs/architecture/dss-wasm-runtime-security-inputs-2026-07-22.md`). The DSS differential proof is a
  FIDELITY gate ("not an isolation claim"); RT-28's ISOLATION practices are inputs for the post-v1,
  owner-gated `#102–106` embedder (behind the R4 flip `#143`). Five requirements folded to R&D bridge `#0038`.
- Bridge: verified R&D `0032` **RESOLVED** at source (myco mirror `@galerina/tools-myco` is Apache-2.0 +
  pinning tests + `galerinaVendor` provenance); `0033` owner packs queued behind WAT/P9.

### Session deliverables — 2026-07-22 (Phase 3: R3 byte-parity for 3 checker stages)

- **Phase 3 DSS.wasm path COMPLETE** — R3 byte-parity proven for all 3 remaining stages:
  - `wat-p9-typechecker-parity.test.mjs` — 13/13 ✅ (`checkFlows` + `checkFlowBodies` byte-parity)
  - `wat-p9-effectchecker-parity.test.mjs` — 14/14 ✅ (`checkBodyEffects` flowCount + cleanFlows byte-parity)
  - `wat-p9-governance-parity.test.mjs` — 14/14 ✅ (`verifyGovernance` + `checkBodyGovernance` byte-parity)
  - Root causes found and fixed (all 3 classes of WAT `unreachable` emitted by `#128-sibling` fail-closed):
    1. **`stmt.isBranded`/`isTensor`/`typeArgs`/`arms` on `Stmt` record**: added extended fields to `Stmt`
       definition in `parser.fungi` (appended after slot 5 to preserve slot-stable JS WASM reader).
    2. **`withNames`/`effectWithNames` reading `d.code` etc. on `Auto` diagnostic record**: typed-local
       hoist `let td: TypeDiagnostic = d` / `let td: EffectDiagnostic = d` resolves field layout.
    3. **`containsEffectRec`/`collectTransitiveEffects`/`checkBodyEffects` reading `rec.effect` on `Auto`**:
       added `EffectTransRec { effect, introducer }` record + typed-local hoist `let erec: EffectTransRec = r`.
  - **All 7 self-hosted stages now at R3 byte-parity** (lexer, parser, gir-emitter, runtime, type-checker,
    effect-checker, governance-verifier).
  - **DSS.wasm path progress: Phase 1 ✅ → Phase 2 ✅ → Phase 3 ✅ → Phase 4 (R4 owner-gated)**

### Session deliverables — 2026-07-22 (Phase 2: #100 Array<Auto> fix)

- **Phase 2 DSS.wasm path COMPLETE** — `#100` Array<Auto> type-erasure debt paid in all 3 trapped stage
  twins (`type-checker.fungi`, `effect-checker.fungi`, `governance-verifier.fungi`):
  - Root cause: `Array<Auto>.get(i)` returns `Option<Auto>`, so field accesses on the element have
    unknown offsets at WAT lowering → `unreachable` trap at runtime.
  - Fix: concretized to `Array<FlowDecl>` / `Array<Stmt>` / `Array<Expr>` / `Array<FlowParam>` at every
    flows/stmts/exprs/params parameter where field access follows `get()`. Same proven pattern as
    `gir-emitter.fungi` (2026-07-19).
  - `parser.fungi` extended with `classification: String` / `deterministic: Bool` / `usedEffects: Array<String>`
    on `FlowDecl` (emitted with safe defaults) so `governance-verifier`'s field accesses resolve.
  - `audit-stage-execution.mjs` TRAP_BASELINE lowered **3→0**: all 5 swept stages now RUN (R2 green).
  - Commit: `4eba36bd` · 95/95 · 7,619 · 0 fail
  - **DSS.wasm path progress: Phase 1 ✅ → Phase 2 ✅ → Phase 3 (R3 byte-parity, 3 new stages)**

### Session deliverables — 2026-07-22 (A18 tenant scope)

- **A18 tenant scope CLOSED** — the declared beta blocker. FUNGI-TENANT-001/002 defined +
  `verifyTenantIsolation()` wired in `governance-verifier.ts` (Half A + Half B complete):
  - **Half A** — deny-by-default-private: any effect ending `.tenant_scoped` without the sibling
    `tenant.scope` marker is a FAIL-CLOSED compile error in every profile (dev/production/deterministic/
    check-only). Forgetting the annotation = SAFE/denied (the inversion of the Rails `default_scope`
    footgun).
  - **Half B** — capability-scope intersection at the contract/capability layer (NOT a query rewriter):
    for a tenant-scoped access, the compiler requires the `tenant.scope` caller-scope proof alongside it;
    the unscoped-query class of IDOR bug cannot ship. Exactly the shipped attenuation rule ("delegated
    grants must not be broader than the delegator's authority").
  - Codes registered in `ZTF-Knowledge-Bases/compiler-diagnostics.md` + `galerina-governance-rules.md`.
  - `FUNGI_TENANT_001` + `FUNGI_TENANT_002` exported from `galerina-core-compiler/src/index.ts`.
  - Tests: `tests/governance/tenant-isolation.test.mjs` 10/10 (includes A27 anti-vacuous guard).
  - Half C (per-tenant KEK, border-2, digital) remains gated on tmf slice 4 (M-of-N threshold custody).
  - Phase 1 DSS.wasm path: **A18 ✅ → W6 codemod → T2.3 → Phase 2 (Array<Auto>)**

### Previous session deliverables — 2026-07-22 (Constellation architecture + README/KB docs)

**Session deliverables — 2026-07-22:**

- **README.md `## Native properties` section added** — 10-row table of language-native properties (Fail-Closed
  by Default, Declared Authority, Zero-Trust Boundaries, Structured Fault Handling, Deterministic Execution,
  Supply-Chain Provenance, Post-Quantum Ready, Data Security, Reproducibility, Auditing). Each row grounded in
  real mechanisms (K3 lattice, `contract {}` blocks, `FUNGI-MATCH-001`, hybrid ML-DSA-65, `.lmanifest`,
  ProofGraph). Not aspirational — describes only what is actually shipped or structurally enforced.

- **Language classification doc written** — `../ZTF-Knowledge-Bases/galerina-language-classification.md`.
  Canonical answer: **"Governed Application Language for High-Assurance Systems"**. Covers: what each word means,
  what Galerina is NOT (systems / scripting / general-purpose / DSL / formal verification), closest analogies
  and where they diverge (Ada/SPARK, Rust, Erlang, Pony), why the classification matters for adopters/auditors.

- **Constellation architecture — confirmed and written up in full:**
  - Gap analysis: `../ZTF-Knowledge-Bases/constellation-architecture-plan-2026-07-22.md`
  - KB canonical spec: `../ZTF-Knowledge-Bases/galerina-constellation-architecture.md`
  - In-repo record: `docs/architecture/constellation-architecture-2026-07-22.md`

  **Key confirmed decisions:**
  1. Finish Core first → TritMesh:QL → other engines. No TritMesh work today.
  2. FUNGI-* / GALERINA-* codes stay with Core. Optional engines define FABRIC-* / CORTEX-* / etc.
  3. No large runtime or compiler changes needed to support the future split — current architecture already
     satisfies the Constellation Core Foundation invariants (Core-only build/test passes; DI seams; authority
     graph; BOUNDARY.md per package).
  4. Optional engines attach via DI seams (deny-by-default when absent) — existing precedent: `InferenceBridge`,
     `target-*` packages. Same pattern for Fabric/Cortex/Quantum.
  5. Sister language reuses shared compiler base (below `galerina.compiler.shared.v1` seam), NOT governance.
     Sister-language work cannot begin until the seam schema is defined.
  6. Repository split happens AFTER Core v1.0 ships and seam schemas are defined and gated.
  7. Lego-block rules are already satisfied in principle. Gaps are tooling/metadata only (not runtime):
     - `package.fungi.json` needs `provides`/`consumes`/`onAbsent` fields in all packages
     - `audit-seam-graph.mjs` gate (fail on undeclared cross-block edges) does not exist yet
     - Interface hash is shallow (method names); needs full typed ABI for production
     - Unplug-denies test exists only for runtime seam; needed for all seams
  8. Audit: 0 errors · 75 warnings (all pre-existing WARN-tier; FUNGI-ASYNC-002..006 correctly in CHECK-5).

**Pre-split gaps (not Core v1.0 blockers — future work items):**
- `package.fungi.json` `provides`/`consumes`/`onAbsent` schema extension
- `audit-seam-graph.mjs` — build-time authority-graph gate
- `galerina.compiler.shared.v1` seam schema document (prerequisite for sister-language work)
- Interface hash extension (full typed ABI)
- Unplug-denies test per registered seam

**Item 14 — REPL (interactive exploration) — DESIGN DONE, not yet built:**
- Package: `galerina-devtools-repl` (new)
- Thin wrapper over existing pipeline: `parseProgram → checkTypes → checkEffects → verifyGovernance → run()`
- Expressions wrapped as synthetic `pure flow __repl() -> Auto { <expr> }`
- Session context: accumulated flow declarations; `:load` / `:reset` / `:save`
- Commands: `:type` · `:effects` · `:explain` · `:k3` · `:gir` · `:profile` · `:quit`
- Capability mocking in dev mode (no real DB/network in REPL)
- Gate: Core v1.0 (A18 tenant scope) first; REPL is 4 sprints (R-1..R-4)
- KB spec: `../ZTF-Knowledge-Bases/galerina-repl-design.md`
- In-repo doc: `docs/devtools/repl.md`

**Item 15 — LSP (IDE developer experience) — DESIGN DONE, not yet built:**
- Package: `galerina-devtools-lsp` (new) + `galerina-vscode` extension
- Library: `vscode-languageserver` (Node.js, same as TypeScript LSP)
- Features: diagnostics · code actions (FixEdit seam already shipped) · completions
  (registry-backed: effects/capabilities/contract keys) · governance-aware hover ·
  value-state inlay hints (UNSAFE/VALIDATED/PROTECTED/REDACTED) · go-to-def · find-refs ·
  governed rename · document outline · workspace symbol search
- Worker thread mandatory — pipeline runs async, main loop never blocked
- TextMate grammar generated from `V1_ACTIVE_KEYWORDS` — not hand-maintained
- Gate: Core v1.0. 7 sprints (L-1..L-7)
- KB spec: `../ZTF-Knowledge-Bases/galerina-lsp-design.md`
- In-repo doc: `docs/devtools/lsp.md`
- Existing aspirational spec: `../ZTF-Knowledge-Bases/galerina-ide-tooling.md`

## 📍 PREVIOUS STATE — 2026-07-21 (P2 K3 inline + vault docs session)

**Suite 95/95 packages · 7,611 tests · 0 fail** · phase-close all green (56 gates) · graph-all all green ·
benchmark snapshot `2026-07-21_post-wat-lowering` (29 benchmarks) · HEAD `9aec26c3` (clean, ahead
of origin — owner pushes when ready).

**Session 3 — P2 K3 inline + wabt probe:**
- `9aec26c3` Proposal P2 (inline K3 min/max): `wat-emitter.ts` binary-op &&/|| on Verdict
  and k3FoldExpr N-operand chain now emit `(select L R (i32.lt_s/gt_s L R))` instead of
  `(call $fungi_k3_min/max L R)` — eliminates 2 WASM call frames per trit-op.
  12 new differential tests in `tests/wat-k3-inline.test.mjs`: WAT-text assertion + 9 trit-pair parity +
  empty folds + 3-operand fold + chained &&. 95/95 · 7,611 · 0 fail.
- Proposal P3 (tail-call return_call) confirmed BLOCKED: workspace wabt rejects `return_call` (too old)
  — blocker + fix design documented in BOB/architectural-redesign-proposals-2026-07.md.

**Session 2 — vault documentation + examples:**
- `5111e9bf` + `4c26f7b7` Vault system was entirely undocumented — zero `.fungi` building standards coverage,
  zero examples. Remediated: new KB doc `ZTF-Knowledge-Bases/galerina-vault-system.md` (3 vault kinds, layer
  model, effects, 7 FUNGI-VAULT-* codes, rules). BOB/fungi-building-standards-2026-07.md §3d rewritten:
  vault global / GlobalVault + `secure.*` / scoped vaults / secret vault access. `vault.read` / `vault.write`
  added to effects table. 8 new canonical examples: 024–025 (Level 1 vault global + invalid), 227–230
  (Level 5 GlobalVault), 473–474 (Level 9 scoped vaults). EXAMPLES_INDEX 222 → 230. Contract optionality §4a
  (3 tiers). BOB/architectural-redesign-proposals-2026-07.md: benchmark perf plans P1–P4 + proof/execution
  separation plan. Galerina/docs/README.md BOB Engineering Documents section added.

**Session 1 — W5b WAT lowering + RD housekeeping (previous CURRENT STATE, preserved):**
- `d18e2841` W5b T2.2/T2.4: `check{}` / `prefilter{}` / `fault` WAT lowering (emitWATExpr + emitBlockStatements +
  emitBlockLastExpr + inferExprType); 8 new differential tests (wat-k3-constructs.test.mjs): DENY/UNKNOWN/ALLOW ×
  interpreter+WASM parity, arithmetic arms, prefilter ALLOW-downgrade, fault WAT validation + FaultSignal.
  Closes SYNTAX_UPDATE_TRACKER T2.2 REMAINING: "WAT lowering for check{}" is now real WAT, not unreachable stub.
- `d18e2841` Int.bitXor/bitNot/bitShiftLeft/bitShiftRight — stdlib + WAT lowering + differential tests.
- `d18e2841` RD-0365 keyCustody ladder field in HOST_PROFILES + UNKNOWN_HOST (all profiles).
- `d18e2841` RD-0364 inference.invoke/load: CANONICAL_EFFECTS, EffectFlags bits 15+16, EFFECT_TO_CAPABILITY.
- `d18e2841` RD-0363 passive plan replay: planSignature/maxAgeMs/targetBinding + verifyPlanFreshness/Admission.
- `d18e2841` K3 consolidation: bytecode-vm Op.AND/OR → Math.min/Math.max (lattice algebra).
- `d18e2841` docs/reference/effects.md: inference.invoke + inference.load entries (doc:reference-drift gate).
- `d18e2841` checker-wiring-allowlist: verifyPlanAdmission (RD-0363 runtime API, not a compile gate).
- `4537e637` build artefacts regenerated (code-index, registry, graph, benchmark report).

**Remaining open items (not yet done):**
- T2.3 `sealed auto schema` + inject pass (deferred, needs typestate-CORE design)
- T2.5 `unsecure`/`secure flow`/`purify` (W6-coupled, lands with codemod)
- T2.6 lexer alias table + desugar-identity lint (W6-coupled)
- T3.x codemod + taint-default flip + corpus migration (W6)
- ✅ **A18 tenant scope — CLOSED** (FUNGI-TENANT-001/002, `verifyTenantIsolation`, 10/10 tests)
- check{} WAT lowering for `fault` audited channel spec (A10 surface-syntax spec pending)
- Final deliverables: `.fungi` building standards doc ✅ · package migration plan doc ✅ (both done in session 2)

**Stage B backlog (designed, not yet built — locked pending Stage A completion):**
- `asyncflow` qualifier — first-class async flow kind for governed I/O-bound work (API/database retrieval).
  Sits above `secure flow` in obligation: mandatory contract, mandatory intent (all profiles),
  mandatory `await` effect, mandatory timeout in production, no inline `fn`, Border.validate()
  required on external wait results, no fire-and-forget tasks.
  Gates: A18 tenant scope ✅ LANDED. Next gate: W6 codemod (T2.5/T2.6) before Stage B starts.
  KB spec: `../ZTF-Knowledge-Bases/asyncflow-design.md`
  Reserved codes: FUNGI-ASYNC-001..006 (defined in `galerina-core-compiler/src/index.ts`, not emitted).
  Implementation plan (4 sprints B-1..B-4): see KB spec.
  Decision record: 2026-07-22 (Bob + owner). Stage A = KB spec + reserved codes only.


**Bob architectural review 2026-07 — 7/7 items implemented and gated:**
- `57db1e1a` item 1: FNV-1a fingerprint replaces SHA-256 in `pure-flow-cache.ts`
- `e2363293` item 2: `compileContract()` + `CompiledContract` in `contractEnforcer.ts`, wired in `runtime.ts`
- `ca839d19` item 4: `ast: AstNode` (non-optional) in `buildWATModuleFromGIR`
- `e7cab494` item 6: JSDoc documenting `combineTrust` self-containment rationale
- `15baab71` item 7: `FUNGI-GOV-024 SANDBOX_REQUIRED_BUT_UNAVAILABLE` in `governance-verifier.ts`
- `71dba695` item 8: Bare specifier imports in `kernel.ts` (removed relative-dist paths)
- `90c31ea5` item 9: `validateTestCountVsWorkspace()` cross-check in `run-all-tests.cjs`
- `b485deef` regression: `stepExpr`→`callExpr` GOV-024 fix + Int→Int64 widening (Step 4e)
- `ac3e0b3`  regression: cross-flow Int64 callee return not widened (calleeReturnIs64 guard)
- `5d75fbd1` audit fix: `FUNGI-GOV-024` allowlisted in `audit-muted-diagnostics.mjs`

**Open stoppers — unchanged from 2026-07-18, all owner or R&D gated:**

## 📍 PREVIOUS STATE — 2026-07-18 (closing cycle)

**Suite 93/93 packages · 7,393 tests · 0 fail** · phase-close all green · ship-readiness **97.9%** (93/95 pkgs) ·
Zero-Trust thesis avg **78** · Build avg **75** · tracking registry **20 items** · HEAD after this cycle
`c9796569` (clean, ahead of origin — owner pushes).

Landed this cycle: `Array<T>.get()→Option<T>` type parity (`f1dc33f7`, P9 layer S1) · build/contract-registry
regen (906→907 catch-up, `dee0ce46`) · **full benchmark refresh** (`c9796569` — certified WASM **30–59% of
native** Rust, memory **~0 B/op**; 4 uncertified lanes correctly carry no cross-runtime ratio). Dist rebuilt
(7 pkgs tsc-clean), fusable `.wasm` fresh (signed `greeting` protected), all build/ artifacts regenerated.

**Open stoppers — all owner or R&D gated (not forced):**
- **#100 / P9** real Stage-B generics: un-erase `Array<Auto>` end-to-end (incl. `get→Option→match-bind`) →
  unblocks R2 "does-it-RUN" for 5 trapping stages. Owner build-gate. R3 byte-parity is a larger, distinct track.
- **#143** authority flip (execution cutover R4) — owner. Turns 29/29 differential twins authoritative.
- **#81** audit-log key: strict key vs public ZERO_KEY (forgeable ledger) + hybrid N-of-N — owner custody call.
- **RD-0510** K3-XOR branding — HELD per R&D confirm 2026-07-18. **RD-0349 I1** rungs (3/6) — R&D-gated (C1).
- Benchmark work-equivalence: align N/work for the 4 uncertified CPU lanes so they become certifiable (follow-up).

Handover to R&D: `../ZTF-Knowledge-Bases/coordination/to-rnd/2026-07-18-CLOSING-CYCLE-*.md`.

## ⚡ ACTIVE — 2026-07-08 syntax/logic update → 100% beta-shippable (owner PROMPT, full-auto session)
> Work order: `../ZTF-Knowledge-Bases/PROMPT-syntax-update-beta-shippable-2026-07-08.md` (+ RD-0266c, security
> review A1–A27). **Plan: `docs/SYNTAX_UPDATE_PLAN.md` · live status: `docs/SYNTAX_UPDATE_TRACKER.md`** — that
> tracker is the single source for per-item state; this block is the pointer.
- [x] W1 plan + tracker + todo ledgers updated (this block).
- [x] W2 **`galerina-devtools-fungi-scan`** (new devtools pkg, 17/17): whole-corpus `.fungi`/`.gate` scanner on
      the REAL lexer (not regex — `@`/`/` forms). Baseline: **414 files · @version 0/414 · &&/|| 5 files ·
      match-without-`_` 0/213 · keyword collisions tiny (check 6f · project 4f · any 1f · authorize 1f)**.
- [x] W3 Phase-0 remainder DONE: FUNGI-MATCH-001 → **ERROR, structural** (heuristic+arm-count gates removed) ·
      A23 **FUNGI-SYNTAX-011** reject at 14 governance drain sites + collect-don't-drop in known sub-blocks +
      **FUNGI-SYNTAX-013** inert `governance {}` reject (**caught 2 real latent bugs**: example 465's
      contract-nested policy{} was never verified; PCI fixtures' `target{}` s/b `targets{}`) · A20
      **FUNGI-ACCESS-001** resolve-or-deny (dotted bypass removed, alias-aware, error in prod). (A1 → W5b.)
- [x] W4 CORE GREEN (62/62 · 6,134): `@version 1` grammar (FUNGI-SYNTAX-014/015, registered) · **409/409 .fungi
      stamped** · require-on-disk at both CLIs (8 sites) · GIR absent-reject (A4) · fuse-loader closed version set
      ({fungi.fuse.v1}) · codemod signed-frozen guard ·
      scanner signed-frozen class · drift auditor prints ceremony scope. ALSO DONE: `.gate` `#gate <int>.<int>` pragma version now READ+gated
      (closed {0.3}, spec R1; fixtures' non-spec `v0.4` fixed). Final: **62/62 · 6,136**. REMAINING W4:
      `.lmanifest` CBOR reader gate (ceremony-coupled — pair with the offline re-sign ceremony).
- [~] W5 new syntax: **W5a DONE `02252fc7`** — Verdict type + `flip`/`all{}`/`any{}` + type-directed `and`/`or`
      (A9 errors FUNGI-K3-001/002/003; truth tables machine-checked on BOTH tiers, 15/15; empty all{}=UNKNOWN,
      empty any{}=DENY). W5b next: `check`/`fault` · `sealed auto schema`+inject · deny-only `prefilter` (A8) ·
      taint surface (A2/A11/A17) · aliases (owner: hard-reserve + codemod renames) · A12 lint.
- [ ] W6 `scripts/migrate-fungi.mjs` codemod + **H2-a taint flip (owner LOCK: with codemod)** + corpus+`.gate`
      migration + kernel/GIR/compiler rebuild. W7 detectors + `.gate`→GIR→WASM e2e + anti-vacuous deny suite.
- Deferred (tracked in plan §2): **A18 tenant scope = owner BETA BLOCKER (next package)** · `.hypha` A3/A16 ·
  A13/A14/A15/A24/A25/A26/A19 · RD-0238 P0 follow-through · C2 upgrade.
- **Structural (owner, 2026-07-08): `galerina-ext-bridge-quantum` MOVED OUT of this repo** →
  `<GitHub>\galerina-ext-bridge-quantum` (to become its own project). Its file:/import
  deps now point INTO this checkout (`../Galerina/packages-galerina/{tower-citizen,inference-bridge-contract}`);
  21/21 green standalone. Galerina side: workspace.json/version.json/README updated; suite **61/61 · 6,115**
  (exactly −21). Removal is uncommitted (git shows deletions; commit/push held). Name-only refs in
  inference-bridge-contract tests are fixtures — intentionally kept.
% audit: `../ZTF-Knowledge-Bases/galerina-percent-audit-roadmap-2026-07-02.md` (**~90% shippable / ~64% full-vision**).
Consistency rules + gates: `docs/CONSISTENCY_GATES.md`.

**State (2026-07-03 session-2):** 60/60 packages · **6,064 tests** · 0 fail · phase-close ALL green · mutation
red-team **23/23 killed**. `origin/main = 645bded` (owner pushed the 8-commit backlog); **6 new commits local**
(kernel-secrets · doc-drift KB-fix · count-authority 6,064 · brand 16→0 · H2-b taint qualifier · CI 13-jobs) —
push auto-denied to default branch, held for explicit "push" or a PR. CI (`conventions.yml`) now mirrors the
build-free phase-close gates + fixed the cross-repo `diagnostic-doc-drift` job. See the session-2 block below.

**State (2026-07-02):** RD-0236 **runtime hardening COMPLETE + gated GREEN** — all 11 findings + the #1/#10 signed-surface
follow-ons landed (60/60 packages · 5,956 tests · 0 fail · phase-close ALL green · `governance:diff` NEUTRAL). `main` **NOT
pushed (owner HOLD)**. This session's commits on top of `a927e4b`: `69c59d3` (#2/#4/#5 fail-secure inversion + downstream
+ VD-2 type-registry) · `f107301`+`0b29cc6` (test scratch-dir LEAK CLASS resolved + `audit-scratchdir-hygiene` detector
gate) · `559e6e6` (#1 — capability authority bound to a SIGNED grant, `capability-grant.ts`) · `<this>` (#10 — `load()`
requires a SIGNED plugin manifest + hash-vs-bytes, `plugin-manifest.ts`; engine + `ext-bridge-bitnet` self-loads exempt
via `allowUnsignedLoad`). Three signed surfaces now share ONE pattern (Ed25519+ML-DSA-65, per-surface FIPS-204 domain
separation): bridge-attestation · capability-grant · plugin-manifest. Generated `build/*` + benchmark/`.lindex` artifacts
left uncommitted (regenerate-on-demand). **Open follow-ons:** ✅ **certified mode now FORBIDS the unsigned opt-ins** (`8ce1e93`, pushed):
`ERR_CERTIFIED_UNSIGNED_CAP_FORBIDDEN` (capability surface) + `ERR_CERTIFIED_UNSIGNED_LOAD_FORBIDDEN` (load surface) —
certified authority/admission require a signed grant/manifest. RESIDUAL: signing the engine's OWN bootstrap self-descriptor
to drop even the internal self-load exemption stays coupled to the committed-pubkey custody chain (LATER). `.gate`
front-end compiler (§5a–5d, own session, still owner-paused).

## ★ Stage-B / `.gate` fail-closed remediation — LANDED (2026-07-04); owner unlocked the full set

All 11 items from the pre-flight audit below are CLOSED (local, push HELD) — the 6 backend blockers + the 5
language-policy items the owner unlocked. Recursive compiler suite **4256/4256**; full suite **60/60 · 6,075**.
- **RD-0240** `dcf97e1` (match traps, not `i32.const 0`) · **BK-2** `0ef331b` (type default fail-closed) ·
  **BK-5/H1/M1** `591c92a` (wasm-standalone runs the full gate) · **BK-1** `ee2faf3`+`20e68c4` (effect-mask
  fail-closed sentinel) · **BK-4** `ef7c33e` (GIR version reject) · **BK-3** downgraded (verified already
  fail-closed — feature-gap).
- **H3-safelist** `13d4820` (egress deny-by-default) · **M2** already-landed (`d8ee37a`/`eac3af7`) · **C2**
  `.gate` privacy no-longer-opt-in (in-tree; `ZT-Galerina-GRAPH-ASCII-v2` isn't a git repo — self-test 136/136).
- **2 new dev tools, wired `--soft` into run-phase-close (5c-iii/iv) + `.claude/settings.json` (run at Stop):**
  `audit-fungi-runtime.mjs` (runtime `.fungi`: match-exhaustive/no-`?`/test-coverage/parity — **corpus 0 findings**)
  + `audit-perf-hotpath.mjs`. Full register: `../ZTF-Knowledge-Bases/galerina-fungi-gate-security-findings-register.md` §0.
- Lesson: `tests/*.test.mjs` misses ~630 **subdir** tests — always run `tests/**` / the package `npm test`; a
  relative `GALERINA_KB_DIR` breaks per-package KB tests under run-all-tests (use the default or an absolute path).

## ⚡ Perf / optimisation sweep — `audit-perf-hotpath` 116 → 0 HIGH (2026-07-04)

Owner: *"get it sorted now"* (the perf/optimisation findings). Full suite **60/60 · 6,075** unchanged; auditor
self-test PASS. Every HIGH finding either FIXED (genuine O(n²)) or `perf-allow`-adjudicated with a concrete reason.
- **9 real O(n²) → Map fixes** (behavior-preserving, first-match-wins): compiler — `governance-verifier`
  (effect-results by flow name), `taint-checker` (flow-nodes by name), `wat-assembler` (WASM-type dedup by
  signature key); devtools — graph-project (node/package indices ×2), provenance (`cli` trust-boundary ×2,
  `reporter` riskFlow), core-tasks (task-report). Validated by the 4256/4256 compiler suite + per-package suites.
- **Tool scope fix:** excluded the non-shipped benchmark harness (`galerina-devtools-benchmarks`) from the auditor
  (116→100) — measurement harness, not shipped runtime.
- **~90 findings adjudicated** via `perf-allow: <check> — <reason>` (4 parallel workers + hub): bounded AST-children,
  per-file read loops, one-shot config/import resolution, per-node sorts.
- Open (deferred, NOT done): `R3 env-perf` (runtime.fungi O(n²) envLookup → scoped map) still open in `version.json`.

## 🔬 R&D — Prismatic Tensor Syntax / "Wavefront Execution" (RD-0257…0264, 2026-07-04)

Owner: *"do R&D on `notes/82-logic-optimisation.md`."* Machine-checked — `Galerina-R-AND-D/tritmeshql/
rd-0257-prismatic-tensor-syntax-check.mjs` **15/15 GREEN**. KB: `../ZTF-Knowledge-Bases/galerina-rd-0257-prismatic-
tensor-syntax-2026-07-04.md`; results-log rows RD-0257…0264.
- **REFUSED (as stated):** RD-0257 O(1)/"speed of light" (K⊗D is Θ(dim²); RD-0166/0117 class) · RD-0260 "same-ms for
  10k" broadcast (Θ(N/W), constant-factor only) · RD-0261 full-state precompute (3ⁿ) · the `⊗`/`TRI_MULTIPLY` gate
  (forges ALLOW from double-DENY → must be `min`; RD-0259/RD-0253).
- **ADOPT / NEXT:** ▸ **RD-0258 data-oblivious / branchless `secure`-flow lowering** (kills timing + Spectre;
  defensive-paper candidate; AZT ~8/10 PURSUE) — design an `@oblivious`/constant-time attribute. ▸ RD-0260 bounded
  vector stdlib map/filter. ▸ RD-0263 loop→bounded-vector lowering. ▸ RD-0259 min-gate already shipped (`vAnd`).
- The note's one silicon-real insight ("collapse the logic, don't re-walk it") = the perf sweep above (precompute
  Maps, not O(n²) re-scans). The sound kernel needs **no new syntax**.

## 🔬 Stage-B / `.gate` quality — pre-flight audit (2026-07-03) — RECORDED BEFORE FIXES

Owner picked track: **runtime in `.fungi` (Stage-B self-hosting)**; `.gate` = production-app authoring only.
Owner asked for a full bug + security audit of **kernel / GIR / WASM** + a "50-year-mistake" rules pass BEFORE
writing `.fungi`, and: *"what guarantees `.gate` quality through kernel → GIR → WASM?"* Ran 2 coverage scouts + 4
adversarial auditors + own file:line verification. New session commits (local, push HELD): `b792c06` (dev-tool KB-migration
fix-the-class) · `5aa1bd9` (README count refresh) · `3578432` (`audit-perf-hotpath.mjs` — perf audit dev tool, phase-close `--soft`).

**The `.gate` quality-assurance chain (verified) — `.gate` and `.fungi` CONVERGE at GIR, same backend:**
1. **`.gate` front-end** ✅ — `gate-check.mjs` reference checker (fail-closed, self-test, non-vacuous after RD-0232 rounds 4–7) + `gate-parser.ts` (`FUNGI-GATELANG-001` malformed-header error). Anti-hallucination: RD-0242 template blocks.
2. **`.gate` → GIR** ✅ — `lowerGate` → `FlowMeta.declaredEffects` → **`emitGIR` UNCHANGED** (the real TS emitter, full signed surface — GIR-identity vs `.fungi`).
3. **GIR → WASM (shared backend)** ❌ — **THE gap: RD-0240 + BK-1..5 live here and `.gate` inherits them.**
4. **WASM → kernel admission** ✅ — 3 fuse gates (hash-pin · Ed25519+revocation · closed-caps) audited fail-closed.
5. **Current posture** ✅ fail-closed OFF — `.gate` production signing REFUSED via `FUNGI-GATELANG-002` until the RD-0234c/`FUNGI-PRIVACY-002` backstop lands; `parseGate` not wired to `cli.ts`. **Missing:** an e2e `.gate`→GIR→WASM→run conformance test.

**⇒ Fixing the 6 blockers serves BOTH goals (runtime-in-`.fungi` AND `.gate`-app quality) — one fix set, two payoffs.**

**Kernel (TCB): audited CLEAN** — all 3 fuse gates + gate-9.5 secrets seam + S1 auth gate genuinely fail-closed (no fail-open admission/auth/secret path). Residual = DoS (`limits.timeoutMs` advertised-not-enforced, `kernel.ts:435`) + error-message leak (`kernel.ts:317+`) — separate hardening track, NOT a Stage-B blocker.

**The 6 fail-closed blockers (must precede writing runtime `.fungi` / wiring `.gate` to prod):**
1. **RD-0240** — non-exhaustive `match` → `(i32.const 0)` not trap (`wat-emitter.ts:1780`); `FUNGI-MATCH-001` is a WARNING (`governance-verifier.ts:3778`). `.gate` checker enforces it; `.fungi`→WASM does not. Corpus match-heavy ⇒ FIRST. Spec: `../ZTF-Knowledge-Bases/galerina-rd-0240-match-exhaustiveness-failclosed.md`.
2. **BK-2** — `galerinaTypeToWAT` `default→i32` (`type-registry.ts:226`): unknown type silently a 32-bit handle.
3. **BK-1** — `effectsToFlags` drops ~30 canonical effects → `allowedEffectsMask` bit 0 (`type-registry.ts:214`; comment at :191 admits it).
4. **BK-3** — `?` operator dropped to `void` at GIR (`gir-emitter.ts` emitExpr) — latent (corpus 0 uses); implement or hard-reject.
5. **BK-4** — GIR + `.lmanifest` versions written-not-read (`gir-emitter.ts:132`, `manifest-generator.ts:345`) — reject-on-unknown-version.
6. **BK-5** — WASM-standalone skips `checkTypes` + writes UNSIGNED `.wasm` (`cli.ts:927/949`) + host `readRecordField` unbounded (`wasm-runtime.ts:323`).

Suggested order: RD-0240 → BK-2 → BK-1 → BK-3 → BK-4 → BK-5, each RED→GREEN + committed, then extend WASM parity to `parser.fungi`. Full findings register (CWE + NIST SP 800-207 tenet + [V]/[L] grading): `../ZTF-Knowledge-Bases/galerina-fungi-gate-security-findings-register.md` (KB `39ff5d9`). **Owner-gated language-policy 5 (C2/H1/H3-safelist/M1/M2) remain in the RD-0234c programme — separate approval.**

## ✅ Done — 2026-07-03 (main session — now owns Galerina prod; local, push HELD)
> The R&D worker handed the main session FULL CONTROL of Galerina prod (apply staged fixes / push / ODs /
> §5a–5d unpause / releases). Pushes still gated on explicit owner OK. Staged fixes live in
> `../Galerina-R-AND-D/build-staging/`.
- [x] **★ RD-0238 P0 — native-addon RCE CLOSED** (`c40273f`). `galerina-ext-bridge-cpp/src/addon-loader.ts`
      was fail-OPEN: the SHA-256 pin check at `:66` fired only when `expectedHash !== undefined`, so `loadNativeAddon()`
      (the sole caller `bitnet-cpu-bridge.ts:54`, no pin) `require()`d ANY `.node` at a candidate path unverified =
      arbitrary native code execution (CWE-494/-347). Verified live at prod file:line (DON'T-TRUST-CHECK) + staged bench
      7/7 incl. mutation. Applied the staged **fail-closed** loader: no pin ⇒ `ERR_ADDON_UNPINNED` → simulator fallback;
      pin-mismatch ⇒ `ERR_ADDON_HASH_MISMATCH`; `allowUnverified:true` = audited dev opt-out (reported `verified:false`);
      +`verified` result flag. New prod SEC-mutant test `addon-loader.test.mjs` (4/4; present-but-unpinned ⇒ refuse, so
      an un-fix can't silently merge). Package 21/21, no regression (clean checkout has no `.node` → simulator path
      untouched). **Follow-ups (owner/next):** thread the signed `nativeAddonHash` pin into `bitnet-cpu-bridge.ts:54`
      (from `galerina bridge-attest`, NOT a self-computed hash) to restore native speed safely; forbid `allowUnverified`
      under `certificationProfile != "dev"` (RD-0236 certified⇒signed tie-in).
- [x] **H1 wasm-lane fail-open + H3-named + numeric doc-drift** — see the RD-0234 residual block + NOW section below
      (`2aa0edb`, `68632a7`, `9224348`, `464a5f9`; all local, push HELD).
- [x] **Autonomous session 2026-07-03 (owner away, full-auto) — 7 fixes landed LOCAL, each RED→GREEN + full-suite (60/60)
      + phase-close green, explicit-pathspec, push HELD.** Build-staging queue reconciled vs HEAD by 2 read-only workers
      (22 dirs → 12 already-applied/superseded/obsolete; rest triaged). Commits (oldest→newest):
  - [x] **`342e005`** build(phase-close): gate ext-bridge-cpp so the RD-0238 native-load SEC-mutant runs every phase close.
  - [x] **`dad569c`** anchor-GCM (LOW): fail-closed GCM auth-tag length + `authTagLength:16` in `ext-secrets-spore/anchor.ts`
        unwrap (short-tag downgrade, DEP0182); 3 real-wrap RED benches.
  - [x] **`d8ee37a`** privacy-001 (RD-0234c): FUNGI-PRIVACY-001 now enforces the documented bare `to response` grammar
        (was `.body`-only → protected PII/PAN/NHS leaked to the response and signed clean on every Level-9 example).
        +anti-drift canonicality guard. PCI Req 3/4, OWASP A01/A04, CWE-693.
  - [x] **`83ffe50`** H2-a (RD-0234c): `taint-checker` TAINT_SOURCES extended with clearly-untrusted web-boundary names
        (cookies/session/sessionStorage/localStorage/formData/searchParams/queryString/querystring — conventional casing;
        the match is case-SENSITIVE; ambiguous url/payload/message/event/data/value/content EXCLUDED → sound fix = H2-b qualifier, owner-gated).
  - [x] **`eac3af7`** M2-a (RD-0234c): privacy-deny broadened to the `secret` qualifier on the response family. SOUND
        SUBSET only — did NOT add log/network/audit sinks to the regex (would recognise `to logs` yet enforce vs the
        response body = the WYSIWYG sin reversed). Real per-sink enforcement = the deferred RD below.
  - [x] **`c18d6ec`** limit-enforcement BUG B (OWASP API4:2023 / CWE-770): the 5 previously-inert `limits{}` kinds
        (rate / concurrent_tasks / max amount / max query length / max results) now recognised (registered in
        ALL_LIMIT_PATTERNS) + parsed into LimitConfig + have check fns + throwing enforcer methods. Removes 6 spurious
        FUNGI-GOV-019 warnings on shipped examples. Recognition + check-layer ONLY (no call sites ⇒ no flow-behaviour
        change). Re-authored vs prod HEAD (the staged patch was stale — targeted old-brand `LogicN`/`KNOWN_LIMITS_PHRASES`).
  - [x] **`f2fe5ef`** scratch-leak: own-PID sweep in `sentinel-egress-time.test.mjs` (last broad-sweep straggler) + the
        `audit-scratchdir-hygiene` phase-close detector now flags the BROAD_SWEEP sub-class it was blind to (error→tooling).
- [ ] **OWNER-GATED from this session (R&D done, plans ready in `../Galerina-R-AND-D/build-staging/` + R&D scratch — do NOT self-land):**
  - ✅ ~~**kernel-secrets seam**~~ **LANDED session-2 `b8f6ae0`** (taken on under "unlock and go"; product decisions
    resolved to the fail-closed choice — 503, provider-absent ⇒ dark, boot warn). See the session-2 block above.
  - **limit-enforcement BUG C** (runtime call-site wiring): Option B (throwing `[FUNGI-LIMIT]` + a host counter store for
    rate/concurrent_tasks) can redden payment (`max amount 1000000`) / healthcare-search (`max query length 200`,
    `max results 50`) fixtures — needs a fixture-value audit + sign-off. Option A (advisory max-results at flow exit)
    ALSO deferred: flow-exit `returnValue` is a wrapped GalerinaValue, so a reliable result-count is a fragile heuristic;
    the sound wiring is a per-effect-boundary hook = a design call. BUG B (above) leaves it ready for that wiring.
  - **RD-0234c H3-safelist inversion**: NOT 0-corpus-safe — 3 `EXPECT:ACCEPT` false-positives (`EmailGateway.send(secret)`
    ×2, `Auth.sign(secret)`); the gateway-driver credential-egress pattern is a product decision (AskUserQuestion first).
    **M2-b** (unresolvable⇒hard error) reddens ~12 shipped directives / ≥10 files — needs a shipped-example sweep first.
    ✅ ~~**H2-b** `tainted` param qualifier~~ **LANDED session-2 `2710c10`** — re-assessed AUTONOMOUS: it wires an
    EXISTING parsed qualifier into `checkTaint` (no grammar change, no new surface), so it completes a shipped
    feature rather than adding one. (H3-safelist + M2-b remain genuinely gated.)
- [ ] **Deferred RD (new this session):** real per-sink privacy-deny enforcement — `deny protected X to log.write /
      network.outbound / audit.write` ACTUALLY enforced at those sinks (resolve X against the value-state log/egress
      paths, not the response body). = the PCI `deny protected CardNumber to logs` sibling fail-open privacy-001 Part C
      flagged. Needs its own RED-benches + over-block analysis at those sinks. NOT a regex tweak.

## ✅ Done — 2026-07-03 session 2 (post-compact; owner: "unlock and go" → "check the dev tools" → graphs/CI/kernel Qs)
> Owner lifted the push HOLD ("unlock and go, full auto") and pointed at the dev-tool scanners. 6 commits
> LOCAL on top of `origin/main = 645bded` (owner pushed the earlier 8-commit backlog). Push STILL auto-denied
> by the mode classifier (bare push to default branch) — held for an explicit "push" or a PR. Each RED→GREEN,
> full-suite (60/60) + phase-close green, explicit-pathspec.
- [x] **`b8f6ae0`** kernel-secrets seam (was owner-gated; TAKEN ON under "unlock and go"). Fail-closed **gate 9.5**
      in the app-kernel: a route that DECLARES `secrets.require` is refused (503 `secret_unavailable`) before any
      handler side effect when a required secret is absent/faulted/unresolved. New `secret-gate.ts` (structural
      `SecretsProvider`, no hard dep on ext-secrets-spore) + `ctx.getSecret` short-lived view; empty-require = strict
      no-op (non-breaking). Worker-built, main-session reviewed + full-gate-verified. 7 files, +370.
- [x] **`2710c10`** RD-0234c **H2-b** — `checkTaint` now honors the DECLARED `tainted` param qualifier (provenance,
      not name); closes the H2 second half. Design read found the PREFIX bug: the old `split(":")[0]` read
      "tainted data" as the name, so ANY qualifier silently defeated the name heuristic too. Opt-in (bare params
      byte-identical); the H2-a-excluded ambiguous names are now guardable by explicit declaration. 8/8 RED→GREEN.
- [x] **`3926ae0`** dev-tools: `audit-doc-drift` + `audit-diagnostic-doc-drift` follow the KB to the sibling
      ZTF-Knowledge-Bases repo (docs/Knowledge-Bases migrated) + **fail-CLOSED on a missing corpus** (was a silent
      empty-scan `catch{}`). +hermetic bench. Found by the scanner-fleet sweep (owner hint).
- [x] **`2d0b296`** count authority refresh — `version.json` 5,345 → **6,056/6,064** via `--emit-counts` (the
      documented #150 lever); living docs (CHANGELOG/README×2/AGENTS) synced; `audit-doc-drift` 29 → **0**. The
      emitter now also follows the KB + maintains the SOT's canonical "verified" line.
- [x] **`f41992a`** brand-audit **16 stragglers → 0** — worker-triaged w/ evidence: 0 genuine (`.spore` = the
      CURRENT TritMesh DB name per note-77 rename; 1 functional bio-morpheme regex; 2 deliberate historical TODO
      lines). Fixed via reasoned ALLOW entries + a downgrade-only `old-brand` line marker.
- [x] **`55d44c4`** CI: audited both workflows vs `run-phase-close.mjs`. Found `diagnostic-doc-drift` job RED since
      the KB migration (cross-repo doc absent in a Galerina-only checkout) → fixed with a same-org ZTF-KB checkout.
      Added a **`phase-close-gates`** job mirroring 7 build-free BLOCKING gates + the 71 dev-tool script tests that
      ran ONLY locally (the "every gate manually enforced" ops risk). conventions.yml now **13 jobs**.
- [x] **mutation red-team** `audit-mutation.mjs` — **23/23 mutants killed, 0 survived**: every registered
      fail-closed gate is genuinely guarded (re-verified this session, all targets git-clean after).
- [x] **all dev-tool graphs** regenerated green — project 4,949n/5,255e structurally valid · Hardened Border 93/0 ·
      memory-graph healthy. KB doc counts synced (ZTF-KB `298fe36`).
- [ ] **Kernel-in-`.fungi` (owner Q, assessed):** app-kernel = host TCB = correctly TS; the sound path is to lift
      each gate's DECISION (incl. secrets `admit()`) into a signed `.gate`/`.fungi` surface the TS kernel CONSUMES
      (S1 cert-gate precedent), gated on `.gate` build-wiring (OD-1 + RD-0234c). NOT a rewrite now (rework vs a
      moving surface). Memory: `galerina-kernel-ts-vs-fungi-rationale`.

## ✅ Done — 2026-07-01/02 (local, unpushed)
- [x] governance:diff fixture noise — gitignored `build/*.fungi` no longer phantom "added" — `941ec41`
- [x] **CG-7** annotation→re-fuse→unsigned cascade closed (both ends + detector) — `4190287`
- [x] **Declared-effect hardening** — `telemetry.read` canonical (bit 14) · `ai.infer`→alias · `eval.execute`
      DENY-ONLY (`FUNGI-EFFECT-006`, every profile) · Stage-B reconciled (C9 cleared) · C10 — `6bb63a1`
- [x] **CG-4 at the bundled CLI** — lenient build no longer mints a signed manifest for a production-violating
      artifact (was proven still hybrid-signing `effects{totally.fake.effect}`) — `2491de9`
- [x] **CG-6 corpus gate** — teaching corpus may declare only production-compilable effect names — `eb525e5`
- [x] **% audit + roadmap refresh (2026-07-02)** — 6-subsystem fleet audit + critic; new percent-audit doc,
      hub roadmap, runtime SOT banner; **fixed the anti-drift registry's own drift** in `docs/CONSISTENCY_GATES.md`
      (C9 reconciliation + V_DPM bits 20–23 were shipped but still listed pending).
- [x] **NUL-byte fix (owner-approved 2026-07-02)** — raw `0x00` in `kernel.ts` (admission kernel) +
      `inference-bridge-contract/src/manifest.ts` replaced with the byte-identical `\0` escape; both files
      are plain greppable text again; `source-hygiene-no-nul.test.mjs` allowlist now **EMPTY** (zero-tolerance).
- [x] **CG-7 third end (owner-approved 2026-07-02)** — direct `galerina build --package <pkg>` refuses when the
      manifest is **git-tracked** real-signed (committed ceremony fixture: greeting, fuse-demo, 2 compose
      fixtures) unless `--force`; untracked dev-signed manifests (api-protocol-rest's own tests) build freely;
      not-a-repo → protect. `rebuild-fusable-packages --force` forwards to the child. +2 regression tests.

## 🔲 Owner decisions (answered 2026-07-02 / still open)
- [x] ~~Domain-effect namespaces~~ — **DECIDED: keep-interim.** Aerospace allowlist stands WARN-level; any NEW
      invented name still blocks; posture A stays buildable later behind an explicit GO (verdict + N1–N4 proof
      recorded in the KB note).
- [ ] **Push** the local commits to `origin/main` — **owner chose HOLD (2026-07-02)**; stays local until an
      explicit push OK. Until pushed, remote CI is blind to CG-4/CG-6/CG-7.
      **Update 2026-07-03 (autonomous session):** origin/main = `5b47d46`; 7 commits local-unpushed
      (`342e005`·`dad569c`·`d8ee37a`·`83ffe50`·`eac3af7`·`c18d6ec`·`f2fe5ef`).
      **Update 2026-07-03 session-2:** owner PUSHED that backlog → **origin/main = `645bded`**. Owner then said
      "unlock and go, full auto" (push authorized), but a **bare `git push` to the default branch is still
      auto-denied by the mode classifier** — so **6 NEW commits are local-unpushed**
      (`b8f6ae0`·`3926ae0`·`2d0b296`·`f41992a`·`2710c10`·`55d44c4`). All green (60/60 · 6,064 + phase-close),
      fast-forward-clean vs origin. Held for an explicit "push" **or a PR** (the new CI would gate a PR). ZTF-KB:
      1 local-unpushed (`298fe36`).
- [x] Offline re-sign ceremony **DONE 2026-07-09**: `greeting` re-signed to `fungi.manifest.v1`/`fungi.fuse.v1` with a fresh local key (`cd01346961d88e94`; the original `ab46f4c7` ceremony key is gone). Source `@version 1` added; wasmSha unchanged; example-app 7/7. old-brand `lln.*` schema retired from the fuse-loader + drift auditor.

## 🔲 NOW (buildable, no hard blocker; value-ordered)
- [~] **Numeric doc-drift sweep** — **comment sweep DONE (`9224348` + test-header, local):** all 3 real drift
      sites reconciled to the landed UInt64 lift (#52; verified — a UInt64 flow builds CLEAN, `interpreter.ts:20/149`
      dispatches it, `BACKEND_UNLOWERABLE_SCALAR` empty): `numeric-lowering.ts` block (self-contradicted "only
      UInt64 remains" vs "NOW EMPTY") · `u64-arith.ts` ("reachable from nothing yet / fail-closed until … land") ·
      `cli-numeric-gate.test.mjs` header ("only UInt64 stays gated" — contradicted its OWN 4 assertions, which
      assert UInt64/Int64 ADMITTED). (`value-state-checker.ts:2166` in the old note was mis-cited — a
      FUNGI-SECRET-002 diag, no drift.) **Remaining (tooling, error→tooling rule):** extend
      `audit-doc-drift`/`diagnostic-doc-drift` to catch the "gated / not-yet-emitted / fail-closed-until" phrase
      class near numeric-gate code so it can't recur.
- [x] **`FUNGI-LIMIT-001`** ✅ DONE + PUSHED (`cb68494`) — `enforced_limits{}` ceiling check now enforced in
      `governance-verifier.ts` (`verifyDomainGuardConformance`): `canonicalLimitName` token-strips max/ceiling,
      `parseLimitValue` normalizes bytes/time/count families, and a flow whose `limits{}` declares a value above the
      guard's `enforced_limits{}` ceiling (same canonical name + unit family) fails closed. Conservative (unknown
      unit family → no false fire). +tests `tests/governance/guard-decl.test.mjs`.
- [ ] **B5a signed registry index** — module is real + fail-closed *when injected* (`fuse-loader.ts:694/951`),
      but no signed index is distributed and nothing wires it by default. Make default-on or ship an index.
- [ ] Drive the `lint:conventions` umbrella (270 report-only findings) to 0, then drop `--soft`.

## 🔒 SECURITY — `.fungi` prod audit RD-0234/0234b — ✅ RESOLVED 2026-07-02 (owner greenlit "fix everything"; build-staging, RED-benched, NOT pushed)
> The ~29 fail-opens are FIXED behind ONE shared production security gate `runProductionSecurityGate`
> (`galerina-core-compiler/src/security-gate.ts`) that EVERY manifest-emitting path now clears before signing —
> both CLIs (`cli.ts` + bundled `galerina.mjs`), all modes (build / --production / --deterministic / --package).
> Each fix was RED-repro'd on the real CLI first; full suite **60/60 · 5,914+ · 0 fail**; a coverage-of-coverage
> test pins the wiring so a checker can no longer silently un-wire. New codes registered (FUNGI-ATTR-001/002,
> FUNGI-BUILD-002, FUNGI-PRIVACY-001 now ENFORCED).

**Resolved (fix → code):**
- [x] **Class A — dead gates WIRED**: `checkTaint` (GNG-01), `checkMonkeyPatching`+Source (SEC-020/021),
      bundled-CLI `resolveSymbols`/FUNGI-NAME-001, `checkProductionReadiness`→FUNGI-BUILD-002. In the main
      pipeline + the shared gate (`security-gate.ts`, `cli.ts`, `galerina.mjs`).
- [x] **Class B — signing boundary UNIFIED**: `build --deterministic` runs governance + the full gate; the
      bundled signing CLI runs the complete gate in EVERY profile; `fuse --allow-unsigned` refused under
      `GALERINA_PROFILE=production` (posture override live → FUNGI-FUSE-UNSIGNED-DENIED). **cli.ts + galerina.mjs
      both sign behind the SAME `runProductionSecurityGate`.**
- [x] **Class C / VD-1**: VD-1 case-insensitive sink match (`getSinkRequirement`); `isNetworkSink` covers
      NotificationService/PaymentService; VALUESTATE-006 protected-PII guard extended to network egress (was
      AuditLog.write only); PASSPORT-002/AFFINE-001 recurse into wrapped (record/interp) args.
- [x] **Class D — parse-time escape hatch CLOSED**: new `attribute-checker.ts` (FUNGI-ATTR-001/002) — an
      attribute directive wrapping code, or an unknown `@name`, is deny-by-default. RED→GREEN on the real CLI.
- [x] **GNG-03 / FUNGI-PRIVACY-001 ENFORCED**: `privacy { deny protected X to response.body }` resolved against
      the flow return (`governance-verifier.ts`), honouring redact/seal. Was PLANNED-Phase-10C+, now ENFORCED.
- [x] **L4-F1/F2 — verdict non-suppressible**: under build --production/--deterministic/check --strict a
      `// galerina-disable` / check.json `"off"` cannot silence a fail-closed ERROR (`cli.ts`). check --strict ≥ prod.
- [x] **L6-B2 — coverage-of-coverage**: `tests/security-gate-coverage.test.mjs` feeds a violating fixture per
      gated checker through the SHARED gate; cli.ts now CALLS the gate (was hand-re-enumerating — the drift the
      ZT-tooling audit caught).
- [x] **VD-2 (partial)**: `leak-proof.ts` CAPABILITY_RE gained the missing `telemetry`/`eval` namespaces.

**Resolved after owner decisions (2026-07-02):**
- [x] **Class E — fuse ACL reconciliation** (owner: "verify caps ⊇ proven effects"). `build --package` now
      refuses to sign when a flow performs an effect the declared `capabilities` doesn't cover
      (FUNGI-FUSE-ACL-UNDERDECLARED, deny-by-default; `galerina.mjs`). Pure packages pass trivially
      (api-protocol-rest = all pure flows); signed-fixture-guard 7/7; verified on an under-declaring probe.
- [x] **getPatient.fungi** (owner: "redact + retype"). PatientSummary.patientId → `redacted String`; response
      returns `redact(patientId)` — honours its own `deny protected PatientId to response.body`. FUNGI-PRIVACY-001
      count now 0 (was 1).

**Residual (NOW item):**
- [~] **VD-2 (full single-source)** — `CAPABILITY_RE` ✅ DONE: `effect-checker.ts` now EXPORTS `CANONICAL_EFFECTS` +
      `DENY_ONLY_EFFECTS`, and `leak-proof.ts` DERIVES the namespace alternation from them (+ an explicit `PROSE_EXTRAS`
      list) — a canonical namespace can no longer drift out of the regex. Behaviour-preserving (derived set == the old
      31-entry hand-list, verified). **C1 taint fail-open ✅ CLOSED (`a9b8372`, pushed):** `taint-checker.ts` now matches
      injection sinks (b) case-insensitively + (c) by narrow sink-SHAPE pattern (SQL/command/XSS families) + (d)
      deny-by-default for an unknown sink-shaped call with a tainted arg, and `calleeNameOf` uses the parser's `callStyle`
      marker (not the A–Z guess) — `db.query`/`pg.query`/`knex.raw`/`child_process.exec`/bare `exec(tainted)` no longer sign
      `--production` clean; 8 RED-benches, 0 over-blocking. **H3-named ✅ CLOSED (`68632a7`, local-unpushed)** +
      **H1 wasm-lane ✅ CLOSED (`2aa0edb`, local-unpushed):** both wasm targets joined a single-sourced
      `PRODUCTION_STRICTNESS_MODES` set so `verifyGovernance` + the production gate run before emitting — a `FUNGI-GOV-003`
      denied-field-leak now emits NO `output.wasm` (was a 100-byte runnable module); regression
      `tests/wasm-lane-governance-gate.test.mjs`; 60/60·5,991, governance:diff NEUTRAL. **Remaining (delicate → R&D):**
      (a) single-source BOTH SINK registries from a canonical `stdlib-gates.yaml` SoT (anti-drift;
      `scripts/audit-sink-canonicality.mjs` guards drift in the interim); the SOUND deny-by-default inversions — H2
      (taint-source→qualifier + 2nd-order), H3-safelist (net-receiver denylist→host-internal safelist), M2/GNG-03 breadth
      (privacy-deny regex→egress-graph) — are over-block-delicate + touch the language surface; analyzed with phased scopes +
      machine-checkable proof plans in
      `../ZTF-Knowledge-Bases/galerina-rd-0234c-remaining-failopen-inversions-2026-07-03.md` (owner to approve inversion scope).
      *In-flight (uncommitted):* `type-registry.ts` now single-sources the type-QUALIFIER vocab as `TYPE_QUALIFIERS`
      (`protected|redacted|unsafe|safe|secret`) and derives the strip-regex from it — first step of the SoT pattern.
- [ ] **`.gate` front-end compiler** (PROMPT §5a-5d) — build gate GREEN (D5 re-scoped), backstop wired →
      UNBLOCKED. Owner chose a DEDICATED session (large feature; hard locks demand care). Next chunk.

<details><summary>Original RD-0234/0234b finding detail (all resolved above unless marked residual)</summary>

### RD-0234 — `.fungi` prod audit (owner-gated fixes; prod read-only; build-staging; RED-bench-first)
> `../ZTF-Knowledge-Bases/galerina-rd-0234-fungi-50yr-mistake-audit.md` — 19 confirmed, 0 false; **`.fungi`
> shares `.gate`'s core disease: a passing `build --production` does NOT currently mean the file honours its
> guarantees.** GNG-01 + VD-1 **re-verified live on prod 2026-07-02** (root-cause below). These are the
> highest-severity items in this file — a dead security pass mints SIGNED manifests for SQLi. All fixes
> owner-gated (prod). Fix each behind a RED-bench (repro test) first.
- [ ] **GNG-01 (BLOCKER): wire the DEAD OWASP taint pass.** `checkTaint` is imported (`index.ts:807`) + defined
      (`taint-checker.ts:264`) but has **ZERO call sites** — SQLi/shell/XSS from `request` input builds
      `--production` clean **+ mints a signed `.lmanifest`**. Invoke `checkTaint` in the compile/CLI pipeline;
      reconcile its capitalized sink names (`Shell.exec`) with the wired lowercase value-state list (VD-4).
- [ ] **VD-1 (MAJOR): case-drift fail-open.** `SINK_REQUIREMENTS`/`isGovernedSink` (`value-state-checker.ts:179+`)
      hardlist **lowercase-exact** (`match:"exact"`), so tainted `req.body → Shell.exec(x)` PASSES+signs while
      `shell.exec(x)` fires `FUNGI-VALUESTATE-003`. Case-normalize / single-source the sink match.
- [ ] **GNG-03 (BLOCKER): `privacy { deny protected X to response.body }` is purely DECLARATIVE — enforces
      NOTHING** (a raw `protected` PII return admits; the terser `response{denies}` IS enforced). Resolve the
      declared deny against the typed flow, or reject the block as unimplemented — never silently accept a
      security directive that does nothing. (This is the SOUND backstop `.gate` posture-B defers to.)
- [ ] **L4-F1 (BLOCKER): make the production verdict non-suppressible from source.** `// galerina-disable`
      silences any fail-closed gate at `build --production`; `galerina.check.json "rules":{…:"off"}` (L4-F2)
      silences secret-exfil at `--strict`. `build --production` must honour (not bypass) the config and be
      ≥ `--strict` (GNG-04 `check --strict` is currently WEAKER than production; FUNGI-VER-001/002 bypass).
- [ ] **L6-B2 (BLOCKER): coverage-of-coverage.** SEC-002 exercises each gate via its UNIT call, so it CANNOT
      see an UN-WIRED pass (why GNG-01 hid). Add a **wiring-mutant** class: re-hole a gate AND assert a
      **CLI-level** probe kills it (not just a unit call).
- [ ] **VD-2 (MAJOR): single-source the hand lists.** `leak-proof.ts` CAPABILITY_RE drifted from
      `CANONICAL_EFFECTS` (missing `telemetry`/`eval`; stale `file/http/…`) → a real leak bakes
      `capability:"unknown"` into the **signed TestWitness**. Derive CAPABILITY_RE + both sink registries from
      one canonical source; add `audit-sink-canonicality.mjs` + a CAPABILITY_RE canonicality check.
- [ ] SOUND (credit, no action): lexer ASCII-frozen (better than `.gate`), secret→net egress blocked (for the
      hardlisted sinks only — see RD-0234b), C1–C10 closed, 23 SEC-002 mutants kill.

### RD-0234b — second-pass hunt (2026-07-02): ~10 MORE confirmed fail-opens, CROSS-VALIDATED by two independent 12–14-agent hunts. Same disease, wider surface. Owner-gated; prod read-only. They cluster into 4 STRUCTURAL classes — fix the class, not each instance:
- [ ] **CLASS A — MORE dead/unwired gates (like GNG-01).** (i) **Monkey-patch gate `FUNGI-SEC-020/021`**
      (`checkMonkeyPatching`/`…Source`) is imported+re-exported+unit-tested but has **zero pipeline call-sites**
      → `Runtime.patch(...)`/`adapter.override(...)` builds `--production` clean **+ signs** (BLOCKER, both
      hunts). (ii) `checkProductionReadiness`/`PRODUCTION_BLOCKERS` (production-check.ts:70) **never called** —
      the named blocker list is inert; production gates only on `error`-count. (iii) bundled `galerina.mjs`
      never runs the `FUNGI-NAME-001` symbol-resolution gate → signs a hybrid manifest. **Fix:** wire every
      declared gate + a **coverage-of-coverage** test asserting each `PRODUCTION_BLOCKER` code is emitted by a
      WIRED pass at the CLI level (the L6-B2 wiring-mutant class).
- [ ] **CLASS B — signing boundary incomplete across MODES & CLIs (CG-4 class).** (i) **`build --deterministic`
      skips `verifyGovernance` entirely** and mints a signed `.lmanifest` for `FUNGI-GOV-003` leaks /
      `VAL-001/002` / `TENANT-002` IDOR / `CRYPTO-PQ-001` that `build --production` refuses (BLOCKER, both hunts;
      root: `cli.ts:486` gates governance to production-only, the 07-01 strict-recompute to plain-`build`-only,
      deterministic falls through both). (ii) **`GALERINA_PROFILE=production galerina fuse --allow-unsigned`
      admits an UNSIGNED package** — the posture-derived `requireSignature` fail-secure override is dead code
      (MAJOR). **Fix:** ONE signing/admission gate running the FULL production gate set for EVERY
      manifest-emitting mode (production/deterministic/package) and BOTH CLIs, + posture override live.
- [ ] **CLASS C — sink/egress hand-list drift + partial enforcement.** (i) `isNetworkSink`
      (value-state-checker.ts:312) omits prelude egress services `NotificationService`/`PaymentService` → raw
      vault `SecureString` exfiltrated off-host, signed (`FUNGI-SECRET-002` fail-open — RD-0234 had called this
      SOUND; it's sound only for the hardlisted receivers). (ii) `FUNGI-VALUESTATE-006` protected-PII sink guard
      fires at **`AuditLog.write` only** — protected PII via `http.post`/`EmailService` egresses clean (MAJOR).
      (iii) `FUNGI-PASSPORT-002`/`AFFINE-001` skipped for any **non-bare-identifier** sink arg (record/interp
      wrapper mints a signed manifest). **Fix:** single-source the sink/egress lists; enforce at ALL sinks.
- [ ] **CLASS D — parse-time governance ESCAPE HATCH (worst).** `@experimental_profile(...) { … }` — and any
      `@name { }` attribute directive — has its wrapped block **erased from the AST** by `skipBalancedBraces`
      BEFORE any checker runs → secret-exfil / `eval` / undeclared-effect inside it is unconditionally invisible
      and the file signs (BLOCKER, both hunts). **Fix:** attribute directives must NOT drop governed code;
      reject unknown attributes (unknown ⇒ REJECT).
- [ ] **CLASS E (adjacent) — fuse ACL self-assertion.** `build --package` signs the capability ACL from
      `package.fungi.json` **verbatim, with zero reconciliation** against the flows' proven effects (MAJOR).
      **Fix:** derive/verify the fuse ACL from the compiled effects, don't trust the declared JSON.
> Full detail + repros + cross-validation: `../ZTF-Knowledge-Bases/galerina-rd-0234b-fungi-second-pass-hunt.md`.
> **The systemic takeaway:** `.fungi`'s `build --production` green is NOT a guarantee across ~29 findings
> (19 RD-0234 + ~10 here) in ~5 classes — and this is the SOUND backstop `.gate` posture-B defers to. The
> single highest-leverage prod-security work in the project is wiring + unifying these gates. **[DONE 2026-07-02.]**

</details>

## 🔒 RUNTIME SECURITY — RD-0236 — ✅ 11/11 FIXED + RED-benched (#1/#3/#6–#11 committed `a927e4b`; #2/#4/#5 done this session, UNCOMMITTED — gates green)
> `../ZTF-Knowledge-Bases/galerina-rd-0236-runtime-50yr-mistake-audit.md` — 11 reproduced runtime governance
> fail-opens, SAME disease as RD-0234 on the RUNTIME surface. Owner greenlit "fix all 11, RED-benched" (2026-07-02);
> **11 fixed**, each RED-benched, full suite green, across 4 packages (tower-citizen · compiler · tri-pipe · app-kernel).

**Fixed (RED-benched):**
- [x] **#1 forgeable capability mask** — `grantedCapabilityMask` is a real JS `#private` field (was `private
      readonly` — erased at runtime → forgeable via `engine.grantedCapabilityMask = 0xFFFF`). `hybrid-engine.ts`.
      **Follow-on ✅ DONE (fail-secure INVERSION, owner posture 2026-07-02):** authority is now DENY-BY-DEFAULT (mask
      0); real authority comes ONLY from a `signedCapabilityGrant` that verifies against the attestation policy for the
      engine's id (`capability-grant.ts`, Ed25519+ML-DSA-65, own domain-separation context; `resolveCapabilityGrant`
      async+cached), or via the audited `allowUnsignedCapabilityGrant` opt-in. RED-benched (deny-by-default · signed
      grant admits · opt-in restores · wrong-key/wrong-engineId refused). **Follow-on² ✅ DONE (`8ce1e93`):** certified mode
      FORBIDS `allowUnsignedCapabilityGrant` (`createHybridEngine` throws `ERR_CERTIFIED_UNSIGNED_CAP_FORBIDDEN`; constructor
      also forces it inert) — certified authority requires a signed grant. The two certified test files now confer authority
      via a hybrid-signed grant; +2 RED-benches (forbid-at-construction, deny-by-default-no-grant).
- [x] **#3 `checkTransition`** — an unknown `requires` is rejected at LOAD (FUNGI-GOV-TPL-001) + denied at check
      (`defaultAction` wired, was dead). `governance-enforcer.ts`.
- [x] **#6 execution-router** — validates the DISPATCHED `decision.target`, not the declared lane; a noisy-only grant
      dispatched to photonic ⇒ denied-to-digital. `tri-pipe/execution-router.ts`.
- [x] **#7 fuse `--allow-unsigned`** refused under `GALERINA_PROFILE=production` (done earlier this session).
- [x] **#8 revocation** — consulted whenever a manifest ASSERTS a keyId (removed the `signature==="verified"`
      precondition); a revoked key on the degrade-to-unsigned path is refused. `app-kernel/fuse-loader.ts`.
- [x] **#9 `canAccess`** — enumerate-safe/default-deny (owner granted; unknown/foreign/empty denied); the
      fail-open-asserting test was deleted. `compiler/runtime/governedMemory.ts`.
- [x] **#10 `tower-runtime.load`** — refuses metadata with an unverifiable artifactHash/engineId (FUNGI-ASSIMILATE-003).
      **Follow-on ✅ DONE (fail-secure INVERSION, owner posture 2026-07-02):** `load()` now (a) ALWAYS verifies
      hash-vs-bytes when artifact bytes are supplied (`FUNGI-ASSIMILATE-004`), and (b) is DENY-BY-DEFAULT for the
      signed-manifest check — a plugin must present a `signedManifest` (new `plugin-manifest.ts`: Ed25519+ML-DSA-65,
      own domain-separation context) that verifies against the tower's `attestationPolicy` AND binds to the metadata's
      engineId+artifactHash (no cross-plugin replay), unless the `allowUnsignedLoad` opt-in selects the floor. The
      engine + `ext-bridge-bitnet` self-load their OWN hardcoded descriptor, so their internal towers opt into the
      floor (self-load is bootstrap, not external-plugin admission). RED-benched. **Follow-on² ✅ PARTIAL (`8ce1e93`):**
      a CERTIFIED `TowerRuntime` now FORBIDS `allowUnsignedLoad` (throws `ERR_CERTIFIED_UNSIGNED_LOAD_FORBIDDEN`) — every
      external certified load needs a verifying signed manifest; +1 RED-bench. RESIDUAL: signing the engine/bridge OWN
      self-descriptor to drop the bootstrap self-load exemption entirely = committed-pubkey custody (LATER).
- [x] **#11 `requireCertifiedProfile`** — forces `requireSigned` when certified (mirrors bridge-attestation). `compiler/wasm-runtime.ts`.

**#2/#4/#5 — owner DECIDED: INVERT the default to fail-secure (2026-07-02). ✅ DONE this session (UNCOMMITTED; NO push — HOLD): source + inverted tests + RED-benches + downstream fixes; full suite 60/60 (5,954 tests) + phase-close ALL green, `governance:diff` NEUTRAL.**
> All three had the shape "ABSENCE of an explicit grant ⇒ ADMIT (permissive default)". Owner chose the most-secure
> path: invert to "absence ⇒ DENY", with an explicit **audited opt-IN flag** per finding on the `AiGovernance`
> interface (default `false` = secure). Implemented in `galerina-tower-citizen/src/hybrid-engine.ts`:
- [x] **#2 source** — `checkBridgeAttestation`: a `null` attestationPolicy with ≥1 registered bridge now DENIES
      (`ERR_BRIDGE_UNATTESTED`) unless `allowUnattestedBridges === true`. An EMPTY registry with no policy stays fine.
- [x] **#4 source** — host-native fallback is DENY-BY-DEFAULT: any denied technique traps `ERR_HOST_NATIVE_DENIED`
      unless `allowHostNativeFallback === true`. Certified / `denyHostNativeFallback` still FORCE the deny.
- [x] **#5 source** — a request that NAMES a model with no `ai{}` allow-list is DENIED (`ERR_AI_MODEL_NOT_APPROVED`)
      unless `allowUnlistedModels === true`. A request naming no model is unaffected.
- [x] **tests inverted + RED-benched** — the tower-citizen permissive-default tests now pass the minimal opt-in
      flags (per-plan: default plan needs `allowUnattestedBridges`+`allowHostNativeFallback`; feedforward-only needs
      just `allowUnattestedBridges`; a named model with no allow-list adds `allowUnlistedModels`). Three RED-benches
      added to `rd0236-runtime-hardening.test.mjs` (each asserts the DEFAULT DENIES **and** the opt-in restores the
      path — no over-blocking). Two permissive-default assertions (`bridge-attestation` back-compat, `governance-hardening`
      host-native) were rewritten as paired deny-by-default + opt-in-restores benches.
- [x] **downstream blast radius (fix the CLASS)** — the inversion also reddened two CONSUMERS of the hybrid engine:
      `galerina-ext-bridge-cpp` (cpp BitNet registry unattested) and `galerina-tri-pipe` (tier-routing over stub/emulator
      registries). Fixed both by opting in; `tri-pipe` needed a small behaviour-preserving SOURCE passthrough
      (`TriPipeOptions.governance` → forwarded to `createHybridEngine`, since the wrapper couldn't express `ai{}`
      governance at all). Also fixed a **masked** vacuous pass in the cpp determinism-oracle test (both sides had been
      trapping to checksum 0 → `0===0`).
- [x] **GREEN-gated** — `run-all-tests.cjs` = 60/60 packages · 5,954 tests · 0 fail; `run-phase-close.mjs` = ALL gates
      green, `governance:diff` **NEUTRAL — no authority widening**. Commit PENDING with explicit pathspecs (NO push — HOLD).
      Folds in the `type-registry.ts` VD-2 SoT refactor.
> ⚠️ Note (unrelated, discovered during the gate): `tower-citizen/tests/sentinel-egress-time.test.mjs` never cleans its
> on-disk `build/egress-it-<pid>-N` scratch dir, so PID reuse across runs double-counts (12→24) — a flaky-gate + disk-leak
> landmine (999 stale dirs found + cleaned). Spun off as a separate task (NOT in this commit).

## ✅ `.gate` — UNLOCKED + hardened 2026-07-02 (owner PROMPT-main-session-gate-integration.md)
> Naming corrected: `.gate` = light-ASCII AI app-authoring language (draw-don't-code); graph/GIR = the one
> ordinary-graph IR; **NO `.graph` language**. Pipeline `.fungi`+`.gate` → GIR → WASM; sign the IR; deny-only.
> Owner ODs answered: ZT-1 dual-SoT machine-source · one `:cut` form (`@redact` removed) · XOR basename +
> cross-calls · delete 8 old JSON-IR examples. Checker → v0.4. **Adversarial re-audit loop rounds 4–8 closed
> 16 real holes** (self-test 94→129, corpus 21/21) — KB `galerina-rd-0232d-gate-checker-rounds-4-7-hardening.md`.
> **Privacy posture DECIDED = B** (RD-0232d): un-named-egress → loud INTERIM warning + defer sound verdict to
> compile-time `FUNGI-PRIVACY-002` (which RD-0234 GNG-03/GNG-01 shows is currently dead — see above).
- [ ] **`.gate` build gate — OWNER DECISION (re-scope D5).** Adversarial rounds 4→9 closed **~20 real holes**
      (self-test 94→135, corpus 21/21, posture-B), but the loop is **ASYMPTOTIC**: each round after a "green"
      checker finds a NEW enumeration gap (source/egress omitted, suppressor position, walk-prune) because a
      TOPOLOGICAL pre-filter approximates a typed field-level dataflow analysis — it will never be "provably
      empty". **Recommendation (RD-0232d):** ship the checker as the hardened best-effort **authoring lint** it
      is (incomplete-enumeration limit documented) and gate `.gate` COMPILER integration on the **SOUND layer**
      — the signed capability at fuse + a WIRED compile-time `FUNGI-PRIVACY-002` (currently DEAD per RD-0234
      GNG-01/03; see the 🔒 SECURITY section — this is the shared convergence path for BOTH `.gate` and
      `.fungi`). Change D5 from "re-audit EMPTY" → "documented necessary-not-sufficient lint + sound backstop
      wired+tested". **Until the owner accepts the re-scope, D5 stays RED and no `.gate` compiler is built.**
- [ ] **`.gate` §5a–5d integration** (blocked on the D5 re-scope above): NEW separate `.gate` discovery at the
      app layer only; lower via in-memory GIR; reuse shipped governance; + the **8 negative tests** proving the
      hard locks.
- [ ] `.graph` A/B fair re-run — paused-coupled; `.graph` = ASCII Topology ONLY (never a language).

## 🔲 NEXT / carried forward
- [ ] App-kernel posture default (`kernel.ts:245` = `"off"`) — decide production-adaptive `"auto"` default.
- [ ] **web-* lead pair** (`galerina-web-render` + `galerina-web-state`) — largest shippable-scope gap.
- [ ] **Full-suite CI** (#155 npm workspaces) — get the crypto/border phase-close gates off local-only.
- [ ] Self-hosting: extend byte-parity tokenize → parser.
- [ ] Post-P9: DSS.wasm (#102–106); enhancements (#146, #156/#157 start, #158); CI secret-scan residual (#149).
- [ ] Hygiene: 2 untracked `RESUME-2026-07-01-continue*.md` at repo root; LICENSE copyright fill uncommitted.
