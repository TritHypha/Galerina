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
[SUPERSEDED] Tri-Fuse as a separate optimisation package. Reason: settled by RD-0855
    §4.3 and §11 item 14 unless the owner reopens it. Tri-Fuse keeps its bounded
    role as a backend-neutral, proof-constrained optimisation CONTRACT and is not
    a package. Optimising already-admitted bytes yields a new artifact that needs
    fresh SLIDE admission and a new VOK receipt. Tri-Pipe may only propose. No
    package is to be created here; a Tri-Fuse package needs the owner to reopen
    RD-0855. (Grok 2026-10-06, RD cited by id only.)
```

## RD-0855 admission-time alternatives (proposed 2026-10-06, owner decision pending)

These rows extend the `[!] HOLD SLIDE/VOK admission of a proposed route` row above
(L20). The proposal-only role is unchanged: Tri-Pipe never dispatches, admits or
authorises. A failed attempt keeps its typed refusal; an alternative is a new
proposal with a new plan identity, followed downstream by its own SLIDE admission
and a fresh VOK decision, lease and receipt. Owner decided 2026-10-06 (Phillip, 16:52 BST correction; supersedes the 15:21 "K3 or binary" wording), three-tier fallback order: (1) run at the requested trit-width profile (1/8/16/32/64/256 etc.); (2) only if that width cannot run, fall back to standard Galerina Trit (K3) logic; (3) only if Trit cannot be processed at all, fall back to binary implementing the same task semantics, with K3 still deciding permission (no different two-valued algorithm, no semantic degradation). Each step down is a separate, independently admitted attempt (fresh SLIDE admission, fresh VOK decision/lease, linked receipt); DENY, revocation, unknown outcome and partial effects never become a retry.
Task-policy issuer, coordinator package and retry budget are open owner decisions; unresolved = HOLD.
Src: RD-0855 (private; ID+line only) L23-31, L192-200, L335-351, L365-374, L488; codex-rd0855-fallback-astra-20261006-answer-01; galerina2-rd0855-astra-fallback-20261006.

```text
[HOLD] Bind each alternative proposal to the parent attempt identity, the candidate identity and one permitted reason from the admitted task policy
    Permitted reasons are authenticated candidate-local unavailability or incompatibility with no prior effect; DENY, revocation, invalid
    evidence, unknown outcome, partial effects and cleanup failure produce no alternative proposal.
[HOLD] Refuse forged or unauthenticated reasons, task-policy substitution, dispatch bypass and unbounded or cyclic proposal chains
    Hostile tests: forged unavailability reason; reason not in the policy; swapped policy digest; proposal handed straight to an executor;
    chain past the policy bound or revisiting a candidate.
[HOLD] Propose alternatives only in the owner's three-tier order: requested trit-width profile -> standard Galerina Trit (K3) -> binary with the same task semantics
    Tier 3 only when Trit cannot be processed at all; binary keeps the task's K3 semantics and K3 still decides permission; no two-valued substitute
    or degraded-semantics candidate; no skipped tier. Order owner decided 2026-10-06 (16:52 BST); row stays HOLD until the task-policy issuer and
    coordinator package are decided.
```
