# TODO

Living task list. Authoritative forward view: `../ZTF-Knowledge-Bases/galerina-roadmap.md`.
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
  - [x] **`dad569c`** anchor-GCM (LOW): fail-closed GCM auth-tag length + `authTagLength:16` in `ext-secrets-tmf/anchor.ts`
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
      `SecretsProvider`, no hard dep on ext-secrets-tmf) + `ctx.getSecret` short-lived view; empty-require = strict
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
- [ ] Offline re-sign ceremony owed: `greeting.lmanifest` (old-brand `lln.manifest.v1` schema).

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
