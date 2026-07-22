# dss-host — the native Wasmtime sidecar TCB for Galerina's DSS.wasm

**Status:** under construction (Milestone 0). **Not yet on any production path.**

This is the native binary that DRCM Decision 1 calls the **TCB**: a small, audited Rust host that
embeds Wasmtime, boots `DSS.wasm` (Galerina's supervisor), and supervises per-`step` DWI guest
isolates. It exists because the security properties the whole design rests on — fuel-bounded
execution, guard-page isolation, disposable per-task Stores, per-module attestation re-verification —
are **native Wasmtime properties that a JavaScript engine cannot provide** (V8 has no fuel metering;
the jco/component-in-JS route forfeits exactly these guarantees). Verified 2026-07-22: Wasmtime has no
maintained Node binding, so the sidecar is the only sound path.

## Zero-trust posture (owner charter 2026-07-22)

Every default is chosen fail-closed; nothing is trusted because "someone upstream checked it."

- **Pinned dependencies.** `Cargo.lock` is committed — the exact 166-crate tree is the pin. wasmtime
  `=47.0.2`. Widen a version only deliberately.
- **Supply-chain gate.** `deny.toml` (cargo-deny) is the day-one vet: deny advisories/yanked,
  permissive-license allow-list, deny wildcard versions + unknown registries/git.
- **No legacy carried in.** Fresh crate, current APIs only (the U3 fuel-API rewrite is already
  reflected: `set_fuel`/`get_fuel` + `Config::consume_fuel`, never the removed `add_fuel`).

## Milestones

| # | What | State |
|---|---|---|
| **0** | Fuel discipline (U3): a Store starts at 0 fuel and **must trap**; fuel granted only via `set_fuel`; over-budget traps. Asserted, not assumed. | in progress (`src/main.rs`) |
| **1** | Load the DSS supervisor `.wasm` and re-run the ~400-point V_DPM differential **through real wasmtime** — engine-transfer proof (Node `WebAssembly` verdict === wasmtime verdict), closing U10's end-to-end collapse-conformance gap. | next |
| 2 | Per-module attestation re-verification (**F3**) with the **hybrid ML-DSA-65 + Ed25519** floor (**F2**, owner-ruled) over the `#173` domain preimage. | queued |
| 3 | Pooling allocator with **zero-on-reset** linear memory + V_DPM re-init per task (**F4**); the disposable-instance paradigm. | queued |
| 4 | Audit-before-effect durability ordering (**F7**); DWI `step` broker → V_DPM bitmask gate; emergency-overlay signal routing. | queued |

## Build / run / vet

```bash
cargo build                 # compiles the sidecar (first build pulls + compiles wasmtime)
cargo run                   # runs the Milestone-0 fuel-discipline proof
cargo deny check            # supply-chain gate (install: cargo install --locked cargo-deny)
```

## Provenance

Design of record: `../../../ZTF-Knowledge-Bases/galerina-deterministic-runtime-containment.md` (DRCM
locked Decisions + addendum U1–U10). Security review + F1–F7: R&D bridge `#0040`. Embedder-config
pins (fuel API, Spectre/guard-pages): `../../docs/architecture/dss-wasm-runtime-security-inputs-2026-07-22.md`.
