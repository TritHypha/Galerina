# Galerina CLI — user instructions

The Galerina toolchain ships one CLI, available as two equivalent binaries: **`galerina`** and **`fungi`**
(same program). Source files use the **`.fungi`** extension. Run `galerina help` for the built-in command list.

> **Read the strictness section (§4) before you rely on a build for anything deployed.** Not every mode runs
> the full governance gate — `galerina build --production` is the security-authoritative path.

---

## 1. Quick start

```sh
galerina check   myapp.fungi                 # type-check + governance verify (no output artifacts)
galerina build --production  myapp.fungi     # the authoritative governed build → signed .lmanifest
galerina run     myapp.fungi --invoke main   # compile → WASM → run a pure flow
```

A source file declares one or more `flow`s inside a `contract { … }`. `check` tells you if it is admissible;
`build --production` produces the signed artifacts; `run` executes it.

---

## 2. Everyday commands

| Command | What it does |
|---|---|
| `galerina check <file>` | Type-check + governance verification. No artifacts. Your fast inner-loop command. |
| `galerina check <file> --strict` | Stricter check (see §4 — **not** a substitute for `build --production`). |
| `galerina check <file> --diff` | Show the change class vs `HEAD~1` before pushing. |
| `galerina check --what-if <policy.fungi> [file]` | Shadow-policy dry run (no enforcement). |
| `galerina build <file>` | **Dev build** → `build/<name>.wasm` + `.wat` + `.lmanifest`. Lenient (see §4). |
| `galerina build --production <file>` | **Governed build.** Full gate; refuses on any error; signs the manifest. |
| `galerina build --deterministic <file>` | Reproducibility-focused build (see §4 caveat). |
| `galerina run <file> --invoke <flow> [args…]` | Compile → WASM → run a **pure** flow returning Int/Bool. |
| `galerina run <file> --invoke <flow> --governed` | Run **any** flow through the governed runtime (required for secure/effectful flows; fail-closed). |
| `galerina deploy <file> [--tag <image>]` | Full pipeline: check + build + verify + health. |

---

## 3. Packages, fusion, keys & utilities

| Command | What it does |
|---|---|
| `galerina build --package <dir>` | Compile a package's `/src` → governed `.wasm` + `.lmanifest` + `.fuse.json` in `<dir>/dist/` (fusable). Add `--no-refresh` for reproducible CI (skips `//fungi:` metadata refresh). |
| `galerina fuse <dir…> [--invoke <pkg>:<export>]` | Host-link a set of built packages (deny-by-default, fail-closed). |
| `galerina verify <file>` | DRCM Phase-3 admission gate — verify a manifest. |
| `galerina deps <file> [--flow <name>]` / `--write` | Print / write the `//fungi:` USES/USEDBY/IMPACT metadata. |
| `galerina deps --all [dir] [--write\|--check]` | Refresh (or CI-gate) `//fungi:` across every `.fungi` in the app. |
| `galerina keygen` / `keygen --hybrid` | Generate an Ed25519 (or hybrid Ed25519 + ML-DSA-65, PQ) signing keypair. |
| `galerina new <dir> [--name <pkg>]` / `new app <dir>` | Scaffold an opinionated secure package (or a governed app). |
| `galerina generate tests <file> [--tap]` | Contract-driven test obligations. |
| `galerina infer <file> [--invoke F] [--prompt P] [--model M]` | Governed AI inference from a flow's `ai {}` contract. |
| `galerina init-env` · `budget` · `version` · `diagnostic` · `border-check` · `kb-graph` · `ledger <dir>` · `manifest-to-dot <file>` | Environment/policy validation, machine budget, version + runtime status, fault-injection bench, plugin-schema check, KB cross-ref graph, compliance report, manifest→Graphviz. |

Private keys are never committed. `keygen` writes the public half committed-safe and the private half git-ignored.

---

## 4. Build modes & strictness (read this)

Strictness is set two ways — a **build mode** (a `build` flag) and a **signing/posture profile** (an env var):

**Build modes** (`galerina build …`):
- **`build <file>` — dev.** Lenient by design (fast iteration). Emits artifacts, but a plain dev build is
  **not** a production security statement.
- **`build --production <file>` — the authoritative governed build.** Runs the full pipeline
  (types · value-state/taint · effects · source-escape · naming · **governance verification**), refuses on any
  error, and only then signs the `.lmanifest`. **Use this for anything you deploy, fuse, or trust.**
- **`build --deterministic <file>` — reproducibility.** Intended for byte-reproducible CI artifacts.
  As of the RD-0234b signing-boundary unification it runs the **same** production security gate as
  `--production` (governance verification · value-state · taint · monkey-patch · attribute-escape ·
  source-escape) before signing — a violating artifact is refused, not silently signed. Its remaining
  distinction from `--production` is reproducibility focus, not a weaker gate.
- `build --wasm` / `--hybrid` — standalone / hybrid WASM emission variants.

**Check modes** (`galerina check …`):
- **`check <file>`** — types + governance verify, no artifacts. Fast inner loop.
- **`check --strict`** — stricter reporting for CI, and a **non-suppressible verdict**: a `// galerina-disable`
  directive or a `galerina.check.json` `"off"` override may quiet a warning but cannot silence a fail-closed
  error (RD-0234b L4-F1/F2). It is still a *pre-merge signal*, not an artifact build — gate release builds on
  `build --production`, but `check --strict` is no longer weaker than production for security errors.

**Signing / posture profile** — the `GALERINA_PROFILE` environment variable (not a flag):
- `GALERINA_PROFILE=production` — fail-secure signing/runtime posture (distrust host time/RNG, require
  attestation, mandate hybrid signing under the certified profile). Set it in CI/production environments.
- Unset / `dev` — lenient posture for local development.

```sh
# Local dev
galerina check myapp.fungi
galerina build myapp.fungi

# CI / release (authoritative)
GALERINA_PROFILE=production galerina build --production myapp.fungi
```

---

## 5. Exit codes & CI

- **`0`** — passed (and, for `build --production`, a signed `.lmanifest` was written).
- **non-zero** — a diagnostic of `error` severity was found; **no manifest is written**. The output lists each
  `FUNGI-…` code with a file:line and a fix hint.

For CI, gate the pipeline on `GALERINA_PROFILE=production galerina build --production` (release artifacts) and
`galerina deps --all --check` (metadata freshness). Treat any non-zero exit as a hard failure.

---

## 6. What a passing build means (honesty note)

A green `galerina build --production` means the file passed every **wired** governance gate at build time.
The sound end-to-end guarantees are: the signed capability set verified at fuse/admission time, plus the
compile-time governance/taint/value-state passes. Every manifest-emitting path — `build`, `--production`,
`--deterministic`, and the bundled `galerina`/`fungi` CLIs — now routes its signing decision through **one**
shared production security gate (`runProductionSecurityGate`), and a coverage-of-coverage test asserts each
gated check is wired (RD-0234 L6-B2), so a checker can no longer silently un-wire. The Galerina team runs
continuous adversarial "50-year-mistake" audits of these gates (see `docs/CONSISTENCY_GATES.md` and the KB
`galerina-rd-0234*` records). Still prefer `build --production` + `GALERINA_PROFILE=production` for anything
you deploy (it sets the fail-secure signing posture on top of the gate).

Run `galerina version` for the exact build + runtime status, and `galerina help` for the live command list.
