> ⚠️ **SUPERSEDED** — This is a v0.2 historical document. Current spec: see See Also links.

# Galerina Core Compiler: Manifest Generation v0.2

## Formal Specification — Pass 14

**Status: SUPERSEDED — This is a v0.2 design document. The current canonical specification
is in the corresponding Phase 9-15 implementation docs. See galerina-roadmap.md for
the up-to-date architecture. This file is retained for historical context only.**

This document is the v0.2 canonical specification for the runtime manifest
generator (compiler pass 14).

See also: `galerina-core-effect-checker-v02.md` (passes 12–13 that feed this),
`effect-checker-and-boundary-checker.md` (prior architecture KB).

---

## Overview

Pass 14 is the final compiler pass. It aggregates all compiler metadata from
prior passes into a single canonical runtime manifest used by:

- the runtime engine (effect enforcement)
- the CLI (`galerina deploy`, `galerina verify`)
- the audit system
- the deployment planner

---

## RuntimeManifest v0.2

### Structure

```ts
interface RuntimeManifest {
    version: string;

    routes: RouteManifest[];

    functions: FunctionManifest[];

    effects: EffectManifest[];

    boundaries: BoundaryManifest[];

    metadata: ManifestMetadata;
}
```

Note: The prior KB architecture used `schemaVersion`, `buildId`, `generatedAt`,
`target`, `permissions[]`, `reports[]`, `diagnostics[]`. The v0.2 form above is
the formal specification from the compiler pass 14 document.

---

### RouteManifest

```ts
interface RouteManifest {
    path: string;

    method: string;

    functionId: string;

    effects: string[];

    boundary: string;
}
```

---

### FunctionManifest

```ts
interface FunctionManifest {
    id: string;

    name: string;

    effects: string[];

    boundary: string;

    async: boolean;

    exported: boolean;
}
```

---

### EffectManifest

```ts
interface EffectManifest {
    effect: string;

    functions: string[];

    requiresBoundary?: string;
}
```

---

### BoundaryManifest

```ts
interface BoundaryManifest {
    source: string;

    target: string;

    allowedEffects: string[];
}
```

Note: The prior KB had `deniedEffects[]` and `requiredPolicies[]`. The v0.2
formal spec does not include those fields in BoundaryManifest.

---

### ManifestMetadata

```ts
interface ManifestMetadata {
    compilerVersion: string;

    buildTime: string;
}
```

---

### BuildManifestInput

```ts
interface BuildManifestInput {
    routes: RouteManifest[];

    functions: FunctionManifest[];

    effectGraph: EffectGraph;

    boundaries: BoundaryManifest[];

    compilerVersion: string;
}
```

Note: The prior KB had `checkedProgram`, `boundaryGraph`, `compilerOptions`.
The v0.2 formal spec uses the simplified input above.

---

## buildManifest() Implementation

```ts
function buildManifest(
    input: BuildManifestInput
): RuntimeManifest {

    return {
        version: "0.2",

        routes: buildRoutes(input),

        functions: buildFunctions(input),

        effects: buildEffects(input),

        boundaries: buildBoundaries(input),

        metadata: {
            compilerVersion:
                input.compilerVersion,

            buildTime:
                new Date().toISOString()
        }
    };
}
```

---

## Helper Implementations

### buildRoutes()

```ts
function buildRoutes(
    input: BuildManifestInput
): RouteManifest[] {

    return input.routes.map(route => ({
        path: route.path,
        method: route.method,
        functionId: route.functionId,
        effects: route.effects,
        boundary: route.boundary
    }));
}
```

### buildFunctions()

```ts
function buildFunctions(
    input: BuildManifestInput
): FunctionManifest[] {

    return input.functions.map(fn => ({
        id: fn.id,
        name: fn.name,
        effects: fn.effects,
        boundary: fn.boundary,
        async: fn.async,
        exported: fn.exported
    }));
}
```

### buildEffects()

Aggregates all unique effects from the effect graph.

```ts
function buildEffects(
    input: BuildManifestInput
): EffectManifest[] {

    const effectMap = new Map<string, string[]>();

    for (const [name, node] of input.effectGraph.nodes) {

        for (const effect of node.effects) {

            const fns =
                effectMap.get(effect.toString()) ?? [];

            fns.push(name);

            effectMap.set(
                effect.toString(),
                fns
            );
        }
    }

    return Array.from(effectMap.entries()).map(
        ([effect, functions]) => ({
            effect,
            functions
        })
    );
}
```

### buildBoundaries()

```ts
function buildBoundaries(
    input: BuildManifestInput
): BoundaryManifest[] {

    return input.boundaries;
}
```

---

## SPORE-MANIFEST Diagnostic Codes (v0.2)

| Code             | Meaning                    |
| ---------------- | -------------------------- |
| SPORE-MANIFEST-001  | Unsafe route detected      |
| SPORE-MANIFEST-002  | Unsafe export detected     |
| SPORE-MANIFEST-003  | Invalid boundary           |
| SPORE-MANIFEST-004  | Capability conflict        |
| SPORE-MANIFEST-005  | Serialization failure      |

Note: These meanings differ significantly from the prior KB:
- Prior 001: missing runtime manifest
- Prior 002: manifest integrity failure
- Prior 003: unsupported manifest version
- Prior 004: invalid capability reference
- Prior 005: runtime target mismatch

The v0.2 codes above are from the formal compiler pass 14 specification.

---

## Example RuntimeManifest Output

```json
{
  "version": "0.2",

  "routes": [
    {
      "path": "/api/users",
      "method": "GET",
      "functionId": "fn_fetchUsers",
      "effects": ["IO"],
      "boundary": "Internal"
    }
  ],

  "functions": [
    {
      "id": "fn_fetchUsers",
      "name": "fetchUsers",
      "effects": ["IO"],
      "boundary": "Internal",
      "async": true,
      "exported": true
    }
  ],

  "effects": [
    {
      "effect": "IO",
      "functions": ["fn_fetchUsers"]
    }
  ],

  "boundaries": [
    {
      "source": "Internal",
      "target": "External",
      "allowedEffects": ["Network", "External"]
    }
  ],

  "metadata": {
    "compilerVersion": "0.2.0",
    "buildTime": "2026-05-25T12:00:00Z"
  }
}
```

---

## Planned v0.3 Features

| Feature                      | Purpose                          |
| ---------------------------- | -------------------------------- |
| Capability Tokens            | Delegated capability authorities |
| Execution Policies           | Declarative runtime policies     |
| Resource Limits              | Memory and CPU constraints       |
| Region Metadata              | Geographic deployment targeting  |
| Distributed Topology         | Cluster-aware manifests          |
| Manifest Signing             | Cryptographic integrity          |

---

## Runtime Integration

The manifest is consumed by:

| System             | Usage                        |
| ------------------ | ---------------------------- |
| Runtime Engine     | Effect enforcement           |
| CLI (deploy)       | Deployment validation        |
| CLI (verify)       | Manifest integrity checks    |
| Audit System       | Execution traceability       |
| Deployment Planner | Route and boundary planning  |
| Network Layer      | Authorization headers        |

---

## Determinism Rule

The manifest generator is stateless and deterministic. Given identical:
- routes, functions, effectGraph, boundaries, compilerVersion

the output must be identical across all compiler runs. buildTime will
differ but is metadata only and does not affect correctness.
