# Graph, TODO and ledger refresh — 2026-09-22

**Overall: FINDING; not a complete fresh graph set.**
Later security status for this HEAD lives in
[security-q1q2-continuation-2026-09-22.md](security-q1q2-continuation-2026-09-22.md);
this graph receipt is not rewritten as that slice.
Base HEAD: `0f24ca30ef3f173c43a60c914c18b161327f2227`, main working tree.
Existing implementation edits, untracked files and C18 twins were preserved.
No corpus run, .fungi build/generation, staging, commit or push was performed.

## Registered graph execution

Executed `scripts/graph-all.mjs` against this worktree with the explicit
ZTF-Knowledge-Bases root. Generator controls passed 22 tests, no skips.
Component-health and status-block controls passed before publishing.

| Registered step | Result | Output / limitation |
|---|---|---|
| Package graph | REFUSED | 16 package refusals below; no replacement package graph set published. |
| Project graph | PASS | Four outputs plus provenance under build/graph. This does not override package-policy refusals. |
| Graph integrity | PASS | Existing integrity check only; not runtime TCB or complete graph admission. |
| KB graph | PASS | Four normalized outputs under build/kb-graph; external document digest, not RD decision/admission authority. |
| Dev-tool index | PASS | Repository tool index regenerated under build/dev-tool-index. |
| Fungi source capability inventory | PASS | Static inventory, no compilation or generated .fungi source. |
| Executable-family retirement graph | PASS | Regenerated staged-index view under build/ts-retirement, not all untracked working-tree files. |
| Semantic assurance graph | REFUSED | SEMANTIC_PROVENANCE_DIRTY: build/ts-retirement/ts-retirement.json. |
| Generated roadmap | NOT RUN | Orchestrator withholds it after upstream failures. Existing SVG/marker region remain stale. |

The handwritten current checkpoint in docs/ROADMAP.md was updated.
The active SVG destination is build/roadmap/roadmap.svg; the older
build/component-health/roadmap-subway.svg is historical and was not rewritten.
Graph refresh does not refresh Myco/Hypha or codebase-memory caches by implication.

## Package refusals and next action

The boundary policy for each row lives at
`packages-ts/<package>/.graph/boundary-policy.json`. The enforcement
point is `scripts/package-graph-generator.mjs:127-156`.
Review the real import and admitted package contract before changing a policy;
an extra allow-list entry is not automatically an authorized fix.

| Package | Refused surface |
|---|---|
| galerina-core-compiler | @galerina/data-json |
| galerina-core-config | node:util/types |
| galerina-core-network | @galerina/tower-citizen/governance |
| galerina-devtools-context | package.json loadedAssets escapes the package through ../../packages/fungi/products/galerina/rd0873-devtools-context/builtin-name.fungi |
| galerina-devtools-project-graph | package.json loadedAssets escapes the package through ../../packages/fungi/products/galerina/rd0873-devtools-project-graph/resource-transition.fungi |
| galerina-docs | node:util/types |
| galerina-ext-photonic-emulator | node:util/types |
| galerina-substrate-math | node:util/types |
| galerina-target-ai-accelerator | node:util/types |
| galerina-target-gpu | node:util/types |
| galerina-target-native | node:crypto |
| galerina-target-wasm | node:crypto, node:util/types |
| galerina-test | @galerina/core-compiler, node:perf_hooks |
| galerina-tools-benchmark | node:util/types |
| galerina-tower-citizen | node:module, typescript; orphan reports for src/custody.ts, dataplane.ts, governance.ts, inference.ts, kernel.ts, load-graph.ts, photonic.ts, tpl.ts |
| galerina-tri-pipe | node:crypto |

These are declaration/policy integration findings, not proof every listed
dependency is unsafe or every reported orphan is dead code. Tower export
subpaths exist; graph entrypoint ownership must describe the real load set.
The two escaping asset declarations need an admitted ownership representation,
not disabled containment checks.

Semantic assurance remains an evidence/custody hold, separate from the
package-declaration work. No staging or commit was used to bypass it.

## Ledger contract and status corrections

At the owner's request, gate summaries now allow up to 2048 characters
instead of 240. The 16384-byte whole-file limit, 240-character milestone
limit, eight-gate maximum, unique keys, path validation and control-character
refusals remain intact. Long summaries are preserved, not truncated.

Tests: scripts/tests/status-ledger-summary.test.mjs. The old implementation
failed the 241/2048-character acceptance cases; after the bounded change all
eight positive/negative checks passed. The broader dev-tool suite initially
found stale retirement counts in the ledger; the refreshed graph now reports
565 TypeScript paths, 2544 unexecuted Fungi sources, 57 host boundaries,
95 package dependency trees and one nested package. These are snapshot
counts, not new execution evidence. After reconciling the ledger, the focused
summary and broader dev-tool suites passed 54/54 with no skips.

The [Tower/C17 review](rd1295-c17-review-2026-09-22.md) owns the two confirmed
source defect groups, original 85-test evidence and the later independent
93-test repair verification plus four original probes. Root and affected package TODOs,
blocker chapters/manifest, roadmap and ledger now distinguish those defects
from contract limits, implementation-session reports and authority holds.
Source changed concurrently after the graph snapshot; the graph result is a
dated maintenance receipt, not exact-current-head assurance.
SLIDE/VOK and Lyth TODOs record the upstream state without claiming fresh
execution or re-admission. Dated historical ledgers were not overwritten.

Task-local audit maps and complete command receipts are retained under
`maintenance-20260922`. That path is a task-artifact label, not repository CI.
Nothing here grants production, signing, conversion or release authority.

Final documentation checks used the canonical Anti-Drift implementation:
71 self-test fixtures passed; both new reports have no supported-static-claim
findings, manifest chapter anchors are unique and ledger evidence paths exist.
An earlier junction invocation returned empty exit 0 and was treated as
unverified, not self-test evidence. The combined pre-existing chapter diff
still contains Markdown hard-break trailing spaces; no clean Git-diff
assertion is made and unrelated formatting was preserved.
