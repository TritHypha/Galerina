# Interaction-net parallelism is span, not work: an honest-bounds note on "compile to Interaction Combinators for O(1)"

**Disclosure ID:** DP-RD-0257 · **Date:** 2026-07-04 · **Type:** Prior-art disclosure (defensive) — NOT a patent claim · **Provenance:** RD-0257 assessment (`ZTF-Knowledge-Bases/galerina-rd-0257-bend-interaction-combinators-hvm2-note83.md`); re-runnable proof `Galerina-R-AND-D/tritmeshql/bend-interaction-combinators-check.mjs` (17/17, exit 0); source prompt `Galerina/notes/83-bend.md`. Extends the prior `latency-is-not-work` defensive-publication note.

**Purpose.** This is a defensive publication placing an honestly-bounded engineering conclusion in the public domain as timestamped prior art. **Novelty is explicitly disclaimed** (§3): the constituent results — Lafont's interaction combinators, Lévy/Lamping optimal reduction, Asperti–Mairson's bookkeeping lower bound, and Amdahl/Brent work–span analysis — are all established. As with the companion `latency-is-not-work` note, **the disclosed *limitation* is the contribution**: it is a common and seductive error (seen in a recent AI-authored design note) to claim that compiling to interaction combinators / HVM2 / Bend makes graph queries, governance checks, or recursive problems run in *O(1)*. That claim conflates two different quantities — *span* (critical-path depth / latency) and *work* (total operations / energy). This note records, with a machine-checkable model, that **interaction-net evaluation is a parallelism (span) technique, not a work-reduction technique**, and that the "optimal reduction" property does not imply cheap execution.

---

## 1. Technical field

Parallel evaluation models for functional / graph-reduction languages; specifically the interaction-combinator model (and its implementation in HVM2 / Bend) proposed as a compilation target to accelerate database traversal, authorization-policy evaluation, and recursive computation. The note concerns the correct asymptotic accounting of such a target.

## 2. Background & problem

Interaction combinators (Lafont 1997) are a confluent, inherently-parallel model of computation: a program is a graph, reduction happens by local *interaction* rewrites on active pairs, and independent active pairs may be reduced simultaneously. HVM2 (HigherOrderCO) implements this model with CPU and CUDA runtimes; the Bend language targets HVM2. Because reduction is local and parallel, it is tempting to claim that a workload compiled to interaction nets executes *instantly* — in constant time — because "all the cores fire at once."

The problem: this reasoning silently substitutes **span** for **work**. For a computation:

- **Work** `W` = the total number of interaction/reduction steps (proportional to energy and to time on a single core).
- **Span** `S` = the length of the longest chain of dependent steps (the critical path; the best achievable time with unbounded parallelism).
- On `P` processors, by Brent's theorem, time `T_P = Θ(W/P + S)`.

Parallelism reduces `S` relative to `W`; it does **not** reduce `W`. Claims of *O(1)* execution for a workload whose *output alone* is super-constant (e.g. a graph frontier, a fold over N rules, a Tower-of-Hanoi solution of 2ⁿ−1 moves) are therefore false regardless of the evaluation model.

A second, subtler error concerns **optimal reduction**. "Optimal" (Lévy 1978; realised by Lamping 1990 and the interaction-net-based implementations) means *β-step-optimal*: no redex is ever duplicated and re-reduced. It is frequently misread as "cheapest possible execution." Asperti & Mairson showed this is false in the strongest sense: the *bookkeeping* required to maintain sharing (the oxide/bracket machinery) is not bounded by any elementary recursive function of the number of β-steps. Optimal-in-β-steps can still be catastrophically expensive.

## 3. Prior art (stated honestly — novelty disclaimed over each)

- **Y. Lafont, "Interaction Combinators," *Information and Computation* 137(1):69–101, 1997** (DOI 10.1006/inco.1997.2643). The model itself, its universality and confluence. Not claimed as novel here.
- **J.-J. Lévy, optimal reductions in the λ-calculus (1978 thesis); J. Lamping, "An algorithm for optimal lambda calculus reduction," POPL 1990.** The definition and first realisation of optimal (β-step) reduction. Cited to scope exactly what "optimal" means.
- **A. Asperti & H. Mairson, "Parallel beta reduction is not elementary recursive," POPL 1998 (also *Information and Computation*).** The bookkeeping lower bound — the load-bearing citation for "optimal-in-β-steps ≠ cheap."
- **G. Amdahl (1967) and R. Brent, "The parallel evaluation of general arithmetic expressions," JACM 1974.** Work–span accounting and the fixed-serial-fraction bound. The present note is the interaction-net-specific instance of this classical accounting.
- **HVM2 / Bend (HigherOrderCO), Apache-2.0.** The concrete implementation under discussion; its own published benchmarks show throughput scaling *linearly in core count* on high-parallelism workloads — i.e. a span/parallelism win with real per-interaction overhead, exactly consistent with this note.

**What is therefore NOT claimed as novel:** the interaction-combinator model; optimal reduction; the bookkeeping bound; work–span analysis. **What this document places on record** is the specific, honestly-bounded engineering conclusion — *compiling an authorization/graph/recursive workload to interaction combinators buys span (latency under parallelism), not work; it cannot deliver the O(1) results claimed in the source note; and "optimal reduction" does not rescue this* — together with a machine-checked model of the accounting.

## 4. Summary of the disclosed subject matter

For any computation compiled to interaction nets and evaluated on `P` processors: the total interaction **work** is invariant to the evaluation order and is bounded below by the size of the output; **span** may be reduced by parallel reduction of independent active pairs; time is `Θ(W/P + S)`; and therefore *O(1)* execution requires both `P ≥ W` (unbounded cores) **and** a workload whose output and dependency depth are themselves `O(1)` — which excludes graph-frontier traversal (work grows with hop count), branch annihilation (Θ(nodes)), N-rule policy folds (work Θ(N), span O(log N)), and Tower-of-Hanoi (output Ω(2ⁿ)). Separately, "optimal reduction" is β-step-optimal only and carries non-elementary bookkeeping (Asperti–Mairson), so it is not a general cost guarantee. The genuinely-sound residue — parallel *span* reduction on high-parallelism batch workloads (e.g. mass signature verification), the correctness of a parallel fold over an associative/commutative operator, and the identity between interaction-net linearity and affine (use-once) resources — is real and is disclosed as such.

## 5. Detailed description (with the machine-checked results)

The re-runnable model `bend-interaction-combinators-check.mjs` (17/17, exit 0) encodes both the refutations and the sound parts:

- **Work is Θ(N), span is O(log N) (N1).** A fold of `N` policy verdicts costs `N−1` binary combines for *every* `N`; the span is `⌈log₂ N⌉`. With `P` cores, time is `Θ(N/P + log N)`; even with `P = N` cores, time equals the span `log₂ N`, never `1`. "O(1) governance" is refuted.
- **Branch annihilation is Θ(M) work (N2).** Collapsing a subtree of `M` nodes performs `M` node-collapses; parallel garbage collection lowers the *span*, not the work.
- **Tower of Hanoi is not O(1) (N3).** Hanoi(n) requires exactly `2ⁿ−1` moves (Hanoi(16)=65,535); the output alone is `Ω(2ⁿ)`. The "expand every possible future" multiverse is exponential *space* (`bᵈᵉᵖᵗʰ`) followed by exponential prune-*work*.
- **k-hop traversal grows with k (N4).** The reachable frontier is `Σ bᵏ`; a 10-hop query does strictly more work than a 1-hop query (span may be `O(k)`; work is not `O(1)`).
- **Operator pin (N5).** The source note's `S ⊗ C` uses Hadamard *multiplication*; the correct authorization operator is K3 `min`. Under multiplication two DENY (−1) inputs forge an ALLOW (`(−1)·(−1)=+1`); under `min` they cannot. (Cross-referenced to the shipped `vAnd = minTrit`.)
- **Sound: FOLD is correct (N6).** K3 `min` is associative and commutative (exhaustive over 27 triples); a balanced tree-fold equals a left-fold for every test sequence — so a parallel reduction (`FOLD`) over the authorization operator is mathematically valid.
- **Sound: affine ⇔ interaction-net linearity (N7).** A use-once (affine) capability — first use ALLOW, second use after consumption DENY — is exactly interaction-net linearity (a node is consumed on interaction). A non-affine token permits the reentrancy the source note warns about; affinity is load-bearing.
- **Fence (N8).** If an interaction-net/GPU lane is used as an *accelerator*, its result must be re-validated on the deterministic core: `final = min(digital, gpu)`. A forged/noisy GPU `+1` cannot manufacture an ALLOW past this re-check; trusting the accelerator's verdict directly admits the forgery.

## 6. Honest limitations & scope

- **This is a model-level and literature-grounded result, not a fresh HVM2 benchmark on a named machine.** The companion measured-negative would require running an actual interaction-net implementation against the reference workload on stated hardware/versions; that measurement is the residual and is *not* claimed here. The classical accounting (Brent) and the cited bookkeeping bound (Asperti–Mairson) stand independently of any such measurement.
- **The negative is scoped to the *O(1)/work-reduction* claim.** It does **not** dispute that interaction nets are a legitimate parallel model, that HVM2 delivers real span reduction on high-parallelism workloads, or that the model is elegant and Apache-2.0-clean. Those are affirmed.
- **The sound residue (§5 N6–N8) is disclosed as sound**, not refuted: parallel folds over associative operators, affine/linear resource discipline, and accelerator-with-digital-re-check are all valid.
- **No performance number for any specific Galerina workload is asserted.** Whether an interaction-net backend beats the existing lowering on a given query is an open, benchmark-gated question.

## 7. Illustrative disclosure claims

These are prior-art disclosures, not patent claims, stated broadly-but-truthfully.

1. **A method** of accounting for a computation compiled to an interaction-combinator / interaction-net evaluator wherein the total interaction **work** is treated as invariant to evaluation order and bounded below by output size, the **span** as the reducible quantity under parallelism, and wall-time on `P` processors as `Θ(work/P + span)` — such that constant-time execution is claimed only where both the output and the dependency depth are themselves constant.
2. **A method** as in claim 1 wherein "optimal reduction" is treated as β-step-optimality only, explicitly **not** as a cost bound, in recognition of a non-elementary bookkeeping lower bound.
3. **A method** as in claims 1–2 wherein an interaction-net / GPU evaluator is used strictly as a compute *accelerator* whose result is re-validated by a deterministic on-core check (`final = min(core, accelerator)`), so the accelerator can never manufacture an authorization it did not earn.
4. **A method** as in claims 1–3 wherein a parallel reduction (fold) is admitted only over an associative-and-commutative combining operator (e.g. the three-valued `min`), guaranteeing order-independence of the result.
5. **A method** as in claims 1–4 wherein interaction-net linearity is used to realise affine (use-once) capabilities, a node being consumed upon interaction, eliminating reuse/reentrancy of a spent capability.

## 8. Machine-checkable evidence

**Proof:** `Galerina-R-AND-D/tritmeshql/bend-interaction-combinators-check.mjs` — Node built-ins only. Re-run: `node bend-interaction-combinators-check.mjs`; expect `ALL PASS — 17 passed, 0 failed`, exit 0. It is part of the keep-green suite (`audit-artifacts.mjs`). Checks N1–N8 as described in §5 (four refutations of the O(1) class, the operator pin, and three sound-part validations). The model is deliberately elementary (work/span counters, an exhaustive associativity check over the trit domain, an affine-use model, and a digital-re-check fold) so that its correctness is self-evident on inspection.

---

### Declarations

- **Type / tier:** defensive-pub (honest-bounds prior-art record; extends the `latency-is-not-work` note). Not a flagship, not a novelty claim.
- **Authorship & AI assistance:** drafted with AI assistance under human direction (owner: Phillip Booth). Grounding: the cited primary literature (Lafont 1997; Lévy 1978; Lamping 1990; Asperti–Mairson 1998; Brent 1974; Amdahl 1967), the RD-0257 assessment, and the re-runnable proof above. Prior-art triage is informed by training knowledge, **not** a filed legal search.
- **Funding:** none. **Competing interests:** none.
- **Data / artifact availability:** in-repo, re-runnable (`bend-interaction-combinators-check.mjs`); assessment in `ZTF-Knowledge-Bases`.
- **Licence:** Apache-2.0. Owner / copyright holder: **Phillip Booth** (hello@consumerthoughts.co.uk).

*Cross-references:* `latency-is-not-work-measured-negatives-defensive-publication-2026-06-25.md` (the sibling note); RD-0253 (`⊗ = min`, machine-proven); RD-0117 (Amdahl measured-negative); RD-0231 (`.fungi` → Graph IR — the bridge under which an interaction-net backend would be a governed, benchmark-gated option).
