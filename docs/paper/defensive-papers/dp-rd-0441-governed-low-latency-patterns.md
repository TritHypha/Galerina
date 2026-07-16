# Governed low-latency patterns: the seqlock queue, copy-not-pointers, self-describing signed headers, and the kernel-bypass boundary rule

**Disclosure ID:** DP-RD-0441 · **Date:** 2026-07-16 · **Type:** defensive publication (prior-art disclosure — NOT a patent claim) · **Provenance:** KB RD-0441 (source-mining table; the underlying idioms are cited there to their public sources) · RD-0443 (the improvement designs). Design-stage; no performance number is claimed.

## Purpose
The low-latency toolbox — lock-free queues, shared-memory fan-out, kernel bypass, zero-copy framing — is usually presented *without* a governance story, and governed systems usually avoid it as ungovernable. This publication records four constructions showing the two are compatible: each pattern keeps its speed shape while the trust boundary it touches is made explicit and fail-closed.

## The constructions
1. **The governed seqlock queue.** A bounded, single-writer/many-reader shared-memory queue where the reader re-checks the write counter after copying: a torn read is **detected and retried, never served** — verify-before-use at the memory layer (the fail-closed third state: `torn → re-verify`). Governance additions: the queue is *bounded and non-blocking by contract*, so one slow or crashed consumer cannot stall the producer or its other consumers (blast-radius isolation; resource exhaustion refused by construction); consumers are enumerable, so per-consumer egress redaction applies to what each may read.
2. **Copy-not-pointers framing.** Messages crossing a process or zone boundary carry **self-contained typed values, never references**. A frame that *is* the data cannot dangle, alias another process's memory, or be re-interpreted after the fact — the transport-layer form of typed-leaf injection-proofness, and the price (a bounded copy) is paid knowingly.
3. **Self-describing signed headers.** Every shared-memory or stream protocol opens with a magic identifier and a minor/major version. Wrong-protocol bytes are **detected, not interpreted**; an unknown version routes to **quarantine**, never to a best-effort parse; version evolution is a signed schema change. This closes the mis-mapped-protocol class (reading the wrong shared segment as if it were yours) structurally.
4. **The kernel-bypass boundary rule.** Userspace networking removes the kernel from the datapath — which **moves the trust boundary into userspace**; it does not remove it. The rule disclosed: a bypass lane must re-establish at the userspace edge every control the kernel path provided (admission, rate/resource ceilings, audit), and protected-class data never rides a lane that hasn't. Bypass is a *placement* choice under an assurance profile; placement is never authority.

## Prior art (novelty disclaimed)
Seqlocks, SPMC ring buffers, and shared-memory IPC are established systems practice; zero-copy and message-passing-by-value are established; magic numbers and versioned protocol headers are as old as file formats; userspace networking stacks and their deployments are established — **no novelty is claimed over any of them** (the mined public sources are cited in the provenance RD). The disclosed contribution is the governance composition: torn-read-as-third-state, boundedness-as-contract with per-consumer redaction, typed-value framing as a boundary rule, quarantine-on-unknown-version, and the bypass-moves-the-boundary rule — recorded as prior art.

## Honest bound
None of these make governance free: the seqlock retry costs under write contention; copying costs what it copies; the bypass lane's re-established controls cost what the kernel's did. The claim is that the *fail-closed shape survives at low latency* — every actual number is deferred to measured benchmarks on named hardware (a latency lane exists for exactly that), and the bypass lane remains hardware/deployment-gated and optional.

*Contact hello@trithypha.dev.*
