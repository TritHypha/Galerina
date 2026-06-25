# Faithful Int64 lowering — VERIFIED implementation plan (2026-06-25)

**Supersedes the thinner site list in [logicn-i64-lowering-map-2026-06-25.md].** That map captured the
happy-path sites; this plan is the **adversarially-verified** version (workflow `wf_6ccf9ef5-ba9`,
11 agents: 5 site-maps → 5 high-effort truncation-hunting skeptics → synthesis). The adversarial pass
found **5 CRITICAL fail-opens the map missed** (bytecode-tier silent truncation, `foldToInt` 32-bit
const-fold, return-valtype inertia, unary-neg i32-helper-over-i64, param-registration dead-routing) and
**28 residual risks total**. Every cluster is **sound-with-fixes, NOT sound** — the i64 *arithmetic* is
faithful (`i64-arith.ts`, 10/10), but each cluster is incomplete in a way that silently truncates or goes
dead until the missing sites land.

**The gate `BACKEND_UNLOWERABLE_SCALAR = {Int64, UInt64}` (value-state-checker.ts:2068) STAYS CLOSED**
until the full Lift-Criteria Checklist (§4) passes. `UInt64` stays gated for the entire effort (no unsigned
`u64-arith`; `div_u`/`rem_u`/`extend_i32_u` differ). The work is **origination + plumbing + completeness**,
not new arithmetic.

## 1. Ordered build sequence

### Step 0 — shared prerequisite (lands before everything)
- **0a. Extract/export `numericBaseType`** (currently non-exported at value-state-checker.ts:2074; 5+ emitter
  edits reference it and do NOT compile as written). Move to a shared util or `export` + import into
  wat-emitter.ts. **Forbidden fallback:** never substitute a bare `=== 'Int64'` compare — it misses
  `protected Int64` / `redacted Int64` and silently emits i32 (CWE-704). Every type decision runs through
  `numericBaseType(...)` → `logicNTypeToWAT(...)`.
- **0b. Shared `parseI64Literal(rawText): bigint`** util — sign-descends `unaryExpr('-', numberLiteral)`,
  strips `_` separators, honors `0x/0b/0o`, range-checks `[I64_MIN, I64_MAX]`. Used by **interpreter (1a),
  emitter (3g), foldToInt (4d), and the type-checker** so all four agree on the I64_MIN/I64_MAX edges.
  Never `parseInt`/`Number` an Int64 literal anywhere.

### Step 1 — interpreter literal-coercion (2a-pt2), the walker crux
Today `__tag:'int64'` is produced **only** by `i64R` (arithmetic results); `let x: Int64 = 5` boxes as
`__tag:'int'` (JS number) → the int64 dispatch entries are unreachable from source AND the walker is itself
lossy >2^53. Until this lands the **0014 differential cannot be validly constructed** (both sides agree
vacuously on small values).
- **1a.** `coerceToDeclaredNumeric` helper — declared base Int64 → `{__tag:'int64', value: parseI64Literal(raw)}`.
- **1b.** let/mutDecl coercion (async + sync) on init when declared base = Int64.
- **1c. async `assignStmt` coercion (interpreter.ts:1348-1361)** — look up the binding's declared `typeName`
  (recorded at `declare()` :1288/:1305), coerce RHS before `assign()`, fail-closed on non-integral. Mirror in
  sync (:459-463). **This is the loop-accumulator path `mut total:Int64=0; total = total + i`, currently
  unguarded in async.**
- **1d.** return-type coercion — thread `returnTypeName` once at flow entry (~:1059), apply at the single
  post-assembly point after :1089 (before `buildResult` :1126) so block-tail (:1073) AND EarlyReturn (:1078)
  both funnel through it. Co-locate with the 0040 post-condition hook (:1117-1124).
- **1e.** async `unaryExpr` int64 case (:1546-1558) → `i64NegChecked` (matches sync :595); makes `-INT64_MIN`
  trap exercisable.
- **1f.** `matchPattern` int64 arm (:2319-2328) — `BigInt(pattern)`, not `parseInt`.
- **1g.** `logicNValuesEqual` int64 branch (stdlib.ts:1341-1352) — `a.value === b.value` bigint compare; fixes
  match-guard / `List.contains` / dedup fail-OPEN. (Owner decision: mixed int/int64 promote-and-compare vs
  same-tag-only.)
- **1h.** static Int64 const folding (:903-929/:906-914) — fold to int64 tag from raw, or **fail closed**.
- **1i.** cross-flow literal arg coercion (runNestedFlow :2225, sync callExpr :613) — `parseI64Literal` the
  raw text at the call site when callee param base = Int64; do NOT let `evalExpr→parseInt` (:1475) round
  `9223372036854775807` first.
- **1j. bytecode VM fail-closed bail (CRITICAL, R1).** The bytecode tier runs FIRST (:2955 "bytecode VM
  FIRST") and silently lowers internal Int64→i32 for any flow whose Int64 is **not a param** (its
  letDecl/mutDecl/return compilers emit plain i32; the param-only check at :95-104 never fires). Add a
  `BytecodeUnsupported` bail on any let/mut/return whose declared base resolves to Int64/UInt64 — OR pre-scan
  the flow at interpreter.ts:2958 before attempting bytecode.
- **1k.** cache tier — no separate fix; once 1j + sync bail are in, the pure-flow cache (:2930-2952) only
  memoizes faithful values. Verify under 0014 that an Int64 flow never reports executionTier
  `cache`/`bytecode`/`sync` until those tiers are proven faithful.

### Step 2 — type-checker tightening (lands with the emitter, before lift)
- **2a.** mixed Int+Int64 contagion (type-checker.ts:883) — `if (left==='Int64'||right==='Int64') return 'Int64'`
  before `return leftType`. The interpreter already promotes mixed to bigint (:192-213); without this the
  checker/walker/WASM disagree on a mixed expression's type.
- **2b.** tighten Int→Int64 assignability (type-checker.ts:414) — currently `let total:Int64 = <Int-bodied
  expr>` is green because Int is assignable to any `NUMERIC_TYPES` member. **Choose the fail-closed option:**
  require the inferred body type to be Int64 for 64-bit declared widths.

### Step 3 — emitter structural valtypes + literal typing (2b structural)
- **3a.** `INT64_WAT_TYPES = {Int64}` + a per-type `signedWiden(base)` (`i64.extend_i32_s` for Int64;
  `extend_i32_u` for the gated UInt64) so a later UInt64 un-gate can't silently sign-extend-corrupt.
- **3b. param registration (CRITICAL, R5)** — register every annotated scalar param's base type into
  `recordVarTypes` at the start of `emitWATFromFlowAST`. Today only let/mut/match register;
  `inferExprType('identifier')` returns undefined for params → collapses to 'Int' → i64 routing is DEAD for
  `f(a:Int64,b:Int64)`.
- **3c.** `inferExprType` Int64 contagion (:973-990) — mirror the `FLOAT_WAT_TYPES` contagion at :989; seed
  from annotated bindings/params (3b).
- **3d.** `watStackType` i64-call rule (:783-792) — `if (/^\(call \$lln_checked_(add|sub|mul)_i64/...) return 'i64'`
  before the generic match (the existing regex needs a `.`, so `(call $…` defaults to i32).
- **3e.** return valtype (:2996) — `declaredReturn !== undefined ? logicNTypeToWAT(declaredReturn) : 'i32'`
  (logicNTypeToWAT:212 maps Int64→i64). WASM rejects i64-over-i32-result (fail-closed) but must land
  **atomically** with body lowering.
- **3f.** `$logicn_result` single-exit local (:2170) — declare `(local $logicn_result i64)` when
  `declaredReturn==='Int64'`. **Never fix 3e without 3f.**
- **3g. literal `expectedType` threading (CRITICAL, R21)** — add `expectedType` to `emitWATExpr` (net-new;
  current signature :1032-1036 is 3-arg) and thread it through EVERY operand-emission site (binary operands
  :1122-1123, return :1654, letDecl :1614, assignStmt :1641). base=Int64 → `(i64.const ${raw})`. **Fail-closed
  assertion:** any `|literal| > 2^31-1` arriving with NO i64 hint emits `(unreachable)`, never `(i32.const)`.
- **3h.** local valtype — **all FIVE store sites**, driven off a `localValtypes: Map<watLocal, WATValType>`
  side-map (annotations are absent on rebind/assign): new-binding letDecl :1626-1627; rebind :1619; assignStmt
  :1648; defensive undeclared-assign :1646 (force i64 from recordVarTypes, not watStackType); wrap
  `(i64.extend_i32_s …)` when local is i64 and `watStackType(init)==='i32'`.

### Step 4 — emitter arithmetic / op routing (2b arithmetic)
- **4a.** `INT64_CHECKED_HELPERS` + `$lln_checked_{add,sub,mul}_i64` (new). add/sub = i64 sign-bit overflow
  predicate. **`mul` must NOT end with `i32.wrap_i64`** (that's the i32 helper's narrow-back at :826) and must
  NOT use native wrapping `i64.mul` — use the divide-back predicate: `i64.mul` then `if a!=0 && i64.div_s(r,a)!=b
  → unreachable` (`div_s(INT64_MIN,-1)` traps natively, `a==0` short-circuits). (R15)
- **4b. helper injection — extend BOTH loops (R14)** (:509 and :513) to iterate `INT64_CHECKED_HELPERS` (or
  merge into one `ALL_CHECKED_HELPERS`). Else a body referencing `$lln_checked_add_i64` → undefined func →
  wat2wasm declines → **permanent silent walker fallback masked by green tests.**
- **4c.** binaryExpr Int64 branch after the float block (:1158) — +,-,* → `$lln_checked_*_i64`; `/`→`i64.div_s`;
  `%`→`i64.rem_s`; comparisons → `i64.{lt,gt,le,ge}_s`+`eq/ne`; mixed int operand widened via `extend_i32_s`.
  **Guard mixed Int64+Float → `(unreachable)`** (else an i64 reaches `f64.convert_i32_s` at :1149).
- **4d. `foldToInt` Int64-awareness (CRITICAL, R2)** (:1118-1119 + foldToInt :2687-2726) — it short-circuits
  the binaryExpr Int64 branch and folds in 32-bit space via `parseInt` (:2694). `1000000*1000000` spuriously
  traps or emits a wrapped `(i32.const)`. Fix: when `inferExprType(node)==='Int64'` (or any operand exceeds
  i32), fold with BigInt + i64-range checked ops → `(i64.const ${bigint})`, or return null and let the runtime
  i64 path handle it. **Never let `parseInt` touch an Int64 literal.**
- **4e.** unaryExpr Int64 negation (:1168) — current hardcoded `$lln_checked_sub_i32` over an i64 operand is
  invalid/truncating. Add `inferExprType(operand)==='Int64'` → `$lln_checked_sub_i64 (i64.const 0) operand` so
  `-INT64_MIN` traps. (R4)
- **4f.** return-type plumbing — thread the declared return type through
  `emitWATFromFlowAST → emitBlockStatements → returnStmt` (:1652, no access today). Assert
  `resultVal === watStackType(returned-expr)`; fail-closed mismatch → decline to walker. Atomic with 3e/3f.
- **4g.** call-arg literal typing — callee param base Int64 + bare-literal arg → `(i64.const)` not `(i32.const)`.
  Mirror of 1i on the emitter side.

### Step 6 — gate lift (LAST, owner/integration-gated)
Remove only `"Int64"` from `BACKEND_UNLOWERABLE_SCALAR` (value-state-checker.ts:2068). **`"UInt64"` stays.**
Only after §4 passes.

## 2. Residual-risk register (CRIT/HIGH = gate-lift blockers)

A validation-decline is fail-SAFE; a truncation that VALIDATES is fail-OPEN and worse.

| # | Site | Sev | Failure mode | Step |
|---|------|-----|--------------|------|
| R1 | bytecode-vm.ts :133-158 + interpreter.ts:2958 | **CRIT** | bytecode tier runs FIRST, silently lowers internal Int64→i32 for non-param flows | 1j |
| R2 | wat-emitter.ts:1118-1119 `foldToInt` | **CRIT** | const-folds Int64 in 32-bit via `parseInt`+i32 ops, emits `(i32.const)` — validates | 4d |
| R3 | wat-emitter.ts:2996 return valtype | **CRIT** | hardcoded i32 result → routing inert or truncation | 3e |
| R4 | wat-emitter.ts:1168 unary neg | **CRIT** | `$lln_checked_sub_i32` over i64 → invalid/truncating; `-INT64_MIN` unrepresentable | 4e |
| R5 | wat-emitter.ts:2898-2903 param registration | **CRIT** | Int64 params never in recordVarTypes → routing DEAD for `f(a:Int64,b:Int64)` | 3b |
| R6 | `numericBaseType` non-exported (vsc:2074) | **HIGH** | 5 emitter edits don't compile; naive `==='Int64'` misses `protected Int64` | 0a |
| R7 | inferExprType:973-990 no Int64 contagion | **HIGH** | mid-expr Int64 → 'Int' → i32 local → 64→32 truncation that validates | 3c |
| R8 | local valtype rebind :1619 + assignStmt :1648 + defensive :1646 | **CRIT/HIGH** | loop-accumulator i64 local with no widening → invalid or silent narrow | 3h |
| R9 | interpreter.ts:1348-1361 async assignStmt | **HIGH** | `mut total:Int64; total=x` rebinds int tag → demotes to i32 dispatch | 1c |
| R10 | interpreter.ts:2225/:613 cross-flow literal arg | **HIGH** | `f(9223372036854775807)` rounded by `parseInt` at caller | 1i |
| R11 | interpreter 2a-pt2 no declared-type literal coercion | **HIGH** | int64 dispatch unreachable; walker lossy >2^53; 0014 not constructible | 1a-b |
| R12 | type-checker.ts:883 mixed Int+Int64→'Int' | **HIGH** | checker/walker/WASM disagree on mixed-expr type | 2a |
| R13 | type-checker.ts:414 Int-bodied init for Int64 binding | **HIGH** | `let total:Int64=a+b` green → i64 local stores i32 | 2b |
| R14 | wat-emitter.ts:509/513 helper injection loops | **HIGH** | new i64 helpers not injected → undefined func → silent walker fallback | 4b |
| R15 | `$lln_checked_mul_i64` overflow check | **HIGH** | i32 trick / native wrapping mul → fail-OPEN | 4a |
| R16 | return plumbing channel :1652+:2996 | MED | resultVal i64 but body returns `(i32.const)`: small literal validates & truncates siblings | 4f/3e |
| R17 | wat-emitter.ts:2170 `$logicn_result` i32 | MED | Int64+postcondition captures i64 tail into i32 local | 3f |
| R18 | interpreter return coercion block-tail vs EarlyReturn | MED | inconsistent coercion | 1d |
| R19 | interpreter.ts:906-914 static Int64 const | MED | `static BIG:Int64=…` folded lossy via parseInt | 1h |
| R20 | wat-emitter.ts:1146-1150 float mixed promotion | MED (latent) | `int64Val + 2.0` → i64 reaches `f64.convert_i32_s` once gate lifts | 4c |
| R21 | wat-emitter.ts:1103-1109 literal w/o hint | **CRIT** | operand re-emit w/ no hint → `(i32.const)` truncate | 3g |
| R22 | numberLiteral raw + `unaryExpr('-',num)` | MED | `BigInt(parseInt())` off-by-one at I64_MAX; top-level-only misses I64_MIN | 1a |
| R23 | stdlib.ts:1341 `logicNValuesEqual` no int64 | MED | equal int64s → false → wrong match arm / failed membership | 1g |
| R24 | interpreter.ts:2319-2328 matchPattern | LOW | int64 subject misses numeric arms (control-flow) | 1f |
| R25 | interpreter.ts:1546-1558 async unary | LOW | hard-errors Int64 negation; tier asymmetry | 1e |
| R26 | stdlib.ts:200-202 `numVal`→0 for int64 | LOW | Int64 into Statistics/Math silently → 0; NEVER `Number()` | defer |
| R27 | cache tier :2930-2952 | HIGH→resolved | memoizes truncated value from R1; auto-resolves once R1 bails | 1k |
| R28 | UInt64 sign-extend if added to INT64_WAT_TYPES | MED (latent) | `extend_i32_s` on UInt64 high-bit → negative i64 corruption | 3a |

## 3. Literal-typing decision
**ONE shared base-type resolver (`numericBaseType`, 0a) + ONE shared `parseI64Literal` (0b), but TWO
tier-specific origination hooks** — the interpreter boxes a runtime tagged value
`{__tag:'int64', value: BigInt(raw)}`; the emitter boxes a WAT valtype + `(i64.const)` text. There is no single
threading mechanism that serves both; pretending there is would be the bug. The shared pieces guarantee the
two tiers (plus the type-checker, the third tier the 0014 differential does not directly exercise) agree on
base-type stripping and the I64_MIN/I64_MAX literal edges.

## 4. Lift-criteria checklist (remove `Int64` only when ALL hold)
- **Shared:** `numericBaseType` + `parseI64Literal` extracted; no bare `==='Int64'` anywhere (R6).
- **Interpreter:** literal/param/return/assign/call-arg coercion lands, `let x:Int64=5` → int64 tag (R11);
  bytecode bails + cache never serves a truncated Int64 (R1, R27); async assign + async unary + matchPattern +
  logicNValuesEqual + static-const int64-aware or fail-closed (R9, R23-25, R19); no Int64 flow reports
  executionTier cache/bytecode/sync until proven faithful.
- **Type-checker:** mixed Int+Int64→Int64 (R12); Int-bodied init rejected for Int64 binding (R13); all three
  tiers agree on every corpus program's type.
- **Emitter:** params registered + inferExprType Int64-contagious (R5, R7); return valtype + `$logicn_result` +
  return plumbing land atomically with `resultVal===watStackType` assert (R3, R16, R17); all FIVE local-set
  sites widen via `localValtypes` (R8); literal `expectedType` threaded everywhere, `>2^31` w/o hint →
  `(unreachable)` (R21); `foldToInt` Int64-aware/skips (R2); unary neg → `$lln_checked_sub_i64` (R4);
  Int64+Float → `(unreachable)` (R20); UInt64 sign-extend guarded by per-type `signedWiden` (R28).
- **Checked helpers:** `$lln_checked_{add,sub,mul}_i64` exist + trap; mul uses divide-back, NOT `i32.wrap_i64`,
  NOT native wrap (R15); BOTH injection loops iterate them (R14).
- **Integration proof (the decisive gate):** a fused Int64 module actually **VALIDATES** under wat2wasm (a green
  walker masks a permanently-declining WASM tier); it **RUNS** correctly for the full §5 corpus; the **0014
  walker===WASM differential is GREEN including values in (2^53, 2^63)** (else it passes vacuously).
- **Scope:** `"UInt64"` remains gated. No unsigned `u64-arith`/`div_u`/`rem_u`/`extend_i32_u` in scope.
- **Owner/integration-gated** (not auto-cleared by tests): the final gate edit; the bytecode-bail strategy
  (per-site throw vs :2958 pre-scan); the `logicNValuesEqual` mixed int/int64 policy.

## 5. Test corpus (0014 walker===WASM differential — MUST include (2^53, 2^63) or it is vacuous)
`I64_MAX=9223372036854775807`, `I64_MIN=-9223372036854775808`. Trap cases must trap identically (same trap,
same point) in both tiers.
1. **Large literal >2^53** — `return 9007199254740993` (2^53+1); plus `I64_MAX`, `I64_MIN` (as init and as
   negated literal, R22).
2. **add/sub/mul overflow-trap** — `I64_MAX+1`, `I64_MIN-1`, `4611686018427387904*2` — each TRAPS (Fork-A).
3. **div INT64_MIN/-1** traps; **`I64_MIN % -1` returns 0** (no trap) — the div_s/rem_s asymmetry; `x/0` traps.
4. **mixed int+int64** — `let a:Int=3; let b:Int64=5000000000; a+b` — widen via extend_i32_s, exact.
5. **int64 return** — block-tail AND explicit-return+EarlyReturn (R18); plus an Int64-return flow WITH
   `invariant { ensure result … }` (R17).
6. **int64 param** — `f(a:Int64,b:Int64)->Int64 { a+b }` with args >2^53 (R5); plus call-arg literal
   `f(9223372036854775807,1)` (R10).
7. **int64 compare** — all of `< > <= >= == !=` straddling 2^53; plus a `match` on a large int64 (R24) and
   `List.contains` of equal large int64s (R23).
8. **int64 loop counter/accumulator** — `mut total:Int64=0; for i in 0..n { total = total + 3000000000 }` —
   async assignStmt (R9), rebind/assignStmt local-set widening (R8), accumulation past 2^32/2^53.
9. **const-fold trap** — `let x:Int64 = 1000000*1000000` (fits i64, overflows i32) — proves foldToInt (R2) does
   not fold in 32-bit; result exactly `1000000000000`.
10. **unary negation** — `-x` over a large int64; `-I64_MIN` TRAPS in both tiers (R4/R25).

Any program where the two tiers diverge, or the fused module fails to validate, is a **hard stop** — gate
stays closed.

## Bottom line
Every cluster is **sound-with-fixes, not sound**. Build order: interpreter coercion (Step 1) → type-checker
(Step 2) → emitter (Steps 3-4) → prove the §5 corpus byte-identical with an actually-validating fused module →
then, owner-gated, lift `Int64` only. UInt64 stays gated for the entire effort.

*Source: workflow `wf_6ccf9ef5-ba9` (2026-06-25) — 5 site-maps + 5 high-effort adversarial truncation-hunters
+ synthesis; every load-bearing line cited against live src. Supersedes the map doc's site list.*
