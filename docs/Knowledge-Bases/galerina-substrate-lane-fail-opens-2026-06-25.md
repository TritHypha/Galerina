# Substrate-lane fail-opens found + fixed (2026-06-25)

Two real fail-opens in the `substrate {}` crypto-on-noisy-lane gate (`SPORE-SUBSTRATE-001`), both
surfaced while building the `examples/gaming-substrate/` worked example (the owner's *"could we add
`lane: gaming`"* prompt). Each let a crypto effect run on a tolerance-bounded photonic/noisy lane
**undetected** — the precise thing `SPORE-SUBSTRATE-001` exists to prevent. Both fixed; both pinned
by regression tests. Same family as the threat-model C1/H2 seam and the RD-0093 `;;`-comment
fail-open: *the gate is right; the dispatch/parse misses a case.*

## Fix 1 — PQ-suffixed crypto effects escaped the crypto-on-core matcher

**Bug.** `CRYPTO_EFFECT = /^crypto\.(hash|sign|verify|encrypt|decrypt|seal)$/` was `$`-anchored.
A **certified** deployment profile *mandates* a post-quantum signature — bare `crypto.sign` is
rejected by `SPORE-CRYPTO-PQ-001`, forcing `crypto.sign.hybrid` / `crypto.sign.mldsa65` /
`crypto.sign.slhdsa`. None of those match the `$`-anchored regex, so the crypto-on-core gate
(`substrate-inference.ts` B1) **did not fire** on a PQ signature placed on a photonic lane. The
fail-open lived in exactly the highest-assurance posture (certified).

Empirical (pre-fix): `crypto.sign` on photonic → `SPORE-SUBSTRATE-001` ✓; `crypto.sign.hybrid` on
photonic → **no `SPORE-SUBSTRATE-001`** ✗.

**Fix.** Match the whole crypto family fail-closed — `(\.|$)` instead of `$`:
`/^crypto\.(hash|sign|verify|encrypt|decrypt|seal)(\.|$)/`. Matches `crypto.sign` and any
`crypto.sign.<alg>` / `crypto.seal.<alg>`; still rejects `crypto.signXXX` (no `.`/end after the
head). Integrity is never tolerance-bounded, so there is no crypto sub-variant legitimate on a
noisy lane — matching the family is correct, not over-broad. Applied in **both** copies of the
regex: `substrate-inference.ts:65` (security-critical) and `test-generator.ts:264` (consistency).

## Fix 2 — a malformed lane was silently inert (early-return before the malformed check)

**Bug.** `parseLaneField` fails an unrecognised lane keyword **closed** to
`{ value: "digital", malformed: true }` (spec §8: never silently coerce). But
`checkSubstrateViolations` ran `if (inf.lane === "digital") return []` **before** the
`if (inf.malformed)` check. So a malformed lane — value forced to `"digital"` — hit the digital
early-return and was swallowed: no `SPORE-SUBSTRATE-002`, and the crypto-on-noisy gate dropped.

Two ways to trigger it:
- **`lane: gaming`** (the literal idea) → compiled **clean**, the whole substrate block ignored.
- **A trailing `//` comment on a field line.** The parser does not strip an end-of-line comment
  inside a `substrate {}` decl; it captures it into the value (`decl:lane : photonic // optical
  accelerator`). `fieldSegment` then reads `"photonic // optical accelerator"` ≠ `"photonic"` →
  malformed → "digital" → swallowed. A `crypto.sign` flow on that "photonic" lane passed clean.

**Fix.** Move the `if (inf.malformed)` block **above** the `if (inf.lane === "digital") return []`
early-return in `checkSubstrateViolations` (`substrate-inference.ts`). A malformed lane now emits
`SPORE-SUBSTRATE-002` (error) instead of masquerading as an author-chosen inert digital lane. The
diagnostic message + suggestedFix now name the `lane` value set and the trailing-comment gotcha.

Empirical (post-fix): `lane: gaming` → `SPORE-SUBSTRATE-002` ✓; `lane: photonic // comment` +
`crypto.sign.hybrid` → `SPORE-SUBSTRATE-002` (build fails closed) ✓; clean `lane: photonic` +
`crypto.sign.hybrid` → `SPORE-SUBSTRATE-001` ✓.

## Residual (tracked, not a security hole)
The root cause behind Fix 2's comment case is that **trailing `//` comments are not stripped inside
contract sub-block decls** (`parseContractSubBlock`). Fix 2 makes that fail **closed** for
substrate (the build errors), so it is safe; but it is an ergonomic wart (and the same leak is
cosmetic in other sub-blocks). A proper lexer/parser fix to strip end-of-line comments from
sub-block decl values is a deferred follow-up — flagged for review rather than changed broadly
while unsupervised. Workaround documented in the example README: comments on their own line.

## Verification
- `substrate-contracts.test.mjs`: **38 pass / 0 fail** (was 30; +8 regression tests covering the
  three PQ sign variants on photonic vs digital, `lane: gaming` → `-002`, and the comment-polluted
  lane failing closed).
- `examples/gaming-substrate/` — all three `.spore` verified with `node galerina.mjs check` to match
  their `expected_diagnostics` headers (01 clean, 02 clean, 03 `SPORE-SUBSTRATE-001`).

*Source: this session (2026-06-25), full-auto. Both fixes in `galerina-core-compiler/src`
(`substrate-inference.ts`, `test-generator.ts`) + tests; example dir `examples/gaming-substrate/`.*
