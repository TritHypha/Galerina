# Galerina CLI — Current Specification (Phase 19+)

> Supersedes `galerina-core-cli-v02.md`. All CLI behaviour described here reflects Phase 19 and later.

---

## Architecture Rule

All CLI output decisions consider WASM compatibility first. Build targets, diagnostic codes, and output artefacts are designed so that WASM-targeted builds are first-class, not an afterthought.

---

## Commands

### `galerina check [path]`

Check `.spore` files in development mode. Diagnostics are emitted as warnings; nothing blocks the process.

**Flags**

| Flag | Effect |
|---|---|
| `--strict` | Promotes warnings to errors; exits 1 on any diagnostic that is warning or above |

Typical use: editor integration, pre-commit hooks, CI smoke pass.

---

### `galerina build [path]`

Compile `.spore` files to JavaScript bootstrap output (default target).

**Flags**

| Flag | Effect |
|---|---|
| `--production` | Full governance enforcement; all diagnostics at error severity cause exit 1 |
| `--deterministic` | Implies `--production`; additionally requires bit-for-bit reproducible output. Emits `SPORE-BUILD-001` and exits 1 on any hash mismatch between two internal compilation passes |
| `--target=wasm-standalone` | Emit a WASM/WASI module. Pure flows compile to WASM functions with zero imports. Effectful stdlib calls (e.g. `File.readText`) become typed imports from the `host:*` namespace, sourced from `STDLIB_CAPABILITY_MAP.wasmImport`. Runtime policy limits are expressed as WASM memory limits |
| `--target=wasm-hybrid` | Emit a JS capability shell wrapping a WASM pure-flow core. The JS shell manages capabilities, audit trails, and governance enforcement; the WASM core handles pure computation (tensors, math, validation gates) |

---

### `galerina fix [path]`

Analyse `.spore` files and emit suggested corrections.

**Flags**

| Flag | Effect |
|---|---|
| `--effects` | Detect missing effect declarations and emit `suggestedCode` blocks in diagnostic output. Does not mutate source files automatically |

---

### `galerina emit [path]`

Emit supplementary artefacts from a compiled `.spore` program.

**Flags**

| Flag | Effect |
|---|---|
| `--ai-graph` | Write `build/semantic/galerina.ai.json` — a structured, AI-readable program graph for tooling, analysis agents, and IDE integrations |

---

### `galerina verify-selfhost [path]`

Verify deterministic build integrity. Compiles the same source twice in sequence and compares output hashes. Emits `SPORE-BUILD-001` and exits 1 if hashes differ.

**Hash function:** `canonicalHash()` — strips all timestamps, sorts object keys alphabetically, then applies SHA-256 over the canonical JSON representation.

Typical use: release pipelines, reproducible-build attestation, bootstrap trust verification.

---

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success; no blocking diagnostics |
| `1` | Build or governance failure; one or more errors present |
| `2` | Invalid arguments or unrecognised flags |

---

## Diagnostic Severity by Mode

| Code | `check` | `check --strict` | `build` | `build --production` | `build --deterministic` |
|---|---|---|---|---|---|
| `SPORE-EFFECT-001` — missing effect declaration | warning | error | warning | error | error |
| `SPORE-STDLIB-001` — stdlib call missing effect annotation | warning | error | warning | error | error |
| `SPORE-GOV-010` — flow has no intent declaration | info | warning | info | error | error |
| `SPORE-BUILD-001` — non-deterministic output detected | — | — | — | — | error |
| `SPORE-SYNTAX-LEGACY-001` — removed `with effects` syntax (hard error) | error | error | error | error | error |
| `SPORE-SYNTAX-LEGACY-002` — legacy flow qualifier (`safe/guard/unsafe flow`) | warning | error | warning | error | error |
| `SPORE-STYLE-001` — `else if` advisory (use `match` for multi-branch) | info | warning | info | info | info |

Notes:
- `—` means the diagnostic is not evaluated in that mode.
- `info` is surfaced in output but never causes a non-zero exit.
- `warning` causes non-zero exit only when `--strict` is active.
- `error` always causes exit 1.

---

## Syntax Notes

### `with effects [...]` — Removed (SPORE-SYNTAX-LEGACY-001)

`with effects [...]` at the flow signature is a **hard error** in all modes.
The parser rejects it immediately. The canonical form is:

```galerina
contract {
  effects { database.read, audit.write }
}
```

### `:` as Return-Type Separator — Accepted

Both `->` and `:` are accepted as the return-type separator on flow and fn
declarations. No diagnostic is emitted for either form. Formatters normalise
to `->`. Example:

```galerina
// Both are valid — no diagnostic emitted:
pure flow add(a: Int, b: Int) -> Int { ... }
pure flow add(a: Int, b: Int) : Int  { ... }
```

---

## WASM Targets

### `--target=wasm-standalone`

Produces a self-contained WASM/WASI module; no JS runtime required at deploy time.

- **Pure flows** compile to WASM functions with zero imports.
- **Effectful stdlib** (e.g. `File.readText`, `Net.fetch`) compiles to typed WASM imports resolved from `STDLIB_CAPABILITY_MAP.wasmImport` under the `host:*` namespace. The host runtime is responsible for providing these imports.
- **Runtime policy limits** (rate limits, memory caps) are enforced via WASM memory limits rather than JS-side guards.
- Output includes `.wasm` + `.wat` (WAT for inspection). WAT contains `unreachable` stubs in Phases 19–23; real instruction emission begins at Phase 24.

### WAT Assembler

Galerina uses a JS/npm WAT assembler by default. No system wat2wasm required.

  galerina build --target wasm
    → emits WAT text via wat-emitter.ts
    → assembles .wasm binary via JS/npm package
    → no native binary dependency

  galerina build --target wasm --use-system-wabt
    → optional: use wabt/wat2wasm if installed (faster, dev-only path)

Rule: The default Galerina toolchain must not require external native binaries.

### `--target=wasm-hybrid`

Produces a JS shell file paired with a `.wasm` module.

- **JS shell** owns: capability acquisition, audit event emission, governance policy enforcement, and host-side effect gating.
- **WASM core** owns: pure computation — tensor operations, mathematical transformations, validation gate evaluation.
- The shell/core boundary is determined statically at compile time by the effect system. Flows with no declared effects compile entirely into WASM; flows with effects retain a JS-side stub that delegates pure sub-computations to the WASM core.

---

## Phase Table

| Phase | Description | Status |
|---|---|---|
| 19 | CLI command surface established; WASM targets defined; WAT stubs emitted | complete |
| 20 | Effect system diagnostics wired into build pipeline | complete |
| 21 | Deterministic build (`--deterministic`, `canonicalHash()`) | complete |
| 22 | AI graph emit (`--ai-graph`, `galerina.ai.json`) | complete |
| 23 | Governance enforcement in `--production` mode | complete |
| 24 | Real WAT instruction emission; JS/npm WAT assembler integrated; no native binary required | complete |
| 25 | WASM-hybrid JS shell / WASM core split; static boundary analysis | next |
