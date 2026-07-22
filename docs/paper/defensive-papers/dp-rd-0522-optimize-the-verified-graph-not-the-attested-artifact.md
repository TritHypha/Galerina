# Optimize the verified graph, not the attested artifact — a fail-closed rule for compiler post-passes

**Disclosure ID:** DP-RD-0522 (landed in `docs/paper/defensive-papers/` 2026-07-22; number = the source RD id, verified free in the canonical index; traces to the graph-compression pipeline RD + RD-0456 Tri-Fuse) · **Date:** 2026-07-18 · **Type:** construction paper (prior-art disclosure — a design law + its shipped first instance) · **Provenance:** KB `galerina-rd-files-graph-compression-wasm-pipeline-and-tri-logic-refactoring-2026-07-18` + Tri-Fuse A shipped in the governed compiler; read-only verification — the IR is a semantic graph (GIR), the artifact is hashed **after** emission (`wasmHash`), and provability-gated gate elision ships as the first in-boundary pass (harness `verify-governance-algebra` SUITE 4, part of **169/169 — re-run green 2026-07-22**).

## Purpose
A governed / attested compiler hashes its output artifact and attests **that hash**; downstream admission trusts the hash. A tempting "secondary optimization pass" that rewrites the **emitted, hashed bytes** (a `wasm-opt`-style rewrite) is a **fail-open trap**: it produces bytes the verifier never checked, breaks any producer/consumer byte-parity, and a size/speed optimizer can **eliminate a security gate it believes is dead code**. We disclose the rule and the safe alternative.

## The rule
**Every code-reducing transform — dead-code elimination, common-subexpression sharing, inlining, gate elision — must run on the VERIFIED intermediate graph, BEFORE emission and hashing; never on the attested artifact, after.** Then, and only then:
1. the governance verifier **re-checks** the transformed graph;
2. the artifact is emitted and **hashed from** the transformed graph;
3. a **differential test** (interpreter == VM == compiled) plus **producer-twin byte-parity** cover the emission.
A post-hash rewrite has **none** of these guarantees.

## The safe construction (shipped first instance)
Provability-gated gate elision on the semantic graph: an operand of a governance conjunction that is **statically proven** to hold is elided by the **min-identity** (dropping a proven-true operand is semantically identity); a statically-**false** operand collapses to `DENY`; an **unproven** operand **keeps its runtime gate**. The discharge witness is a compile-time proof/constant, so **no runtime-dependent gate is ever elided** — fail-closed by construction. This is code reduction that *cannot* remove a live gate, because removal **requires proof** the gate is dead.

## Corollary — byte compression lives outside the boundary
Compressing the artifact for transport (gzip/brotli) must sit **outside** the attested boundary: the canonical attested bytes stay **uncompressed**; transport compression is applied and removed **around** the hash, never inside it — otherwise the attested identity depends on a decompressor, adding a decompress-before-verify surface (malformed-stream / decompression-bomb).

## Why this is safe to disclose (harm filter)
A **fail-closed design law + a safe construction** — it discloses **no weakness**; it *prevents* a class of fail-open. The general principle ("don't optimize after you attest") applies to any attest-then-ship system, and the disclosed system has **no** post-hash pass to attack. Same class as a fail-closed posture disclosure (helps nobody attack).

## Prior art (novelty disclaimed)
Reproducible builds, verified compilation (CompCert), subresource integrity, and the general "verify what you run" principle are established. **No novelty is claimed.** The disclosed *composition* — the explicit rule that **code-reducing passes live before the hash, on the verified graph**, with **provability-gated gate elision** as the fail-closed instance and the **transport-compression-outside-the-boundary** corollary — is recorded as prior art.

## Honest bound
The general graph-compression pass (CSE / hash-consing / reachability tree-shaking) is **design-stage**; the shipped instance today is the provability-gated gate elision. The rule holds regardless of build state; a fuller shipped pass would be a stronger, separate artifact.

## Declarations

- **Type / tier:** defensive publication (construction disclosure — a fail-closed design law + its shipped first instance; novelty disclaimed); no new cryptography, no new science; no performance number is claimed.
- **Authorship & AI assistance:** drafted with AI assistance under human direction; grounded in the cited KB graph-compression R&D and the shipped provability-gated elision with its machine-checked algebra suite.
- **Funding:** none.
- **Competing interests:** none.
- **Data / artifact availability:** in-repo — `ZTF-Knowledge-Bases/tools/verify-governance-algebra.mjs` (SUITE 4; part of 169/169, re-run 2026-07-22); the compiler's differential (interpreter == VM == compiled) and twin byte-parity gates are in the product repository.
- **Licence:** Apache-2.0.

*Contact hello@trithypha.dev.*
