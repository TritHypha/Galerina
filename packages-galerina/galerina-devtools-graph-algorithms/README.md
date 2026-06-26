# @galerina/devtools-graph

Internal graph data structures and algorithms for the Galerina compiler.
Planned for extraction to a standalone `spore-graph` package when APIs stabilise.

Apache 2.0.

---

## Purpose

This package provides:

- **Core graph primitives** — `GraphNode<N>`, `GraphEdge<E>`, `Graph<N,E>` interface, `GraphBuilder`, and an immutable `ImmutableGraph` implementation backed by `Map` for O(1) lookup.
- **Graph algorithms** — BFS (shortest path, reachability), DFS (post-order visit, cycle detection), topological sort (Kahn's algorithm), and reachability helpers.
- **Galerina-specific graph types** — `EffectGraph` for effect propagation analysis and `CallGraph` for inter-flow call analysis.

---

## Usage (internal)

```typescript
import { GraphBuilder, topoSort, buildCallGraph } from "@galerina/devtools-graph";

const g = new GraphBuilder<{ label: string }, { weight: number }>()
  .addNode("a", { label: "A" })
  .addNode("b", { label: "B" })
  .addEdge("a", "b", { weight: 1 })
  .build();

const { order } = topoSort(g);
```

---

## Extraction criteria

This package will be extracted to a standalone published `spore-graph` package when **all** of the following are true:

1. **Two packages using the same code** — at least two Galerina sub-packages depend on this package's graph primitives or algorithms.
2. **GIR schema stabilised** — the Graph Intermediate Representation (`GraphJSON` / `spore.graph.v1`) has not had a breaking change in at least one release cycle.
3. **Runtime report stabilised** — the runtime graph report format (used by `@galerina/core-reports`) is stable and no further schema revisions are planned.

Until those criteria are met, this package remains `private: true` and is not published to npm.
