//! dss-host — the native Wasmtime sidecar TCB for Galerina's DSS.wasm (`#102`-`#106`).
//!
//! Zero-trust by construction. This is **Milestone 0**: the toolchain + the fail-closed fuel
//! discipline (U3), proven before any DSS supervisor module is ever loaded. Nothing here trusts a
//! default — fuel is granted ONLY explicitly, a 0-fuel Store MUST trap, and that is asserted, not
//! assumed. A pass here means the embedder enforces the DoS bound the whole DRCM design rests on.
//!
//! Requirements this embedder must uphold (galerina-deterministic-runtime-containment.md +
//! bridges #0039/#0040), wired in as later milestones — recorded here so they are not forgotten:
//!   - F2  hybrid ML-DSA-65 + Ed25519 attestation verification at THIS border (post-quantum floor;
//!         owner-ruled 2026-07-22). The production TCB must not be classical-only.
//!   - F3  re-verify attestation per module Rust-side (hash + signature over the #173 domain
//!         preimage). Never "Node already checked" — materialise-once is the escape (DP-RD-0247).
//!   - F4  zero-on-reset linear memory + V_DPM re-init per task (pooling allocator; don't assume it).
//!   - F7  audit-before-effect durability ordering (an effect releases only after its audit is durable).
//!   - U3  `Config::consume_fuel(true)`; a Store starts at 0 fuel and traps; `set_fuel` is the ONLY grant.
//!
//! Milestone 1 (next): load the DSS supervisor `.wasm` and re-run the ~400-point V_DPM differential
//! through real wasmtime — proving engine-transfer (Node `WebAssembly` verdict === wasmtime verdict)
//! and closing U10's end-to-end collapse-conformance gap in one stroke.

use anyhow::{bail, Result};
use wasmtime::{Config, Engine, Instance, Module, Store};

/// A tiny fuel-consuming module: spin a loop `n` times. Fuel is consumed per instruction, so a large
/// `n` under a small budget must trap — exactly the per-`step` DoS bound the DSS supervisor relies on.
const SPIN_WAT: &str = r#"
(module
  (func (export "spin") (param $n i32) (result i32)
    (local $i i32)
    (block $done
      (loop $l
        (br_if $done (i32.ge_s (local.get $i) (local.get $n)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $l)))
    (local.get $i)))
"#;

/// The engine config for every DSS.wasm instantiation. Fuel metering is ON at the engine level;
/// without it `set_fuel`/`get_fuel` error, so this is the first fail-closed choice.
fn zero_trust_engine() -> Result<Engine> {
    let mut config = Config::new();
    config.consume_fuel(true); // U3
    Ok(Engine::new(&config)?)
}

fn main() -> Result<()> {
    let engine = zero_trust_engine()?;
    let module = Module::new(&engine, SPIN_WAT)?;

    // (1) FAIL-CLOSED DEFAULT (U3). A Store is born with 0 fuel. Any wasm execution must trap
    //     immediately. If it does NOT trap, fuel is not enforced — that is a security failure, not a pass.
    {
        let mut store = Store::new(&engine, ());
        // deliberately NO set_fuel → 0 fuel.
        let inst = Instance::new(&mut store, &module, &[])?;
        let spin = inst.get_typed_func::<i32, i32>(&mut store, "spin")?;
        match spin.call(&mut store, 1_000_000) {
            Err(_) => println!("[U3] 0-fuel Store traps immediately (fail-closed default) OK"),
            Ok(v) => bail!("SECURITY: 0-fuel Store returned {v} instead of trapping — fuel not enforced"),
        }
    }

    // (2) EXPLICIT GRANT ONLY. Fuel is set to an exact budget; a bounded run completes and reports
    //     remaining fuel. This is the `policy::calculateStepFuelLimit -> set_fuel` path — never ambient.
    {
        let mut store = Store::new(&engine, ());
        store.set_fuel(10_000_000)?;
        let inst = Instance::new(&mut store, &module, &[])?;
        let spin = inst.get_typed_func::<i32, i32>(&mut store, "spin")?;
        let out = spin.call(&mut store, 1_000)?;
        let left = store.get_fuel()?;
        println!("[fuel] granted 10_000_000, spin(1000)={out}, fuel left {left} OK");
    }

    // (3) BUDGET EXHAUSTION TRAPS. A run needing more fuel than granted must trap — the DoS bound.
    {
        let mut store = Store::new(&engine, ());
        store.set_fuel(1_000)?; // small budget
        let inst = Instance::new(&mut store, &module, &[])?;
        let spin = inst.get_typed_func::<i32, i32>(&mut store, "spin")?;
        match spin.call(&mut store, 100_000_000) {
            Err(_) => println!("[fuel] over-budget run traps (FuelExhaustionFault) OK"),
            Ok(v) => bail!("SECURITY: over-budget run returned {v} instead of trapping"),
        }
    }

    println!("dss-host Milestone 0: fuel discipline proven (U3 fail-closed) — wasmtime embedder ready.");
    Ok(())
}
