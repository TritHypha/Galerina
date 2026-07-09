# Defensive Publication — Cache-partition (colouring) isolation of a zero-trust authorization state against eviction and Prime+Probe side-channels

**Disclosure ID:** DP-RD-0170 · **Date:** 2026-07-01 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Provenance:** RD-0170 · analysis `galerina-rd-audit-76mesh-recheck-2026-07-01.md` · machine-checkable proof `proofs/rd-0170-cache-coloring-isolation-proof.mjs` (re-run GREEN, exit 0).

> **Purpose of this document.** This is a *defensive publication* — a deliberate act of putting a technique into the public
> domain as prior art so it cannot later be monopolised by a patent, and so the *honest* bound on what the technique does is
> on the record. It is expressly **not** a patent application and makes **no** proprietary claim. The contribution here is
> as much the disclosed *limitation* as the disclosed *mechanism*: the technique below is a hardware/OS-gated
> defence-in-depth control that **detects/prevents a specific class of cache leakage but is never an admission gate**, and
> that honesty is the point.

---

## 1. Technical field

Micro-architectural isolation of security-critical state on shared-memory multi-core CPUs. Specifically: the use of
last-level-cache (LLC / L3) *partitioning* — via Intel Cache Allocation Technology (CAT) or OS page-colouring — to pin a
zero-trust **authorization working-set** (in the reference system, the Tri-Router `.fungi`-capability vectors that drive
per-request admission decisions) into a *reserved* set of cache ways, isolating it from (a) eviction by a co-resident
"noisy-neighbour" workload and (b) observation by a cross-workload cache timing side-channel of the Prime+Probe /
Flush+Reload family (CWE-208, "Observable Timing Discrepancy" / cache-timing information exposure).

## 2. Background & problem

A zero-trust authorization engine evaluates a signed capability on the hot path of every request. To keep that path fast,
the authorization state (capability vectors, routing tables) is held in cache. On a shared multi-core host this creates two
distinct micro-architectural exposures, *independent of* whether the authorization logic itself is correct:

1. **Eviction / availability.** The LLC is shared across cores. A co-resident payload workload that streams a large working
   set through the same cache sets will evict the authorization lines under LRU, forcing the auth engine back to DRAM. This
   is not a correctness bug — the verdict is unchanged — but it degrades latency and availability of the security engine
   exactly when load is highest, and it is trivially inducible by an adversarial or merely greedy neighbour.

2. **Confidentiality side-channel.** Because auth cache accesses can be *secret-dependent* (which capability line is
   touched depends on the request/subject), a co-resident attacker can run **Prime+Probe** on a shared cache set: prime the
   set with attacker lines, let the victim run, then re-probe and time each line — an evicted attacker line reveals that the
   victim touched that set. This leaks bits about the authorization access pattern (CWE-208 / cache-timing).

The problem addressed here: **can we cheaply remove both exposures for the small, security-critical auth working-set,
without changing — and without ever *becoming* — the admission decision itself?**

## 3. Prior art (stated honestly)

The disclosed technique composes several well-established, individually non-novel ideas. This section names the closest
prior art precisely so that this publication claims nothing already public, and so that the *combination + honest scoping*
is what enters the record.

- **Intel Cache Allocation Technology (CAT) & OS page-colouring.** Hardware/OS mechanisms for partitioning the LLC into
  disjoint way-masks / colour classes per workload. These are the *substrate* the disclosed technique stands on; using CAT
  or page-colouring to reserve cache for a workload is prior art.
- **CATalyst / Apparition and related "cache-colouring for security" work.** Prior academic systems already use CAT /
  colouring specifically to defeat LLC Prime+Probe by giving a secure region a private partition. The disclosed technique's
  side-channel-isolation *mechanism* is of this family and is **not** claimed as novel.
- **vLLM PagedAttention (and paged-memory schemes generally).** Prior art for partitioning/paging a hot working-set for
  performance and isolation; cited to disclaim novelty over "reserve a region for the hot set" as a general idea.
- **Kunegis signed-Laplacian / signed-graph spectral methods.** Cited from the surrounding corpus only to be explicit that
  the disclosed control is orthogonal to graph-spectral routing and makes no claim there.
- **Parameterised queries** and **ECC / Target-Row-Refresh (TRR) Rowhammer mitigations.** Cited as the canonical family of
  "structural mitigation that removes a class of exposure by construction" — the disclosed control is the *cache*-layer
  analogue (isolate-by-construction), and, like TRR, it is a *mitigation of a specific channel*, not a universal guarantee.
- **b-ary / branchless & constant-time coding theory.** Cited because the reference system already ships a constant-time /
  constant-branch lint (`FUNGI-SECRET-004`); the disclosed technique is the *spatial* (cache-partition) cousin of that
  *temporal* (constant-time) mitigation, addressing the same CWE-208 family from the memory-layout side.

**What is therefore NOT claimed as novel:** CAT/colouring itself; using a private partition to block LLC Prime+Probe;
reserving cache for a hot set. **What this document places on record** is the specific *application* — pinning a zero-trust
signed-capability authorization working-set into a reserved LLC partition as **defence-in-depth that is explicitly barred
from being an admission gate** — together with a machine-checked statement of the exact bound under which it holds.

## 4. Summary of the disclosed subject matter

A method for isolating a zero-trust authorization working-set by colour-reserving a subset of last-level-cache ways (via
Intel CAT or OS page-colouring) exclusively for the signed-capability vectors, such that (i) a co-resident payload stream
cannot evict the auth state regardless of flood size, and (ii) a cross-workload Prime+Probe attacker — who can only touch
the *shared* partition — observes zero evictions attributable to secret-dependent auth accesses; with the explicit,
machine-checked constraints that the isolation holds only while the auth working-set fits within the reserved ways, and
that cache residency is **never** consulted as part of the admission verdict, which remains keyed solely on the signed
capability.

## 5. Detailed description / embodiment (with the key result and the actual proof numbers)

**Model.** A set-associative LLC set of `W` ways is modelled as an LRU set. Colour-partitioning splits it into a
`reservedForAuth`-way *auth-only* partition and a `W − reservedForAuth`-way *shared* partition. Auth lines may occupy only
the reserved partition; every other workload (including any attacker) may occupy only the shared partition. Prime+Probe is
modelled faithfully: the attacker fills the shared partition, the victim may touch a line, the attacker re-probes, and each
attacker line that has been *evicted* counts as one leaked bit ("victim touched this set"). The reference slice is a typical
`W = 16`-way L3.

**Result A — eviction, no partition (the exposure).** With `reservedForAuth = 0`, the auth line is loaded and warmed
(cold miss then hit), then a payload stream of `W = 16` distinct lines is run through the same set. The auth line is
evicted:

> `(A) no-colouring: after a 16-line stream flood, auth line survived = false  -> EVICTED`

**Result B — eviction, with a reserved colour partition (the fix).** Reserving `2` of the `16` ways for auth and then
running a **100× oversized flood** (`100 × 16 = 1600` distinct stream lines) through the shared partition, the auth line
survives every time:

> `(B) colouring(2/16): after a 1600-line flood, auth line survived = true  -> ISOLATED`

This is the key availability result: the reserved partition makes eviction of the auth state by a neighbour **impossible by
construction**, not merely improbable — the flood cannot reach the reserved ways at any size.

**Result C — Prime+Probe side-channel (the confidentiality result, the headline number).** Without a partition, the
attacker primes the whole `16`-way set, the victim touches a secret-dependent auth line in the same set, and the attacker
re-probes: **≥ 1 attacker line is evicted → ≥ 1 bit leaked**. With a `2`-way reserved partition, the attacker can prime only
the `14` shared ways; the victim's auth line lives in the *reserved* partition, so the attacker observes **zero** evictions:

> `(C) Prime+Probe leaked bits: no-colouring = 1 (>=1)  vs  colouring = 0 (0)`

The leaked-bit count goes **1 → 0**. That is the disclosed confidentiality effect: the cross-workload LLC Prime+Probe
channel against the auth access pattern is closed because the attacker and the secret-dependent access no longer share a
cache set.

**Result D — the honest bound (disclosed as a first-class limitation).** Colouring helps **only while the auth
working-set fits in the reserved ways**. With `3` distinct auth lines but only `2` reserved ways, the partition
*self-evicts* — the first line is pushed out by the third:

> `(D) honest bound: auth working-set(3) > reserved ways(2) -> a0 survived = false (partition must be sized to the auth WS)`

The partition must be sized to the auth working-set; undersize it and the isolation guarantee (both A/B and C) degrades
inside the reserved region itself.

**Result E — never an admission gate (the binding scope constraint).** Admission is modelled as `admit(signatureValid,
cacheResident) = (signatureValid === true)` — cache residency is *ignored*. A forged/absent signature that happens to be
cache-resident is still **DENIED**; a valid signature that is cache-cold is **ALLOWED**. Cache residency is orthogonal to
the verdict:

> `(E) colouring never gates admission: admit() ignores cache residency; verdict stays on the signed capability (RD-0169)`

This encodes the binding rule (RD-0169): the cache control is defence-in-depth for the *integrity/availability/
confidentiality of the auth engine's state*, and must **never** be read as evidence for or against admission.

**Substrate note.** The embodiment stays on the binary/digital lane; the cryptographic verification stays on-core. The
technique *isolates* the existing auth compute in cache — it does **not** relocate it to a noisy or photonic lane
(FUNGI-SUBSTRATE-001 intact).

## 6. Honest limitations & scope

The following limitations are disclosed as part of the contribution, not as caveats to be minimised:

- **Hardware/OS-gated.** The technique requires Intel CAT (or an equivalent way-partitioning ISA feature) or OS
  page-colouring. On hardware/OS without such a mechanism there is nothing to enable; this is not a portable
  software-only mitigation.
- **Detect/prevent a *specific* channel only — not universal.** It closes the **cross-core LLC** Prime+Probe / eviction
  channel against the reserved auth state. It does **not** address same-core **L1/L2** channels, SMT/hyperthread-sibling
  leakage, TLB/branch-predictor/port-contention channels, DRAM Rowhammer, or micro-architectural leakage in general. It is
  one control in a defence-in-depth stack, mitigating one CWE-208 sub-channel.
- **NEVER an admission gate; never an admission pre-filter either.** Cache residency is not, and must not become, an input
  to the allow/deny decision — not as a gate and not as a fast-path "deny-only" pre-filter. The verdict is keyed solely on
  the signed capability (proof E, RD-0169). Any embodiment that consults residency to *decide* is outside this disclosure
  and is explicitly disclaimed.
- **Constant-factor benefit, not an order-of-complexity change.** Isolation is a fixed structural property of the reserved
  partition; it does not change the asymptotic cost of authorization. It buys eviction-immunity and side-channel closure,
  not algorithmic speedup.
- **Bounded by the reserved-ways sizing.** The guarantee holds only while `auth working-set ≤ reserved ways` (proof D).
  Misconfiguration (undersized partition, or an auth working-set that grows past the reserve) silently degrades the
  isolation via self-eviction inside the partition. Correct operation depends on sizing the reserve to the true auth
  working-set.
- **Not a confidentiality proof of the auth logic.** It reduces observability of the *access pattern* via one channel; it
  makes no claim that the authorization algorithm is otherwise constant-time or leak-free. It composes with — and does not
  replace — the temporal constant-time control (`FUNGI-SECRET-004`).
- **Model, not silicon measurement.** The machine-checked evidence is a faithful LRU set-associative *model* of eviction
  and Prime+Probe; it proves the *logical* isolation property under that model. It is not a hardware performance-counter
  measurement on a specific CPU, and real silicon may exhibit replacement policies, prefetchers, or slice-hashing not
  captured by the model.

## 7. Illustrative disclosure claims

These are disclosed embodiments, stated as broadly-but-truthfully as the evidence supports. They are prior-art
disclosures, not patent claims.

1. **A method** wherein a zero-trust authorization working-set (signed-capability vectors driving per-request admission) is
   pinned into a reserved subset of last-level-cache ways via cache way-partitioning (Intel CAT) or OS page-colouring, such
   that only authorization lines may occupy the reserved ways.

2. **A method** as in claim 1 wherein a co-resident workload streaming an arbitrarily large working-set through the
   non-reserved (shared) partition cannot evict any line of the reserved authorization working-set, so that the
   authorization state survives a flood of any size (verified for a 100× / 1600-line flood against a 2-of-16-way reserve).

3. **A method** as in claim 1 wherein a cross-workload Prime+Probe or Flush+Reload attacker, being confined to the shared
   partition, observes zero cache evictions attributable to secret-dependent authorization accesses that occur in the
   reserved partition, thereby closing that last-level-cache timing side-channel (CWE-208) against the authorization access
   pattern (verified leaked-bit reduction from ≥1 to 0).

4. **A method** as in claims 1–3 wherein the reserved partition is sized to be at least as large as the authorization
   working-set, the disclosed isolation holding only while `authorization working-set ≤ reserved ways`, and self-eviction
   occurring within the reserved partition otherwise.

5. **A method** as in claims 1–4 wherein the admission verdict is computed solely from verification of the signed
   capability and is independent of cache residency — such that a request with an invalid or absent signature is denied
   even if cache-resident, and a request with a valid signature is admitted even if cache-cold — so that the cache
   partitioning is defence-in-depth and is never consulted as an admission gate or admission pre-filter.

6. **A method** as in claims 1–5 wherein the cache-partition (spatial) isolation composes with a constant-time / constant-
   branch (temporal) control on the same authorization path, the two together mitigating both the memory-layout and the
   timing facets of the CWE-208 cache side-channel family, on a binary/digital, on-core substrate.

## 8. Machine-checkable evidence

**Proof:** `proofs/rd-0170-cache-coloring-isolation-proof.mjs` — Node built-ins only, `assert/strict`; exit 0 = all GREEN.
Re-run with `node proofs/rd-0170-cache-coloring-isolation-proof.mjs`.

Checks:

- **(A)** Without colouring, a 16-line stream flood **evicts** the auth line (`survived = false`) — establishes the
  exposure.
- **(B)** With a 2-of-16-way reserved partition, a **1600-line (100×) flood** leaves the auth line resident
  (`survived = true`) — eviction isolation.
- **(C)** Prime+Probe leaked bits: **no-colouring = 1 (≥1)** vs **colouring = 0** — side-channel closure (`1 → 0`).
- **(D)** Honest bound: auth working-set of 3 with only 2 reserved ways self-evicts (`a0 survived = false`) — the reserve
  must be sized to the working-set.
- **(E)** Admission ignores cache residency: forged-but-resident is denied, valid-but-cold is allowed — colouring is never
  an admission verdict.

**GREEN result (verbatim, re-run 2026-07-01, exit 0):**

```
== RD-0170 L3 cache-colouring isolation — machine check ==

  (A) no-colouring: after a 16-line stream flood, auth line survived = false  -> EVICTED
  (B) colouring(2/16): after a 1600-line flood, auth line survived = true  -> ISOLATED
  (C) Prime+Probe leaked bits: no-colouring = 1 (>=1)  vs  colouring = 0 (0)
  (D) honest bound: auth working-set(3) > reserved ways(2) -> a0 survived = false (partition must be sized to the auth WS)
  (E) colouring never gates admission: admit() ignores cache residency; verdict stays on the signed capability (RD-0169)

ALL CHECKS PASSED — colouring isolates the auth state from eviction (A vs B) and from a
cross-workload Prime+Probe leak (C), within the honest working-set bound (D), and is
defence-in-depth that NEVER becomes an admission verdict (E). HW/OS-gated (Intel CAT / page-colouring).
```

**Cross-references:** analysis `galerina-rd-audit-76mesh-recheck-2026-07-01.md` (§3, RD-0170); RD-0166 (perf framing of the
same cache work, from which the security half was surfaced); RD-0169 (admission stays keyed on the signed capability);
`FUNGI-SECRET-004` (constant-time/constant-branch lint — the temporal cousin of this spatial control).
