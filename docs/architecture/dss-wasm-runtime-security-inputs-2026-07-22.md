# DSS.wasm — runtime-security design inputs (Wasmtime practices)

**Date:** 2026-07-22
**Status:** Design input for the `#102–106` DSS.wasm TCB (post-v1, owner-gated behind the R4 flip `#143`)
**Source:** R&D research transcript RT-28 — *"Security and Correctness in Wasmtime"* (Bytecode Alliance)
**Companion:** [dss-wasm-readiness-2026-07-22.md](dss-wasm-readiness-2026-07-22.md)

---

## Why this is a design input, not current work

The Wasmtime security/correctness practices are almost entirely about **isolation** — sandbox
integrity, temporal isolation, Spectre. Galerina's DSS.wasm work to date proves **fidelity**, not
isolation: `dss-supervisor-wasm-differential.test.mjs` states its own scope exactly —

> *"This proves the decision core is EXECUTABLE and FAITHFUL — a feasibility+fidelity gate, **not an
> isolation claim**."*

Isolation is explicitly deferred to the real Wasmtime TCB (`#102–106`), which is design-spec-complete
but **not built**, `post-v1`, and downstream of the owner-gated R4 authority flip (`#143`). So these
practices land on the `#102` embedder spec, not on any shipped code today.

## What Galerina already embodies (in another form)

| Wasmtime practice | Galerina analogue | State |
|---|---|---|
| Differential fuzzing vs a reference/second engine | RD-0361 differential twins: WASM verdict ≡ Stage-A interpreter over the corpus (and the DSS supervisor over ~400 V_DPM points) | shipped, point-sampled |
| "Misuse-nearly-impossible" safe embedder API | `admitAndInstantiate` — attestation-first, closed host-import set, `LinkError`→CRITICAL fail-closed | shipped |
| Truth-table oracles for host functions | `wat-host-stdlib-oracle` + `wat-host-stdlib-stubs-oracle` (`#185`) | shipped |
| cargo-vet dependency review | SBOM + license-audit rule (RD-0355) | shipped |
| Published disclosure policy | `SECURITY.md` security contact | shipped |

## What RT-28 adds — requirements to fold into the `#102` spec

1. **Disposable instance / temporal isolation.** The embedder must create a **fresh WASM instance per
   governed task** (fresh linear memory, fresh V_DPM register), so a trap or bug in one request cannot
   persist into the next. This matches the runtime's existing per-scenario-fresh-host model
   (`createHostRuntime`: *"a fresh host per scenario resets it"*) — the `#102` embedder should raise it
   from a test convenience to the production instance lifecycle.

2. **Explicit Spectre mitigations + guard pages.** These are engine-level, not Galerina logic, but the
   `#102` embedder config must **explicitly enable** Wasmtime's bounds-check masking, virtual-memory
   guard pages, and `call_indirect` / `br_table` speculation guards (BTI/CFI where the target supports
   it) rather than rely on defaults. Record the enabled set in the attestation profile.

3. **Continuous, generative differential fuzzing.** Extend the point-sampled differential (fixed V_DPM
   matrix) toward a **randomized generator + oracle** loop (the fuzz-leg direction, `#29`), with the
   Stage-A interpreter as the differential oracle. Require a **known-good seed accepted as a control**
   so the harness cannot pass by rejecting everything (the RT-28 "generator+oracle" discipline; see also
   R&D note `0033`, finding 2).

4. **Vulnerability-response runbook + backport policy.** `SECURITY.md` gives the intake; RT-28 adds a
   written response runbook and a fixed backport window. A doc to author when `#102` ships.

5. **Embedder-dependency vetting.** If `#102` binds a real Wasmtime embedder (a Rust/native dependency),
   that dependency itself enters the SBOM/vet scope — the cargo-vet lesson applied to our own supply chain.

## Verified embedder-config pins (2026-07-22)

Verified at source against the Wasmtime `Store` docs (docs.rs) and the wasmex CHANGELOG — the pins the `#102`
embedder must adopt, extending the attestation-profile config set (requirement 2). This corrects **DRCM
Decision 4 / addendum U3**:

- **Fuel API.** `wasmtime::Store::add_fuel` **no longer exists**. The current API is `Store::set_fuel(u64)` /
  `Store::get_fuel() -> u64`, enabled via `Config::consume_fuel(true)`. **A Store starts with 0 fuel and traps
  immediately** unless `set_fuel` is called — a fail-closed default to adopt *explicitly*: a DWI isolate
  receives fuel ONLY via `policy::calculateStepFuelLimit → set_fuel`, never a permissive/ambient grant.
  Component-model guest→host calls meter via `set_hostcall_fuel`. The rewrite landed upstream mid-2024 (tracked
  in wasmex `v0.9.0`, 2024-07-25). ⚠ **Re-pin the exact API against the chosen Wasmtime version at `#102` build
  time** — which version, and whether the embedder is Rust-native, a Node binding, or the `wasmtime` CLI, is the
  open embedder-dependency decision (requirement 5) that gates the build.

## Not actionable now

Every item above is gated behind Phase 4 (R4 flip `#143`, owner-gated) → Phase 5 (`#102–106` build,
`post-v1`). Nothing here changes shipped code; it is captured so the `#102` embedder is built to this bar
rather than retrofitted to it.

---

*No absolute local paths. No keys.*
