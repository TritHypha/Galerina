# How a LogicN App Builds Today — Artifacts, the Single-`.wasm` Question, and Environment Secrets

> **Status:** factual current-state (verified against `logicn.mjs`, `docs/ENV_SECRETS.md`, `.gitignore`, 2026-06-21).
> This documents *what LogicN does now*, so the ecosystem/architecture R&D (task 0056, the three structural
> layouts) builds on reality rather than aspiration. Where the target architecture differs, it is flagged
> **→ target**. Brand note: any `tritmesh-*` / `mesh_*` name below is a placeholder — "Mesh" is rename-pending.

---

## TL;DR

- `logicn build app.lln` emits **one standalone `build/app.wasm`** plus a **signed manifest** and governance
  reports. So "a single `.wasm` in a `build/` folder" is **true for the app module**.
- A LogicN **package** compiles to its *own* governed `dist/<name>.wasm` **+ a `.fuse.json` descriptor** that
  declares its seam and capability bound. Governed packages are designed to **AOT-fuse** into the app image.
- What is **NOT** in that one `.wasm`: the **host** (Wasmtime/Node provides the imports), **third-party /
  untrusted code** (the *symbiote* boundary — deliberately a *separate* sandboxed module), and **`.env`
  secret values** (runtime-only, never compiled in).
- So the honest answer to *"does the whole app + all deps + plugins become one file?"* is **no, by design** —
  the **trusted core** fuses to one `.wasm`; untrusted code stays a separate sandboxed module. That separation
  *is* the zero-trust boundary, not a missing feature.
- `.env` is handled as **secrets, not strings**: declared in `secrets {}`, typed `Secret<T>`, taint-tracked,
  **never written into `app.wasm`/reports/source-maps/AI-context**, and signing material is hard-`.gitignore`d.

---

## 1. What `logicn build` emits today (factual)

`logicn build <file.lln>` writes, into `build/` (app) or `<pkg>/dist/` (package build):

| Artifact | What it is | Source |
|---|---|---|
| `<name>.wasm` | the compiled, standalone WASM module (one per build target) | `logicn.mjs:1543` |
| `<name>.wat` | the human-readable WAT text (same module) | `logicn.mjs:1544` |
| `<name>.lmanifest` | the **authoritative signed manifest** — binary CBOR (RFC 8949); this is the signing target the admission gate parses | `logicn.mjs:1581–1591` |
| `<name>.lmanifest.json` | human-readable mirror of the manifest | `logicn.mjs:1593–1596` |
| `<name>.governance-impact.json` | the security surface-area / governance-impact report | `logicn.mjs:1723–1724` |
| `<name>.fuse.json` | (package builds) the **fusion descriptor** — `kind`, `seam`, capability bound, and the `.wasm`/manifest sha256 | `logicn.mjs:1730–1755` |

The manifest folds the `.wasm` **sha256** into the signed object (`logicn.mjs:1558–1563`), so the signature
covers the exact bytes of the module. Running is host-driven, e.g. `wasmtime --invoke main build/app.wasm`
(`logicn.mjs:17,132`).

Other `build/` subdirectories are **runtime/test scratch**, not the build product (and are `.gitignore`d):
`build/receipt-ledger/`, `build/audit-log/`, `build/tower-logs/`, `build/graph/` (the project graph).

### The exact answer to the single-`.wasm` question

```
logicn build app.lln
  └─ build/
       ├─ app.wasm            ← ONE standalone module (the app's flows)
       ├─ app.wat             ← same module, readable
       ├─ app.lmanifest       ← signed CBOR manifest (covers app.wasm's sha256)
       ├─ app.lmanifest.json  ← readable mirror
       └─ app.governance-impact.json
```

- **Intra-app → one `.wasm`. Yes (shipped).** All of an app's own flows/imports are merged into a single module
  by the whole-program import merge (`logicn-core-compiler/src/module-registry.ts:178-297`), emitted as one
  `build/app.wasm`.
- **Cross-*package* → one signed `.wasm` per package, host-linked (not merged into the app file).** A governed
  package builds to its own `dist/<name>.wasm` + `<name>.fuse.json`, and is **admitted + composed at load** by
  the App-Kernel fusion border (`logicn-framework-app-kernel/src/fuse-loader.ts` — `fusePackage` /
  `planComposition`), capability-bounded. So the precise answer is: **one `.wasm` for the app, plus one signed
  `.wasm` per package, host-linked at admission** — not a single file containing the app *and* every package.
- **The fusion model** is the **AOT-fuse** track from **R&D 0052** (keep AOT-fuse default; opt-in
  multi-module; ship the interim host-linker first). **→ target:** an inter-module linker over the existing
  `fuse-loader` `capabilityRegistry` hook, fail-closed; a single fully-merged signed image is a *later* option,
  not required for production.

---

## 2. What is deliberately OUTSIDE the `.wasm`

This is the zero-trust point, not an omission:

1. **The host.** The module imports host functions (Wasmtime/Node provide them). The WASM linear memory is
   **exported** (host-readable) and **bounded** — `DEFAULT_WAT_MEMORY` commits `minPages` with **no
   `memory.grow`**, so the committed bound *is* the enforced ceiling (see the arena/memory work, R&D 0055).
2. **Third-party code = a *symbiote* — a separate signed `.wasm`, admitted at a real border.** Capability
   binding lives in the **signed `.lmanifest` `fuse{}` block, NOT in a `.tmf`** (the `.tmf` format is
   integrity/confidentiality only — it carries no capability grant). The border is **fail-closed and shipped**
   (`fuse-loader.ts:404-516`: sha256 hash-pin + Ed25519 sig + revocation + deny-by-default closed capability
   imports), and an undeclared capability is refused at **link time** (`LinkError` → CRITICAL_SECURITY_VIOLATION,
   `wasm-runtime.ts:353-363`). **Honesty correction:** today admitted symbiotes are **first-party-trusted,
   co-resident (shared linear memory)** — true *memory isolation* of an untrusted peer, per-call syscall traps,
   and zero-copy ring-buffer IPC are **ASPIRATIONAL** (gated on the WASM Component Model, #102-104). So "you
   never fuse untrusted code / an unauthorized syscall traps at runtime" is the **target**, not shipped.
3. **`.env` secret values.** Never compiled in (see §3).

So the build product today is best described as **one signed governed-core `.wasm`** (+ its `.lmanifest`)
**plus one signed `.wasm` per package**, admitted and host-linked at the fail-closed fusion border — *not* a
single monolith, and *not yet* an isolated sandbox for untrusted peers (that isolation is the #102-104 target).

---

## 3. Environment keys / `.env` — how they are handled today

LogicN already treats `.env` as **secrets, not normal strings** (`docs/ENV_SECRETS.md`). The core rule:
*"secrets are values that can be used, but not seen."*

**Declaration (central, not ad-hoc).** In `boot.lln` / the app security policy:

```logicn
secrets {
  PAYMENT_API_KEY { source env  required true  used_for ["payment_provider"]  expose_to ["PaymentsService"] }
  WEBHOOK_SECRET  { source env  required true  used_for ["webhook_hmac"]       expose_to ["WebhookVerifier"] }
}
```

**Typed + enforced.** Use `Env.secret<ApiKey>("…")` → a protected `Secret<T>`, **not** `Env.get(...)` →
`String`. The compiler enforces (codes from `ENV_SECRETS.md`):

- `LLN-SECRET-001` — cannot `Log` a `Secret<T>` (use `Secret.name()` / `Secret.fingerprint()`).
- `LLN-SECRET-002` — a `Secret<T>` cannot be converted to `String` / returned from a function (shipped &
  hardened; see the secret-taint / egress work).
- **Taint tracking** — anything a secret touches becomes `SecretDerived<T>` and inherits the bans.
- **Safe-sink table** — `Build output: **Never**`; logs/errors/LLM/cache: denied by default; HTTP headers:
  only to declared hosts (`LLN-SECRET-HTTP-004`).
- **Scope** (`allow only PaymentsService`), **lifetime** (`with secret … { }`), **redaction** of known
  sensitive names, and **hard-coded-secret scanning** (`LLN-SECRET-HARDCODED-001`).

**Never in the build.** `.env` values are **runtime-only** — *never* compiled into `app.wasm`, `app.js`,
reports, source-maps, or AI context (`ENV_SECRETS.md` §"Runtime-Only Values"). The build instead emits a
**`secret-report.json` with `valuesIncluded: false`** — *which* secrets are required (names, scopes,
fingerprints), never the values. Deployment tooling verifies requirements without seeing secrets.

**Signing material is hard-excluded from git** (`.gitignore:12–22`):

```
.env.logicn-signing        # the signing private key (dev stopgap; prod → HSM/KMS, #149)
.env.*.signing  **/*.signing
*.private.pem  **/*-private.pem
.env.local  .env.*.local
**/governance/signing-key-*.pub.pem   # auto-provisioned dev pubkeys = build artifacts, not source
```

The signing key is read at sign-time only (`governance/sign-revocations.mjs`, `logicn build`) from
`.env.logicn-signing` (mode `0600`, git-ignored). Production custody is HSM/KMS (#149); per
[[logicn-key-custody-rotation-decision]] and [[feedback-keys-rotate-automatically]], keys must never sit on a
CLI and should rotate automatically.

---

## 4. Where `.env`/secrets sit in the architecture we are deciding

This folds in the **prior LogicN environment-key research** — `logicn-core-config-dotenv-trust-model.md` and
`logicn-core-config-environment-secrets.md` (designed; `logicn-core-config` / `logicn-core-security` carry
stubs). The architecture must adopt that research, not re-derive it.

### 4.1 The `.env` trust model (canonical prior research)

> `.env` is an **input source — not a security boundary, not a secret vault**. *Conditionally trusted,
> operationally unsafe by default.*

`.env` is fine for **development / non-prod** config; it is **not acceptable for production secrets** (payment
keys, JWT/signing keys, private keys, DB master passwords, cloud root creds, AI tokens, OAuth secrets).
Production secrets come from a **managed vault / KMS** (AWS Secrets Manager, HashiCorp Vault, Azure Key Vault,
GCP Secret Manager, K8s projected volumes) or **container runtime injection**. `EnvironmentPolicy` (per
`EnvironmentMode`) **flips `.env` off above development**:

| Mode | `allowDotEnvFiles` | `allowUnsafeOverrides` | strict |
|---|---|---|---|
| development | yes | yes | — |
| test | yes | no | yes |
| staging | no | no | yes |
| production | no | no | yes |

Diagnostics: `LLN-CONFIG-WARN-001` (.env in prod -> warning), `LLN-CONFIG-WARN-002` (.env forbidden in strict),
`LLN-SECRET-003` (a `development_only`-trusted secret referenced on a production path).

### 4.2 Source is not trust (the key idea to keep)

A secret declares its **source** *and* its **trust level** separately, so the same name resolves differently
per environment and the compiler can reject a dev secret on a prod path:

```logicn
secret STRIPE_API_KEY { from env   "STRIPE_API_KEY"          trust development_only }   // dev
secret STRIPE_API_KEY { from vault "vault://payments/stripe"  trust production       }   // prod
```

`SecretConfigSource = { env | vault | kms | runtime }`. Secret **references** carry name + scope + fingerprint +
allowed/denied sinks — **never the value** (`SecretEnvironmentReference.redacted: true`).

### 4.3 How this lands in the three layouts

- **A `.env` file is a runtime input, never a source/artifact** — `.gitignore`d, never committed, never fused
  into any `.wasm` (the safe-sink table already says *Build output: Never*). In the end-user project (Layout 3)
  it sits beside `App.lln` as an *un-tracked* dev-only file, or is injected by the host/orchestrator in prod.
  TARGET: the scaffold names it and `.gitignore`s it, and defaults prod to vault/KMS.
- **The distribution manifest is `package-logicn.json` + `logicn.lock.json`** (prior research, `LLN-CONFIG-010`)
  — the LogicN-specific equivalent of `composer.json` / `package.json` + lockfile, kept **separate** from any
  host `package.json` (which must not carry LogicN runtime policy). This is the "download the framework, then
  resolve the packages" manifest: `package-logicn.json` declares governed-package deps + required env/secrets +
  runtime mode; `logicn.lock.json` pins them; the **governed-resolver** resolves them. TARGET: a registry +
  signed-install path makes downloaded packages *signed, capability-bounded* artifacts (not blind-trust like
  `node_modules`).
- **`Manifest.tmf` declares the secret *requirements*, not the values** — names / scopes / fingerprints /
  egress — which the K3 admission gate verifies before the app runs (the manifest-side mirror of
  `secret-report.json`).
- **Three-package split (prior research):** `logicn-core-config` *describes/validates* config + secret
  *requirements*; `logicn-core-security` *owns the protected `SecretReference` contracts*; the runtime
  *resolves* raw values only through capability-controlled paths; `logicn-ext-secrets-vault` *executes* the
  vault/KMS mechanism (dual-token, atomic-swap, zero-wipe, fail-closed rotation —
  [[logicn-key-custody-rotation-decision]]). Core declares + verifies; ext executes. Do **not** pull the engine
  into core.
- **Tri-Pipe verdict for the whole env/secrets surface: Binary-only by invariant** — config validation, secret
  taint, signing, and admission are crypto-on-core; no Hybrid/Photonic facet.

> **Naming (locked 2026-06-21):** **LogicN** = the *governed compute substrate* (language + runtime, **not** a
> framework); the layer developers build apps on = *the application framework* (zero-trust, compile-to-WASM,
> **no middleware** — compile-time conventions + signed governed packages); brand / org umbrella = *Zero-Trust
> Framework* (`github.com/zero-trust-framework`). Use "substrate" for L1 and "application framework" for L3;
> never call the substrate itself a "framework".

---

## 5. One-line summary

> Today: `logicn build app.lln` → **one signed `build/app.wasm`** (+ manifest + reports); governed packages are
> **fusable** (`.fuse.json`); untrusted code stays a **separate sandboxed symbiote**; and `.env` values are
> **runtime-only secrets that never enter any artifact**. The architecture decision keeps all four properties
> and makes the whole-program fuse + the symbiote sandbox + the manifest-declared (value-free) secret
> requirements first-class.

Related: [[logicn-wasm-compilation-granularity]] (R&D 0052), `docs/ENV_SECRETS.md`,
`docs/Knowledge-Bases/logicn-core-config-dotenv-trust-model.md`,
`docs/Knowledge-Bases/logicn-core-config-environment-secrets.md`, [[logicn-key-custody-rotation-decision]].
