# Docs/examples review vs the current compiler — punch-list (2026-06-25)

Owner asked to review docs + examples after the Int64 lift + the security fixes ("examples need updating").
Workflow `wf_9ca8f514-817` **compile-checked all 223 examples** with the current compiler (`node logicn.mjs
check/run`). It found that the biggest problems are **compiler bugs that break many examples at once**, not stale
prose — so most of the fix value is in the compiler, not the corpus.

> **Headline (223 examples):** ~35 fail on **one VALUESTATE-006 compiler bug**, 18 fail on a **lexer BOM bug**
> (now FIXED `41ba125`), 5 compute a **wrong VAT answer** (Decimal-is-f64 stub), 1 fails on a multi-line-string
> lexer limit, and a handful are genuinely stale vs new governance rules. Two single compiler fixes clear ~53
> example failures.

## P0 — broken NOW (ship-wrong or fail-to-compile)

| Issue | Count | Root cause | Fix | Status |
|---|---|---|---|---|
| **Leading UTF-8 BOM → LLN-PARSE-001** | 18 | lexer didn't strip a byte-0 BOM (EF BB BF) | strip BOM at byte 0 | **✅ FIXED `41ba125`** — also re-save the 18 files BOM-free (corpus cleanup, queued) |
| **VALUESTATE-006 false positive** | **~35** | the taint-**discharge** check recognizes `redact(x)`/`seal(x)` only as a DIRECT arg, NOT inside a record/array literal — so the *recommended* `AuditLog.write({ email: redact(email) })` pattern is REJECTED | make the discharge analysis recurse into record-literal field values + array elements | **task #37** (security checker — over-strict false-positive, safe direction; verify it still rejects a genuinely-unredacted field) |
| **Decimal-is-f64 → wrong VAT** | 5 | `Money × Decimal` / `Money ÷ Decimal` is stubbed to identity, so `calculateVat(100)` returns `100` not `20` — `check` says ✅ 0 errors, the answer is silently wrong | implement bigint-scaled Decimal arithmetic (or fail-closed `LLN-DECIMAL-UNLOWERABLE` until then) | **#33** (Decimal) — examples 001, 311, 319, 313, 455 |
| **Multi-line string in `intent{}`** | 1 (112) | the lexer terminates a string literal at a newline → the multi-line intent prose misparses (LLN-PARSE-003) | support multi-line strings in contract prose, OR the example uses a single-line intent | task #37 |

The VALUESTATE-006 list (verified `redact(` present, rejected for the record-literal pattern): 003, 087, 113, 120,
161, 173, 174, 175, 202, 208, 213, 214, 215, 226, 353, 360, 365, 451, 453, 459–463, 465, 468, 469, 471.

## P1 — genuinely stale vs new governance rules (example needs updating, not a bug)
- **LLN-GOV-007** (authority block needs a `reason`): 206, 213, 460 — add `reason "…"`.
- **LLN-TIER-001** (tier floor): 453.
- **LLN-GOV-010**: 353.
These post-date the examples; the example frontmatter says `expected_diagnostics: none / stable`, so update the
flow (add the now-required clause) AND/OR the frontmatter.

## The pattern worth noting
Most example "breakage" is the compiler being either **wrong** (Decimal silently no-ops — a shipped wrong answer,
the most embarrassing) or **over-strict** (VALUESTATE-006 / BOM / multi-line-string reject valid input). Only the
P1 set is genuinely "the example is out of date." So the review's main output is a **compiler fix list**, and the
corpus updates are secondary (BOM re-save + the P1 new-rule clauses).

## Actions
- ✅ BOM lexer strip (`41ba125`).
- **#37** (new): VALUESTATE-006 record-literal discharge recursion (highest example-impact, ~35) + multi-line
  intent string + BOM corpus re-save + the P1 stale-rule example updates.
- **#33**: Decimal arithmetic (the 5 wrong-answer examples are the concrete driver).

*Source: workflow `wf_9ca8f514-817` (2026-06-25), all 223 examples compile-checked against the live compiler.*

---

## RE-MEASURED 2026-06-26 (the 2026-06-25 numbers above are STALE — VALUESTATE-006 + BOM fixes landed)

Re-ran `node logicn.mjs check` over all 223 `docs/examples/**/example.lln`, comparing each example's
`expected_diagnostics` frontmatter to actual output. **TRUE state:** of the examples that declare
`expected_diagnostics: none`, **66 are clean, 87 genuinely drift** (the other ~70 are negative examples that
correctly emit their expected code). The VALUESTATE-006 record-redact false-positive is ALREADY FIXED (the
discharge analysis recurses into record-literal field values — `checkArgForProtectedAtAuditLog`,
value-state-checker.ts:1917-1929); 087/161 are clean. So that whole ~35 row is stale.

**The 87 drift, by cause:** SYNTAX-006 = 26 (top-level `let`) · TIER-001 = 24 (tier floor) · VALUESTATE-008 = 6 ·
HINT-COMPUTE-001 = 6 · GOV-002 = 6 · SYNTAX-008 = 4 · GOV-019 = 4 · PARSE-001 = 3 · GOV-007 = 3 · CONTEXT-001 = 2 ·
VALUESTATE-006/GOV-010/GOV-001 = 1 each.

**Root-cause finding (SYNTAX-006):** top-level `let` is (intentionally) disallowed, but the error's fix
suggestion was BROKEN — it advised "declare a compile-time `const`", yet top-level `const` is NOT a parser
feature (`LLN-PARSE-001: Unexpected keyword "const"`). **FIXED the message** (parser.ts:442 — now "a binding
lives inside a flow; move it into a flow body"). The canonical idiom (per passing examples 060/065/068) is a
`let` inside `pure flow example() -> T { … }`.

**FIXED 2026-06-26 (9 self-contained literal examples, wrapped in a flow, each verified clean):** 005, 008, 051,
052, 053, 054, 055, 056, 071.

**REMAINING #37 work (ongoing):** the other ~17 SYNTAX-006 examples reference undefined identifiers
(`user`/`price`/`email`) or have no initializer (tensors 079/080/082) — they need per-example reconstruction
(supply the referenced value as a flow param / define a minimal type), not a mechanical wrap. Then the
TIER-001 (24, bump the flow qualifier to the effect-required tier) + the smaller GOV/VALUESTATE/CONTEXT
categories. A good candidate for a dedicated verified workflow (each agent: reconstruct one example to compile
clean while preserving its `/// concept:`, gate on `node logicn.mjs check`).
