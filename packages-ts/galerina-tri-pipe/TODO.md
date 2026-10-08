# Galerina Tri-Pipe TODO

Role (RD-0855 §4.3): proposal, routing and composition only. Tri-Pipe cannot
authorise its own route. SLIDE/VOK admission is a later independent act.

```text
[x] Proposal-only createTriPipeEngine: kind PROPOSAL, no engine, authorityReleased false
[x] dispatchTriPipeEngine always ROUTE_DISPATCH_FORBIDDEN
[x] AXIS-1 hardware() tier {binary|hybrid|photonic}, fail-closed unattested/unknown → binary
[x] AXIS-2 routePrecision composition (no re-derived maths)
[x] AXIS-3 PartitionDecider net-win offload; photonic IFF offload-capable ∧ ternary ∧ net-win
[x] Capability gate on DISPATCHED lane (RD-0236 #6), digital floor
[x] RD-0855 representation profiles 1/32/64/256 as candidates; default 1 (scalar first)
[x] RD-0855 128/512 experimental: no ABI — proposal REFUSED / router digital floor
[x] Digest binds representation profile (proposal.v2)
[x] ComputeTransferV1 (owner, kind, digest) on every proposal
[x] Trit (data) and Verdict (governance) kept as distinct brands on proposal and decision
[x] README matches proposal-only architecture (no engine.infer fiction)
[x] prove-tri-pipe.mjs: tier == hardware(); photonicEnabled IFF hybrid|photonic
[!] HOLD SLIDE/VOK admission of a proposed route (not this package)
    Kept HOLD (owner authority, not a soft block): RD-0855 lets Tri-Pipe only propose,
    route and compose; SLIDE admits, VOK authorises, Tower is evidence. Admitting or
    authorising here would break that. Tri-Pipe's side is done (attempt and alternative
    proposals below carry requires.freshSlideAdmission/freshVokDecision/freshVokLease);
    the admission act itself belongs to SLIDE and VOK. (Grok 2026-10-06.)
[SUPERSEDED] Tri-Fuse as a separate optimisation package. Reason: settled by RD-0855
    §4.3 and §11 item 14 unless the owner reopens it. Tri-Fuse keeps its bounded
    role as a backend-neutral, proof-constrained optimisation CONTRACT and is not
    a package. Optimising already-admitted bytes yields a new artifact that needs
    fresh SLIDE admission and a new VOK receipt. Tri-Pipe may only propose. No
    package is to be created here; a Tri-Fuse package needs the owner to reopen
    RD-0855. (Grok 2026-10-06, RD cited by id only.)
```

## RD-0855 admission-time alternatives (implemented 2026-10-06, proposal only)

These rows extend the `[!] HOLD SLIDE/VOK admission of a proposed route` row above.
The proposal-only role is unchanged: Tri-Pipe never dispatches, admits or
authorises. A failed attempt keeps its typed refusal; an alternative is a new
proposal with a new plan identity, followed downstream by its own SLIDE admission
and a fresh VOK decision, lease and receipt. Owner decided 2026-10-06 (Phillip, 16:52 BST correction; supersedes the 15:21 "K3 or binary" wording), three-tier fallback order: (1) run at the requested trit-width profile (1/8/16/32/64/256 etc.); (2) only if that width cannot run, fall back to standard Galerina Trit (K3) logic; (3) only if Trit cannot be processed at all, fall back to binary implementing the same task semantics, with K3 still deciding permission (no different two-valued algorithm, no semantic degradation). Each step down is a separate, independently admitted attempt (fresh SLIDE admission, fresh VOK decision/lease, linked receipt); DENY, revocation, unknown outcome and partial effects never become a retry.
Src: RD-0855 (private; ID+line only) L23-31, L192-200, L335-351, L365-374, L488; codex-rd0855-fallback-astra-20261006-answer-01; galerina2-rd0855-astra-fallback-20261006.

Design calls (Grok 2026-10-06, made on Phillip's 21:03 BST instruction to lift soft
blocks; zero-trust, fail-closed; owner may revisit). They are Tri-Pipe-local and do
not decide the issuer, coordinator or budget owner for other packages:

1. Task policy is a closed input `galerina.tri-pipe.task-policy.v1` (taskId, issuerId,
   requestedRepresentationProfile, workloadClass, permittedReasons, maxAttempts).
   Tri-Pipe is not the issuer and does not verify the issuer (SLIDE admission does).
   It recomputes the policy digest and refuses `TP_ALT_TASK_POLICY_SUBSTITUTED` unless
   it equals the digest the parent attempt was admitted under.
2. Tri-Pipe is not the coordinator. It exposes two pure steps, `proposeInitialAttempt`
   and `proposeAlternative`; nothing loops, schedules or calls SLIDE, VOK or Tower.
3. Attempt budget: `maxAttempts` is required, an integer 1..3 (3 = one attempt per
   tier), with no default. Chains follow the fixed tier order, never revisit a
   candidate and never skip a tier.
4. A permitted reason counts only when a host-injected verifier (Tower evidence)
   returns exactly `true` for the bound reason record (task, snapshot, policy digest,
   parent plan, parent candidate, parent refusal digest, reason, evidence digest,
   attester). No verifier, a throw or any other value refuses.
5. Requested width 1 is the standard K3 scalar, so its first attempt is tier 2 and its
   only alternative is tier 3. Widths 32/64/256 need `workloadClass: SCIENCE`
   (owner input: non-science work uses binary, a single K3 trit and 8-bit at the API
   edge); GENERAL with a wider width refuses `TP_ALT_WIDTH_NOT_OPTED_IN`. Widths 8/16
   are not registered and refuse; registering them is not done here.
6. A tier-3 proposal carries binary-carrier constraints only (at least 2 bits per trit,
   fourth code refuses, UNKNOWN collapses only at the final permission boundary).
   Tri-Pipe names no binary profile; SLIDE refuses admission while none is registered.

```text
[x] Bind each alternative proposal to the parent attempt identity, the candidate identity and one permitted reason from the admitted task policy
    Permitted reasons are authenticated candidate-local unavailability or incompatibility with no prior effect; DENY, revocation, invalid
    evidence, unknown outcome, partial effects and cleanup failure produce no alternative proposal.
    src/alternative-proposal.ts proposeAlternative: parent link (planIdentity, attemptIndex, refusalCode kept verbatim, refusalDigest,
    reason, reasonEvidenceDigest) bound into the new planIdentity; TP_ALT_PRIOR_OUTCOME_TERMINAL / TP_ALT_PRIOR_EFFECT_NOT_EXCLUDED;
    tests/alternative-proposal.test.mjs (three-tier chain, verifier binding, terminal outcomes, determinism). (Grok 2026-10-06; design calls 1-4)
[x] Refuse forged or unauthenticated reasons, task-policy substitution, dispatch bypass and unbounded or cyclic proposal chains
    Hostile tests: forged unavailability reason; reason not in the policy; swapped policy digest; proposal handed straight to an executor;
    chain past the policy bound or revisiting a candidate.
    TP_ALT_REASON_UNAUTHENTICATED (no verifier / false / truthy non-true / throw / forged digest), TP_ALT_REASON_NOT_PERMITTED,
    TP_ALT_TASK_POLICY_SUBSTITUTED, TP_ALT_SNAPSHOT_MISMATCH, TP_ALT_AUTHORITY_FIELD_PRESENT, dispatchTriPipeEngine refuses every input,
    TP_ALT_ATTEMPT_BUDGET_EXHAUSTED, TP_ALT_CHAIN_CYCLE, TP_ALT_CHAIN_INCONSISTENT; tests/alternative-proposal.test.mjs hostile cases.
    (Grok 2026-10-06; design calls 1-4)
[x] Propose alternatives only in the owner's three-tier order: requested trit-width profile -> standard Galerina Trit (K3) -> binary with the same task semantics
    Tier 3 only when Trit cannot be processed at all; binary keeps the task's K3 semantics and K3 still decides permission; no two-valued substitute
    or degraded-semantics candidate; no skipped tier. Order owner decided 2026-10-06 (16:52 BST).
    initialCandidate / nextCandidate fixed order; every candidate has semantics K3 and permissionDecidedBy K3; tier 3 only after a refused
    tier-2 parent in a consistent history; TP_ALT_NO_FURTHER_TIER after tier 3; tests/alternative-proposal.test.mjs. (Grok 2026-10-06; design calls 2, 3, 5, 6)
```
