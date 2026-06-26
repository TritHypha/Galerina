# R&D (notes/59) — the 10 classic JavaScript bad-design quirks vs Galerina (2026-06-25)

Owner asked (notes/59): for each classic JS footgun — (1) does it exist in Galerina? (2) act on it? (3) does a
fix cause another issue? (4) worth it for devs/AI? (5) runtime consequence? (6) ZT-score the change? (7) what
does the architecture let us do? — *"I'm sure we did something very early on to check against these."*
Researched **verify-before-build** against the actual lexer/parser/type-checker/interpreter (workflow
`wf_b9fd9ee5-11a`, 10 agents + synthesis).

**Headline: Galerina structurally avoids 7 of 10 by design, 2 are partial-but-mitigated, 1 is a genuine gap.**
The owner's suspicion is *correct, and in our favour* on most rows — the early decisions (distinct types,
deny-by-default `+`, typed strict `==`, no `null`, no `var`/`this`/ASI) were the zero-trust ones. **9 of 10
need no runtime change; only NaN warrants a real build.**

## Owner-requested table

| # | JS quirk | Exists in Galerina? | Galerina behavior + evidence | Should fix? | ZT |
|---|----------|-------------------|----------------------------|-------------|----|
| 1 | `0.1+0.2 !== 0.3` (one IEEE Number) | **PARTIAL** | Int/Int64 exact+trapping immune; Float is a thin JS-double wrapper (`float +,-,*,/` raw JS, interpreter.ts:176-179); **Decimal type distinct but 0 arithmetic dispatch entries** (declared-but-unwired) | CONSIDER | 78 |
| 2 | `+` coercion (`"1"+1="11"`, `[]+{}`) | **NO-BY-DESIGN** | `+` not overloaded: SPORE-TYPE-004 rejects mixed String/non-String (type-checker.ts:1520-1584); BINARY_DISPATCH has no `string+int` key; no ToPrimitive | ALREADY-SAFE | 98 |
| 3 | Loose `==` (`"0"==0`, non-transitive) | **NO-BY-DESIGN** | one typed strict `==`; `logicNValuesEqual` returns false on tag mismatch first (stdlib.ts:1342); no coercion → transitive. Compile-layer: cross-type `==` only warned (non-blocking) | CONSIDER (lint) | 90 |
| 4 | NaN: `typeof NaN="number"`, `NaN!==NaN` | **YES** | the one inherited gap: Float `/` raw JS (no checked-div vs Int's i32DivChecked), `0.0/0.0`=NaN/no-trap; Float `==`=JS `===` so `nan==nan`=false survives; **value-state-checker has ZERO NaN/Infinity awareness** | **YES** | 38 |
| 5 | `typeof null === "object"` | **NO-BY-DESIGN** | no `typeof`; `null`/`undefined` rejected at compile (SPORE-TYPE-008); absence = nominal `Option<T>/None` | ALREADY-SAFE | 98 |
| 6 | `[1,2,10,21].sort()→[1,10,2,21]` | **NO-BY-DESIGN** | `sort` type-aware: both-string→localeCompare else `numVal(a)-numVal(b)` (stdlib.ts:606-612); ints stay numeric | ALREADY-SAFE | 95 |
| 7 | Hoisting + `var` leaks | **NO-BY-DESIGN** | no `var`/hoisting; use-before-declare=SPORE-NAME-001, lexical block scope, redeclare=SPORE-NAME-002 (symbol-resolver.ts) | ALREADY-SAFE | 98 |
| 8 | `this` binding chaos | **NO-BY-DESIGN** | no `this`/`class`/`new`/`bind`; `receiver.method()` is parser sugar → static callExpr; records are field-only data — nothing to rebind | ALREADY-SAFE | 96 |
| 9 | ASI + truthiness traps | **PARTIAL** | ASI does NOT exist (`;`/newline unconditional separators); truthiness present-but-narrowed (if/while coerce via explicit set; type-checker doesn't gate conditions on Bool) but no null/quiet-NaN | CONSIDER (lint) | 88 |
| 10 | No real ints / 2^53 wall + num↔str | **NO-BY-DESIGN** | distinct Int/Int8-64/UInt/Float; Int64=exact bigint re-read from raw text (dodges parseInt 2^53 round); no implicit num↔str (SPORE-TYPE-004) | ALREADY-SAFE | 95 |

## Genuine gaps worth acting on (only one is a real build)

1. **[BUILD — runtime] NaN/Infinity on scalar Float (#4, ZT 38)** — the one true inherited quirk. The Int path
   was hardened to TRAP (i32/i64-arith.ts), the Float path was left as bare JS `/` and `===`, and K3 has
   *zero* NaN concept (verified). Plan: a `float-arith.ts` checked layer (single source across tree-walker /
   bytecode / WASM emitter — the 0014-differential discipline) trapping float div-0 + flagging NaN/Inf; an
   `SPORE-FLOAT-NAN-001` fail-closed INDETERMINATE rule in value-state-checker; an explicit IEEE carve-out for
   tensor `Float32`. **This is exactly the "something we did very early on" asymmetry the owner suspected** —
   the trap posture was applied to Int but not Float.
2. **[ADDITIVE] Wire Decimal arithmetic + a Float==Float lint (#1)** — the exact-money escape hatch is
   declared-but-unwired (0 dispatch entries); add bigint-scaled Decimal ops + a suppressible Float-equality
   warning. No mutation of Float determinism (auto-rounding `==` would itself be a new fail-OPEN).
3. **[ADDITIVE — lint] if/while condition must be Bool (#9)** — a new SPORE-TYPE rule mirroring SPORE-TYPE-004.
4. **[ADDITIVE — lint] cross-type `==` → error (#3)** — promote the deferred "Phase 8B" diagnostic.

**#2, #5, #6, #7, #8, #10 are ALREADY-SAFE — do not invent a fix.**

## Architecture note — why Galerina is better for devs + AI here

- **Strong, segregated types instead of one polymorphic Number/Object** — the *type* carries the intent
  (money in exact Int64/Decimal, never silently a double; `"1"+1` is a compile error with a fix-it). Kills #1
  (default path), #2, #6, #10 outright; no stringly-typed/ToPrimitive paths for an AI to mis-model.
- **Trap-not-coerce / fail-closed** — Int traps on overflow/div-0; `==` returns false on tag mismatch; `null`
  is denied; non-Bool logical operands error. The instinct is *halt loudly* where JS *continues silently*.
  The one place it was not applied early — scalar Float — is exactly the one gap (#4), which proves the rule.
- **Static resolution, no late binding** — no `var`/hoisting/`this`/ASI/monkey-patching → call targets resolve
  statically. Legible to a human reader and a model: no runtime context to lose, no semicolon to guess.

*Source: workflow `wf_b9fd9ee5-11a` (2026-06-25), verify-before-build against the live compiler. Filed (not
fixed): the int-vs-int64 `logicNValuesEqual` policy + the mixed-type sort comparator edge.*
