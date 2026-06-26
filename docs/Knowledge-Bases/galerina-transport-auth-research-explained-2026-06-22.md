# Galerina Transport + Auth Research — Explained (2026-06-22)

A readable end-to-end account of the transport/auth research effort: where it came from, how it was done, **what
we will build, what we will not, and why** — in both directions. This is the narrative companion to the two
reference docs (the grounded decision-support [galerina-tlstp-transport-auth-rnd-2026-06-22.md](galerina-tlstp-transport-auth-rnd-2026-06-22.md)
and the absorbed specs [rd-absorbed/rd-tlstp-transport-auth-cluster-2026-06-22.md](rd-absorbed/rd-tlstp-transport-auth-cluster-2026-06-22.md)).

## TL;DR
The owner's two notes (`notes/41-tritmesh`, `notes/42-auth`) describe a bespoke secure transport, **TLSTP** (TriLogic
Secure Transport Protocol), plus a Zero-Trust identity/key model. We ground-checked all of it against the live
codebase, then the R&D worker turned the survivors into buildable specs. **~75–85% of the notes re-derive things
Galerina already ships** (cite, don't rebuild). Of the genuinely new ideas, **9 are adopted** (lead: a K3
cert-validation gate), **~8 are refused** (each because it breaks the crypto-on-core or fail-closed invariant — and
each has a digital replacement), and a handful are **parked as hardware-gated**. **B8 HTTP-transport is now unlocked**
(owner, 2026-06-22), so the adopted set is buildable, starting with the cert-gate. Every refusal traces to one of
two rules, explained below.

## Where it came from
The owner's instinct in `notes/42-auth` was exactly right and became the organizing principle: **separate the
cryptographic math you must not invent from the transport state-machine you may invent.** That is, verbatim,
Galerina's own *crypto-on-core* invariant. So most of the "new protocol" is actually a restatement of shipped Galerina
architecture (content-addressed signed admission, deny-by-default capabilities, the K3 admission gate, the
anti-downgrade TLS floor, hybrid KEM-DEM, the SHAKE256 key ratchet, the vault key-custody split, capsule macaroon
caveats). The value was isolating the genuinely-new ~15–25%.

## How it was researched (the method is the point)
1. **Grounding** — an 18-agent workflow (`wi3py3913`) decomposed the notes into 8 decision clusters, grounded each
   against live source, adversarially verified (crypto-on-core violations, "already-shipped" overclaims), and a
   completeness critic re-read both notes. Output: the decision-support doc + 13 owner decisions.
2. **Specification** — the R&D worker turned survivors into buildable specs: **0065** (TLSTP digital core), **0066**
   (B8 adapter design), **0068** (governing *regular* HTTP/SSL APIs), **0069** (continuous-trust → K3 telemetry),
   **0070** (photonic TamperTrust resolver).
3. **Verification** — **0067** re-audited the boundary + prove-maths foundations (12-agent workflow, every backing
   bench re-run to exit 0), and an independent **rule-compliance audit** (`wd7f3ccri`) checked all worker reports
   against the R&D rules with citations spot-verified live. Verdict: rules genuinely used; the research is sound.

## The two rules that decided everything
- **Crypto-on-core (R1):** every cipher/KDF/signature/key byte runs only on the Binary (digital) tier. Photonics/
  analog (~≤10-bit, non-deterministic) may feed **only** a K3 governance verdict — never a key. *Why:* crypto needs
  bit-exactness; an analog substrate can't produce it, and the governed core must be deterministic to be verifiable.
- **Fail-closed K3, degrade-only (R2):** the verdict trit is `{DENY −1, INDETERMINATE 0, ALLOW +1}`; unknown→DENY;
  any side-signal folds in via `vAnd` (= `min`), which by the **No-Coercion theorem** `e = vAnd(t*, r) ≤ t*` can only
  *degrade* a verdict, never manufacture an ALLOW. This single inequality is what makes the continuous-trust and
  photonic ideas safe-by-construction (0069/0070) and is why a "float gate" or a "parallel holding trit" is refused.

---

## Disposition table — every finding, USE or NO-USE, with the outcome both ways

### ✅ WILL USE (net-new, in-bounds, buildable)
| Finding | Source | Outcome / what it becomes |
|---|---|---|
| **S1 — K3 cert/channel-validation gate** | 0065/0066/0068 (converge) | **BUILD-FIRST.** Standalone governance pass: `cert_verdict = vAnd(pin_match, chain_valid, not_expired, revocation_fresh) ∈ {+1,0,−1}`, **revocation-unknown→DENY**, over a library-validated chain. Reuses `decideAtBoundary`; zero new crypto. Hardens MITM for BOTH TLSTP and vanilla third-party HTTPS. (B8 now unlocked.) |
| **S2 — Asymmetric KEM-rekeying ratchet** | 0065 | Security core. Periodic X25519+ML-KEM-768 rekey → **post-compromise security** atop the shipped symmetric SHAKE256 chain. Rekey secret is the KEM shared secret (Binary). |
| **S3 — Digital FEC under AEAD** | 0065 | Loss recovery w/o retransmission; FEC sits **under** the AEAD (repairs ciphertext, never a key/plaintext); a post-repair bit error still fails the tag closed. Behind a named-machine bench. |
| **S4 — "Recovering" FSM above K3** | 0065 | One added transport state (`Established/Recovering/Closed-Erase`); denies data effects while holding; `→Established` only on a fresh `+1`; timeout→Erase. Pairs with DTM (0069). |
| **S5 — Opt-in `transport.obfuscate` morphing** | 0065 | Metadata-confidentiality; frame sizing off the digital AEAD keystream; a morphed frame **replaces** any cleartext routing tag. Opt-in deny-by-default; behind a bench. Resists size/boundary, not timing/volume. |
| **B8 governed adapter** | 0066 | The host plumbing (wire → raw-byte shim → verifyWasm → fuse-loader → K3 → flow). First-3: bind admission to handshake + S1 · raw-byte shim + idempotency-gated 0-RTT · Recovering FSM + ECH/OHTTP. |
| **Regular-API governance** | 0068 | Over vanilla TLS+X.509: S1 cert-gate + content-addressed pinning + `egress-guard` SSRF/metadata + capability bounds + RFC-5705 channel-binding into the capsule `cnf`. Hardens a normal HTTPS client/server with zero new crypto. |
| **DTM → degrade-only K3 telemetry** | 0069 | The continuous trust score `T_c` lives in the 0050 telemetry exporter, discretizes to `{−1,0}` (never +1) via a declared static threshold, folds via `vAnd` (degrade-only, No-Coercion-proven). A failed AEAD tag is a hard −1, never a "low score." |
| **TamperTrust resolver** | 0070 | Governance side buildable today: deviation `δ=|P_actual−P_base|` → trit → `verifyToleranceUnderNoise` → `vAnd` → `decideAtBoundary`; bound as a `cnf`-row **under** the digital Ed25519+ML-DSA-65 sig (defense-in-depth, never sole). |
| **Boundary/prove-maths fixes** | 0067 | (a) Close the one real fail-open — **34B routeDecl auto-taint** (bare flow params are trusted-by-default today). (b) Promote **0014-C3** overflow-equivalence SAMPLED→**Z3-PROVEN** (the proof already exists; just delegate). (c) Apply the stale-claim corrections in the docs. |

### ❌ WON'T USE (refused — each breaks an invariant; each has a digital replacement)
| Finding | Source | Why refused → what replaces it |
|---|---|---|
| **Ternary Ephemeral Ratchet** (`K_{n+1}=KDF(K_n, E_ternary)`) | 42-auth Doc003 | **Crypto-on-core violation + non-reproducible** (analog ≠ analog across endpoints → divergent keys → dead channel). → **S2** digital KEM ratchet + SHAKE256 chain. |
| **Continuous float `T_c` as the gate** | 42-auth Doc001 | Erases the K3 INDETERMINATE state (indeterminate-as-allow) + non-deterministic. → **0069** float-in-telemetry / trit-in-gate (degrade-only). |
| **Parallel +1/0/−1 "holding" session trit** | 42-auth Doc001 | Charter-forbidden alias of the governance trit (K3 0 = fail-closed-neutral, not "holding"). → **S4** Recovering FSM *above* the single K3 trit. |
| **Ternary symbol repair on ciphertext** ("request only the missing entropy") | 42-auth Doc001 | AEAD fails closed on one bit; re-opens the killed cleartext-semantic leak (`SPORE-PRIVACY-002`). → **S3** digital FEC over *opaque* ciphertext. |
| **Photonic φ/θ/timing as an auth factor / key-binder** ("silicon can't spoof θ") | 42-auth Doc001/003 | ≤10-bit, non-deterministic, and optical PUFs are PAC-learnable (so "unspoofable" is false). → **0070** degrade-only TamperTrust signal under the digital sig. |
| **"Abolish all CAs"** as a crypto primitive | 42-auth Doc004 | It's a deployment stance, not a primitive; Galerina governs *over* a library-validated chain + pinning (no-CA pinned-key admission already ships). |
| **balanced-ternary "semantic clustering"** of `.tmf` via K3 trits | 41-tritmesh | Category error (Kleene governance lattice ≠ continuous vector space). Similarity stays an ANN/vector concern, off the trit, under SealTaint at egress. |
| **Embed a usable E2EE key in the `.tmf`** | 41-tritmesh | Secret-handling violation (key in a widely-replicated metadata plane). → vault custody + a KEM-wrapped key whose unwrap is capability-gated. |

### ⏸ ASPIRATIONAL / HW-gated (parked until substrate exists)
| Finding | Why parked |
|---|---|
| In-sandbox TLS-termination **isolation guarantee** | Rests on DRCM/DSS.wasm — `build/dss-supervisor.wasm` is a real **115-byte placeholder**; the actual DSS is ~31 KB of **uncompiled `.spore`** (12 files). The real runtime is blocked on #102-106 + Stage-B P9.4. The deployment *stance* (main-app-as-WASM, R&D 0052) is decided; the isolation *guarantee* is not. |
| Optical sensing front-end (φ/θ/path-fingerprint measurement) | Needs photonic silicon + a calibration root; emulator is `deterministic=false`, `ENOB_CEILING=8`. Only the governance resolver (0070) is buildable today. |
| Raw-byte ring-buffer shim / cross-trust-boundary zero-copy | WASM Component Model (#102-106). |
| The 0050 blind-observability exporter (DTM rides on it) | Net-new and unbuilt; DTM adds one metric + one discretizer but doesn't advance that build gate. |

---

## What we'll build, in order
1. **S1 K3 cert-validation gate** — highest value, lowest risk, crypto-digital; the converged build-first; works for both TLSTP and vanilla HTTPS.
2. **S4 Recovering FSM + S2 asymmetric ratchet** — the security core (fault-handling + forward/post-compromise secrecy).
3. **0069 DTM degrade-only telemetry** + **#211 listener hardening** — observability-driven degrade + the live-listener safety knobs (now in-scope with B8).
4. **S3 FEC + S5 morphing** — availability / metadata-confidentiality, each behind a named-machine bench.
5. **0067 follow-ups** — 34B routeDecl auto-taint (close the fail-open) + delegate 0014-C3 to the Z3 proof.
6. **0070 TamperTrust resolver** (governance side) — defense-in-depth; optical front-end stays HW-gated.

## Prove-maths + boundary health (0067)
- **Boundary:** 13 of 14 trust-boundary crossings are fail-closed. The **one fail-open** is a *bare flow parameter*
  (no `source_from`/`tainted`) being trusted-by-default → `data.password` at a governed sink emits zero taint
  diagnostics. Fix = **34B routeDecl auto-taint** (34A `tainted` discharge already ships).
- **Maths:** largely PROVEN with honest downgrades — the headline "3M-pair overflow equivalence" (0014-C3) is really
  **SAMPLED**; a few claims are **ASSERTED** (correct in source, no re-runnable artifact). The crypto-on-core +
  No-Coercion lattice are exhaustively/Z3-proven. **Next proof:** delegate 0014-C3 to the existing Z3 proof (`[PROVEN]`
  over 2⁶⁴) — SAMPLED→PROVEN with zero new solver risk.

## Rule-compliance (audit `wd7f3ccri`)
The R&D rules **were genuinely used** — crypto kept Binary, fail-closed with revocation-unknown→DENY, tiers
separated, no perf claims without a bench, and the tempting analog-into-crypto overclaims explicitly refuted; cited
file:lines spot-verified against the live repo. Two citation-*precision* notes (no fail-open, no fabrication): the
0066 "115-byte DSS.wasm" figure was flagged unverifiable but is in fact **correct** (`build/dss-supervisor.wasm` =
115 bytes — the auditor looked only in `src/`); and **0068 mis-attributed `verifyWasm`** to `egress-guard.ts` — it is
in **`wasm-runtime.ts:99`** (claim true, location wrong; corrected here and in the absorbed doc).

## Reference pointers
- Decision-support + 13 owner decisions: `galerina-tlstp-transport-auth-rnd-2026-06-22.md`
- Absorbed worker specs (0065/0066/0068): `rd-absorbed/rd-tlstp-transport-auth-cluster-2026-06-22.md`
- Canonical worker reports: `C:\wwwprojects\Galerina-R-AND-D\_session-bridge\done\{0065,0066,0067,0068,0069,0070}-*.done.md`
- B8 status: UNLOCKED (ledger + roadmap, 2026-06-22). Memory: [[galerina-tlstp-transport-auth-rnd]], [[feedback-http-transport-owner-locked]].
