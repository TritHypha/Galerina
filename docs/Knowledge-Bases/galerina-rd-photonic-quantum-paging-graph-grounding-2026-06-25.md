# Honesty-bar grounding — photonic multiplexing · quantum threshold · "Secure Cryptographic Paging" · .graph hygiene (2026-06-25)

Owner R&D batch, grounded against shipped code + physics under the **Absolute Zero-Trust honesty bar**
(workflow `wxeazwfiv`, 5 agents, adversarial honesty critic). The owner explicitly asked for the *honest
reality check, not validation*. **Critic verdict: honesty bar HELD; 0 overclaims slipped through as SOUND;
every refuted overclaim carries its lawful residue (R&D Standard #21); every shipped-code citation verified.**

The two fences (never relaxed): **crypto + bit-exact determinism stay binary/digital (SPORE-SUBSTRATE-001);
the exotic substrate feeds only a degrade-only K3 verdict (vAnd=min, unknown→DENY), never carries keys/ledger,
never manufactures an ALLOW.** And "latency is not work": parallel/optical throughput is real, but encode Θ(N)
+ readout Θ(N) + an ADC/demux bottleneck bind it — there is no free O(1)/instant/asymptotic-work win.

---

## Thread 1 — "more than 6 wave vectors / +1 wave": photonic multiplexing scaling (ZT 94)

**Reframe:** you don't add geometric **3D angles** (alignment nightmare); you add **multiplexed degrees of
freedom** — wavelength (WDM/color), polarization (spin), spatial mode (OAM) — down ONE waveguide. The shipped
emulator already models this as an *m-channel bank*, not extra angles.

| Claim | Verdict | Why |
|-------|---------|-----|
| More waves = multiplex more DoF (color/polarization/mode), not more angles | **SOUND** | Right intuition; `wdmCrosstalkMatrix(m, leak)` is an m-channel coupler (emulator.ts:147-160) |
| "10 colors = ten 64×64 matmuls in the **same clock cycle**" | **OVERCLAIM** | Throughput-real, clock-cycle-false: each result needs its own Θ(output) ADC demux + Θ(N²) weight-load; collapses latency-O(1) into work-O(1) |
| "Speeds silicon can't even theoretically match / instantly" | **HARD-WALL** | Silicon's ceiling is the *same* Θ(N²) I/O bound; measured realized speedup **median 1.9×** (Meech 2023), not unmatchable; "instant across rack" barred by no-signaling |
| Nonlinear crosstalk (FWM/XPM/SRS) + demux/ADC readout walls | **HARD-WALL** | All-optical logic needs nonlinearity → packing intense beams couples colors; the ADC conversion boundary (not the optics) sets the ceiling. Already modeled + tested in code |
| "More lanes do things that **weren't possible before**" | **OVERCLAIM** | No new computability (a mesh computes matrix-vector products silicon already does); only a new density/latency/energy *regime* for high-reuse dense MVM |
| The waves carry security (entanglement self-proves / QKD un-tappable / drop the MAC) | **OVERCLAIM** | Adjacent trap: a lane never carries keys/ledger. QKD *needs* the classical MAC "drop the MAC" discards; crypto stays binary (SPORE-SUBSTRATE-001) |

**Work-with-it:** add lanes as **compute-only Tier-3 data-parallel throughput** for *eligible* dense fixed-weight
MVM (inference, many-vector semantic search), routed by the shipped `PartitionDecider` — defaults digital,
offloads only on a proven absolute-ns **net win** (worst case "stayed digital", never a slowdown); charge the
demux/ADC conversion tax (`meechRealizedRatio`); keep modeling crosstalk with the energy-conserving coupler and
**refuse fail-closed when the ADC-quantization floor exceeds tolerance** (`requiredRedundancy→Infinity`, caller
can't override with `redundancyN`); cheap-verify the offloaded result with Freivalds → DENY+digital on failure;
the T-matrix enters the core only as a signed 4-gate passport that can only **degrade** the K3 verdict. Honest
pitch (R&D 0110 #8): the matmul-fraction of real flows Amdahl-caps even a *free* optical core below ~1.1× — sell
governance + latency-predictability, not raw speed. **Maps to:** galerina-ext-photonic-emulator + photonic-admission.

## Thread 2 — quantum threshold (ZT 93)

The owner's **single-photon dividing line** (classical deterministic E-field → probabilistic Hilbert-space
amplitudes; interference → entanglement) is **physically SOUND** — and the *math* split (deterministic MZI
unitary `T·v` vs `|ψ⟩=α|0⟩+β|1⟩`, `|α|²+|β|²=1`, irreversible collapse) is the rigorous version. Two attached
claims fail:

| Claim | Verdict | Why |
|-------|---------|-----|
| Single-photon = classical→quantum line; the math is the real boundary | **SOUND** | Coherent-state shot noise ~1/√n → deterministic; n=1 → Born rule. This is *why* quantum results are non-bit-reproducible → untrusted-by-construction |
| "Change Photon A → Photon B **instantly** reacts across the rack" | **HARD-WALL** | No-signaling theorem: `ρ_B=Tr_A(ρ_AB)` invariant under Alice's ops → 0 readable bits until a ≤c classical channel carries the outcome. Lawful residue: MBQC is time-ordered async feed-forward |
| "Cancer drug structure in **seconds vs 10,000 years**" | **OVERCLAIM** | Conflates Google's random-circuit-sampling supremacy benchmark (no chemistry value) with drug design; no fault-tolerant QC does this today; Galerina governs **ffsim**, a *classical* simulator whose win is an exact subspace conservation law, not a quantum speedup |
| **Owner's Q:** K3 accept a 99%/1%-noisy quantum result, or only 100%-deterministic into .tmf? | **SOUND** | **Both-but-separated:** model in tolerance (admit degrade-only via signed toleranceWitness + QBER→K3 trit, can only lower a verdict), ledger in determinism (only bit-exact bytes SHA-256-signed on the digital core; noisy lane carries no crypto effect). The two never cross |

**Work-with-it:** a quantum/photonic device is a **Tier-3 untrusted co-processor** on a `lane:noisy` substrate;
entanglement gives no instant action but **is a tamper sensor** (QBER spike → K3 trit → TRAP→ERASE before any
decrypted byte); ffsim wrapped out-of-process behind the Toxic Border with a subspace-dim pre-spawn gate +
measured wall-time + signed toleranceWitness, results admitted degrade-only into modeling. **Maps to:**
galerina-ext-bridge-quantum (SHIPPED) + the decideAtBoundary/lease K3 collapse rail + SPORE-SUBSTRATE-001.

## Thread 3 — "Have I invented Secure Cryptographic Paging?" (ZT 88)

**Honest answer: mostly no — it's prior art + already-shipped residue.**

| Claim | Verdict | Why |
|-------|---------|-----|
| Novel concept | **OVERCLAIM (prior art)** | Encrypted swap with an ephemeral key discarded on completion already exists: Linux `dm-crypt` random-key swap, OpenBSD `swapencrypt`, macOS encrypted VM = cryptographic erasure of swap |
| "$O(1)$ `memory.fill(0)` … file mathematically annihilated in a **millisecond**" | **OVERCLAIM** | `memory.fill` is ONE opcode doing **Θ(arena-size)** work — now CI-blocked by `scripts/audit-overclaim-phrases.mjs`. Crypto-shredding is sound (NIST 800-88), but the wipe is not O(1) |

**Work-with-it:** for *secrets*, the better move is **don't page them at all** — `mlock`/`MADV_DONTDUMP` to pin
the working set in locked RAM (galerina-ext-secrets-tmf already does this). The genuine Galerina-specific value is the
**WASM-sandbox-managed spill** (not trusting host-OS swap) + a **governed, attested crypto-erase witness** bound
to the .lmanifest — and that witness already ships (`substrate-erasure.ts`, `SPORE-RETAIN-001`). So: not invented,
but the lawful core is real and largely built.

## Thread 4 — .graph hygiene: are they a public security risk / should they be gitignored? (ZT 93)

| Question | Verdict | Why |
|----------|---------|-----|
| Q1 Security risk if public? | **No (OVERCLAIM to fear it)** | Derived metadata about *already-public* code (package names, public dep specifiers, file paths, integer counts) — a projection of public data carries no secret the source didn't. The 25 stubs are all-zero |
| Q2 All 3 generated → all gitignore-eligible? | **OVERCLAIM (2-of-3)** | `BOUNDARY.md` + `package-graph.json` are pure derived; **`boundary-policy.json` is the hand-editable deny-by-default allowlist** — regenerable in *shape* but its *value* is policy intent |
| Q2b If policy gitignored, does --check still enforce? | **HARD-WALL (fail-open in code)** | `reporter.ts:60-69`: a *missing* policy WRITES a fresh permissive baseline (`BASELINE_CREATED`, 0 violations) → every run re-blesses the present imports; a new/malicious import is silently allowed. **The policy MUST be tracked** |
| Q3 Is RD-0124 "track them" still right? | **SOUND (for the derived two)** | The PR-diff of `BOUNDARY.md`/`package-graph.json` is the *only* border-drift signal today — CI `--check` is genuinely unwired (#149, only secret-scan landed). Gitignore them now and a new import lands with no signal anywhere |
| Q4 Worth tracking the 25 empty stubs' all-zero reports? | **SOUND (cheap tripwire)** | `allowedExternal:[]` means the first real import a stub grows is a non-empty diff against a committed zero — the cheapest possible deny-by-default tripwire, zero churn |

**Recommended hygiene policy (the owner's instinct is the right *end state* but early by one dependency):**
1. **Always track `boundary-policy.json`** (every package, empty or not) — gitignoring it is a fail-open. Non-negotiable; this is the part of "generated → gitignore" that must NOT be applied.
2. **Keep tracking `BOUNDARY.md` + `package-graph.json` for now** (honour RD-0124) — they're the only drift signal until #149.
3. **Sequence:** wire #149 (a CI job that runs `graph --check` per package and fails on out-of-allowlist imports) FIRST, then gitignore the two derived reports **in the same PR**. Never before.
4. **My 25-baseline commit (`42f19e8`) was correct — do NOT revert.** The all-zero baselines are working tripwires.

**Latent finding (flagged, not actioned):** `reporter.ts:60-69` re-baselines a *missing* policy permissively. For a
*new* package that's intended (BASELINE_CREATED), but for an *existing* package whose policy was deleted it's a
fail-open. A guard that distinguishes "new package" from "policy deleted" would close it — owner/worker call.

---

## Consolidated standing-format table

| Thread | Name | Explanation (the work-with-it) | Using it? | ZT |
|--------|------|-------------------------------|-----------|----|
| 1 | Photonic multiplexing (>6 lanes) | Add WDM/polarization/mode lanes as compute-only Tier-3 throughput behind the net-win PartitionDecider + ADC-floor refusal + Freivalds verify + degrade-only K3. No O(1)/instant/new-capability. | Buildable now (emulator shipped) | 94 |
| 2 | Quantum threshold | Single-photon line is real; quantum = Tier-3 untrusted, degrade-only for modeling, never into crypto/.tmf. QBER→K3 tamper sensor. No FTL, no "seconds vs millennia". | Bridge shipped (ffsim governed) | 93 |
| 3 | Secure Cryptographic Paging | Not novel (encrypted swap = prior art); don't-page-secrets (mlock) + governed attested crypto-erase witness is the real residue — already ships. O(1)-wipe refuted. | Mostly shipped (secrets-tmf, substrate-erasure) | 88 |
| 4 | .graph hygiene | Not a public security risk. Track the policy permanently (gitignore = fail-open); keep the 2 derived reports until CI `--check` (#149), then gitignore in the same PR. Don't revert 42f19e8. | Decided (no revert; #149 = forward action) | 93 |

*Full per-claim evidence + the honesty critic's line-by-line shipped-code verification are in workflow `wxeazwfiv`.
The repeating lesson: every refused overclaim leaves a buildable, deny-by-default residue — the fence is the feature.*
