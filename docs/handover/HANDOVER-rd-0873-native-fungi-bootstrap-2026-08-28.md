# RD-0873 native Fungi bootstrap handover

## Current restart addendum - 2026-09-05

This addendum supersedes the older clean-route instructions in this handover
only for the current Task 6C restart. Preserve the remainder as historical and
architectural context.

**Current status:** Task 6B is saved locally at
`1795ee2f5679d47ecdc2da30a501f321cc5248b3`. Task 6C is `HOLD`, not GREEN, on
`codex/rd0873-task6c-frozen-frame-candidate` at frozen HEAD
`f0de2475a7ff6f67849a25855d3c1fb45d535048`. Its intentional unstaged state is
15 Task 6B overlay paths plus four Task 6C paths, with no staged paths. Do not
clean, restore, stash, switch, merge or broadly stage that worktree.

On restart:

1. Read `AGENTS.md` completely and rediscover the installed bespoke skills.
2. Open the first section of `docs/TODO.md` and `docs/ROADMAP.md`, then
   `.superpowers/sdd/2026-08-31-rd0873-portable-artifact-admission/progress.md`,
   `task-6C-report.md`, and `task6c-byte-authority-adjudication.md` in the active
   worktree.
3. Recheck the exact branch, HEAD, index and 19-path working-state accounting
   before touching any file. Treat any mismatch as concurrent custody and
   stop the affected action.
4. Treat the AGENTS amendment at
   `0af3aba081367a93007bf523547b16cbc9f9f471`, tree
   `f83dbd08632d8296e9a38fe6e55b49aa3b72e18c`, as `PROPOSED` only. Its plan
   SHA-256 is
   `489ff683fac1a72db749aceb0eb81aef587cfea3325f6919c9216bf787cd39e2`
   and its design SHA-256 is
   `feb55fb4323a3ed023026de2f083939d264a7925eedbd17fd9234d8363aba1a5`.
   Both immutable reviews passed, but owner exact-byte approval and the
   append-only receipt are still absent.
5. After that receipt only, repair and independently review the two-path Task
   6B retained-`Map` boundary before resuming the four Task 6C paths. Preserve
   test-first evidence and stop again before hosted observation or Task 7.

The protected `build/graph/Galerina_GRAPH_REPORT.md` remains pathname-only: do
not inspect, hash, diff, edit, restore, stage, regenerate or commit it. The
older compact instruction to regenerate indexes is suspended for this
checkpoint; graph/index regeneration remains explicitly unauthorized.

Memory preflight currently has findings: its Galerina working-set locator is
stale and two generated top-level memory files are misclassified. Daily
housekeeping returned exact state `HOUSEKEEPING REFUSED`, exit 2, because the
live task log changed during its own read. Neither result authorizes cleanup.
After restart, rerun both checks from the canonical AGENTS source; a live task
may continue to prevent a complete housekeeping inventory.

No push, merge, publication, signing, external-key use, hosted run, graph/index
refresh, Task 7 or `.fungi` authoring is authorized by this addendum. Derive the
current handover commit with Git after restart rather than embedding a future
self-reference here.

**Status:** pre-selection foundation complete through Task 5; exact owner
approval of the repaired source-origin design candidate is recorded; Tasks 2-8
of its plan remain to be committed, independently reviewed and reproduced at
one exact HEAD, so Task 6 is `HOLD` and Task 7 has not started.

**Purpose:** restart-grade instructions for the source-origin implementation
boundary that must close before Task 6 may select, and before Task 7 may author,
one bounded Galerina-specific `.fungi` slice.

This document is a locator and operating contract. The governing design, plan,
RD, source, tests and receipts remain in their owning files. Do not turn this
handover, memory, a graph, or an external-model answer into implementation or
admission authority.

## 1. Opening prompt for the new task

```text
Resume RD-0873 in <GALERINA_ROOT>.

Start fail-closed. Read AGENTS.md completely. Use the installed AGENTS skills,
including adaptive-effort-governor at governed checkpoints,
codex-zero-trust-project-operations, codex-zero-trust-engineering,
codex-querying-galerina-rd, codex-querying-galerina-graphs,
translating-typescript-to-fungi, writing-fungi, test-driven-development and
verification-before-completion.

Use codebase-memory before any code search. Use the worktree-aware Myco/Hypha
controller only when the graph cannot answer the lexical or worktree question.
Do not restore or use Graphify. Do not use broad grep, glob or filesystem
crawls. Open exact owner source after following a graph/index locator.

Read these tracked owners before editing:
- docs/TODO.md, first RD-0873 section;
- docs/superpowers/specs/2026-08-28-rd-0873-native-fungi-bootstrap-design.md;
- docs/superpowers/plans/2026-08-28-rd-0873-native-fungi-bootstrap.md;
- docs/handover/HANDOVER-rd-0873-native-fungi-bootstrap-2026-08-28.md.
- <AGENTS_ROOT>/docs/superpowers/specs/2026-08-30-galerina-source-origin-logic-aig-design.md.
- <AGENTS_ROOT>/docs/superpowers/plans/2026-08-30-galerina-source-origin-logic-aig.md.

Resolve RD-0858 and RD-0873 through codex-querying-galerina-rd. Private RD
metadata is locator-only unless the task has explicit private-KB custody. Treat
STALE, PRIVATE, AMBIGUOUS, MISSING and HOLD exactly as returned.

Before any implementation, verify the completed Myco/Hypha source-owner closure
recorded in docs/independent-audits/2026-08-28-myco-hypha-source-owner-sync-pass.md.
Public Myco main must contain the pinned source-owner commit, public Hypha must
remain exact, and the Galerina package audits must reproduce the declared
partial fork and vendored extractor. Myco and Hypha are single-root evidence
engines; AGENTS remains the sole Git/multi-worktree controller.

Use only the dedicated clean restart route: branch
`codex/rd0873-source-origin-galerina` in worktree
`.worktrees/rd0873-source-origin-galerina`. Verify that exact worktree root,
branch, HEAD, tree, staged state and tracked/untracked dirt before implementation.
Require both ancestry checks to exit 0 at its live HEAD:

```powershell
git merge-base --is-ancestor d4ea815324b108c65e80aeae98db08677a9766af HEAD
git merge-base --is-ancestor 91c422cd2694f3a77236b784ccd243463db6330e HEAD
```

Do not create, enter or reuse branch
`codex/rd-0873-native-fungi-bootstrap-implementation` or worktree
`.worktrees/rd-0873-native-fungi-bootstrap-finalize`; that pair is the
historical dirty custody surface. Do not read, copy, restore or stage from it.
Derive the live handover commit when needed with
`git log -1 --format=%H -- docs/handover/HANDOVER-rd-0873-native-fungi-bootstrap-2026-08-28.md`;
do not self-embed a future fix commit SHA. Do not write implementation on main
or on KB. Keep KB on main only.

Do not author a new .fungi candidate at task start. The Tasks 2-5 foundation
evidence is inherited in the clean route's ancestry but must be reverified at
the live exact HEAD. The old baseline approval did not approve the repaired
source-origin candidate, its
eleven-input atomic gateway boundary or implementation. Exact owner approval of
the repaired candidate is now recorded, but it admits the design candidate only
and does not authorize Task 6 selection, .fungi authoring, pushing, merging,
publishing or use of private/offline keys. Task 6 remains `HOLD` until that
approval and Tasks 2-8 of its plan are committed, independently reviewed and
reproduced at one exact HEAD.

The atomic gateway must then accept one immutable complete PROJECT receipt and
emit the exact gateway-result digest plus a `ZERO_APPLICABLE` obligation digest.
Freeze the Task 6 selection report with those two digests and exactly
`candidateState: NOT_AUTHORED`; do not embed a future review, continuity,
approval or other receipt digest. Begin Task 7 only after later separate
selection-review, continuity, continuity-review and owner-approval receipts bind
those exact report bytes.

Implement RED first, then the smallest GREEN change. Every branch, refusal,
timeout, cancellation, crash, overflow and impossible state must reach one
explicit terminal exit. Keep every writer sequential. Read-only disjoint audit
lanes may use bounded-tool-batch at default concurrency 2 and hard ceiling 4.

Stop before any bulk conversion, profile 64/256 work, compatibility profile 32,
TypeScript retirement, Trametes, quantum products, .gate synthesis, production
admission, release or runtime profile substitution. Those are outside RD-0873.
```

## 2. Governing authority chain

Open these in order and preserve supersession rather than selecting a convenient
older statement:

1. `AGENTS.md` - repository rules, language syntax, graph-first discovery and
   generated-output duties.
2. `docs/TODO.md` - the first dated RD-0873 section is the current queue.
3. `docs/superpowers/specs/2026-08-28-rd-0873-native-fungi-bootstrap-design.md`
   - adopted architecture and invariants.
4. `docs/superpowers/plans/2026-08-28-rd-0873-native-fungi-bootstrap.md`
   - dependency-ordered implementation steps, exact files and focused checks.
5. `<AGENTS_ROOT>/docs/superpowers/specs/2026-08-30-galerina-source-origin-logic-aig-design.md`
   and `<AGENTS_ROOT>/docs/superpowers/plans/2026-08-30-galerina-source-origin-logic-aig.md`
   - exact owner-approved design candidate and its byte-bound plan locator; the
   approval is non-authorizing for Task 6 selection, `.fungi`, publication and
   private-key actions, and Tasks 2-8 still require exact
   implementation/review evidence.
6. `RD-0873` in the KB - private planning decision. Query metadata first; do
   not copy its body into Galerina, prompts, indexes or memory.
7. RD-0858 - pre-conversion admission. It must be resolved live; an old receipt
   or design-only statement does not reopen conversion.
8. RD-0855, RD-0792 and RD-0753 - retained checked-source, detached GIR,
   SLIDE/VOK and later non-authorizing synthesis architecture.
9. The exact source, tests and generated receipts at the verified implementation
   HEAD - final implementation evidence.

The handover commit is the commit containing this file. Never hard-code a later
HEAD into this document. Derive live identities from Git.

## 3. Definitions

| term | binding meaning |
|---|---|
| Trit | one widthless semantic value in `{−1, 0, +1}`; not a packed lane and not a governance Verdict |
| Verdict | typed governance decision with distinct allow, deny and ambiguous/unknown meaning; byte resemblance to Trit does not merge the brands |
| physical profile `1` | mandatory scalar oracle and the only profile admitted by RD-0873 |
| physical profile `64` | preferred ordinary packed execution profile; outside this chapter |
| physical profile `256` | high-throughput virtual-CPI profile only when separately admitted; outside this chapter |
| profile `32` | compatibility fallback reached only by admission-time replanning with a new identity and receipt |
| GIR | width-independent canonical semantic intermediate representation emitted from checked Galerina source |
| SLIDE | owner of physical profile binding, independent execution and re-admission evidence |
| VOK | exact-subject verification/admission component in SLIDE; may issue one opaque affine lease, never a reusable Boolean or receipt-shaped capability |
| Lyth | proof-work and experimental evidence owner; cannot mint `ALLOW` |
| `.fungi` | Galerina governed source; author only with live compiler-proved syntax and explicit failure/exit algebra |
| `.gate` | later non-authorizing laboratory synthesis source; not the current backend and not part of RD-0873 |
| WORKSET | exact changed candidate files plus declared neighbours; fast author feedback only |
| PROJECT | every tracked admitted `.fungi` file; repository closure profile |
| PASS | exact complete admitted evidence satisfies the closed contract |
| FINDING | the admitted check completed and found a material violation |
| REFUSED | the request, evidence, runtime or bounds did not permit the check to make the claimed decision |
| HOLD | higher-level incomplete, conflicting, stale, missing or non-green evidence blocks progression |
| receipt | inert exact-scope evidence; never self-authorizing and never a reusable execution licence |
| Hallmark/Brand | type/provenance identity that prevents equal-looking runtime values from being treated as equal authority |
| explicit exit | a typed return, refusal, trap/fault under its proved contract, or explicit continuation that is guaranteed to reach a terminal result |

## 4. Directory map

All committed locators are repository-relative. Supply owner roots at runtime;
never commit machine-local paths.

```text
<GALERINA_ROOT>/
  AGENTS.md
  docs/TODO.md
  docs/ROADMAP.md
  docs/handover/
  docs/superpowers/specs/
  docs/superpowers/plans/
  governance/
  scripts/
    lib/
    tests/
  packages-ts/
    galerina-core/
    galerina-core-compiler/
    galerina-core-cli/
    galerina-tools-myco/
    galerina-devtools-hypha/
  packages/
    fungi/                         reserved native source root
      shared/                      only after proved multi-product reuse
      core/                        proved product-neutral runtime/compiler capabilities
      products/
        galerina/
          rd0858-unit4-scalar-oracle/
        trametes/                  closed in RD-0873
    gate/                          later non-authorizing laboratory lane
  build/
    graph/
    roadmap/

<KB_ROOT>/
  AGENTS.md
  research/
  private/research/rd/RD-0873-native-fungi-bootstrap-and-bounded-parallel-assurance-PRIVATE.md

<AGENTS_ROOT>/
  skills/
  tools/audit-map.mjs
  tools/bounded-tool-batch.mjs
  tools/git-custody-audit.mjs
  tools/code-logic-workbench.mjs
  tools/myco-hypha-worktree-scan.mjs

<SLIDE_ROOT>/                     physical execution and VOK owner
<LYTH_ROOT>/                      proof-work owner
```

`packages-ts/` contains the executing bootstrap/tool estate. Published npm
package names may still contain `galerina`; directory identity and package name
are separate. `packages/fungi/` and `packages/gate/` are typed source roots, not
signals that a package or product is admitted. Unknown product, family, build
mode or profile values refuse.

## 5. Retained execution architecture

```text
checked Galerina source
  -> immutable checked snapshot
  -> width-independent canonical GIR
  -> detached artifact
  -> SLIDE binds exact target/provider and physical profile
  -> SLIDE independently re-imports, executes and re-admits
  -> VOK validates the exact semantic bytes, profile contract and physical package
  -> one affine execution lease
  -> execution
  -> one terminal receipt or typed refusal
```

Profile choice is deterministic, pre-admitted and receipt-bound. A fabric,
learned system, virtual CPU or provider may report capabilities or propose a
profile; it cannot authorize its own choice. If `256` is unavailable in a later
chapter, replan before execution to `64`, then `32`, then `1`. Every replan has a
new identity and receipt. Runtime rescue and silent substitution are forbidden.

## 6. Current checkpoint and blockers

The implementation branch is published through
`e77598e4f03b4181d3a26fd258bf682c2becddce`. Tasks 2-5 closed the three
pre-Fungi foundation roots without rewriting historical receipts: the protected
corpus completed 16/16 terminal shards over 2,719 files with zero unprocessed
files; queue v3 classified 1,581/1,581 executable paths and retained seven
scoped candidates; conversion closure and phase-close authority were hardened;
and focused phase-close wiring verification passed 119/119 with independent
Critical 0 / Important 0 review.

The provisional Task 6 candidate is
`packages-ts/galerina-core-config/src/index.ts#isEnvironmentMode`, with future
native target
`packages/fungi/products/galerina/rd0873-first-native-slice/slice.fungi#isEnvironmentMode`.
It is not an approved selection and no Task 7 `.fungi` source exists.

Task 6 is now held at a different boundary. The native graph has a documentary
ontology rather than Workbench logic semantics, and local codebase-memory
produced a known confidence-0.21 false `has` edge. The repaired AGENTS design
and candidate implementation plan therefore require a source-origin PROJECT
graph, sidecar/manifest/envelope custody, a non-bypassable atomic gateway and a
digest-bound zero-applicable-unresolved obligation. Their candidate commit is
`ab57f8919a66651be809f65a2683d602d5b8ce0e`, tree is
`eacbfe22dd54ac859f2d481a42bf4f680d6b1998`, design raw SHA-256 is
`0abdef45717f0c20d6e697f6f63db17bad7f25aa1e64ecc3019a1b974f89a058`
and plan raw SHA-256 is
`4f5feb8451af8931ed3de79cc27358721443a5e874de9b6a729e7c94edb21477`.

The old baseline approval did not approve this repaired candidate, its
eleven-input gateway boundary or implementation. Exact owner approval of the
candidate commit/tree and raw design/plan bytes above is now recorded by the
non-authorizing AGENTS receipt at commit
`add1bb404af5b6d79e02570f5f977981cdf68663`, path
`docs/approvals/2026-08-30-galerina-source-origin-logic-aig.json`, raw SHA-256
`647b0476bd0a79ea0de04c2c4b5546b706c43b879a805b290cf96d14e4a5a00c`.
The current AGENTS implementation head after the separate baseline test repair
is `56aa6e3328b2b417883236132fd33ddf5211da13`; the gateway boundary has exactly
11 inputs.

That approval admits the exact design candidate only. It does not authorize
Task 6 selection, `.fungi` authoring, pushing, merging, publishing or use of
private/offline keys. Task 6 remains `HOLD` until that approval and Tasks 2-8
are committed, independently reviewed and reproduced at one exact HEAD.
Workbench remains `REFUSE` until that implementation and one immutable
exact-head receipt exist.

Fresh documentation-navigation verification remains `HOLD` and made no write:
`node scripts/docs-index.mjs --dry-run` exits 0 and would write 299 indexes
linking 2023 documents; `node scripts/docs-index.mjs --check` exits 1 because
290 of 299 indexes are missing or drifted and writes 0. Do not run `--apply`;
the bounded write set is not proved.

Older `71/96`, `93/96` and `94/96` receipts remain historical evidence. They
cannot be relabelled as current repository closure. The completed scalar oracle
is bounded evidence for its own flow, not general conversion or production
authority.

The verified Myco/Hypha baseline for the next task is:

- public Myco build PASS and tests 80/80;
- Galerina Myco source-owner audit CLEAN, typecheck/build PASS and tests
  124/124;
- public Hypha self-test PASS;
- Galerina Hypha explicit vendor check current, package tests 51/51 and CLI
  self-test 58/58 under both true-LF and physical-CRLF review;
- package-root lock 100 packages / 46 internal edges / 138 external bootstrap
  edges;
- tooling contract 100 packages / 198 tools / zero violations;
- product boundary 100 packages / 10,876 edges / zero findings;
- package graph 100 packages / 201 outputs;
- repository graph/index fixed point 9/9;
- external implementation graph 66,322 nodes / 170,156 edges / zero skipped
  files at `a2c416ec65f7dc07d9cc0fca3c289b5a6dd7721e`.

The handover documentation commit is later than that implementation graph.
Refresh the external graph after reopening this file; never report the
`a2c416ec` graph as exact for a later documentation commit.

## 7. Required work order

**2026-08-30 supersession note:** Phases B-E below describe the implemented
foundation and remain as the execution record. The active next phase is not
direct slice selection. Exact owner approval of the repaired AGENTS design
candidate is recorded; now complete Tasks 2-8 of that plan under independent
review at one reproducible exact HEAD. Only after its atomic gateway mints one
exact PROJECT receipt and `ZERO_APPLICABLE` obligation may Phase F resume.
Phase G remains closed.

### Phase A - reopen and pin owners

1. Verify Git custody, branch, HEAD, tree, remotes, worktrees and dirt.
2. Resolve RD-0858 and RD-0873 through the RD adapter and preserve returned
   freshness/status.
3. Verify the external Galerina graph build point equals the chosen base HEAD.
4. Run bounded probes for the specific Corpus Audit, queue and receipt owners.
5. Open exact source only after locating it through codebase-memory.

### Phase B - Corpus Audit v2 contract

Implement plan Task 2 exactly:

- `scripts/lib/fungi-corpus-receipt.mjs`
- `scripts/tests/fungi-corpus-receipt.test.mjs`
- `scripts/lib/fungi-corpus-shards.mjs`
- `scripts/tests/fungi-corpus-shards.test.mjs`

The request and receipt schemas are closed. Bind HEAD, tree, product, canonical
relative path, content digest, expectation digest, compiler/toolchain digest,
mode, exact file-set digest and positive file/byte/time/output bounds. Reject
surplus or case-shadowed fields, accessors, proxies, symbols, non-NFC strings,
unsafe integers, absolute/traversal paths, duplicate/unsorted files, zero bounds
and stale identities.

Prove RED before implementation, GREEN afterward, then permanently mutate file
order, one digest, a shard boundary and one terminal status to prove the controls
can fail.

### Phase C - isolated shard execution

Implement plan Task 3. Each deterministic shard owns a disjoint ordered range,
writes no repository source/shared cache, and must return `PASS`, `FINDING` or
`REFUSED` on every terminal path. Timeout, cancellation, crash, overflow and
output-limit failure must identify completed and unprocessed files. Aggregation
must reject missing, duplicate, foreign, stale, overlapping or unfinished
receipts. Resume accepts only the exact same repository, file-set and toolchain
identity.

### Phase D - bounded audit fabric

Implement plan Task 4 by describing Galerina tasks in an audit map consumed by
the canonical AGENTS owners. Do not copy or fork the AGENTS tools.

Parallel lanes may include only disjoint read-only shards, bounded snippet/static
checks, documentation/locator checks and independent review vectors without
shared mutable outputs. Default concurrency is two; four is the hard ceiling.

Keep these as exclusive barriers: Git effects; graph/index/registry/roadmap/docs
writers; Myco refresh; shared builds/caches/temp roots; full estates; final
aggregation; signing; SLIDE execution; VOK admission.

### Phase E - conversion queue and receipt scope

Implement plan Task 5. Receipt v2 binds exact product, package, file, symbol,
source HEAD/tree/digest, target locator/digest, governing RD/plan digests, gate
order/evidence digests, exclusions and scalar profile `1`. It remains
`authorizing:false`.

Regenerate queue v3 from the current retirement ledger and exact-scope decisions.
It must conserve every executable path and refuse unknown, duplicate, reordered
or unscoped entries. Retain historical receipts unchanged; do not upgrade them
without exact re-observation.

### Phase F - select one slice

Implement the repaired plan Task 6 only after the mandatory atomic
`galerina-source-origin` gateway has accepted one complete exact-head PROJECT
graph, sidecar, manifest and admission envelope. Use codebase-memory and
worktree-aware Myco/Hypha as bounded discovery aids; they cannot substitute for
the source-origin Workbench receipt. The selection report contains locators,
digests, relationships and reasons, not source bodies.

The gateway must derive the WORKSET from the admitted PROJECT parent, intersect
every unresolved row by exact `sourceNodeId`, and emit a digest-bound
`ZERO_APPLICABLE` Task 6 obligation. Graph-only, stale, substituted or non-zero
applicable-unresolved evidence refuses rather than producing `PROPOSED`.

The byte-final selection report records `candidateState: NOT_AUTHORED`, the
exact gateway-result digest and the exact `ZERO_APPLICABLE` obligation digest.
It embeds no future review, continuity, approval or other receipt digest. Task 7
starts only after separate selection-review, continuity, continuity-review and
owner-approval receipts bind those exact report bytes.

The selected scope must be Galerina-specific, scalar, deterministic and small
enough for one reviewer. It needs closed inputs/outputs, explicit effects, an
exit on every path, no ambient filesystem/process/network/time/randomness/host
authority, a comparable TypeScript or checked-GIR reference, no unresolved
bootstrap/platform dependency, and exact product/artifact identity.

Obtain a fresh independent Critical 0 / Important 0 plan review before authoring.

### Phase G - author the one native slice

Only now use `writing-fungi` and `translating-typescript-to-fungi` to implement
plan Task 7 under `packages/fungi/products/galerina/`.

Start with `@version 1`. New v0.1 flows may be only `pure flow`, `flow` or
`secure flow`. `safe` and `unsafe` qualify values, not flows. Never invent
`guard flow`, `safe flow`, `unsafe flow`, `else if`, `throw`, `try`, `catch`,
`for` or `loop`.

Use:

- `Bool` -> `if` or bounded Boolean `while`;
- typed `Verdict` -> `check` with terminal allow/deny/ambiguous arms;
- other closed alternatives -> exhaustive `match` with terminal `_ =>`;
- absence -> `Option<T>`;
- recoverable failure -> `Result<T,E>`;
- only proved contracts for `trap` or `fault`.

Every loop needs a finite bound, monotonic progress, proved continuation and an
explicit terminal exit. Every malformed, missing, stale, ambiguous, overflow,
limit, timeout, cancellation, partial-progress and impossible state must exit.
Mandatory cleanup/lease release/audit ordering must complete exactly once before
a typed failure crosses the flow boundary.

Do not map JavaScript `number` to `Int`, `Map`/`Set` to immutable collections,
TypedArray to immutable bytes, mutable closures to pure flows, host errors to one
String, `readonly` to runtime immutability, or a caller Boolean to verified
authority without complete differential and physical-profile proof. When exact
behavior cannot be preserved, classify the scope `BLOCKED`; never invent a
replacement.

### Phase H - closure and integration

Execute plan Tasks 8 and 9. Run WORKSET before PROJECT, then LF and physical-CRLF
controls, focused suites, final gates and declared writers sequentially. Reach
deterministic generated fixed points. Freeze the exact revision for independent
review and external challenge when required. Refresh the exact-head graph and
prove new symbols resolve with zero unexpected exclusions.

Merge only the admitted implementation branch into
`codex/rd-0858-unit4-process-root` after exact ancestry/custody, Critical 0 /
Important 0 review and merged-result verification. `main` is a later terminal
integration decision. Retire a worktree/branch only after the merged commit is
an ancestor and its worktree is clean.

## 8. Discovery and tool routing

| question | first owner | fallback/secondary |
|---|---|---|
| symbol, definition, caller, data flow | codebase-memory `search_graph`, `trace_path`, `get_code_snippet` | graph-augmented `search_code` |
| `.fungi` construct location | codebase-memory | worktree-aware Myco controller |
| current/registered worktree lexical fact | `tools/myco-hypha-worktree-scan.mjs` | exact source read |
| passive structural suspicion | Hypha through the controller | local adjudication; never authority |
| bounded regular expression | TriRegex | refuse unbounded or ambient regex execution |
| logic projection/attack/QA receipt | Code Logic Workbench | local exact-source adjudication |
| R&D decision/supersession | `codex-querying-galerina-rd` | open exact owner only when custody permits |
| Git state/branch integration | Git and Git Custody Audit | no graph or memory substitute |
| audit dependency map | AGENTS `audit-map.mjs` | none; invalid map refuses |
| bounded parallel read tasks | AGENTS `bounded-tool-batch.mjs` | sequential execution |

Myco and Hypha must report the worktree, branch, HEAD and engine identity they
actually scanned. A finding from another worktree is explicitly labelled and
cannot be reported as the current branch. `--no-refresh` makes Myco freshness
unknown; it is useful for navigation, not an authoritative absence claim.

## 9. Verification ladder

For every implementation slice:

1. write one discriminating RED control;
2. run it and prove it fails for the intended missing behavior;
3. implement the smallest GREEN change;
4. rerun the focused control;
5. run hostile one-field neighbours and mutation controls;
6. inspect the exact diff and path custody;
7. run affected LF and physical-CRLF controls;
8. run the proportionate sequential package/tool estate;
9. commit explicit paths only;
10. refresh the graph at the committed HEAD;
11. obtain independent exact-revision review;
12. only then proceed to the next dependent plan task.

For a `.fungi` candidate, at minimum run the current equivalents of:

```powershell
node galerina.mjs check <candidate.fungi> --strict-types --strict-governance
npm run audit:fungi-golden
```

Then run the candidate-specific compiler/differential tests and one
distinguishing admitted SLIDE/VOK vector. Checker acceptance is not execution
parity, physical-profile proof, consumer-switch authority or TypeScript
retirement.

## 10. Git and worktree procedure

1. Fetch the remote without changing branches.
2. Verify the published process-root remote and local branch identities.
3. Refuse divergence until it is adjudicated; never force-push as recovery.
4. Continue only on branch `codex/rd0873-source-origin-galerina` in worktree
   `.worktrees/rd0873-source-origin-galerina`, after the two ancestor checks in
   the opening prompt exit 0. Do not create or switch to another implementation
   branch or worktree.
5. Record the base commit, common Git directory, worktree path and intended path
   manifest.
6. Keep the owner-visible process-root checkout clean and visible.
7. Commit coherent units with explicit pathspecs; never `git add -A` in a shared
   or dirty checkout.
8. Preserve generated artifacts only when their owner requires them and a
   zero-write second run proves the fixed point.
9. Publish only after current authority, gates and remote freshness are proved.
10. Merge by exact fast-forward or reviewed merge, rerun the integrated checks,
    refresh the exact-head graph, then retire only proven-contained branches and
    worktrees.

KB rules are separate: use KB `main`, explicit paths, its canonical close
sequence and no KB topic branch. A red KB path, encoding, link or memory gate is
a real HOLD; do not disable it or call it green.

## 11. Stop conditions

Stop the affected action and return `HOLD`, `REFUSED` or `BLOCKED` when:

- repository, worktree, branch, HEAD, tree or path custody is unknown;
- an expected owner or graph build point is missing, stale or mismatched;
- RD-0858 has not explicitly reopened the exact conversion scope;
- the corpus, queue or receipt foundation is not completely green;
- a terminal receipt is missing on timeout/cancellation/crash/overflow;
- a read-only parallel task shares a mutable output or writer;
- a source behavior, effect, type, error, alias, encoding or physical ABI cannot
  be preserved;
- any branch or wildcard can reach privileged work without an explicit typed
  exit;
- the candidate has no exact semantic/GIR differential control;
- SLIDE/VOK evidence is absent, stale, foreign or non-exact;
- independent review reports Critical or Important findings;
- a requested action widens into another product, profile, `.gate`, retirement,
  production or release chapter.

Unknown is never PASS. A timeout is never a clean skip. An index MISS is valid
only when the exact owner and build point are complete and fresh.

## 12. Close-out format for the new task

End each completed queue/chapter with:

```text
Done.... <one-line exact outcome>

Summary
- [x] passed/completed facts
- [!] findings, refusals or residual limits

Key files
- repository-relative locators

Owner Decisions
- none, or the exact unresolved decision

Time
- whole seconds or minutes; do not report sub-second noise
```

Before compact or shutdown, update the living TODO/roadmap only for verified
state, regenerate required indexes to a zero-write fixed point, run read-only
housekeeping, check memory staleness without warehousing task bodies, commit the
exact handover paths, and report publication state explicitly.

## 13. Known host-level notes at handover

- The global Myco npm launcher was relinked from the retired
  `packages-galerina/galerina-tools-myco` junction to the canonical
  `packages-ts/galerina-tools-myco` package. Re-verify `myco --help` and the
  target junction in the new task; do not trust this historical statement as a
  live capability.
- The KB close manifest and operator manual were updated to the `packages-ts`
  Myco path. The link, path and encoding checks were green after the repair.
- KB publication was held because the selected GitHub memory store reports
  stale volatile facts. That is memory-owner work, not permission to bypass the
  gate.
- Large Codex logs were inventoried separately. Verified private cold bundles do
  not authorize deleting live or archived task sources while Codex is open.
- The external Galerina graph must be refreshed again after this handover commit;
  the prior RD-0873 graph receipt is not exact for later commits.
