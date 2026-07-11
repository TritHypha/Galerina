# Galerina diagrams

Rendered SVG architecture diagrams. All use a shared palette so the set reads as one system:

- **teal** = trusted core / runtime · **blue** = compile-time / gate · **amber** = governed-but-untrusted (ext / lanes) · **gray** = declared host floor (native) · **red** = REJECT / leak · **purple** = cross-cutting invariant.

| Diagram | What it shows | Read it with |
|---|---|---|
| [galerina-full-stack.svg](galerina-full-stack.svg) | the whole stack, source → governed runtime | the system overview |
| [galerina-mechanics.svg](galerina-mechanics.svg) | the governance-first compile→sign→gate pipeline | `galerina-kb-index.md` |
| [galerina-compiler.svg](galerina-compiler.svg) | Stage-A compiler internals | `project-galerina-compiler-gaps.md` |
| [galerina-compiler-pipeline-foresight.svg](galerina-compiler-pipeline-foresight.svg) | the compiler pipeline + forward-looking passes | the build roadmap |
| [galerina-runtime.svg](galerina-runtime.svg) | the K3 fail-closed runtime gate | `galerina-governance-rules.md` |
| [galerina-framework.svg](galerina-framework.svg) | the Zero-Trust application framework | `galerina-post-framework-architecture.md` |
| [galerina-tower-citizen.svg](galerina-tower-citizen.svg) | the DRCM / Tower-citizen containment model | `galerina-drcm.md` |
| [galerina-tri-pipe.svg](galerina-tri-pipe.svg) | the Tri-Pipe execution router (binary / hybrid / photonic) | `galerina-photonic-ppu-virtualisation.md` |
| **[galerina-untrusted-governed-lane.svg](galerina-untrusted-governed-lane.svg)** | **Govern-Don't-Absorb — the decision stays in the trusted core, the work runs in an untrusted lane admitted by a signed predicate and combined back by No-Coercion `min`** | **[`untrusted-governed-lane.md`](../../../ZTF-Knowledge-Bases/untrusted-governed-lane.md)** |
| [galerina-tritmesh-query-lane.svg](galerina-tritmesh-query-lane.svg) | the `.hypha` (TritMeshQL) query lane — the T-ZONE split (opaque pushdown pre-Gate / semantic post-Gate), the Gate, and the GATED cross-collection traversal | [`../examples/hypha/README.md`](../examples/hypha/README.md) |
| [galerina-governed-data-query-lane.svg](galerina-governed-data-query-lane.svg) | the governed data-query (filter-many) lane — untrusted filter → `validate.*(...)?` → `database.read`, audit only validated values; `FUNGI-VALUESTATE-003` REJECT + `-008` WARN | [`../examples/Level-4-Security/178-governed-data-query`](../examples/Level-4-Security/178-governed-data-query/example.fungi) |
| [galerina-trust-state-lifecycle.svg](galerina-trust-state-lifecycle.svg) | the mental model every value-state lane is an instance of — `raw → (prove \| redact) → trusted → sink`, the illegal shortcuts the checker refuses (`FUNGI-VALUESTATE-003`/`-006`/`-008`), and the `protected`/`redacted` labels it propagates | [`../language/fungi/SYNTAX-REFERENCE.md`](../language/fungi/SYNTAX-REFERENCE.md) |
| [galerina-govern-dont-absorb.svg](galerina-govern-dont-absorb.svg) | the layer map — the governed **decision** surface (convert to `.fungi` twins) over the declared minimal **host floor** (crypto · pure compute · WASM toolchain · I/O seam, stays native); why `substrate-math` / `graph-algorithms` / `core-security` are NOT twin candidates | `scripts/audit-kernel-fungi-twins.mjs` |
| [galerina-ungoverned-vs-governed-breach.svg](galerina-ungoverned-vs-governed-breach.svg) | side-by-side — the same PII flow ships and leaks in a typical language, but is a **compile error** in Galerina (`-003`/`-006`/`-008` + `deny protected to response.body`) | [`../examples/Level-4-Security/175-security-summary-example`](../examples/Level-4-Security/175-security-summary-example/example.fungi) |

## How they fit together

`full-stack` is the map. `mechanics` + `compiler*` are the **compile-time** half (blue). `runtime` +
`framework` are the **run-time** half (teal). `tower-citizen` is the containment substrate. The two
**security-architecture** diagrams are companions:

- **`tri-pipe`** answers *"how is work dispatched to a faster substrate?"* (the router).
- **`untrusted-governed-lane`** answers *"why is that safe?"* (the trust boundary): the Tri-Pipe routes
  the **work** into the untrusted lane, while the **verdict** path the `runtime` diagram shows stays
  binary, digital, and fail-closed. Admission is the **IN** seam; No-Coercion `min` is the **OUT** seam.

So the canonical reading order for the security story is: `full-stack` → `mechanics` → `runtime` →
`tri-pipe` → `untrusted-governed-lane`.
