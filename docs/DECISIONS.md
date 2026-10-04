# Decisions

This file records important project decisions.

## Decision Template

### Decision Title

**Date:** YYYY-MM-DD

**Status:** Proposed / Accepted / Rejected / Replaced

**Context:**

Describe the situation.

**Decision:**

Describe the decision.

**Reason:**

Explain why this decision was made.

**Consequences:**

Describe the impact of the decision.

---

## Decisions

### Keep Low-Bit AI Syntax Backend-Neutral

**Date:** 2026-05-08

**Status:** Accepted

**Context:**

Microsoft BitNet provides optimized 1-bit/1.58-bit LLM inference, with
CPU-focused support that is useful when GPU, NPU or other accelerators are not
available. BitNet b1.58 uses ternary weights, which resembles Galerina `Tri` values
but does not have the same language-level meaning.

**Decision:**

Galerina will model low-bit AI as a generic compute target through `low_bit_ai` and
`ternary_ai`. BitNet is an optional backend inside `galerina-ai-lowbit`, not a source
syntax target and not part of `galerina-core` or `galerina-core-logic`. Generic AI inference
contracts belong in `galerina-ai`. CPU fallback planning belongs in `galerina-target-cpu`,
and optimized CPU kernel contracts belong in `galerina-cpu-kernels`.

**Reason:**

This keeps Galerina CPU/binary compatible by default while allowing a faster local AI
path for compatible low-bit models. It also avoids locking Galerina source syntax to
one named backend that could later be replaced. Language semantics stay in
`galerina-core` and `galerina-core-logic`, while AI inference and CPU kernel concerns live in
dedicated packages.

**Consequences:**

Compute policies may select `low_bit_ai` or `ternary_ai` as AI inference
fallbacks and must report the selected backend. AI output remains untrusted by
default and cannot directly authorize high-impact actions.

---

### Keep Project Graph Backends Swappable

**Date:** 2026-05-08

**Status:** Accepted

**Context:**

Graphify-style tooling can help Galerina generate project knowledge graphs from code,
docs and other project material. However, Graphify is an implementation choice
that may be replaced by another graph tool or Galerina-native scanner later.

**Decision:**

Galerina will expose generic project graph commands and contracts such as `Galerina graph`,
graph nodes, graph edges, graph reports and graph backend policy. Graphify may
be used as an optional backend, including from a pinned Git package, but it must
not become Galerina syntax or a required CLI command.

**Reason:**

This keeps Galerina project graph output stable while allowing the underlying graph
backend to change. It also prevents AI/tooling support from becoming a compiler
or runtime authority.

**Consequences:**

Project graph backends must be selected by policy. Git-sourced backends must be
explicitly allowed and pinned. Model-assisted extraction remains opt-in and
reported.

### RD-0349 Value-Unit Open Choices: Zero-Trust Defaults

**Context:**

RD-0349 (value-unit types: `Money<C>`, `Commodity<U>`, `Crypto<T>`) left four owner choices open:
where precious metals live, which cryptocurrencies are admitted, whether a rounding default or
per-contract override exists, and whether to build `Security<ISIN>`. On 2026-10-04 the owner asked
for these to be implemented using zero-trust, security-first defaults. Each default below is labelled
**zero-trust default, owner may revisit**.

**Decision:**

- D1 metals: XAU/XAG/XPT/XPD are never `Money`. They refuse at compile time (FUNGI-TYPE-032) and in
  `Money.of` until `Commodity<U>` ships with a sourced, pinned scale policy.
- D2 crypto: the curated crypto set is empty. No ticker is admitted as `Money`, and `Crypto<T>` does
  not exist until the owner admits a pinned registry snapshot in which every entry carries its ISO 24165 DTI.
- D3 rounding: there is no default rounding mode and no per-contract override. Every inexact Money step
  names its mode at the call site, and an unrecognised alias refuses (UnknownRoundMode).
- D4 ISIN: `Security<ISIN>` is tracked, not built. An ISIN is never a currency tag.
- D5 names: `Commodity`, `Crypto` and `Security` are reserved now (FUNGI-NAME-002 for type/record/enum,
  FUNGI-HALLMARK-001 for hallmark mints), exact names only.

**Reason:**

A wrong scale or a guessed rounding mode is a silent money-arithmetic bug, and a ticker is not an
identity. Refusing until each choice is sourced and explicit keeps every failure loud. Reserving the
planned names closes the window in which a user type could pose as the governed one.

**Consequences:**

D1, D3 and D4 pin behaviour the compiler already had. D5 adds the three names to the reserved sets
(the only behaviour change). The pins live in
`packages-ts/galerina-core-compiler/tests/rd-0349-zero-trust-defaults.test.mjs`. Relaxing any default
is an owner decision that must update that test.
