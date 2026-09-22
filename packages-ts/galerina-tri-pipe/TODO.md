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
[!] HOLD Tri-Fuse as a separate optimisation package (RD-0855: not currently a package)
```
