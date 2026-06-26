# Arrays & objects deep-dive (2026-06-25) — PARTIAL (3/6 probes; 3 rate-limited, to resume)

Owner asked to R&D arrays/objects against 7 axes (works / typos / latency / memory / I-O / stability / compiler
intelligence). Workflow `wf_85896b20-ac0`. **3 of 6 probes completed** (record-grammar, governance-latency,
memory); **array-grammar, array-ops, and I/O probes were rate-limited out** — RESUME the workflow to finish them.
Completed findings below were reproduced by actually compiling + running `.spore` (not assumed).

> **One HIGH bug already FIXED this session:** record-update spread `{ ...base, f: v }` was dead on the
> interpreter path (parsed/checked/WAT-emitted but no tree-walker case) — a walker≠WASM divergence. Fixed +
> tested (`f85e9e9`, suite 3861/0). The rest below are flagged, **not yet fixed** — each needs verify-before-build.

## ⚠️ Verification caveat
Several findings cite `galerina.mjs`. There are TWO things easily confused: the **production CLI** and the **v0.1
prototype fork** (`packages-galerina/galerina-core/compiler/galerina.js`, "do-not-cross-validate" per memory). Any
finding below that rests on `galerina.mjs` host-runtime drift **must be confirmed against the canonical
`createHostRuntime`/`wasm-runtime.ts` path before acting** — it may be a stale-fork artifact, not a live defect.

## HIGH findings (verified by compile+run; fixes pending)

| # | Finding | Evidence | Axis |
|---|---|---|---|
| 1 | **Record-update spread dead on interpreter** — `{ ...base, f: v }` returned a runtimeError on `run()` while WASM worked | interpreter.ts had no `#record-update` case | works | **✅ FIXED (`f85e9e9`)** |
| 2 | **Record field-order divergence (silent-wrong, walker≠WASM)** — fields are CONSTRUCTED positionally (literal order) but ACCESSED by declared-layout order, so `{ b: 2, a: 1 }` for a type declared `{ a, b }` reads wrong field values **on the WASM tier** (interpreter Map-keyed is correct) | `wat-emitter.ts` #record stores at `i*WAT_REC_FIELD_SIZE` by literal index; memberExpr reads via `recordLayouts` declared order | works/memory | **top follow-up — verify + fix** |
| 3 | **Under-filled record literal under-allocates** — omitting a declared field sizes the struct by the literal's field count, not the declared layout | memory probe (wat-emitter bump-alloc) | stability | verify + fix |
| 4 | **Higher-order collection ops with a named flow silently no-op** — `.map(namedFlow)/.filter/.reduce/.find/.flatMap` never apply the mapper/predicate; return the list unchanged, no error | governance-latency probe (compiled+ran) | works | verify + fix (silent-wrong) |
| 5 | **No array index syntax** — `xs[i]` doesn't exist in the grammar (`parsePostfix` has `.member`/`::path`/method/`?` but no subscript) | parser.ts:1991 | works | design decision — confirm intended (`.at(i)`?) |
| 6 | **Typo'd field access not caught statically** — the type-checker doesn't validate `r.field` against the record's actual fields (it heuristically guesses types from common field names), so `u.aeg` only fails at runtime with no "did you mean age?" | type-checker.ts:675-710 | compilerIntelligence | high-value lint |

## Medium findings — silent typos (the owner's "what happens with typos/commas")

| Finding | Behavior today | Fix |
|---|---|---|
| Missing colon `{ age 30 }` | **0 diagnostics** — silently re-parsed as a *block*; surfaces later as a confusing `SPORE-NAME-001 'age' not declared` | targeted `SPORE-PARSE` "expected ':' after field name" in the `{`-disambiguation (parser.ts:2103-2131) |
| Missing comma `{ name:"a" age:30 }` | **0 diagnostics** — silently accepted (comma is optional by design) | keep permissive cross-line, but add an opt-in lint: two fields on the SAME line with no comma → warn |
| Duplicate key `{ age:30, age:99 }` | **0 diagnostics** — last-wins | track seen field names; warn "duplicate field 'age' — later value wins" |
| Anonymous-record field access on WASM | `u.age` on an anonymous (non-`type`) record emits `unreachable` (only named records have slot layouts) | fail-closed today (not silently wrong) — give a clean diagnostic, or assign anonymous layouts |

## What's solid (verified)
- **Records are genuinely Map-backed and proto-pollution-immune** — injecting `{"__proto__":{...}}` via
  `json.decode` left host `Object.prototype` untouched (end-to-end verified). Confirms TS-audit 61-12.
- Plain records, nested access, keyword field names all work on the interpreter path.

## Next
1. **RESUME** `wf_85896b20-ac0` to finish the array-grammar / array-ops / I/O probes (rate-limited).
2. Verify-then-fix the HIGH set in priority order: **#2 record field-order divergence** (silent-wrong, walker≠WASM
   — the most dangerous), then #4 (named-flow higher-order no-op), #3, #6 (the typo-catching lint the owner asked
   for), then the medium silent-typo diagnostics. Each gets a walker≡WASM check where a tier divergence is possible.

*Source: workflow `wf_85896b20-ac0` (2026-06-25), partial. Companion: TS-audit 61-12 (prototype pollution).*
