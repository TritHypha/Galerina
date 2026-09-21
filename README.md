# Galerina

**A governance-first application language for high-assurance software.**

Galerina is designed for application logic where authority, effects, data handling and failure behaviour must be explicit before execution. Developers write `.fungi`; the compiler checks types, effects, value state and governance, then emits a governed intermediate representation (GIR) and auditable evidence.

The project is in beta. The compiler and governance model are substantial and tested. The current CLI still uses WAT/WASM as its compatibility and bootstrap execution path. Independent SLIDE can execute bounded admitted Fungi families through physical `.slide`, independent re-admission and VOK, but that evidence does **not** establish a general production backend, platform durability or release authority.

> New here? Start with [SETUP.md](SETUP.md), then use the strict [Executable Fungi Golden Pack](docs/examples/golden/README.md) as the smallest current-language lookup surface.

## At a glance

| Area | Current position |
|---|---|
| Language | `.fungi` with typed flows, contracts, explicit effects, K3 verdicts, value-state tracking, Hallmarks and exhaustive decisions |
| Compiler | Lexer → parser → resolution → type/effect/value-state checks → governance verification → canonical GIR |
| Compiler authority | All seven canonical `.fungi` compiler stages are authoritative specifications; TypeScript remains the executing differential/bootstrap layer |
| Current CLI target | WAT/WASM compatibility artifacts and governed execution |
| Forward execution target | Bounded checked Fungi → GIR → physical `.slide` → independent re-admission → affine VOK |
| Production authority | Not yet released; external authentication, platform evidence, durability, broader language families and retirement gates remain open |
| Security posture | Deny by default, fail closed, verify rather than trust; no evidence Boolean is accepted without its underlying proof |

## What Galerina is for

Galerina targets governed application logic rather than low-level systems programming:

- authorisation and admission decisions;
- API and service flows;
- payment, healthcare and regulated-data workflows;
- governed data pipelines;
- package, plugin and application borders;
- auditable use of secrets, native adapters and untrusted compute;
- deterministic security decisions that must remain deny-by-default.

It is deliberately not a kernel language, device-driver language, quick scripting language or theorem prover.

## What the language makes explicit

### Authority and effects

Flows declare intent and required effects. An effect such as `database.write`, `network.outbound`, `secret.read` or `vault.write` does not exist merely because host code can perform it: it must be declared, checked and admitted at the relevant border.

### K3 verdicts

Security decisions use a three-state lattice rather than coercing uncertainty into a Boolean:

- `ALLOW` (`+1`)
- `INDETERMINATE` (`0`)
- `DENY` (`-1`)

Composition is degrade-only. Missing or unknown evidence cannot manufacture authority.

### Typed failure and exhaustive control flow

The governed authoring model has no `null`, NaN, `throw`, `try/catch` or `else if`. Failures use types such as `Result<T, E>` and `Option<T>`. Decisions use:

- `if` for a genuine `Bool`;
- `check` for a typed K3 `Verdict`;
- exhaustive `match` for other branching, with an explicit terminal `_ =>` arm where the domain is open;
- `while` for bounded Boolean-guarded iteration in the current authoring profile.

There is no implicit success path. A missing case, effect, permission or piece of evidence must have a closed exit.

### Values, Hallmarks and borders

External values enter as untrusted. Value-state qualifiers track their movement through validation, protection and redaction. Developer-defined Hallmarks add nominal meaning and a mandatory assay gate, preventing an arbitrary string from silently becoming an `Email`, `AccountId` or other governed domain value.

Packages, plugins, applications, native adapters and vault access cross explicit borders. Import is not trust; possession of a host capability is not language authority.

### Valid flow forms

The current v0.1 flow qualifiers are:

```galerina
flow add(a: Int, b: Int) -> Int { ... }

secure flow processPayment(order: Order) -> Result<PaymentReceipt, PaymentError>
effects [network.outbound, secret.read] { ... }

pure flow calculateVat(amount: Money<GBP>) -> Money<GBP> { ... }
```

`safe flow`, `unsafe flow` and `guard flow` are not v0.1 syntax. `safe` and `unsafe` describe values inside a flow body.

## A checker-proven example

This example is copied from the Golden Pack. It demonstrates the required three-way handling of a typed `Verdict`:

```galerina
@version 1

pure flow durabilityEvidence(
  evidenceVerdict: Verdict,
  shapeValid: Bool,
  authorityReleased: Bool
) -> Int {
  check(evidenceVerdict) {
    deny: { return 0 - 1 }
    ambig: { return 0 }
    if: {
      if shapeValid == false { return 0 - 1 }
      if authorityReleased == true { return 0 - 1 }
      return 0
    }
  }
}
```

Verify the exact tracked source:

```powershell
node galerina.mjs check docs/examples/golden/004-k3-check.fungi --strict-types --strict-governance
```

The Golden Pack distinguishes checker proof from executable parity. A checker-clean construct is not automatically evidence that every target executes it.

## Architecture

### Governed compilation and execution

```text
.fungi source
  ↓ scan / lex / parse
  ↓ resolve names and types
  ↓ check value state, effects and governance
  ↓ emit canonical GIR and proof evidence
  ├─ current CLI/bootstrap lane → WAT/WASM → governed compatibility runtime
  └─ bounded independent lane  → physical .slide → re-admission → affine VOK
```

GIR is a governed intermediate representation, not a global interpreter lock. It carries the verified plan between source checking and target execution. Parallelism is permitted only where dependency, authority and effect ordering prove it safe; active shared state, authority transitions and non-commutative effects remain ordered.

### The SLIDE/VOK boundary

Independent SLIDE proves a bounded path from checked Fungi through canonical GIR to a source-free `.slide` package, followed by independent re-admission and VOK execution. VOK is the verified operation kernel at the final execution boundary. It validates the admitted shape, resource and authority evidence rather than trusting a compiler success flag.

Current evidence is intentionally narrow. It does not yet prove:

- every `.fungi` construct or package family;
- general effects, callbacks, initialisers or manual-memory families;
- production authentication or release signing;
- hostile-platform durability across the supported OS matrix;
- terminal TypeScript/MJS and package-dependency retirement.

The active implementation and refusal gates are maintained in the [beta-v1 to SLIDE roadmap](docs/ROADMAP.md).

### WASM and the retired DSS sidecar

WASM remains a real, tested compatibility/bootstrap lane in the live CLI. It is not the intended final production authority model. The former production DSS host sidecar is retired; retained Wasmtime use is optional development evidence, not a production trusted computing base.

### Admission fabric

No binary reaches an admitted substrate merely because it was built. Package identity, signatures, revocation state, closed capabilities, resource evidence and platform evidence are checked at the relevant borders. Lyth-Weaver is the admission-fabric direction for converging re-derivable and re-admittable candidates; it remains laboratory work and carries no production-performance claim.

## Data and secret protection

- No raw pointers or pointer arithmetic are exposed in governed `.fungi` source.
- Values are immutable unless mutation is declared.
- Untrusted input remains unsafe until a named gate proves the required shape.
- PII/PHI and secret taint are tracked across effects and sinks.
- Redaction is required before protected data reaches an audit surface that cannot receive it.
- Vault reads and writes require explicit contract effects and admission permission.
- A missing secret, capability, signature, receipt or evidence field refuses before the protected side effect.
- Audit and proof artifacts are evidence outputs; they do not grant authority merely by existing.

Galerina's zero-trust claim is a design and verification discipline, not a claim that any operating system or deployment is absolutely secure.

## Package architecture

The workspace is organised into explicit package families:

| Family | Role | Boundary |
|---|---|---|
| `galerina-core-*` | Language, compiler, security, runtime and shared contracts | Core trusted surface, kept narrow |
| `galerina-tower-citizen` | K3 verdict algebra, leases, admission and substrate decisions | Core governed decision surface |
| `galerina-framework-*` | App kernel, API adapter, scaffolding and examples | Governed host/application border |
| `galerina-ext-*` | Secrets, native bridges and optional engines | Govern-don't-absorb border |
| `galerina-target-*` | CPU, WASM, GPU, JS, native, AI and photonic target contracts | Capability-gated target adapters |
| `galerina-data-*`, `-db-*`, `-web-*` | Data, database and web governance | Domain packages behind explicit effects |
| `galerina-devtools-*` | Tests, audits, graphs, benchmarks and evidence generation | Host-side non-authorizing tools |

The core governs; optional engines do their work at a verified border. A dependency is not absorbed into the trusted base simply because it is useful.

## Build and run today

Install the workspace command:

```powershell
npm install
npm link
galerina version
```

Check and run a Golden Pack flow:

```powershell
galerina check docs/examples/golden/003-result-match.fungi --strict-types --strict-governance
galerina run docs/examples/golden/003-result-match.fungi --invoke selectModeResult 9 --governed
```

Build through the current compatibility lane:

```powershell
galerina build docs/examples/golden/001-bool-if.fungi
```

The live `build` command emits WAT/WASM and manifest artifacts. That command proves the current compatibility path; it should not be described as the final SLIDE production release path.

Useful checks:

```powershell
npm run audit:fungi-golden
node galerina.mjs border-check
node scripts/status.mjs
node scripts/component-health.mjs --table
```

## Where the project is

The living project route is maintained in the [canonical roadmap](docs/ROADMAP.md). Its [generated visual](build/roadmap/roadmap.svg) is rebuilt from governed graph and assurance receipts; it is evidence, not execution authority.

**full suite 100/100 packages · 9,612 tests · 0 failures.**

| Verification lane | Status | Current evidence |
|---|---|---|
| **Tests** | green | 100/100 · 9,612 · 0 fail |

### Honest current boundary

- The compiler and all canonical self-hosted stage specifications are established.
- Independent SLIDE/VOK executes bounded, admitted source families and mutation-refusal tests.
- Most workspace implementation still includes TypeScript/MJS and host-language dependencies.
- The conversion ledger is reference evidence only until a consumer switches and its old path is retired.
- Production authentication, cross-platform durability, release evidence and the full platform matrix remain owner/external-evidence gates.
- Repository-wide closure is not inferred from focused package or chart checks.

For exact open tasks, use the [roadmap](docs/ROADMAP.md), [root TODO](docs/TODO.md) and live status command rather than copying their changing detail into this file.

## Benchmarks

Benchmark publication follows three rules:

1. compare only admitted, work-equivalent measurements with the same metric class and unit;
2. derive the winner, sign and rank from the recorded measurements;
3. publish “not measured” rather than converting a reference-only lane into production evidence.

### Results readable on GitHub

- [Benchmark report and historical comparison](packages-ts/galerina-devtools-benchmarks/results/benchmark-report-latest.md) — recorded results, measurement boundaries and changes from the retained baseline.
- [Verified native-operation report](packages-ts/galerina-devtools-benchmarks/results/verified-native-operation-latest.md) — the measured reference workload and its limits.

**Production SLIDE remains not measured:** no admitted production SLIDE lane is represented by these reference results.

[![Recorded verified native-operation benchmark — reference evidence, not production results](packages-ts/galerina-devtools-benchmarks/results/verified-native-operation-latest.svg)](packages-ts/galerina-devtools-benchmarks/results/verified-native-operation-latest.svg)

<details>
<summary>Interactive HTML charts — download or open from a local checkout</summary>

GitHub displays HTML source rather than running these charts. Download the repository or use a local checkout, then open the files below in a browser. Links here locate the files; they are not hosted chart previews.

- [Production SLIDE-zero chart — HTML file](packages-ts/galerina-devtools-benchmarks/results/benchmark-slide-zero-latest.html)
- [Production SLIDE-zero table — HTML file](packages-ts/galerina-devtools-benchmarks/results/benchmark-slide-zero-table-latest.html)
- [SLIDE reference and historical WASM comparison — HTML file](packages-ts/galerina-devtools-benchmarks/results/benchmark-slide-vs-wasm-history-latest.html)

</details>

On the exact one-million-element reference workload, Rust AVX2 wins and the
Galerina/SLIDE reference is fourth of six, ahead of Go and Python. This is
bounded reference evidence only: it does not release authority or fill the
unmeasured production SLIDE lane. The current full run contains 30 benchmark
groups and 18 comparable groups, but production SLIDE coverage is **0/18**;
one separately labelled SLIDE reference group is measured. The benchmark truth audit excludes diagnostic
interpreters from production rankings and refuses ratios for mismatched work or
units.

## Diagrams

Select any image to open the full-size SVG. These existing diagrams include implemented architecture, design proposals and historical comparisons; use the [current roadmap](docs/ROADMAP.md) for implementation status.

### Architecture and application examples

| Diagram | Diagram |
|---|---|
| **Full stack**<br>[![Full stack](docs/diagrams/galerina-full-stack.svg)](docs/diagrams/galerina-full-stack.svg) | **Governance pipeline**<br>[![Governance pipeline](docs/diagrams/galerina-mechanics.svg)](docs/diagrams/galerina-mechanics.svg) |
| **Compiler**<br>[![Compiler](docs/diagrams/galerina-compiler.svg)](docs/diagrams/galerina-compiler.svg) | **Compiler direction**<br>[![Compiler direction](docs/diagrams/galerina-compiler-pipeline-foresight.svg)](docs/diagrams/galerina-compiler-pipeline-foresight.svg) |
| **Runtime**<br>[![Runtime](docs/diagrams/galerina-runtime.svg)](docs/diagrams/galerina-runtime.svg) | **Application framework**<br>[![Application framework](docs/diagrams/galerina-framework.svg)](docs/diagrams/galerina-framework.svg) |
| **Tower containment model**<br>[![Tower containment model](docs/diagrams/galerina-tower-citizen.svg)](docs/diagrams/galerina-tower-citizen.svg) | **Tri-Pipe routing**<br>[![Tri-Pipe routing](docs/diagrams/galerina-tri-pipe.svg)](docs/diagrams/galerina-tri-pipe.svg) |
| **Untrusted compute lane**<br>[![Untrusted compute lane](docs/diagrams/galerina-untrusted-governed-lane.svg)](docs/diagrams/galerina-untrusted-governed-lane.svg) | **Governance and native boundaries**<br>[![Governance and native boundaries](docs/diagrams/galerina-govern-dont-absorb.svg)](docs/diagrams/galerina-govern-dont-absorb.svg) |
| **K3 verdicts**<br>[![K3 verdicts](docs/diagrams/galerina-k3-verdict-lattice.svg)](docs/diagrams/galerina-k3-verdict-lattice.svg) | **Value-state lifecycle**<br>[![Value-state lifecycle](docs/diagrams/galerina-trust-state-lifecycle.svg)](docs/diagrams/galerina-trust-state-lifecycle.svg) |
| **Governed data queries**<br>[![Governed data queries](docs/diagrams/galerina-governed-data-query-lane.svg)](docs/diagrams/galerina-governed-data-query-lane.svg) | **TritMesh query design**<br>[![TritMesh query design](docs/diagrams/galerina-tritmesh-query-lane.svg)](docs/diagrams/galerina-tritmesh-query-lane.svg) |
| **TritMesh cache design**<br>[![TritMesh cache design](docs/diagrams/galerina-tritmesh-cache-passport-vs-legacy.svg)](docs/diagrams/galerina-tritmesh-cache-passport-vs-legacy.svg) | **Data protection comparison**<br>[![Data protection comparison](docs/diagrams/galerina-ungoverned-vs-governed-breach.svg)](docs/diagrams/galerina-ungoverned-vs-governed-breach.svg) |
| **Healthcare example**<br>[![Healthcare example](docs/diagrams/galerina-healthcare-getpatient-flow.svg)](docs/diagrams/galerina-healthcare-getpatient-flow.svg) | **Payments example**<br>[![Payments example](docs/diagrams/galerina-payments-money-lane.svg)](docs/diagrams/galerina-payments-money-lane.svg) |
| **Privacy-cut design**<br>[![Privacy-cut design](docs/diagrams/galerina-privacy-cut-authoring.svg)](docs/diagrams/galerina-privacy-cut-authoring.svg) |  |

### Recorded comparisons and research profiles

These charts retain their original values and scope. They are not fresh benchmark results or current completion scores.

| Diagram | Diagram |
|---|---|
| **Security and governance**<br>[![Security and governance](docs/diagrams/radar-1-security-governance.svg)](docs/diagrams/radar-1-security-governance.svg) | **Performance and systems**<br>[![Performance and systems](docs/diagrams/radar-2-performance-systems.svg)](docs/diagrams/radar-2-performance-systems.svg) |
| **Developer experience**<br>[![Developer experience](docs/diagrams/radar-3-devx-ecosystem.svg)](docs/diagrams/radar-3-devx-ecosystem.svg) | **Governed chaos**<br>[![Governed chaos](docs/diagrams/radar-4-governed-chaos.svg)](docs/diagrams/radar-4-governed-chaos.svg) |
| **Build and developer support**<br>[![Build and developer support](docs/diagrams/radar-5-cicd-devsupport.svg)](docs/diagrams/radar-5-cicd-devsupport.svg) | **Ternary model**<br>[![Ternary model](docs/diagrams/radar-6-tri-ternary.svg)](docs/diagrams/radar-6-tri-ternary.svg) |
| **Web and API security**<br>[![Web and API security](docs/diagrams/radar-7-web-api-secure.svg)](docs/diagrams/radar-7-web-api-secure.svg) | **Database direction**<br>[![Database direction](docs/diagrams/radar-8-databasing.svg)](docs/diagrams/radar-8-databasing.svg) |
| **Data-science direction**<br>[![Data-science direction](docs/diagrams/radar-9-data-science.svg)](docs/diagrams/radar-9-data-science.svg) | **AI and machine learning**<br>[![AI and machine learning](docs/diagrams/radar-10-AI-ML-NuroNet.svg)](docs/diagrams/radar-10-AI-ML-NuroNet.svg) |
| **Language and type system**<br>[![Language and type system](docs/diagrams/radar-11-language-type-system.svg)](docs/diagrams/radar-11-language-type-system.svg) | **Native VOK benchmark — 2 August 2026**<br>[![Native VOK benchmark — 2 August 2026](docs/diagrams/native-vok-authority-benchmark-2026-08-02.svg)](docs/diagrams/native-vok-authority-benchmark-2026-08-02.svg) |

[Browse all diagram files and descriptions](docs/diagrams/README.md).

### Visual roadmap

[![Galerina implementation and evidence roadmap](build/roadmap/roadmap.svg)](build/roadmap/roadmap.svg)

[Open the full-size roadmap on GitHub main](https://github.com/TritHypha/Galerina/blob/main/build/roadmap/roadmap.svg) · [Read the roadmap ledger](docs/ROADMAP.md)

## Graphs and developer tools

Use generated indexes rather than crawling the repository:

| Need | Index or command |
|---|---|
| Architecture and package graph | [`build/graph/Galerina_GRAPH_REPORT.md`](build/graph/Galerina_GRAPH_REPORT.md) |
| Diagnostic definition, emit, test and docs sites | [`build/code-index/CODE_INDEX.md`](build/code-index/CODE_INDEX.md) |
| Available repository tools | [`build/dev-tool-index/INDEX.md`](build/dev-tool-index/INDEX.md) |
| Minimal current `.fungi` constructs | [`docs/examples/golden/README.md`](docs/examples/golden/README.md) |
| Component and conversion status | `node scripts/component-health.mjs --table` |
| Current milestone and blockers | `node scripts/status.mjs` |

Generated artifacts are bounded evidence. Their freshness and build point must be checked before they are used as authority.

## Key documents

| Document | Purpose |
|---|---|
| [SETUP.md](SETUP.md) | Installation and first use |
| [AGENTS.md](AGENTS.md) | Repository rules and authoritative source map |
| [Beta-v1 to SLIDE roadmap](docs/ROADMAP.md) | Active implementation and evidence gates |
| [Executable Fungi Golden Pack](docs/examples/golden/README.md) | Smallest strict-checker-proven construct lookup |
| [`docs/language/fungi/`](docs/language/fungi/README.md) | Fungi language documentation |
| [`docs/contracts/`](docs/contracts/) | Contract and permission documentation |
| [`docs/security/`](docs/security/) | Security designs, checks and runbooks |
| [`docs/framework/`](docs/framework/) | App-kernel and framework boundaries |
| [`docs/diagrams/`](docs/diagrams/) | Architecture and concept diagrams |

## Licence

Galerina is licensed under the [Apache License 2.0](LICENSE). See [NOTICE.md](packages-ts/galerina-core/NOTICE.md) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for attribution and dependency notices.
