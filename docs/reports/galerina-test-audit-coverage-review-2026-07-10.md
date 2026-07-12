# Galerina — Dev + Production Test/Audit Coverage Review (all components + runtime)

**Date:** 2026-07-10 · **Scope:** every package in `galerina.workspace.json` (92) + the audit suite + CI + the
local cadence. **Method:** 4 read-only reviewers, each reading ≥1 test per package, the `audit-*.mjs` scope
headers, `run-all-tests.cjs`, `run-phase-close.mjs`, and both `.github/workflows/*.yml`; cross-checked against
`version.json testCountByPackage` and `build/dev-tool-index/INDEX.md`. This is an **adequacy/gap** assessment —
the suite is green (92/92 · 6,832 · 0 fail), so "green" is assumed and the question asked is *"is that green
trustworthy for dev AND production, per component?"*

---

## Bottom line (what to tell the owner)

**Dev-time testing is genuinely strong and honest.** Across all 92 packages there is **not one placeholder /
false-green test file** — every test imports the built `dist/` and exercises real behaviour, and the
security-critical packages actively defend against vacuous green (anti-vacuity gates, K3 truth-tables, fuzz,
soundness sweeps). The compiler the owner worried about is **over-tested**, not under- (4,413 tests / 270 files).

**The real, systemic gaps are two, and both are about *enforcement/production*, not dev correctness:**

1. **The fail-closed *acceptance* discipline (RD-0100) exists for the `web-*` family ONLY.** `web-*` ships a
   dedicated `*.failclosed.test.mjs` per package + a machine-readable `governance/web-failclosed-contract.json`
   + a CI-enforcing `audit-web-stub-guard.mjs`. **No other family has an equivalent** — and the families that
   most need it are the untrusted-input sinks: `data-*` (HTML sanitiser, SQL templates, JSON parser, PII/secret
   egress), `db-*` (SQL/NoSQL injection + credential/TLS), and the security core (`auth`, `core-security`,
   `core-network`, `ext-secrets-*`, `ext-spore`, `ext-tritsocket`, the 6 sentinels). They **do** assert
   deny-by-default — but *inline as ordinary contract tests*, with no governance contract and no guard forcing
   those assertions to exist or keep firing after a refactor.

2. **The 6,832-test product suite runs on NO CI.** `conventions.yml` wires ~22 *source/audit* gates (real, and
   mostly `--self-test`-then-enforce), but it explicitly defers the test suite ("Full test-suite CI is a
   separate task"). The `92/92 · 6,832 · 0` headline is produced **only** by a developer running
   `run-all-tests.cjs`. A regression in an auth/kernel/sentinel deny-path would **not** turn CI red.

Everything below is detail and remediation for those two, plus a handful of small concrete fixes.

---

## Stale priors corrected (believe these, not the old notes)

| Prior (stale) | Reality (2026-07-10) |
|---|---|
| `version.json` securityNote "**NO CI exists (#149)**" | **FALSE — CI exists.** `.github/workflows/conventions.yml` (~22 audits, most `--self-test`→enforce, all blocking) + `secret-scan.yml`. **Fix version.json.** |
| "the compiler may be under-tested" | **Inverted.** 4,413 tests / 270 files, full pipeline. The crown jewel is the *best*-tested package. |
| "generators (graph/provenance/pci) are thin" | **Inverted.** package-graph / project-graph / provenance / pci are the *strongest* dev tools — on-disk fixtures + `deepEqual` + fail-closed/INDETERMINATE suites. |
| SOT package count | `version.json` = 92, `INDEX.md` = 94 (93 test-bearing). Definitional (`galerina-registry` + `galerina-devtools-benchmarks` = 0 tests), but the two disagree — reconcile. |

---

## Prioritized gap list (worst first)

### Systemic
- **S1 — No fail-closed acceptance layer outside `web-*`.** Highest-value single investment. Recommend two new
  contracts + guards mirroring RD-0100: `governance/data-failclosed-contract.json` + `audit-data-stub-guard.mjs`,
  and `governance/db-failclosed-contract.json` + `audit-db-stub-guard.mjs`; and a
  `governance/security-failclosed-contract.json` + `audit-security-failclosed-guard.mjs` enumerating
  {auth, core-security, tower-citizen, framework-app-kernel, framework-api-server, ext-secrets-*, ext-spore,
  ext-tritsocket, core-network, core-sentinel-*}. Promote the already-written inline deny-by-default cases into
  dedicated `*.failclosed.test.mjs` suites. **Start with `galerina-data-html`** — `web-failclosed-contract.json`'s
  `reuseMandate` makes the entire web XSS story downstream of that one sanitiser gate, which is itself unguarded.
- **S2 — Product test suite absent from CI.** The `6,832 · 0` number is a local artifact. Recommend running at
  least `run-all-tests.cjs --core` (and ideally the compiler suite) in CI. Owner-gated (CI policy + runtime cost).
- **S3 — Source-vs-dist drift.** `run-all-tests.cjs` skips `build` when `dist/` exists, and 12+ package `test`
  scripts are `node --test` against a prebuilt `dist/` with no build step → green can reflect **stale dist**.
  Nothing forces a clean rebuild. Recommend a CI job that builds clean then tests.

### Package/tooling (small, mostly safe, several are quick wins)
- **P1 — `galerina-ext-proof-snarkjs`** — only package OFF the house chain: `test` = `node --test` with **no
  typecheck, no build**, and `dist/` gitignored → non-hermetic (fails on clean checkout / passes against stale
  dist). Crypto-adjacent. **Fix: restore `typecheck && build && node --test`.** *(quick win)*
- **P2 — `galerina-ext-secrets-vault` + `galerina-core-economics`** — `test` scripts omit the build step →
  stale-dist risk. **Fix: add `tsc` to the chain.** *(quick win)*
- **P3 — `audit-syntax` (+ `audit-stray-docs`, `audit-selfhost-readiness`)** — no `--self-test`, not in CI, not
  externally tested → can be silently neutered with nothing noticing. `audit-syntax` is load-bearing. **Fix: add
  a `--self-test` and wire it.**
- **P4 — CI advertises but doesn't run two self-tests** — `audit-package-border` + `audit-runtime-coverage` step
  names say "(self-test, then enforcing)" but the `run:` omits the `--self-test` line. Enforcement is real; the
  anti-neuter guarantee isn't executed. **Fix: add the `--self-test` invocation.** *(quick win, CI file)*
- **P5 — `galerina-devtools-benchmarks`** — a dev tool with a `test` script but **0 tests** (INDEX.md already
  flags it). One of the two `galerina.workspace.json` "orphans" already slated for the annotated-ceiling allowlist.
- **P6 — thin `target-wasm` (4) / `cpu-kernels` (3)** — names imply backend output-correctness, tests validate
  only metadata/plan shape. Real WASM/kernel output-correctness lives in `core-compiler` + the two real engines
  (`ext-photonic-emulator`, `ext-bridge-cpp`). **Not a bug — a *labelling* gap**: nothing says these are planning
  contracts, so the thin counts *look* like backend coverage. Add a one-line scope note per package.
- **P7 — `galerina-auth` (35)** — highest single-package *security* exposure: the identity/authz K3 provider has
  strong dev fail-closed tests but **no conformance pin, no mutation entry, no CI test-run**. First candidate for
  a by-construction pin + the S1 security acceptance gate.

---

## What is already strong (do NOT rebuild)

- **`web-*` (6 packages)** — the reference standard; leave alone.
- **`galerina-tower-citizen` (338)**, **`framework-app-kernel` (104)**, **`ext-spore` (61)**,
  **`ext-secrets-spore` (21)** — have CI-enforcing RD-0296 by-construction conformance pins on their load-bearing
  constructions (algorithm-pinning, revocation, AEAD nonce/suite/key-commitment, secret zeroization), so a
  *refactor* that removes the construction goes red in CI even though the tests don't run there.
- **`ext-bridge-cpp` (21)** — the model to copy for the engines: real numerics **+** governance deny **+** a
  security mutant **+** in the auto cadence.
- **The compiler + the graph/index generators** — exemplary; the owner's under-testing fear is refuted here.

---

## Honest residual caveats (disclosed, not hidden)

- `ext-spore` `.spore` is **unsigned-v0** (integrity ≠ origin) — a tracked OPEN-RISK in the conformance scan, not
  a test gap.
- The 6 sentinels are DEV-ONLY **and** default-off shelfware until a host opts in — production assurance is
  effectively zero *by design* today; worth an explicit owner decision, not a silent gap.
- `audit-graph-integrity` validates a **gitignored ~3 MB** artifact only if present; CI runs only its build-free
  `--self-test`, never a real emitted graph.

---

## Recommended sequencing (strongest-ZT first, cheapest-safe first)

1. **Quick wins (mechanical, safe, land now):** P1 (snarkjs house chain), P2 (vault/economics build step),
   P4 (CI `--self-test` invocation), and fix the `version.json` "NO CI" stale claim.
2. **P3 `audit-syntax --self-test`** (close the silently-neuterable-audit hole).
3. **S1 fail-closed acceptance, incrementally:** `data-html` first → SQL adapters → `data-query` → `data-response`
   → the security core (`auth` first). Each = a `governance/*-failclosed-contract.json` + `audit-*-stub-guard.mjs`
   + promoting the existing inline deny cases into a `*.failclosed.test.mjs`.
4. **Owner-gated:** S2 (product suite in CI + cost), the sentinel production-path decision, S3 clean-rebuild CI.

*Report generated for the owner's 2026-07-10 "review each component for dev + production testing capability"
request. Reviewer evidence retained in-session; no files were modified during the review itself.*
