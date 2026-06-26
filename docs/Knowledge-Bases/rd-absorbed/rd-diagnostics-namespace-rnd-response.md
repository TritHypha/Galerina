<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/diagnostics-namespace-rnd-response.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: galerina-diagnostic-namespace-ownership.md  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. Curated/integrated view: `galerina-diagnostic-namespace-ownership.md`. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# Diagnostic-Namespace Ownership — R&D response (3 test-harness patches)

**Status:** R&D response (2026-06-16). **Subject:** `Galerina/docs/Knowledge-Bases/galerina-diagnostic-namespace-ownership.md`
(the checked-invariant KB) + its harness `galerina-core-compiler/tests/diagnostic-namespace.test.mjs`.
**Boundary:** the Galerina repo is **off-limits to edit** from this R&D session — this doc is a *recommendation*
the owner applies there; nothing here modifies the compiler or its tests. **Why it matters here:** the
privacy-governance phase ([`privacy/privacy-governance-v0.md`](privacy/privacy-governance-v0.md) §3) adds
`SPORE-DP-*` / `SPORE-PRIVACY-*` codes that must register cleanly under exactly this invariant.

> **Verdict on the KB:** the design is sound — turning a documentation convention into a build-breaking
> invariant, with a **shrink-only `PENDING_REGISTRATION`** allowlist as the pragmatic bridge, is the right
> zero-trust move. Three tooling gaps keep it from being airtight; concrete patches below.

---

## Patch 1 — Reverse drift / orphaned codes (make the check **bidirectional**)
**Gap.** The invariant asserts **Source ──▶ Registry** (every emitted `SPORE-*` is registered). It does **not**
assert **Registry ──▶ Source**. So if a refactor deletes the code that emitted `SPORE-SECRET-005`, the registry
entry becomes **ghost documentation** — a documented code nothing emits, silently rotting.

**Fix.** Add the reverse assertion. Every `SPORE-*` in `compiler-diagnostics.md` must either be **found emitted in
the source tree** *or* carry an explicit **`[RETIRED]`** tag. This preserves the existing "never reuse a retired
number" rule (retired entries stay in the registry, tagged, so the number is never recycled).
```js
// diagnostic-namespace.test.mjs (addition)
const emitted   = scanSourceForCodes();          // set of SPORE-* in `code: "SPORE-..."` literals
const registered = parseRegistry();              // entries from compiler-diagnostics.md (with tags)
// forward (existing): every emitted code is registered or PENDING_REGISTRATION
for (const c of emitted) assert(registered.has(c) || PENDING.has(c), `unregistered emitted code ${c}`);
// reverse (NEW): every registered, non-retired code is still emitted
for (const e of registered.values())
  if (!e.tags.includes('RETIRED'))
    assert(emitted.has(e.code), `orphaned registry code ${e.code}: not emitted in source — add [RETIRED] or restore the emit`);
```
Effect: deleting an emit forces the developer to consciously `[RETIRED]`-tag the entry (number preserved, never
reused) instead of leaving ghost docs.

---

## Patch 2 — Dynamic string interpolation (codes MUST be static literals)
**Gap.** The scan relies on `code: "SPORE-..."` literals (AST/regex). It is blind to dynamic construction:
```js
const errorCode = `SPORE-PRIVACY-00${level}`;   // invisible to the conformance scan -> unregisterable, untrackable
```
This both evades registration **and** makes the namespace un-auditable (a code that only exists at runtime).

**Fix.** A **hard lint**: diagnostic codes must be **static string literals**. Dynamic generation or
interpolation that produces an `SPORE-*` prefix is a **fatal compiler error** (itself a registered diagnostic,
e.g. `SPORE-META-001` *type-check/lint*). The AST check:
```js
// lint pass: forbid non-literal SPORE-* code construction
// FAIL on: TemplateLiteral / BinaryExpression('+') whose (static prefix) starts with "SPORE-"
//          when used as a `code:` property value or passed to the diagnostic emitter.
if (node.type !== 'Literal' && reachesDiagnosticEmitter(node) && startsWithLLN(staticPrefixOf(node)))
  fatal('SPORE-META-001', 'diagnostic code must be a static string literal; dynamic SPORE-* construction is forbidden');
```
This guarantees the Patch-1 scan sees **every** code, and keeps the namespace a static, auditable API surface.

---

## Patch 3 — Split-brain governance registry (single source of truth)
**Gap.** `compiler-diagnostics.md` is canonical; `galerina-governance-rules.md` is the governance subset. The same
data in two markdown files **drifts** (severity updated in one, not the other).

**Fix (use the `Mechanism tag` as the join key).** Assert that any canonical entry whose mechanism is a
governance mechanism **must** appear in the governance file, with matching severity/enforce-status:
```js
const GOV_MECHS = new Set(['governance-verifier', 'dataflow-taint']);   // + others as the model grows
const gov = parseGovernanceRules();                                     // galerina-governance-rules.md
for (const e of registered.values())
  if (GOV_MECHS.has(e.mechanism)) {
    assert(gov.has(e.code), `governance code ${e.code} missing from governance-rules.md`);
    assert(gov.get(e.code).enforce === e.enforce, `enforce-status drift for ${e.code}`);
  }
```
**Better (eliminate the human sync entirely):** **generate** `galerina-governance-rules.md` from the canonical
registry at build time (filter by `GOV_MECHS`), so the subset is *derived*, not maintained. The test then
asserts the generated file equals the committed one (drift = stale generated file = build break).

---

## How these compose with the privacy phase
The new `SPORE-DP-*` / `SPORE-PRIVACY-*` codes (privacy-governance §3) are introduced **with mechanism tags**
(`effect-check`, `dataflow-taint`, `declarative-clause`) precisely so that: Patch 1 confirms they are emitted
(not orphaned), Patch 2 forces them to be static literals, and Patch 3 auto-routes the `dataflow-taint` /
governance ones into `governance-rules.md`. The discipline and the new privacy codes are designed to fit.

## Acceptance (what "airtight" means here)
1. Bidirectional conformance: an orphaned registry code fails the test until `[RETIRED]`-tagged.
2. Static-literal lint: a `\`SPORE-...${x}\`` anywhere on the emit path is a fatal compile error.
3. Governance subset is generated/derived (or asserted-consistent) from the canonical registry — no manual sync.
With these three patched into `diagnostic-namespace.test.mjs` (+ the lint pass), the namespace is a strict,
testable, auditable API surface — and the 87 `PENDING_REGISTRATION` codes can be reconciled shrink-only without
new drift creeping in behind them.

## Sources / refs
`galerina-diagnostic-namespace-ownership.md` (the reviewed KB), `galerina-design-stability-and-forward-planning.md`
§5, `galerina-governance-rules.md`, `compiler-diagnostics.md` (all in `Galerina/docs/Knowledge-Bases/`, read-only
here). Companion: [`privacy/privacy-governance-v0.md`](privacy/privacy-governance-v0.md) §3 (the new codes).
