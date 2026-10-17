# TS scaffold to .fungi lowering obligations

**Status: DRAFT FOR OWNER REVIEW, NON_AUTHORIZING.**

Base: Galerina `main` `bdb5d1baa9fd97a3b0ac8a16cb074809a2d00567` (ls-remote TritHypha/Galerina at write). Branch `grok/fungi-lowering-obligations-20261017`. This document extends RD-0528 (`docs/security/rd0528-ts-to-fungi-self-hosting-standard.md`, path VERIFIED at base). It does not replace RD-0528. No authoritative `.fungi` is authored here. Queue 20 and queue 24 stay `PARKED_TS_REFERENCE`.

Parent concept (Phillip, 2026-10-17 21:33 BST): Galerina is a `.fungi` language and runtime. TypeScript is a scaffold. A property that TypeScript cannot guarantee is not dropped. It becomes a named obligation that `.fungi` discharges by construction, and the converter must carry that obligation across lowering.

Machine-readable companion: `docs/superpowers/specs/2026-10-17-fungi-lowering-obligations.registry.json` (schema `galerina.fungi-lowering-obligations.registry.v1`). Existing homes `docs/contract-registry/contract-registry.json` and `build/code-registry/registry.json` are generated compiler/contract inventories of a different schema (VERIFIED present at base). Zero-trust default: keep this registry next to the spec.

## Standing owner rulings

- v1 crypto is hybrid classical + post-quantum behind a swappable interface; no v3 crypto work now.
- U4: evicted/live/default operation states report DELIVERY_UNKNOWN.
- No null or NaN; typed uncertainty only.
- Every match/switch ends with an exhaustive fail-closed `_ =>` or default arm that refuses (Rust Ok/Err may omit `_ =>`).
- Rust is only an independent out-of-process verifier; the compiled .fungi runtime contains no Rust.
- Synthetic data and keys only; never export RD bodies or keys.
- No GitHub CI and nothing that triggers it; every commit carries [skip ci]; no force-push, rebase, or --no-verify; delete nothing.
- FULL AUTO: don't stop to ask; make the zero-trust choice and record it. Verify, never assume.

## Skills applied (Addendum B)

No `.fungi` source is authored in this brief. Classification and converter-rule text follow:

- `translating-typescript-to-fungi` core rule; Binding translation shape (never emit null/NaN; never `else if`; never `throw`/`try`/`catch`; bounded Boolean `while` only); Workflow steps 1, 4–7, 13 (child-process exhaustive union), 25 (TypedArray as live identity-bearing views).
- `writing-fungi` core rule; Binding authoring shape; Workflow 4, 5 (exhaustive `match` with terminal `_ =>`), 8, 14 (cleanup before typed failure), 20 (child-process union), 33 (TypedArray/DataView).
- `writing-fungi/references/selective-js-conversion.md` for READY / CHECK / REPAIR / ACCEPTED / RETAINED classification of any later conversion item. This brief produces no conversion item.

The JavaScript converter named by Phillip is UNKNOWN in AGENTS (bucket `fungi-converter-tools-agents.md`, sha256 `b3053a833ab2d5aab339e1103a1515647de1e7753f9ef71c24f1e0a170eddc06`). No new converter is written. Galerina `scripts/lib/ts-to-fungi-sandbox/*.mjs` is the existing JS pipeline (paths VERIFIED at base). Skills are policy; the sandbox is mechanism. Whether the sandbox lowerer type map (TS `number` to `Int`) preserves the skill semantic-map rule for JavaScript numeric semantics is UNKNOWN (not compared line by line). Later briefs that emit sandbox output must re-check it against both skills and this registry.

## Principle

The TypeScript tree is a scaffold and a frozen test oracle for parked memory work. Some safety properties cannot be guaranteed under a JavaScript GC, live prototypes, or host FFI. That is not a reason to drop them. Each named obligation is:

1. best-effort and fail-closed in the TS scaffold, labelled `UNKNOWN_IN_TS` where the scaffold cannot prove the property;
2. a `.fungi` language or runtime guarantee by construction (type, linearity, totality, capability, sealed constructor);
3. an out-of-process Rust verifier check over exact bytes. Rust never links into the compiled `.fungi` runtime.

## Three layers per property

| layer | owner | what it may claim | refusing default |
|---|---|---|---|
| (a) TS scaffold now | fail-closed TypeScript | `FAIL_CLOSED_BEST_EFFORT` or `UNKNOWN_IN_TS` | any other guarantee label refuses |
| (b) .fungi obligation | language / runtime by construction | the `fungi_primitive` statement | an unlisted primitive refuses |
| (c) Rust verifier | out-of-process read-only check | `rust_verifier_check` over exact subject bytes | in-process or linked Rust refuses |

## Registry

One entry per obligation. Fields: `id` (stable SCREAMING_SNAKE, never reused), `version`, `statement`, `ts_scaffold` {behaviour, guarantee}, `fungi_primitive`, `rust_verifier_check`, `found_in`, `ts_fix_needed_now`, `status`. No JSON null. A missing value is the string `UNKNOWN` plus `reason`. Seed ids below. New ids are added only when a report supports them.

Rendered table (full machine rows in the companion JSON):

| id | .fungi primitive (summary) | ts_fix_needed_now | ts_scaffold.guarantee |
|---|---|---|---|
| NO_NULL_NAN | foreign NULL/NaN/Infinity cross one reusable boundary helper into typed UNKNOWN/Ambiguous; these values do not exist in .fungi | YES | FAIL_CLOSED_BEST_EFFORT |
| EXHAUSTIVE_FAIL_CLOSED | every match ends in a refusing default arm (Rust Ok/Err may omit `_ =>`) | YES | FAIL_CLOSED_BEST_EFFORT |
| TOTAL_EFFECT_OUTCOME | effects never throw; they return COMMITTED / REFUSED / DELIVERY_UNKNOWN; ASSURED only for a current CONSUMED seal | YES | FAIL_CLOSED_BEST_EFFORT |
| MONOTONIC_TYPED_TIME | clocks and timeouts are typed monotonic safe integers; point/distance algebra with a closed operator table | YES | FAIL_CLOSED_BEST_EFFORT |
| LINEAR_SECRET | secret buffers are linear; wipe then release then consume the handle on every exit; no implicit copy | YES | UNKNOWN_IN_TS |
| UNFORGEABLE_CAPABILITY | lease ids and grants are unforgeable single-use capabilities minted only inside a sealed module | YES | FAIL_CLOSED_BEST_EFFORT |
| SEALED_INTRINSICS | no prototype, species, or global mutation; no live brand checks; no exported mutable regex | YES | FAIL_CLOSED_BEST_EFFORT |
| NO_AMBIENT_AUTHORITY | no env-var launcher redirection, no fd inheritance; spawn needs an explicit capability; no globals | YES | FAIL_CLOSED_BEST_EFFORT |
| BOUNDED_INPUT | length comes from the trusted reader; hard caps refuse rather than truncate; no terminator scan | YES | FAIL_CLOSED_BEST_EFFORT |
| DEADLINE_COVERS_ALL | deadlines cover the whole operation including the final wait; no busy-wait past the typed deadline | YES | FAIL_CLOSED_BEST_EFFORT |
| (unlisted id) | refuses | refuses | refuses |

`ts_fix_needed_now: NO` is not allowed for these v1 safety ids (open-question default). LINEAR_SECRET stays `UNKNOWN_IN_TS` because volatile wipe and no-escape copies are not provable under a JS GC.

## Parked TS findings (queues 20 and 24)

Source: bucket `parked-ts-findings-for-fungi.md` sha256 `b1014a473e6ac75f24377b0cbf035ba923f9649e6864c616ca8d6684aad4c28e` (HASH_MATCH). Every row appears under its obligation `found_in`. A row that maps to no id is `OBLIGATION_UNMAPPABLE`.

| parked id | obligation ids | verification |
|---|---|---|
| P20-F1 | LINEAR_SECRET, TOTAL_EFFECT_OUTCOME, BOUNDED_INPUT | VERIFIED against `grok-independent-check-ic187fix6-b5959878-20261017.md` F1 (P40/P41) |
| P20-F2 | SEALED_INTRINSICS, EXHAUSTIVE_FAIL_CLOSED | VERIFIED same report F2 (GM40/GM41/GM42, P46a-c) |
| P20-N2 | SEALED_INTRINSICS, BOUNDED_INPUT | VERIFIED same report N2 (P47 `step.done` twice) |
| P20-N3 | NO_NULL_NAN | VERIFIED same report N3 (`stream === null` ok empty) |
| P20-N5 | OBLIGATION_UNMAPPABLE | VERIFIED same report N5 (Deno adapter UNKNOWN); no seed id covers Deno host-shim presence |
| P20-R1 | SEALED_INTRINSICS | VERIFIED same report re-check of fix5 F1 (P35–P37/P44/P45) |
| P20-R2 | LINEAR_SECRET | VERIFIED same report re-check of fix5 F2 (P38w, GM38) |
| P24-F1 | LINEAR_SECRET | VERIFIED against `grok-independent-check-q24-93934967-20261017.md` F1 (GM1) |
| P24-F2 | SEALED_INTRINSICS, LINEAR_SECRET | VERIFIED same report F2 (PD/PE Symbol.species) |
| P24-F3a | UNFORGEABLE_CAPABILITY | VERIFIED same report F3 GM14 |
| P24-F3b | SEALED_INTRINSICS, LINEAR_SECRET | VERIFIED same report F3 GM17 |
| P24-F4 | NO_NULL_NAN | VERIFIED same report F4 inline null |
| P24-N1 | DEADLINE_COVERS_ALL, MONOTONIC_TYPED_TIME | VERIFIED same report N1 dispose busy-wait |
| P24-N2 | UNFORGEABLE_CAPABILITY, TOTAL_EFFECT_OUTCOME | VERIFIED same report N2 minted flag before mint |
| P24-N3 | LINEAR_SECRET | VERIFIED same report N3 requireCaptured after copy |
| P24-N4 | SEALED_INTRINSICS | VERIFIED same report N4 live `@@hasInstance` |
| P24-R1 | TOTAL_EFFECT_OUTCOME | VERIFIED same report re-check (GM11/GM12/GM13 ack/audit) |
| (unlisted parked id) | OBLIGATION_UNMAPPABLE | refuses silent drop |

## Annotation form

Recommended default (open-question default, this spec adopts it):

```
// @fungi-obligation NO_NULL_NAN v1 -- foreign null resolved at this helper
```

EBNF:

```
annotation      = "//" SP "@fungi-obligation" SP id-list SP "v" version SP "--" SP reason NL
id-list         = obligation-id { "," SP obligation-id }
obligation-id   = UPPER { UPPER | DIGIT | "_" }
version         = NONZERO { DIGIT }
reason          = { CHAR - NL }
UPPER           = "A" | "B" | … | "Z"
NONZERO         = "1" | … | "9"
SP              = " "
NL              = "\n"
```

Placement: the annotation occupies the immediately preceding source line of the guarded statement. A blank line between annotation and guard is `OBLIGATION_ANNOTATION_MALFORMED`. Multiple ids are comma-separated on one line. Tests locate annotations with a parser that implements this grammar, not a loose regex that accepts unknown ids.

Example (inside this spec only; no live `.ts` file is annotated — zero-trust default skip of the optional live-file annotation):

```ts
// @fungi-obligation NO_NULL_NAN,BOUNDED_INPUT v1 -- length from trusted reader after presence helper
export function readForeignPresence(raw: unknown): ForeignPresenceRead {
  // body stays fail-closed in TS; .fungi has no null
}
```

## Converter rules

The converter is a non-authorizing stage. It emits a typed result. It never throws. It never emits partial `.fungi` on refusal. It never re-infers obligation ids from output (Addendum A item 7 / RD-1908, PRIVATE, not yet in KB indexes (indexes stale): when lowering drops a fact, the frontend must carry it explicitly; side metadata is not a seal).

Typed refusal codes (closed):

| code | when | refusing default |
|---|---|---|
| OBLIGATION_UNMAPPABLE | annotated construct cannot map to a `.fungi` guarantee (including a TS `as` / cast at an annotated boundary) | |
| OBLIGATION_UNKNOWN_ID | id or version not in this registry | |
| OBLIGATION_ANNOTATION_MALFORMED | grammar or placement fails | |
| OBLIGATION_UNANNOTATED_BOUNDARY | a boundary module has guards but no annotations | |
| OBLIGATION_DISCHARGE_UNKNOWN | discharge kind not in the closed list | |
| OBLIGATION_CAST_AT_BOUNDARY | TS cast/`as` at an annotated boundary (same family as UNMAPPABLE; distinct code for tests) | |
| OBLIGATION_REFUSED | any unlisted converter failure | this row is the default |

Discharge receipt, one per obligation, recorded in converter output (not inferred later):

| field | closed values | refusing default |
|---|---|---|
| id | registry id | unknown id refuses |
| version | integer `vN` | unknown version refuses |
| source_span | file + start/end offsets | missing span refuses |
| how | `BY_TYPE` / `BY_LINEARITY` / `BY_TOTALITY` / `BY_CAPABILITY` / `BY_VERIFIER` | unlisted how refuses |
| fungi_construct | named .fungi construct used | missing construct refuses |

Composition with `ts-to-fungi-sandbox` (VERIFIED at base: `scripts/lib/ts-to-fungi-sandbox/contracts.mjs` schema `galerina.ts-to-fungi-sandbox.v1`, outcomes `CONVERTED` / `BLOCKED` / `MANUAL_REVIEW`, blockers include `NULLISH` = `BLOCKED_BY_NULL_UNDEFINED_OR_OPTION_BOUNDARY_ABI` and `BINARY64` = `BLOCKED_BY_JAVASCRIPT_BINARY64_OR_NON_INTEGER_NUMBER_ABI`):

- This registry is an additional non-authorizing stage in front of or beside the sandbox classifier. Sandbox `NULLISH` / `BINARY64` blockers stay in force.
- Sandbox currently throws `SandboxRefusal` (class extends Error). This obligation stage returns a typed result and never throws. Bridging those two shapes is UNKNOWN (requires a later patch of the sandbox to typed results, or a typed wrapper). Zero-trust default: wrap sandbox throws into `OBLIGATION_REFUSED` at the wrapper; do not let exceptions escape.
- RD-0528 remains the parent self-hosting standard. Obligation discharge does not flip a compiler stage. The TS artifact stays the decider of record until RD-0528 tools say otherwise.
- Sandbox outcome `MANUAL_REVIEW` is not a discharge. Unlisted sandbox outcomes refuse.

## Addendum A inputs (RD-1899..1910)

Citation carve-out: RD-1899 through RD-1910 are PRIVATE under `ZTF-Knowledge-Bases/private/research/rd/` and are **not yet in the KB index files** (re-checked 2026-10-17 against `00-KB-INDEX.md`, `KNOWLEDGE-BASE-INDEX.md`, `AI_INDEX.md`, `KB-CATEGORY-INDEX.md`: 0 hits). Every citation below carries `PRIVATE, not yet in KB indexes (indexes stale)`. No RD body is quoted. Inspiration only; none is a Galerina proof.

1. **MONOTONIC_TYPED_TIME** (also offsets in **BOUNDED_INPUT**). Model time as a point type and a distance type with a closed operator table: point minus point gives a distance, point plus distance gives a point, distance plus distance gives a distance; point plus point and every unlisted pair refuse. A point value is mintable only by the sealed monotonic clock primitive. Sources: RD-1899, RD-1910. PRIVATE, not yet in KB indexes (indexes stale).
2. **Shared C-boundary helper** plus **BOUNDED_INPUT** and **EXHAUSTIVE_FAIL_CLOSED**. Checklist: test a foreign pointer for null before anything else; never let a panic or exception cross the boundary (convert to a typed result); never hand back a pointer into a temporary; take length from the trusted side and check it before copying, never scan for a terminator; never reinterpret a foreign integer as an enum (range-check, out-of-range refuse/UNKNOWN); release memory on the side that allocated it; an unchecked foreign allocation is fail-open. Sources: RD-1905, RD-1901, RD-1906. PRIVATE, not yet in KB indexes (indexes stale).
3. **UNFORGEABLE_CAPABILITY** and **SEALED_INTRINSICS**. Capability, lease, grant, deadline and secret types are constructible only inside their sealed defining module; new nominal types start with zero operations and gain only listed ones; .fungi has no cast or reinterpret; a magic-number check on a returned handle is only an equality test and is not unforgeability. Converter: a TS cast or `as` at an annotated boundary refuses (`OBLIGATION_UNMAPPABLE` / `OBLIGATION_CAST_AT_BOUNDARY`). Sources: RD-1910, RD-1899, RD-1900, RD-1902, RD-1905. PRIVATE, not yet in KB indexes (indexes stale).
4. **LINEAR_SECRET**. Destroy of a secret buffer is wipe, then release, then the handle is consumed; setting a handle to null is not a wipe; a defaulted teardown or a teardown written as a comment is not a wipe; secret-holding types have no implicit copy; cleanup runs on every scope exit; in-process opacity gives no secrecy because raw reads see the bytes. Sources: RD-1901, RD-1904, RD-1907, RD-1909, RD-1902. PRIVATE, not yet in KB indexes (indexes stale).
6. **NO_NULL_NAN** rationale. An in-band "empty" marker that collides with a legal stored value is forbidden; absence is a typed state. A wrapper that encodes "missing" as null and compiles down to a null check is the counter-example to refuse. Sources: RD-1901, RD-1910. PRIVATE, not yet in KB indexes (indexes stale).
7. **Registry / discharge-receipt**. Obligation ids and discharge receipts are carried explicitly through lowering and never re-inferred from output. Side metadata is not a seal; the Rust verifier rechecks it. The claim that optimisation passes never alter a dedicated intrinsic is unproven; do not rely on it. Source: RD-1908. PRIVATE, not yet in KB indexes (indexes stale).
8. **NO_AMBIENT_AUTHORITY**. No globals or function-scope statics; all state and authority pass through an explicit self/capability argument; every field is initialised at construction. Source: RD-1904. PRIVATE, not yet in KB indexes (indexes stale).

(Ideas 5 and 9 belong to brief 30.)

## Four UNKNOWN language gaps

None of RD-1899..1910 fills these. They stay UNKNOWN, with the RDs above as partial inputs only.

| gap | status | partial input | refusing default |
|---|---|---|---|
| obligations registry / annotation convention | this spec is DRAFT, not live language | RD-1908 carry-explicitly hint | treating the draft as enforced syntax refuses |
| language-level COMMITTED / REFUSED / DELIVERY_UNKNOWN effect spec | UNKNOWN | RD-1905 / RD-1901 boundary typed-result hints only; nothing on DELIVERY_UNKNOWN | inventing syntax refuses |
| sealed-intrinsics spec | UNKNOWN | sealed constructors and no-cast only; nothing on prototype or global mutation | inventing syntax refuses |
| typed monotonic time spec | UNKNOWN | point/distance algebra and unit types; nothing on monotonicity, overflow, NaN, or deadlines | inventing syntax refuses |

## Rules for future briefs

- Every fix brief states its obligation id(s).
- TS fixes do not over-engineer what only `.fungi` can guarantee, but they stay fail-closed and labelled.
- Tests check the TS behaviour AND that the annotation exists with a known id.
- Grok independent checks verify the TS-to-obligation mapping and the registry row.
- A new finding with no matching id gets a new registry entry first.
- Parked queue 20/24 branches and PRs #182, #183, #185, #187, #192, #156 are HOLD as TS reference: no read-modify, commit, rebase, or comment.

## Open questions (typed UNKNOWN for Phillip)

| question | zero-trust default adopted here | refusing default |
|---|---|---|
| Converter location | extend `scripts/lib/ts-to-fungi-sandbox/` as a non-authorizing stage | a new converter refuses |
| Annotation syntax | `// @fungi-obligation ID vN -- reason` | undocumented syntax refuses |
| Registry home and format | JSON next to this spec; later move to `build/` only behind a drift gate | a silent second copy refuses |
| Id versioning | integer `vN`; never reuse ids | reused ids refuse |
| Unannotated guards found later | converter refuses a boundary module that has guards but no annotations | converting them as if annotated refuses |
| Verifier ownership | existing Rust verifiers gain read-only checks per obligation | in-process Rust refuses |
| Whether `ts_fix_needed_now: NO` is ever allowed for safety ids | no for v1 | `NO` on a v1 safety id refuses |

## Cited paths (git cat-file at base `bdb5d1ba`)

All of the following returned OK unless marked UNKNOWN:

- `docs/security/rd0528-ts-to-fungi-self-hosting-standard.md` VERIFIED
- `docs/examples/TYPESCRIPT-TO-FUNGI-CONTROL-AND-EFFECTS.md` VERIFIED
- `docs/language/fungi/03-effects-and-capabilities.md` VERIFIED
- `docs/language/fungi/07-control-flow.md` VERIFIED
- `scripts/ts-to-fungi-sandbox.mjs` and `scripts/lib/ts-to-fungi-sandbox/{contracts,controller,evidence,identity,journal,classifier,lowerer}.mjs` VERIFIED
- `docs/superpowers/plans/2026-08-14-typescript-to-fungi-sandbox-implementation.md` VERIFIED
- `docs/superpowers/specs/2026-08-15-ts-to-fungi-*-design.md` (4 files) VERIFIED
- `docs/superpowers/specs/2026-08-12-capability-normalization-fungi-conversion-design.md` VERIFIED
- `docs/plans/2026-09-11-selective-fungi-conversion-scope.md` VERIFIED
- `docs/reports/full-fungi-to-slide-retirement-blockers-2026-08-02.md` VERIFIED
- `docs/ROADMAP.md` VERIFIED; staged cite `:2647` is drifted; seven ordered gates to the first trustworthy `.ts -> .fungi` authority switch is line **2461**
- `docs/architecture/self-hosting-evolution-plan-2026-07-10.md` VERIFIED
- `docs/architecture/stage6-hundred-percent-fungi-roadmap-2026-07-10.md` VERIFIED
- `packages-ts/galerina-core-compiler/src/{lowering-plan,numeric-lowering,effect-checker,capability-types}.ts` VERIFIED
- `packages-ts/galerina-core-compiler/src/self-hosted/effect-checker.fungi` VERIFIED
- `docs/diagrams/galerina-k3-verdict-lattice.svg` VERIFIED
- `docs/examples/golden/004-k3-check.fungi` VERIFIED
- `docs/superpowers/plans/2026-08-20-rd-0858-requirement-blocks-type-terminality-k3.md` VERIFIED
- `docs/paper/defensive-papers/dp-rd-0301b-cert-gate-k3-revocation-unknown-deny-fold.md` VERIFIED
- `docs/reports/slice-790-capability-lease-fungi-conversion-2026-08-14.md` VERIFIED
- `docs/reports/slice-618-capabilitygrant-fungi-conversion-2026-08-14.md`, `slice-619-signedcapabilitygrant-…`, `slice-625-verifycapabilitygrant-…` VERIFIED
- `build/fungi-source-capabilities/source-capability-inventory.json` VERIFIED
- `docs/independent-audits/2026-09-13-rd0873-pre-fungi-gate-{astra-review,local-repair}.json` VERIFIED

An existing obligations-registry or source-annotation convention binding TS guards to `.fungi` guarantees: UNKNOWN (not found; TAP proofs and conversion-overlay status files are different artifacts).

## Cited RDs

Indexed (appear in `00-KB-INDEX.md` and/or `AI_INDEX.md` at KB HEAD): RD-0395, RD-0448, RD-0528, RD-0634, RD-0646, RD-0659, RD-0731, RD-0757, RD-0770, RD-0775, RD-0782, RD-0793, RD-0822, RD-0845, RD-1233, RD-1413, RD-1414, RD-1415, RD-1891.

PRIVATE, not yet in KB indexes (indexes stale): RD-1899, RD-1900, RD-1901, RD-1902, RD-1904, RD-1905, RD-1906, RD-1907, RD-1908, RD-1909, RD-1910.

KB files VERIFIED present: `reference/galerina/galerina-three-valued-governance.md`, `reference/language/capabilities.md`, `reference/specs/capability-registry.yaml`, `reference/galerina/galerina-static-capability-proofs.md`, `reference/galerina/galerina-gradual-capability-inference.md`, `reference/language/restricted-native-boundary.md`.

A dedicated linear-secret-buffer language spec: UNKNOWN (not found).

## Seed found_in verification

Each seed-table `found_in` was re-checked against named files under `C:\\Users\\phill\\grok-scratch\\memory-goal-20261014\\grok-independent-check-*.md`. Status `VERIFIED` means the named report exists and contains the claimed topic. Status `UNKNOWN` would mean the report was missing.

| seed cite | report used | status |
|---|---|---|
| #187 IC F5 NaN clock | `grok-independent-check-187-20261017.md` | VERIFIED |
| #185 IC F3 NaN clock / F5 null-as-valid | `grok-independent-check-signet-fix-ic185-ae0adf66-20261017.md`, `…-7abbb60b-20261017.md` | VERIFIED (null-as-state wording in 7abbb60b; checklist uses null-as-valid) |
| #182 02 admit null-as-state | `grok-independent-check-u6-420a05ca-20261017.md` plus 185 7abbb60b | VERIFIED topic; the #182-02 filename mapping is UNKNOWN (topic lives in later U6/185 reports) |
| #188 N2 | `grok-independent-check-188-20261017.md` exists; N2 also appears in many reports | VERIFIED file exists; specific N2 sentence UNKNOWN without quoting |
| #186 N2 unlisted outcome | `grok-independent-check-186-20261017.md` | VERIFIED contains "unlisted" |
| #187 fix3 F3 consume-then-throw | ic187fix reports | VERIFIED family; exact phrase "consume-then-throw" UNKNOWN |
| #184 N1-N3 | `grok-independent-check-184-20261017.md` | VERIFIED file exists |
| U4 #190 DELIVERY_UNKNOWN | `grok-independent-check-u4-7f2e6165-20261017.md` | VERIFIED |
| #185 IC F2 FAILED seal ASSURED | `grok-independent-check-signet-fix-ic185-33854dced-20261017.md` | VERIFIED |
| U4 overflow N3 NaN epoch | `grok-independent-check-u4overflow-665f0bce-20261017.md` | VERIFIED file; "NaN epoch" exact phrase UNKNOWN |
| #187 fix3 F1 unwiped throw | ic187fix3 / 182 reports | VERIFIED family |
| #189 U3 arena | `grok-independent-check-u3-bd936a29-20261017.md` | VERIFIED file exists |
| #182 F5 wipe exits | `grok-independent-check-182-20261017.md` | VERIFIED |
| U4 #190 F2 re-release | `grok-independent-check-u4-7f2e6165-20261017.md` | VERIFIED |
| #192 N4 predictable fallback nonce | `grok-independent-check-u4overflow-665f0bce-20261017.md` | VERIFIED |
| #185 F1 tampered grant | `grok-independent-check-185-20261017.md` | VERIFIED |
| U6 #191 IC 4d8cfa59 F2 | `grok-independent-check-u6-4d8cfa59-20261017.md` | VERIFIED |
| b67acb23 N1/N2 | `grok-independent-check-u6-b67acb23-20261017.md` | VERIFIED |
| #184 N4 live intrinsics | `grok-independent-check-184-20261017.md` | VERIFIED |
| #182 F3 fd leak | `grok-independent-check-182-20261017.md` (CLOEXEC) | VERIFIED |
| #183 fix8 N2 env redirect | `grok-independent-check-183-fix8-ae479605-20261017.md` | VERIFIED |
| #185 F1 unpinned helper | `grok-independent-check-185-20261017.md` | VERIFIED |
| #187 fix3 F1 readBodyCapped | `grok-independent-check-ic187fix-e203511a-20261017.md` | VERIFIED |
| #183 F2 16 MiB stdin | `grok-independent-check-183-20261017.md` | VERIFIED |
| #182 fix8 52aa1568 F1 waitpid | `grok-independent-check-182-fix8-52aa1568-20261017.md` | VERIFIED |
| #182 F2 timeout bypass | `grok-independent-check-182-20261017.md` | VERIFIED |
| #188 N1 hang | `grok-independent-check-188-20261017.md` exists | VERIFIED file; hang topic also in 182 reports |

## UNKNOWNs with reasons

- Live language-level specs for TOTAL_EFFECT_OUTCOME, SEALED_INTRINSICS, MONOTONIC_TYPED_TIME: not found; RD-1899..1910 are partial inputs only.
- JavaScript converter in AGENTS: not found.
- Skills vs sandbox numeric map: not compared line by line.
- Sandbox `SandboxRefusal` throw vs typed obligation result: unbridged.
- Optional live `.ts` annotation: skipped (file would have to be unused by queues 20/24 and open PRs).
- QUEUE.md row-level confirmation of every seed cite: not used as a substitute for the named independent-check reports.
