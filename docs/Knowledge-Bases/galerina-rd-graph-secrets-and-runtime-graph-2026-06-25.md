# Graph R&D — does the .graph expose secrets? + would a live runtime-updating graph help? (2026-06-25)

Owner asked two things about "graph": **(A)** does the `.graph` each component ships **expose any secret** (per
component)? and **(B)** — clarified — "graph" also means a graph that lives **in compute and dynamically updates
at runtime to help**: would that help governance/perf, ZT-safely? Workflow `wf_6a574e64-8e3` (9 agents;
secret-scan per component class + runtime-graph per angle; the synth agent hit a transient rate-limit but every
per-component/per-angle finding completed).

## (A) Does the static `.graph` expose secrets? — **CLEAN, all classes, adversarially verified**

| Component class | Leak? | ZT |
|---|---|---|
| Crypto / secrets / proof (ext-secrets-tmf, ext-secrets-vault, ext-tmf, ext-proof-snarkjs) | **none** | 96 |
| Compiler core (galerina-core-*) | **none** | 95 |
| Runtime / kernel / tower (admission) | **none** | ~92 |
| External / substrate bridges (ext-bridge-*, photonic) | **none** | 96 |
| Devtools + example-app + misc | **none** | 96 |

The `.graph` is **pure derived structural metadata** over already-public code: package name, repo-relative
`src/*.ts` paths, import edges, **bare (version-less)** dep specifiers, and integer counts. **Adversarial
negative control proved it omits the sensitive data the source carries:** agents grepped every class's `.graph`
for absolute paths / `C:\` / `desig` / `/Users/` / semver versions / hosts / tokens / `BEGIN ` — **all absent**,
while confirming the *source* genuinely has them (e.g. `vault-client.ts` references `VAULT_DEV_ROOT_TOKEN_ID` +
the dev host `127.0.0.1:8200` + the `X-Vault-Token` header — none of which appear in any graph artifact). For
the `private:true` core packages the disclosure baseline is the git repo, and the graph is a strict **subset** of
`git ls-files` — it cannot reveal a path the repo doesn't already show. **No remediation required.** (Only
hygiene note, non-security: the import scanner wrongly extracts `${fn.name}`/`${imp.module}`/`memory` from
`wat-emitter.ts` template strings into `externalDeps` — phantom deps, expose nothing.)

**The one caveat — and it's the bridge to (B):** this clears the **static, build-time** graph only. A
**runtime/observed** graph (the owner's dynamic-graph idea, and the #102-104 surface) **must re-clear this bar**,
because runtime *values* are the one place a secret could actually enter a graph artifact.

## (B) Would a live, dynamically-updating-in-compute graph help? — three angles, one ZT rule

| Angle | Help? | Verdict | Why |
|---|---|---|---|
| **Governance** (live dataflow/taint/provenance sharpening K3, capability tracking) | partial | **track** | Galerina *already built the load-bearing piece*: `admission-feedback.ts` (telemetry→K3) IS a live runtime-updating governance signal — a per-channel reading folds via `vAnd=min` (No-Coercion). A unified "runtime governance graph" = more edge-only degrade-only operands; safe **iff** it inherits degrade-only by construction (can throttle ALLOW→INDETERMINATE→DENY, never manufacture an ALLOW). |
| **Performance** (live graph driving memoization / pruning / hot-path scheduling) | already-have | **REFUTE — do NOT build** | The perf jobs are already done from **structure, not values** (`execution-graph.ts` = build-once AOT). A graph that updates *during* compute to drive memoization **must observe runtime VALUES** (which branch a secret-dependent condition took, which keys are hot) — that observation **is a side channel**: cache-hit timing + per-branch counters leak the sealed value that steered them. This is the dangerous case the governance loop deliberately avoids. |
| **Provenance / observability** (read-only live structural sidecar, cf. R&D-0050 telemetry exporter) | partial | **track** | Real win: provenance topology the static artifacts can't give. Partly shipped (`exposition.ts` streams governance state per scrape). Safe **iff** it emits graph **STRUCTURE** (node = flow, edge = effect-FAMILY via `effectFamily()`), **never the tainted/secret VALUE** that flowed along the edge. |

### The unifying ZT rule for any runtime graph
> A graph that updates **during compute** is ZT-safe **iff** it carries **STRUCTURE, not DATA**; is
> **degrade-only** (folds via `vAnd=min`, No-Coercion — can tighten governance, never loosen); and **never
> observes a value** (observing a value to optimize is a side channel that leaks it).

**Governance and provenance fit that rule** (edge-fired / edge-K3-denied booleans, effect-family edges) and are
worth tracking — and Galerina already has the safe primitives (`admission-feedback.ts`, `exposition.ts`,
`taint-checker.ts`'s `Tainted<T>`). **Performance fundamentally cannot** — it needs values — so a
runtime-updating *perf* graph is the one to refuse. The honest framing: don't build a "live perf graph"; do
consider unifying the *already-degrade-only* governance/provenance signals under a graph model, structure-only.

*Source: workflow `wf_6a574e64-8e3` (2026-06-25). Companion: the static-graph benchmark + per-component
realization docs; the runtime caveat ties to the #102-104 observed-surface work.*
