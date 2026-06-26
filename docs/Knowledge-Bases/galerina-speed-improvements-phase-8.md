# Galerina Speed Improvements — Phase 8

## Status

```text
Phase 8 implementation targets
Adopted: all three — staged in priority order
```

## TL;DR
- Cache the fuzzy type suggestion result — levenshtein() is expensive per unknown type
- Incremental checking per flow is the highest-value performance win
- Parallel checkers are viable but only after symbol resolution (shared context required)

---

## Priority Order

```text
1. Cache type suggestions (low risk, quick win)
2. Incremental checking (highest value, medium complexity)
3. Parallel checker passes (powerful, needs staged rollout)
```

---

## 1. Cached Type Suggestions

### Problem

`levenshtein()` runs on every `SPORE-TYPE-001` diagnostic. In files with many
unknown types, this becomes expensive.

### Fix

```typescript
const suggestionCache = new Map<string, string | undefined>();

function fuzzySuggest(typeName: string): string | undefined {
  if (suggestionCache.has(typeName)) return suggestionCache.get(typeName);
  const result = computeLevenshtein(typeName);
  suggestionCache.set(typeName, result);
  return result;
}
```

### Phase 8 implementation

Add `suggestionCache` to the TypeChecker class. Pre-compute `Array.from(BUILT_IN_TYPES)` once.

---

## 2. Incremental Checking

### Unit of incrementality

Each `flow` declaration is the natural incremental unit.

### Content hashing

Each flow gets a SHA-256 hash of its source text. If the hash matches the cached
hash from the previous run, reuse the cached diagnostic results.

### Dependency tracking

Track call graph edges: `flow A calls flow B`. When B changes, invalidate A.
The GIR emitter already produces per-flow output — extend this to checkers.

### Cache contents per flow

- diagnostics (all checker passes)
- GIR output
- effect summary
- value-state summary
- governance summary
- proof obligations

### Phase 8B implementation

Add `flowHash: Map<string, string>` and `flowDiagnosticsCache: Map<string, CheckResult>`
to the compiler pipeline. Wire into each checker pass.

---

## 3. Parallel Checker Passes

### Safe parallel model

Symbol resolution must complete first (shared context).
After symbol resolution, these are independent and can run in parallel:

```text
Shared context:
  - AST
  - Symbol table
  - Built-in registry
  - Effect registry

Parallel checkers:
  ├── Type checker
  ├── Effect checker
  ├── Value-state checker
  ├── Governance checker
  └── GIR emitter
```

### Node.js worker thread thresholds

```text
flowCount < 10  → run synchronously
flowCount >= 10 → use worker pool
```

### Phase 8C implementation

Wrap each checker pass in a worker thread. Pass the shared context as a
serialized snapshot. Collect results from all workers before GIR emission.

---

## See Also

- `docs/Knowledge-Bases/galerina-compiler-pipeline.md`
- `docs/Knowledge-Bases/galerina-symbol-resolver-spec.md`
