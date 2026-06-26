# Galerina — Deterministic Self-Host Verification

**Status:**
```
Stage B — Architectural Proposal (suggestion)
Priority: HIGH — without this, a compiler bug can reproduce itself indefinitely
Principle: Same source + same inputs + same configuration = byte-for-byte identical output
```

**TL;DR:**
- The self-hosted compiler must produce identical output on repeated compilation of itself
- Build B1 compiled by Stage A, Build B2 compiled by B1 — B1 == B2 == B3 proves stability
- Compare not just output JS but: Semantic Graph Hash + Typed AST Hash + Output Hash + Execution Proof Hash

---

## The Self-Hosting Problem

When a compiler compiles itself, correctness bugs have a compounding effect that does not exist in ordinary software. A bug in the compiler propagates into the next version of the compiler, which then compiles the next version with the same bug, which was compiled by the bugged version, and so on.

Three specific failure modes matter for Galerina:

**Silent bug reproduction.** A type-checking error, an incorrect optimisation, or a malformed output can persist across every subsequent build without ever surfacing as a test failure. The output compiles and runs. The bug simply continues.

**Governance violation propagation.** Galerina's governance model — effect checking, capability enforcement, boundary verification — is enforced by the compiler. If the compiler itself has a governance bug, it may emit output that would fail its own rules, and then compile that output without noticing, because the checker has the same bug.

**Thompson Trust attack surface.** Ken Thompson's 1984 paper demonstrated that a compiler can be modified to insert malicious code into programs it compiles — including into itself — such that removing the malicious source code does not remove the malicious behaviour from compiled output. Deterministic verification substantially narrows this attack surface by making any non-determinism visible.

---

## Core Principle

The self-hosted compiler must produce **byte-for-byte identical output** when given the same source files, the same inputs, and the same configuration.

"Functionally equivalent" is not sufficient. "Mostly the same" is not sufficient. "Passes all tests" is not sufficient.

Byte-for-byte identity means that any divergence — a reordered function, a different temporary variable name, a changed comment in generated output — is treated as a build failure requiring investigation.

This is a strong requirement. It demands that every source of non-determinism in the compiler be identified and eliminated. That work is the substance of this document.

---

## Verification Model

The verification procedure uses three successive builds.

```
Stage A Compiler (bootstrap, written in JS/TS)
    |
    | compiles Galerina compiler source
    v
Build B1
    |
    | compiles Galerina compiler source (same source, same config)
    v
Build B2
    |
    | compiles Galerina compiler source (same source, same config)
    v
Build B3

Verification: B1 == B2 == B3
```

**Stage A** is the bootstrap compiler. It may be written in TypeScript or another host language. It does not need to be deterministic relative to itself — it is not being verified.

**B1** is the first self-hosted build. It is produced by Stage A compiling the Galerina compiler source.

**B2** is produced by B1 compiling the same Galerina compiler source with the same configuration.

**B3** is produced by B2 compiling the same Galerina compiler source with the same configuration.

If B1 == B2, the self-hosted compiler is deterministic relative to Stage A output. If B2 == B3, it is deterministic relative to itself. Both must hold.

B1 == B2 == B3 is the stability proof.

---

## SHA-256 Multi-Hash Comparison

Comparing only the final output file is insufficient. A bug that introduces non-determinism at an intermediate stage may cancel itself out in output (unlikely but possible). The verification compares four independent hashes:

| Hash | What it covers | Why it matters |
|---|---|---|
| `SemanticGraphHash` | The compiler's internal semantic graph after all passes | Detects non-determinism in analysis, even if output happens to match |
| `TypedASTHash` | The typed AST before IR lowering | Detects non-determinism in type-checking |
| `GeneratedOutputHash` | The final emitted output (JS or target bytecode) | The primary artefact comparison |
| `ExecutionProofHash` | The execution proof chain produced alongside the output | Detects non-determinism in governance verification |

All four hashes must match across B1, B2, and B3. A match on `GeneratedOutputHash` alone does not constitute a passing verification.

The SHA-256 algorithm is used for all four hashes. No hash truncation.

---

## Sources of Non-Determinism to Eliminate

The following are known sources of non-determinism in compiler implementations. Each must be explicitly addressed before verification can be expected to pass.

**Current time in output.** Any build timestamp, compilation date, or time-derived value embedded in output will cause every build to differ. Eliminate: do not embed time in output. If a timestamp is required for provenance, it must be supplied as an explicit input parameter (not read from the system clock during compilation).

**Random values in codegen.** Unique identifiers, gensyms, or temporary names generated using random number seeds will differ across builds. Eliminate: use deterministic counters seeded from source content, or use content-derived hashing for generated names.

**Hash map iteration order.** In most languages, hash map iteration order is intentionally randomised to prevent algorithmic complexity attacks. A compiler that iterates a hash map and emits output in iteration order will produce non-deterministic output. Eliminate: sort all collections before emission. Use ordered maps for any collection whose iteration order affects output.

**Filesystem enumeration order.** Listing directory contents returns files in filesystem-dependent order, which varies by OS, filesystem type, and mount state. Eliminate: sort all file lists explicitly before processing.

**Parallel scheduling order.** If the compiler uses parallel workers and their output is merged in completion order, builds will differ based on scheduling. Eliminate: merge parallel output in source-deterministic order (e.g., sorted by source file path), not in completion order.

---

## Build Proof Integration

The verification procedure extends the `ExecutionProofChain` from `SPORE-Graph` with compiler-specific fields. Each build produces a proof record:

```
CompilerBuildProof {
  compilerVersion:  String        -- version string of the compiler that produced this build
  compilerHash:     SHA256        -- hash of the compiler binary/source that ran
  sourceHash:       SHA256        -- hash of all source files passed as input
  outputHash:       SHA256        -- GeneratedOutputHash for this build
  deterministicFlag: Bool         -- true if this build was verified against a prior build
  semanticGraphHash: SHA256       -- SemanticGraphHash for this build
  typedASTHash:      SHA256       -- TypedASTHash for this build
  executionProofHash: SHA256      -- hash of the proof chain itself
}
```

When `galerina verify-selfhost` runs, it produces three `CompilerBuildProof` records (one per build) and asserts that all hash fields match across the three records. The comparison result is written to the governance log.

The `deterministicFlag` field is `true` only when the current build has been verified against at least one prior build of the same source. A build produced by Stage A alone has `deterministicFlag: false` until B1 is compared against B2.

---

## Thompson Trust Attack

The Thompson Trust attack (from "Reflections on Trusting Trust", Ken Thompson, 1984) demonstrates that a compiler can be modified to:

1. Recognise when it is compiling a login program and insert a backdoor.
2. Recognise when it is compiling itself and insert the same backdoor-insertion code.

The result is that removing the backdoor from the compiler source does not remove it from compiled binaries. The source is clean; the compiler is not.

Deterministic self-host verification improves detection capability but does not fully eliminate the attack. If the Stage A bootstrap compiler has been compromised and B1 carries the compromise forward, then B2 and B3 will also carry it — and B1 == B2 == B3 will still hold.

What deterministic verification does provide:

- Any non-deterministic behaviour (including imperfectly implemented attacks) is immediately visible.
- The attack must be perfectly self-replicating. Imperfect replication causes hash divergence.
- Multiple independent bootstrap paths (compiling Stage A from a different host language, comparing results) can detect a consistently-replicating compromise.

The limitation is acknowledged. Full elimination of the Thompson Trust attack requires diverse double compilation (DDC) with multiple independent bootstrap compilers, which is out of scope for Stage B.

---

## SPORE-BUILD-001: NON_DETERMINISTIC_BUILD

```
Code:     SPORE-BUILD-001
Name:     NON_DETERMINISTIC_BUILD
Severity: ERROR (blocks release)
```

**Trigger condition:** `galerina verify-selfhost` detects that the same source files, same configuration, and same compiler binary produce different output on two successive builds. Specifically: any of `SemanticGraphHash`, `TypedASTHash`, `GeneratedOutputHash`, or `ExecutionProofHash` differ between B1 and B2, or between B2 and B3.

**Effect:** The build is marked non-deterministic. No `CompilerBuildProof` with `deterministicFlag: true` is issued. The diagnostic is written to the governance log with the specific hash fields that diverged.

**Resolution:** Identify the source of non-determinism (see the sources listed above), eliminate it, and re-run verification.

**Not triggered by:** Builds that differ because source files differ, configuration differs, or the compiler version differs. `SPORE-BUILD-001` is specifically about same-input → different-output.

---

## galerina verify-selfhost Command

The `verify-selfhost` subcommand runs the full verification pipeline.

**Pipeline:**

```
1. Build B1
   - Use Stage A compiler (or specified bootstrap compiler)
   - Compile Galerina compiler source at HEAD
   - Record CompilerBuildProof for B1

2. Build B2
   - Use B1 as the compiler
   - Compile the same Galerina compiler source (same commit, same config)
   - Record CompilerBuildProof for B2

3. Compare B1 and B2
   - Assert SemanticGraphHash(B1) == SemanticGraphHash(B2)
   - Assert TypedASTHash(B1) == TypedASTHash(B2)
   - Assert GeneratedOutputHash(B1) == GeneratedOutputHash(B2)
   - Assert ExecutionProofHash(B1) == ExecutionProofHash(B2)
   - If any assertion fails: emit SPORE-BUILD-001, stop

4. Build B3
   - Use B2 as the compiler
   - Compile the same Galerina compiler source
   - Record CompilerBuildProof for B3

5. Compare B2 and B3
   - Same four assertions
   - If any assertion fails: emit SPORE-BUILD-001, stop

6. Generate Proof
   - All six hash comparisons passed
   - Issue CompilerBuildProof with deterministicFlag: true
   - Write to governance log
   - Output proof summary to stdout
```

**Exit codes:**
- `0` — all comparisons passed, proof issued
- `1` — `SPORE-BUILD-001` triggered, proof not issued
- `2` — build failure unrelated to determinism (compilation error in compiler source)

---

## Stage B Scope

**Do in Stage B:**
- Implement B1 → B2 verification (two-build comparison)
- Implement `GeneratedOutputHash` and `TypedASTHash` comparison
- Implement deterministic ordering for all collections that affect output
- Implement `galerina verify-selfhost` command with the pipeline described above
- Implement `SPORE-BUILD-001` diagnostic
- Emit `CompilerBuildProof` records

**Extend after Stage B:**
- B2 → B3 comparison (three-build full stability proof)
- `SemanticGraphHash` comparison (requires stable serialisation of the semantic graph)
- `ExecutionProofHash` comparison (requires full proof chain integration)
- Diverse double compilation for Thompson Trust mitigation
- Cryptographic attestation of build proofs (signing with a key)
- Formal proofs of compiler correctness (out of scope for any near-term stage)

The Stage B goal is a working two-build comparison that catches the most common sources of non-determinism and produces a machine-readable proof record.

---

## Relationship to Root Capability Provider

The self-hosted compiler's output is only deterministic if the compiler's execution environment is also deterministic. The `CompilerRootBoundary` (see `galerina-stage-b-root-capability-provider`) must provide identical authority on every run:

- The same capability registry, with the same capabilities in the same order.
- The same builtin type table.
- The same compiler configuration flags.
- No ambient authority that varies between runs (system time, environment variables not passed as explicit inputs).

If the root capability provider supplies different authority on different runs, the compiler may make different decisions, and the output will diverge. `SPORE-BUILD-001` will fire, but the root cause will be in the capability provider, not in the compiler logic itself.

This is why the root capability provider is listed as a dependency: identical authority is a prerequisite for identical output.

---

## Rules at a Glance

1. Same source + same inputs + same configuration must produce byte-for-byte identical output.
2. Verification requires three builds: B1 (from Stage A), B2 (from B1), B3 (from B2).
3. Compare four hashes: SemanticGraph, TypedAST, GeneratedOutput, ExecutionProof.
4. All four must match across B1 == B2 == B3.
5. Eliminate: timestamps in output, random codegen names, hash map iteration order, unsorted filesystem enumeration, completion-order parallel merging.
6. `SPORE-BUILD-001` fires when same-input → different-output is detected.
7. Deterministic verification narrows the Thompson Trust attack surface but does not eliminate it.
8. The root capability provider must supply identical authority on every run.
9. Stage B delivers two-build comparison and output hashing. Three-build and formal proofs are post-Stage B.

---

## See Also

- `galerina-stage-b-root-capability-provider` — root capability ownership and authority model
- `galerina-compiler-phase-memory-boundaries` — phase arena model (memory determinism per phase)
- `galerina-proof-chain-spec` — ExecutionProofChain specification (`proof-chain`)
- `galerina-roadmap` — stage sequencing and priorities
