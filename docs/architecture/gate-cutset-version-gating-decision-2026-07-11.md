# Decision record — why `.gate` `cut(<field>)` is version-gated to `@version 1.2.0` (RD-0340)

**Status:** DECIDED + LANDED 2026-07-11 (RD-0340 rung-3 hoist). Reference checker `ZT-Galerina-GRAPH-ASCII-v2/tools/gate-check.mjs @ 4ec48a5`; prod parser `galerina-core-compiler/src/gate-parser.ts` (UNCHANGED — that is the decision).

**One line:** the new `[name:cut(<field>...) fu op]` annotation is legal ONLY under `@version 1.2.0`, which the production compiler rejects wholesale — because the alternative (allowing it under `1.0.0`, the version prod *does* accept) makes the prod parser **silently mis-parse a privacy cut as an ordinary node**, which is fail-open. Version-gating routes the file into prod's fail-**closed** version-reject path instead.

---

## 1. Background — the `.gate` surface has TWO parsers

`.gate` is compiled by two independent front-ends that must agree byte-for-byte on the accept surface:

| Parser | Where | Role |
|---|---|---|
| **Reference checker** | `ZT-Galerina-GRAPH-ASCII-v2/tools/gate-check.mjs` | the normative authoring lint (SPEC v0.6); where RD-0340 rung-3 is *enforced* |
| **Production parser** | `galerina-core-compiler/src/gate-parser.ts` | the compiler front-end that lowers `.gate` → GIR → WASM |

RD-0340 adds a grammar construct — the cut-set `cut(<field>...)` — to the reference checker. The question this record answers: **what must the production parser do about a construct it does not yet understand?**

## 2. The fallout — what prod's `gate-parser.ts` does with `cut(<field>)`

Two facts, read directly from the shipped source (verified, not assumed):

**(a) `parseGateNode` recognises a cut with a strict, unannotated regex** (`gate-parser.ts` ~L145):

```ts
const cut = raw.match(/^([A-Za-z_]\w*)\s*:\s*cut\s+fu\s+([A-Za-z_]\w*)$/); // `qname:cut fu op`
if (cut) return { raw, qname: cut[1] ?? raw, kind: "cut", op: cut[2] ?? "" };
const fu  = raw.match(/^([A-Za-z_]\w*)\s*:\s*fu\s+([A-Za-z_]\w*)$/);        // `qname:fu op`
if (fu)  return { raw, qname: fu[1] ?? raw, kind: "fu", op: fu[2] ?? "" };
return { raw, qname: raw, kind: "sandbox" };                                // fall-through
```

For a node body `view:cut(PatientId,SSN) fu redactPHI`, the `cut` regex requires `:cut` to be followed immediately by `\s+fu` — but it finds `(PatientId,SSN)`. **No match.** The `fu` regex needs `:fu` — also no match. Control falls through to the last line: `{ kind: "sandbox", qname: "view:cut(PatientId,SSN) fu redactPHI" }`. **The cut vertex is silently downgraded to a plain sandbox node**, its whole body captured as a garbage identifier.

**(b) The prod accept set is `{1.0.0}` only** (`gate-parser.ts` ~L248):

```ts
const GATE_SUPPORTED_VERSIONS: ReadonlySet<string> = new Set(["1.0.0"]);
```

An unrecognised version is refused with `FUNGI-GATELANG-001` and **zero flows**, *before* any FLOW parsing runs.

## 3. The failure mode (concrete)

If `cut(<field>)` were allowed under `@version 1.0.0` (the version prod accepts), then for a migrated privacy example prod would:

1. accept the version (`1.0.0` ∈ `{1.0.0}`),
2. reach `parseGateFlow` → `parseGateEdge` → `parseGateNode`,
3. **silently downgrade** the `[view:cut(PatientId,SSN) …]` cut to a `sandbox` node,
4. so `parseGateFlow`'s `cutNodes` set **loses that cut**, and the `FUNGI-GATELANG-002` surface report under-counts `:cut` vertices.

Today that is not a *live* leak — prod refuses to SIGN any `.gate` artifact (`FUNGI-GATELANG-002` is a hard error until the RD-0234c backstop is wired). **But it is a landmine:** the increment-2b lowering that will eventually enforce privacy would see a redaction cut as an ordinary node — a privacy vertex that has *vanished from the graph* — which is the textbook fail-open. And it directly violates the `.gate` evolution policy §4.2: **"Unknown ⇒ REJECT, never ignore — there is no silent-skip path; that is how dialects are born."** A parser that quietly reinterprets a construct it does not understand is exactly that silent-skip.

## 4. The decision — version-gate, do NOT patch prod

`cut(<field>)` is gated to a **new file version `1.2.0`** (a monotonic ladder `1.0.0 < 1.1.0 < 1.2.0`; `cutset_gating` REJECTS the annotation below `1.2.0`, never silently). The production parser's accept set stays `{1.0.0}`, so a `1.2.0` file is **rejected at the version check** (step 1 above) — it never reaches `parseGateNode`, so the silent downgrade **cannot happen**. Prod fails *closed* (refuse the whole file) instead of fail-open (silently mis-parse one node).

This is the **"checker leads, compiler rejects" safe direction**, already blessed by SPEC §0/§6 for the v0.5 `bus`/`SHAPE` grammar (also `1.1.0`, also prod-rejected until its lowering lands). The reference checker may run *ahead* of the compiler because the gap is fail-closed: the checker accepts more, the compiler refuses what it can't yet lower. The reverse — the compiler accepting a file the checker would reject, or *mis-parsing* it — is the fail-open direction, and is what this decision avoids.

## 5. Alternatives considered — and why rejected

| Alternative | Why rejected |
|---|---|
| **Allow `cut(field)` under `1.0.0`** (no version bump) | The silent-downgrade fail-open above. Violates §4.2. |
| **Patch prod `parseGateNode` to parse `cut(field)`** | Out of the RD-0340 file scope (the prompt scopes changes to the checker + SPEC + docs, not `gate-parser.ts`); larger blast radius (changes the prod `GateNode` shape + its test surface); and unnecessary — version-gating achieves fail-closed with zero prod code change. This becomes the right move only when the field↔cut **lowering** is built (a separate increment), at which point prod's accept set gains `1.2.0` deliberately. |
| **Patch prod to REJECT `cut(field)` loudly under `1.0.0`** | Still a prod code change for a transitional state; version-gating already makes prod reject the file (via the version, one layer up) with no new code. |

## 6. Verification that nothing breaks

- **Prod tests use inline fixtures, not the on-disk examples** (`gate-parser.test.mjs` — `VALID`/`FLOW_GATE` string constants). Migrating `docs/examples/gate/01–05` to `1.2.0` does not touch any prod test.
- **Prod already tests the reject path**: `gate-parser.test.mjs` asserts a future `@version 2.0.0` refuses with zero flows — a `1.2.0` file being rejected is *designed, tested* behaviour, not a surprise.
- **keep-green `C2` checks the ZT `examples/` corpus, not Galerina's** — the migrated Galerina examples are isolated from the ZT build gate.
- Reference checker self-test **164 → 172**, keep-green **15/15**, migrated examples **5/5** green.

## 7. Residual + follow-through

- **Owner-gated:** the Option-1 breaking flip (REJECT — not warn — an *un-annotated* privacy cut) forces every privacy `.gate` to `1.2.0`; hold until the tree is annotated.
- **When the field↔cut lowering is built:** add `1.2.0` to prod `GATE_SUPPORTED_VERSIONS` *and* extend `parseGateNode` to parse the cut-set in the same increment — never one without the other (that reintroduces the exact silent-downgrade this record exists to prevent).

**Principle for the file:** a second parser must never *reinterpret* a construct it does not understand. Given two fail directions — reject the whole file, or silently re-type one node — always take the reject. Gate the new grammar behind a version the old parser refuses, so "old tool meets new format" is a loud refusal, not a quiet mis-read.
