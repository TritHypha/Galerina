# Fungi-only source marker design

**Status: DRAFT FOR OWNER REVIEW, NON_AUTHORIZING.**

Base: Galerina `main` `bdb5d1baa9fd97a3b0ac8a16cb074809a2d00567`. Branch `grok/fungi-memory-scaffold-20261017`. No TS body is reduced in this brief. Capture the frozen set first; stubbing before capture refuses.

## Standing owner rulings

- No null or NaN; typed uncertainty only.
- Every match/switch ends with an exhaustive fail-closed `_ =>` or default arm that refuses (Rust Ok/Err may omit `_ =>`).
- A shared C-boundary helper turns foreign NULL/NaN/Infinity into typed UNKNOWN/Ambiguous; these values do not exist in .fungi.
- U4: evicted/live/default operation states report DELIVERY_UNKNOWN.
- v1 crypto is hybrid classical + post-quantum behind a swappable modular interface; no v3 crypto work now.
- Rust is only an independent out-of-process verifier; the compiled .fungi runtime contains no Rust.
- No GitHub CI and nothing that triggers it; every commit carries [skip ci]; no force-push, rebase, or --no-verify; nothing deleted without Phillip.
- Synthetic data and keys only; never export RD bodies or keys.
- FULL AUTO: don't stop to ask; make the zero-trust choice and record it. Verify, never assume.


## Converter sequence (Addendum C)

1. AGENTS `skills/code-logic-workbench` + `tools/code-logic-workbench.mjs` (analyse, planning evidence only; `authorizing: false`).
2. `skills/translating-typescript-to-fungi`.
3. `skills/writing-fungi`.

This corrects Addendum B: the JS analysis tool exists (workbench). Galerina `scripts/lib/ts-to-fungi-sandbox/*.mjs` is a re-checked fallback only. No new converter.

Conflicts (obligations win):

| id | rule | refusing default |
|---|---|---|
| C1 | Where TS behaviour is null/NaN, throw-as-outcome, live getters, species, aliasing or truncation, do not preserve it; record an intended divergence with the obligation id and a refusal probe | preserving the forbidden TS behaviour refuses |
| C2 | Workbench HOLD on UNKNOWN obligations is evidence; conversion continues (A1). REFUSE (stale graph, wrong head, malformed request) stops that unit | treating HOLD as permission refuses |
| C3 | PROPOSED and REUSE/WRAP/ADAPT/BUILD are recommendations only, never permission | treating them as admission refuses |
| C4 | sandbox is re-checked fallback only | a new converter refuses |
| (unlisted) | refuses | this row |

Owner A1: converting memory files to `.fungi` is not blocked by the RD HOLD / TODO gate. RDs stay HOLD. Converted units stay unmerged to main. A2: fallback folder if a repo audit refuses `packages/fungi/memory/` is `packages-development/<name>/`. Never `packages-ts`.

## Header grammar

First lines of a retired `.ts` / `.mjs`:

```
// @fungi-only-source <repo-relative .fungi path> v<N> -- <one-line reason>
// @fungi-oracle <repo-relative frozen-set path> sha256:<64 lowercase hex>
```

EBNF:

```
retired-header  = fungi-only-line NL fungi-oracle-line NL
fungi-only-line = "//" SP "@fungi-only-source" SP fungi-path SP "v" version SP "--" SP reason
fungi-oracle-line = "//" SP "@fungi-oracle" SP frozen-path SP "sha256:" sha256
fungi-path      = relative-path ".fungi"
frozen-path     = relative-path ".frozen.json"
version         = NONZERO { DIGIT }
sha256          = 64 * HEX
reason          = { CHAR - NL }
relative-path   = relative segment { "/" segment }   (* no ".." *)
HEX             = "0".."9" | "a".."f"
SP              = " "
NL              = "\n"
```

A path containing `..`, a missing file, or an uppercase hex digest is `MARKER_MALFORMED`.

## Body

Each export keeps its signature but returns (or, where the signature cannot carry it, throws) a typed refusal:

`{ kind: "REFUSED", code: "TS_RETIRED_FUNGI_ONLY", source: <.fungi path>, version: <N>, authorityReleased: false, admissionAuthority: false }`

plus `export const FUNGI_RETIRED = Object.freeze({ ...same fields })` as a sentinel. Never empty, never a silent no-op.

## Barrel-import caveat

A top-level import-time throw breaks every importer. Example: `packages-ts/galerina-framework-app-kernel/src/index.ts` re-exports `secret-gate`. Import-time throw is allowed only when no barrel or other module imports the file (prove it with a grep at the retiring commit); otherwise use per-export refusal.

## Ordering

1. Capture the frozen set from the live TS (see readiness audit frozen-reference capture plan).
2. Re-pin.
3. Reduce the body to the marker stub.

Stubbing before capture destroys the oracle and must refuse.

## Tool treatment (spec only; not implemented)

| tool | treatment | refusing default |
|---|---|---|
| ts-to-fungi-sandbox classifier | marked file is not converted; outcome `BLOCKED` with typed code `FUNGI_ONLY_SOURCE` | `NO_RUNTIME_BEHAVIOR` or empty output refuses |
| `scripts/conversion-queue.mjs` | classification `SUPERSEDED_BY_EXISTING_FUNGI`, reason `FUNGI_ONLY_SOURCE`, `evidenceDigest` = sha256 of the target .fungi | unlisted classification refuses |
| `scripts/ts-retirement-graph.mjs` | new row "Retired to fungi-only" (not "Twinned"); still tracked until the backup move | dropping the row refuses |
| `scripts/audit-kernel-fungi-twins.mjs` | a stub `.ts` with the same stem still counts as "TS present" (`sameStemTsPresent`). An authoritative twin needs a valid frozen set or must stay on `FROZEN_DEFERRED`. Dropping a deferral without a frozen set is RED ("missing"). A deferral left after capture is RED ("stale-deferral"). This is intended. | unlisted frozen state refuses |
| proposed `scripts/audit-fungi-only-markers.mjs` (NOT implemented) | header parses; target .fungi exists at HEAD and passes `galerina check`; frozen-set path exists, loads with the strict loader, sha matches; body is only the refusal stub | see codes below |

Marker audit codes (closed):

| code | meaning |
|---|---|
| MARKER_MALFORMED | grammar or path fails |
| MARKER_TARGET_MISSING | target .fungi missing or `galerina check` fails |
| MARKER_ORACLE_MISMATCH | frozen-set missing, unloadable, or sha mismatch |
| MARKER_BODY_NOT_STUB | body is not only the refusal stub |
| MARKER_REFUSED | unlisted failure (default) |

Every switch over these codes ends with a refusing default.

## Later backup move (plan only)

One commit `git mv <file> packages-ts-retired/<same relative path>` (top-level folder, so no workspace registration) plus `packages-ts-retired/RETIRED-INDEX.json` (path, pre-move blob sha, target .fungi, frozen-set path, commit). Message ends `[skip ci]`. Regenerate `build/ts-retirement` and `build/conversion-queue` in the same commit. Nothing deleted. Owner pushes. Needs Phillip's go per file group.

## Outcome table

| outcome | meaning | refusing default |
|---|---|---|
| MARKED | headers valid, body is the refusal stub, oracle pinned | |
| BLOCKED | classifier `FUNGI_ONLY_SOURCE` | |
| REFUSED | any other state | this row |
