# Galerina — Package Resolver Architecture

## Status

```
Phase 17A baseline: loadPackageManifest(), resolvePackageTypes(), name/version/exports/effects/capabilities ✅
Phase 18B: hash, signature, targets, compute, installScript, SPORE-PKG-* diagnostics, resolver reports
Phase 19+: full lockfile, content-addressable cache, signed registry, capability expansion CI check
```

## Core Principle

```
Galerina packages should be resolved like security-critical infrastructure,
not discovered like loose files on disk.
```

Imports are not trust. Every package must be:

```
resolved → verified → governed → compiled → cached
```

Never:

```
discovered → loaded → executed
```

---

## Resolution Pipeline

```
Package name
  ↓
Verified identity (name + version + hash + signature)
  ↓
Capability manifest (what it declares: effects, capabilities, targets)
  ↓
Deterministic dependency graph (package.galerina.lock)
  ↓
Target-compatible package map (cpu / wasm / npu / gpu / apu / photonic)
  ↓
Governed IR
  ↓
Verified Execution Cache
```

---

## Package Manifest Schema (package.galerina.yaml)

```yaml
name: "@galerina/auth"
version: "1.2.0"

# Content-addressable hash — identity is the content, not the name+version
hash: "sha256:3f7c4a..."

# Package signature — proves origin, prevents tampering
signature: "sig:ed25519:..."

# Source registry — auditable, no hidden resolution
registry: "https://registry.galerina.dev"

# Install script policy — defaults to "deny"
# Packages MUST NOT run code during installation unless explicitly allowed
# by a project-level resolver policy with signature verification.
installScript: deny

# What this package exports
exports:
  types:
    - UserId
    - HashedPassword
    - AuthToken
  flows:
    - verifyPassword
    - createSession
  events:
    - UserAuthenticated
    - SessionExpired

# Effects this package's flows may produce
effects:
  - audit.write
  - crypto.verify

# Capabilities this package requires from the host
capabilities:
  - crypto.password.verify
  - audit.write

# Target variants — resolver selects based on project policy
# Path values are relative to the package root
targets:
  cpu:
    path: dist/cpu.galerina
  wasm:
    path: dist/wasm.galerina
  npu:
    path: dist/npu.galerina

# Compute compatibility metadata — for SemanticGraph and ExecutionPlanner
# Parser passes this through; it does not plan hardware placement.
compute:
  tensor_shapes:
    - Tensor<Float32, [Batch, 768]>
  supports:
    - cpu
    - wasm-simd
  photonic_compatible: false
```

---

## Diagnostic Codes — SPORE-PKG-*

| Code | Name | Severity | Trigger |
|---|---|---|---|
| `SPORE-PKG-001` | `CapabilityExpanded` | error | Package declares more capabilities than the lockfile snapshot |
| `SPORE-PKG-002` | `UntrustedRegistry` | error | Package comes from an unregistered or unverified registry |
| `SPORE-PKG-003` | `MissingHash` | warning | Package manifest has no content-addressable hash |
| `SPORE-PKG-004` | `InstallScriptDenied` | error | Package declares or attempts an install script; default policy denies |
| `SPORE-PKG-005` | `MissingSignature` | warning | Package has no signature; origin cannot be verified |

---

## Resolver Security Rules

### Rule 1 — No install scripts by default

```galerina
resolver policy {
  deny install scripts
}
```

The default is `deny`. If ever needed, explicit allow with signature verification:

```galerina
allow install script only from trusted signed package
```

### Rule 2 — Read-only package isolation

Packages are read-only after resolution. No package may:

- Mutate another package's exports
- Rewrite imports at runtime
- Monkey-patch runtime objects (SPORE-SEC-020/021)

### Rule 3 — No dynamic package loading

```
deny dynamic package load
```

If future plugins need dynamic loading, it must go through:

```
Authority Control → signature verification → runtime report
```

### Rule 4 — Capability expansion check

If the lockfile snapshot has:

```yaml
capabilities:
  - crypto.password.verify
```

And the new version adds:

```yaml
capabilities:
  - crypto.password.verify
  - network.outbound
```

That is a `SPORE-PKG-001` (CapabilityExpanded) — a breaking security change that must be explicitly reviewed and re-approved.

### Rule 5 — Lockfile determinism

```
Same lockfile + same registry = same package graph.
```

The lockfile (`package.galerina.lock`) stores:

```yaml
packages:
  - name: "@galerina/auth"
    version: "1.2.0"
    hash: "sha256:3f7c4a..."
    capabilities:
      - crypto.password.verify
    registry: "https://registry.galerina.dev"
    resolved: true
```

---

## Resolver Output Reports

The resolver produces structured reports that feed AI tooling, CI, and audit:

### package-map.json
Maps logical package names to resolved paths and hashes.

### provenance.json
Records the full resolution chain: registry → package → hash → signature.

### capability-map.json
Lists every capability required across all packages, cross-referenced against project policy.

### dependency-graph.json
The full resolved dependency graph as a DAG. Used by SemanticGraph.

### target-compatibility.json
Which packages are available for which compute targets (cpu, wasm, npu, gpu, apu).

---

## AI-Friendly Package Graph

Generate compact AI metadata as part of resolver output:

```json
{
  "packages": [
    {
      "name": "@galerina/auth",
      "version": "1.2.0",
      "effects": ["crypto.verify", "audit.write"],
      "capabilities": ["crypto.password.verify"],
      "trusted": true,
      "targets": ["cpu", "wasm"],
      "hash": "sha256:3f7c4a..."
    }
  ]
}
```

This lowers AI token usage — tools read the package graph, not many manifest files.

---

## Target Variants

Resolver selects the target variant based on:

1. Project policy (prefer [npu, gpu, cpu])
2. Package availability (not all packages ship npu variant)
3. Capability compatibility
4. Signature validity for the chosen variant

This supports:

```
CPU  WASM  GPU  NPU  APU  Photonic bridge  Quantum bridge
```

without changing import statements. The same `import Auth` resolves to the correct binary.

---

## Content-Addressable Package Identity

Package identity = SHA-256 hash of content, not just name + version.

Benefits:

```
faster lookup (hash is the cache key)
reproducible builds (same hash = same content)
tamper detection (hash mismatch = build failure)
less dependency confusion (two packages with same name but different hashes are distinct)
```

Cache key for the verified execution cache:

```
sha256(source_hash + package_graph_hash + capability_graph_hash + target_hash + compiler_version)
```

---

## Legacy to Avoid

```
PHP-style autoloading               — implicit trust
node_modules filesystem guessing    — nondeterministic
postinstall scripts                 — code execution during install
runtime package mutation            — SPORE-SEC-020/021
dynamic dependency loading          — ungoverned
unverified registries               — supply chain risk
hidden transitive capabilities      — SPORE-PKG-001
implicit imports                    — no governance trail
```

---

## Implementation Status

| Feature | Status |
|---|---|
| `loadPackageManifest()` | ✅ Phase 17A |
| `resolvePackageTypes()` | ✅ Phase 17A |
| `name`, `version`, `exports`, `effects`, `capabilities` | ✅ Phase 17A |
| `hash`, `signature`, `registry`, `installScript` | ✅ Phase 18B |
| `targets` (cpu, wasm, npu, gpu, apu) | ✅ Phase 18B |
| `compute` (tensor_shapes, supports, photonic_compatible) | ✅ Phase 18B |
| `SPORE-PKG-001..005` diagnostic constants | ✅ Phase 18B |
| `checkPackageCapabilityExpansion()` | ✅ Phase 18B |
| `getResolverReport()` | ✅ Phase 18B |
| Full lockfile (`package.galerina.lock`) | 📋 Phase 19 |
| Content-addressable cache | 📋 Phase 19 |
| Signed registry enforcement | 📋 Phase 19 |
| Hardware target selection | 📋 Phase 20 |
| AI-friendly package graph generation | 📋 Phase 20 |
